const express = require('express');
const { prisma } = require('../prisma');

const router = express.Router();

// Member Check-in Routes (public - no auth required)
router.post('/checkin', async (req, res) => {
  try {
    const { memberNumber, name, phone, createDayPass, paymentMethodId } = req.body;

    if (!memberNumber && !name && !phone) {
      return res.status(400).json({ 
        error: 'Member ID, name, or phone number required' 
      });
    }

    let member = null;

    // Search by member number (ID) - most precise
    if (memberNumber) {
      member = await prisma.member.findUnique({
        where: { id: parseInt(memberNumber) }
      });
    }
    // Search by phone - unique field (only if it looks like a phone number)
    else if (phone && /^\d+$/.test(phone.toString())) {
      member = await prisma.member.findFirst({
        where: { 
          phone: phone,
          isActive: true
        }
      });
    }
    // Search by name - can have duplicates
    else if (name) {
      const members = await prisma.member.findMany({
        where: {
          name: {
            contains: name
          },
          isActive: true
        },
        orderBy: { createdAt: 'desc' }
      });

      if (members.length === 0) {
        return res.status(404).json({ 
          error: 'Member not found',
          canEnter: false
        });
      }

      if (members.length > 1) {
        // Multiple members found with similar names
        const duplicateMembers = members.map(m => ({
          id: m.id,
          name: m.name,
          phone: m.phone,
          email: m.email,
          membershipType: m.membershipType,
          endDate: m.endDate
        }));

        return res.status(300).json({ 
          error: 'Multiple members found with similar names',
          message: 'Please specify member ID, phone number, or select from the list below:',
          duplicateMembers,
          canEnter: false
        });
      }

      member = members[0];
    }

    if (!member) {
      return res.status(404).json({ 
        error: 'Member not found',
        canEnter: false
      });
    }

    // Check if member is active
    if (!member.isActive) {
      return res.status(403).json({ 
        error: 'Member is inactive',
        member: {
          id: member.id,
          name: member.name,
          membershipType: member.membershipType,
          status: 'inactive'
        },
        canEnter: false
      });
    }

    // Check if membership has expired
    const now = new Date();
    const endDate = new Date(member.endDate);
    
    // For Day Pass, check only the date (not time) - valid throughout the day
    let isExpired = false;
    if (member.membershipType === 'Day Pass') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDateOnly = new Date(endDate);
      endDateOnly.setHours(0, 0, 0, 0);
      isExpired = endDateOnly < today;
    } else {
      // For regular memberships, use exact time comparison
      isExpired = endDate < now;
    }
    
    if (isExpired) {
      return res.status(403).json({ 
        error: 'Membership has expired',
        member: {
          id: member.id,
          name: member.name,
          membershipType: member.membershipType,
          endDate: member.endDate,
          status: 'expired'
        },
        canEnter: false
      });
    }

    // Get all active membership periods for accurate remaining days calculation
    const membershipPeriods = await prisma.membershipPeriod.findMany({
      where: {
        memberId: member.id,
        status: 'active',
        endDate: { gt: now }
      },
      orderBy: { endDate: 'desc' }
    });

    // Calculate total remaining days from all active periods
    let totalRemainingDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    
    if (membershipPeriods.length > 0) {
      // Sort periods by start date to calculate continuous days
      const sortedPeriods = membershipPeriods.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
      
      // Calculate total days by summing all periods (handles consecutive periods)
      let currentDate = now;
      let totalDays = 0;
      
      for (const period of sortedPeriods) {
        const periodStart = new Date(period.startDate);
        const periodEnd = new Date(period.endDate);
        
        // If period hasn't started yet, count from start date
        if (periodStart > currentDate) {
          const daysInPeriod = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24)) + 1;
          totalDays += daysInPeriod;
        } else if (periodEnd > currentDate) {
          // Period is active, count remaining days in this period
          const daysInPeriod = Math.ceil((periodEnd - currentDate) / (1000 * 60 * 60 * 24));
          totalDays += daysInPeriod;
        }
      }
      
      totalRemainingDays = totalDays;
    }

    // Check if membership expires soon (within 7 days)
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiringSoon = endDate <= sevenDaysFromNow && totalRemainingDays <= 7;

    let newPeriod = null;
    let updatedRemainingDays = totalRemainingDays;
    
    // Create day pass period if requested
    if (createDayPass) {
      if (!paymentMethodId) {
        return res.status(400).json({ 
          error: 'Payment method required for day pass' 
        });
      }

      // Get Day Pass package
      const dayPassPackage = await prisma.membershipPackage.findFirst({
        where: { name: 'Day Pass', durationMonths: 0 }
      });

      if (!dayPassPackage) {
        return res.status(404).json({ 
          error: 'Day Pass package not found' 
        });
      }

      // Create day pass transaction and period
      const result = await prisma.$transaction(async (tx) => {
        // Get all existing periods to find latest end date
        const allPeriods = await tx.membershipPeriod.findMany({
          where: {
            memberId: member.id,
            status: 'active'
          },
          orderBy: { endDate: 'desc' }
        });

        // Calculate day pass start date
        let dayPassStart;
        if (allPeriods.length > 0) {
          const latestEndDate = allPeriods.reduce((latest, period) => {
            const periodEnd = new Date(period.endDate);
            return periodEnd > latest ? periodEnd : latest;
          }, new Date(allPeriods[0].endDate));
          
          dayPassStart = new Date(latestEndDate);
          dayPassStart.setDate(dayPassStart.getDate() + 1);
        } else {
          const memberEndDate = new Date(member.endDate);
          const today = new Date();
          
          if (memberEndDate > today) {
            dayPassStart = new Date(memberEndDate);
            dayPassStart.setDate(dayPassStart.getDate() + 1);
          } else {
            dayPassStart = new Date();
          }
        }
        dayPassStart.setHours(0, 0, 0, 0);
        
        const dayPassEnd = new Date(dayPassStart);
        dayPassEnd.setHours(23, 59, 59, 999);

        // Create transaction
        const transaction = await tx.transaction.create({
          data: {
            memberId: member.id,
            packageId: dayPassPackage.id,
            paymentMethodId: parseInt(paymentMethodId),
            amount: dayPassPackage.price,
            packageName: dayPassPackage.name,
            packageDuration: 0,
            notes: 'Day Pass via check-in'
          }
        });

        // Create membership period
        const period = await tx.membershipPeriod.create({
          data: {
            memberId: member.id,
            startDate: dayPassStart,
            endDate: dayPassEnd,
            packageName: dayPassPackage.name,
            duration: 0,
            status: 'active',
            transactionId: transaction.id
          }
        });

        return { transaction, period };
      });

      newPeriod = result.period;
      updatedRemainingDays = totalRemainingDays + 1; // Add 1 day for day pass
    }

    // Member can enter
    res.json({
      message: expiringSoon ? 'Welcome! Access granted - Membership expires soon' : 'Welcome! Access granted',
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        membershipType: member.membershipType,
        startDate: member.startDate,
        endDate: member.endDate,
        status: expiringSoon ? 'expiring_soon' : 'active',
        daysRemaining: Math.max(0, updatedRemainingDays),
        activePeriods: membershipPeriods.length + (newPeriod ? 1 : 0)
      },
      canEnter: true,
      dayPassCreated: !!newPeriod,
      newPeriod: newPeriod ? {
        startDate: newPeriod.startDate,
        endDate: newPeriod.endDate,
        packageName: newPeriod.packageName
      } : null
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;