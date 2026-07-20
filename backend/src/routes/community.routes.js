// Community Events Routes - Phase 3B
import { getPrismaClient } from '../utils/database.js';
import { actorOwnsRecord, buildActorLookup, optionalActor, requireActor } from '../middleware/actor.js';
import { validateBody } from '../middleware/validate.js';
import {
  createEventSchema,
  dietaryProfileSchema,
  mealPlanSchema,
  resourceOfferSchema,
  updateEventSchema,
  volunteerSignupSchema,
} from '../utils/validators.js';

const prisma = getPrismaClient();
const MAX_RESOURCE_OFFERS_PER_ACTOR_PER_EVENT = 5;

const EVENT_OWNER_FIELDS = {
  userField: 'organizerId',
  sessionField: 'organizerSessionId',
};

const VOLUNTEER_OWNER_FIELDS = {
  userField: 'volunteerId',
  sessionField: 'volunteerSessionId',
};

const RESOURCE_OWNER_FIELDS = {
  userField: 'providerId',
  sessionField: 'providerSessionId',
};

const DIETARY_OWNER_FIELDS = {
  userField: 'userId',
  sessionField: 'sessionId',
};

function serializeEventForActor(event, actor) {
  if (!event) return event;

  const { organizerSessionId, ...safeEvent } = event;
  const volunteers = Array.isArray(event.volunteers) ? event.volunteers : [];
  const resources = Array.isArray(event.resources) ? event.resources : [];
  const dietaryProfiles = Array.isArray(event.dietaryProfiles) ? event.dietaryProfiles : [];

  return {
    ...safeEvent,
    isOwnedByCurrentActor: actorOwnsRecord(actor, event, EVENT_OWNER_FIELDS),
    currentActorIsVolunteer: volunteers.some((volunteer) => actorOwnsRecord(actor, volunteer, VOLUNTEER_OWNER_FIELDS)),
    currentActorOfferedResource: resources.some((resource) => actorOwnsRecord(actor, resource, RESOURCE_OWNER_FIELDS)),
    volunteers: volunteers.map(({ volunteerSessionId, ...volunteer }) => volunteer),
    resources: resources.map(({ providerSessionId, ...resource }) => resource),
    dietaryProfiles: dietaryProfiles.map(({ sessionId, ...profile }) => profile),
  };
}

function serializeVolunteer(volunteer) {
  if (!volunteer) return volunteer;
  const { volunteerSessionId, ...safeVolunteer } = volunteer;
  return safeVolunteer;
}

function serializeResource(resource) {
  if (!resource) return resource;
  const { providerSessionId, ...safeResource } = resource;
  return safeResource;
}

function serializeDietaryProfile(profile) {
  if (!profile) return profile;
  const { sessionId, ...safeProfile } = profile;
  return safeProfile;
}

async function writeCommunityAudit(request, action, entityType, entityId, details = {}) {
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

function canPublicActorWriteEvent(actor, event) {
  return event?.isPublic || actorOwnsRecord(actor, event, EVENT_OWNER_FIELDS);
}

function getVolunteerLookup(eventId, actor) {
  if (actor?.userId) {
    return {
      eventId_volunteerId: {
        eventId,
        volunteerId: actor.userId,
      },
    };
  }

  if (actor?.sessionId) {
    return {
      eventId_volunteerSessionId: {
        eventId,
        volunteerSessionId: actor.sessionId,
      },
    };
  }

  return null;
}

function getResourceActorFilter(eventId, actor) {
  const lookup = buildActorLookup(actor, RESOURCE_OWNER_FIELDS);
  if (!lookup) return null;

  return {
    eventId,
    ...lookup,
  };
}

function getDietaryLookup(eventId, actor) {
  if (actor?.userId) {
    return {
      eventId_userId: {
        eventId,
        userId: actor.userId,
      },
    };
  }

  if (actor?.sessionId) {
    return {
      eventId_sessionId: {
        eventId,
        sessionId: actor.sessionId,
      },
    };
  }

  return null;
}

export default async function communityRoutes(fastify, options) {
  // Create new community event
  fastify.post('/community-events/create', {
    preHandler: [requireActor, validateBody(createEventSchema)],
  }, async (request, reply) => {
    try {
      const {
        eventName,
        eventType,
        description,
        eventDate,
        startTime,
        endTime,
        location,
        latitude,
        longitude,
        targetServings,
        budgetCents,
        isPublic,
        maxVolunteers,
      } = request.body;

      const event = await prisma.communityEvent.create({
        data: {
          organizerId: request.actor?.userId || null,
          organizerSessionId: request.actor?.sessionId || null,
          eventName,
          eventType,
          description,
          eventDate: new Date(eventDate),
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          location,
          latitude,
          longitude,
          targetServings,
          budgetCents,
          isPublic,
          maxVolunteers,
        },
        include: {
          volunteers: true,
          resources: true,
          mealPlan: true,
        },
      });

      await writeCommunityAudit(request, 'COMMUNITY_EVENT_CREATE', 'community_event', event.id, {
        eventType: event.eventType,
        isPublic: event.isPublic,
        targetServings: event.targetServings,
      });

      reply.code(201).send({
        success: true,
        message: 'Community event created successfully',
        data: { event: serializeEventForActor(event, request.actor) },
      });
    } catch (error) {
      console.error('Error creating community event:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to create community event',
        error: error.message,
      });
    }
  });

  // Get all public community events (with optional filters)
  fastify.get('/community-events', { preHandler: [optionalActor] }, async (request, reply) => {
    try {
      const {
        limit: rawLimit = 20,
        offset: rawOffset = 0,
        status = 'all',
        upcoming = false,
        organizerId,
      } = request.query;
      const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 20, 1), 100);
      const offset = Math.max(parseInt(rawOffset, 10) || 0, 0);

      const whereClause = {
        isPublic: true,
      };

      if (status !== 'all') {
        whereClause.status = status;
      }

      if (upcoming) {
        whereClause.eventDate = {
          gte: new Date(),
        };
      }

      if (organizerId) {
        whereClause.organizerId = organizerId;
      }

      const events = await prisma.communityEvent.findMany({
        where: whereClause,
        include: {
          volunteers: {
            select: {
              id: true,
              volunteerId: true,
              volunteerSessionId: true,
              volunteerType: true,
              status: true,
            },
          },
          resources: {
            select: {
              id: true,
              providerId: true,
              providerSessionId: true,
              resourceType: true,
              resourceName: true,
              status: true,
            },
          },
          mealPlan: true,
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
        take: limit,
        skip: offset,
      });

      const totalCount = await prisma.communityEvent.count({
        where: whereClause,
      });

      reply.send({
        success: true,
        data: {
          events: events.map((event) => serializeEventForActor(event, request.actor)),
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasMore: totalCount > offset + limit,
          },
        },
      });
    } catch (error) {
      console.error('Error fetching community events:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to fetch community events',
        error: error.message,
      });
    }
  });

  // Get specific event details
  fastify.get('/community-events/:id', { preHandler: [optionalActor] }, async (request, reply) => {
    try {
      const { id } = request.params;

      const event = await prisma.communityEvent.findUnique({
        where: { id },
        include: {
          volunteers: {
            select: {
              id: true,
              volunteerId: true,
              volunteerSessionId: true,
              volunteerType: true,
              capacityOffered: true,
              availableFrom: true,
              availableTo: true,
              specialSkills: true,
              status: true,
              createdAt: true,
            },
          },
          resources: {
            select: {
              id: true,
              providerId: true,
              providerSessionId: true,
              resourceType: true,
              resourceName: true,
              quantity: true,
              capacity: true,
              notes: true,
              status: true,
              createdAt: true,
            },
          },
          mealPlan: true,
          dietaryProfiles: {
            select: {
              userId: true,
              sessionId: true,
              allergies: true,
              dietaryRestrictions: true,
              preferences: true,
            },
          },
        },
      });

      if (!event) {
        return reply.code(404).send({
          success: false,
          message: 'Event not found',
        });
      }

      // Check if event is public or user is the organizer
      if (!event.isPublic && !actorOwnsRecord(request.actor, event, EVENT_OWNER_FIELDS)) {
        return reply.code(403).send({
          success: false,
          message: 'Access denied to private event',
        });
      }

      reply.send({
        success: true,
        data: { event: serializeEventForActor(event, request.actor) },
      });
    } catch (error) {
      console.error('Error fetching event details:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to fetch event details',
        error: error.message,
      });
    }
  });

  // Volunteer signup for event
  fastify.post('/community-events/:id/volunteers', {
    preHandler: [requireActor, validateBody(volunteerSignupSchema)],
  }, async (request, reply) => {
    try {
      const { id: eventId } = request.params;
      const {
        volunteerType,
        capacityOffered,
        availableFrom,
        availableTo,
        specialSkills,
        notes,
      } = request.body;

      // Check if event exists and is open for volunteers
      const event = await prisma.communityEvent.findUnique({
        where: { id: eventId },
        include: {
          volunteers: true,
        },
      });

      if (!event) {
        return reply.code(404).send({
          success: false,
          message: 'Event not found',
        });
      }

      if (event.status !== 'planned') {
        return reply.code(400).send({
          success: false,
          message: 'Event is not open for volunteer registration',
        });
      }

      if (!canPublicActorWriteEvent(request.actor, event)) {
        return reply.code(403).send({
          success: false,
          message: 'Access denied to private event',
        });
      }

      // Check if user already volunteered for this event
      const existingVolunteer = event.volunteers.find(
        (volunteer) => actorOwnsRecord(request.actor, volunteer, VOLUNTEER_OWNER_FIELDS)
      );

      if (existingVolunteer) {
        return reply.code(400).send({
          success: false,
          message: 'You have already signed up to volunteer for this event',
        });
      }

      // Check volunteer capacity limits
      if (event.maxVolunteers && event.volunteers.length >= event.maxVolunteers) {
        return reply.code(400).send({
          success: false,
          message: 'Event has reached maximum volunteer capacity',
        });
      }

      const volunteer = await prisma.eventVolunteer.create({
        data: {
          eventId,
          volunteerId: request.actor?.userId || null,
          volunteerSessionId: request.actor?.sessionId || null,
          volunteerType,
          capacityOffered,
          availableFrom: availableFrom ? new Date(availableFrom) : null,
          availableTo: availableTo ? new Date(availableTo) : null,
          specialSkills,
          notes,
        },
      });

      await writeCommunityAudit(request, 'COMMUNITY_EVENT_VOLUNTEER_SIGNUP', 'event_volunteer', volunteer.id, {
        eventId,
        volunteerType,
      });

      reply.code(201).send({
        success: true,
        message: 'Successfully signed up as volunteer',
        data: { volunteer: serializeVolunteer(volunteer) },
      });
    } catch (error) {
      console.error('Error signing up volunteer:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to sign up as volunteer',
        error: error.message,
      });
    }
  });

  fastify.delete('/community-events/:id/volunteers', {
    preHandler: [requireActor],
  }, async (request, reply) => {
    try {
      const { id: eventId } = request.params;
      const where = getVolunteerLookup(eventId, request.actor);

      if (!where) {
        return reply.code(400).send({
          success: false,
          message: 'Session identity missing for volunteer removal',
        });
      }

      const existingVolunteer = await prisma.eventVolunteer.findUnique({ where });

      if (!existingVolunteer) {
        return reply.code(404).send({
          success: false,
          message: 'You are not currently signed up for this event',
        });
      }

      await prisma.eventVolunteer.delete({ where });

      await writeCommunityAudit(request, 'COMMUNITY_EVENT_VOLUNTEER_REMOVE', 'event_volunteer', existingVolunteer.id, {
        eventId,
      });

      reply.send({
        success: true,
        message: 'Volunteer signup removed successfully',
      });
    } catch (error) {
      console.error('Error removing volunteer signup:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to remove volunteer signup',
        error: error.message,
      });
    }
  });

  // Offer resources for event
  fastify.post('/community-events/:id/resources', {
    preHandler: [requireActor, validateBody(resourceOfferSchema)],
  }, async (request, reply) => {
    try {
      const { id: eventId } = request.params;
      const {
        resourceType,
        resourceName,
        quantity,
        capacity,
        notes,
      } = request.body;

      // Check if event exists
      const event = await prisma.communityEvent.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        return reply.code(404).send({
          success: false,
          message: 'Event not found',
        });
      }

      if (event.status !== 'planned') {
        return reply.code(400).send({
          success: false,
          message: 'Event is not open for resource offers',
        });
      }

      if (!canPublicActorWriteEvent(request.actor, event)) {
        return reply.code(403).send({
          success: false,
          message: 'Access denied to private event',
        });
      }

      const actorResourceFilter = getResourceActorFilter(eventId, request.actor);
      if (!actorResourceFilter) {
        return reply.code(400).send({
          success: false,
          message: 'Session identity missing for resource offer',
        });
      }

      const existingResourceOfferCount = await prisma.eventResource.count({
        where: actorResourceFilter,
      });

      if (existingResourceOfferCount >= MAX_RESOURCE_OFFERS_PER_ACTOR_PER_EVENT) {
        return reply.code(429).send({
          success: false,
          message: 'Resource offer limit reached for this event',
        });
      }

      const resource = await prisma.eventResource.create({
        data: {
          eventId,
          providerId: request.actor?.userId || null,
          providerSessionId: request.actor?.sessionId || null,
          resourceType,
          resourceName,
          quantity,
          capacity,
          notes,
        },
      });

      await writeCommunityAudit(request, 'COMMUNITY_EVENT_RESOURCE_OFFER', 'event_resource', resource.id, {
        eventId,
        resourceType,
      });

      reply.code(201).send({
        success: true,
        message: 'Resource offer submitted successfully',
        data: { resource: serializeResource(resource) },
      });
    } catch (error) {
      console.error('Error offering resource:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to offer resource',
        error: error.message,
      });
    }
  });

  // Get nearby events (simplified - by city/state)
  fastify.get('/community-events/nearby', async (request, reply) => {
    try {
      const { city, state, radius = 25 } = request.query;

      if (!city && !state) {
        return reply.code(400).send({
          success: false,
          message: 'City or state required for nearby search',
        });
      }

      // Simplified location search - in production would use geographic queries
      const events = await prisma.communityEvent.findMany({
        where: {
          isPublic: true,
          status: 'planned',
          eventDate: {
            gte: new Date(),
          },
          location: {
            contains: city || state,
            mode: 'insensitive',
          },
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
        take: 20,
      });

      reply.send({
        success: true,
        data: { events },
      });
    } catch (error) {
      console.error('Error finding nearby events:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to find nearby events',
        error: error.message,
      });
    }
  });

  // Create/update meal plan for event
  fastify.post('/community-events/:id/meal-plan', {
    preHandler: [requireActor, validateBody(mealPlanSchema)],
  }, async (request, reply) => {
    try {
      const { id: eventId } = request.params;
      const {
        menuItems,
        shoppingList,
        nutritionAnalysis,
        allergenInfo,
        cookingTimeline,
        totalCostCents,
      } = request.body;

      // Check if user is event organizer
      const event = await prisma.communityEvent.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        return reply.code(404).send({
          success: false,
          message: 'Event not found',
        });
      }

      if (!actorOwnsRecord(request.actor, event, EVENT_OWNER_FIELDS)) {
        return reply.code(403).send({
          success: false,
          message: 'Only event organizer can create meal plans',
        });
      }

      const mealPlan = await prisma.eventMealPlan.upsert({
        where: { eventId },
        update: {
          menuItems,
          shoppingList,
          nutritionAnalysis,
          allergenInfo,
          cookingTimeline,
          totalCostCents,
        },
        create: {
          eventId,
          menuItems,
          shoppingList,
          nutritionAnalysis,
          allergenInfo,
          cookingTimeline,
          totalCostCents,
        },
      });

      await writeCommunityAudit(request, 'COMMUNITY_EVENT_MEAL_PLAN_UPSERT', 'event_meal_plan', mealPlan.id, {
        eventId,
      });

      reply.send({
        success: true,
        message: 'Meal plan saved successfully',
        data: { mealPlan },
      });
    } catch (error) {
      console.error('Error saving meal plan:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to save meal plan',
        error: error.message,
      });
    }
  });

  // Update user dietary profile for event
  fastify.post('/community-events/:id/dietary-profile', {
    preHandler: [requireActor, validateBody(dietaryProfileSchema)],
  }, async (request, reply) => {
    try {
      const { id: eventId } = request.params;
      const {
        allergies,
        dietaryRestrictions,
        preferences,
        notes,
      } = request.body;

      // Check if event exists
      const event = await prisma.communityEvent.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        return reply.code(404).send({
          success: false,
          message: 'Event not found',
        });
      }

      if (!canPublicActorWriteEvent(request.actor, event)) {
        return reply.code(403).send({
          success: false,
          message: 'Access denied to private event',
        });
      }

      const where = getDietaryLookup(eventId, request.actor);

      if (!where) {
        return reply.code(400).send({
          success: false,
          message: 'Session identity missing for dietary profile',
        });
      }

      const dietaryProfile = await prisma.eventDietaryProfile.upsert({
        where,
        update: {
          allergies,
          dietaryRestrictions,
          preferences,
          notes,
        },
        create: {
          eventId,
          userId: request.actor?.userId || null,
          sessionId: request.actor?.sessionId || null,
          allergies,
          dietaryRestrictions,
          preferences,
          notes,
        },
      });

      await writeCommunityAudit(request, 'COMMUNITY_EVENT_DIETARY_PROFILE_UPSERT', 'event_dietary_profile', dietaryProfile.id, {
        eventId,
      });

      reply.send({
        success: true,
        message: 'Dietary profile saved successfully',
        data: { dietaryProfile: serializeDietaryProfile(dietaryProfile) },
      });
    } catch (error) {
      console.error('Error saving dietary profile:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to save dietary profile',
        error: error.message,
      });
    }
  });

  // Update community event
  fastify.put('/community-events/:id', {
    preHandler: [requireActor, validateBody(updateEventSchema)],
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const {
        eventName,
        eventType,
        description,
        eventDate,
        startTime,
        endTime,
        location,
        latitude,
        longitude,
        targetServings,
        budgetCents,
        isPublic,
        maxVolunteers,
        status,
      } = request.body;

      // Check if event exists and user is organizer
      const existingEvent = await prisma.communityEvent.findUnique({
        where: { id },
      });

      if (!existingEvent) {
        return reply.code(404).send({
          success: false,
          message: 'Event not found',
        });
      }

      if (!actorOwnsRecord(request.actor, existingEvent, EVENT_OWNER_FIELDS)) {
        return reply.code(403).send({
          success: false,
          message: 'Only the event organizer can update this event',
        });
      }

      const event = await prisma.communityEvent.update({
        where: { id },
        data: {
          eventName,
          eventType,
          description,
          eventDate: eventDate ? new Date(eventDate) : undefined,
          startTime: startTime ? new Date(startTime) : undefined,
          endTime: endTime ? new Date(endTime) : undefined,
          location,
          latitude,
          longitude,
          targetServings,
          budgetCents,
          isPublic,
          maxVolunteers,
          status,
        },
        include: {
          volunteers: true,
          resources: true,
          mealPlan: true,
        },
      });

      await writeCommunityAudit(request, 'COMMUNITY_EVENT_UPDATE', 'community_event', event.id, {
        status: event.status,
        isPublic: event.isPublic,
      });

      reply.send({
        success: true,
        message: 'Event updated successfully',
        data: { event: serializeEventForActor(event, request.actor) },
      });
    } catch (error) {
      console.error('Error updating event:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to update event',
        error: error.message,
      });
    }
  });

  // Delete community event
  fastify.delete('/community-events/:id', {
    preHandler: [requireActor],
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      // Check if event exists and user is organizer
      const existingEvent = await prisma.communityEvent.findUnique({
        where: { id },
      });

      if (!existingEvent) {
        return reply.code(404).send({
          success: false,
          message: 'Event not found',
        });
      }

      if (!actorOwnsRecord(request.actor, existingEvent, EVENT_OWNER_FIELDS)) {
        return reply.code(403).send({
          success: false,
          message: 'Only the event organizer can delete this event',
        });
      }

      await prisma.communityEvent.delete({
        where: { id },
      });

      await writeCommunityAudit(request, 'COMMUNITY_EVENT_DELETE', 'community_event', id, {
        eventName: existingEvent.eventName,
      });

      reply.send({
        success: true,
        message: 'Event deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting event:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to delete event',
        error: error.message,
      });
    }
  });
}
