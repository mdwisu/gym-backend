const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  try {
    // 1. Seed Admin User
    console.log('👤 Seeding admin user...');
    const adminCount = await prisma.admin.count();
    
    if (adminCount === 0) {
      const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
      
      await prisma.admin.create({
        data: {
          username: process.env.ADMIN_USERNAME || 'admin',
          password: hashedPassword
        }
      });
      
      console.log('   ✅ Admin user created (username: admin, password: admin123)');
    } else {
      console.log('   ⏭️  Admin user already exists');
    }

    // 2. Seed Payment Methods
    console.log('💳 Seeding payment methods...');
    const paymentMethodCount = await prisma.paymentMethod.count();
    
    if (paymentMethodCount === 0) {
      const paymentMethods = [
        { name: 'Cash', isActive: true },
        { name: 'Transfer Bank', isActive: true },
        { name: 'E-Wallet (OVO/DANA/GoPay)', isActive: true },
        { name: 'Debit Card', isActive: true },
        { name: 'Credit Card', isActive: true }
      ];

      await prisma.paymentMethod.createMany({
        data: paymentMethods
      });
      
      console.log(`   ✅ ${paymentMethods.length} payment methods created`);
    } else {
      console.log('   ⏭️  Payment methods already exist');
    }

    // 3. Seed Membership Packages
    console.log('📦 Seeding membership packages...');
    const packageCount = await prisma.membershipPackage.count();
    
    if (packageCount === 0) {
      const packages = [
        {
          name: 'Day Pass',
          durationMonths: 0,
          price: 25000,
          description: 'Single day gym access - expires at end of day',
          isActive: true
        },
        {
          name: 'Bulanan',
          durationMonths: 1,
          price: 150000,
          description: 'Monthly membership - 30 days access',
          isActive: true
        },
        {
          name: '3 Bulan',
          durationMonths: 3,
          price: 400000,
          description: 'Quarterly membership - 90 days access',
          isActive: true
        },
        {
          name: '6 Bulan',
          durationMonths: 6,
          price: 750000,
          description: 'Semi-annual membership - 6 months access',
          isActive: true
        },
        {
          name: 'Tahunan',
          durationMonths: 12,
          price: 1400000,
          description: 'Annual membership - 12 months access with best value',
          isActive: true
        }
      ];

      await prisma.membershipPackage.createMany({
        data: packages
      });
      
      console.log(`   ✅ ${packages.length} membership packages created`);
      console.log('   📋 Packages: Day Pass, Bulanan, 3 Bulan, 6 Bulan, Tahunan');
    } else {
      console.log('   ⏭️  Membership packages already exist');
    }

    // 4. Seed Sample Members (Optional - for demo purposes)
    console.log('👥 Seeding sample members...');
    const memberCount = await prisma.member.count();
    
    if (memberCount === 0) {
      const dayPassPackage = await prisma.membershipPackage.findFirst({
        where: { name: 'Day Pass' }
      });
      
      const monthlyPackage = await prisma.membershipPackage.findFirst({
        where: { name: 'Bulanan' }
      });

      const cashPayment = await prisma.paymentMethod.findFirst({
        where: { name: 'Cash' }
      });

      if (dayPassPackage && monthlyPackage && cashPayment) {
        // Sample Day Pass member
        const today = new Date();
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        const dayPassMember = await prisma.member.create({
          data: {
            name: 'John Doe (Day Pass)',
            phone: '081234567890',
            email: 'john.daypass@example.com',
            membershipType: 'Day Pass',
            startDate: today,
            endDate: endOfDay,
            notes: 'Sample day pass member',
            isActive: true
          }
        });

        // Sample Monthly member
        const monthlyEndDate = new Date(today);
        monthlyEndDate.setMonth(monthlyEndDate.getMonth() + 1);

        const monthlyMember = await prisma.member.create({
          data: {
            name: 'Jane Smith (Monthly)',
            phone: '081234567891',
            email: 'jane.monthly@example.com',
            membershipType: 'Bulanan',
            startDate: today,
            endDate: monthlyEndDate,
            notes: 'Sample monthly member',
            isActive: true
          }
        });

        // Create sample transactions
        await prisma.transaction.createMany({
          data: [
            {
              memberId: dayPassMember.id,
              packageId: dayPassPackage.id,
              paymentMethodId: cashPayment.id,
              amount: dayPassPackage.price,
              packageName: dayPassPackage.name,
              packageDuration: dayPassPackage.durationMonths,
              notes: 'Sample day pass transaction'
            },
            {
              memberId: monthlyMember.id,
              packageId: monthlyPackage.id,
              paymentMethodId: cashPayment.id,
              amount: monthlyPackage.price,
              packageName: monthlyPackage.name,
              packageDuration: monthlyPackage.durationMonths,
              notes: 'Sample monthly membership transaction'
            }
          ]
        });

        console.log('   ✅ Sample members and transactions created');
      } else {
        console.log('   ⚠️  Required packages or payment methods not found, skipping sample members');
      }
    } else {
      console.log('   ⏭️  Members already exist');
    }

    console.log('🎉 Database seeding completed successfully!');
    console.log('\n📋 Seeded data summary:');
    console.log('   • Admin user (username: admin, password: admin123)');
    console.log('   • 5 Payment methods (Cash, Transfer, E-Wallet, etc.)');
    console.log('   • 5 Membership packages (Day Pass, Monthly, etc.)');
    console.log('   • Sample members and transactions (demo data)');

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('💥 Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('🔌 Database connection closed');
  });