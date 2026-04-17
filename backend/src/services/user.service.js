// User Service - User profile management
import prisma from '../utils/database.js';
import cacheService from '../utils/redis.js';
import { NotFoundError } from '../utils/errors.js';

class UserService {
  /**
   * Get user profile
   * @param {string} userId
   * @returns {Promise<Object>} User profile
   */
  async getUserProfile(userId) {
    const cacheKey = `user:${userId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        userType: true,
        visibilityPreference: true,
        isVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Cache for 5 minutes
    await cacheService.set(cacheKey, user, 300);

    return user;
  }

  /**
   * Update user profile
   * @param {string} userId
   * @param {Object} updateData
   * @returns {Promise<Object>} Updated user
   */
  async updateUserProfile(userId, updateData) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        userType: true,
        visibilityPreference: true,
        isVerified: true,
        updatedAt: true,
      },
    });

    // Clear cache
    await cacheService.del(`user:${userId}`);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'USER_UPDATE',
        entityType: 'user',
        entityId: userId,
        details: updateData,
      },
    });

    return user;
  }

  /**
   * Get user donation history
   * @param {string} userId
   * @param {Object} filters
   * @returns {Promise<Object>} Donation history
   */
  async getUserDonations(userId, filters = {}) {
    const { limit = 20, offset = 0 } = filters;

    const [donations, total] = await Promise.all([
      prisma.donation.findMany({
        where: {
          donorId: userId,
          status: 'succeeded',
        },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      }),
      prisma.donation.count({
        where: {
          donorId: userId,
          status: 'succeeded',
        },
      }),
    ]);

    const totalAmount = await prisma.donation.aggregate({
      where: {
        donorId: userId,
        status: 'succeeded',
      },
      _sum: {
        amountCents: true,
      },
    });

    return {
      donations,
      total,
      totalAmountCents: totalAmount._sum.amountCents || 0,
      limit,
      offset,
      hasMore: offset + donations.length < total,
    };
  }

  /**
   * Get user statistics
   * @param {string} userId
   * @returns {Promise<Object>} User stats
   */
  async getUserStatistics(userId) {
    const [donationStats, firstDonation] = await Promise.all([
      prisma.donation.aggregate({
        where: {
          donorId: userId,
          status: 'succeeded',
        },
        _sum: { amountCents: true },
        _count: true,
      }),
      prisma.donation.findFirst({
        where: {
          donorId: userId,
          status: 'succeeded',
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      totalDonated: donationStats._sum.amountCents || 0,
      donationCount: donationStats._count,
      memberSince: firstDonation?.createdAt || null,
      averageDonation:
        donationStats._count > 0
          ? Math.floor((donationStats._sum.amountCents || 0) / donationStats._count)
          : 0,
    };
  }

  /**
   * Delete user account
   * @param {string} userId
   */
  async deleteUser(userId) {
    // Anonymize donations instead of deleting
    await prisma.donation.updateMany({
      where: { donorId: userId },
      data: {
        donorId: null,
        isAnonymous: true,
      },
    });

    // Delete user
    await prisma.user.delete({
      where: { id: userId },
    });

    // Clear cache
    await cacheService.del(`user:${userId}`);

    return { success: true };
  }
}

export default new UserService();
