const express = require('express');
const { prisma } = require('../prisma');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Helper function to analyze membership patterns
function analyzeMembershipPattern(periods) {
  if (!periods || periods.length === 0) {
    return {
      totalPeriods: 0,
      totalDays: 0,
      totalSpent: 0,
      averageDuration: 0,
      gaps: [],
      loyaltyScore: 0,
      membershipType: 'new'
    };
  }

  // Sort periods by start date
  const sortedPeriods = periods.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  
  // Calculate total days and spending
  let totalDays = 0;
  let totalSpent = 0;
  
  sortedPeriods.forEach(period => {
    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    totalDays += days;
    
    if (period.transaction) {
      totalSpent += period.transaction.amount;
    }
  });

  // Calculate gaps between periods
  const gaps = [];
  for (let i = 1; i < sortedPeriods.length; i++) {
    const prevEnd = new Date(sortedPeriods[i - 1].endDate);
    const currentStart = new Date(sortedPeriods[i].startDate);
    const gapDays = Math.ceil((currentStart - prevEnd) / (1000 * 60 * 60 * 24));
    
    if (gapDays > 0) {
      gaps.push({
        afterPeriod: i - 1,
        beforePeriod: i,
        days: gapDays,
        startDate: prevEnd,
        endDate: currentStart
      });
    }
  }

  // Calculate loyalty metrics
  const totalPeriods = periods.length;
  const averageDuration = totalPeriods > 0 ? totalDays / totalPeriods : 0;
  const totalGapDays = gaps.reduce((sum, gap) => sum + gap.days, 0);
  
  // Loyalty score calculation (0-100)
  let loyaltyScore = 0;
  if (totalPeriods >= 3) loyaltyScore += 30; // Repeat customer
  if (totalGapDays < 30) loyaltyScore += 25; // Short gaps
  if (averageDuration > 30) loyaltyScore += 25; // Long memberships
  if (totalSpent > 1000000) loyaltyScore += 20; // High value customer

  // Membership type classification
  let membershipType = 'new';
  if (totalPeriods >= 5) membershipType = 'loyal';
  else if (totalPeriods >= 3) membershipType = 'returning';
  else if (totalPeriods === 2) membershipType = 'second_time';

  return {
    totalPeriods,
    totalDays,
    totalSpent,
    averageDuration: Math.round(averageDuration),
    gaps,
    loyaltyScore: Math.min(100, loyaltyScore),
    membershipType,
    averageGapDays: gaps.length > 0 ? Math.round(totalGapDays / gaps.length) : 0
  };
}

// Monthly report
router.get('/monthly', async (req, res) => {
  try {
    const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Total revenue for the month
    const monthlyRevenue = await prisma.transaction.aggregate({
      where: {
        transactionDate: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: { amount: true },
      _count: { id: true }
    });

    // Revenue by package type
    const revenueByPackage = await prisma.transaction.groupBy({
      by: ['packageName', 'packageDuration'],
      where: {
        transactionDate: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } }
    });

    // Revenue by payment method
    const revenueByPaymentMethod = await prisma.transaction.groupBy({
      by: ['paymentMethodId'],
      where: {
        transactionDate: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } }
    });

    // Get payment method names
    const paymentMethodsData = await Promise.all(
      revenueByPaymentMethod.map(async (item) => {
        const paymentMethod = await prisma.paymentMethod.findUnique({
          where: { id: item.paymentMethodId }
        });
        return {
          ...item,
          paymentMethodName: paymentMethod?.name || 'Unknown'
        };
      })
    );

    // New members this month
    const newMembersCount = await prisma.member.count({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    res.json({
      period: `${year}-${month.toString().padStart(2, '0')}`,
      totalRevenue: monthlyRevenue._sum.amount || 0,
      totalTransactions: monthlyRevenue._count.id || 0,
      newMembers: newMembersCount,
      revenueByPackage: revenueByPackage.map(item => ({
        packageName: item.packageName,
        duration: item.packageDuration,
        revenue: item._sum.amount || 0,
        count: item._count.id || 0
      })),
      revenueByPaymentMethod: paymentMethodsData.map(item => ({
        paymentMethod: item.paymentMethodName,
        revenue: item._sum.amount || 0,
        count: item._count.id || 0
      }))
    });
  } catch (error) {
    console.error('Monthly report error:', error);
    res.status(500).json({ error: 'Failed to generate monthly report' });
  }
});

// Revenue report
router.get('/revenue', async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      period = 'daily' // daily, weekly, monthly
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Revenue data based on period
    let groupBy = {};
    if (period === 'daily') {
      groupBy = {
        by: ['transactionDate'],
        where: {
          transactionDate: {
            gte: start,
            lte: end
          }
        },
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { transactionDate: 'asc' }
      };
    }

    const revenueData = await prisma.transaction.groupBy(groupBy);

    // Total for the period
    const totalRevenue = await prisma.transaction.aggregate({
      where: {
        transactionDate: {
          gte: start,
          lte: end
        }
      },
      _sum: { amount: true },
      _count: { id: true }
    });

    res.json({
      period: { startDate, endDate },
      totalRevenue: totalRevenue._sum.amount || 0,
      totalTransactions: totalRevenue._count.id || 0,
      revenueData: revenueData.map(item => ({
        date: item.transactionDate,
        revenue: item._sum.amount || 0,
        count: item._count.id || 0
      }))
    });
  } catch (error) {
    console.error('Revenue report error:', error);
    res.status(500).json({ error: 'Failed to generate revenue report' });
  }
});

// Package performance report
router.get('/packages', async (req, res) => {
  try {
    const { 
      startDate, 
      endDate,
      limit = 10
    } = req.query;

    let whereClause = {};
    if (startDate && endDate) {
      whereClause.transactionDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    // Package performance
    const packagePerformance = await prisma.transaction.groupBy({
      by: ['packageId', 'packageName', 'packageDuration'],
      where: whereClause,
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: parseInt(limit)
    });

    // Get package details
    const packageData = await Promise.all(
      packagePerformance.map(async (item) => {
        const packageInfo = await prisma.membershipPackage.findUnique({
          where: { id: item.packageId }
        });
        return {
          packageId: item.packageId,
          packageName: item.packageName,
          duration: item.packageDuration,
          currentPrice: packageInfo?.price || 0,
          totalRevenue: item._sum.amount || 0,
          totalSold: item._count.id || 0,
          averagePrice: (item._count.id || 0) > 0 ? (item._sum.amount || 0) / (item._count.id || 0) : 0
        };
      })
    );

    res.json({
      period: startDate && endDate ? { startDate, endDate } : 'all-time',
      packages: packageData
    });
  } catch (error) {
    console.error('Package report error:', error);
    res.status(500).json({ error: 'Failed to generate package report' });
  }
});

module.exports = router;