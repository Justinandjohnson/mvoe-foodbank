// Beacon Service — live "I have food right now" pins.
//
// findNearby() returns two kinds:
//   real  — rows in the beacons table, created by actual people
//   demo  — synthetic pins around the query point, never persisted, isDemo:true
//
// Pure geo/demo helpers live in beacon.geo.js so they can be tested without a DB.
import { getPrismaClient } from '../utils/database.js';
import {
  DEFAULT_RADIUS_MILES,
  DEMO_COUNT,
  decorate,
  demoBeacons,
  directionsUrl,
  milesBetween,
} from './beacon.geo.js';

const beaconService = {
  async create(data) {
    const hours = Number(data.durationHours) > 0 ? Number(data.durationHours) : 4;
    const beacon = await getPrismaClient().beacon.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        foodType: data.foodType ?? 'other',
        servings: data.servings != null ? Number(data.servings) : null,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        address: data.address ?? null,
        contactName: data.contactName ?? null,
        contactPhone: data.contactPhone ?? null,
        createdBy: data.createdBy ?? null,
        expiresAt: new Date(Date.now() + hours * 3600 * 1000),
      },
    });
    return decorate({ ...beacon, isDemo: false }, null);
  },

  /** Active beacons near a point: real rows first, then demo pins to fill in. */
  async findNearby({ latitude, longitude, radiusMiles = DEFAULT_RADIUS_MILES, includeDemo = true }) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const radius = Number(radiusMiles) || DEFAULT_RADIUS_MILES;

    // Bounding box first so the DB does the coarse filter, then exact distance.
    const latDelta = radius / 69;
    const lngDelta = radius / (69 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));

    const rows = await getPrismaClient().beacon.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: new Date() },
        latitude: { gte: lat - latDelta, lte: lat + latDelta },
        longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const origin = { latitude: lat, longitude: lng };
    const real = rows
      .map((b) => decorate({ ...b, isDemo: false }, origin))
      .filter((b) => b.distanceMiles <= radius);

    // Only pad up to DEMO_COUNT total so real activity displaces the examples
    // as the platform fills up.
    const padding = includeDemo ? Math.max(0, DEMO_COUNT - real.length) : 0;
    const demo = padding
      ? demoBeacons(lat, lng, radius, padding).map((b) => decorate(b, origin))
      : [];

    return [...real, ...demo].sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
  },

  async getById(id) {
    if (String(id).startsWith('demo-')) return null;
    const b = await getPrismaClient().beacon.findUnique({ where: { id } });
    return b ? decorate({ ...b, isDemo: false }, null) : null;
  },

  async deactivate(id, userId) {
    const b = await getPrismaClient().beacon.findUnique({ where: { id } });
    if (!b) return null;
    if (b.createdBy && userId && b.createdBy !== userId) {
      const err = new Error('Not your beacon');
      err.statusCode = 403;
      throw err;
    }
    const updated = await getPrismaClient().beacon.update({ where: { id }, data: { isActive: false } });
    return decorate({ ...updated, isDemo: false }, null);
  },

  /** Housekeeping: flip expired rows inactive. Safe to call on a timer. */
  async expireStale() {
    const { count } = await getPrismaClient().beacon.updateMany({
      where: { isActive: true, expiresAt: { lte: new Date() } },
      data: { isActive: false },
    });
    return count;
  },
};

export default beaconService;
export { directionsUrl, demoBeacons, milesBetween };
