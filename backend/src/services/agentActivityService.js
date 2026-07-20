import prisma from '../utils/database.js';

export async function recordAgentActivity({
  userId = null,
  action,
  entityId,
  entityType = 'agent_job',
  details = {},
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        details,
      },
    });
  } catch (error) {
    console.error('Failed to record agent activity:', error.message);
  }
}

export async function listRecentAgentActivity(limit = 50) {
  return prisma.auditLog.findMany({
    where: {
      OR: [
        { action: { startsWith: 'AGENT_' } },
        { entityType: 'agent_job' },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
