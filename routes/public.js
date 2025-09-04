const express = require('express');
const { prisma } = require('../prisma');

const router = express.Router();

// Member Check-in Routes (public - no auth required)
router.post('/checkin', async (req, res) => {
  try {
    const { memberNumber, name, phone } = req.body;

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
    
    if (endDate < now) {
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

    // Check if membership expires soon (within 7 days)
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiringSoon = endDate <= sevenDaysFromNow;

    // Member can enter
    res.json({
      message: expiringSoon ? 'Membership expires soon' : 'Welcome! Access granted',
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        membershipType: member.membershipType,
        startDate: member.startDate,
        endDate: member.endDate,
        status: expiringSoon ? 'expiring_soon' : 'active',
        daysRemaining: Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
      },
      canEnter: true,
      warning: expiringSoon ? 'Membership expires soon' : null
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;