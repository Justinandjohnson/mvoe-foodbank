import path from 'node:path';
import { Composio } from '@composio/core';
import { config } from '../config/index.js';

let composioClient = null;

function normalizeToolkitConnectionStatus(toolkit) {
  const connectedAccount = toolkit?.connection?.connectedAccount || null;
  if (connectedAccount?.id) {
    return {
      status: 'connected',
      connectedAccountId: connectedAccount.id,
      toolkitSlug: toolkit?.slug || 'googledrive',
      connectedAccount,
    };
  }

  const rawStatus = String(toolkit?.connection?.status || toolkit?.status || '').toLowerCase();
  if (rawStatus === 'initiated' || rawStatus === 'failed' || rawStatus === 'expired' || rawStatus === 'inactive') {
    return {
      status: rawStatus,
      connectedAccountId: null,
      toolkitSlug: toolkit?.slug || 'googledrive',
      connectedAccount: null,
    };
  }

  return {
    status: 'disconnected',
    connectedAccountId: null,
    toolkitSlug: toolkit?.slug || 'googledrive',
    connectedAccount: null,
  };
}

function pickGoogleDriveToolkit(toolkits = []) {
  return toolkits.find((toolkit) => String(toolkit?.slug || toolkit?.name || '').toLowerCase() === 'googledrive') || null;
}

function getComposioClient() {
  if (!config.composioApiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured');
  }

  if (!composioClient) {
    composioClient = new Composio({
      apiKey: config.composioApiKey,
    });
  }

  return composioClient;
}

export function isComposioConfigured() {
  return Boolean(config.composioApiKey);
}

export function buildGrantComposioUserId(actorOrWorkspace = {}) {
  if (actorOrWorkspace.userId || actorOrWorkspace.actorUserId) {
    return `mvoe-user:${actorOrWorkspace.userId || actorOrWorkspace.actorUserId}`;
  }

  if (actorOrWorkspace.sessionId || actorOrWorkspace.actorSessionId) {
    return `mvoe-session:${actorOrWorkspace.sessionId || actorOrWorkspace.actorSessionId}`;
  }

  throw new Error('Grant workspace actor identity is required for Composio');
}

async function getGoogleDriveSession(composioUserId) {
  const composio = getComposioClient();
  return composio.create(composioUserId, {
    manageConnections: false,
  });
}

export async function getGoogleDriveConnectionStatus(composioUserId) {
  const session = await getGoogleDriveSession(composioUserId);
  const toolkits = await session.toolkits();
  const googleDriveToolkit = pickGoogleDriveToolkit(toolkits?.items || []);
  return normalizeToolkitConnectionStatus(googleDriveToolkit);
}

export async function startGoogleDriveConnection(composioUserId, callbackUrl) {
  const session = await getGoogleDriveSession(composioUserId);
  const connectionRequest = await session.authorize('googledrive', {
    callbackUrl,
  });

  return {
    connectionRequestId: connectionRequest.id,
    redirectUrl: connectionRequest.redirectUrl,
  };
}

export async function uploadFileToGoogleDrive(composioUserId, filePath) {
  const composio = getComposioClient();
  const result = await composio.tools.execute('GOOGLEDRIVE_UPLOAD_FILE', {
    userId: composioUserId,
    arguments: {
      file_to_upload: filePath,
    },
  });

  const data = result?.data || result?.result || result || {};
  const fileId = data?.id || data?.fileId || data?.file_id || null;
  const fileName = data?.name || data?.title || path.basename(filePath);
  const fileUrl = data?.webViewLink
    || data?.alternateLink
    || data?.url
    || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : null);

  return {
    raw: result,
    fileId,
    fileName,
    fileUrl,
    metadata: data,
  };
}

export default {
  buildGrantComposioUserId,
  getGoogleDriveConnectionStatus,
  isComposioConfigured,
  startGoogleDriveConnection,
  uploadFileToGoogleDrive,
};
