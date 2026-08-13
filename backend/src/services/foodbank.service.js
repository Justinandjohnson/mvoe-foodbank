// Food Bank Service - Phase 2
import { getPrismaClient } from '../utils/database.js';
import { getRedisClient } from '../utils/redis.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { directionsUrl } from './beacon.geo.js';

const prisma = getPrismaClient();
const redis = getRedisClient();

class FoodBankService {
  /**
   * Find nearby food banks using geospatial query
   * @param {Object} params - Search parameters
   * @param {number} params.latitude - User latitude
   * @param {number} params.longitude - User longitude
   * @param {number} params.radiusMiles - Search radius in miles (default: 10)
   * @param {number} params.limit - Max results (default: 20)
   * @returns {Promise<Array>} List of nearby food banks with distance
   */
  async findNearby({ latitude, longitude, radiusMiles = 10, limit = 20 }) {
    if (!latitude || !longitude) {
      throw new ValidationError('Latitude and longitude are required');
    }

    // Haversine formula for distance calculation in PostgreSQL
    // Distance in miles = 3959 * acos(...)
    const foodBanks = await prisma.$queryRaw`
      SELECT
        o.*,
        s.wait_time_minutes,
        s.food_available,
        s.capacity_percentage,
        s.notes as status_notes,
        s.last_updated,
        s.is_stale,
        (
          3959 * acos(
            cos(radians(${latitude}))
            * cos(radians(o.latitude))
            * cos(radians(o.longitude) - radians(${longitude}))
            + sin(radians(${latitude}))
            * sin(radians(o.latitude))
          )
        ) AS distance
      FROM organizations o
      LEFT JOIN food_bank_status s ON o.id = s.organization_id
      WHERE
        o.type = 'food_bank'
        AND o.is_active = true
        AND o.verification_status = 'verified'
        AND o.latitude IS NOT NULL
        AND o.longitude IS NOT NULL
        AND (
          3959 * acos(
            cos(radians(${latitude}))
            * cos(radians(o.latitude))
            * cos(radians(o.longitude) - radians(${longitude}))
            + sin(radians(${latitude}))
            * sin(radians(o.latitude))
          )
        ) < ${radiusMiles}
      ORDER BY distance
      LIMIT ${limit}
    `;

    return foodBanks.map((fb) => ({
      ...fb,
      distance: parseFloat(fb.distance.toFixed(2)),
      hours: fb.hours ? JSON.parse(fb.hours) : null,
      // One-tap navigation. Coordinates beat a name search: a text query can
      // resolve to the wrong branch, a lat/lng cannot.
      directionsUrl: fb.latitude != null && fb.longitude != null
        ? directionsUrl(fb.latitude, fb.longitude, fb.name)
        : null,
    }));
  }

  /**
   * Get food bank status by ID
   * @param {string} organizationId
   * @returns {Promise<Object>} Food bank with current status
   */
  async getStatus(organizationId) {
    const foodBank = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        status: true,
        foodNeeds: {
          where: { isFulfilled: false },
          orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!foodBank) {
      throw new NotFoundError('Food bank not found');
    }

    return {
      ...foodBank,
      hours: foodBank.hours ? JSON.parse(foodBank.hours) : null,
    };
  }

  /**
   * Update food bank status (staff only)
   * @param {string} organizationId
   * @param {Object} statusData
   * @param {string} userId - Staff user ID
   * @returns {Promise<Object>} Updated status
   */
  async updateStatus(organizationId, statusData, userId) {
    const { waitTimeMinutes, foodAvailable, capacityPercentage, notes } = statusData;

    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundError('Food bank not found');
    }

    // Upsert status (create if doesn't exist, update if it does)
    const status = await prisma.foodBankStatus.upsert({
      where: { organizationId },
      create: {
        organizationId,
        waitTimeMinutes,
        foodAvailable,
        capacityPercentage,
        notes,
        updatedBy: userId,
        lastUpdated: new Date(),
        isStale: false,
      },
      update: {
        waitTimeMinutes,
        foodAvailable,
        capacityPercentage,
        notes,
        updatedBy: userId,
        lastUpdated: new Date(),
        isStale: false,
      },
    });

    // Invalidate cache
    await redis.del(`foodbank:status:${organizationId}`);

    logger.info(`Food bank status updated: ${organizationId}`);
    return status;
  }

  /**
   * Mark stale status entries (auto-expire after 2 hours)
   * Should be run periodically via cron job
   */
  async markStaleStatus() {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const result = await prisma.foodBankStatus.updateMany({
      where: {
        lastUpdated: { lt: twoHoursAgo },
        isStale: false,
      },
      data: {
        isStale: true,
      },
    });

    logger.info(`Marked ${result.count} food bank statuses as stale`);
    return result;
  }

  /**
   * Get all food banks (with optional filters)
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} List of food banks
   */
  async getAll(filters = {}) {
    const { city, state, type = 'food_bank', limit = 50, offset = 0 } = filters;

    const where = {
      type,
      isActive: true,
      verificationStatus: 'verified',
      ...(city && { city }),
      ...(state && { state }),
    };

    const foodBanks = await prisma.organization.findMany({
      where,
      include: {
        status: true,
        foodNeeds: {
          where: { isFulfilled: false },
          orderBy: { priority: 'asc' },
          take: 5,
        },
      },
      take: limit,
      skip: offset,
      orderBy: { name: 'asc' },
    });

    return foodBanks.map((fb) => ({
      ...fb,
      hours: fb.hours ? JSON.parse(fb.hours) : null,
      directionsUrl: fb.latitude != null && fb.longitude != null
        ? directionsUrl(fb.latitude, fb.longitude, fb.name)
        : null,
    }));
  }
}

export default new FoodBankService();
