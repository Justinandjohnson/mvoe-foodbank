// seed.js - Seeds the Mvoe Food Bank database with real US city data
//
// NOTE: This script requires direct DATABASE_URL access (Prisma).
// The live Render database URL must be set in the DATABASE_URL environment variable.
//
// When running locally against the dev DB:
//   cd /Users/jjohnson/Downloads/Mvoe/backend && node scripts/seed.js
//
// When running against the Render production DB, set:
//   DATABASE_URL=<render_external_postgres_url> node scripts/seed.js
//
// IMPORTANT: The createOrganization API only accepts name/type/description/address/
// city/state/zipCode/phone/email/website — it does NOT accept latitude/longitude or
// verificationStatus. Those fields must be set directly via DB or admin API.
// Organizations created via /api/organizations start as verificationStatus='pending'
// and isActive=false, so they do NOT appear in /api/food-banks or /api/organizations
// list endpoints (both filter for verificationStatus='verified').
// Individual lookup via /api/food-banks/:id and /api/organizations/:id works for all.
//
// Seeded IDs (created 2026-04-17 against Render production):
//   SF-Marin Food Bank      : 1e4cb7dc-bf1c-4173-8b91-1da645493cdd
//   Chicago Food Depository : b846ff38-8974-40dc-a257-ac0f271f4010
//   Houston Food Bank       : 2ec91484-a8aa-4505-941b-e34cfcaeeea1
//   City Harvest NYC        : 8ee39015-0e32-4cd9-bbba-46cc88702a1d
//   Atlanta Community FB    : 55d1871d-b7b3-4897-b94e-be076eef86ae
//   donor@mvoe-test.com  / TestDonor123!
//   admin@mvoe-test.com  / TestAdmin123!

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const FOOD_BANKS = [
  {
    name: 'SF-Marin Food Bank',
    type: 'food_bank',
    description: 'Providing food to those in need across San Francisco and Marin counties.',
    address: '900 Pennsylvania Ave',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94107',
    phone: '415-282-1900',
    email: 'info@sfmfoodbank.org',
    website: 'https://www.sfmfoodbank.org',
    verificationStatus: 'verified',
    isActive: true,
    latitude: 37.7583,
    longitude: -122.3892,
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
  {
    name: 'Chicago Food Depository',
    type: 'food_bank',
    description: 'Greater Chicago Food Depository - connecting community organizations with food.',
    address: '4100 W Ann Lurie Pl',
    city: 'Chicago',
    state: 'IL',
    zipCode: '60632',
    phone: '773-247-3663',
    email: 'info@chicagosfoodbank.org',
    website: 'https://www.chicagosfoodbank.org',
    verificationStatus: 'verified',
    isActive: true,
    latitude: 41.8162,
    longitude: -87.7329,
    hours: JSON.stringify({
      monday: '8:30 AM - 4:30 PM',
      tuesday: '8:30 AM - 4:30 PM',
      wednesday: '8:30 AM - 4:30 PM',
      thursday: '8:30 AM - 4:30 PM',
      friday: '8:30 AM - 4:30 PM',
      saturday: 'Closed',
      sunday: 'Closed',
    }),
  },
  {
    name: 'Houston Food Bank',
    type: 'food_bank',
    description: 'Largest food bank in the US by volume — serving 18 counties in Southeast Texas.',
    address: '535 Portwall St',
    city: 'Houston',
    state: 'TX',
    zipCode: '77029',
    phone: '832-369-9390',
    email: 'volunteer@houstonfoodbank.org',
    website: 'https://www.houstonfoodbank.org',
    verificationStatus: 'verified',
    isActive: true,
    latitude: 29.7408,
    longitude: -95.2837,
    hours: JSON.stringify({
      monday: '7:00 AM - 5:00 PM',
      tuesday: '7:00 AM - 5:00 PM',
      wednesday: '7:00 AM - 5:00 PM',
      thursday: '7:00 AM - 5:00 PM',
      friday: '7:00 AM - 5:00 PM',
      saturday: '8:00 AM - 12:00 PM',
      sunday: 'Closed',
    }),
  },
  {
    name: 'City Harvest NYC',
    type: 'food_bank',
    description: 'New York City\'s largest food rescue organization rescuing excess food from all five boroughs.',
    address: '6 East 32nd Street',
    city: 'New York',
    state: 'NY',
    zipCode: '10016',
    phone: '646-412-0600',
    email: 'info@cityharvest.org',
    website: 'https://www.cityharvest.org',
    verificationStatus: 'verified',
    isActive: true,
    latitude: 40.7475,
    longitude: -73.9833,
    hours: JSON.stringify({
      monday: '9:00 AM - 6:00 PM',
      tuesday: '9:00 AM - 6:00 PM',
      wednesday: '9:00 AM - 6:00 PM',
      thursday: '9:00 AM - 6:00 PM',
      friday: '9:00 AM - 6:00 PM',
      saturday: 'Closed',
      sunday: 'Closed',
    }),
  },
  {
    name: 'Atlanta Community Food Bank',
    type: 'food_bank',
    description: 'Working to end hunger in 29 counties across metro Atlanta and north Georgia.',
    address: '3400 North Desert Dr NW',
    city: 'Atlanta',
    state: 'GA',
    zipCode: '30344',
    phone: '404-892-9822',
    email: 'info@acfb.org',
    website: 'https://www.acfb.org',
    verificationStatus: 'verified',
    isActive: true,
    latitude: 33.6916,
    longitude: -84.5119,
    hours: JSON.stringify({
      monday: '8:00 AM - 5:00 PM',
      tuesday: '8:00 AM - 5:00 PM',
      wednesday: '8:00 AM - 5:00 PM',
      thursday: '8:00 AM - 5:00 PM',
      friday: '8:00 AM - 5:00 PM',
      saturday: 'Closed',
      sunday: 'Closed',
    }),
  },
];

const FOOD_BANK_STATUSES = [
  { foodAvailable: 'available', waitTimeMinutes: 15, capacityPercentage: 60 },
  { foodAvailable: 'available', waitTimeMinutes: 30, capacityPercentage: 75 },
  { foodAvailable: 'low',       waitTimeMinutes: 10, capacityPercentage: 90 },
  { foodAvailable: 'available', waitTimeMinutes: 20, capacityPercentage: 50 },
  { foodAvailable: 'available', waitTimeMinutes: 25, capacityPercentage: 65 },
];

async function main() {
  console.log('Starting database seed...\n');

  // ── Clean existing seed data ──────────────────────────────────────────────
  console.log('Clearing existing seed data...');
  await prisma.foodBankStatus.deleteMany({});
  await prisma.organization.deleteMany({ where: { type: 'food_bank' } });
  await prisma.user.deleteMany({
    where: { email: { in: ['donor@mvoe-test.com', 'admin@mvoe-test.com'] } },
  });

  // ── Seed organizations ────────────────────────────────────────────────────
  console.log('Seeding 5 food bank organizations...');
  const createdOrgs = [];
  for (const orgData of FOOD_BANKS) {
    const org = await prisma.organization.create({ data: orgData });
    createdOrgs.push(org);
    console.log(`  Created: ${org.name} (${org.city}, ${org.state}) [${org.id}]`);
  }

  // ── Seed food bank statuses ───────────────────────────────────────────────
  console.log('\nSeeding food bank status records...');
  for (let i = 0; i < createdOrgs.length; i++) {
    const statusData = FOOD_BANK_STATUSES[i];
    await prisma.foodBankStatus.create({
      data: {
        organizationId: createdOrgs[i].id,
        ...statusData,
        notes: `Status last updated by seed script`,
        lastUpdated: new Date(),
        isStale: false,
      },
    });
    console.log(`  Status set for: ${createdOrgs[i].name} (${statusData.foodAvailable})`);
  }

  // ── Seed test users ───────────────────────────────────────────────────────
  console.log('\nSeeding 2 test users...');
  const saltRounds = 10;

  const donor = await prisma.user.create({
    data: {
      email: 'donor@mvoe-test.com',
      passwordHash: await bcrypt.hash('TestDonor123!', saltRounds),
      fullName: 'Test Donor',
      userType: 'donor',
      isVerified: true,
    },
  });
  console.log(`  Created donor: ${donor.email} [${donor.id}]`);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@mvoe-test.com',
      passwordHash: await bcrypt.hash('TestAdmin123!', saltRounds),
      fullName: 'Test Admin',
      userType: 'admin',
      isVerified: true,
    },
  });
  console.log(`  Created admin: ${admin.email} [${admin.id}]`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\nSeed complete!');
  console.log('─'.repeat(50));
  console.log(`Organizations created : ${createdOrgs.length}`);
  console.log(`Users created         : 2`);
  console.log('\nTest credentials:');
  console.log('  Donor : donor@mvoe-test.com  / TestDonor123!');
  console.log('  Admin : admin@mvoe-test.com  / TestAdmin123!');
  console.log('\nOrganization IDs (for test assertions):');
  for (const org of createdOrgs) {
    console.log(`  ${org.name.padEnd(35)} ${org.id}`);
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
