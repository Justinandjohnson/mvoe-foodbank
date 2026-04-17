// Ledger Service - Public transparency ledger
import prisma, { transaction } from '../utils/database.js';
import cacheService from '../utils/redis.js';
import { NotFoundError } from '../utils/errors.js';

class LedgerService {
  /**
   * Get public ledger entries
   * @param {Object} filters
   * @returns {Promise<Object>} Paginated ledger entries
   */
  async getPublicLedger(filters = {}) {
    const {
      organizationId,
      entryType,
      category,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = filters;

    const where = {};

    if (organizationId) where.organizationId = organizationId;
    if (entryType) where.entryType = entryType;
    if (category) where.category = category;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
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
          donation: {
            select: {
              id: true,
              isAnonymous: true,
              donor: {
                select: {
                  fullName: true,
                  visibilityPreference: true,
                },
              },
            },
          },
        },
      }),
      prisma.ledgerEntry.count({ where }),
    ]);

    // Format donor names based on visibility
    const formattedEntries = entries.map((entry) => {
      let donorName = null;

      if (entry.donation?.isAnonymous === false && entry.donation.donor) {
        switch (entry.donation.donor.visibilityPreference) {
          case 'first_name':
            donorName = entry.donation.donor.fullName?.split(' ')[0];
            break;
          case 'anonymous':
            donorName = 'Anonymous';
            break;
          default:
            donorName = entry.donation.donor.fullName;
        }
      } else if (entry.donation) {
        donorName = 'Anonymous';
      }

      return {
        ...entry,
        donorName,
        donation: undefined, // Remove full donation object from response
      };
    });

    return {
      entries: formattedEntries,
      total,
      limit,
      offset,
      hasMore: offset + entries.length < total,
    };
  }

  /**
   * Create ledger entry (for expense logging)
   * @param {Object} entryData
   * @returns {Promise<Object>} Created ledger entry
   */
  async createLedgerEntry(entryData) {
    const { organizationId } = entryData;

    return transaction(async (tx) => {
      // Get previous balance
      const lastEntry = await tx.ledgerEntry.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: { balanceCents: true },
      });

      const previousBalance = lastEntry?.balanceCents || 0;

      // Calculate new balance (expenses are negative)
      const amountCents =
        entryData.entryType === 'FUNDS_SPENT'
          ? -Math.abs(entryData.amountCents)
          : entryData.amountCents;

      const newBalance = previousBalance + amountCents;

      // Create entry
      const entry = await tx.ledgerEntry.create({
        data: {
          ...entryData,
          amountCents,
          balanceCents: newBalance,
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'EXPENSE_LOG',
          entityType: 'ledger_entry',
          entityId: entry.id,
          details: {
            organizationId,
            amountCents,
            category: entry.category,
          },
        },
      });

      return entry;
    });
  }

  /**
   * Get ledger entry by ID
   * @param {string} entryId
   * @returns {Promise<Object>} Ledger entry
   */
  async getLedgerEntryById(entryId) {
    const entry = await prisma.ledgerEntry.findUnique({
      where: { id: entryId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!entry) {
      throw new NotFoundError('Ledger entry');
    }

    return entry;
  }

  /**
   * Get balance for organization
   * @param {string} organizationId
   * @returns {Promise<Object>} Balance info
   */
  async getBalance(organizationId) {
    const lastEntry = await prisma.ledgerEntry.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { balanceCents: true, createdAt: true },
    });

    return {
      balanceCents: lastEntry?.balanceCents || 0,
      lastUpdated: lastEntry?.createdAt || null,
    };
  }

  /**
   * Get spending breakdown by category
   * @param {string} organizationId
   * @param {Date} startDate
   * @param {Date} endDate
   * @returns {Promise<Object>} Category breakdown
   */
  async getSpendingBreakdown(organizationId, startDate = null, endDate = null) {
    const where = {
      organizationId,
      entryType: 'FUNDS_SPENT',
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const entries = await prisma.ledgerEntry.groupBy({
      by: ['category'],
      where,
      _sum: {
        amountCents: true,
      },
      _count: true,
    });

    return entries.map((entry) => ({
      category: entry.category || 'uncategorized',
      totalCents: Math.abs(entry._sum.amountCents || 0),
      count: entry._count,
    }));
  }
}

export default new LedgerService();
