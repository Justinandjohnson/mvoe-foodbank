const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE = 'America/Chicago';

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoOrNull(value) {
  return value ? validDate(value)?.toISOString() || null : null;
}

function parseTimeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.trim().toUpperCase();
  const twelveHour = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2] || '0');
    if (hours < 1 || hours > 12 || minutes > 59) return null;
    if (twelveHour[3] === 'AM' && hours === 12) hours = 0;
    if (twelveHour[3] === 'PM' && hours !== 12) hours += 12;
    return (hours * 60) + minutes;
  }
  const twentyFourHour = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHour) return null;
  const hours = Number(twentyFourHour[1]);
  const minutes = Number(twentyFourHour[2]);
  return hours <= 23 && minutes <= 59 ? (hours * 60) + minutes : null;
}

function parseHoursRanges(value) {
  if (!value || typeof value !== 'string' || /closed/i.test(value)) return [];
  return value.split(',').map((segment) => {
    const match = segment.trim().match(/^(.+?)\s*(?:-|–|—)\s*(.+)$/);
    if (!match) return null;
    const startMinute = parseTimeToMinutes(match[1]);
    const endMinute = parseTimeToMinutes(match[2]);
    return startMinute == null || endMinute == null ? null : { startMinute, endMinute };
  }).filter(Boolean);
}

function normalizeHours(hours) {
  if (!hours) return null;
  if (typeof hours === 'object') return hours;
  if (typeof hours === 'string') {
    try {
      return JSON.parse(hours);
    } catch {
      return null;
    }
  }
  return null;
}

function serializeWindow(start, end, details = {}) {
  return {
    id: details.id || null,
    category: details.category || null,
    startTime: start.toISOString(),
    endTime: end?.toISOString() || null,
    timezone: details.timezone || null,
    sourceText: details.sourceText || null,
  };
}

function availabilityResult(currentWindow, nextWindow, hasSchedule) {
  return {
    availabilityStatus: currentWindow ? 'available_now' : nextWindow ? 'upcoming' : hasSchedule ? 'unavailable' : 'unknown',
    isAvailableAtReferenceTime: Boolean(currentWindow),
    currentWindow: currentWindow || null,
    nextWindow: nextWindow || null,
  };
}

export function normalizeTimezone(value) {
  const timezone = String(value || '').trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function getFoodBankHoursState(hours, referenceDate = new Date(), timezoneValue = DEFAULT_TIMEZONE) {
  const reference = validDate(referenceDate) || new Date();
  const timezone = normalizeTimezone(timezoneValue);
  const normalizedHours = normalizeHours(hours);
  if (!normalizedHours) {
    return { openNow: null, todaysHours: null, ...availabilityResult(null, null, false) };
  }

  const localToday = zonedParts(reference, timezone).dateKey;
  const todayWeekday = new Date(`${localToday}T00:00:00Z`).getUTCDay();
  const todaysHours = normalizedHours[DAY_KEYS[todayWeekday]];
  const candidates = [];
  for (let dayOffset = -1; dayOffset <= 7; dayOffset += 1) {
    const localDateKey = addDateDays(localToday, dayOffset);
    const weekday = new Date(`${localDateKey}T00:00:00Z`).getUTCDay();
    parseHoursRanges(normalizedHours[DAY_KEYS[weekday]]).forEach(({ startMinute, endMinute }) => {
      const start = zonedLocalToDate(localDateKey, startMinute, timezone);
      const endDateKey = endMinute <= startMinute ? addDateDays(localDateKey, 1) : localDateKey;
      const end = zonedLocalToDate(endDateKey, endMinute, timezone);
      candidates.push({ start, end });
    });
  }

  const current = candidates.find(({ start, end }) => reference >= start && reference < end);
  const next = candidates.filter(({ start }) => start > reference).sort((a, b) => a.start - b.start)[0];
  const currentWindow = current ? serializeWindow(current.start, current.end, { timezone }) : null;
  const nextWindow = next ? serializeWindow(next.start, next.end, { timezone }) : null;
  return {
    openNow: Boolean(current),
    todaysHours: todaysHours || 'Closed',
    ...availabilityResult(currentWindow, nextWindow, true),
  };
}

function zonedParts(value, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(value)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  const dateKey = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return { ...parts, dateKey, minuteOfDay: (parts.hour * 60) + parts.minute };
}

function addDateDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function zonedLocalToDate(dateKey, minute, timezone) {
  const normalizedDateKey = minute === 1440 ? addDateDays(dateKey, 1) : dateKey;
  const normalizedMinute = minute === 1440 ? 0 : minute;
  const [year, month, day] = normalizedDateKey.split('-').map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, Math.floor(normalizedMinute / 60), normalizedMinute % 60);
  let candidate = new Date(targetAsUtc);
  for (let pass = 0; pass < 2; pass += 1) {
    const shown = zonedParts(candidate, timezone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
    candidate = new Date(candidate.getTime() + targetAsUtc - shownAsUtc);
  }
  return candidate;
}

function isOrdinalMatch(dateKey, ordinal) {
  return !ordinal || Math.ceil(Number(dateKey.slice(-2)) / 7) === Number(ordinal);
}

export function normalizeResourceCategory(value, searchableText = '') {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const text = `${raw} ${searchableText}`.toLowerCase();
  if (['food_bank', 'pantry', 'community_fridge', 'meal', 'pop_up'].includes(raw)) return raw;
  if (raw === 'food_pantry') return 'pantry';
  if (raw === 'community_meal') return 'meal';
  if (/\b(fridge|freedge)\b/.test(text)) return 'community_fridge';
  if (/\b(pop[ -]?up|mobile distribution|one[ -]?time)\b/.test(text)) return 'pop_up';
  if (/\b(meal|breakfast|lunch|dinner|supper)\b/.test(text)) return 'meal';
  if (/\bpantr(y|ies)\b/.test(text)) return 'pantry';
  if (/\bfood bank\b/.test(text)) return 'food_bank';
  if (raw === 'event') return 'pop_up';
  return 'pantry';
}

function normalizeAvailabilityWindow(row, fallbackCategory) {
  const startMinute = Number(row?.start_minute);
  const endMinute = Number(row?.end_minute);
  if (!row?.entry_id || !['recurring', 'date_specific'].includes(row.kind)) return null;
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute) || startMinute < 0 || endMinute > 1440 || endMinute <= startMinute) return null;
  const dayOfWeek = row.day_of_week == null ? null : Number(row.day_of_week);
  if (row.kind === 'recurring' && (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)) return null;
  if (row.kind === 'date_specific' && !/^\d{4}-\d{2}-\d{2}$/.test(row.specific_date || '')) return null;
  const timezone = row.timezone || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
  } catch {
    return null;
  }
  return {
    ...row,
    startMinute,
    endMinute,
    timezone,
    category: normalizeResourceCategory(row.category || fallbackCategory, row.source_text || ''),
  };
}

function occurrenceForDate(window, dateKey) {
  const dayOfWeek = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const matches = window.kind === 'date_specific'
    ? window.specific_date === dateKey
    : Number(window.day_of_week) === dayOfWeek && isOrdinalMatch(dateKey, window.recurrence_ordinal);
  if (!matches) return null;
  const start = zonedLocalToDate(dateKey, window.startMinute, window.timezone);
  const end = zonedLocalToDate(dateKey, window.endMinute, window.timezone);
  return {
    start,
    end,
    serialized: serializeWindow(start, end, {
      id: window.id,
      category: window.category,
      timezone: window.timezone,
      sourceText: window.source_text,
    }),
  };
}

export function evaluateAvailabilityWindows(rows, referenceDate = new Date(), fallbackCategory = 'pantry') {
  const reference = validDate(referenceDate) || new Date();
  const windows = (rows || []).map((row) => normalizeAvailabilityWindow(row, fallbackCategory)).filter(Boolean);
  const occurrences = [];
  windows.forEach((window) => {
    const localToday = zonedParts(reference, window.timezone).dateKey;
    for (let offset = 0; offset <= 8; offset += 1) {
      const occurrence = occurrenceForDate(window, addDateDays(localToday, offset));
      if (occurrence) occurrences.push(occurrence);
    }
  });
  occurrences.sort((a, b) => a.start - b.start);
  const current = occurrences.find(({ start, end }) => reference >= start && reference < end);
  const next = occurrences.find(({ start }) => start > reference);
  const horizon = reference.getTime() + ONE_DAY_MS;
  return {
    ...availabilityResult(current?.serialized, next?.serialized, windows.length > 0),
    upcomingWithin24Hours: occurrences
      .filter(({ start }) => start > reference && start.getTime() <= horizon)
      .map(({ serialized }) => serialized),
  };
}

export function getHoursVerificationState(updatedAt, referenceDate = new Date()) {
  const lastVerifiedAt = updatedAt ? validDate(updatedAt) : null;
  const needsHoursVerification = !lastVerifiedAt || (referenceDate.getTime() - lastVerifiedAt.getTime()) >= ONE_WEEK_MS;
  return { hoursLastVerifiedAt: lastVerifiedAt?.toISOString() || null, needsHoursVerification };
}

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3959;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusMiles * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function withinRadius(item, latitude, longitude, radiusMiles = 25) {
  if (latitude == null || longitude == null) return true;
  const itemLatitude = item.latitude ?? item.lat;
  const itemLongitude = item.longitude ?? item.lng;
  if (itemLatitude == null || itemLongitude == null) return false;
  return haversineMiles(latitude, longitude, itemLatitude, itemLongitude) <= radiusMiles;
}

export async function collectChunkedPages(values, loadPage, options = {}) {
  const chunkSize = options.chunkSize || 100;
  const pageSize = options.pageSize || 1000;
  const uniqueValues = [...new Set((values || []).filter(Boolean))];
  const chunks = [];
  for (let index = 0; index < uniqueValues.length; index += chunkSize) {
    chunks.push(uniqueValues.slice(index, index + chunkSize));
  }

  const chunkResults = await Promise.all(chunks.map(async (chunk) => {
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await loadPage(chunk, offset, offset + pageSize - 1);
      if (page?.error) throw page.error;
      const data = page?.data || [];
      rows.push(...data);
      if (data.length < pageSize) break;
    }
    return rows;
  }));

  return chunkResults.flat();
}

export function partitionLiveFeedItems(groups, referenceDate = new Date()) {
  const reference = validDate(referenceDate) || new Date();
  const source = {
    foodBanks: groups?.foodBanks || [],
    beacons: groups?.beacons || [],
    events: groups?.events || [],
    austinIndex: groups?.austinIndex || [],
  };
  const all = [...source.foodBanks, ...source.beacons, ...source.events, ...source.austinIndex];
  const horizon = reference.getTime() + ONE_DAY_MS;
  const upcoming = all
    .filter((item) => {
      if (item.isAvailableAtReferenceTime) return false;
      const start = validDate(item.nextWindow?.startTime);
      return start && start > reference && start.getTime() <= horizon;
    })
    .map((item) => ({ ...item, upcomingWindow: item.nextWindow }))
    .sort((left, right) => new Date(left.upcomingWindow.startTime) - new Date(right.upcomingWindow.startTime));

  return {
    all,
    upcoming,
    foodBanks: source.foodBanks.filter((item) => item.isAvailableAtReferenceTime),
    beacons: source.beacons.filter((item) => item.isAvailableAtReferenceTime),
    events: source.events.filter((item) => item.isAvailableAtReferenceTime),
    austinIndex: source.austinIndex.filter((item) => item.isAvailableAtReferenceTime),
  };
}

export function buildFoodBankMapItem(foodBank, referenceDate = new Date()) {
  const timezone = normalizeTimezone(foodBank.timezone);
  const hoursState = getFoodBankHoursState(foodBank.hours, referenceDate, timezone);
  return {
    id: foodBank.id,
    markerType: 'food_bank',
    category: normalizeResourceCategory(foodBank.type || 'food_bank', foodBank.name),
    type: foodBank.type,
    name: foodBank.name,
    description: foodBank.description || '',
    address: foodBank.address || '',
    city: foodBank.city || '',
    state: foodBank.state || '',
    phone: foodBank.phone || '',
    lat: foodBank.latitude,
    lng: foodBank.longitude,
    timezone,
    hours: normalizeHours(foodBank.hours),
    ...hoursState,
    foodAvailable: foodBank.status?.foodAvailable || 'unknown',
    waitTimeMinutes: foodBank.status?.waitTimeMinutes ?? null,
    capacityPercentage: foodBank.status?.capacityPercentage ?? null,
    statusNotes: foodBank.status?.notes || '',
    isStatusStale: foodBank.status?.isStale || false,
    ...getHoursVerificationState(foodBank.updatedAt, referenceDate),
  };
}

export function buildBeaconMapItem(beacon, referenceDate = new Date()) {
  const reference = validDate(referenceDate) || new Date();
  const availableFrom = validDate(beacon.availableFrom);
  const availableUntil = validDate(beacon.availableUntil);
  const hasStarted = !availableFrom || reference >= availableFrom;
  const hasEnded = availableUntil ? reference >= availableUntil : false;
  const isAvailable = Boolean(beacon.isActive && hasStarted && !hasEnded);
  const currentWindow = isAvailable ? serializeWindow(availableFrom || reference, availableUntil, { category: 'pop_up' }) : null;
  const nextWindow = beacon.isActive && availableFrom && reference < availableFrom
    ? serializeWindow(availableFrom, availableUntil, { category: 'pop_up' }) : null;
  return {
    id: beacon.id, markerType: 'food_beacon', category: 'pop_up', name: beacon.title,
    description: beacon.description || '', address: beacon.locationLabel || '', locationLabel: beacon.locationLabel || '',
    lat: beacon.latitude, lng: beacon.longitude, quantityLevel: beacon.quantityLevel, foodTypes: beacon.foodTypes || '',
    photoUrl: beacon.photoUrl || null, availableFrom: isoOrNull(beacon.availableFrom), availableUntil: isoOrNull(beacon.availableUntil),
    isActive: isAvailable, isExpired: hasEnded,
    ...availabilityResult(currentWindow, nextWindow, Boolean(beacon.isActive)),
    createdAt: isoOrNull(beacon.createdAt), updatedAt: isoOrNull(beacon.updatedAt),
  };
}

export function buildCommunityEventMapItem(event, referenceDate = new Date()) {
  const reference = validDate(referenceDate) || new Date();
  const startTime = validDate(event.startTime || event.startsAt);
  const endTime = validDate(event.endTime || event.endsAt);
  const canceled = ['cancelled', 'canceled'].includes(String(event.status || '').toLowerCase());
  const eligible = !canceled && event.isPublic !== false;
  const isLiveNow = Boolean(startTime && endTime && eligible && reference >= startTime && reference < endTime);
  const category = normalizeResourceCategory(event.eventType, event.eventName || event.title);
  const currentWindow = isLiveNow ? serializeWindow(startTime, endTime, { category }) : null;
  const nextWindow = startTime && endTime && eligible && reference < startTime ? serializeWindow(startTime, endTime, { category }) : null;
  return {
    id: event.id, markerType: 'community_event', category, name: event.eventName || event.title,
    description: event.description || '', address: event.location || event.locationLabel || '',
    eventType: event.eventType || 'community_meal', location: event.location || event.locationLabel || '',
    lat: event.latitude, lng: event.longitude, startTime: startTime?.toISOString() || null, endTime: endTime?.toISOString() || null,
    eventDate: isoOrNull(event.eventDate || event.startsAt || event.startTime), targetServings: event.targetServings || 0,
    volunteerCount: event._count?.volunteers || event.volunteers?.length || 0,
    resourceCount: event._count?.resources || event.resources?.length || 0,
    isPublic: event.isPublic, isLiveNow,
    ...availabilityResult(currentWindow, nextWindow, Boolean(startTime && endTime && eligible)),
    status: event.status,
  };
}
