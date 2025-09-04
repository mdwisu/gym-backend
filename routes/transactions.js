const express = require('express');
const { prisma } = require('../prisma');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Get all transactions with pagination
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, memberId } = req.query;
    const skip = (page - 1) * limit;

    let whereClause = {};
    if (memberId) {
      whereClause.memberId = parseInt(memberId);
    }

    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      include: {
        member: { select: { id: true, name: true, phone: true } },
        paymentMethod: { select: { id: true, name: true } }
      },
      orderBy: { transactionDate: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit)
    });

    const total = await prisma.transaction.count({ where: whereClause });

    res.json({
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Create new transaction
router.post('/', async (req, res) => {
  try {
    const { 
      memberId, 
      packageId, 
      paymentMethodId, 
      amount, 
      notes,
      transactionDate = new Date()
    } = req.body;

    if (!memberId || !packageId || !paymentMethodId || !amount) {
      return res.status(400).json({ 
        error: 'Required fields: memberId, packageId, paymentMethodId, amount' 
      });
    }

    // Get package details to store in transaction
    const membershipPackage = await prisma.membershipPackage.findUnique({
      where: { id: parseInt(packageId) }
    });

    if (!membershipPackage) {
      return res.status(404).json({ error: 'Package not found' });
    }

    // Check if member exists
    const member = await prisma.member.findUnique({
      where: { id: parseInt(memberId) }
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check if payment method exists
    const paymentMethod = await prisma.paymentMethod.findUnique({
      where: { id: parseInt(paymentMethodId) }
    });

    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          memberId: parseInt(memberId),
          packageId: parseInt(packageId),
          paymentMethodId: parseInt(paymentMethodId),
          amount: parseFloat(amount),
          packageName: membershipPackage.name,
          packageDuration: membershipPackage.durationMonths,
          transactionDate: new Date(transactionDate),
          notes: notes || null
        },
        include: {
          member: { select: { id: true, name: true, phone: true } },
          package: { select: { id: true, name: true, durationMonths: true } },
          paymentMethod: { select: { id: true, name: true } }
        }
      });

      // Create corresponding membership period if this is a membership purchase
      const member = await tx.member.findUnique({
        where: { id: parseInt(memberId) }
      });

      if (member) {
        // Calculate period dates
        const startDate = new Date(transactionDate);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + membershipPackage.durationMonths);

        // Create membership period
        await tx.membershipPeriod.create({
          data: {
            memberId: parseInt(memberId),
            startDate,
            endDate,
            packageName: membershipPackage.name,
            duration: membershipPackage.durationMonths,
            status: 'active',
            transactionId: transaction.id
          }
        });
      }

      return transaction;
    });

    res.status(201).json({
      message: 'Transaction recorded successfully',
      transaction: result
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'Failed to record transaction' });
  }
});

module.exports = router;