// Donation Service - Handle donation processing and ledger entries
import Stripe from 'stripe';
import { config } from '../config/index.js';
import prisma, { transaction } from '../utils/database.js';
import {
  PaymentError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';

const stripe = new Stripe(config.stripeSecretKey);

class DonationService {
  /**
   * Create donation with Stripe payment
   * @param {Object} donationData - Donation details
   * @param {string} userId - User ID making donation
   * @returns {Promise<Object>} Created donation
   */
  async createDonation(donationData, userId) {
    const {
      organizationId,
      amountCents,
      isAnonymous,
      isRecurring,
      recurringInterval,
      paymentMethodId,
    } = donationData;

    // Verify organization exists and is verified
    const organization = await prisma.organization.findFirst({
      where: {
        id: organizationId,
        verificationStatus: 'verified',
        isActive: true,
      },
    });

    if (!organization) {
      throw new NotFoundError('Verified organization');
    }

    // Verify organization has Stripe Connect account
    if (!organization.stripeAccountId) {
      throw new ValidationError(
        'Organization has not set up payment processing'
      );
    }

    // Create Stripe PaymentIntent
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        payment_method: paymentMethodId,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        application_fee_amount: Math.floor(amountCents * 0.025), // 2.5% platform fee
        transfer_data: {
          destination: organization.stripeAccountId,
        },
        metadata: {
          organizationId,
          userId: isAnonymous ? 'anonymous' : userId,
          isRecurring: isRecurring.toString(),
        },
      });
    } catch (error) {
      throw new PaymentError(
        error.message || 'Payment processing failed',
        error
      );
    }

    // Create donation and ledger entry in transaction
    const result = await transaction(async (tx) => {
      // Create donation record
      const donation = await tx.donation.create({
        data: {
          donorId: isAnonymous ? null : userId,
          organizationId,
          amountCents,
          stripChargeId: paymentIntent.id,
          stripePaymentIntent: paymentIntent.id,
          status: paymentIntent.status,
          isAnonymous,
          isRecurring,
          recurringInterval,
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          donor: isAnonymous
            ? false
            : {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
        },
      });

      // Get previous balance
      const lastEntry = await tx.ledgerEntry.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: { balanceCents: true },
      });

      const previousBalance = lastEntry?.balanceCents || 0;
      const newBalance = previousBalance + amountCents;

      // Create ledger entry for funds captured
      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          donationId: donation.id,
          organizationId,
          entryType: 'FUNDS_CAPTURED',
          amountCents,
          balanceCents: newBalance,
          description: `Donation received ${
            isAnonymous ? 'anonymously' : `from ${donation.donor?.fullName}`
          }`,
          metadata: {
            stripePaymentIntent: paymentIntent.id,
            isRecurring,
          },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: isAnonymous ? null : userId,
          action: 'DONATION',
          entityType: 'donation',
          entityId: donation.id,
          details: {
            amountCents,
            organizationId,
            isAnonymous,
          },
        },
      });

      return { donation, ledgerEntry };
    });

    return result;
  }

  /**
   * Get donations with filters and pagination
   * @param {Object} filters - Query filters
   * @returns {Promise<Object>} Paginated donations
   */
  async getDonations(filters) {
    const {
      organizationId,
      status,
      startDate,
      endDate,
      limit,
      offset,
    } = filters;

    const where = {};

    if (organizationId) {
      where.organizationId = organizationId;
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [donations, total] = await Promise.all([
      prisma.donation.findMany({
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
          donor: {
            select: {
              id: true,
              fullName: true,
              visibilityPreference: true,
            },
          },
        },
      }),
      prisma.donation.count({ where }),
    ]);

    // Format donor names based on visibility preference
    const formattedDonations = donations.map((donation) => {
      if (donation.isAnonymous || !donation.donor) {
        return {
          ...donation,
          donor: null,
          donorName: 'Anonymous',
        };
      }

      let donorName;
      switch (donation.donor.visibilityPreference) {
        case 'first_name':
          donorName = donation.donor.fullName?.split(' ')[0] || 'Anonymous';
          break;
        case 'anonymous':
          donorName = 'Anonymous';
          break;
        default:
          donorName = donation.donor.fullName || 'Anonymous';
      }

      return {
        ...donation,
        donorName,
      };
    });

    return {
      donations: formattedDonations,
      total,
      limit,
      offset,
      hasMore: offset + donations.length < total,
    };
  }

  /**
   * Get single donation by ID
   * @param {string} donationId - Donation ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} Donation details
   */
  async getDonationById(donationId, userId) {
    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        donor: {
          select: {
            id: true,
            fullName: true,
            visibilityPreference: true,
          },
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!donation) {
      throw new NotFoundError('Donation');
    }

    // Only show donor details if user is the donor or admin
    if (donation.donorId !== userId && donation.donor) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { userType: true },
      });

      if (user?.userType !== 'admin') {
        donation.donor = null;
      }
    }

    return donation;
  }

  /**
   * Get donation statistics
   * @param {string} organizationId - Organization ID (optional)
   * @returns {Promise<Object>} Statistics
   */
  async getStatistics(organizationId = null) {
    const where = organizationId ? { organizationId } : {};

    const [totalDonations, stats] = await Promise.all([
      prisma.donation.count({
        where: {
          ...where,
          status: 'succeeded',
        },
      }),
      prisma.donation.aggregate({
        where: {
          ...where,
          status: 'succeeded',
        },
        _sum: {
          amountCents: true,
        },
      }),
    ]);

    // Calculate approximate meals provided (assuming $0.50 per meal)
    const mealsProvided = Math.floor((stats._sum.amountCents || 0) / 50);

    // Calculate approximate families served (assuming $5 per family)
    const familiesServed = Math.floor((stats._sum.amountCents || 0) / 500);

    return {
      totalRaised: stats._sum.amountCents || 0,
      totalDonations,
      mealsProvided,
      familiesServed,
      averageDonation: totalDonations > 0
        ? Math.floor((stats._sum.amountCents || 0) / totalDonations)
        : 0,
    };
  }

  /**
   * Process Stripe webhook
   * @param {Object} event - Stripe webhook event
   */
  async handleWebhook(event) {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this._handlePaymentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await this._handlePaymentFailed(event.data.object);
        break;

      case 'charge.refunded':
        await this._handleRefund(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  /**
   * Handle successful payment
   * @private
   */
  async _handlePaymentSucceeded(paymentIntent) {
    await prisma.donation.updateMany({
      where: {
        stripePaymentIntent: paymentIntent.id,
      },
      data: {
        status: 'succeeded',
      },
    });
  }

  /**
   * Handle failed payment
   * @private
   */
  async _handlePaymentFailed(paymentIntent) {
    await prisma.donation.updateMany({
      where: {
        stripePaymentIntent: paymentIntent.id,
      },
      data: {
        status: 'failed',
      },
    });
  }

  /**
   * Handle refund
   * @private
   */
  async _handleRefund(charge) {
    const donation = await prisma.donation.findFirst({
      where: {
        stripChargeId: charge.id,
      },
    });

    if (!donation) {
      return;
    }

    await transaction(async (tx) => {
      // Update donation status
      await tx.donation.update({
        where: { id: donation.id },
        data: { status: 'refunded' },
      });

      // Get previous balance
      const lastEntry = await tx.ledgerEntry.findFirst({
        where: { organizationId: donation.organizationId },
        orderBy: { createdAt: 'desc' },
        select: { balanceCents: true },
      });

      const previousBalance = lastEntry?.balanceCents || 0;
      const newBalance = previousBalance - donation.amountCents;

      // Create refund ledger entry
      await tx.ledgerEntry.create({
        data: {
          donationId: donation.id,
          organizationId: donation.organizationId,
          entryType: 'REFUND',
          amountCents: -donation.amountCents,
          balanceCents: newBalance,
          description: 'Donation refunded',
          metadata: {
            stripeChargeId: charge.id,
          },
        },
      });
    });
  }
}

export default new DonationService();
