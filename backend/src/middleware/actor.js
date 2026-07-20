import authService from '../services/auth.service.js';
import { config, isProduction } from '../config/index.js';
import { AuthenticationError } from '../utils/errors.js';

export const SESSION_HEADER = 'x-mvoe-session-id';

function normalizeSessionId(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) return null;

  return trimmed;
}

function getSessionId(request) {
  return normalizeSessionId(request.headers[SESSION_HEADER]);
}

async function resolveActor(request) {
  const sessionId = getSessionId(request);
  const authHeader = request.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const user = await authService.verifyToken(token, request.server);

      request.user = user;
      request.actor = {
        userId: user.id,
        sessionId: sessionId || null,
        actorType: 'user',
        isGuest: false,
      };

      return request.actor;
    } catch (_error) {
      request.user = null;
    }
  }

  if (sessionId) {
    request.user = null;
    request.actor = {
      userId: null,
      sessionId,
      actorType: 'session',
      isGuest: true,
    };

    return request.actor;
  }

  request.user = null;
  request.actor = null;
  return null;
}

export async function optionalActor(request, _reply) {
  await resolveActor(request);
}

export async function requireActor(request, _reply) {
  const actor = await resolveActor(request);

  if (!actor) {
    throw new AuthenticationError('Anonymous session required');
  }

  if (actor.isGuest && isProduction() && !config.allowGuestWrites) {
    throw new AuthenticationError('Sign in is required for public writes');
  }
}

export function buildActorLookup(actor, { userField, sessionField }) {
  if (!actor) return null;

  if (actor.userId) {
    return { [userField]: actor.userId };
  }

  if (actor.sessionId) {
    return { [sessionField]: actor.sessionId };
  }

  return null;
}

export function actorOwnsRecord(actor, record, { userField, sessionField }) {
  if (!actor || !record) return false;

  if (actor.userId && record[userField] && actor.userId === record[userField]) {
    return true;
  }

  if (actor.sessionId && record[sessionField] && actor.sessionId === record[sessionField]) {
    return true;
  }

  return false;
}
