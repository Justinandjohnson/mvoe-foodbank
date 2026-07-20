const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function parseMinutesPart(value) {
  const [hoursString, minutesString = '0'] = value.split(':');
  return Number(hoursString) * 60 + Number(minutesString);
}

function parseTimeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;

  const cleaned = value.trim().toUpperCase();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || '0');
  const meridiem = match[3];

  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (meridiem === 'PM' && hours !== 12) hours += 12;

  return (hours * 60) + minutes;
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

export function getFoodBankHoursState(hours, referenceDate = new Date()) {
  const normalizedHours = normalizeHours(hours);
  if (!normalizedHours) {
    return {
      openNow: null,
      todaysHours: null,
    };
  }

  const dayKey = DAY_KEYS[referenceDate.getDay()];
  const todaysHours = normalizedHours[dayKey];

  if (!todaysHours || /closed/i.test(todaysHours)) {
    return {
      openNow: false,
      todaysHours: todaysHours || 'Closed',
    };
  }

  const currentMinutes = parseMinutesPart(
    `${referenceDate.getHours()}:${String(referenceDate.getMinutes()).padStart(2, '0')}`
  );

  const ranges = todaysHours
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const openNow = ranges.some((range) => {
    const [startString, endString] = range.split(' - ').map((segment) => segment.trim());
    const startMinutes = parseTimeToMinutes(startString);
    const endMinutes = parseTimeToMinutes(endString);

    if (startMinutes == null || endMinutes == null) return false;
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  });

  return {
    openNow,
    todaysHours,
  };
}

export function getHoursVerificationState(updatedAt, referenceDate = new Date()) {
  const lastVerifiedAt = updatedAt ? new Date(updatedAt) : null;
  const needsHoursVerification = !lastVerifiedAt || (referenceDate.getTime() - lastVerifiedAt.getTime()) >= ONE_WEEK_MS;

  return {
    hoursLastVerifiedAt: lastVerifiedAt?.toISOString() || null,
    needsHoursVerification,
  };
}

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3959;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);

  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1))
    * Math.cos(toRadians(lat2))
    * Math.sin(deltaLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

export function withinRadius(item, latitude, longitude, radiusMiles = 25) {
  if (latitude == null || longitude == null) return true;
  if (item.latitude == null || item.longitude == null) return false;

  return haversineMiles(latitude, longitude, item.latitude, item.longitude) <= radiusMiles;
}

export function buildFoodBankMapItem(foodBank, referenceDate = new Date()) {
  const { openNow, todaysHours } = getFoodBankHoursState(foodBank.hours, referenceDate);
  const verificationState = getHoursVerificationState(foodBank.updatedAt, referenceDate);
  const status = foodBank.status?.foodAvailable || 'unknown';

  return {
    id: foodBank.id,
    markerType: 'food_bank',
    type: foodBank.type,
    name: foodBank.name,
    description: foodBank.description || '',
    address: foodBank.address || '',
    city: foodBank.city || '',
    state: foodBank.state || '',
    phone: foodBank.phone || '',
    lat: foodBank.latitude,
    lng: foodBank.longitude,
    hours: normalizeHours(foodBank.hours),
    todaysHours,
    openNow,
    foodAvailable: status,
    waitTimeMinutes: foodBank.status?.waitTimeMinutes ?? null,
    capacityPercentage: foodBank.status?.capacityPercentage ?? null,
    statusNotes: foodBank.status?.notes || '',
    isStatusStale: foodBank.status?.isStale || false,
    ...verificationState,
  };
}

export function buildBeaconMapItem(beacon, referenceDate = new Date()) {
  const availableUntil = beacon.availableUntil ? new Date(beacon.availableUntil) : null;
  const isExpired = availableUntil ? availableUntil.getTime() < referenceDate.getTime() : false;

  return {
    id: beacon.id,
    markerType: 'food_beacon',
    name: beacon.title,
    description: beacon.description || '',
    address: beacon.locationLabel || '',
    locationLabel: beacon.locationLabel || '',
    lat: beacon.latitude,
    lng: beacon.longitude,
    quantityLevel: beacon.quantityLevel,
    foodTypes: beacon.foodTypes || '',
    photoUrl: beacon.photoUrl || null,
    availableFrom: beacon.availableFrom?.toISOString?.() || beacon.availableFrom,
    availableUntil: availableUntil?.toISOString() || null,
    isActive: beacon.isActive && !isExpired,
    isExpired,
    createdAt: beacon.createdAt?.toISOString?.() || beacon.createdAt,
    updatedAt: beacon.updatedAt?.toISOString?.() || beacon.updatedAt,
  };
}

export function buildCommunityEventMapItem(event, referenceDate = new Date()) {
  const startTime = new Date(event.startTime);
  const endTime = new Date(event.endTime);
  const isLiveNow = referenceDate >= startTime && referenceDate <= endTime;

  return {
    id: event.id,
    markerType: 'community_event',
    name: event.eventName,
    description: event.description || '',
    address: event.location || '',
    eventType: event.eventType || 'community_meal',
    location: event.location || '',
    lat: event.latitude,
    lng: event.longitude,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    eventDate: new Date(event.eventDate).toISOString(),
    targetServings: event.targetServings || 0,
    volunteerCount: event._count?.volunteers || event.volunteers?.length || 0,
    resourceCount: event._count?.resources || event.resources?.length || 0,
    isPublic: event.isPublic,
    isLiveNow,
    status: event.status,
  };
}
