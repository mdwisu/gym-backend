require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { prisma } = require('./prisma');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Auth Routes
// app.post('/api/auth/login', async (req, res) => {
//   try {
//     const { username, password } = req.body;

//     if (!username || !password) {
//       return res.status(400).json({ error: 'Username and password required' });
//     }

//     const admin = await prisma.admin.findUnique({
//       where: { username }
//     });

//     if (!admin || !bcrypt.compareSync(password, admin.password)) {
//       return res.status(401).json({ error: 'Invalid credentials' });
//     }

//     const token = jwt.sign(
//       { id: admin.id, username: admin.username },
//       process.env.JWT_SECRET,
//       { expiresIn: '24h' }
//     );

//     res.json({ 
//       message: 'Login successful',
//       token,
//       user: { id: admin.id, username: admin.username }
//     });
//   } catch (error) {
//     console.error('Login error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

// Member Check-in Routes
// app.post('/api/checkin', async (req, res) => {
//   try {
//     const { memberNumber, name, phone } = req.body;

//     if (!memberNumber && !name && !phone) {
//       return res.status(400).json({ 
//         error: 'Member ID, name, or phone number required' 
//       });
//     }

//     let member = null;

//     // Search by member number (ID) - most precise
//     if (memberNumber) {
//       member = await prisma.member.findUnique({
//         where: { id: parseInt(memberNumber) }
//       });
//     }
//     // Search by phone - unique field (only if it looks like a phone number)
//     else if (phone && /^\d+$/.test(phone.toString())) {
//       member = await prisma.member.findFirst({
//         where: { 
//           phone: phone,
//           isActive: true
//         }
//       });
//     }
//     // Search by name - can have duplicates
//     else if (name) {
//       const members = await prisma.member.findMany({
//         where: {
//           name: {
//             contains: name
//           },
//           isActive: true
//         },
//         orderBy: { createdAt: 'desc' }
//       });

//       if (members.length === 0) {
//         return res.status(404).json({ 
//           error: 'Member not found',
//           canEnter: false
//         });
//       }

//       if (members.length > 1) {
//         // Multiple members found with similar names
//         const duplicateMembers = members.map(m => ({
//           id: m.id,
//           name: m.name,
//           phone: m.phone,
//           email: m.email,
//           membershipType: m.membershipType,
//           endDate: m.endDate
//         }));

//         return res.status(300).json({ 
//           error: 'Multiple members found with similar names',
//           message: 'Please specify member ID, phone number, or select from the list below:',
//           duplicateMembers,
//           canEnter: false
//         });
//       }

//       member = members[0];
//     }

//     if (!member) {
//       return res.status(404).json({ 
//         error: 'Member not found',
//         canEnter: false
//       });
//     }

//     // Check if member is active
//     if (!member.isActive) {
//       return res.status(403).json({ 
//         error: 'Member is inactive',
//         member: {
//           id: member.id,
//           name: member.name,
//           membershipType: member.membershipType,
//           status: 'inactive'
//         },
//         canEnter: false
//       });
//     }

//     // Check if membership has expired
//     const now = new Date();
//     const endDate = new Date(member.endDate);
    
//     if (endDate < now) {
//       return res.status(403).json({ 
//         error: 'Membership has expired',
//         member: {
//           id: member.id,
//           name: member.name,
//           membershipType: member.membershipType,
//           endDate: member.endDate,
//           status: 'expired'
//         },
//         canEnter: false
//       });
//     }

//     // Check if membership expires soon (within 7 days)
//     const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
//     const expiringSoon = endDate <= sevenDaysFromNow;

//     // Member can enter
//     res.json({
//       message: expiringSoon ? 'Membership expires soon' : 'Welcome! Access granted',
//       member: {
//         id: member.id,
//         name: member.name,
//         phone: member.phone,
//         membershipType: member.membershipType,
//         startDate: member.startDate,
//         endDate: member.endDate,
//         status: expiringSoon ? 'expiring_soon' : 'active',
//         daysRemaining: Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
//       },
//       canEnter: true,
//       warning: expiringSoon ? 'Membership expires soon' : null
//     });
//   } catch (error) {
//     console.error('Check-in error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

// Member Search Route (untuk handle duplikasi nama)
// app.post('/api/members/search', async (req, res) => {
//   try {
//     const { name, phone, memberNumber } = req.body;

//     if (!name && !phone && !memberNumber) {
//       return res.status(400).json({ 
//         error: 'Search term required (name, phone, or member number)' 
//       });
//     }

//     let whereClause = { isActive: true };

//     if (memberNumber) {
//       whereClause.id = parseInt(memberNumber);
//     } else if (phone) {
//       whereClause.phone = phone;
//     } else if (name) {
//       whereClause.name = {
//         contains: name
//       };
//     }

//     const members = await prisma.member.findMany({
//       where: whereClause,
//       select: {
//         id: true,
//         name: true,
//         phone: true,
//         email: true,
//         memberCard: true,
//         membershipType: true,
//         startDate: true,
//         endDate: true,
//         isActive: true
//       },
//       orderBy: { createdAt: 'desc' }
//     });

//     const now = new Date();
//     const membersWithStatus = members.map(member => ({
//       ...member,
//       status: member.endDate < now ? 'expired' : 
//               member.endDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) ? 'expiring_soon' : 'active',
//       daysRemaining: Math.ceil((new Date(member.endDate) - now) / (1000 * 60 * 60 * 24))
//     }));

//     res.json({
//       members: membersWithStatus,
//       count: membersWithStatus.length,
//       duplicates: membersWithStatus.length > 1
//     });
//   } catch (error) {
//     console.error('Member search error:', error);
//     res.status(500).json({ error: 'Failed to search members' });
//   }
// });

// Protected Routes
// app.use('/api/members', authenticateToken);
// app.use('/api/packages', authenticateToken);

// Member Routes
// app.get('/api/members', async (req, res) => {
//   try {
//     const { page = 1, limit = 10, search = '', status = '' } = req.query;
//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const offset = (pageNum - 1) * limitNum;

//     // Build where clause for basic filters
//     let whereClause = { isActive: true };

//     // Add search filter (SQLite doesn't support mode: 'insensitive')
//     if (search) {
//       const searchConditions = [
//         { name: { contains: search } },
//         { phone: { contains: search } },
//         { email: { contains: search } }
//       ];
      
//       // If search term is numeric, also search by ID
//       if (!isNaN(search) && search.trim() !== '') {
//         searchConditions.push({ id: parseInt(search) });
//       }
      
//       whereClause.OR = searchConditions;
//     }

//     // Add status-based date filters
//     const now = new Date();
//     const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

//     if (status) {
//       if (status === 'expired') {
//         whereClause.endDate = { lt: now };
//       } else if (status === 'expiring_soon') {
//         whereClause.endDate = { gte: now, lte: sevenDaysFromNow };
//       } else if (status === 'active') {
//         whereClause.endDate = { gt: sevenDaysFromNow };
//       }
//     }

//     // Get total count with all filters applied
//     const totalMembers = await prisma.member.count({
//       where: whereClause
//     });

//     // Get paginated members with all filters applied
//     const members = await prisma.member.findMany({
//       where: whereClause,
//       orderBy: { createdAt: 'desc' },
//       skip: offset,
//       take: limitNum
//     });

//     // Add status to each member for frontend display
//     const membersWithStatus = members.map(member => ({
//       ...member,
//       status: member.endDate < now ? 'expired' : 
//               member.endDate <= sevenDaysFromNow ? 'expiring_soon' : 'active'
//     }));

//     const totalPages = Math.ceil(totalMembers / limitNum);
    
//     res.json({
//       members: membersWithStatus,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalMembers: totalMembers,
//         limit: limitNum,
//         hasNextPage: pageNum < totalPages,
//         hasPreviousPage: pageNum > 1
//       }
//     });
//   } catch (error) {
//     console.error('Get members error:', error);
//     res.status(500).json({ error: 'Failed to fetch members' });
//   }
// });

// app.post('/api/members', async (req, res) => {
//   try {
//     const { name, phone, email, membership_type, start_date, duration_months, notes } = req.body;

//     if (!name || !membership_type || !start_date || duration_months === undefined) {
//       return res.status(400).json({ error: 'Required fields missing' });
//     }

//     const startDate = new Date(start_date);
//     const endDate = new Date(startDate);
    
//     // Handle Day Pass (duration_months = 0) - expires end of day
//     if (parseInt(duration_months) === 0) {
//       endDate.setHours(23, 59, 59, 999); // End of the same day
//     } else {
//       endDate.setMonth(endDate.getMonth() + parseInt(duration_months));
//     }

//     const result = await prisma.$transaction(async (tx) => {
//       // 1. Create member
//       const member = await tx.member.create({
//         data: {
//           name,
//           phone: phone || null,
//           email: email || null,
//           membershipType: membership_type,
//           startDate,
//           endDate,
//           notes: notes || null
//         }
//       });

//       // 2. Create initial membership period
//       const membershipPeriod = await tx.membershipPeriod.create({
//         data: {
//           memberId: member.id,
//           startDate,
//           endDate,
//           packageName: membership_type,
//           duration: parseInt(duration_months),
//           status: 'active'
//         }
//       });

//       return { member, membershipPeriod };
//     });

//     res.status(201).json({ 
//       message: 'Member created successfully',
//       id: result.member.id 
//     });
//   } catch (error) {
//     console.error('Create member error:', error);
//     res.status(500).json({ error: 'Failed to create member' });
//   }
// });

// app.put('/api/members/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { name, phone, email, membership_type, start_date, duration_months, notes, is_active } = req.body;

//     const startDate = new Date(start_date);
//     const endDate = new Date(startDate);
//     endDate.setMonth(endDate.getMonth() + parseInt(duration_months));

//     const member = await prisma.member.update({
//       where: { id: parseInt(id) },
//       data: {
//         name,
//         phone: phone || null,
//         email: email || null,
//         membershipType: membership_type,
//         startDate,
//         endDate,
//         notes: notes || null,
//         isActive: is_active !== undefined ? is_active : true
//       }
//     });

//     res.json({ message: 'Member updated successfully' });
//   } catch (error) {
//     if (error.code === 'P2025') {
//       return res.status(404).json({ error: 'Member not found' });
//     }
//     console.error('Update member error:', error);
//     res.status(500).json({ error: 'Failed to update member' });
//   }
// });

// app.delete('/api/members/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const memberId = parseInt(id);
    
//     await prisma.$transaction(async (tx) => {
//       // 1. Delete membership periods first
//       await tx.membershipPeriod.deleteMany({
//         where: { memberId }
//       });

//       // 2. Delete transactions
//       await tx.transaction.deleteMany({
//         where: { memberId }
//       });

//       // 3. Finally delete the member
//       await tx.member.delete({
//         where: { id: memberId }
//       });
//     });

//     res.json({ message: 'Member deleted successfully' });
//   } catch (error) {
//     if (error.code === 'P2025') {
//       return res.status(404).json({ error: 'Member not found' });
//     }
//     console.error('Delete member error:', error);
//     res.status(500).json({ error: 'Failed to delete member' });
//   }
// });

// Member Renewal Route - All-in-One
// app.post('/api/members/:id/renew', authenticateToken, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { packageId, paymentMethodId, amount, notes, customPrice } = req.body;

//     if (!packageId || !paymentMethodId) {
//       return res.status(400).json({ 
//         error: 'Required fields: packageId, paymentMethodId' 
//       });
//     }

//     // Get member
//     const member = await prisma.member.findUnique({
//       where: { id: parseInt(id) }
//     });

//     if (!member) {
//       return res.status(404).json({ error: 'Member not found' });
//     }

//     // Get package details
//     const membershipPackage = await prisma.membershipPackage.findUnique({
//       where: { id: parseInt(packageId) }
//     });

//     if (!membershipPackage) {
//       return res.status(404).json({ error: 'Package not found' });
//     }

//     // Check payment method exists
//     const paymentMethod = await prisma.paymentMethod.findUnique({
//       where: { id: parseInt(paymentMethodId) }
//     });

//     if (!paymentMethod) {
//       return res.status(404).json({ error: 'Payment method not found' });
//     }

//     // Calculate new dates
//     const now = new Date();
//     const currentEndDate = new Date(member.endDate);
    
//     // If current membership is not expired, extend from current end date
//     // If expired, start from today
//     const newStartDate = currentEndDate > now ? currentEndDate : now;
//     const newEndDate = new Date(newStartDate);
//     newEndDate.setMonth(newEndDate.getMonth() + membershipPackage.durationMonths);

//     // Determine amount (use custom price if provided, otherwise package price)
//     const finalAmount = customPrice ? parseFloat(customPrice) : 
//                        amount ? parseFloat(amount) : 
//                        membershipPackage.price;

//     // Start transaction
//     const result = await prisma.$transaction(async (tx) => {
//       // 1. Create transaction record
//       const transaction = await tx.transaction.create({
//         data: {
//           memberId: parseInt(id),
//           packageId: parseInt(packageId),
//           paymentMethodId: parseInt(paymentMethodId),
//           amount: finalAmount,
//           packageName: membershipPackage.name,
//           packageDuration: membershipPackage.durationMonths,
//           notes: notes || `Membership renewal - ${membershipPackage.name}`
//         },
//         include: {
//           member: { select: { id: true, name: true, phone: true } },
//           package: { select: { id: true, name: true, durationMonths: true } },
//           paymentMethod: { select: { id: true, name: true } }
//         }
//       });

//       // 2. Create membership period record
//       const membershipPeriod = await tx.membershipPeriod.create({
//         data: {
//           memberId: parseInt(id),
//           startDate: newStartDate,
//           endDate: newEndDate,
//           packageName: membershipPackage.name,
//           duration: membershipPackage.durationMonths,
//           status: 'active',
//           transactionId: transaction.id
//         }
//       });

//       // 3. Update member with new package and dates
//       const updatedMember = await tx.member.update({
//         where: { id: parseInt(id) },
//         data: {
//           membershipType: membershipPackage.name,
//           startDate: newStartDate,
//           endDate: newEndDate,
//           isActive: true
//         }
//       });

//       return { transaction, member: updatedMember, membershipPeriod };
//     });

//     res.json({
//       message: 'Membership renewed successfully',
//       transaction: result.transaction,
//       member: result.member,
//       renewalDetails: {
//         previousEndDate: member.endDate,
//         newStartDate: newStartDate,
//         newEndDate: newEndDate,
//         extensionDays: Math.ceil((newEndDate - new Date(member.endDate)) / (1000 * 60 * 60 * 24))
//       }
//     });
//   } catch (error) {
//     console.error('Member renewal error:', error);
//     res.status(500).json({ error: 'Failed to renew membership' });
//   }
// });

// Package Routes
// app.get('/api/packages', async (req, res) => {
//   try {
//     const packages = await prisma.membershipPackage.findMany({
//       where: { isActive: true },
//       orderBy: { durationMonths: 'asc' }
//     });
//     res.json(packages);
//   } catch (error) {
//     console.error('Get packages error:', error);
//     res.status(500).json({ error: 'Failed to fetch packages' });
//   }
// });

// app.post('/api/packages', authenticateToken, async (req, res) => {
//   try {
//     const { name, durationMonths, price, description } = req.body;

//     if (!name || !durationMonths || !price) {
//       return res.status(400).json({ 
//         error: 'Required fields: name, durationMonths, price' 
//       });
//     }

//     const membershipPackage = await prisma.membershipPackage.create({
//       data: {
//         name: name.trim(),
//         durationMonths: parseInt(durationMonths),
//         price: parseFloat(price),
//         description: description?.trim() || null
//       }
//     });

//     res.status(201).json({
//       message: 'Package created successfully',
//       package: membershipPackage
//     });
//   } catch (error) {
//     console.error('Create package error:', error);
//     res.status(500).json({ error: 'Failed to create package' });
//   }
// });

// app.put('/api/packages/:id', authenticateToken, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { name, durationMonths, price, description, isActive } = req.body;

//     if (!name || !durationMonths || !price) {
//       return res.status(400).json({ 
//         error: 'Required fields: name, durationMonths, price' 
//       });
//     }

//     const membershipPackage = await prisma.membershipPackage.update({
//       where: { id: parseInt(id) },
//       data: {
//         name: name.trim(),
//         durationMonths: parseInt(durationMonths),
//         price: parseFloat(price),
//         description: description?.trim() || null,
//         isActive: isActive !== undefined ? isActive : true
//       }
//     });

//     res.json({
//       message: 'Package updated successfully',
//       package: membershipPackage
//     });
//   } catch (error) {
//     if (error.code === 'P2025') {
//       return res.status(404).json({ error: 'Package not found' });
//     }
//     console.error('Update package error:', error);
//     res.status(500).json({ error: 'Failed to update package' });
//   }
// });

// app.delete('/api/packages/:id', authenticateToken, async (req, res) => {
//   try {
//     const { id } = req.params;

//     // Check if package is used in any transactions
//     const transactionCount = await prisma.transaction.count({
//       where: { packageId: parseInt(id) }
//     });

//     if (transactionCount > 0) {
//       // Don't delete, just deactivate
//       await prisma.membershipPackage.update({
//         where: { id: parseInt(id) },
//         data: { isActive: false }
//       });
      
//       return res.json({ 
//         message: 'Package deactivated (cannot delete as it has transaction history)' 
//       });
//     }

//     // Safe to delete if no transactions
//     await prisma.membershipPackage.delete({
//       where: { id: parseInt(id) }
//     });

//     res.json({ message: 'Package deleted successfully' });
//   } catch (error) {
//     if (error.code === 'P2025') {
//       return res.status(404).json({ error: 'Package not found' });
//     }
//     console.error('Delete package error:', error);
//     res.status(500).json({ error: 'Failed to delete package' });
//   }
// });

// Payment Method Routes
// app.get('/api/payment-methods', authenticateToken, async (req, res) => {
//   try {
//     const paymentMethods = await prisma.paymentMethod.findMany({
//       where: { isActive: true },
//       orderBy: { name: 'asc' }
//     });
//     res.json(paymentMethods);
//   } catch (error) {
//     console.error('Get payment methods error:', error);
//     res.status(500).json({ error: 'Failed to fetch payment methods' });
//   }
// });

// Transaction Routes - MIGRATED TO routes/transactions.js
// app.get('/api/transactions', authenticateToken, async (req, res) => {
//   try {
//     const { page = 1, limit = 50, memberId } = req.query;
//     const skip = (page - 1) * limit;

//     let whereClause = {};
//     if (memberId) {
//       whereClause.memberId = parseInt(memberId);
//     }

//     const transactions = await prisma.transaction.findMany({
//       where: whereClause,
//       include: {
//         member: { select: { id: true, name: true, phone: true } },
//         paymentMethod: { select: { id: true, name: true } }
//       },
//       orderBy: { transactionDate: 'desc' },
//       skip: parseInt(skip),
//       take: parseInt(limit)
//     });

//     const total = await prisma.transaction.count({ where: whereClause });

//     res.json({
//       transactions,
//       pagination: {
//         page: parseInt(page),
//         limit: parseInt(limit),
//         total,
//         pages: Math.ceil(total / limit)
//       }
//     });
//   } catch (error) {
//     console.error('Get transactions error:', error);
//     res.status(500).json({ error: 'Failed to fetch transactions' });
//   }
// });

// app.post('/api/transactions', authenticateToken, async (req, res) => {
//   try {
//     const { 
//       memberId, 
//       packageId, 
//       paymentMethodId, 
//       amount, 
//       notes,
//       transactionDate = new Date()
//     } = req.body;

//     if (!memberId || !packageId || !paymentMethodId || !amount) {
//       return res.status(400).json({ 
//         error: 'Required fields: memberId, packageId, paymentMethodId, amount' 
//       });
//     }

//     // Get package details to store in transaction
//     const membershipPackage = await prisma.membershipPackage.findUnique({
//       where: { id: parseInt(packageId) }
//     });

//     if (!membershipPackage) {
//       return res.status(404).json({ error: 'Package not found' });
//     }

//     // Check if member exists
//     const member = await prisma.member.findUnique({
//       where: { id: parseInt(memberId) }
//     });

//     if (!member) {
//       return res.status(404).json({ error: 'Member not found' });
//     }

//     // Check if payment method exists
//     const paymentMethod = await prisma.paymentMethod.findUnique({
//       where: { id: parseInt(paymentMethodId) }
//     });

//     if (!paymentMethod) {
//       return res.status(404).json({ error: 'Payment method not found' });
//     }

//     const result = await prisma.$transaction(async (tx) => {
//       // Create transaction
//       const transaction = await tx.transaction.create({
//         data: {
//           memberId: parseInt(memberId),
//           packageId: parseInt(packageId),
//           paymentMethodId: parseInt(paymentMethodId),
//           amount: parseFloat(amount),
//           packageName: membershipPackage.name,
//           packageDuration: membershipPackage.durationMonths,
//           transactionDate: new Date(transactionDate),
//           notes: notes || null
//         },
//         include: {
//           member: { select: { id: true, name: true, phone: true } },
//           package: { select: { id: true, name: true, durationMonths: true } },
//           paymentMethod: { select: { id: true, name: true } }
//         }
//       });

//       // Create corresponding membership period if this is a membership purchase
//       const member = await tx.member.findUnique({
//         where: { id: parseInt(memberId) }
//       });

//       if (member) {
//         // Calculate period dates
//         const startDate = new Date(transactionDate);
//         const endDate = new Date(startDate);
//         endDate.setMonth(endDate.getMonth() + membershipPackage.durationMonths);

//         // Create membership period
//         await tx.membershipPeriod.create({
//           data: {
//             memberId: parseInt(memberId),
//             startDate,
//             endDate,
//             packageName: membershipPackage.name,
//             duration: membershipPackage.durationMonths,
//             status: 'active',
//             transactionId: transaction.id
//           }
//         });
//       }

//       return transaction;
//     });

//     res.status(201).json({
//       message: 'Transaction recorded successfully',
//       transaction: result
//     });
//   } catch (error) {
//     console.error('Create transaction error:', error);
//     res.status(500).json({ error: 'Failed to record transaction' });
//   }
// });

// Helper function to analyze membership patterns - MIGRATED TO routes/reports.js
// function analyzeMembershipPattern(periods) {
//   if (!periods || periods.length === 0) {
//     return {
//       totalPeriods: 0,
//       totalDays: 0,
//       totalSpent: 0,
//       averageDuration: 0,
//       gaps: [],
//       loyaltyScore: 0,
//       membershipType: 'new'
//     };
//   }

//   // Sort periods by start date
//   const sortedPeriods = periods.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  
//   // Calculate total days and spending
//   let totalDays = 0;
//   let totalSpent = 0;
  
//   sortedPeriods.forEach(period => {
//     const start = new Date(period.startDate);
//     const end = new Date(period.endDate);
//     const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
//     totalDays += days;
    
//     if (period.transaction) {
//       totalSpent += period.transaction.amount;
//     }
//   });

//   // Calculate gaps between periods
//   const gaps = [];
//   for (let i = 1; i < sortedPeriods.length; i++) {
//     const prevEnd = new Date(sortedPeriods[i - 1].endDate);
//     const currentStart = new Date(sortedPeriods[i].startDate);
//     const gapDays = Math.ceil((currentStart - prevEnd) / (1000 * 60 * 60 * 24));
    
//     if (gapDays > 0) {
//       gaps.push({
//         afterPeriod: i - 1,
//         beforePeriod: i,
//         days: gapDays,
//         startDate: prevEnd,
//         endDate: currentStart
//       });
//     }
//   }

//   // Calculate loyalty metrics
//   const totalPeriods = periods.length;
//   const averageDuration = totalPeriods > 0 ? totalDays / totalPeriods : 0;
//   const totalGapDays = gaps.reduce((sum, gap) => sum + gap.days, 0);
  
//   // Loyalty score calculation (0-100)
//   let loyaltyScore = 0;
//   if (totalPeriods >= 3) loyaltyScore += 30; // Repeat customer
//   if (totalGapDays < 30) loyaltyScore += 25; // Short gaps
//   if (averageDuration > 30) loyaltyScore += 25; // Long memberships
//   if (totalSpent > 1000000) loyaltyScore += 20; // High value customer

//   // Membership type classification
//   let membershipType = 'new';
//   if (totalPeriods >= 5) membershipType = 'loyal';
//   else if (totalPeriods >= 3) membershipType = 'returning';
//   else if (totalPeriods === 2) membershipType = 'second_time';

//   return {
//     totalPeriods,
//     totalDays,
//     totalSpent,
//     averageDuration: Math.round(averageDuration),
//     gaps,
//     loyaltyScore: Math.min(100, loyaltyScore),
//     membershipType,
//     averageGapDays: gaps.length > 0 ? Math.round(totalGapDays / gaps.length) : 0
//   };
// }

// Create Member with Transaction (integrated)
// app.post('/api/members/with-transaction', authenticateToken, async (req, res) => {
//   try {
//     const { 
//       name, phone, email, membership_type, start_date, duration_months, notes,
//       packageId, paymentMethodId, amount 
//     } = req.body;

//     if (!name || !membership_type || !start_date || duration_months === undefined) {
//       return res.status(400).json({ error: 'Required member fields missing' });
//     }

//     if (!packageId || !paymentMethodId || !amount) {
//       return res.status(400).json({ error: 'Required payment fields missing' });
//     }

//     // Get package details
//     const membershipPackage = await prisma.membershipPackage.findUnique({
//       where: { id: parseInt(packageId) }
//     });

//     if (!membershipPackage) {
//       return res.status(404).json({ error: 'Package not found' });
//     }

//     const startDate = new Date(start_date);
//     const endDate = new Date(startDate);
    
//     // Handle Day Pass (duration_months = 0) - expires end of day
//     if (parseInt(duration_months) === 0) {
//       endDate.setHours(23, 59, 59, 999); // End of the same day
//     } else {
//       endDate.setMonth(endDate.getMonth() + parseInt(duration_months));
//     }

//     const result = await prisma.$transaction(async (tx) => {
//       // 1. Create member
//       const member = await tx.member.create({
//         data: {
//           name,
//           phone: phone || null,
//           email: email || null,
//           membershipType: membership_type,
//           startDate,
//           endDate,
//           notes: notes || null
//         }
//       });

//       // 2. Create transaction
//       const transaction = await tx.transaction.create({
//         data: {
//           memberId: member.id,
//           packageId: parseInt(packageId),
//           paymentMethodId: parseInt(paymentMethodId),
//           amount: parseFloat(amount),
//           packageName: membershipPackage.name,
//           packageDuration: membershipPackage.durationMonths,
//           notes: notes || `Initial membership - ${membership_type}`
//         }
//       });

//       // 3. Create membership period linked to transaction
//       const membershipPeriod = await tx.membershipPeriod.create({
//         data: {
//           memberId: member.id,
//           startDate,
//           endDate,
//           packageName: membership_type,
//           duration: parseInt(duration_months),
//           status: 'active',
//           transactionId: transaction.id
//         }
//       });

//       return { member, transaction, membershipPeriod };
//     });

//     res.status(201).json({ 
//       message: 'Member created with transaction successfully',
//       member: result.member,
//       transaction: result.transaction,
//       membershipPeriod: result.membershipPeriod
//     });
//   } catch (error) {
//     console.error('Create member with transaction error:', error);
//     res.status(500).json({ error: 'Failed to create member with transaction' });
//   }
// });

// Member History Routes
// app.get('/api/members/:id/history', authenticateToken, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const memberId = parseInt(id);

//     // Get membership periods
//     const membershipPeriods = await prisma.membershipPeriod.findMany({
//       where: { memberId },
//       include: { 
//         transaction: {
//           select: {
//             id: true,
//             amount: true,
//             transactionDate: true,
//             paymentMethod: { select: { name: true } }
//           }
//         }
//       },
//       orderBy: { startDate: 'desc' }
//     });

//     // Get member basic info
//     const member = await prisma.member.findUnique({
//       where: { id: memberId },
//       select: {
//         id: true,
//         name: true,
//         phone: true,
//         email: true,
//         createdAt: true
//       }
//     });

//     if (!member) {
//       return res.status(404).json({ error: 'Member not found' });
//     }

//     // Analyze patterns
//     const analytics = analyzeMembershipPattern(membershipPeriods);

//     // Update status for each period based on current date
//     const now = new Date();
//     const periodsWithStatus = membershipPeriods.map(period => ({
//       ...period,
//       status: new Date(period.endDate) < now ? 'expired' : 
//               new Date(period.startDate) > now ? 'future' : 'active'
//     }));

//     res.json({
//       member,
//       periods: periodsWithStatus,
//       analytics,
//       summary: {
//         memberSince: member.createdAt,
//         totalPeriods: analytics.totalPeriods,
//         totalDaysAsMember: analytics.totalDays,
//         totalSpent: analytics.totalSpent,
//         loyaltyScore: analytics.loyaltyScore,
//         membershipType: analytics.membershipType
//       }
//     });
//   } catch (error) {
//     console.error('Member history error:', error);
//     res.status(500).json({ error: 'Failed to fetch member history' });
//   }
// });

// Financial Reports Routes - MIGRATED TO routes/reports.js
// app.get('/api/reports/monthly', authenticateToken, async (req, res) => {
//   try {
//     const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;
//     
//     const startDate = new Date(year, month - 1, 1);
//     const endDate = new Date(year, month, 0, 23, 59, 59);

//     // Total revenue for the month
//     const monthlyRevenue = await prisma.transaction.aggregate({
//       where: {
//         transactionDate: {
//           gte: startDate,
//           lte: endDate
//         }
//       },
//       _sum: { amount: true },
//       _count: { id: true }
//     });

//     // Revenue by package type
//     const revenueByPackage = await prisma.transaction.groupBy({
//       by: ['packageName', 'packageDuration'],
//       where: {
//         transactionDate: {
//           gte: startDate,
//           lte: endDate
//         }
//       },
//       _sum: { amount: true },
//       _count: { id: true },
//       orderBy: { _sum: { amount: 'desc' } }
//     });

//     // Revenue by payment method
//     const revenueByPaymentMethod = await prisma.transaction.groupBy({
//       by: ['paymentMethodId'],
//       where: {
//         transactionDate: {
//           gte: startDate,
//           lte: endDate
//         }
//       },
//       _sum: { amount: true },
//       _count: { id: true },
//       orderBy: { _sum: { amount: 'desc' } }
//     });

//     // Get payment method names
//     const paymentMethodsData = await Promise.all(
//       revenueByPaymentMethod.map(async (item) => {
//         const paymentMethod = await prisma.paymentMethod.findUnique({
//           where: { id: item.paymentMethodId }
//         });
//         return {
//           ...item,
//           paymentMethodName: paymentMethod?.name || 'Unknown'
//         };
//       })
//     );

//     // New members this month
//     const newMembersCount = await prisma.member.count({
//       where: {
//         createdAt: {
//           gte: startDate,
//           lte: endDate
//         }
//       }
//     });

//     res.json({
//       period: `${year}-${month.toString().padStart(2, '0')}`,
//       totalRevenue: monthlyRevenue._sum.amount || 0,
//       totalTransactions: monthlyRevenue._count.id || 0,
//       newMembers: newMembersCount,
//       revenueByPackage: revenueByPackage.map(item => ({
//         packageName: item.packageName,
//         duration: item.packageDuration,
//         revenue: item._sum.amount || 0,
//         count: item._count.id || 0
//       })),
//       revenueByPaymentMethod: paymentMethodsData.map(item => ({
//         paymentMethod: item.paymentMethodName,
//         revenue: item._sum.amount || 0,
//         count: item._count.id || 0
//       }))
//     });
//   } catch (error) {
//     console.error('Monthly report error:', error);
//     res.status(500).json({ error: 'Failed to generate monthly report' });
//   }
// });

// app.get('/api/reports/revenue', authenticateToken, async (req, res) => {
//   try {
//     const { 
//       startDate, 
//       endDate, 
//       period = 'daily' // daily, weekly, monthly
//     } = req.query;

//     if (!startDate || !endDate) {
//       return res.status(400).json({ error: 'startDate and endDate are required' });
//     }

//     const start = new Date(startDate);
//     const end = new Date(endDate);

//     // Revenue data based on period
//     let groupBy = {};
//     if (period === 'daily') {
//       groupBy = {
//         by: ['transactionDate'],
//         where: {
//           transactionDate: {
//             gte: start,
//             lte: end
//           }
//         },
//         _sum: { amount: true },
//         _count: { id: true },
//         orderBy: { transactionDate: 'asc' }
//       };
//     }

//     const revenueData = await prisma.transaction.groupBy(groupBy);

//     // Total for the period
//     const totalRevenue = await prisma.transaction.aggregate({
//       where: {
//         transactionDate: {
//           gte: start,
//           lte: end
//         }
//       },
//       _sum: { amount: true },
//       _count: { id: true }
//     });

//     res.json({
//       period: { startDate, endDate },
//       totalRevenue: totalRevenue._sum.amount || 0,
//       totalTransactions: totalRevenue._count.id || 0,
//       revenueData: revenueData.map(item => ({
//         date: item.transactionDate,
//         revenue: item._sum.amount || 0,
//         count: item._count.id || 0
//       }))
//     });
//   } catch (error) {
//     console.error('Revenue report error:', error);
//     res.status(500).json({ error: 'Failed to generate revenue report' });
//   }
// });

// app.get('/api/reports/packages', authenticateToken, async (req, res) => {
//   try {
//     const { 
//       startDate, 
//       endDate,
//       limit = 10
//     } = req.query;

//     let whereClause = {};
//     if (startDate && endDate) {
//       whereClause.transactionDate = {
//         gte: new Date(startDate),
//         lte: new Date(endDate)
//       };
//     }

//     // Package performance
//     const packagePerformance = await prisma.transaction.groupBy({
//       by: ['packageId', 'packageName', 'packageDuration'],
//       where: whereClause,
//       _sum: { amount: true },
//       _count: { id: true },
//       orderBy: { _sum: { amount: 'desc' } },
//       take: parseInt(limit)
//     });

//     // Get package details
//     const packageData = await Promise.all(
//       packagePerformance.map(async (item) => {
//         const packageInfo = await prisma.membershipPackage.findUnique({
//           where: { id: item.packageId }
//         });
//         return {
//           packageId: item.packageId,
//           packageName: item.packageName,
//           duration: item.packageDuration,
//           currentPrice: packageInfo?.price || 0,
//           totalRevenue: item._sum.amount || 0,
//           totalSold: item._count.id || 0,
//           averagePrice: (item._count.id || 0) > 0 ? (item._sum.amount || 0) / (item._count.id || 0) : 0
//         };
//       })
//     );

//     res.json({
//       period: startDate && endDate ? { startDate, endDate } : 'all-time',
//       packages: packageData
//     });
//   } catch (error) {
//     console.error('Package report error:', error);
//     res.status(500).json({ error: 'Failed to generate package report' });
//   }
// });

// Dashboard Stats - MIGRATED TO routes/dashboard.js
// app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
//   try {
//     const now = new Date();
//     const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

//     const totalMembers = await prisma.member.count({ where: { isActive: true } });
//     const expiredMembers = await prisma.member.count({ 
//       where: { isActive: true, endDate: { lt: now } } 
//     });
//     const expiringSoon = await prisma.member.count({ 
//       where: { 
//         isActive: true, 
//         endDate: { gte: now, lte: sevenDaysFromNow } 
//       } 
//     });
//     const activeMembers = await prisma.member.count({ 
//       where: { isActive: true, endDate: { gt: now } } 
//     });

//     res.json({
//       totalMembers,
//       expiredMembers,
//       expiringSoon,
//       activeMembers
//     });
//   } catch (error) {
//     console.error('Dashboard stats error:', error);
//     res.status(500).json({ error: 'Failed to fetch dashboard stats' });
//   }
// });

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 API endpoint: http://localhost:${PORT}/api`);
  console.log(`🔐 Default login: admin / admin123`);
  console.log(`🌱 Run "npm run seed" to seed the database`);
});