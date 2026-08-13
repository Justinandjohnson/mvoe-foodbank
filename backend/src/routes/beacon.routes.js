// Beacon Routes — community food offers on the map.
//
// Anyone can read beacons (finding food must never require an account).
// Posting one is open too for the demo, but records the user id when a valid
// token is present so people can take their own beacon down later.
import beaconService from '../services/beacon.service.js';

export default async function beaconRoutes(fastify, options) {
  // GET /api/beacons/nearby?latitude=&longitude=&radius=&includeDemo=
  fastify.get('/nearby', async (request, reply) => {
    const { latitude, longitude, radius, includeDemo } = request.query;

    if (latitude == null || longitude == null) {
      return reply.code(400).send({
        success: false,
        error: 'latitude and longitude are required',
      });
    }

    const beacons = await beaconService.findNearby({
      latitude,
      longitude,
      radiusMiles: radius ? parseFloat(radius) : undefined,
      includeDemo: includeDemo !== 'false',
    });

    return reply.send({
      success: true,
      data: {
        beacons,
        count: beacons.length,
        realCount: beacons.filter((b) => !b.isDemo).length,
        demoCount: beacons.filter((b) => b.isDemo).length,
      },
    });
  });

  // POST /api/beacons — "I have food available here right now"
  fastify.post('/', async (request, reply) => {
    const body = request.body || {};
    const missing = ['title', 'latitude', 'longitude'].filter((k) => body[k] == null || body[k] === '');
    if (missing.length) {
      return reply.code(400).send({
        success: false,
        error: `Missing required field(s): ${missing.join(', ')}`,
      });
    }

    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return reply.code(400).send({ success: false, error: 'Invalid coordinates' });
    }

    // Optional auth: attribute the beacon when we can, never require it.
    let userId = null;
    try {
      const decoded = await request.jwtVerify();
      userId = decoded?.userId || decoded?.id || null;
    } catch {
      userId = null;
    }

    const beacon = await beaconService.create({ ...body, latitude: lat, longitude: lng, createdBy: userId });
    return reply.code(201).send({ success: true, data: { beacon } });
  });

  // GET /api/beacons/:id
  fastify.get('/:id', async (request, reply) => {
    const beacon = await beaconService.getById(request.params.id);
    if (!beacon) {
      return reply.code(404).send({ success: false, error: 'Beacon not found' });
    }
    return reply.send({ success: true, data: { beacon } });
  });

  // DELETE /api/beacons/:id — take your own beacon down
  fastify.delete('/:id', async (request, reply) => {
    let userId = null;
    try {
      const decoded = await request.jwtVerify();
      userId = decoded?.userId || decoded?.id || null;
    } catch {
      userId = null;
    }

    try {
      const beacon = await beaconService.deactivate(request.params.id, userId);
      if (!beacon) {
        return reply.code(404).send({ success: false, error: 'Beacon not found' });
      }
      return reply.send({ success: true, data: { beacon } });
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ success: false, error: err.message });
    }
  });
}
