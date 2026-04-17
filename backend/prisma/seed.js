// Database Seeding - Test data for development
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data
  console.log('Clearing existing data...');
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.volunteerShift.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.foodNeed.deleteMany();
  await prisma.foodBankStatus.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.donation.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  // Create test users
  console.log('Creating users...');
  const passwordHash = await bcrypt.hash('password123', 10);

  const donor1 = await prisma.user.create({
    data: {
      email: 'donor@example.com',
      passwordHash,
      fullName: 'John Donor',
      userType: 'donor',
      visibilityPreference: 'first_name',
      isVerified: true,
    },
  });

  const donor2 = await prisma.user.create({
    data: {
      email: 'jane@example.com',
      passwordHash,
      fullName: 'Jane Smith',
      userType: 'donor',
      visibilityPreference: 'full_name',
      isVerified: true,
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      passwordHash,
      fullName: 'Admin User',
      userType: 'admin',
      isVerified: true,
    },
  });

  // Create test organizations
  console.log('Creating organizations...');
  const foodBank1 = await prisma.organization.create({
    data: {
      name: 'Downtown Food Bank',
      type: 'food_bank',
      description: 'Serving the downtown community since 1985',
      address: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
      phone: '(555) 123-4567',
      email: 'info@downtownfoodbank.org',
      website: 'https://downtownfoodbank.org',
      verificationStatus: 'verified',
      isActive: true,
      stripeAccountId: 'acct_test123', // Test Stripe account
      latitude: 39.7817,
      longitude: -89.6501,
      hours: JSON.stringify({
        monday: '9:00 AM - 5:00 PM',
        tuesday: '9:00 AM - 5:00 PM',
        wednesday: '9:00 AM - 5:00 PM',
        thursday: '9:00 AM - 5:00 PM',
        friday: '9:00 AM - 5:00 PM',
        saturday: '10:00 AM - 2:00 PM',
        sunday: 'Closed',
      }),
    },
  });

  const foodBank2 = await prisma.organization.create({
    data: {
      name: 'Community Food Pantry',
      type: 'food_bank',
      description: 'Supporting families in need',
      address: '456 Oak Ave',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62702',
      phone: '(555) 987-6543',
      email: 'contact@communitypantry.org',
      verificationStatus: 'verified',
      isActive: true,
      stripeAccountId: 'acct_test456', // Test Stripe account
      latitude: 39.7989,
      longitude: -89.6443,
      hours: JSON.stringify({
        monday: '8:00 AM - 4:00 PM',
        tuesday: '8:00 AM - 4:00 PM',
        wednesday: '8:00 AM - 4:00 PM',
        thursday: '8:00 AM - 4:00 PM',
        friday: '8:00 AM - 4:00 PM',
        saturday: 'Closed',
        sunday: 'Closed',
      }),
    },
  });

  const church = await prisma.organization.create({
    data: {
      name: 'Grace Community Church',
      type: 'church',
      description: 'A welcoming community church',
      address: '789 Church Rd',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62703',
      phone: '(555) 456-7890',
      verificationStatus: 'verified',
      isActive: true,
    },
  });

  // Create test donations and ledger entries
  console.log('Creating donations and ledger entries...');

  // Donation 1
  const donation1 = await prisma.donation.create({
    data: {
      donorId: donor1.id,
      organizationId: foodBank1.id,
      amountCents: 5000, // $50.00
      stripChargeId: 'ch_test_1',
      stripePaymentIntent: 'pi_test_1',
      status: 'succeeded',
      isAnonymous: false,
      isRecurring: false,
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      donationId: donation1.id,
      organizationId: foodBank1.id,
      entryType: 'FUNDS_CAPTURED',
      amountCents: 5000,
      balanceCents: 5000,
      description: 'Donation received from John Donor',
    },
  });

  // Donation 2
  const donation2 = await prisma.donation.create({
    data: {
      donorId: donor2.id,
      organizationId: foodBank1.id,
      amountCents: 10000, // $100.00
      stripChargeId: 'ch_test_2',
      stripePaymentIntent: 'pi_test_2',
      status: 'succeeded',
      isAnonymous: false,
      isRecurring: false,
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      donationId: donation2.id,
      organizationId: foodBank1.id,
      entryType: 'FUNDS_CAPTURED',
      amountCents: 10000,
      balanceCents: 15000,
      description: 'Donation received from Jane Smith',
    },
  });

  // Donation 3 - Anonymous
  const donation3 = await prisma.donation.create({
    data: {
      donorId: null,
      organizationId: foodBank2.id,
      amountCents: 2500, // $25.00
      stripChargeId: 'ch_test_3',
      stripePaymentIntent: 'pi_test_3',
      status: 'succeeded',
      isAnonymous: true,
      isRecurring: false,
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      donationId: donation3.id,
      organizationId: foodBank2.id,
      entryType: 'FUNDS_CAPTURED',
      amountCents: 2500,
      balanceCents: 2500,
      description: 'Anonymous donation received',
    },
  });

  // Create expense entries
  await prisma.ledgerEntry.create({
    data: {
      organizationId: foodBank1.id,
      entryType: 'FUNDS_SPENT',
      amountCents: -8000,
      balanceCents: 7000,
      description: 'Bulk rice purchase from Costco',
      category: 'food',
      vendor: 'Costco',
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      organizationId: foodBank1.id,
      entryType: 'FUNDS_SPENT',
      amountCents: -1500,
      balanceCents: 5500,
      description: 'Gas for delivery van',
      category: 'delivery',
      vendor: 'Shell Gas Station',
    },
  });

  // Phase 2: Create food bank status
  console.log('Creating food bank status...');
  await prisma.foodBankStatus.create({
    data: {
      organizationId: foodBank1.id,
      waitTimeMinutes: 15,
      foodAvailable: 'available',
      capacityPercentage: 75,
      notes: 'Plenty of fresh produce available today',
      lastUpdated: new Date(),
      isStale: false,
    },
  });

  await prisma.foodBankStatus.create({
    data: {
      organizationId: foodBank2.id,
      waitTimeMinutes: 30,
      foodAvailable: 'low',
      capacityPercentage: 40,
      notes: 'Running low on canned goods',
      lastUpdated: new Date(),
      isStale: false,
    },
  });

  // Phase 2: Create food needs
  console.log('Creating food needs...');
  await prisma.foodNeed.create({
    data: {
      organizationId: foodBank1.id,
      itemName: 'Canned Vegetables',
      quantity: '100 cans',
      priority: 'high',
      description: 'Green beans, corn, peas preferred',
      isFulfilled: false,
    },
  });

  await prisma.foodNeed.create({
    data: {
      organizationId: foodBank1.id,
      itemName: 'Rice',
      quantity: '50 lbs',
      priority: 'medium',
      description: 'White or brown rice',
      isFulfilled: false,
    },
  });

  await prisma.foodNeed.create({
    data: {
      organizationId: foodBank2.id,
      itemName: 'Baby Formula',
      quantity: '20 containers',
      priority: 'urgent',
      description: 'Any brand',
      isFulfilled: false,
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log('\n📊 Created:');
  console.log(`  - 3 users (2 donors, 1 admin)`);
  console.log(`  - 3 organizations (2 food banks, 1 church)`);
  console.log(`  - 3 donations`);
  console.log(`  - 5 ledger entries`);
  console.log(`  - 2 food bank status entries`);
  console.log(`  - 3 food needs`);
  console.log('\n🔐 Test credentials:');
  console.log(`  Donor: donor@example.com / password123`);
  console.log(`  Admin: admin@example.com / password123`);
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
