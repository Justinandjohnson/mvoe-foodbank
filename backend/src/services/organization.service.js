// Organization Service - Manage food banks, churches, companies
import prisma from '../utils/database.js';
import cacheService from '../utils/redis.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

class OrganizationService {
  /**
   * Get all verified organizations
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} Organizations
   */
  async getOrganizations(filters = {}) {
    const { type, city, state, limit = 50, offset = 0 } = filters;

    // Check cache first
    const cacheKey = `organizations:${JSON.stringify(filters)}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const where = {
      verificationStatus: 'verified',
      isActive: true,
    };

    if (type) where.type = type;
    if (city) where.city = city;
    if (state) where.state = state;

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          city: true,
          state: true,
          zipCode: true,
          phone: true,
          website: true,
          createdAt: true,
        },
      }),
      prisma.organization.count({ where }),
    ]);

    const result = {
      organizations,
      total,
      limit,
      offset,
      hasMore: offset + organizations.length < total,
    };

    // Cache for 10 minutes
    await cacheService.set(cacheKey, result, 600);

    return result;
  }

  /**
   * Get organization by ID
   * @param {string} organizationId
   * @returns {Promise<Object>} Organization
   */
  async getOrganizationById(organizationId) {
    const cacheKey = `organization:${organizationId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        phone: true,
        email: true,
        website: true,
        verificationStatus: true,
        createdAt: true,
      },
    });

    if (!organization) {
      throw new NotFoundError('Organization');
    }

    // Cache for 10 minutes
    await cacheService.set(cacheKey, organization, 600);

    return organization;
  }

  /**
   * Create organization
   * @param {Object} organizationData
   * @returns {Promise<Object>} Created organization
   */
  async createOrganization(organizationData) {
    const { email, name } = organizationData;

    // Check if organization with same email exists
    if (email) {
      const existing = await prisma.organization.findFirst({
        where: { email },
      });

      if (existing) {
        throw new ConflictError('Organization with this email already exists');
      }
    }

    const organization = await prisma.organization.create({
      data: {
        ...organizationData,
        verificationStatus: 'pending',
        isActive: false,
      },
    });

    // Clear cache
    await cacheService.delPattern('organizations:*');

    return organization;
  }

  /**
   * Update organization
   * @param {string} organizationId
   * @param {Object} updateData
   * @returns {Promise<Object>} Updated organization
   */
  async updateOrganization(organizationId, updateData) {
    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: updateData,
    });

    // Clear cache
    await cacheService.del(`organization:${organizationId}`);
    await cacheService.delPattern('organizations:*');

    return organization;
  }

  /**
   * Get organization statistics
   * @param {string} organizationId
   * @returns {Promise<Object>} Statistics
   */
  async getStatistics(organizationId) {
    const [donationStats, ledgerStats] = await Promise.all([
      prisma.donation.aggregate({
        where: {
          organizationId,
          status: 'succeeded',
        },
        _sum: { amountCents: true },
        _count: true,
      }),
      prisma.ledgerEntry.aggregate({
        where: {
          organizationId,
          entryType: 'FUNDS_SPENT',
        },
        _sum: { amountCents: true },
        _count: true,
      }),
    ]);

    // Get current balance (last ledger entry)
    const lastEntry = await prisma.ledgerEntry.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { balanceCents: true },
    });

    return {
      totalRaised: donationStats._sum.amountCents || 0,
      totalDonations: donationStats._count,
      totalSpent: Math.abs(ledgerStats._sum.amountCents || 0),
      totalExpenses: ledgerStats._count,
      currentBalance: lastEntry?.balanceCents || 0,
    };
  }
}

export default new OrganizationService();
