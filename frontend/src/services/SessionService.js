import { StorageService } from './StorageService';

const SESSION_STORAGE_KEY = 'mvoe_session_id';

let cachedSessionId = null;

function createSessionId() {
  return `mvoe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class SessionService {
  static async ensureSessionId() {
    if (cachedSessionId) {
      return cachedSessionId;
    }

    const stored = await StorageService.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      cachedSessionId = stored;
      return stored;
    }

    const created = createSessionId();
    await StorageService.setItem(SESSION_STORAGE_KEY, created);
    cachedSessionId = created;
    return created;
  }

  static async getSessionId() {
    return this.ensureSessionId();
  }

  static async resetSessionId() {
    const nextSessionId = createSessionId();
    await StorageService.setItem(SESSION_STORAGE_KEY, nextSessionId);
    cachedSessionId = nextSessionId;
    return nextSessionId;
  }
}

export default SessionService;
