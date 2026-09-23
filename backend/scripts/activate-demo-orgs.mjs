import process from 'node:process';

const API_BASE_URL = process.env.MVOE_API_URL || 'http://127.0.0.1:3100';
const ADMIN_EMAIL = process.env.MVOE_ADMIN_EMAIL || 'admin@mvoe-test.com';
const ADMIN_PASSWORD = process.env.MVOE_ADMIN_PASSWORD || 'TestAdmin123!';

const DEMO_ORGANIZATIONS = [
  {
    id: '1e4cb7dc-bf1c-4173-8b91-1da645493cdd',
    name: 'SF-Marin Food Bank',
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
    id: 'b846ff38-8974-40dc-a257-ac0f271f4010',
    name: 'Chicago Food Depository',
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
    id: '2ec91484-a8aa-4505-941b-e34cfcaeeea1',
    name: 'Houston Food Bank',
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
    id: '8ee39015-0e32-4cd9-bbba-46cc88702a1d',
    name: 'City Harvest NYC',
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
    id: '55d1871d-b7b3-4897-b94e-be076eef86ae',
    name: 'Atlanta Community Food Bank',
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

async function login() {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Admin login failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.data.accessToken;
}

async function activateOrganization(accessToken, organization) {
  const response = await fetch(`${API_BASE_URL}/api/organizations/${organization.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      verificationStatus: 'verified',
      isActive: true,
      latitude: organization.latitude,
      longitude: organization.longitude,
      hours: organization.hours,
    }),
  });

  if (!response.ok) {
    throw new Error(`${organization.name}: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  console.log(`Activating demo organizations via ${API_BASE_URL}`);
  const accessToken = await login();

  for (const organization of DEMO_ORGANIZATIONS) {
    await activateOrganization(accessToken, organization);
    console.log(`✓ ${organization.name}`);
  }

  console.log('Done. Demo organizations should now be list-visible for map/donor flows.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
