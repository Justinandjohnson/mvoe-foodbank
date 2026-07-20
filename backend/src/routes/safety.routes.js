import { optionalActor } from '../middleware/actor.js';
import { authenticate, requireUserType } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import { getPrismaClient } from '../utils/database.js';
import {
  createModerationReportSchema,
  updateModerationReportSchema,
} from '../utils/validators.js';

const prisma = getPrismaClient();

const QUEUE_LIMIT = 100;

function parseLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.round(parsed), 1), QUEUE_LIMIT);
}

function reportSummary(report) {
  return {
    id: report.id,
    entityType: report.entityType,
    entityId: report.entityId,
    reason: report.reason,
    details: report.details,
    status: report.status,
    severity: report.severity,
    metadata: report.metadata,
    resolvedBy: report.resolvedBy,
    resolvedAt: report.resolvedAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

async function writeSafetyAudit(request, action, entityType, entityId, details = {}) {
  await prisma.auditLog.create({
    data: {
      userId: request.user?.id || request.actor?.userId || null,
      action,
      entityType,
      entityId,
      ipAddress: request.ip || null,
      userAgent: request.headers['user-agent'] || null,
      details: {
        ...details,
        actorType: request.actor?.actorType || (request.user ? 'user' : 'unknown'),
        sessionId: request.actor?.sessionId || null,
      },
    },
  });
}

export default async function safetyRoutes(fastify) {
  fastify.post('/safety/reports', {
    preHandler: [optionalActor, validateBody(createModerationReportSchema)],
  }, async (request, reply) => {
    if (!request.actor) {
      return reply.code(401).send({
        success: false,
        error: 'Sign in or anonymous session required to report a safety issue.',
      });
    }

    const duplicateWindow = new Date(Date.now() - 10 * 60 * 1000);
    const duplicate = await prisma.moderationReport.findFirst({
      where: {
        reporterUserId: request.actor.userId || null,
        reporterSessionId: request.actor.sessionId || null,
        entityType: request.body.entityType,
        entityId: request.body.entityId,
        reason: request.body.reason,
        createdAt: { gte: duplicateWindow },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (duplicate) {
      return reply.send({
        success: true,
        report: reportSummary(duplicate),
        message: 'This issue is already in the moderation queue.',
      });
    }

    const report = await prisma.moderationReport.create({
      data: {
        reporterUserId: request.actor.userId || null,
        reporterSessionId: request.actor.sessionId || null,
        entityType: request.body.entityType,
        entityId: request.body.entityId,
        reason: request.body.reason,
        details: request.body.details || null,
        severity: request.body.severity,
        metadata: {
          source: 'public_report',
          ipAddress: request.ip || null,
        },
      },
    });

    await writeSafetyAudit(request, 'MODERATION_REPORT_CREATE', 'moderation_report', report.id, {
      reportedEntityType: report.entityType,
      reportedEntityId: report.entityId,
      reason: report.reason,
      severity: report.severity,
    });

    return reply.code(201).send({
      success: true,
      report: reportSummary(report),
      message: 'Safety report received.',
    });
  });

  fastify.get('/safety/moderation-queue', {
    preHandler: [authenticate, requireUserType(['staff', 'admin'])],
  }, async (request, reply) => {
    const status = String(request.query.status || 'open');
    const limit = parseLimit(request.query.limit);
    const where = status === 'all' ? {} : { status };

    const reports = await prisma.moderationReport.findMany({
      where,
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    return reply.send({
      success: true,
      reports: reports.map(reportSummary),
      count: reports.length,
    });
  });

  fastify.patch('/safety/moderation-queue/:reportId', {
    preHandler: [
      authenticate,
      requireUserType(['staff', 'admin']),
      validateBody(updateModerationReportSchema),
    ],
  }, async (request, reply) => {
    const existing = await prisma.moderationReport.findUnique({
      where: { id: request.params.reportId },
    });

    if (!existing) {
      return reply.code(404).send({
        success: false,
        error: 'Moderation report not found',
      });
    }

    const resolved = ['resolved', 'dismissed'].includes(request.body.status);
    const report = await prisma.moderationReport.update({
      where: { id: existing.id },
      data: {
        status: request.body.status,
        severity: request.body.severity || existing.severity,
        resolvedBy: resolved ? request.user.id : null,
        resolvedAt: resolved ? new Date() : null,
        metadata: {
          ...(existing.metadata || {}),
          lastReviewerId: request.user.id,
          reviewerNotes: request.body.notes || null,
        },
      },
    });

    await writeSafetyAudit(request, 'MODERATION_REPORT_UPDATE', 'moderation_report', report.id, {
      status: report.status,
      severity: report.severity,
    });

    return reply.send({
      success: true,
      report: reportSummary(report),
    });
  });
}
