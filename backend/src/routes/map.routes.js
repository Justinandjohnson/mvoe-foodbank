import { getPrismaClient } from '../utils/database.js';
import { authenticate, requireUserType } from '../middleware/authenticate.js';
import { buildActorLookup, optionalActor, requireActor } from '../middleware/actor.js';
import { validateBody } from '../middleware/validate.js';
import {
  toggleFoodBeaconSchema,
  upsertFoodBeaconSchema,
} from '../utils/validators.js';
import {
  buildBeaconMapItem,
  buildCommunityEventMapItem,
  buildFoodBankMapItem,
  getHoursVerificationState,
  withinRadius,
} from '../utils/liveMap.js';

const prisma = getPrismaClient();
const DEFAULT_MAP_RADIUS_MILES = 25;
const MAX_MAP_RADIUS_MILES = 100;
const MAX_MAP_SOURCE_RESULTS = 500;
const MAX_MAP_RESPONSE_ITEMS = 250;
const MAX_BEACON_LIST_LIMIT = 100;

function parseCoordinate(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoundedNumber(value, { defaultValue, min, max }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, min), max);
}

async function getActorBeacon(actor) {
  const lookup = buildActorLookup(actor, {
    userField: 'userId',
    sessionField: 'sessionId',
  });

  if (!lookup) return null;
  return prisma.foodBeacon.findUnique({ where: lookup });
}

async function writeMapAudit(request, action, entityType, entityId, details = {}) {
  await prisma.auditLog.create({
    data: {
      userId: request.actor?.userId || null,
      action,
      entityType,
      entityId,
      ipAddress: request.ip || null,
      userAgent: request.headers['user-agent'] || null,
      details: {
        ...details,
        actorType: request.actor?.actorType || 'unknown',
        sessionId: request.actor?.sessionId || null,
      },
    },
  });
}

export default async function mapRoutes(fastify) {
  fastify.get('/map/live', { preHandler: [optionalActor] }, async (request, reply) => {
    const referenceDate = new Date();
    const latitude = parseCoordinate(request.query.latitude);
    const longitude = parseCoordinate(request.query.longitude);
    const radiusMiles = parseBoundedNumber(request.query.radius, {
      defaultValue: DEFAULT_MAP_RADIUS_MILES,
      min: 1,
      max: MAX_MAP_RADIUS_MILES,
    });

    const [foodBanks, beacons, events, userBeacon] = await Promise.all([
      prisma.organization.findMany({
        where: {
          type: 'food_bank',
          isActive: true,
          verificationStatus: 'verified',
          latitude: { not: null },
          longitude: { not: null },
        },
        include: {
          status: true,
        },
        orderBy: { name: 'asc' },
        take: MAX_MAP_SOURCE_RESULTS,
      }),
      prisma.foodBeacon.findMany({
        where: {
          isActive: true,
          isPublic: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: MAX_MAP_SOURCE_RESULTS,
      }),
      prisma.communityEvent.findMany({
        where: {
          isPublic: true,
          status: { in: ['planned', 'active'] },
          eventDate: {
            gte: new Date(referenceDate.getTime() - (24 * 60 * 60 * 1000)),
          },
          latitude: { not: null },
          longitude: { not: null },
        },
        include: {
          _count: {
            select: {
              volunteers: true,
              resources: true,
            },
          },
        },
        orderBy: {
          eventDate: 'asc',
        },
        take: MAX_MAP_SOURCE_RESULTS,
      }),
      getActorBeacon(request.actor),
    ]);

    const mapFoodBanks = foodBanks
      .filter((item) => withinRadius(item, latitude, longitude, radiusMiles))
      .slice(0, MAX_MAP_RESPONSE_ITEMS)
      .map((item) => buildFoodBankMapItem(item, referenceDate));

    const mapBeacons = beacons
      .filter((item) => withinRadius(item, latitude, longitude, radiusMiles))
      .map((item) => buildBeaconMapItem(item, referenceDate))
      .filter((item) => item.isActive)
      .slice(0, MAX_MAP_RESPONSE_ITEMS);

    const mapEvents = events
      .filter((item) => withinRadius(item, latitude, longitude, radiusMiles))
      .slice(0, MAX_MAP_RESPONSE_ITEMS)
      .map((item) => buildCommunityEventMapItem(item, referenceDate));

    return reply.send({
      success: true,
      data: {
        foodBanks: mapFoodBanks,
        beacons: mapBeacons,
        events: mapEvents,
        userBeacon: userBeacon ? buildBeaconMapItem(userBeacon, referenceDate) : null,
        generatedAt: referenceDate.toISOString(),
      },
    });
  });

  fastify.get('/food-beacons', async (request, reply) => {
    const limit = parseBoundedNumber(request.query.limit, {
      defaultValue: 50,
      min: 1,
      max: MAX_BEACON_LIST_LIMIT,
    });

    const beacons = await prisma.foodBeacon.findMany({
      where: {
        isActive: true,
        isPublic: true,
        // A pin whose window has closed is worse than no pin — drop it from the
        // public map. A null window means a standing pantry, which never expires.
        OR: [
          { availableUntil: null },
          { availableUntil: { gt: new Date() } },
        ],
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: limit,
    });

    return reply.send({
      success: true,
      data: {
        beacons: beacons.map((item) => buildBeaconMapItem(item)),
      },
    });
  });

  fastify.get('/food-beacons/me', { preHandler: [requireActor] }, async (request, reply) => {
    const beacon = await getActorBeacon(request.actor);

    return reply.send({
      success: true,
      data: {
        beacon: beacon ? buildBeaconMapItem(beacon) : null,
      },
    });
  });

  fastify.put('/food-beacons/me', {
    preHandler: [requireActor, validateBody(upsertFoodBeaconSchema)],
  }, async (request, reply) => {
    const {
      title,
      description,
      locationLabel,
      latitude,
      longitude,
      quantityLevel,
      foodTypes,
      photoUrl,
      availableUntil,
      isActive,
      isPublic,
    } = request.body;

    const lookup = buildActorLookup(request.actor, {
      userField: 'userId',
      sessionField: 'sessionId',
    });
    const data = {
      userId: request.actor?.userId || null,
      sessionId: request.actor?.sessionId || null,
      title,
      description,
      locationLabel,
      latitude,
      longitude,
      quantityLevel,
      foodTypes,
      photoUrl: photoUrl || null,
      availableUntil: availableUntil ? new Date(availableUntil) : null,
      isActive,
      isPublic,
    };

    const beacon = await prisma.foodBeacon.upsert({
      where: lookup,
      create: data,
      update: data,
    });

    await writeMapAudit(request, 'FOOD_BEACON_UPSERT', 'food_beacon', beacon.id, {
      isActive: beacon.isActive,
      isPublic: beacon.isPublic,
      quantityLevel: beacon.quantityLevel,
    });

    return reply.send({
      success: true,
      message: 'Food beacon saved successfully',
      data: {
        beacon: buildBeaconMapItem(beacon),
      },
    });
  });

  fastify.post('/food-beacons/me/toggle', {
    preHandler: [requireActor, validateBody(toggleFoodBeaconSchema)],
  }, async (request, reply) => {
    const lookup = buildActorLookup(request.actor, {
      userField: 'userId',
      sessionField: 'sessionId',
    });
    const existingBeacon = await prisma.foodBeacon.findUnique({ where: lookup });

    if (!existingBeacon) {
      if (!request.body.isActive) {
        return reply.send({
          success: true,
          message: 'Food beacon already removed',
          data: {
            beacon: null,
          },
        });
      }

      return reply.code(404).send({
        success: false,
        message: 'Create a beacon before toggling it.',
      });
    }

    if (!request.body.isActive) {
      await prisma.foodBeacon.delete({ where: lookup });
      await writeMapAudit(request, 'FOOD_BEACON_DELETE', 'food_beacon', existingBeacon.id, {
        reason: 'toggle_off',
      });
      return reply.send({
        success: true,
        message: 'Food beacon removed',
        data: {
          beacon: null,
        },
      });
    }

    const beacon = await prisma.foodBeacon.update({
      where: lookup,
      data: {
        isActive: request.body.isActive,
      },
    });

    await writeMapAudit(request, 'FOOD_BEACON_TOGGLE', 'food_beacon', beacon.id, {
      isActive: beacon.isActive,
    });

    return reply.send({
      success: true,
      message: `Food beacon ${request.body.isActive ? 'enabled' : 'disabled'}`,
      data: {
        beacon: buildBeaconMapItem(beacon),
      },
    });
  });

  fastify.delete('/food-beacons/me', {
    preHandler: [requireActor],
  }, async (request, reply) => {
    const lookup = buildActorLookup(request.actor, {
      userField: 'userId',
      sessionField: 'sessionId',
    });

    const existingBeacon = await prisma.foodBeacon.findUnique({ where: lookup });
    if (!existingBeacon) {
      return reply.send({
        success: true,
        message: 'Food beacon already removed',
      });
    }

    await prisma.foodBeacon.delete({ where: lookup });
    await writeMapAudit(request, 'FOOD_BEACON_DELETE', 'food_beacon', existingBeacon.id, {
      reason: 'delete_endpoint',
    });

    return reply.send({
      success: true,
      message: 'Food beacon removed',
    });
  });

  fastify.get('/food-banks/hours-review-queue', {
    preHandler: [authenticate, requireUserType(['staff', 'admin'])],
  }, async (request, reply) => {
    const referenceDate = new Date();
    const organizations = await prisma.organization.findMany({
      where: {
        type: 'food_bank',
        isActive: true,
        verificationStatus: 'verified',
      },
      orderBy: {
        updatedAt: 'asc',
      },
    });

    const dueForReview = organizations
      .map((organization) => ({
        id: organization.id,
        name: organization.name,
        city: organization.city,
        state: organization.state,
        hours: organization.hours ? JSON.parse(organization.hours) : null,
        ...getHoursVerificationState(organization.updatedAt, referenceDate),
      }))
      .filter((organization) => organization.needsHoursVerification);

    return reply.send({
      success: true,
      data: {
        foodBanks: dueForReview,
        count: dueForReview.length,
      },
    });
  });

  fastify.post('/food-banks/:id/verify-hours', {
    preHandler: [authenticate, requireUserType(['staff', 'admin'])],
  }, async (request, reply) => {
    const { id } = request.params;
    const existing = await prisma.organization.findUnique({
      where: { id },
    });

    if (!existing || existing.type !== 'food_bank') {
      return reply.code(404).send({
        success: false,
        message: 'Food bank not found',
      });
    }

    const nextHours = typeof request.body?.hours === 'string' ? request.body.hours : existing.hours;

    const updatedOrganization = await prisma.organization.update({
      where: { id },
      data: {
        hours: nextHours,
      },
      include: {
        status: true,
      },
    });

    return reply.send({
      success: true,
      message: 'Food bank hours marked as verified',
      data: {
        foodBank: buildFoodBankMapItem(updatedOrganization),
      },
    });
  });
}
