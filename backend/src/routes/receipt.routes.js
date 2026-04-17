// Receipt Photo Routes - Transparency feature
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

const prisma = new PrismaClient();

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

export default async function receiptRoutes(fastify, options) {
  // Upload receipt photo
  fastify.post('/receipt-photos/upload', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      // Handle multipart form data
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({
          success: false,
          message: 'No file uploaded',
        });
      }

      const buffer = await data.file.toBuffer();
      const originalName = data.filename;
      const mimeType = data.mimetype;
      const fileSize = buffer.length;

      // Validate file
      if (!mimeType.startsWith('image/')) {
        return reply.code(400).send({
          success: false,
          message: 'Only image files are allowed',
        });
      }

      if (fileSize > 5 * 1024 * 1024) {
        return reply.code(400).send({
          success: false,
          message: 'File size must be less than 5MB',
        });
      }

      // Get additional data from form fields
      const fields = {};
      for await (const field of request.parts()) {
        if (!field.file) {
          fields[field.fieldname] = field.value;
        }
      }

      const {
        organizationId,
        ledgerEntryId,
        expenseId,
        description,
        vendor,
        amountCents,
        expenseDate,
        tags,
        isPublic = 'true'
      } = fields;

      if (!organizationId) {
        return reply.code(400).send({
          success: false,
          message: 'Organization ID is required',
        });
      }

      // Generate unique filename
      const timestamp = Date.now();
      const fileExt = path.extname(originalName) || '.jpg';
      const filename = `receipt-${timestamp}-${Math.random().toString(36).substr(2, 9)}${fileExt}`;
      const thumbnailFilename = `thumb-${filename}`;

      // Create uploads directory if it doesn't exist
      const uploadsDir = path.join(process.cwd(), 'uploads', 'receipts');
      await fs.mkdir(uploadsDir, { recursive: true });

      // Process and save original image
      const processedBuffer = await sharp(buffer)
        .resize(1200, 1200, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      const filePath = path.join(uploadsDir, filename);
      await fs.writeFile(filePath, processedBuffer);

      // Generate thumbnail
      const thumbnailBuffer = await sharp(buffer)
        .resize(300, 300, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 70 })
        .toBuffer();

      const thumbnailPath = path.join(uploadsDir, thumbnailFilename);
      await fs.writeFile(thumbnailPath, thumbnailBuffer);

      // Save to database
      const receiptPhoto = await prisma.receiptPhoto.create({
        data: {
          organizationId,
          ledgerEntryId: ledgerEntryId || null,
          expenseId: expenseId || null,
          photoUrl: `/uploads/receipts/${filename}`,
          thumbnailUrl: `/uploads/receipts/${thumbnailFilename}`,
          originalName,
          fileSize: processedBuffer.length,
          mimeType: 'image/jpeg',
          description: description || null,
          vendor: vendor || null,
          amountCents: amountCents ? parseInt(amountCents) : null,
          expenseDate: expenseDate ? new Date(expenseDate) : null,
          tags: tags ? JSON.parse(tags) : [],
          isPublic: isPublic === 'true',
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

      reply.code(201).send({
        success: true,
        message: 'Receipt photo uploaded successfully',
        data: { receiptPhoto },
      });

    } catch (error) {
      console.error('Error uploading receipt photo:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to upload receipt photo',
        error: error.message,
      });
    }
  });

  // Get receipt photos for organization (public gallery)
  fastify.get('/receipt-photos/gallery/:organizationId', async (request, reply) => {
    try {
      const { organizationId } = request.params;
      const {
        limit = 20,
        offset = 0,
        vendor,
        tag,
        startDate,
        endDate,
      } = request.query;

      const whereClause = {
        organizationId,
        isPublic: true,
      };

      if (vendor) {
        whereClause.vendor = {
          contains: vendor,
          mode: 'insensitive',
        };
      }

      if (tag) {
        whereClause.tags = {
          has: tag,
        };
      }

      if (startDate || endDate) {
        whereClause.expenseDate = {};
        if (startDate) whereClause.expenseDate.gte = new Date(startDate);
        if (endDate) whereClause.expenseDate.lte = new Date(endDate);
      }

      const receipts = await prisma.receiptPhoto.findMany({
        where: whereClause,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          ledgerEntry: {
            select: {
              id: true,
              description: true,
              category: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: parseInt(limit),
        skip: parseInt(offset),
      });

      const totalCount = await prisma.receiptPhoto.count({
        where: whereClause,
      });

      reply.send({
        success: true,
        data: {
          receipts,
          pagination: {
            total: totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: totalCount > parseInt(offset) + parseInt(limit),
          },
        },
      });

    } catch (error) {
      console.error('Error fetching receipt gallery:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to fetch receipt gallery',
        error: error.message,
      });
    }
  });

  // Get receipt photo by ID
  fastify.get('/receipt-photos/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const receipt = await prisma.receiptPhoto.findUnique({
        where: { id },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          ledgerEntry: {
            select: {
              id: true,
              description: true,
              category: true,
              amountCents: true,
              createdAt: true,
            },
          },
          detailedExpense: {
            select: {
              id: true,
              description: true,
              amountCents: true,
              category: {
                select: {
                  name: true,
                  description: true,
                },
              },
            },
          },
        },
      });

      if (!receipt) {
        return reply.code(404).send({
          success: false,
          message: 'Receipt photo not found',
        });
      }

      if (!receipt.isPublic) {
        // Check if user has access to private receipts
        if (!request.user || request.user.organizationId !== receipt.organizationId) {
          return reply.code(403).send({
            success: false,
            message: 'Access denied to private receipt',
          });
        }
      }

      reply.send({
        success: true,
        data: { receipt },
      });

    } catch (error) {
      console.error('Error fetching receipt photo:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to fetch receipt photo',
        error: error.message,
      });
    }
  });

  // Update receipt photo metadata (authenticated)
  fastify.put('/receipt-photos/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const {
        description,
        vendor,
        amountCents,
        expenseDate,
        tags,
        isPublic,
      } = request.body;

      // Check if receipt exists and user has permission
      const existingReceipt = await prisma.receiptPhoto.findUnique({
        where: { id },
      });

      if (!existingReceipt) {
        return reply.code(404).send({
          success: false,
          message: 'Receipt photo not found',
        });
      }

      // Simple permission check - only same organization can edit
      if (request.user.organizationId !== existingReceipt.organizationId) {
        return reply.code(403).send({
          success: false,
          message: 'Permission denied',
        });
      }

      const updatedReceipt = await prisma.receiptPhoto.update({
        where: { id },
        data: {
          description,
          vendor,
          amountCents,
          expenseDate: expenseDate ? new Date(expenseDate) : undefined,
          tags,
          isPublic,
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

      reply.send({
        success: true,
        message: 'Receipt photo updated successfully',
        data: { receipt: updatedReceipt },
      });

    } catch (error) {
      console.error('Error updating receipt photo:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to update receipt photo',
        error: error.message,
      });
    }
  });

  // Delete receipt photo (authenticated)
  fastify.delete('/receipt-photos/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      // Check if receipt exists and user has permission
      const existingReceipt = await prisma.receiptPhoto.findUnique({
        where: { id },
      });

      if (!existingReceipt) {
        return reply.code(404).send({
          success: false,
          message: 'Receipt photo not found',
        });
      }

      // Simple permission check - only same organization can delete
      if (request.user.organizationId !== existingReceipt.organizationId) {
        return reply.code(403).send({
          success: false,
          message: 'Permission denied',
        });
      }

      // Delete files from filesystem
      try {
        if (existingReceipt.photoUrl) {
          const filePath = path.join(process.cwd(), existingReceipt.photoUrl);
          await fs.unlink(filePath);
        }
        if (existingReceipt.thumbnailUrl) {
          const thumbnailPath = path.join(process.cwd(), existingReceipt.thumbnailUrl);
          await fs.unlink(thumbnailPath);
        }
      } catch (fileError) {
        console.warn('Error deleting files:', fileError);
        // Continue with database deletion even if file deletion fails
      }

      // Delete from database
      await prisma.receiptPhoto.delete({
        where: { id },
      });

      reply.send({
        success: true,
        message: 'Receipt photo deleted successfully',
      });

    } catch (error) {
      console.error('Error deleting receipt photo:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to delete receipt photo',
        error: error.message,
      });
    }
  });

  // Get receipt statistics
  fastify.get('/receipt-photos/stats/:organizationId', async (request, reply) => {
    try {
      const { organizationId } = request.params;

      const [
        totalCount,
        publicCount,
        totalAmount,
        vendorStats,
        monthlyStats,
      ] = await Promise.all([
        // Total receipts
        prisma.receiptPhoto.count({
          where: { organizationId },
        }),
        // Public receipts
        prisma.receiptPhoto.count({
          where: { organizationId, isPublic: true },
        }),
        // Total expense amount
        prisma.receiptPhoto.aggregate({
          where: { organizationId, amountCents: { not: null } },
          _sum: { amountCents: true },
        }),
        // Top vendors
        prisma.receiptPhoto.groupBy({
          by: ['vendor'],
          where: { organizationId, vendor: { not: null } },
          _count: true,
          _sum: { amountCents: true },
          orderBy: { _count: { vendor: 'desc' } },
          take: 10,
        }),
        // Monthly upload stats
        prisma.$queryRaw`
          SELECT
            DATE_TRUNC('month', created_at) as month,
            COUNT(*) as count,
            SUM(amount_cents) as total_amount
          FROM receipt_photos
          WHERE organization_id = ${organizationId}
            AND created_at >= NOW() - INTERVAL '12 months'
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY month DESC
        `,
      ]);

      reply.send({
        success: true,
        data: {
          summary: {
            totalReceipts: totalCount,
            publicReceipts: publicCount,
            privateReceipts: totalCount - publicCount,
            totalAmountCents: totalAmount._sum.amountCents || 0,
            transparencyRate: totalCount > 0 ? Math.round((publicCount / totalCount) * 100) : 0,
          },
          vendors: vendorStats.map(v => ({
            vendor: v.vendor,
            receiptCount: v._count,
            totalAmountCents: v._sum.amountCents || 0,
          })),
          monthly: monthlyStats.map(m => ({
            month: m.month,
            count: parseInt(m.count),
            totalAmountCents: parseInt(m.total_amount) || 0,
          })),
        },
      });

    } catch (error) {
      console.error('Error fetching receipt stats:', error);
      reply.code(500).send({
        success: false,
        message: 'Failed to fetch receipt statistics',
        error: error.message,
      });
    }
  });
}