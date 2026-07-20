import { io } from 'socket.io-client';
import { config } from '../../config';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(config.wsUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }

  return socket;
}

export function subscribeToAgentEvents(handlers = {}) {
  const client = getSocket();

  if (handlers.onProgress) client.on('agent:progress', handlers.onProgress);
  if (handlers.onComplete) client.on('agent:complete', handlers.onComplete);
  if (handlers.onError) client.on('agent:error', handlers.onError);

  return () => {
    if (handlers.onProgress) client.off('agent:progress', handlers.onProgress);
    if (handlers.onComplete) client.off('agent:complete', handlers.onComplete);
    if (handlers.onError) client.off('agent:error', handlers.onError);
  };
}

export function joinAgentSession(sessionId) {
  if (!sessionId) return;
  getSocket().emit('join-session', sessionId);
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
