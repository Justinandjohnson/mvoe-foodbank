// Reports Routes - CSV Export and Monthly Reports for Transparency
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { createObjectCsvStringifier } from 'csv-writer';

const prisma = new PrismaClient();

export default async function reportsRoutes(fastify, options) {
  // Export donations CSV for organization
  fastify.get('/reports/donations/csv/:organizationId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { organizationId } = request.params;
      const { startDate, endDate } = request.query;

      // Check if user has access to organization data
      if (request.user.organizationId !== organizationId && request.user.userType !== 'admin') {
        return reply.code(403).send({
          success: false,
          message: 'Access denied to organization data',
        });
      }

      const whereClause = { organizationId };

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = new Date(startDate);
        if (endDate) whereClause.createdAt.lte = new Date(endDate);
      }

      const donations = await prisma.donation.findMany({
        where: whereClause,
        include: {
          donor: {
            select: {
              id: true,
              fullName: true,
              email: true,
              visibilityPreference: true,
            },
          },
          organization: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Format data for CSV
      const csvData = donations.map(donation => {
        // Respect donor privacy preferences
        let donorName = 'Anonymous';
        let donorEmail = '';

        if (!donation.isAnonymous && donation.donor) {
          switch (donation.donor.visibilityPreference) {
            case 'full_name':
              donorName = donation.donor.fullName || 'Anonymous';
              donorEmail = donation.donor.email;
              break;
            case 'first_name':
              donorName = donation.donor.fullName ?
                donation.donor.fullName.split(' ')[0] + ' [Last name hidden]' :
                'Anonymous';
              break;
            case 'anonymous':
            default:
              donorName = 'Anonymous';
              break;
          }
        }

        return {
          'Donation ID': donation.id,
          'Date': donation.createdAt.toISOString().split('T')[0],
          'Time': donation.createdAt.toTimeString().split(' ')[0],
          'Amount ($)': (donation.amountCents / 100).toFixed(2),
          'Donor Name': donorName,
          'Donor Email': donorEmail,
          'Organization': donation.organization.name,
          'Status': donation.status,
          'Recurring': donation.isRecurring ? 'Yes' : 'No',
          'Recurring Interval': donation.recurringInterval || '',
          'Stripe Charge ID': donation.stripChargeId,
          'Tax Receipt Sent': donation.taxReceiptSent ? 'Yes' : 'No',
        };
      });

      // Create CSV
      const csvStringifier = createObjectCsvStringifier({
        header: [
          { id: 'Donation ID', title: 'Donation ID' },
          { id: 'Date', title: 'Date' },
          { id: 'Time', title: 'Time' },
          { id: 'Amount ($)', title: 'Amount ($)' },
          { id: 'Donor Name', title: 'Donor Name' },
          { id: 'Donor Email', title: 'Donor Email' },
          { id: 'Organization', title: 'Organization' },
          { id: 'Status', title: 'Status' },
          { id: 'Recurring', title: 'Recurring' },
          { id: 'Recurring Interval', title: 'Recurring Interval' },
          { id: 'Stripe Charge ID', title: 'Stripe Charge ID' },
          { id: 'Tax Receipt Sent', title: 'Tax Receipt Sent' },
        ],
      });

      const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(csvData);

      // Set headers for CSV download
      const filename = `donations-${organizationId}-${new Date().toISOString().split('T')[0]}.csv`;
      reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csvContent);

    } catch (error) {
      console.error('Error exporting donations CSV:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to export donations CSV',
        error: error.message,
      });
    }
  });

  // Export expenses CSV for organization
  fastify.get('/reports/expenses/csv/:organizationId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { organizationId } = request.params;
      const { startDate, endDate } = request.query;

      // Check if user has access to organization data
      if (request.user.organizationId !== organizationId && request.user.userType !== 'admin') {
        return reply.code(403).send({
          success: false,
          message: 'Access denied to organization data',
        });
      }

      const whereClause = {
        organizationId,
        entryType: 'FUNDS_SPENT'
      };

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = new Date(startDate);
        if (endDate) whereClause.createdAt.lte = new Date(endDate);
      }

      const expenses = await prisma.ledgerEntry.findMany({
        where: whereClause,
        include: {
          organization: {
            select: {
              name: true,
            },
          },
          detailedExpenses: {
            include: {
              category: {
                select: {
                  name: true,
                  description: true,
                },
              },
            },
          },
          receiptPhotos: {
            select: {
              id: true,
              photoUrl: true,
              vendor: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Format data for CSV
      const csvData = expenses.map(expense => ({
        'Expense ID': expense.id,
        'Date': expense.createdAt.toISOString().split('T')[0],
        'Time': expense.createdAt.toTimeString().split(' ')[0],
        'Amount ($)': (Math.abs(expense.amountCents) / 100).toFixed(2),
        'Balance After ($)': (expense.balanceCents / 100).toFixed(2),
        'Description': expense.description || '',
        'Category': expense.category || '',
        'Vendor': expense.vendor || '',
        'Organization': expense.organization.name,
        'Receipt URL': expense.receiptUrl || '',
        'Has Receipt Photo': expense.receiptPhotos.length > 0 ? 'Yes' : 'No',
        'Detailed Categories': expense.detailedExpenses.map(de => de.category?.name).join(', '),
        'Total Detailed Amount ($)': (
          expense.detailedExpenses.reduce((sum, de) => sum + de.amountCents, 0) / 100
        ).toFixed(2),
      }));

      // Create CSV
      const csvStringifier = createObjectCsvStringifier({
        header: [
          { id: 'Expense ID', title: 'Expense ID' },
          { id: 'Date', title: 'Date' },
          { id: 'Time', title: 'Time' },
          { id: 'Amount ($)', title: 'Amount ($)' },
          { id: 'Balance After ($)', title: 'Balance After ($)' },
          { id: 'Description', title: 'Description' },
          { id: 'Category', title: 'Category' },
          { id: 'Vendor', title: 'Vendor' },
          { id: 'Organization', title: 'Organization' },
          { id: 'Receipt URL', title: 'Receipt URL' },
          { id: 'Has Receipt Photo', title: 'Has Receipt Photo' },
          { id: 'Detailed Categories', title: 'Detailed Categories' },
          { id: 'Total Detailed Amount ($)', title: 'Total Detailed Amount ($)' },
        ],
      });

      const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(csvData);

      // Set headers for CSV download
      const filename = `expenses-${organizationId}-${new Date().toISOString().split('T')[0]}.csv`;
      reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csvContent);

    } catch (error) {
      console.error('Error exporting expenses CSV:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to export expenses CSV',
        error: error.message,
      });
    }
  });

  // Export ledger CSV (full transparency log)
  fastify.get('/reports/ledger/csv/:organizationId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { organizationId } = request.params;
      const { startDate, endDate } = request.query;

      // Check if user has access to organization data
      if (request.user.organizationId !== organizationId && request.user.userType !== 'admin') {
        return reply.code(403).send({
          success: false,
          message: 'Access denied to organization data',
        });
      }

      const whereClause = { organizationId };

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = new Date(startDate);
        if (endDate) whereClause.createdAt.lte = new Date(endDate);
      }

      const ledgerEntries = await prisma.ledgerEntry.findMany({
        where: whereClause,
        include: {
          organization: {
            select: {
              name: true,
            },
          },
          donation: {
            select: {
              id: true,
              stripChargeId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Format data for CSV
      const csvData = ledgerEntries.map(entry => ({
        'Entry ID': entry.id,
        'Date': entry.createdAt.toISOString().split('T')[0],
        'Time': entry.createdAt.toTimeString().split(' ')[0],
        'Type': entry.entryType,
        'Amount ($)': (entry.amountCents / 100).toFixed(2),
        'Balance After ($)': (entry.balanceCents / 100).toFixed(2),
        'Description': entry.description || '',
        'Category': entry.category || '',
        'Vendor': entry.vendor || '',
        'Organization': entry.organization.name,
        'Related Donation ID': entry.donation?.id || '',
        'Stripe Charge ID': entry.donation?.stripChargeId || '',
        'Receipt URL': entry.receiptUrl || '',
        'Metadata': entry.metadata ? JSON.stringify(entry.metadata) : '',
      }));

      // Create CSV
      const csvStringifier = createObjectCsvStringifier({
        header: [
          { id: 'Entry ID', title: 'Entry ID' },
          { id: 'Date', title: 'Date' },
          { id: 'Time', title: 'Time' },
          { id: 'Type', title: 'Type' },
          { id: 'Amount ($)', title: 'Amount ($)' },
          { id: 'Balance After ($)', title: 'Balance After ($)' },
          { id: 'Description', title: 'Description' },
          { id: 'Category', title: 'Category' },
          { id: 'Vendor', title: 'Vendor' },
          { id: 'Organization', title: 'Organization' },
          { id: 'Related Donation ID', title: 'Related Donation ID' },
          { id: 'Stripe Charge ID', title: 'Stripe Charge ID' },
          { id: 'Receipt URL', title: 'Receipt URL' },
          { id: 'Metadata', title: 'Metadata' },
        ],
      });

      const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(csvData);

      // Set headers for CSV download
      const filename = `ledger-${organizationId}-${new Date().toISOString().split('T')[0]}.csv`;
      reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csvContent);

    } catch (error) {
      console.error('Error exporting ledger CSV:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to export ledger CSV',
        error: error.message,
      });
    }
  });

  // Generate monthly transparency report
  fastify.get('/reports/monthly/:organizationId/:year/:month', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { organizationId, year, month } = request.params;
      const { format = 'json' } = request.query;

      // Check if user has access to organization data
      if (request.user.organizationId !== organizationId && request.user.userType !== 'admin') {
        return reply.code(403).send({
          success: false,
          message: 'Access denied to organization data',
        });
      }

      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);

      const [organization, donations, expenses, ledgerEntries, receiptStats] = await Promise.all([
        // Organization info
        prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true, type: true, city: true, state: true },
        }),

        // Donations summary
        prisma.donation.aggregate({
          where: {
            organizationId,
            createdAt: { gte: startDate, lte: endDate },
            status: 'succeeded',
          },
          _sum: { amountCents: true },
          _count: true,
        }),

        // Expenses summary
        prisma.ledgerEntry.aggregate({
          where: {
            organizationId,
            entryType: 'FUNDS_SPENT',
            createdAt: { gte: startDate, lte: endDate },
          },
          _sum: { amountCents: true },
          _count: true,
        }),

        // Ledger ending balance
        prisma.ledgerEntry.findFirst({
          where: {
            organizationId,
            createdAt: { lte: endDate },
          },
          select: { balanceCents: true },
          orderBy: { createdAt: 'desc' },
        }),

        // Receipt photo stats
        prisma.receiptPhoto.aggregate({
          where: {
            organizationId,
            createdAt: { gte: startDate, lte: endDate },
          },
          _count: true,
        }),
      ]);

      const report = {
        organization: organization.name,
        reportPeriod: `${year}-${month.padStart(2, '0')}`,
        generatedAt: new Date().toISOString(),
        summary: {
          totalDonationsReceived: donations._sum.amountCents ? donations._sum.amountCents / 100 : 0,
          numberOfDonations: donations._count,
          totalExpenses: expenses._sum.amountCents ? Math.abs(expenses._sum.amountCents) / 100 : 0,
          numberOfExpenses: expenses._count,
          endingBalance: ledgerEntries?.balanceCents ? ledgerEntries.balanceCents / 100 : 0,
          receiptsUploaded: receiptStats._count,
          transparencyScore: receiptStats._count > 0 ? Math.round((receiptStats._count / expenses._count) * 100) || 0 : 0,
        },
      };

      if (format === 'csv') {
        // Generate CSV format report
        const csvData = [
          { metric: 'Organization', value: report.organization },
          { metric: 'Report Period', value: report.reportPeriod },
          { metric: 'Generated At', value: report.generatedAt },
          { metric: 'Total Donations Received ($)', value: report.summary.totalDonationsReceived },
          { metric: 'Number of Donations', value: report.summary.numberOfDonations },
          { metric: 'Total Expenses ($)', value: report.summary.totalExpenses },
          { metric: 'Number of Expenses', value: report.summary.numberOfExpenses },
          { metric: 'Ending Balance ($)', value: report.summary.endingBalance },
          { metric: 'Receipts Uploaded', value: report.summary.receiptsUploaded },
          { metric: 'Transparency Score (%)', value: report.summary.transparencyScore },
        ];

        const csvStringifier = createObjectCsvStringifier({
          header: [
            { id: 'metric', title: 'Metric' },
            { id: 'value', title: 'Value' },
          ],
        });

        const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(csvData);
        const filename = `monthly-report-${organizationId}-${year}-${month}.csv`;

        reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(csvContent);
      } else {
        // Return JSON format
        reply.send({
          success: true,
          data: { report },
        });
      }

    } catch (error) {
      console.error('Error generating monthly report:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to generate monthly report',
        error: error.message,
      });
    }
  });

  // Get available report periods for organization
  fastify.get('/reports/periods/:organizationId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { organizationId } = request.params;

      // Check if user has access to organization data
      if (request.user.organizationId !== organizationId && request.user.userType !== 'admin') {
        return reply.code(403).send({
          success: false,
          message: 'Access denied to organization data',
        });
      }

      // Get first and last transaction dates
      const [firstTransaction, lastTransaction] = await Promise.all([
        prisma.ledgerEntry.findFirst({
          where: { organizationId },
          select: { createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.ledgerEntry.findFirst({
          where: { organizationId },
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      if (!firstTransaction || !lastTransaction) {
        return reply.send({
          success: true,
          data: { periods: [] },
        });
      }

      // Generate available periods (months)
      const periods = [];
      const start = new Date(firstTransaction.createdAt);
      const end = new Date(lastTransaction.createdAt);

      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      const endDate = new Date(end.getFullYear(), end.getMonth(), 1);

      while (current <= endDate) {
        periods.push({
          year: current.getFullYear(),
          month: current.getMonth() + 1,
          label: current.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
          value: `${current.getFullYear()}-${(current.getMonth() + 1).toString().padStart(2, '0')}`,
        });
        current.setMonth(current.getMonth() + 1);
      }

      reply.send({
        success: true,
        data: { periods: periods.reverse() }, // Most recent first
      });

    } catch (error) {
      console.error('Error fetching report periods:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to fetch report periods',
        error: error.message,
      });
    }
  });
}