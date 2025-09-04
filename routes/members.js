const express = require('express');
const { prisma } = require('../prisma');
const { authenticateToken } = require('../middleware/auth');
const { analyzeMembershipPattern } = require('../services/analyticsService');

const router = express.Router();

// Apply authentication to all member routes
router.use(authenticateToken);

// Get all members with pagination, search, and filtering
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build where clause for basic filters
    let whereClause = { isActive: true };

    // Add search filter (SQLite doesn't support mode: 'insensitive')
    if (search) {
      const searchConditions = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } }
      ];
      
      // If search term is numeric, also search by ID
      if (!isNaN(search) && search.trim() !== '') {
        searchConditions.push({ id: parseInt(search) });
      }
      
      whereClause.OR = searchConditions;
    }

    // Add status-based date filters
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (status) {
      if (status === 'expired') {
        whereClause.endDate = { lt: now };
      } else if (status === 'expiring_soon') {
        whereClause.endDate = { gte: now, lte: sevenDaysFromNow };
      } else if (status === 'active') {
        whereClause.endDate = { gt: sevenDaysFromNow };
      }
    }

    // Get total count with all filters applied
    const totalMembers = await prisma.member.count({
      where: whereClause
    });

    // Get paginated members with all filters applied
    const members = await prisma.member.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limitNum
    });

    // Add status to each member for frontend display
    const membersWithStatus = members.map(member => ({
      ...member,
      status: member.endDate < now ? 'expired' : 
              member.endDate <= sevenDaysFromNow ? 'expiring_soon' : 'active'
    }));

    const totalPages = Math.ceil(totalMembers / limitNum);
    
    res.json({
      members: membersWithStatus,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalMembers: totalMembers,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Create member (simple - without transaction)
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, membership_type, start_date, duration_months, notes } = req.body;

    if (!name || !membership_type || !start_date || duration_months === undefined) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(startDate);
    
    // Handle Day Pass (duration_months = 0) - expires end of day
    if (parseInt(duration_months) === 0) {
      endDate.setHours(23, 59, 59, 999); // End of the same day
    } else {
      endDate.setMonth(endDate.getMonth() + parseInt(duration_months));
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create member
      const member = await tx.member.create({
        data: {
          name,
          phone: phone || null,
          email: email || null,
          membershipType: membership_type,
          startDate,
          endDate,
          notes: notes || null
        }
      });

      // 2. Create initial membership period
      const membershipPeriod = await tx.membershipPeriod.create({
        data: {
          memberId: member.id,
          startDate,
          endDate,
          packageName: membership_type,
          duration: parseInt(duration_months),
          status: 'active'
        }
      });

      return { member, membershipPeriod };
    });

    res.status(201).json({ 
      message: 'Member created successfully',
      id: result.member.id 
    });
  } catch (error) {
    console.error('Create member error:', error);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

// Create member with transaction (integrated)
router.post('/with-transaction', async (req, res) => {
  try {
    const { 
      name, phone, email, membership_type, start_date, duration_months, notes,
      packageId, paymentMethodId, amount 
    } = req.body;

    if (!name || !membership_type || !start_date || duration_months === undefined) {
      return res.status(400).json({ error: 'Required member fields missing' });
    }

    if (!packageId || !paymentMethodId || !amount) {
      return res.status(400).json({ error: 'Required payment fields missing' });
    }

    // Get package details
    const membershipPackage = await prisma.membershipPackage.findUnique({
      where: { id: parseInt(packageId) }
    });

    if (!membershipPackage) {
      return res.status(404).json({ error: 'Package not found' });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(startDate);
    
    // Handle Day Pass (duration_months = 0) - expires end of day
    if (parseInt(duration_months) === 0) {
      endDate.setHours(23, 59, 59, 999); // End of the same day
    } else {
      endDate.setMonth(endDate.getMonth() + parseInt(duration_months));
    }

    // Check if member already exists by phone number
    let existingMember = null;
    if (phone) {
      existingMember = await prisma.member.findFirst({
        where: { phone: phone }
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      let member;
      
      if (existingMember && parseInt(duration_months) === 0) {
        // For Day Pass with existing phone number, use existing member
        member = existingMember;
        
        // For Day Pass, always start from today regardless of existing membership
        const newStartDate = startDate;
        const newEndDate = new Date(startDate);
        newEndDate.setHours(23, 59, 59, 999); // End of the same day for Day Pass
        
        // Update member with new dates and info
        const updateData = {
          membershipType: membership_type,
          startDate: newStartDate,
          endDate: newEndDate,
          isActive: true
        };
        
        // Update name if different (combine names for clarity)
        if (member.name !== name) {
          updateData.name = `${member.name} / ${name}`;
        }
        
        if (notes) {
          updateData.notes = notes;
        }
        
        member = await tx.member.update({
          where: { id: member.id },
          data: updateData
        });
      } else if (existingMember && parseInt(duration_months) > 0) {
        // For regular membership with existing phone, suggest using existing member
        throw new Error('MEMBER_EXISTS_WITH_PHONE');
      } else {
        // 1. Create new member
        member = await tx.member.create({
          data: {
            name,
            phone: phone || null,
            email: email || null,
            membershipType: membership_type,
            startDate,
            endDate,
            notes: notes || null
          }
        });
      }

      // 2. Create transaction
      const transaction = await tx.transaction.create({
        data: {
          memberId: member.id,
          packageId: parseInt(packageId),
          paymentMethodId: parseInt(paymentMethodId),
          amount: parseFloat(amount),
          packageName: membershipPackage.name,
          packageDuration: membershipPackage.durationMonths,
          notes: notes || `${existingMember ? 'Additional' : 'Initial'} membership - ${membership_type}`
        }
      });

      // 3. Create membership period linked to transaction
      const membershipPeriod = await tx.membershipPeriod.create({
        data: {
          memberId: member.id,
          startDate,
          endDate,
          packageName: membership_type,
          duration: parseInt(duration_months),
          status: 'active',
          transactionId: transaction.id
        }
      });

      return { member, transaction, membershipPeriod, isExistingMember: !!existingMember };
    });

    const successMessage = result.isExistingMember 
      ? 'Day Pass added to existing member successfully' 
      : 'Member created with transaction successfully';

    res.status(201).json({ 
      message: successMessage,
      member: result.member,
      transaction: result.transaction,
      membershipPeriod: result.membershipPeriod,
      isExistingMember: result.isExistingMember
    });
  } catch (error) {
    console.error('Create member with transaction error:', error);
    
    // Handle specific errors with better messages
    if (error.message === 'MEMBER_EXISTS_WITH_PHONE') {
      return res.status(409).json({ 
        error: 'Phone number already exists',
        message: 'A member with this phone number already exists. Please use the Members page to renew their membership or use a different phone number.',
        action: 'redirect_to_members',
        searchQuery: req.body.phone
      });
    }
    
    if (error.code === 'P2002' && error.meta?.target?.includes('phone')) {
      return res.status(409).json({ 
        error: 'Phone number already exists',
        message: 'A member with this phone number already exists. For Day Pass, this will be handled automatically. For memberships, please use the Members page.',
        action: 'redirect_to_members',
        searchQuery: req.body.phone
      });
    }
    
    // Generic error
    res.status(500).json({ 
      error: 'Failed to create member with transaction',
      message: 'An unexpected error occurred. Please try again or contact support.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update member
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, membership_type, start_date, duration_months, notes, is_active } = req.body;

    const startDate = new Date(start_date);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + parseInt(duration_months));

    const member = await prisma.member.update({
      where: { id: parseInt(id) },
      data: {
        name,
        phone: phone || null,
        email: email || null,
        membershipType: membership_type,
        startDate,
        endDate,
        notes: notes || null,
        isActive: is_active !== undefined ? is_active : true
      }
    });

    res.json({ message: 'Member updated successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Member not found' });
    }
    console.error('Update member error:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// Delete member (cascade delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const memberId = parseInt(id);
    
    await prisma.$transaction(async (tx) => {
      // 1. Delete membership periods first
      await tx.membershipPeriod.deleteMany({
        where: { memberId }
      });

      // 2. Delete transactions
      await tx.transaction.deleteMany({
        where: { memberId }
      });

      // 3. Finally delete the member
      await tx.member.delete({
        where: { id: memberId }
      });
    });

    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Member not found' });
    }
    console.error('Delete member error:', error);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

// Get member history
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const memberId = parseInt(id);

    // Get membership periods
    const membershipPeriods = await prisma.membershipPeriod.findMany({
      where: { memberId },
      include: { 
        transaction: {
          select: {
            id: true,
            amount: true,
            transactionDate: true,
            paymentMethod: { select: { name: true } }
          }
        }
      },
      orderBy: { startDate: 'desc' }
    });

    // Get member basic info
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        createdAt: true
      }
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Analyze patterns
    const analytics = analyzeMembershipPattern(membershipPeriods);

    // Update status for each period based on current date
    const now = new Date();
    const periodsWithStatus = membershipPeriods.map(period => ({
      ...period,
      status: new Date(period.endDate) < now ? 'expired' : 
              new Date(period.startDate) > now ? 'future' : 'active'
    }));

    res.json({
      member,
      periods: periodsWithStatus,
      analytics,
      summary: {
        memberSince: member.createdAt,
        totalPeriods: analytics.totalPeriods,
        totalDaysAsMember: analytics.totalDays,
        totalSpent: analytics.totalSpent,
        loyaltyScore: analytics.loyaltyScore,
        membershipType: analytics.membershipType
      }
    });
  } catch (error) {
    console.error('Member history error:', error);
    res.status(500).json({ error: 'Failed to fetch member history' });
  }
});

// Member Search Route (untuk handle duplikasi nama)
router.post('/search', async (req, res) => {
  try {
    const { name, phone, memberNumber } = req.body;

    if (!name && !phone && !memberNumber) {
      return res.status(400).json({ 
        error: 'Search term required (name, phone, or member number)' 
      });
    }

    let whereClause = { isActive: true };

    if (memberNumber) {
      whereClause.id = parseInt(memberNumber);
    } else if (phone) {
      whereClause.phone = phone;
    } else if (name) {
      whereClause.name = {
        contains: name
      };
    }

    const members = await prisma.member.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        membershipType: true,
        startDate: true,
        endDate: true,
        isActive: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const now = new Date();
    const membersWithStatus = members.map(member => ({
      ...member,
      status: member.endDate < now ? 'expired' : 
              member.endDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) ? 'expiring_soon' : 'active',
      daysRemaining: Math.ceil((new Date(member.endDate) - now) / (1000 * 60 * 60 * 24))
    }));

    res.json({
      members: membersWithStatus,
      count: membersWithStatus.length,
      duplicates: membersWithStatus.length > 1
    });
  } catch (error) {
    console.error('Member search error:', error);
    res.status(500).json({ error: 'Failed to search members' });
  }
});

// Renew membership
router.post('/:id/renew', async (req, res) => {
  try {
    const { id } = req.params;
    const { packageId, paymentMethodId, amount, notes, customPrice } = req.body;

    if (!packageId || !paymentMethodId) {
      return res.status(400).json({ 
        error: 'Required fields: packageId, paymentMethodId' 
      });
    }

    // Get member
    const member = await prisma.member.findUnique({
      where: { id: parseInt(id) }
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Get package details
    const membershipPackage = await prisma.membershipPackage.findUnique({
      where: { id: parseInt(packageId) }
    });

    if (!membershipPackage) {
      return res.status(404).json({ error: 'Package not found' });
    }

    // Check payment method exists
    const paymentMethod = await prisma.paymentMethod.findUnique({
      where: { id: parseInt(paymentMethodId) }
    });

    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    // Calculate new dates
    const now = new Date();
    const currentEndDate = new Date(member.endDate);
    
    // If current membership is not expired, extend from current end date
    // If expired, start from today
    const newStartDate = currentEndDate > now ? currentEndDate : now;
    const newEndDate = new Date(newStartDate);
    
    // Handle Day Pass (0 months) vs regular packages
    if (membershipPackage.durationMonths === 0) {
      // Day Pass: add 1 day and set to end of day
      newEndDate.setDate(newEndDate.getDate() + 1);
      newEndDate.setHours(23, 59, 59, 999);
    } else {
      // Regular packages: add months
      newEndDate.setMonth(newEndDate.getMonth() + membershipPackage.durationMonths);
    }

    // Determine amount (use custom price if provided, otherwise package price)
    const finalAmount = customPrice ? parseFloat(customPrice) : 
                       amount ? parseFloat(amount) : 
                       membershipPackage.price;

    // Start transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          memberId: parseInt(id),
          packageId: parseInt(packageId),
          paymentMethodId: parseInt(paymentMethodId),
          amount: finalAmount,
          packageName: membershipPackage.name,
          packageDuration: membershipPackage.durationMonths,
          notes: notes || `Membership renewal - ${membershipPackage.name}`
        },
        include: {
          member: { select: { id: true, name: true, phone: true } },
          package: { select: { id: true, name: true, durationMonths: true } },
          paymentMethod: { select: { id: true, name: true } }
        }
      });

      // 2. Create membership period record
      const membershipPeriod = await tx.membershipPeriod.create({
        data: {
          memberId: parseInt(id),
          startDate: newStartDate,
          endDate: newEndDate,
          packageName: membershipPackage.name,
          duration: membershipPackage.durationMonths,
          status: 'active',
          transactionId: transaction.id
        }
      });

      // 3. Update member with new package and dates
      const updatedMember = await tx.member.update({
        where: { id: parseInt(id) },
        data: {
          membershipType: membershipPackage.name,
          startDate: newStartDate,
          endDate: newEndDate,
          isActive: true
        }
      });

      return { transaction, member: updatedMember, membershipPeriod };
    });

    res.json({
      message: 'Membership renewed successfully',
      transaction: result.transaction,
      member: result.member,
      renewalDetails: {
        previousEndDate: member.endDate,
        newStartDate: newStartDate,
        newEndDate: newEndDate,
        extensionDays: Math.ceil((newEndDate - new Date(member.endDate)) / (1000 * 60 * 60 * 24))
      }
    });
  } catch (error) {
    console.error('Member renewal error:', error);
    res.status(500).json({ error: 'Failed to renew membership' });
  }
});

module.exports = router;