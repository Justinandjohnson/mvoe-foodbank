import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import GrantWriterAgent, { normalizeGrantWriterRequest } from '../agents/grantWriterAgent.js';
import { actorOwnsRecord } from '../middleware/actor.js';
import { getPrismaClient } from '../utils/database.js';
import {
  buildGrantComposioUserId,
  getGoogleDriveConnectionStatus,
  isComposioConfigured,
  startGoogleDriveConnection,
  uploadFileToGoogleDrive,
} from './composioService.js';

const prisma = getPrismaClient();

const DEFAULT_GRANT_PROFILE = {
  organizationName: 'MVOE',
  mission: 'Connect people to food quickly and support community-led meals, food beacons, and emergency food response.',
  location: 'Austin, Texas',
  populationServed: 'Neighbors experiencing food insecurity',
  grantType: 'Program support',
  existingPrograms: 'Food beacon coordination, public meal gatherings, volunteer staffing, and food-access mapping.',
};

const WORKSPACE_INCLUDE = {
  messages: {
    orderBy: { createdAt: 'asc' },
  },
  drafts: {
    orderBy: { updatedAt: 'desc' },
  },
  driveConnection: true,
  driveSyncs: {
    orderBy: { createdAt: 'desc' },
    take: 8,
  },
};

function buildHttpError(statusCode, message, code = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) {
    error.code = code;
  }
  return error;
}

function normalizeGrantRuntimeError(error) {
  const raw = error?.message || 'Grant writer failed to complete this request.';
  const normalized = raw.toLowerCase();

  if (normalized.includes('api key has been deactivated')) {
    return 'Grant writer AI is offline because the configured OpenAI API key has been deactivated. Add a working OPENROUTER_API_KEY or OPENAI_API_KEY, then try again.';
  }

  if (normalized.includes('401') || normalized.includes('user not found') || normalized.includes('invalid api key')) {
    return 'Grant writer AI is offline because the configured AI provider credential is invalid or not active. Add a working funded OPENROUTER_API_KEY or OPENAI_API_KEY, then try again.';
  }

  if (normalized.includes('insufficient credits') || normalized.includes('insufficient balance') || normalized.includes('402')) {
    return 'Grant writer AI is offline because the configured AI provider account needs credits. Add credits or switch to a funded provider key, then try again.';
  }

  if (normalized.includes('no ai provider configured')) {
    return 'Grant writer AI is offline because no live provider key is configured. Add OPENROUTER_API_KEY or OPENAI_API_KEY, then try again.';
  }

  return raw;
}

function ensureActor(actor) {
  if (!actor) {
    throw buildHttpError(401, 'Anonymous session required');
  }
}

function buildOwnershipWhere(actor) {
  ensureActor(actor);

  if (actor.userId) {
    return { actorUserId: actor.userId };
  }

  if (actor.sessionId) {
    return { actorSessionId: actor.sessionId };
  }

  throw buildHttpError(401, 'Anonymous session required');
}

function applyWorkspaceDefaults(values = {}) {
  return {
    organizationName: values.organizationName || DEFAULT_GRANT_PROFILE.organizationName,
    mission: values.mission || DEFAULT_GRANT_PROFILE.mission,
    location: values.location || DEFAULT_GRANT_PROFILE.location,
    populationServed: values.populationServed || DEFAULT_GRANT_PROFILE.populationServed,
    projectNeed: values.projectNeed || '',
    amountTarget: values.amountTarget || '',
    grantType: values.grantType || DEFAULT_GRANT_PROFILE.grantType,
    websiteUrl: values.websiteUrl || '',
    socialUrl: values.socialUrl || '',
    existingPrograms: values.existingPrograms || DEFAULT_GRANT_PROFILE.existingPrograms,
    notes: values.notes || '',
  };
}

function sanitizeWorkspacePatch(patch = {}) {
  const next = {};

  const stringFields = [
    'title',
    'organizationName',
    'mission',
    'location',
    'populationServed',
    'projectNeed',
    'amountTarget',
    'grantType',
    'websiteUrl',
    'socialUrl',
    'existingPrograms',
    'notes',
  ];

  for (const field of stringFields) {
    if (typeof patch[field] === 'string') {
      next[field] = patch[field].trim();
    }
  }

  if (patch.selectedOpportunity && typeof patch.selectedOpportunity === 'object') {
    next.selectedOpportunity = patch.selectedOpportunity;
  }

  if (typeof patch.status === 'string') {
    next.status = patch.status.trim();
  }

  return next;
}

function buildWorkspaceTitle({ title, projectNeed }, fallback = 'New grant chat') {
  const source = (title || projectNeed || fallback || '').trim();
  if (!source) return 'New grant chat';
  if (source.length <= 52) return source;
  return `${source.slice(0, 49).trimEnd()}...`;
}

function inferWorkspaceMode(message, workspace, explicitMode) {
  if (explicitMode === 'draft' || explicitMode === 'search' || explicitMode === 'prepare-application') {
    return explicitMode;
  }

  const value = String(message || '').toLowerCase();

  if (workspace?.selectedOpportunity && /(prepare|application|portal|form|submit|fill out)/.test(value)) {
    return 'prepare-application';
  }

  if (/(search|find|opportunit|grant list|funders|funder|grants)/.test(value)) {
    return 'search';
  }

  return 'draft';
}

function artifactTypeFromResult(result = {}) {
  if (result.grantSearch) return 'opportunity_search';
  if (result.applicationPreparation) return 'application_preparation';
  return 'grant_brief';
}

function buildAssistantSummary(mode, result = {}) {
  if (mode === 'search' && result.grantSearch) {
    const count = Array.isArray(result.grantSearch.searchResults) ? result.grantSearch.searchResults.length : 0;
    return `I ranked ${count} grounded grant opportunities. Pick one to prepare the application workflow or ask me to tighten the fit.`;
  }

  if (mode === 'prepare-application' && result.applicationPreparation) {
    const steps = Array.isArray(result.applicationPreparation?.automationPlan?.stepPlan)
      ? result.applicationPreparation.automationPlan.stepPlan.length
      : 0;
    return `I prepared the application workflow with ${steps} concrete steps, upload guidance, and review-before-submit safeguards.`;
  }

  const targets = Array.isArray(result.grantBrief?.recommendedTargets)
    ? result.grantBrief.recommendedTargets.length
    : 0;
  return `I drafted a grounded grant brief with editable sections and ${targets} recommended funding targets.`;
}

function buildDraftPayload(workspace, result = {}) {
  if (result.grantSearch) {
    const topProgram = result.grantSearch.searchResults?.[0]?.programName || 'Grant opportunity search';
    return {
      artifactType: 'opportunity_search',
      title: `${topProgram} search`,
      summary: `Ranked ${(result.grantSearch.searchResults || []).length} grounded grant opportunities for ${workspace.organizationName}.`,
      data: result.grantSearch,
    };
  }

  if (result.applicationPreparation) {
    return {
      artifactType: 'application_preparation',
      title: 'Application preparation',
      summary: result.applicationPreparation?.automationPlan?.stepPlan?.[0]
        || 'Prepared the application workflow with review safeguards.',
      data: result.applicationPreparation,
    };
  }

  return {
    artifactType: 'grant_brief',
    title: `${workspace.organizationName} grant brief`,
    summary: result.grantBrief?.draftSections?.executiveSummary || 'Drafted a grounded grant brief.',
    data: result.grantBrief,
  };
}

function buildGrantRequest(workspace, message, mode) {
  const request = normalizeGrantWriterRequest({
    organizationName: workspace.organizationName || DEFAULT_GRANT_PROFILE.organizationName,
    mission: workspace.mission || DEFAULT_GRANT_PROFILE.mission,
    location: workspace.location || DEFAULT_GRANT_PROFILE.location,
    populationServed: workspace.populationServed || DEFAULT_GRANT_PROFILE.populationServed,
    projectNeed: workspace.projectNeed || message || 'Support MVOE food access programming.',
    amountTarget: workspace.amountTarget || 'Not specified',
    grantType: workspace.grantType || DEFAULT_GRANT_PROFILE.grantType,
    websiteUrl: workspace.websiteUrl || '',
    socialUrl: workspace.socialUrl || '',
    existingPrograms: workspace.existingPrograms || DEFAULT_GRANT_PROFILE.existingPrograms,
    notes: [workspace.notes, message].filter(Boolean).join('\n\nLatest request:\n'),
    targetGrant: workspace.selectedOpportunity || null,
    applicationUrl: workspace.selectedOpportunity?.applicationUrl || '',
    mode,
  });

  if (!request.projectNeed || request.projectNeed === 'General hunger relief programming') {
    request.projectNeed = message || 'Support MVOE food access programming.';
  }

  return request;
}

function buildDriveFileMarkdown(workspace, draft) {
  const data = draft.data || {};
  const lines = [
    `# ${draft.title}`,
    '',
    `Organization: ${workspace.organizationName}`,
    `Status: ${draft.status}`,
    `Artifact type: ${draft.artifactType}`,
    `Updated: ${draft.updatedAt.toISOString()}`,
    '',
  ];

  if (draft.summary) {
    lines.push('## Summary', '', draft.summary, '');
  }

  if (draft.artifactType === 'grant_brief') {
    const sections = data?.draftSections || {};
    const sectionEntries = [
      ['Executive summary', sections.executiveSummary],
      ['Need statement', sections.needStatement],
      ['Program description', sections.programDescription],
      ['Outcomes and evaluation', sections.outcomesAndEvaluation],
      ['Budget narrative', sections.budgetNarrative],
    ];

    for (const [label, content] of sectionEntries) {
      if (content) {
        lines.push(`## ${label}`, '', content, '');
      }
    }

    if (Array.isArray(data?.applicationChecklist) && data.applicationChecklist.length > 0) {
      lines.push('## Application checklist', '');
      data.applicationChecklist.forEach((item) => lines.push(`- ${item}`));
      lines.push('');
    }
  } else if (draft.artifactType === 'opportunity_search') {
    lines.push('## Ranked opportunities', '');
    (data?.searchResults || []).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.programName || 'Untitled opportunity'}`);
      if (item.funderType) lines.push(`   - Funder type: ${item.funderType}`);
      if (item.whyItFits) lines.push(`   - Why it fits: ${item.whyItFits}`);
      if (item.whatToVerifyLive) lines.push(`   - Verify live: ${item.whatToVerifyLive}`);
      if (item.applicationUrl) lines.push(`   - Application URL: ${item.applicationUrl}`);
    });
    lines.push('');
  } else if (draft.artifactType === 'application_preparation') {
    const plan = data?.automationPlan || {};
    lines.push('## Automation plan', '');
    if (plan.portalType) lines.push(`Portal type: ${plan.portalType}`);
    if (plan.automationMode) lines.push(`Automation mode: ${plan.automationMode}`);
    if (Array.isArray(plan.stepPlan) && plan.stepPlan.length > 0) {
      lines.push('', '### Step plan', '');
      plan.stepPlan.forEach((item) => lines.push(`- ${item}`));
    }
    if (Array.isArray(plan.preSubmitChecklist) && plan.preSubmitChecklist.length > 0) {
      lines.push('', '### Pre-submit checklist', '');
      plan.preSubmitChecklist.forEach((item) => lines.push(`- ${item}`));
    }
    lines.push('');
  }

  if (Array.isArray(data?.warnings) && data.warnings.length > 0) {
    lines.push('## Warnings', '');
    data.warnings.forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  }

  return lines.join('\n').trim();
}

function sanitizeFileName(value) {
  return String(value || 'grant-draft')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function buildWorkspaceListItem(workspace) {
  const latestMessage = workspace.messages?.[0] || null;
  const latestDraft = workspace.drafts?.[0] || null;

  return {
    id: workspace.id,
    title: workspace.title,
    status: workspace.status,
    organizationName: workspace.organizationName,
    projectNeed: workspace.projectNeed,
    lastActivityAt: workspace.lastActivityAt,
    updatedAt: workspace.updatedAt,
    preview: latestMessage?.content || latestDraft?.summary || 'Start a new grant conversation.',
    latestDraftStatus: latestDraft?.status || null,
    latestDraftType: latestDraft?.artifactType || null,
    driveStatus: workspace.driveConnection?.status || 'disconnected',
    draftCount: workspace._count?.drafts || 0,
    messageCount: workspace._count?.messages || 0,
  };
}

async function getWorkspaceRecord(workspaceId) {
  const workspace = await prisma.grantWorkspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace) {
    throw buildHttpError(404, 'Grant workspace not found');
  }

  return workspace;
}

async function getOwnedWorkspace(actor, workspaceId) {
  const workspace = await getWorkspaceRecord(workspaceId);

  if (!actorOwnsRecord(actor, workspace, {
    userField: 'actorUserId',
    sessionField: 'actorSessionId',
  })) {
    throw buildHttpError(404, 'Grant workspace not found');
  }

  return workspace;
}

async function hydrateWorkspace(workspaceId) {
  return prisma.grantWorkspace.findUnique({
    where: { id: workspaceId },
    include: WORKSPACE_INCLUDE,
  });
}

async function appendMessage(workspaceId, payload) {
  return prisma.grantWorkspaceMessage.create({
    data: {
      workspaceId,
      role: payload.role,
      kind: payload.kind || 'chat',
      content: payload.content,
      mode: payload.mode || null,
      metadata: payload.metadata || undefined,
    },
  });
}

async function upsertDriveConnection(workspaceId, data) {
  return prisma.grantWorkspaceDriveConnection.upsert({
    where: { workspaceId },
    update: data,
    create: {
      workspaceId,
      ...data,
    },
  });
}

async function executeGrantWorkspaceRun(workspaceId, message, mode) {
  const workspace = await getWorkspaceRecord(workspaceId);
  const agent = new GrantWriterAgent(null);
  const progressTexts = new Set();

  try {
    const result = await agent.execute({
      sessionId: `grant-workspace-${workspaceId}-${Date.now()}`,
      request: buildGrantRequest(workspace, message, mode),
      onProgress: async ({ message: progressMessage }) => {
        if (!progressMessage || progressTexts.has(progressMessage)) {
          return;
        }

        progressTexts.add(progressMessage);
        await appendMessage(workspaceId, {
          role: 'system',
          kind: 'progress',
          content: progressMessage,
          mode,
          metadata: { agentType: 'grant-writer' },
        });
      },
    });

    const latestWorkspace = await getWorkspaceRecord(workspaceId);
    const assistantMessage = await appendMessage(workspaceId, {
      role: 'assistant',
      content: buildAssistantSummary(mode, result),
      mode,
      metadata: {
        artifactType: artifactTypeFromResult(result),
      },
    });

    const draftPayload = buildDraftPayload(latestWorkspace, result);
    await prisma.grantApplicationDraft.create({
      data: {
        workspaceId,
        sourceMessageId: assistantMessage.id,
        artifactType: draftPayload.artifactType,
        title: draftPayload.title,
        summary: draftPayload.summary,
        data: draftPayload.data,
      },
    });

    await prisma.grantWorkspace.update({
      where: { id: workspaceId },
      data: {
        status: 'active',
        lastRunMode: mode,
        lastRunAt: new Date(),
        lastActivityAt: new Date(),
      },
    });
  } catch (error) {
    await appendMessage(workspaceId, {
      role: 'error',
      content: normalizeGrantRuntimeError(error),
      mode,
    });

    await prisma.grantWorkspace.update({
      where: { id: workspaceId },
      data: {
        status: 'active',
        lastActivityAt: new Date(),
      },
    });

    throw error;
  }
}

export async function listGrantWorkspaces(actor) {
  ensureActor(actor);

  const workspaces = await prisma.grantWorkspace.findMany({
    where: buildOwnershipWhere(actor),
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      drafts: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
      driveConnection: true,
      _count: {
        select: {
          drafts: true,
          messages: true,
        },
      },
    },
    orderBy: [
      { lastActivityAt: 'desc' },
      { updatedAt: 'desc' },
    ],
  });

  return workspaces.map(buildWorkspaceListItem);
}

export async function createGrantWorkspace(actor, input = {}) {
  ensureActor(actor);
  const patch = sanitizeWorkspacePatch(input);
  const profile = applyWorkspaceDefaults(patch);

  const created = await prisma.grantWorkspace.create({
    data: {
      ...buildOwnershipWhere(actor),
      title: buildWorkspaceTitle({
        title: patch.title,
        projectNeed: patch.projectNeed,
      }),
      ...profile,
    },
  });

  await appendMessage(created.id, {
    role: 'assistant',
    kind: 'status',
    content: 'Grant workspace ready. Ask for a funding search, a draft, or an application prep plan. The latest draft, review controls, and Drive sync will stay attached here.',
  });

  return hydrateWorkspace(created.id);
}

export async function getGrantWorkspace(actor, workspaceId) {
  ensureActor(actor);
  await getOwnedWorkspace(actor, workspaceId);
  return hydrateWorkspace(workspaceId);
}

export async function updateGrantWorkspace(actor, workspaceId, input = {}) {
  ensureActor(actor);
  const workspace = await getOwnedWorkspace(actor, workspaceId);
  const patch = sanitizeWorkspacePatch(input);

  const updated = await prisma.grantWorkspace.update({
    where: { id: workspace.id },
    data: {
      ...patch,
      title: buildWorkspaceTitle({
        title: patch.title || workspace.title,
        projectNeed: patch.projectNeed || workspace.projectNeed,
      }, workspace.title),
      lastActivityAt: new Date(),
    },
  });

  return hydrateWorkspace(updated.id);
}

export async function runGrantWorkspaceTurn(actor, workspaceId, input = {}) {
  ensureActor(actor);
  const workspace = await getOwnedWorkspace(actor, workspaceId);
  const patch = sanitizeWorkspacePatch(input.profile || {});
  const trimmedMessage = String(input.message || '').trim();

  if (!trimmedMessage) {
    throw buildHttpError(400, 'Message text is required');
  }

  if (workspace.status === 'running') {
    throw buildHttpError(409, 'Grant workspace is already running a request', 'GRANT_WORKSPACE_RUNNING');
  }

  const mode = inferWorkspaceMode(trimmedMessage, workspace, input.mode);
  const nextWorkspace = await prisma.grantWorkspace.update({
    where: { id: workspace.id },
    data: {
      ...patch,
      title: buildWorkspaceTitle({
        title: patch.title || workspace.title,
        projectNeed: patch.projectNeed || workspace.projectNeed || trimmedMessage,
      }, workspace.title),
      status: 'running',
      lastRunMode: mode,
      lastActivityAt: new Date(),
    },
  });

  await appendMessage(nextWorkspace.id, {
    role: 'user',
    content: trimmedMessage,
    mode,
  });

  executeGrantWorkspaceRun(nextWorkspace.id, trimmedMessage, mode).catch((error) => {
    console.error('Grant workspace background run failed:', error);
  });

  return hydrateWorkspace(nextWorkspace.id);
}

export async function reviewGrantDraft(actor, workspaceId, draftId, input = {}) {
  ensureActor(actor);
  await getOwnedWorkspace(actor, workspaceId);

  const draft = await prisma.grantApplicationDraft.findFirst({
    where: {
      id: draftId,
      workspaceId,
    },
  });

  if (!draft) {
    throw buildHttpError(404, 'Grant draft not found');
  }

  const approved = Boolean(input.approved);
  await prisma.grantApplicationDraft.update({
    where: { id: draft.id },
    data: {
      status: approved ? 'approved' : 'disapproved',
      reviewNotes: typeof input.notes === 'string' ? input.notes.trim() : draft.reviewNotes,
      reviewedAt: new Date(),
    },
  });

  await appendMessage(workspaceId, {
    role: 'system',
    kind: 'status',
    content: approved
      ? `Marked "${draft.title}" as approved.`
      : `Marked "${draft.title}" as disapproved.`,
    metadata: {
      draftId,
    },
  });

  await prisma.grantWorkspace.update({
    where: { id: workspaceId },
    data: {
      lastActivityAt: new Date(),
    },
  });

  return hydrateWorkspace(workspaceId);
}

export async function updateGrantDraft(actor, workspaceId, draftId, input = {}) {
  ensureActor(actor);
  await getOwnedWorkspace(actor, workspaceId);

  const draft = await prisma.grantApplicationDraft.findFirst({
    where: {
      id: draftId,
      workspaceId,
    },
  });

  if (!draft) {
    throw buildHttpError(404, 'Grant draft not found');
  }

  const nextData = input.data && typeof input.data === 'object' ? input.data : draft.data;
  const nextTitle = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : draft.title;
  const nextSummary = typeof input.summary === 'string' ? input.summary.trim() : draft.summary;
  const nextNotes = typeof input.reviewNotes === 'string' ? input.reviewNotes.trim() : draft.reviewNotes;

  await prisma.grantApplicationDraft.update({
    where: { id: draft.id },
    data: {
      title: nextTitle,
      summary: nextSummary,
      data: nextData,
      reviewNotes: nextNotes,
      status: draft.status === 'approved' ? 'needs_review' : draft.status,
      version: draft.version + 1,
    },
  });

  await appendMessage(workspaceId, {
    role: 'system',
    kind: 'status',
    content: `Saved edits to "${nextTitle}".`,
    metadata: {
      draftId,
    },
  });

  await prisma.grantWorkspace.update({
    where: { id: workspaceId },
    data: {
      lastActivityAt: new Date(),
    },
  });

  return hydrateWorkspace(workspaceId);
}

export async function selectGrantOpportunity(actor, workspaceId, opportunity) {
  ensureActor(actor);
  await getOwnedWorkspace(actor, workspaceId);

  if (!opportunity || typeof opportunity !== 'object' || !opportunity.programName) {
    throw buildHttpError(400, 'A ranked grant opportunity is required');
  }

  await prisma.grantWorkspace.update({
    where: { id: workspaceId },
    data: {
      selectedOpportunity: opportunity,
      lastActivityAt: new Date(),
    },
  });

  await appendMessage(workspaceId, {
    role: 'system',
    kind: 'status',
    content: `Selected "${opportunity.programName}" for application prep.`,
  });

  return hydrateWorkspace(workspaceId);
}

export async function getGrantDriveStatus(actor, workspaceId) {
  ensureActor(actor);
  const workspace = await getOwnedWorkspace(actor, workspaceId);

  if (!isComposioConfigured()) {
    return upsertDriveConnection(workspace.id, {
      status: 'disconnected',
      errorMessage: 'COMPOSIO_API_KEY is not configured',
      lastCheckedAt: new Date(),
    });
  }

  const composioUserId = buildGrantComposioUserId(workspace);
  const status = await getGoogleDriveConnectionStatus(composioUserId);

  return upsertDriveConnection(workspace.id, {
    status: status.status,
    connectedAccountId: status.connectedAccountId,
    toolkitSlug: status.toolkitSlug,
    connectedAt: status.connectedAccountId ? new Date() : null,
    lastCheckedAt: new Date(),
    errorMessage: null,
  });
}

export async function beginGrantDriveConnection(actor, workspaceId, callbackUrl) {
  ensureActor(actor);
  const workspace = await getOwnedWorkspace(actor, workspaceId);

  if (!isComposioConfigured()) {
    throw buildHttpError(503, 'COMPOSIO_API_KEY is not configured');
  }

  const composioUserId = buildGrantComposioUserId(workspace);
  const connectionRequest = await startGoogleDriveConnection(composioUserId, callbackUrl);

  const connection = await upsertDriveConnection(workspace.id, {
    status: 'initiated',
    connectionRequestId: connectionRequest.connectionRequestId,
    redirectUrl: connectionRequest.redirectUrl,
    lastCheckedAt: new Date(),
    errorMessage: null,
  });

  return {
    connection,
    redirectUrl: connectionRequest.redirectUrl,
  };
}

export async function handleGrantDriveCallback(workspaceId, callback = {}) {
  await getWorkspaceRecord(workspaceId);

  const status = callback.status === 'success' ? 'connected' : 'failed';
  return upsertDriveConnection(workspaceId, {
    status,
    connectedAccountId: callback.connectedAccountId || null,
    connectedAt: callback.connectedAccountId ? new Date() : null,
    lastCheckedAt: new Date(),
    errorMessage: status === 'failed' ? (callback.errorMessage || 'Google Drive connection failed') : null,
  });
}

export async function syncGrantDraftToDrive(actor, workspaceId, draftId) {
  ensureActor(actor);
  const workspace = await getOwnedWorkspace(actor, workspaceId);
  const hydrated = await hydrateWorkspace(workspace.id);
  const draft = hydrated?.drafts?.find((item) => item.id === draftId)
    || hydrated?.drafts?.[0]
    || null;

  if (!draft) {
    throw buildHttpError(404, 'Grant draft not found');
  }

  if (!isComposioConfigured()) {
    throw buildHttpError(503, 'COMPOSIO_API_KEY is not configured');
  }

  const connection = await getGrantDriveStatus(actor, workspace.id);
  if (connection.status !== 'connected') {
    throw buildHttpError(409, 'Google Drive is not connected for this grant workspace');
  }

  const syncRow = await prisma.grantDriveSync.create({
    data: {
      workspaceId: workspace.id,
      draftId: draft.id,
      provider: 'google_drive',
      status: 'pending',
    },
  });

  const fileName = `${sanitizeFileName(workspace.organizationName)}-${sanitizeFileName(draft.title)}.md`;
  const filePath = path.join(os.tmpdir(), `${crypto.randomUUID()}-${fileName}`);

  try {
    await fs.writeFile(filePath, buildDriveFileMarkdown(hydrated, draft), 'utf8');

    const composioUserId = buildGrantComposioUserId(workspace);
    const uploaded = await uploadFileToGoogleDrive(composioUserId, filePath);

    await prisma.grantApplicationDraft.update({
      where: { id: draft.id },
      data: {
        driveFileId: uploaded.fileId,
        driveFileName: uploaded.fileName,
        driveFileUrl: uploaded.fileUrl,
        driveSyncedAt: new Date(),
      },
    });

    await prisma.grantDriveSync.update({
      where: { id: syncRow.id },
      data: {
        status: 'synced',
        fileId: uploaded.fileId,
        fileName: uploaded.fileName,
        fileUrl: uploaded.fileUrl,
        metadata: uploaded.metadata || undefined,
        syncedAt: new Date(),
      },
    });

    await appendMessage(workspace.id, {
      role: 'system',
      kind: 'status',
      content: `Synced "${draft.title}" to Google Drive.`,
      metadata: {
        draftId: draft.id,
        fileUrl: uploaded.fileUrl,
      },
    });

    await prisma.grantWorkspace.update({
      where: { id: workspace.id },
      data: {
        lastActivityAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.grantDriveSync.update({
      where: { id: syncRow.id },
      data: {
        status: 'failed',
        errorMessage: error.message || 'Drive sync failed',
      },
    });

    throw error;
  } finally {
    await fs.rm(filePath, { force: true }).catch(() => {});
  }

  return hydrateWorkspace(workspace.id);
}

export default {
  beginGrantDriveConnection,
  createGrantWorkspace,
  getGrantDriveStatus,
  getGrantWorkspace,
  handleGrantDriveCallback,
  listGrantWorkspaces,
  reviewGrantDraft,
  runGrantWorkspaceTurn,
  selectGrantOpportunity,
  syncGrantDraftToDrive,
  updateGrantDraft,
  updateGrantWorkspace,
};
