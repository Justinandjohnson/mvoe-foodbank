const GUEST_MEAL_PLANNER_LIMIT = 50;
const GUEST_MEAL_PLANNER_WINDOW_MS = 15 * 60 * 1000;
const guestMealPlannerAttempts = new Map();

export function getClientAddress(request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return request.ip || request.socket?.remoteAddress || 'unknown';
}

export function checkGuestRateLimit(clientIp, now = Date.now()) {
  const recentAttempts = (guestMealPlannerAttempts.get(clientIp) || []).filter(
    (timestamp) => now - timestamp < GUEST_MEAL_PLANNER_WINDOW_MS
  );

  if (recentAttempts.length >= GUEST_MEAL_PLANNER_LIMIT) {
    guestMealPlannerAttempts.set(clientIp, recentAttempts);
    return false;
  }

  recentAttempts.push(now);
  guestMealPlannerAttempts.set(clientIp, recentAttempts);
  return true;
}

export function getGuestAccessToken(request) {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return request.headers['x-guest-access-token'];
}
