// Community Events Routes - Phase 3B
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import { createEventSchema, volunteerSignupSchema, resourceOfferSchema } from '../utils/validators.js';

const prisma = new PrismaClient();

export default async function communityRoutes(fastify, options) {
  // Create new community event
  fastify.post('/community-events/create', {
    preHandler: [authenticate, validateBody(createEventSchema)],
  }, async (request, reply) => {
    try {
      const {
        eventName,
        description,
        eventDate,
        startTime,
        endTime,
        location,
        targetServings,
        budgetCents,
        isPublic,
        maxVolunteers,
      } = request.body;

      const event = await prisma.communityEvent.create({
        data: {
          organizerId: request.user.id,
          eventName,
          description,
          eventDate: new Date(eventDate),
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          location,
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

      reply.code(201).send({
        success: true,
        message: 'Community event created successfully',
        data: { event },
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
  fastify.get('/community-events', async (request, reply) => {
    try {
      const {
        limit = 20,
        offset = 0,
        status = 'all',
        upcoming = false,
        organizerId,
      } = request.query;

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
              volunteerType: true,
              status: true,
            },
          },
          resources: {
            select: {
              id: true,
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
        take: parseInt(limit),
        skip: parseInt(offset),
      });

      const totalCount = await prisma.communityEvent.count({
        where: whereClause,
      });

      reply.send({
        success: true,
        data: {
          events,
          pagination: {
            total: totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: totalCount > parseInt(offset) + parseInt(limit),
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
  fastify.get('/community-events/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const event = await prisma.communityEvent.findUnique({
        where: { id },
        include: {
          volunteers: {
            select: {
              id: true,
              volunteerId: true,
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
      if (!event.isPublic && (!request.user || request.user.id !== event.organizerId)) {
        return reply.code(403).send({
          success: false,
          message: 'Access denied to private event',
        });
      }

      reply.send({
        success: true,
        data: { event },
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
    preHandler: [authenticate, validateBody(volunteerSignupSchema)],
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

      // Check if user already volunteered for this event
      const existingVolunteer = event.volunteers.find(
        v => v.volunteerId === request.user.id
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
          volunteerId: request.user.id,
          volunteerType,
          capacityOffered,
          availableFrom: availableFrom ? new Date(availableFrom) : null,
          availableTo: availableTo ? new Date(availableTo) : null,
          specialSkills,
          notes,
        },
      });

      reply.code(201).send({
        success: true,
        message: 'Successfully signed up as volunteer',
        data: { volunteer },
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

  // Offer resources for event
  fastify.post('/community-events/:id/resources', {
    preHandler: [authenticate, validateBody(resourceOfferSchema)],
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

      const resource = await prisma.eventResource.create({
        data: {
          eventId,
          providerId: request.user.id,
          resourceType,
          resourceName,
          quantity,
          capacity,
          notes,
        },
      });

      reply.code(201).send({
        success: true,
        message: 'Resource offer submitted successfully',
        data: { resource },
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
    preHandler: [authenticate],
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

      if (event.organizerId !== request.user.id) {
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
    preHandler: [authenticate],
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

      const dietaryProfile = await prisma.eventDietaryProfile.upsert({
        where: {
          eventId_userId: {
            eventId,
            userId: request.user.id,
          },
        },
        update: {
          allergies,
          dietaryRestrictions,
          preferences,
          notes,
        },
        create: {
          eventId,
          userId: request.user.id,
          allergies,
          dietaryRestrictions,
          preferences,
          notes,
        },
      });

      reply.send({
        success: true,
        message: 'Dietary profile saved successfully',
        data: { dietaryProfile },
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
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const {
        eventName,
        description,
        eventDate,
        startTime,
        endTime,
        location,
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

      if (existingEvent.organizerId !== request.user.id) {
        return reply.code(403).send({
          success: false,
          message: 'Only the event organizer can update this event',
        });
      }

      const event = await prisma.communityEvent.update({
        where: { id },
        data: {
          eventName,
          description,
          eventDate: eventDate ? new Date(eventDate) : undefined,
          startTime: startTime ? new Date(startTime) : undefined,
          endTime: endTime ? new Date(endTime) : undefined,
          location,
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

      reply.send({
        success: true,
        message: 'Event updated successfully',
        data: { event },
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
    preHandler: [authenticate],
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

      if (existingEvent.organizerId !== request.user.id) {
        return reply.code(403).send({
          success: false,
          message: 'Only the event organizer can delete this event',
        });
      }

      await prisma.communityEvent.delete({
        where: { id },
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