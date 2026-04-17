// WebSocket Service for real-time agent updates
import { io } from 'socket.io-client';
import { API_URL } from '../config/api';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.sessionId = null;
    this.listeners = new Map();
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.socket?.connected) {
      console.log('WebSocket already connected');
      return;
    }

    // Extract base URL without /api path
    const baseUrl = API_URL.replace('/api', '');

    this.socket = io(baseUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket.id);
      this.connected = true;

      // Rejoin session if we were in one
      if (this.sessionId) {
        this.joinSession(this.sessionId);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.connected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    // Agent events
    this.socket.on('agent:progress', (data) => {
      console.log('Agent progress:', data);
      this.emitToListeners('agent:progress', data);
    });

    this.socket.on('agent:complete', (data) => {
      console.log('Agent complete:', data);
      this.emitToListeners('agent:complete', data);
    });

    this.socket.on('agent:error', (data) => {
      console.error('Agent error:', data);
      this.emitToListeners('agent:error', data);
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.sessionId = null;
    }
  }

  /**
   * Join a session room
   */
  joinSession(sessionId) {
    if (!this.socket?.connected) {
      console.warn('Cannot join session: WebSocket not connected');
      return;
    }

    this.sessionId = sessionId;
    this.socket.emit('join-session', sessionId);
    console.log('Joined session:', sessionId);
  }

  /**
   * Leave current session
   */
  leaveSession() {
    this.sessionId = null;
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (!this.listeners.has(event)) return;

    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * Emit event to all registered listeners
   */
  emitToListeners(event, data) {
    if (!this.listeners.has(event)) return;

    const callbacks = this.listeners.get(event);
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    });
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.socket?.connected;
  }
}

// Export singleton instance
export default new WebSocketService();
