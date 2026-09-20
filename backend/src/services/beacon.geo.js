// Pure geo + demo-pin helpers for beacons. No database, no I/O — so this can be
// unit-tested and reused by the food-bank routes for directions links.
export const EARTH_RADIUS_MILES = 3958.8;
export const DEFAULT_RADIUS_MILES = 15;
export const DEMO_COUNT = 6;
const DEMO_REFRESH_MS = 5 * 60 * 1000; // demo pins reshuffle every 5 minutes

const DEMO_TEMPLATES = [
  { title: 'Extra garden produce', foodType: 'produce', servings: 12,
    description: 'Tomatoes, squash and greens from our backyard. Bring a bag.' },
  { title: 'Sunday cookout leftovers', foodType: 'prepared', servings: 20,
    description: 'Trays of rice, beans and grilled chicken. Still hot.' },
  { title: 'Bakery end-of-day', foodType: 'bakery', servings: 30,
    description: 'Bread and pastries from close. First come, first served.' },
  { title: 'Pantry cleanout', foodType: 'pantry', servings: 15,
    description: 'Canned goods, pasta and rice. All well within date.' },
  { title: 'Restaurant surplus', foodType: 'prepared', servings: 25,
    description: 'Soup and sandwiches from a catering overrun.' },
  { title: 'Community fridge restock', foodType: 'produce', servings: 18,
    description: 'Fresh fruit and milk just dropped off.' },
  { title: 'Church supper extras', foodType: 'prepared', servings: 40,
    description: 'Casseroles and sides after Wednesday supper.' },
  { title: 'Farm share overflow', foodType: 'produce', servings: 22,
    description: 'CSA box we could not use. Root vegetables and apples.' },
];

const DEMO_NAMES = ['Marisol', 'Andre', 'Priya', 'Tomás', 'Fatima', 'Wes',
                    'Nia', 'Hector', 'Sam', 'Aisha'];

/** Deterministic PRNG so a given seed yields the same layout for every caller. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Google Maps directions deep link. Works on web, Android and iOS. */
export function directionsUrl(latitude, longitude, label) {
  const base = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  return label ? `${base}&destination_place_id=&travelmode=driving` : base;
}

export function milesBetween(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(a));
}

/** Attach distance, countdown and a directions link to any lat/lng record. */
export function decorate(b, origin) {
  const distance = origin
    ? Number(milesBetween(origin.latitude, origin.longitude, b.latitude, b.longitude).toFixed(2))
    : null;
  const minutesLeft = b.expiresAt
    ? Math.max(0, Math.round((new Date(b.expiresAt) - Date.now()) / 60000))
    : null;
  return {
    ...b,
    distanceMiles: distance,
    minutesRemaining: minutesLeft,
    directionsUrl: directionsUrl(b.latitude, b.longitude, b.title || b.name),
  };
}

/**
 * Synthetic beacons scattered around a point. Never persisted.
 *
 * An empty map teaches nobody anything — a first-time visitor should see the
 * mechanic working (people nearby post food, others navigate to it) instead of a
 * blank screen that reads as "nobody uses this". Always flagged isDemo:true.
 *
 * ponytail: seeded by a 5-minute time bucket rather than stored. The set is
 * stable for a few minutes then refreshes, which reads as activity. If demo pins
 * ever need to persist or be interacted with, they need real rows.
 */
export function demoBeacons(latitude, longitude, radiusMiles, count = DEMO_COUNT) {
  const bucket = Math.floor(Date.now() / DEMO_REFRESH_MS);
  const rand = seeded(
    Math.round((latitude + 90) * 1000) ^ Math.round((longitude + 180) * 1000) ^ bucket
  );
  const out = [];
  for (let i = 0; i < count; i++) {
    const tpl = DEMO_TEMPLATES[Math.floor(rand() * DEMO_TEMPLATES.length)];
    // Between 8% and 80% of the radius so pins never land on top of the user.
    const distance = radiusMiles * (0.08 + rand() * 0.72);
    const bearing = rand() * 2 * Math.PI;
    const dLat = (distance / 69) * Math.cos(bearing);
    const dLon = (distance / (69 * Math.cos((latitude * Math.PI) / 180))) * Math.sin(bearing);
    const minutes = 25 + Math.floor(rand() * 180);
    out.push({
      id: `demo-${bucket}-${i}`,
      title: tpl.title,
      description: tpl.description,
      foodType: tpl.foodType,
      servings: tpl.servings,
      latitude: Number((latitude + dLat).toFixed(6)),
      longitude: Number((longitude + dLon).toFixed(6)),
      address: null,
      contactName: DEMO_NAMES[Math.floor(rand() * DEMO_NAMES.length)],
      contactPhone: null,
      isActive: true,
      isDemo: true,
      expiresAt: new Date(Date.now() + minutes * 60000).toISOString(),
      createdAt: new Date(Date.now() - Math.floor(rand() * 90) * 60000).toISOString(),
    });
  }
  return out;
}
