const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function initializeDatabase() {
  try {
    // Check if admin exists
    const adminCount = await prisma.admin.count();
    
    if (adminCount === 0) {
      const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
      await prisma.admin.create({
        data: {
          username: process.env.ADMIN_USERNAME || 'admin',
          password: hashedPassword
        }
      });
      console.log('✅ Default admin user created');
    }

    // Check if membership packages exist
    const packageCount = await prisma.membershipPackage.count();
    
    if (packageCount === 0) {
      const packages = [
        { name: 'Bulanan', durationMonths: 1, price: 150000, description: 'Membership 1 bulan' },
        { name: '3 Bulan', durationMonths: 3, price: 400000, description: 'Membership 3 bulan' },
        { name: '6 Bulan', durationMonths: 6, price: 750000, description: 'Membership 6 bulan' },
        { name: 'Tahunan', durationMonths: 12, price: 1400000, description: 'Membership 1 tahun' }
      ];

      await prisma.membershipPackage.createMany({
        data: packages
      });
      console.log('✅ Default membership packages created');
    }
    
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

module.exports = { prisma, initializeDatabase };