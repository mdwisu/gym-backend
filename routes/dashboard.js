const express = require('express');
const { prisma } = require('../prisma');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get counts for different member statuses
    const [
      totalMembers,
      activeMembers, 
      expiredMembers,
      expiringSoonMembers
    ] = await Promise.all([
      // Total active members
      prisma.member.count({
        where: { isActive: true }
      }),
      
      // Active members (not expired)
      prisma.member.count({
        where: {
          isActive: true,
          endDate: { gt: now }
        }
      }),
      
      // Expired members
      prisma.member.count({
        where: {
          isActive: true,
          endDate: { lt: now }
        }
      }),
      
      // Members expiring soon (within 7 days)
      prisma.member.count({
        where: {
          isActive: true,
          endDate: { 
            gte: now,
            lte: sevenDaysFromNow 
          }
        }
      })
    ]);

    res.json({
      totalMembers,
      activeMembers: activeMembers - expiringSoonMembers, // Active but not expiring soon
      expiredMembers,
      expiringSoon: expiringSoonMembers
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

module.exports = router;