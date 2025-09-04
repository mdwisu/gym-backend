const express = require('express');
const authRoutes = require('./auth');
const memberRoutes = require('./members');
const packageRoutes = require('./packages');
const dashboardRoutes = require('./dashboard');
const paymentRoutes = require('./payment');
const publicRoutes = require('./public');
const transactionRoutes = require('./transactions');
const reportRoutes = require('./reports');

const router = express.Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/members', memberRoutes);  
router.use('/packages', packageRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/payment-methods', paymentRoutes);
router.use('/', publicRoutes);
router.use('/transactions', transactionRoutes);
router.use('/reports', reportRoutes);

module.exports = router;