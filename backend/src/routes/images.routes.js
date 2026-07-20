// Image Routes - upload and serve photos (food beacons, receipts)
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { optionalActor } from '../middleware/actor.js';

const prisma = new PrismaClient();

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Stored at 1200px / quality 85 — a phone photo lands around 200KB, which keeps
// Supabase's 500MB free tier good for roughly 2,000 images.
export async function storeImage(buffer) {
  const processed = await sharp(buffer)
    .rotate() // honour EXIF orientation, otherwise phone photos come out sideways
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  return prisma.storedImage.create({
    data: {
      data: processed,
      mimeType: 'image/jpeg',
      byteSize: processed.length,
    },
    select: { id: true, byteSize: true },
  });
}

export default async function imageRoutes(fastify, _options) {
  // Anyone can post food, so anyone can upload a photo of it — guests included.
  fastify.post('/images/upload', {
    preHandler: [optionalActor],
  }, async (request, reply) => {
    const file = await request.file();

    if (!file) {
      return reply.code(400).send({
        success: false,
        message: 'No file uploaded',
      });
    }

    if (!file.mimetype?.startsWith('image/')) {
      return reply.code(400).send({
        success: false,
        message: 'Only image files are allowed',
      });
    }

    const buffer = await file.toBuffer();

    if (buffer.length > MAX_UPLOAD_BYTES) {
      return reply.code(413).send({
        success: false,
        message: 'Image must be smaller than 5MB',
      });
    }

    const image = await storeImage(buffer);

    return reply.code(201).send({
      success: true,
      data: {
        id: image.id,
        url: `/api/images/${image.id}`,
      },
    });
  });

  fastify.get('/images/:id', async (request, reply) => {
    const { id } = request.params;

    const image = await prisma.storedImage.findUnique({
      where: { id },
      select: { data: true, mimeType: true },
    });

    if (!image) {
      return reply.code(404).send({
        success: false,
        message: 'Image not found',
      });
    }

    // Image bytes never change once written, so let clients cache hard.
    return reply
      .header('Content-Type', image.mimeType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(image.data);
  });
}
