require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { prisma, initializeDatabase } = require('./prisma');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const admin = await prisma.admin.findUnique({
      where: { username }
    });

    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ 
      message: 'Login successful',
      token,
      user: { id: admin.id, username: admin.username }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Member Check-in Routes
app.post('/api/checkin', async (req, res) => {
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

// Member Search Route (untuk handle duplikasi nama)
app.post('/api/members/search', async (req, res) => {
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
        memberCard: true,
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

// Protected Routes
app.use('/api/members', authenticateToken);
app.use('/api/packages', authenticateToken);

// Member Routes
app.get('/api/members', async (req, res) => {
  try {
    const members = await prisma.member.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    });

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const membersWithStatus = members.map(member => ({
      ...member,
      status: member.endDate < now ? 'expired' : 
              member.endDate <= sevenDaysFromNow ? 'expiring_soon' : 'active'
    }));
    
    res.json(membersWithStatus);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

app.post('/api/members', async (req, res) => {
  try {
    const { name, phone, email, membership_type, start_date, duration_months, notes } = req.body;

    if (!name || !membership_type || !start_date || !duration_months) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + parseInt(duration_months));

    const member = await prisma.member.create({
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

    res.status(201).json({ 
      message: 'Member created successfully',
      id: member.id 
    });
  } catch (error) {
    console.error('Create member error:', error);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

app.put('/api/members/:id', async (req, res) => {
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

app.delete('/api/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.member.delete({
      where: { id: parseInt(id) }
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

// Package Routes
app.get('/api/packages', async (req, res) => {
  try {
    const packages = await prisma.membershipPackage.findMany({
      where: { isActive: true },
      orderBy: { durationMonths: 'asc' }
    });
    res.json(packages);
  } catch (error) {
    console.error('Get packages error:', error);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// Dashboard Stats
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const totalMembers = await prisma.member.count({ where: { isActive: true } });
    const expiredMembers = await prisma.member.count({ 
      where: { isActive: true, endDate: { lt: now } } 
    });
    const expiringSoon = await prisma.member.count({ 
      where: { 
        isActive: true, 
        endDate: { gte: now, lte: sevenDaysFromNow } 
      } 
    });
    const activeMembers = await prisma.member.count({ 
      where: { isActive: true, endDate: { gt: now } } 
    });

    res.json({
      totalMembers,
      expiredMembers,
      expiringSoon,
      activeMembers
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 API endpoint: http://localhost:${PORT}/api`);
  console.log(`🔐 Default login: admin / admin123`);
  await initializeDatabase();
});