import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import FoodBankMap from '../components/FoodBankMap';
import {
  assignVolunteerGroup,
  assignVolunteerTags,
  broadcastVolunteerSmsByTag,
  broadcastVolunteerSms,
  getVolunteerSignupShare,
  getVolunteerSummary,
  listVolunteerTags,
  listVolunteers,
  sendVolunteerChatMessage,
  sendVolunteerSms,
} from '../api/agentService';
import { communityService, foodBankService } from '../api/services';
import { foodBeaconService, mapService } from '../api/supabaseServices';
import { publicPhotoUrl } from '../api/supabaseClient';
import { pickAndUploadImage } from '../api/imageUpload';
import { useAuth } from '../contexts/AuthContext';
import { config } from '../../config';

const AUSTIN_TYPE_LABELS = {
  food_bank: 'Food Bank',
  pantry: 'Pantry',
  community_fridge: 'Community Fridge',
  meal: 'Meal',
  program: 'Program',
  event: 'Event',
};

const LAYER_OPTIONS = [
  { key: 'foodBanks', label: 'Food banks', glyph: 'B', icon: 'business', color: '#22C55E' },
  { key: 'pantries', label: 'Pantries', glyph: 'P', icon: 'basket', color: '#0EA5E9' },
  { key: 'fridges', label: 'Community fridges', glyph: 'F', icon: 'snow', color: '#06B6D4' },
  { key: 'meals', label: 'Meals', glyph: 'M', icon: 'restaurant', color: '#8B5CF6' },
  { key: 'popups', label: 'Pop-ups / food events', glyph: 'E', icon: 'calendar', color: '#F97316' },
  { key: 'beacons', label: 'Neighbor beacons', glyph: 'N', icon: 'radio', color: '#F59E0B' },
];

const TIME_STEP_MS = 3 * 60 * 60 * 1000;
const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;
const LIVE_CLOCK_INTERVAL_MS = 60 * 1000;
const LIVE_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

const RADIUS_OPTIONS = [10, 25, 50];

const QUANTITY_OPTIONS = [
  { key: 'few', label: 'A few', hint: 'Small pickup', color: '#F59E0B' },
  { key: 'some', label: 'Some', hint: 'Good amount', color: '#22C55E' },
  { key: 'many', label: 'A lot', hint: 'Large pickup', color: '#10B981' },
];

const AVAILABILITY_OPTIONS = [
  { key: '2h', label: '2h', hours: 2 },
  { key: '6h', label: '6h', hours: 6 },
  { key: '12h', label: '12h', hours: 12 },
  { key: '24h', label: '24h', hours: 24 },
];

const EVENT_TYPE_LABELS = {
  community_meal: 'Community meal',
  potluck: 'Potluck',
  barbecue: 'Barbecue',
  distribution: 'Food distribution',
  other: 'Public event',
};

const QUICK_EVENT_TYPES = [
  { key: 'community_meal', label: 'Community meal', icon: 'restaurant', color: '#10B981' },
  { key: 'potluck', label: 'Potluck', icon: 'people', color: '#0EA5E9' },
  { key: 'barbecue', label: 'Barbecue', icon: 'flame', color: '#F97316' },
  { key: 'distribution', label: 'Distribution', icon: 'cube', color: '#8B5CF6' },
];

const EVENT_START_OPTIONS = [
  { key: 'now', label: 'Now', hours: 0 },
  { key: '1h', label: '+1h', hours: 1 },
  { key: '2h', label: '+2h', hours: 2 },
];

const EVENT_DURATION_OPTIONS = [
  { key: '2h', label: '2h', hours: 2 },
  { key: '3h', label: '3h', hours: 3 },
  { key: '4h', label: '4h', hours: 4 },
];

const VOLUNTEER_QUICK_PROMPTS = [
  'Draft a volunteer ask for today’s pickups.',
  'Send a reminder to volunteers for tonight’s meal.',
  'Who should I contact first for urgent coverage?',
];

const VOLUNTEER_GROUP_PRESETS = ['pantry-team', 'meal-response', 'on-call', 'new-volunteer'];
const VOLUNTEER_WIDGET_REFRESH_MS = 5000;

function toCoordinateInput(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(6) : '';
}

function parseCoordinateInput(value) {
  if (value == null || String(value).trim() === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getAvailabilityKey(availableUntil) {
  if (!availableUntil) return '6h';

  const diffHours = Math.max(
    1,
    Math.round((new Date(availableUntil).getTime() - Date.now()) / (60 * 60 * 1000))
  );

  if (diffHours <= 2) return '2h';
  if (diffHours <= 6) return '6h';
  if (diffHours <= 12) return '12h';
  return '24h';
}

function buildBeaconDraft(beacon, userLocation) {
  return {
    title: beacon?.name || 'Food available',
    description: beacon?.description || '',
    locationLabel: beacon?.address || beacon?.locationLabel || '',
    latitude: toCoordinateInput(beacon?.lat ?? userLocation?.latitude),
    longitude: toCoordinateInput(beacon?.lng ?? userLocation?.longitude),
    quantityLevel: beacon?.quantityLevel || 'some',
    foodTypes: beacon?.foodTypes || '',
    photoUrl: beacon?.photoUrl || null,
    availableWindow: getAvailabilityKey(beacon?.availableUntil),
    isActive: beacon?.isActive ?? false,
    isPublic: true,
  };
}

function buildQuickEventDraft(initialDraft, userLocation) {
  return {
    eventType: initialDraft?.eventType || 'community_meal',
    eventName: initialDraft?.eventName || '',
    locationLabel: initialDraft?.location || '',
    latitude: toCoordinateInput(initialDraft?.latitude ?? userLocation?.latitude),
    longitude: toCoordinateInput(initialDraft?.longitude ?? userLocation?.longitude),
    targetServings: initialDraft?.targetServings ? String(initialDraft.targetServings) : '30',
    startOffsetKey: '1h',
    durationKey: '2h',
  };
}

function formatVolunteerTagLabel(tag) {
  const raw = String(tag || '').trim();
  if (!raw) return '';
  const withoutPrefix = raw.startsWith('group:') ? raw.slice(6) : raw;
  return withoutPrefix
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildVolunteerInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'V';
  return parts.map((part) => part[0]?.toUpperCase() || '').join('');
}

function formatTimestamp(value) {
  if (!value) return 'Just now';

  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateTime(value) {
  if (!value) return 'Time pending';

  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCalendarDay(value) {
  if (!value) return '--';
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function formatCalendarTimeRange(startTime, endTime) {
  if (!startTime) return 'Time pending';
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return 'Time pending';

  if (!endTime) {
    return start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const end = new Date(endTime);
  if (Number.isNaN(end.getTime())) {
    return start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function normalizeHoursValue(hours) {
  if (!hours) return null;
  if (typeof hours === 'object') return hours;
  if (typeof hours !== 'string') return null;
  try {
    return JSON.parse(hours);
  } catch (_) {
    return null;
  }
}

function parseClockMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3]?.toUpperCase();
  if (minutes > 59 || hours > (meridiem ? 12 : 23)) return null;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  return (hours * 60) + minutes;
}

function isHoursOpenAt(hours, referenceDate) {
  const normalized = normalizeHoursValue(hours);
  if (!normalized) return null;
  const dayKey = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][referenceDate.getDay()];
  const dayHours = normalized[dayKey] ?? normalized[dayKey.slice(0, 3)] ?? normalized[dayKey.charAt(0).toUpperCase() + dayKey.slice(1)];
  if (!dayHours) return false;
  if (/24\s*hours|open\s*24/i.test(String(dayHours))) return true;
  if (/closed/i.test(String(dayHours))) return false;
  const currentMinutes = (referenceDate.getHours() * 60) + referenceDate.getMinutes();
  return String(dayHours).split(',').some((range) => {
    const parts = range.split(/\s+-\s+|\s+to\s+/i);
    if (parts.length < 2) return false;
    const start = parseClockMinutes(parts[0]);
    const end = parseClockMinutes(parts[1]);
    if (start == null || end == null) return false;
    return end < start
      ? currentMinutes >= start || currentMinutes <= end
      : currentMinutes >= start && currentMinutes <= end;
  });
}

function getMarkerCategory(marker) {
  if (!marker) return 'pantries';
  if (marker.markerType === 'food_beacon') return 'beacons';
  const normalizedCategory = String(marker.category || '').toLowerCase();
  if (normalizedCategory === 'food_bank') return 'foodBanks';
  if (normalizedCategory === 'pantry') return 'pantries';
  if (normalizedCategory === 'community_fridge') return 'fridges';
  if (normalizedCategory === 'meal') return 'meals';
  if (normalizedCategory === 'pop_up' || normalizedCategory === 'event') return 'popups';
  if (marker.markerType === 'community_event') {
    return marker.eventType === 'community_meal' || marker.eventType === 'potluck' || marker.eventType === 'barbecue'
      ? 'meals'
      : 'popups';
  }

  const type = String(marker.austinType || marker.displayType || marker.type || marker.markerType || '').toLowerCase();
  if (type.includes('fridge')) return 'fridges';
  if (type === 'meal' || type.includes('meal')) return 'meals';
  if (type === 'event' || type.includes('event') || type.includes('distribution') || type.includes('pop')) return 'popups';
  if (type.includes('pantry') || type === 'program') return 'pantries';
  return 'foodBanks';
}

function getMarkerEventRange(marker) {
  const window = marker.currentWindow || marker.upcomingWindow || marker.nextWindow;
  const startValue = window?.startTime || marker.startTime || marker.event_date || marker.eventDate;
  const startMs = startValue ? Date.parse(startValue) : NaN;
  const endMs = Date.parse(window?.endTime || marker.endTime || '');
  if (!Number.isFinite(startMs)) return null;
  return {
    startMs,
    endMs: Number.isFinite(endMs) ? endMs : startMs + (2 * 60 * 60 * 1000),
  };
}

function isMarkerAvailableAt(marker, referenceDate) {
  const referenceMs = referenceDate.getTime();
  const category = getMarkerCategory(marker);
  const currentStart = Date.parse(marker.currentWindow?.startTime || '');
  const currentEnd = Date.parse(marker.currentWindow?.endTime || '');
  if (Number.isFinite(currentStart)) {
    return referenceMs >= currentStart && (!Number.isFinite(currentEnd) || referenceMs < currentEnd);
  }
  if (category === 'beacons') {
    const startMs = Date.parse(marker.availableFrom || marker.createdAt || '');
    const endMs = Date.parse(marker.availableUntil || '');
    if (Number.isFinite(startMs) && referenceMs < startMs) return false;
    if (Number.isFinite(endMs) && referenceMs > endMs) return false;
    return marker.isActive === true || (Number.isFinite(startMs) && Number.isFinite(endMs));
  }

  if (category === 'meals' || category === 'popups') {
    const range = getMarkerEventRange(marker);
    if (range) return referenceMs >= range.startMs && referenceMs <= range.endMs;
  }

  const hoursState = isHoursOpenAt(marker.hours, referenceDate);
  if (hoursState != null) return hoursState;
  const nearRealNow = Math.abs(referenceMs - Date.now()) < (2 * 60 * 1000);
  return nearRealNow && marker.openNow === true;
}

function isMarkerUpcoming(marker, referenceDate) {
  const startMs = referenceDate.getTime();
  const endMs = startMs + UPCOMING_WINDOW_MS;
  const range = getMarkerEventRange(marker);
  if (range) return range.endMs >= startMs && range.startMs <= endMs;

  const beaconStart = Date.parse(marker.availableFrom || marker.createdAt || '');
  const beaconEnd = Date.parse(marker.availableUntil || '');
  if (getMarkerCategory(marker) === 'beacons' && Number.isFinite(beaconEnd)) {
    return beaconEnd >= startMs && (!Number.isFinite(beaconStart) || beaconStart <= endMs);
  }

  for (let offset = 0; offset <= UPCOMING_WINDOW_MS; offset += 30 * 60 * 1000) {
    if (isMarkerAvailableAt(marker, new Date(startMs + offset))) return true;
  }
  return false;
}

function findNextAvailability(marker, afterDate) {
  const range = getMarkerEventRange(marker);
  if (range && range.endMs >= afterDate.getTime()) {
    return new Date(Math.max(range.startMs, afterDate.getTime()));
  }
  for (let offset = 0; offset <= 7 * UPCOMING_WINDOW_MS; offset += 30 * 60 * 1000) {
    const candidate = new Date(afterDate.getTime() + offset);
    if (isMarkerAvailableAt(marker, candidate)) return candidate;
  }
  return null;
}

function formatReferenceTime(value) {
  return value.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getOpenStateLabel(marker) {
  if (marker.openNow === true) return 'Open now';
  if (marker.openNow === false) return 'Closed now';
  return 'Hours pending';
}

const AUSTIN_TYPE_COLORS = {
  food_bank: '#22C55E',
  pantry: '#0EA5E9',
  community_fridge: '#06B6D4',
  meal: '#8B5CF6',
  program: '#F59E0B',
  event: '#F97316',
};

function getMarkerTypeLabel(marker) {
  if (!marker) return '';
  const category = getMarkerCategory(marker);
  return LAYER_OPTIONS.find((option) => option.key === category)?.label || 'Food resource';
}

function getAvailabilityStatus(marker) {
  if (marker.source === 'austinIndex') {
    if (marker.event_date) return formatDateTime(marker.event_date);
    return marker.hours || 'Info pending';
  }

  if (marker.markerType === 'food_beacon') {
    return marker.isActive ? 'Live beacon' : 'Beacon off';
  }

  if (marker.markerType === 'community_event') {
    return marker.isLiveNow ? 'Happening now' : 'Upcoming';
  }

  if (marker.foodAvailable === 'out') return 'Low or empty';
  if (marker.foodAvailable === 'available') return 'Food available';
  if (marker.foodAvailable === 'low') return 'Low stock';
  return 'Status pending';
}

function getMarkerAddress(marker) {
  if (marker.source === 'austinIndex') {
    return marker.address || 'Location pending';
  }

  if (marker.markerType === 'community_event') {
    return marker.address || marker.location || 'Location pending';
  }

  if (marker.markerType === 'food_beacon') {
    return marker.address || marker.locationLabel || 'Shared beacon location';
  }

  return [
    marker.address,
    [marker.city, marker.state].filter(Boolean).join(', '),
  ].filter(Boolean).join(' ');
}

function getMarkerSubtitle(marker) {
  if (!marker) return '';

  if (marker.source === 'austinIndex') {
    return marker.eligibility || AUSTIN_TYPE_LABELS[marker.austinType] || 'Community listing';
  }

  if (marker.markerType === 'community_event') {
    return EVENT_TYPE_LABELS[marker.eventType] || 'Public meal event';
  }

  if (marker.markerType === 'food_beacon') {
    return marker.foodTypes || 'Neighbor food pickup';
  }

  return getOpenStateLabel(marker);
}

function getMarkerAccentColor(marker) {
  if (marker.source === 'austinIndex') {
    return AUSTIN_TYPE_COLORS[marker.austinType] || '#64748B';
  }

  if (marker.markerType === 'food_beacon') {
    return marker.quantityLevel === 'many' ? '#10B981' : marker.quantityLevel === 'few' ? '#F59E0B' : '#22C55E';
  }

  if (marker.markerType === 'community_event') {
    return marker.isLiveNow ? '#F97316' : '#8B5CF6';
  }

  if (marker.foodAvailable === 'out') return '#EF4444';
  if (marker.openNow) return '#22C55E';
  if (marker.needsHoursVerification) return '#F59E0B';
  return '#64748B';
}

function getDirectionsUrl(marker) {
  if (!marker) return null;
  const address = getMarkerAddress(marker);
  const destination = address && address !== 'Location pending' && address !== 'Shared beacon location'
    ? encodeURIComponent(address)
    : (typeof marker.lat === 'number' && typeof marker.lng === 'number'
      ? `${marker.lat},${marker.lng}`
      : null);

  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

async function copyText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return;

  if (
    Platform.OS === 'web'
    && typeof navigator !== 'undefined'
    && navigator.clipboard
    && typeof navigator.clipboard.writeText === 'function'
  ) {
    await navigator.clipboard.writeText(trimmed);
    Alert.alert('Address copied', 'The address is ready to paste into Lyft, Uber, or Maps.');
    return;
  }

  Alert.alert('Copy unavailable', 'Address copy is supported in the web build right now.');
}

function buildVolunteerPrompt(marker) {
  const address = getMarkerAddress(marker);

  if (marker.markerType === 'community_event') {
    return `Help me cover volunteers for "${marker.name}" at ${address}. I need clear roles, reminder language, and gap coverage suggestions.`;
  }

  return `Help me think through volunteer coverage for food support around ${marker.name} at ${address}. Focus on setup, distribution, and follow-up roles.`;
}

function normalizeVolunteerTagEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return { tag: entry, count: null };

  const tag = String(entry.tag || entry.name || '').trim();
  if (!tag) return null;

  const numericCount = Number(entry.count);
  const count = Number.isFinite(numericCount) ? numericCount : null;
  return { tag, count };
}

function getVolunteerPrimaryContact(volunteer) {
  return volunteer?.phone_e164 || volunteer?.email || 'No contact';
}

function getVolunteerLabel(volunteer) {
  return volunteer?.name || 'Unnamed volunteer';
}

function buildEventDraft(marker) {
  const address = getMarkerAddress(marker);

  if (marker.markerType === 'food_beacon') {
    return {
      eventName: `${marker.name} community meal`,
      eventType: 'community_meal',
      description: marker.description || `Organize a public meal or coordinated pickup around ${marker.name}.`,
      location: address,
      latitude: marker.lat,
      longitude: marker.lng,
    };
  }

  if (marker.markerType === 'food_bank') {
    return {
      eventName: `${marker.name} neighborhood distribution`,
      eventType: 'distribution',
      description: marker.description || `Coordinate a nearby food distribution using ${marker.name} as the reference point.`,
      location: address,
      latitude: marker.lat,
      longitude: marker.lng,
    };
  }

  return {
    eventName: marker.name,
    eventType: marker.eventType || 'community_meal',
    description: marker.description || '',
    location: address,
    latitude: marker.lat,
    longitude: marker.lng,
  };
}

async function getCurrentLocation() {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
        reject,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Location permission was denied');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

function isLocationDeniedError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return error?.code === 1 || message.includes('denied') || message.includes('permission');
}

function isAuthRequiredError(error) {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || '').toLowerCase();
  return status === 401 || status === 403 || message.includes('sign in') || message.includes('authentication');
}

export default function MapScreen({ navigation, route }) {
  const { isAuthenticated, isStaffMember } = useAuth();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isMobile = windowWidth < 768;
  const handledRouteIntentRef = useRef('');
  const beaconComposerAnim = useRef(new Animated.Value(0)).current;
  const eventComposerAnim = useRef(new Animated.Value(0)).current;
  const volunteerComposerAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [beaconSaving, setBeaconSaving] = useState(false);
  const [beaconPhotoUploading, setBeaconPhotoUploading] = useState(false);
  const [eventSaving, setEventSaving] = useState(false);
  const [dataMode, setDataMode] = useState('live');
  const [statusNotice, setStatusNotice] = useState('');
  const [hoursReviewCount, setHoursReviewCount] = useState(0);
  const [radiusMiles, setRadiusMiles] = useState(25);
  const [timeMode, setTimeMode] = useState('now');
  const [referenceTime, setReferenceTime] = useState(() => new Date());
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [userLocation, setUserLocation] = useState(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [mapFocusRequest, setMapFocusRequest] = useState(null);
  const [beaconEditorVisible, setBeaconEditorVisible] = useState(false);
  const [beaconMoreDetailsVisible, setBeaconMoreDetailsVisible] = useState(false);
  const [eventEditorVisible, setEventEditorVisible] = useState(false);
  const [volunteerEditorVisible, setVolunteerEditorVisible] = useState(false);
  const [calendarPanelVisible, setCalendarPanelVisible] = useState(false);
  const [markerDetailVisible, setMarkerDetailVisible] = useState(false);
  const [heroCollapsed, setHeroCollapsed] = useState(true);
  const anyComposerOpen = beaconEditorVisible || eventEditorVisible || volunteerEditorVisible;
  const showHeroBody = !anyComposerOpen && !heroCollapsed;
  const [layers, setLayers] = useState({
    foodBanks: true,
    pantries: true,
    fridges: true,
    meals: true,
    popups: true,
    beacons: true,
  });
  const [feed, setFeed] = useState({
    foodBanks: [],
    beacons: [],
    events: [],
    austinIndex: [],
    upcoming: [],
    all: [],
    userBeacon: null,
    generatedAt: null,
  });
  const [beaconDraft, setBeaconDraft] = useState(buildBeaconDraft(null, null));
  const [eventDraft, setEventDraft] = useState(buildQuickEventDraft(null, null));
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [eventAddressSuggestions, setEventAddressSuggestions] = useState([]);
  const [eventAddressSearching, setEventAddressSearching] = useState(false);
  const [volunteerLoading, setVolunteerLoading] = useState(false);
  const [volunteerSummary, setVolunteerSummary] = useState(null);
  const [volunteerRoster, setVolunteerRoster] = useState([]);
  const [volunteerTags, setVolunteerTags] = useState([]);
  const [selectedVolunteerIds, setSelectedVolunteerIds] = useState([]);
  const [activeVolunteerTag, setActiveVolunteerTag] = useState('');
  const [volunteerGroupTag, setVolunteerGroupTag] = useState(VOLUNTEER_GROUP_PRESETS[0]);
  const [volunteerMetaRevealId, setVolunteerMetaRevealId] = useState(null);
  const [volunteerSignupShareUrl, setVolunteerSignupShareUrl] = useState('');
  const [volunteerPrompt, setVolunteerPrompt] = useState('');
  const [volunteerSending, setVolunteerSending] = useState(false);
  const [volunteerBroadcasting, setVolunteerBroadcasting] = useState(false);
  const [volunteerTagAssigning, setVolunteerTagAssigning] = useState(false);
  const [volunteerPingingId, setVolunteerPingingId] = useState(null);
  const [volunteerMessages, setVolunteerMessages] = useState([
    {
      id: 'volunteer-welcome',
      role: 'assistant',
      text: 'Volunteer ops is live. Ask me for staffing help, then tap to ping people.',
    },
  ]);
  const addressDebounceRef = useRef(null);
  const eventAddressDebounceRef = useRef(null);
  const volunteerPollingInFlightRef = useRef(false);
  const volunteerRefreshTimerRef = useRef(null);
  const volunteerWidgetVisibleRef = useRef(false);
  const volunteerWidgetRefreshRef = useRef(null);
  const liveRefreshInFlightRef = useRef(false);
  volunteerWidgetRefreshRef.current = loadVolunteerWidgetData;

  const canReviewHours = isStaffMember();
  const compactBeaconWidth = useMemo(() => {
    if (windowWidth >= 1440) return 448;
    if (windowWidth >= 1100) return 420;
    if (windowWidth >= 860) return 400;
    return Math.max(296, windowWidth - 28);
  }, [windowWidth]);
  const compactBeaconHeight = useMemo(() => Math.max(
    360,
    Math.min(isMobile ? 660 : 700, windowHeight - (isMobile ? 106 : 142))
  ), [isMobile, windowHeight]);
  const compactEventWidth = useMemo(() => {
    if (windowWidth >= 1440) return 468;
    if (windowWidth >= 1100) return 430;
    if (windowWidth >= 860) return 408;
    return Math.max(304, windowWidth - 28);
  }, [windowWidth]);
  const compactVolunteerWidth = useMemo(() => {
    if (windowWidth >= 1440) return 432;
    if (windowWidth >= 1120) return 404;
    if (windowWidth >= 860) return 380;
    return Math.max(306, windowWidth - 28);
  }, [windowWidth]);
  const compactHeroWidth = useMemo(() => {
    if (windowWidth >= 1280) return 620;
    if (windowWidth >= 980) return 580;
    return Math.max(320, windowWidth - 28);
  }, [windowWidth]);
  const beaconComposerAnimatedStyle = useMemo(() => ({
    opacity: beaconComposerAnim,
    transform: [
      {
        translateY: beaconComposerAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [30, 0],
        }),
      },
      {
        scale: beaconComposerAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1],
        }),
      },
    ],
  }), [beaconComposerAnim]);
  const eventComposerAnimatedStyle = useMemo(() => ({
    opacity: eventComposerAnim,
    transform: [
      {
        translateY: eventComposerAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [30, 0],
        }),
      },
      {
        scale: eventComposerAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1],
        }),
      },
    ],
  }), [eventComposerAnim]);
  const volunteerComposerAnimatedStyle = useMemo(() => ({
    opacity: volunteerComposerAnim,
    transform: [
      {
        translateY: volunteerComposerAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [30, 0],
        }),
      },
      {
        scale: volunteerComposerAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1],
        }),
      },
    ],
  }), [volunteerComposerAnim]);

  const markerPool = useMemo(() => {
    const byId = new Map();
    [...feed.foodBanks, ...feed.beacons, ...feed.events, ...feed.austinIndex, ...feed.upcoming, ...feed.all]
      .forEach((marker) => {
        if (marker?.id) byId.set(`${marker.markerType || marker.source || 'resource'}:${marker.id}`, marker);
      });
    return [...byId.values()];
  }, [feed]);

  const upcomingMarkerKeys = useMemo(() => new Set(feed.upcoming.map((marker) => (
    `${marker.markerType || marker.source || 'resource'}:${marker.id}`
  ))), [feed.upcoming]);

  const allMarkerKeys = useMemo(() => new Set(feed.all.map((marker) => (
    `${marker.markerType || marker.source || 'resource'}:${marker.id}`
  ))), [feed.all]);

  const timeFilteredMarkers = useMemo(() => markerPool.filter((marker) => {
    const markerKey = `${marker.markerType || marker.source || 'resource'}:${marker.id}`;
    if (timeMode === 'all') return allMarkerKeys.size === 0 || allMarkerKeys.has(markerKey);
    if (timeMode === 'upcoming') {
      if (upcomingMarkerKeys.size > 0) {
        return upcomingMarkerKeys.has(markerKey);
      }
      return isMarkerUpcoming(marker, referenceTime) && !isMarkerAvailableAt(marker, referenceTime);
    }
    return isMarkerAvailableAt(marker, referenceTime);
  }), [allMarkerKeys, clockTick, markerPool, referenceTime, timeMode, upcomingMarkerKeys]);

  const visibleMarkers = useMemo(() => timeFilteredMarkers.filter((marker) => (
    layers[getMarkerCategory(marker)]
      && Number.isFinite(Number(marker.lat))
      && Number.isFinite(Number(marker.lng))
  )), [layers, timeFilteredMarkers]);

  const categoryCounts = useMemo(() => LAYER_OPTIONS.reduce((counts, option) => ({
    ...counts,
    [option.key]: timeFilteredMarkers.filter((marker) => getMarkerCategory(marker) === option.key).length,
  }), {}), [timeFilteredMarkers]);

  const activeLayerCount = useMemo(
    () => LAYER_OPTIONS.filter((option) => layers[option.key]).length,
    [layers]
  );

  const selectedMarker = useMemo(
    () => markerPool.find((marker) => marker.id === selectedMarkerId) || null,
    [markerPool, selectedMarkerId]
  );

  const liveCalendarEvents = useMemo(() => {
    const now = Date.now();
    const windowEnd = now + UPCOMING_WINDOW_MS;

    return [...feed.upcoming]
      .filter((event) => event?.id)
      .map((event) => {
        const startMs = Date.parse(event.upcomingWindow?.startTime || event.startTime || event.eventDate || '');
        const endMs = Date.parse(event.upcomingWindow?.endTime || event.endTime || '');
        return { event, startMs, endMs };
      })
      .filter(({ startMs, endMs }) => {
        if (!Number.isFinite(startMs)) return false;
        if (Number.isFinite(endMs)) return endMs >= now && startMs <= windowEnd;
        return startMs >= now && startMs <= windowEnd;
      })
      .sort((left, right) => left.startMs - right.startMs)
      .map(({ event }) => event)
      .slice(0, 6);
  }, [clockTick, feed.upcoming]);

  const selectedAvailabilityLabel = useMemo(() => {
    if (!selectedMarker) return '';
    if (isMarkerAvailableAt(selectedMarker, referenceTime)) {
      return timeMode === 'now' ? 'Available now' : `Available at ${formatReferenceTime(referenceTime)}`;
    }
    const next = findNextAvailability(selectedMarker, referenceTime);
    return next ? `Next: ${formatReferenceTime(next)}` : 'Schedule unknown';
  }, [clockTick, referenceTime, selectedMarker, timeMode]);

  const beaconLocationStatus = useMemo(() => {
    const latitude = parseCoordinateInput(beaconDraft.latitude);
    const longitude = parseCoordinateInput(beaconDraft.longitude);
    const hasCoordinates = latitude != null && longitude != null;
    const label = beaconDraft.locationLabel.trim();
    if (hasCoordinates) {
      return {
        ready: true,
        title: label || 'Coordinates captured',
        detail: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      };
    }
    if (label) {
      return {
        ready: false,
        title: 'Address ready to geotag',
        detail: 'Coordinates will be resolved when you publish.',
      };
    }
    return {
      ready: false,
      title: 'Location needed',
      detail: 'Use your current location or enter another pickup spot.',
    };
  }, [beaconDraft.latitude, beaconDraft.locationLabel, beaconDraft.longitude]);

  const beaconAvailabilityUntil = useMemo(() => {
    const hours = AVAILABILITY_OPTIONS.find((option) => option.key === beaconDraft.availableWindow)?.hours || 6;
    return formatDateTime(new Date(clockTick + (hours * 60 * 60 * 1000)));
  }, [beaconDraft.availableWindow, clockTick]);
  const volunteerSignupQrUrl = useMemo(
    () => (volunteerSignupShareUrl
      ? `https://quickchart.io/qr?text=${encodeURIComponent(volunteerSignupShareUrl)}&size=180`
      : ''),
    [volunteerSignupShareUrl]
  );
  const filteredVolunteerRoster = useMemo(() => {
    if (!activeVolunteerTag) return volunteerRoster;
    return volunteerRoster.filter((volunteer) => Array.isArray(volunteer.tags)
      && volunteer.tags.includes(activeVolunteerTag));
  }, [activeVolunteerTag, volunteerRoster]);
  const availableVolunteerTags = useMemo(() => {
    const tagMap = new Map();

    volunteerTags.forEach((entry) => {
      const normalized = normalizeVolunteerTagEntry(entry);
      if (!normalized) return;
      tagMap.set(normalized.tag, normalized.count);
    });

    volunteerRoster.forEach((volunteer) => {
      const tags = Array.isArray(volunteer.tags) ? volunteer.tags : [];
      tags.forEach((tag) => {
        const normalizedTag = String(tag || '').trim();
        if (!normalizedTag) return;
        const currentCount = tagMap.get(normalizedTag);
        if (currentCount === null || currentCount === undefined) {
          tagMap.set(normalizedTag, 1);
        } else {
          tagMap.set(normalizedTag, currentCount + 1);
        }
      });
    });

    return [...tagMap.entries()]
      .map(([tag, count]) => ({ tag, count: Number.isFinite(count) ? count : null }))
      .sort((left, right) => {
        const leftCount = left.count ?? 0;
        const rightCount = right.count ?? 0;
        if (rightCount !== leftCount) return rightCount - leftCount;
        return left.tag.localeCompare(right.tag);
      });
  }, [volunteerRoster, volunteerTags]);
  const volunteerGroupOptions = useMemo(
    () => [...new Set([...VOLUNTEER_GROUP_PRESETS, ...availableVolunteerTags.map((entry) => entry.tag)])],
    [availableVolunteerTags]
  );
  const revealedVolunteer = useMemo(() => {
    const targetId = volunteerMetaRevealId || selectedVolunteerIds[0];
    if (!targetId) return null;
    return volunteerRoster.find((volunteer) => volunteer.id === targetId) || null;
  }, [volunteerMetaRevealId, volunteerRoster, selectedVolunteerIds]);
  const broadcastScopeLabel = useMemo(() => {
    if (selectedVolunteerIds.length > 0) {
      return `${selectedVolunteerIds.length} selected`;
    }
    if (activeVolunteerTag) {
      return `tag: ${activeVolunteerTag}`;
    }
    return 'all active';
  }, [activeVolunteerTag, selectedVolunteerIds]);

  useEffect(() => {
    const initialize = async () => {
      const now = new Date();
      setReferenceTime(now);
      await loadLiveFeed(null, { showSpinner: true, radiusOverride: 25, referenceOverride: now });
      await locateUser(false, { focusMap: true });
    };

    initialize();
  }, []);

  useEffect(() => {
    let disposed = false;
    let lastRefetch = Date.now();

    const refreshForCurrentTime = async (force = false) => {
      if (disposed || timeMode !== 'now' || liveRefreshInFlightRef.current) return;
      const now = new Date();
      setReferenceTime(now);
      setClockTick(now.getTime());
      if (!force && now.getTime() - lastRefetch < LIVE_REFETCH_INTERVAL_MS) return;
      liveRefreshInFlightRef.current = true;
      lastRefetch = now.getTime();
      try {
        await loadLiveFeed(userLocation, { referenceOverride: now });
      } finally {
        liveRefreshInFlightRef.current = false;
      }
    };

    const timer = setInterval(() => refreshForCurrentTime(false), LIVE_CLOCK_INTERVAL_MS);
    const handleAppStateChange = (nextState) => {
      if (nextState === 'active') refreshForCurrentTime(true);
    };
    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        refreshForCurrentTime(true);
      }
    };
    const appStateSubscription = AppState.addEventListener?.('change', handleAppStateChange);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      disposed = true;
      clearInterval(timer);
      appStateSubscription?.remove?.();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      liveRefreshInFlightRef.current = false;
    };
  }, [radiusMiles, timeMode, userLocation]);

  useEffect(() => {
    if (!beaconEditorVisible) {
      setBeaconDraft(buildBeaconDraft(feed.userBeacon, userLocation));
    }
  }, [feed.userBeacon, userLocation, beaconEditorVisible]);

  useEffect(() => {
    if (!eventEditorVisible) {
      setEventDraft(buildQuickEventDraft(null, userLocation));
      setEventAddressSuggestions([]);
    }
  }, [eventEditorVisible, userLocation]);

  useEffect(() => {
    if (!activeVolunteerTag) return;
    const activeStillExists = availableVolunteerTags.some((entry) => entry.tag === activeVolunteerTag);
    if (!activeStillExists) {
      setActiveVolunteerTag('');
    }
  }, [activeVolunteerTag, availableVolunteerTags]);

  useEffect(() => {
    if (!volunteerMetaRevealId) return;
    const exists = volunteerRoster.some((volunteer) => volunteer.id === volunteerMetaRevealId);
    if (!exists) {
      setVolunteerMetaRevealId(null);
    }
  }, [volunteerMetaRevealId, volunteerRoster]);

  useEffect(() => {
    if (!volunteerEditorVisible) return undefined;

    let disposed = false;

    const isDocumentVisible = () => (
      typeof document === 'undefined' || document.visibilityState !== 'hidden'
    );

    const clearRefreshTimer = () => {
      if (volunteerRefreshTimerRef.current) {
        clearTimeout(volunteerRefreshTimerRef.current);
        volunteerRefreshTimerRef.current = null;
      }
    };

    const scheduleNextRefresh = () => {
      clearRefreshTimer();
      if (disposed || !volunteerWidgetVisibleRef.current || !isDocumentVisible()) return;
      volunteerRefreshTimerRef.current = setTimeout(runRefresh, VOLUNTEER_WIDGET_REFRESH_MS);
    };

    const runRefresh = async () => {
      if (disposed || volunteerPollingInFlightRef.current) return;
      volunteerPollingInFlightRef.current = true;
      try {
        await volunteerWidgetRefreshRef.current?.({ silent: true });
      } finally {
        volunteerPollingInFlightRef.current = false;
        scheduleNextRefresh();
      }
    };

    const handleVisibilityChange = () => {
      if (disposed) return;
      if (isDocumentVisible()) {
        runRefresh();
      } else {
        clearRefreshTimer();
      }
    };

    const handleAppStateChange = (nextState) => {
      if (disposed) return;
      if (nextState === 'active') {
        runRefresh();
      } else {
        clearRefreshTimer();
      }
    };

    volunteerWidgetVisibleRef.current = true;
    runRefresh();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    const appStateSubscription = AppState.addEventListener?.('change', handleAppStateChange);

    return () => {
      disposed = true;
      volunteerWidgetVisibleRef.current = false;
      clearRefreshTimer();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      appStateSubscription?.remove?.();
      volunteerPollingInFlightRef.current = false;
    };
  }, [volunteerEditorVisible]);

  useEffect(() => {
    if (selectedMarkerId && !visibleMarkers.some((marker) => marker.id === selectedMarkerId)) {
      setSelectedMarkerId(null);
      setMarkerDetailVisible(false);
    }
  }, [selectedMarkerId, visibleMarkers]);

  useEffect(() => {
    if (!selectedMarker) {
      setMarkerDetailVisible(false);
    }
  }, [selectedMarker]);

  useEffect(() => {
    const params = route?.params || {};
    const intentKey = JSON.stringify(params);
    const nextParams = {};
    let shouldClearParams = false;

    if (!intentKey || intentKey === '{}' || intentKey === handledRouteIntentRef.current) {
      return;
    }

    handledRouteIntentRef.current = intentKey;

    if (params.openBeaconComposer) {
      openBeaconComposer();
      nextParams.openBeaconComposer = undefined;
      shouldClearParams = true;
    }

    if (params.openEventComposer) {
      openEventComposer(params.initialDraft || null);
      nextParams.openEventComposer = undefined;
      nextParams.initialDraft = undefined;
      shouldClearParams = true;
    }

    const focusLayerKeys = params.focusLayer === 'events'
      ? ['meals', 'popups']
      : params.focusLayer === 'austinIndex'
        ? ['foodBanks', 'pantries', 'fridges', 'meals', 'popups']
        : [params.focusLayer];
    if (params.focusLayer && focusLayerKeys.some((key) => LAYER_OPTIONS.some((item) => item.key === key))) {
      setLayers(LAYER_OPTIONS.reduce((next, item) => ({
        ...next,
        [item.key]: focusLayerKeys.includes(item.key),
      }), {}));
      nextParams.focusLayer = undefined;
      shouldClearParams = true;
    }

    if (params.openCalendarPanel) {
      setLayers((current) => ({ ...current, meals: true, popups: true }));
      setCalendarPanelVisible(true);
      nextParams.openCalendarPanel = undefined;
      shouldClearParams = true;
    }

    if (params.openVolunteerWidget || params.initialVolunteerPrompt) {
      openVolunteerWidget(params.initialVolunteerPrompt || '');
      nextParams.openVolunteerWidget = undefined;
      nextParams.initialVolunteerPrompt = undefined;
      shouldClearParams = true;
    }

    if (shouldClearParams) {
      navigation.setParams(nextParams);
    }
  }, [navigation, route?.params]);

  async function loadLiveFeed(locationOverride = userLocation, options = {}) {
    const { showSpinner = false, radiusOverride, referenceOverride } = options;
    const nextRadius = radiusOverride ?? radiusMiles;

    if (showSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const params = { radius: nextRadius };
      const requestTime = referenceOverride || referenceTime;
      if (requestTime instanceof Date && !Number.isNaN(requestTime.getTime())) {
        params.referenceTime = requestTime.toISOString();
      }
      if (locationOverride?.latitude && locationOverride?.longitude) {
        params.latitude = locationOverride.latitude;
        params.longitude = locationOverride.longitude;
      }

      const requests = [mapService.getLiveFeed(params)];
      if (canReviewHours) {
        requests.push(foodBankService.getHoursReviewQueue().catch(() => null));
      }

      const [mapResponse, hoursResponse] = await Promise.all(requests);
      const nextFeed = mapResponse.data || {};

      setFeed({
        foodBanks: nextFeed.foodBanks || [],
        beacons: nextFeed.beacons || [],
        events: nextFeed.events || [],
        austinIndex: nextFeed.austinIndex || [],
        upcoming: nextFeed.upcoming || [],
        all: Array.isArray(nextFeed.all)
          ? nextFeed.all
          : Object.values(nextFeed.all || {}).flat().filter(Boolean),
        userBeacon: nextFeed.userBeacon || null,
        generatedAt: nextFeed.generatedAt || nextFeed.referenceTime || new Date().toISOString(),
      });
      setDataMode('live');
      setStatusNotice('');
      setHoursReviewCount(hoursResponse?.data?.count || 0);
    } catch (error) {
      console.error('Error loading live map feed:', error);
      setDataMode('fallback');
      setStatusNotice('Live availability could not be refreshed right now. The map is holding the last confirmed live data until refresh succeeds.');
      setHoursReviewCount(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function locateUser(showErrors = true, options = {}) {
    const { focusMap = true } = options;
    setLocating(true);

    try {
      const location = await getCurrentLocation();
      setUserLocation(location);
      if (focusMap) {
        setMapFocusRequest({ type: 'user', zoom: 15, nonce: Date.now() });
      }
      await loadLiveFeed(location, { radiusOverride: radiusMiles });
      if (focusMap) {
        setStatusNotice('Map centered on your current location.');
      }
      return location;
    } catch (error) {
      if (!isLocationDeniedError(error)) {
        console.error('Error getting location:', error);
      }
      if (showErrors) {
        Alert.alert(
          'Location unavailable',
          'Turn on location access so the map can focus on nearby food and community meals.'
        );
      }
      return null;
    } finally {
      setLocating(false);
    }
  }

  function updateLayer(key) {
    setLayers((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function toggleAllLayers() {
    const shouldShowAll = activeLayerCount === 0;
    setLayers(LAYER_OPTIONS.reduce((next, option) => ({
      ...next,
      [option.key]: shouldShowAll,
    }), {}));
  }

  async function selectTimeMode(nextMode) {
    const nextReference = nextMode === 'now' || nextMode === 'upcoming' ? new Date() : referenceTime;
    setTimeMode(nextMode);
    setReferenceTime(nextReference);
    setClockTick(Date.now());
    await loadLiveFeed(userLocation, { referenceOverride: nextReference });
  }

  async function stepReferenceTime(direction) {
    const base = timeMode === 'now' ? new Date() : referenceTime;
    const nextReference = new Date(base.getTime() + (direction * TIME_STEP_MS));
    setTimeMode('selected');
    setReferenceTime(nextReference);
    setClockTick(Date.now());
    await loadLiveFeed(userLocation, { referenceOverride: nextReference });
  }

  async function handleRadiusChange(value) {
    setRadiusMiles(value);
    await loadLiveFeed(userLocation, { radiusOverride: value });
  }

  async function handleRefresh() {
    await loadLiveFeed(userLocation);
  }

  function handleZoomIn() {
    setMapFocusRequest({ type: 'zoom_in', nonce: Date.now() });
  }

  function handleZoomOut() {
    setMapFocusRequest({ type: 'zoom_out', nonce: Date.now() });
  }

  function searchAddress(query) {
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    addressDebounceRef.current = setTimeout(async () => {
      setAddressSearching(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'MVOE-App/1.0' } });
        const results = await res.json();
        setAddressSuggestions(results.map((r) => ({
          label: r.display_name,
          shortLabel: [r.address?.house_number, r.address?.road, r.address?.city || r.address?.town || r.address?.village].filter(Boolean).join(' '),
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
        })));
      } catch (_) {
        setAddressSuggestions([]);
      } finally {
        setAddressSearching(false);
      }
    }, 400);
  }

  function searchEventAddress(query) {
    if (eventAddressDebounceRef.current) clearTimeout(eventAddressDebounceRef.current);
    if (!query || query.length < 3) {
      setEventAddressSuggestions([]);
      return;
    }

    eventAddressDebounceRef.current = setTimeout(async () => {
      setEventAddressSearching(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'MVOE-App/1.0' } });
        const results = await res.json();
        setEventAddressSuggestions(results.map((r) => ({
          label: r.display_name,
          shortLabel: [r.address?.house_number, r.address?.road, r.address?.city || r.address?.town || r.address?.village].filter(Boolean).join(' '),
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
        })));
      } catch (_) {
        setEventAddressSuggestions([]);
      } finally {
        setEventAddressSearching(false);
      }
    }, 350);
  }

  function selectAddressSuggestion(suggestion) {
    setAddressSuggestions([]);
    setBeaconDraft((current) => ({
      ...current,
      locationLabel: suggestion.label,
      latitude: toCoordinateInput(suggestion.lat),
      longitude: toCoordinateInput(suggestion.lng),
    }));
  }

  function selectEventAddressSuggestion(suggestion) {
    setEventAddressSuggestions([]);
    setEventDraft((current) => ({
      ...current,
      locationLabel: suggestion.label,
      latitude: toCoordinateInput(suggestion.lat),
      longitude: toCoordinateInput(suggestion.lng),
    }));
  }

  async function geocodeAddress(query) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'MVOE-App/1.0' } });
      const results = await res.json();
      const first = Array.isArray(results) ? results[0] : null;
      if (!first) return null;

      return {
        label: first.display_name,
        lat: parseFloat(first.lat),
        lng: parseFloat(first.lon),
      };
    } catch (_) {
      return null;
    }
  }

  async function reverseGeocode(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'MVOE-App/1.0' } });
      const data = await res.json();
      return data.display_name || '';
    } catch (_) {
      return '';
    }
  }

  async function handleUseLocationForBeacon() {
    const location = await locateUser(true, { focusMap: true });
    if (!location) return;

    const label = await reverseGeocode(location.latitude, location.longitude);
    setBeaconDraft((current) => ({
      ...current,
      latitude: toCoordinateInput(location.latitude),
      longitude: toCoordinateInput(location.longitude),
      locationLabel: label || 'Near my current location',
    }));
  }

  async function handleUseLocationForEvent() {
    const location = await locateUser(true, { focusMap: true });
    if (!location) return;

    const label = await reverseGeocode(location.latitude, location.longitude);
    setEventDraft((current) => ({
      ...current,
      latitude: toCoordinateInput(location.latitude),
      longitude: toCoordinateInput(location.longitude),
      locationLabel: label || 'Near my current location',
    }));
  }

  function showBeaconComposer() {
    const shouldUseNativeDriver = Platform.OS !== 'web';
    setBeaconEditorVisible(true);
    beaconComposerAnim.stopAnimation();
    beaconComposerAnim.setValue(0);
    requestAnimationFrame(() => {
      Animated.spring(beaconComposerAnim, {
        toValue: 1,
        damping: 19,
        stiffness: 210,
        mass: 0.92,
        useNativeDriver: shouldUseNativeDriver,
      }).start();
    });
  }

  function hideBeaconComposer({ immediate = false } = {}) {
    const shouldUseNativeDriver = Platform.OS !== 'web';
    if (!beaconEditorVisible) {
      beaconComposerAnim.setValue(0);
      return Promise.resolve();
    }

    beaconComposerAnim.stopAnimation();

    if (immediate) {
      beaconComposerAnim.setValue(0);
      setBeaconEditorVisible(false);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      Animated.timing(beaconComposerAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: shouldUseNativeDriver,
      }).start(() => {
        setBeaconEditorVisible(false);
        resolve();
      });
    });
  }

  function showEventComposer() {
    const shouldUseNativeDriver = Platform.OS !== 'web';
    setEventEditorVisible(true);
    eventComposerAnim.stopAnimation();
    eventComposerAnim.setValue(0);
    requestAnimationFrame(() => {
      Animated.spring(eventComposerAnim, {
        toValue: 1,
        damping: 19,
        stiffness: 210,
        mass: 0.92,
        useNativeDriver: shouldUseNativeDriver,
      }).start();
    });
  }

  function hideEventComposer({ immediate = false } = {}) {
    const shouldUseNativeDriver = Platform.OS !== 'web';
    if (!eventEditorVisible) {
      eventComposerAnim.setValue(0);
      return Promise.resolve();
    }

    eventComposerAnim.stopAnimation();

    if (immediate) {
      eventComposerAnim.setValue(0);
      setEventEditorVisible(false);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      Animated.timing(eventComposerAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: shouldUseNativeDriver,
      }).start(() => {
        setEventEditorVisible(false);
        resolve();
      });
    });
  }

  function showVolunteerComposer() {
    const shouldUseNativeDriver = Platform.OS !== 'web';
    setVolunteerEditorVisible(true);
    volunteerComposerAnim.stopAnimation();
    volunteerComposerAnim.setValue(0);
    requestAnimationFrame(() => {
      Animated.spring(volunteerComposerAnim, {
        toValue: 1,
        damping: 19,
        stiffness: 210,
        mass: 0.92,
        useNativeDriver: shouldUseNativeDriver,
      }).start();
    });
  }

  function hideVolunteerComposer({ immediate = false } = {}) {
    const shouldUseNativeDriver = Platform.OS !== 'web';
    if (!volunteerEditorVisible) {
      volunteerComposerAnim.setValue(0);
      return Promise.resolve();
    }

    volunteerComposerAnim.stopAnimation();

    if (immediate) {
      volunteerComposerAnim.setValue(0);
      setVolunteerEditorVisible(false);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      Animated.timing(volunteerComposerAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: shouldUseNativeDriver,
      }).start(() => {
        setVolunteerEditorVisible(false);
        resolve();
      });
    });
  }

  async function loadVolunteerWidgetData(options = {}) {
    const { silent = false } = options;
    if (!silent) {
      setVolunteerLoading(true);
    }

    try {
      const [summaryResponse, volunteersResponse, signupResponse, tagsResponse] = await Promise.all([
        getVolunteerSummary().catch(() => null),
        listVolunteers({ limit: 24 }).catch(() => null),
        getVolunteerSignupShare().catch(() => null),
        listVolunteerTags().catch(() => null),
      ]);

      const hasAnyResponse = Boolean(summaryResponse || volunteersResponse || signupResponse || tagsResponse);
      if (!hasAnyResponse && !silent) {
        throw new Error('Volunteer backend did not return data');
      }

      if (summaryResponse) {
        setVolunteerSummary(summaryResponse);
      } else if (!silent) {
        setVolunteerSummary(null);
      }

      if (Array.isArray(volunteersResponse?.volunteers)) {
        const nextRoster = volunteersResponse.volunteers;
        setVolunteerRoster(nextRoster);
        setSelectedVolunteerIds((current) => (
          current.filter((id) => nextRoster.some((volunteer) => volunteer.id === id))
        ));
      } else if (!silent) {
        setVolunteerRoster([]);
        setSelectedVolunteerIds([]);
      }

      if (Array.isArray(tagsResponse?.tags)) {
        setVolunteerTags(tagsResponse.tags);
      } else if (!silent) {
        setVolunteerTags([]);
      }

      if (signupResponse?.share_url) {
        setVolunteerSignupShareUrl(signupResponse.share_url);
      } else if (!silent) {
        setVolunteerSignupShareUrl('');
      }
    } catch (error) {
      if (!silent) {
        Alert.alert('Volunteer tools unavailable', 'Volunteer data could not be loaded right now.');
      }
    } finally {
      if (!silent) {
        setVolunteerLoading(false);
      }
    }
  }

  async function openVolunteerWidget(initialPrompt = '') {
    if (!isAuthenticated) {
      Alert.alert(
        'Sign in to manage volunteers',
        'Volunteer roster, tagging, and broadcast tools require an account so messages and roster changes are accountable.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => navigation.navigate('Settings') },
        ],
      );
      return;
    }

    setHeroCollapsed(true);
    hideBeaconComposer({ immediate: true });
    hideEventComposer({ immediate: true });
    setCalendarPanelVisible(false);
    setMarkerDetailVisible(false);
    showVolunteerComposer();
    setSelectedMarkerId(null);
    setMapFocusRequest(null);
    setVolunteerMetaRevealId(null);
    await loadVolunteerWidgetData();

    const prompt = String(initialPrompt || '').trim();
    if (prompt) {
      setVolunteerPrompt(prompt);
      await handleVolunteerAsk(prompt);
    }
  }

  async function handleVolunteerAsk(messageText = volunteerPrompt) {
    const prompt = String(messageText || '').trim();
    if (!prompt || volunteerSending) return;

    setVolunteerMessages((current) => [
      ...current,
      { id: `vol-user-${Date.now()}`, role: 'user', text: prompt },
    ]);
    setVolunteerSending(true);

    try {
      const response = await sendVolunteerChatMessage(prompt);
      const reply = response?.reply || 'No reply came back.';
      setVolunteerMessages((current) => [
        ...current,
        { id: `vol-agent-${Date.now()}`, role: 'assistant', text: reply },
      ]);
      setVolunteerPrompt('');
    } catch (error) {
      Alert.alert('Volunteer assistant unavailable', 'Could not send this volunteer request.');
    } finally {
      setVolunteerSending(false);
    }
  }

  async function handleVolunteerBroadcastPing() {
    if (volunteerBroadcasting) return;
    setVolunteerBroadcasting(true);
    try {
      if (selectedVolunteerIds.length > 0) {
        await Promise.all(
          selectedVolunteerIds.map((volunteerId) => sendVolunteerSms(
            volunteerId,
            'MVOE needs volunteers right now. Can you help? Reply YES or NO.',
          ))
        );
        setStatusNotice(`Volunteer ping sent to ${selectedVolunteerIds.length} selected contact(s).`);
      } else if (activeVolunteerTag) {
        await broadcastVolunteerSmsByTag(
          'MVOE needs volunteers right now. Can you help? Reply YES or NO.',
          [activeVolunteerTag],
          'any',
        );
        setStatusNotice(`Volunteer ping sent to tag "${activeVolunteerTag}".`);
      } else {
        await broadcastVolunteerSms('MVOE needs volunteers right now. Can you help? Reply YES or NO.');
        setStatusNotice('Volunteer ping sent to active contacts.');
      }
      await loadVolunteerWidgetData({ silent: true });
    } catch (error) {
      Alert.alert('Broadcast failed', error.message || 'Volunteer broadcast could not be sent.');
    } finally {
      setVolunteerBroadcasting(false);
    }
  }

  function toggleVolunteerSelection(volunteerId) {
    setSelectedVolunteerIds((current) => (
      current.includes(volunteerId)
        ? current.filter((id) => id !== volunteerId)
        : [...current, volunteerId]
    ));
  }

  async function handleAssignSelectedVolunteerTag() {
    if (!selectedVolunteerIds.length) {
      Alert.alert('Select volunteers', 'Pick at least one volunteer bubble before assigning a tag.');
      return;
    }

    const nextTag = String(volunteerGroupTag || '').trim();
    if (!nextTag) {
      Alert.alert('Tag required', 'Choose a tag before assigning volunteers.');
      return;
    }

    setVolunteerTagAssigning(true);
    try {
      await assignVolunteerGroup({
        volunteer_ids: selectedVolunteerIds,
        group_name: nextTag,
        mode: 'add',
      });
      await assignVolunteerTags({
        volunteer_ids: selectedVolunteerIds,
        tags: [nextTag],
        mode: 'add',
      });
      setStatusNotice(`Tagged ${selectedVolunteerIds.length} volunteer(s) as "${nextTag}".`);
      setSelectedVolunteerIds([]);
      setActiveVolunteerTag(nextTag);
      await loadVolunteerWidgetData({ silent: true });
    } catch (error) {
      Alert.alert('Tag update failed', error.message || 'Could not assign this tag.');
    } finally {
      setVolunteerTagAssigning(false);
    }
  }

  async function handleVolunteerDirectPing(volunteer) {
    if (!volunteer?.id || volunteerPingingId) return;

    setVolunteerPingingId(volunteer.id);
    try {
      await sendVolunteerSms(volunteer.id, 'MVOE volunteer check-in: can you help today? Reply YES or NO.');
      setStatusNotice(`Ping sent to ${volunteer.name || 'volunteer'}.`);
      await loadVolunteerWidgetData({ silent: true });
    } catch (error) {
      Alert.alert('Ping failed', error.message || 'Could not message this volunteer.');
    } finally {
      setVolunteerPingingId(null);
    }
  }

  async function handleOpenVolunteerSignup() {
    if (!volunteerSignupShareUrl) {
      Alert.alert('Signup link unavailable', 'Volunteer signup link is not ready yet.');
      return;
    }

    await Linking.openURL(volunteerSignupShareUrl);
  }

  async function openBeaconComposer() {
    setHeroCollapsed(true);
    hideEventComposer({ immediate: true });
    hideVolunteerComposer({ immediate: true });
    setCalendarPanelVisible(false);
    setMarkerDetailVisible(false);
    setBeaconMoreDetailsVisible(false);
    showBeaconComposer();
    setSelectedMarkerId(null);
    setMapFocusRequest(null);
    setLayers((current) => ({ ...current, beacons: true }));

    const latitude = parseCoordinateInput(beaconDraft.latitude);
    const longitude = parseCoordinateInput(beaconDraft.longitude);
    const hasCoordinates = latitude != null && longitude != null;
    const hasAddress = beaconDraft.locationLabel.trim().length > 0;

    if (!hasCoordinates && !hasAddress) {
      await handleUseLocationForBeacon();
    } else if (hasCoordinates && !hasAddress) {
      const label = await reverseGeocode(latitude, longitude);
      if (label) {
        setBeaconDraft((current) => ({ ...current, locationLabel: label }));
      }
    }
  }

  async function openEventComposer(initialDraft = null) {
    setHeroCollapsed(true);
    hideBeaconComposer({ immediate: true });
    hideVolunteerComposer({ immediate: true });
    setCalendarPanelVisible(false);
    setMarkerDetailVisible(false);
    setEventDraft(buildQuickEventDraft(initialDraft, userLocation));
    setEventAddressSuggestions([]);
    setAddressSuggestions([]);
    showEventComposer();
    setSelectedMarkerId(null);
    setMapFocusRequest(null);
    setLayers((current) => ({ ...current, meals: true, popups: true }));

    const seededLatitude = Number(initialDraft?.latitude);
    const seededLongitude = Number(initialDraft?.longitude);
    const hasSeededCoordinates = Number.isFinite(seededLatitude) && Number.isFinite(seededLongitude);
    const hasSeededAddress = Boolean(initialDraft?.location);

    if (!hasSeededCoordinates && !hasSeededAddress) {
      await handleUseLocationForEvent();
    }
  }

  async function handleBeaconQuickToggle() {
    if (config.appEnv === 'production' && !isAuthenticated) {
      Alert.alert('Sign in to publish food', 'Public beacons require an account so MVOE can keep the map safe and auditable.');
      return;
    }

    if (!feed.userBeacon) {
      await openBeaconComposer();
      return;
    }

    setBeaconSaving(true);

    try {
      if (feed.userBeacon.isActive) {
        await foodBeaconService.deleteMine();
        setSelectedMarkerId(null);
        setMapFocusRequest({ type: 'user', zoom: 15, nonce: Date.now() });
        setStatusNotice('Beacon removed.');
      } else {
        const response = await foodBeaconService.toggleMine(true);
        const beaconId = response?.data?.beacon?.id || feed.userBeacon.id;
        setLayers((current) => ({ ...current, beacons: true }));
        setSelectedMarkerId(beaconId);
        setMapFocusRequest({ type: 'marker', id: beaconId, nonce: Date.now() });
        setStatusNotice('Beacon published. Look for the pulsing orange marker on the map.');
      }
      await loadLiveFeed(userLocation);
    } catch (error) {
      console.error('Error toggling beacon:', error);
      if (isAuthRequiredError(error)) {
        Alert.alert('Sign in required', 'Public beacons require an account so MVOE can keep the map safe and auditable.');
        return;
      }
      Alert.alert('Beacon update failed', 'The beacon state could not be changed right now.');
    } finally {
      setBeaconSaving(false);
    }
  }

  async function handleCreateQuickEvent() {
    if (config.appEnv === 'production' && !isAuthenticated) {
      Alert.alert('Sign in to publish a meal', 'Public meal events require an account so MVOE can keep the map safe and auditable.');
      return;
    }

    const servings = Number(eventDraft.targetServings);
    if (!Number.isFinite(servings) || servings < 1) {
      Alert.alert('Servings required', 'Add how many people this meal should cover.');
      return;
    }

    let nextLocationLabel = eventDraft.locationLabel.trim();
    let latitude = Number(eventDraft.latitude);
    let longitude = Number(eventDraft.longitude);

    if ((!Number.isFinite(latitude) || !Number.isFinite(longitude)) && nextLocationLabel) {
      const resolved = await geocodeAddress(nextLocationLabel);
      if (resolved) {
        latitude = resolved.lat;
        longitude = resolved.lng;
        nextLocationLabel = resolved.label;
        setEventDraft((current) => ({
          ...current,
          locationLabel: resolved.label,
          latitude: toCoordinateInput(resolved.lat),
          longitude: toCoordinateInput(resolved.lng),
        }));
      }
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      Alert.alert(
        'Meal location required',
        'Use your location or enter an address so people can find this meal.'
      );
      return;
    }

    if (!nextLocationLabel) {
      nextLocationLabel = await reverseGeocode(latitude, longitude);
    }

    const startOption = EVENT_START_OPTIONS.find((item) => item.key === eventDraft.startOffsetKey) || EVENT_START_OPTIONS[1];
    const durationOption = EVENT_DURATION_OPTIONS.find((item) => item.key === eventDraft.durationKey) || EVENT_DURATION_OPTIONS[0];
    const start = new Date(Date.now() + (startOption.hours * 60 * 60 * 1000));
    const end = new Date(start.getTime() + (durationOption.hours * 60 * 60 * 1000));
    const areaLabel = nextLocationLabel ? nextLocationLabel.split(',')[0] : 'Austin';
    const eventLabel = EVENT_TYPE_LABELS[eventDraft.eventType] || 'Community meal';
    const eventName = eventDraft.eventName.trim() || `${eventLabel} near ${areaLabel}`;

    setEventSaving(true);

    try {
      const response = await communityService.createEvent({
        eventName,
        eventType: eventDraft.eventType,
        eventDate: start.toISOString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        location: nextLocationLabel || undefined,
        latitude,
        longitude,
        targetServings: Math.round(servings),
        isPublic: true,
      });

      const createdEventId = response.data?.event?.id || null;
      setLayers((current) => ({ ...current, meals: true, popups: true }));
      await loadLiveFeed(userLocation);
      await hideEventComposer();

      if (createdEventId) {
        setSelectedMarkerId(createdEventId);
        setMapFocusRequest({ type: 'marker', id: createdEventId, nonce: Date.now() });
      }

      setStatusNotice('Meal event published on the map.');
    } catch (error) {
      console.error('Error creating quick meal event:', error);
      if (isAuthRequiredError(error)) {
        Alert.alert('Sign in required', 'Public meal events require an account so MVOE can keep the map safe and auditable.');
        return;
      }
      Alert.alert('Meal publish failed', 'This event could not be created right now.');
    } finally {
      setEventSaving(false);
    }
  }

  async function handleBeaconPhotoPick(source = 'library') {
    setBeaconPhotoUploading(true);

    try {
      const uploaded = await pickAndUploadImage(source);
      if (uploaded) {
        // Store the path — publicPhotoUrl turns it into a URL when reading back.
        setBeaconDraft((current) => ({ ...current, photoUrl: uploaded.path }));
      }
    } catch (error) {
      Alert.alert('Photo upload failed', error.message || 'Could not upload that photo.');
    } finally {
      setBeaconPhotoUploading(false);
    }
  }

  function handleBeaconPhotoRemove() {
    setBeaconDraft((current) => ({ ...current, photoUrl: null }));
  }

  async function handleSaveBeacon(forceLiveState = beaconDraft.isActive) {
    // Anyone can post a pantry — no account required. Guests are tracked by
    // session id so they can still edit or take down their own pin.

    let nextLocationLabel = beaconDraft.locationLabel.trim();
    let latitude = parseCoordinateInput(beaconDraft.latitude);
    let longitude = parseCoordinateInput(beaconDraft.longitude);

    if ((!Number.isFinite(latitude) || !Number.isFinite(longitude)) && nextLocationLabel) {
      const resolved = await geocodeAddress(nextLocationLabel);
      if (resolved) {
        latitude = resolved.lat;
        longitude = resolved.lng;
        nextLocationLabel = resolved.label;
        setBeaconDraft((current) => ({
          ...current,
          locationLabel: resolved.label,
          latitude: toCoordinateInput(resolved.lat),
          longitude: toCoordinateInput(resolved.lng),
        }));
      }
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      Alert.alert(
        'Beacon location required',
        'Use your location or enter an address so nearby people can find the pickup.'
      );
      return;
    }

    if (!nextLocationLabel) {
      nextLocationLabel = await reverseGeocode(latitude, longitude);
    }

    const availabilityOption = AVAILABILITY_OPTIONS.find(
      (item) => item.key === beaconDraft.availableWindow
    );

    setBeaconSaving(true);

    try {
      const computedTitle = beaconDraft.foodTypes.trim()
        || beaconDraft.title.trim()
        || 'Food available';
      const nextIsActive = Boolean(forceLiveState);

      if (!nextIsActive && feed.userBeacon?.id) {
        await foodBeaconService.deleteMine();
        setBeaconDraft((current) => ({ ...current, isActive: false }));
        setLayers((current) => ({ ...current, beacons: true }));
        setSelectedMarkerId(null);
        setMapFocusRequest({ type: 'user', zoom: 15, nonce: Date.now() });
        await loadLiveFeed(userLocation);
        await hideBeaconComposer();
        setStatusNotice('Beacon removed.');
      } else {
        const payload = {
          title: computedTitle,
          description: beaconDraft.description.trim() || undefined,
          locationLabel: nextLocationLabel || undefined,
          latitude,
          longitude,
          quantityLevel: beaconDraft.quantityLevel,
          foodTypes: beaconDraft.foodTypes.trim() || undefined,
          photoUrl: beaconDraft.photoUrl || null,
          availableUntil: availabilityOption
            ? new Date(Date.now() + (availabilityOption.hours * 60 * 60 * 1000)).toISOString()
            : null,
          isActive: nextIsActive,
          isPublic: beaconDraft.isPublic,
        };

        const response = await foodBeaconService.upsertMine(payload);
        const savedBeaconId = response.data?.beacon?.id || null;

        setBeaconDraft((current) => ({ ...current, isActive: nextIsActive }));
        setLayers((current) => ({ ...current, beacons: true }));
        await loadLiveFeed(userLocation);
        await hideBeaconComposer();

        if (savedBeaconId) {
          setSelectedMarkerId(savedBeaconId);
          setMapFocusRequest({ type: 'marker', id: savedBeaconId, nonce: Date.now() });
        }

        if (nextIsActive) {
          setStatusNotice('Beacon published. Look for the pulsing N marker on the map.');
        } else {
          setStatusNotice('Beacon draft saved. Press Publish beacon when you are ready to show it on the map.');
        }
      }
    } catch (error) {
      console.error('Error saving beacon:', error);
      if (isAuthRequiredError(error)) {
        Alert.alert('Sign in required', 'Public beacons require an account so MVOE can keep the map safe and auditable.');
        return;
      }
      Alert.alert('Beacon save failed', 'The beacon could not be saved right now.');
    } finally {
      setBeaconSaving(false);
    }
  }

  async function openDirections(marker) {
    const url = getDirectionsUrl(marker);
    if (!url) return;
    await Linking.openURL(url);
  }

  async function handleCall(phone) {
    if (!phone) return;
    const digits = phone.replace(/[^\d+]/g, '');
    await Linking.openURL(`tel:${digits}`);
  }

  function openSelectedEvent() {
    if (!selectedMarker) return;
    navigation.navigate('EventDetail', { eventId: selectedMarker.id });
  }

  function openVolunteerOpsForMarker(marker = selectedMarker) {
    if (!marker) return;
    openVolunteerWidget(buildVolunteerPrompt(marker));
  }

  function focusCalendarEvent(event) {
    if (!event?.id) return;

    setCalendarPanelVisible(false);
    hideBeaconComposer({ immediate: true });
    hideEventComposer({ immediate: true });
    hideVolunteerComposer({ immediate: true });
    setMarkerDetailVisible(false);
    setTimeMode('all');
    setLayers((current) => ({ ...current, [getMarkerCategory(event)]: true }));
    setSelectedMarkerId(event.id);
    setMapFocusRequest({ type: 'marker', id: event.id, nonce: Date.now() });
  }


  return (
    <View style={styles.container}>
      <FoodBankMap
        markers={visibleMarkers}
        heatmapMarkers={visibleMarkers}
        selectedId={selectedMarkerId}
        focusRequest={mapFocusRequest}
        onSelect={(marker) => {
          setSelectedMarkerId(marker.id);
          setMarkerDetailVisible(false);
          setMapFocusRequest(null);
          hideBeaconComposer({ immediate: true });
          hideEventComposer({ immediate: true });
          hideVolunteerComposer({ immediate: true });
        }}
        userLocation={userLocation}
      />

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(2, 6, 23, 0.7)', 'rgba(2, 6, 23, 0.12)', 'rgba(2, 6, 23, 0.64)']}
        locations={[0, 0.35, 1]}
        style={styles.mapShade}
      />

      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topStack}>
          {anyComposerOpen ? null : (
          <LinearGradient
            colors={['rgba(9,24,43,0.78)', 'rgba(15,23,42,0.62)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, Platform.OS === 'web' && styles.heroGlass, { width: compactHeroWidth }]}
          >
<View style={[styles.heroHeader, isMobile && styles.heroHeaderMobile]}>
              <View style={[styles.heroCopy, isMobile && styles.heroCopyMobile]}>
                <Text style={styles.heroEyebrow}>Food available</Text>
                <Text style={[styles.heroTitle, isMobile && styles.heroTitleMobile]}>
                  {timeMode === 'now'
                    ? 'Available now'
                    : timeMode === 'upcoming'
                      ? 'Coming up in 24 hours'
                      : timeMode === 'all'
                        ? 'Browse all places'
                        : formatReferenceTime(referenceTime)}
                </Text>
                <Text style={styles.compactStatusText}>
                  {visibleMarkers.length} of {timeFilteredMarkers.length} results · nearby pins group automatically
                </Text>
              </View>

              <View style={[styles.heroActions, isMobile && styles.heroActionsMobile]}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => setHeroCollapsed((current) => !current)}
                  accessibilityLabel={heroCollapsed ? 'Expand map controls' : 'Collapse map controls'}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={heroCollapsed ? 'chevron-down' : 'chevron-up'}
                    size={18}
                    color="white"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={handleRefresh}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh food availability"
                >
                  {refreshing ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Ionicons name="refresh" size={18} color="white" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => locateUser(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Find my location"
                >
                  {locating ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Ionicons name="locate" size={18} color="white" />
                  )}
                </TouchableOpacity>

                {!isMobile ? (
                  <>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleZoomIn}
                      accessibilityLabel="Zoom in map"
                      accessibilityRole="button"
                    >
                      <Ionicons name="add" size={18} color="white" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleZoomOut}
                      accessibilityLabel="Zoom out map"
                      accessibilityRole="button"
                    >
                      <Ionicons name="remove" size={18} color="white" />
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            </View>

            {showHeroBody ? (
            <>
            <View style={styles.timeNavigator}>
              <TouchableOpacity
                style={styles.timeStepButton}
                onPress={() => stepReferenceTime(-1)}
                accessibilityRole="button"
                accessibilityLabel="Show three hours earlier"
              >
                <Ionicons name="chevron-back" size={16} color="white" />
                <Text style={styles.timeStepText}>3h</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeModeButton, timeMode === 'now' && styles.timeModeButtonActive]}
                onPress={() => selectTimeMode('now')}
                accessibilityRole="button"
                accessibilityState={{ selected: timeMode === 'now' }}
              >
                <Text style={[styles.timeModeText, timeMode === 'now' && styles.timeModeTextActive]}>Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.timeStepButton}
                onPress={() => stepReferenceTime(1)}
                accessibilityRole="button"
                accessibilityLabel="Show three hours later"
              >
                <Text style={styles.timeStepText}>3h</Text>
                <Ionicons name="chevron-forward" size={16} color="white" />
              </TouchableOpacity>
            </View>
            <View style={styles.browseModeRow}>
              <TouchableOpacity
                style={[styles.browseModeButton, timeMode === 'upcoming' && styles.browseModeButtonActive]}
                onPress={() => selectTimeMode('upcoming')}
                accessibilityRole="button"
                accessibilityState={{ selected: timeMode === 'upcoming' }}
              >
                <Text style={[styles.browseModeText, timeMode === 'upcoming' && styles.browseModeTextActive]}>Upcoming 24h</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.browseModeButton, timeMode === 'all' && styles.browseModeButtonActive]}
                onPress={() => selectTimeMode('all')}
                accessibilityRole="button"
                accessibilityState={{ selected: timeMode === 'all' }}
              >
                <Text style={[styles.browseModeText, timeMode === 'all' && styles.browseModeTextActive]}>Browse all</Text>
              </TouchableOpacity>
              <Text style={styles.statusMeta}>
                {dataMode === 'live' ? `Updated ${formatTimestamp(feed.generatedAt)}` : 'Refresh issue'}
              </Text>
            </View>
            {statusNotice ? <Text style={styles.noticeText}>{statusNotice}</Text> : null}
            </>
            ) : null}
          </LinearGradient>
          )}

          {!anyComposerOpen && !showHeroBody ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <TouchableOpacity
                style={[styles.layerChip, styles.layerChipCompact, styles.layerMasterChip]}
                onPress={toggleAllLayers}
                accessibilityRole="button"
                accessibilityLabel={activeLayerCount > 0 ? 'Hide all map categories' : 'Show all map categories'}
              >
                <Ionicons
                  name={activeLayerCount > 0 ? 'eye-off-outline' : 'eye-outline'}
                  size={16}
                  color="white"
                />
                <Text style={styles.layerMasterChipText}>
                  {activeLayerCount > 0 ? 'Hide all' : 'Show all'}
                </Text>
              </TouchableOpacity>
              {LAYER_OPTIONS.map((layer) => {
                const active = layers[layer.key];
                return (
                  <TouchableOpacity
                    key={layer.key}
                    style={[styles.layerChip, styles.layerChipCompact, active && styles.layerChipActive]}
                    onPress={() => updateLayer(layer.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${layer.label}, ${active ? 'on' : 'off'}; ${categoryCounts[layer.key] || 0} available`}
                    accessibilityState={{ selected: active }}
                  >
                    <View style={[styles.legendGlyph, { backgroundColor: layer.color }]}>
                      <Text style={styles.legendGlyphText}>{layer.glyph}</Text>
                    </View>
                    <Text style={[styles.layerChipText, active && styles.layerChipTextActive]}>
                      {layer.label} {active ? categoryCounts[layer.key] || 0 : 'off'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          {showHeroBody ? (
          <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <TouchableOpacity
              style={[styles.layerChip, styles.layerMasterChip]}
              onPress={toggleAllLayers}
              accessibilityRole="button"
              accessibilityLabel={activeLayerCount > 0 ? 'Hide all map categories' : 'Show all map categories'}
            >
              <Ionicons
                name={activeLayerCount > 0 ? 'eye-off-outline' : 'eye-outline'}
                size={17}
                color="white"
              />
              <Text style={styles.layerMasterChipText}>
                {activeLayerCount > 0 ? 'Hide all' : 'Show all'}
              </Text>
            </TouchableOpacity>
            {LAYER_OPTIONS.map((layer) => {
              const active = layers[layer.key];

              return (
                <TouchableOpacity
                  key={layer.key}
                  style={[
                    styles.layerChip,
                    active && styles.layerChipActive,
                    { borderColor: active ? `${layer.color}66` : 'rgba(255,255,255,0.18)' },
                  ]}
                  onPress={() => updateLayer(layer.key)}
                  accessibilityRole="button"
                    accessibilityLabel={`${layer.label}, ${active ? 'on' : 'off'}; ${categoryCounts[layer.key] || 0} available`}
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.legendGlyph, { backgroundColor: layer.color }]}>
                    <Text style={styles.legendGlyphText}>{layer.glyph}</Text>
                  </View>
                  <Text style={[styles.layerChipText, active && styles.layerChipTextActive]}>
                      {layer.label} {active ? categoryCounts[layer.key] || 0 : 'off'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {RADIUS_OPTIONS.map((value) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.radiusChip,
                  radiusMiles === value && styles.radiusChipActive,
                ]}
                onPress={() => handleRadiusChange(value)}
              >
                <Text
                  style={[
                    styles.radiusChipText,
                    radiusMiles === value && styles.radiusChipTextActive,
                  ]}
                >
                  {value} mi
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.calendarDockRow}>
            <TouchableOpacity
              style={[
                styles.calendarDockCard,
                calendarPanelVisible && styles.calendarDockCardActive,
              ]}
              onPress={() => {
                setLayers((current) => ({ ...current, meals: true, popups: true }));
                setCalendarPanelVisible((current) => !current);
              }}
            >
              <View style={styles.calendarDockIcon}>
                <Ionicons name="calendar" size={14} color="#0F172A" />
              </View>
              <View style={styles.calendarDockCopy}>
                <Text style={styles.calendarDockTitle}>Live calendar</Text>
                <Text style={styles.calendarDockSubtitle}>
                  {liveCalendarEvents.length > 0
                    ? `${liveCalendarEvents.length} upcoming`
                    : 'No upcoming meals'}
                </Text>
              </View>
              <Ionicons
                name={calendarPanelVisible ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color="#334155"
              />
            </TouchableOpacity>
          </View>
          </>
          ) : null}
        </View>

        {calendarPanelVisible ? (
          <View style={styles.calendarPanelCard}>
            <View style={styles.calendarHeaderRow}>
              <View style={styles.calendarHeaderCopy}>
                <Text style={styles.calendarTitle}>Live calendar</Text>
                <Text style={styles.calendarSubtitle}>
                  {liveCalendarEvents.length > 0
                    ? 'Meals and food events in the next 24 hours.'
                    : 'Nothing scheduled in the next 24 hours.'}
                </Text>
              </View>

              <View style={styles.calendarHeaderActions}>
                <TouchableOpacity
                  style={styles.calendarCreateButton}
                  onPress={() => openEventComposer()}
                >
                  <Ionicons name="add-circle" size={15} color="#0F172A" />
                  <Text style={styles.calendarCreateText}>Create</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.iconButtonSoft}
                  onPress={() => setCalendarPanelVisible(false)}
                >
                  <Ionicons name="close" size={15} color="#334155" />
                </TouchableOpacity>
              </View>
            </View>

            {liveCalendarEvents.length > 0 ? (
              <View style={styles.calendarEventList}>
                {liveCalendarEvents.map((event) => (
                  <View key={event.id} style={styles.calendarEventRow}>
                    <TouchableOpacity
                      style={styles.calendarEventMain}
                      onPress={() => focusCalendarEvent(event)}
                    >
                      <View style={styles.calendarDateBadge}>
                        <Text style={styles.calendarDateDay}>
                          {new Date(event.upcomingWindow?.startTime || event.eventDate || event.startTime).getDate()}
                        </Text>
                        <Text style={styles.calendarDateMonth}>
                          {new Date(event.upcomingWindow?.startTime || event.eventDate || event.startTime).toLocaleDateString([], { month: 'short' })}
                        </Text>
                      </View>
                      <View style={styles.calendarEventCopy}>
                        <Text numberOfLines={1} style={styles.calendarEventTitle}>{event.name}</Text>
                        <Text numberOfLines={1} style={styles.calendarEventMeta}>
                          {formatCalendarDay(event.upcomingWindow?.startTime || event.eventDate || event.startTime)} • {formatCalendarTimeRange(event.upcomingWindow?.startTime || event.startTime, event.upcomingWindow?.endTime || event.endTime)}
                        </Text>
                        <Text numberOfLines={1} style={styles.calendarEventMeta}>
                          {event.location || event.address || 'Address pending'} • {getMarkerTypeLabel(event)}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.calendarEventAction}
                      onPress={() => focusCalendarEvent(event)}
                    >
                      <Ionicons name="locate-outline" size={14} color="#0F172A" />
                      <Text style={styles.calendarEventActionText}>Show</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.calendarEmptyState}>
                <Ionicons name="calendar-outline" size={15} color="#64748B" />
                <Text style={styles.calendarEmptyText}>Nothing scheduled in the next 24 hours.</Text>
              </View>
            )}
          </View>
        ) : null}

        {isMobile && !heroCollapsed ? null : (
        <View style={styles.fabColumn}>
          <TouchableOpacity
            style={[styles.fab, styles.primaryFab]}
            onPress={openBeaconComposer}
            accessibilityRole="button"
            accessibilityLabel="Share food with a neighbor beacon"
          >
            <Ionicons name="radio" size={18} color="white" />
            <Text style={styles.fabText}>Beacon</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.fab}
            onPress={() => openEventComposer()}
            accessibilityRole="button"
            accessibilityLabel="Create a meal event"
          >
            <Ionicons name="flame" size={18} color="#E2E8F0" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.fab}
            onPress={() => openVolunteerWidget()}
            accessibilityRole="button"
            accessibilityLabel="Open volunteer operations"
          >
            <Ionicons name="people" size={18} color="#E2E8F0" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.fab} onPress={() => locateUser(true)}>
            <Ionicons name="locate" size={18} color="#E2E8F0" />
          </TouchableOpacity>
        </View>
        )}

        {selectedMarker && !beaconEditorVisible && !eventEditorVisible && !volunteerEditorVisible ? (
          <View style={styles.markerMiniCard}>
            <View style={styles.markerMiniHeader}>
              <View
                style={[
                  styles.typePill,
                  { backgroundColor: `${getMarkerAccentColor(selectedMarker)}1A` },
                ]}
              >
                <Text
                  style={[
                    styles.typePillText,
                    { color: getMarkerAccentColor(selectedMarker) },
                  ]}
                >
                  {getMarkerTypeLabel(selectedMarker)}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setMarkerDetailVisible(false);
                  setSelectedMarkerId(null);
                }}
              >
                <Ionicons name="close" size={18} color="#475569" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.markerMiniBody}
              onPress={() => setMarkerDetailVisible(true)}
              activeOpacity={0.85}
            >
              <Text numberOfLines={1} style={styles.markerMiniTitle}>{selectedMarker.name}</Text>
              <Text numberOfLines={1} style={styles.markerMiniSubtitle}>{getMarkerSubtitle(selectedMarker)}</Text>

              <View style={styles.markerMiniStatus}>
                <Ionicons name="location" size={12} color="#64748B" />
                <Text numberOfLines={2} style={styles.markerMiniAddress}>{getMarkerAddress(selectedMarker)}</Text>
              </View>

              <View style={styles.statChip}>
                <Text style={styles.statChipLabel}>{selectedAvailabilityLabel}</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.markerMiniActions}>
              <TouchableOpacity
                style={styles.markerMiniAction}
                onPress={() => openDirections(selectedMarker)}
              >
                <Ionicons name="navigate" size={14} color="#0F172A" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.markerMiniAction}
                onPress={() => copyText(getMarkerAddress(selectedMarker))}
              >
                <Ionicons name="copy-outline" size={14} color="#0F172A" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.markerMiniActionPrimary}
                onPress={() => setMarkerDetailVisible(true)}
              >
                <Text style={styles.markerMiniActionPrimaryText}>Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {selectedMarker && markerDetailVisible && !beaconEditorVisible && !eventEditorVisible && !volunteerEditorVisible ? (
          <View style={styles.bottomCard}>
            <View style={styles.bottomHeader}>
              <View
                style={[
                  styles.typePill,
                  { backgroundColor: `${getMarkerAccentColor(selectedMarker)}1A` },
                ]}
              >
                <Text
                  style={[
                    styles.typePillText,
                    { color: getMarkerAccentColor(selectedMarker) },
                  ]}
                >
                  {getMarkerTypeLabel(selectedMarker)}
                </Text>
              </View>

              <View style={styles.bottomHeaderActions}>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setMarkerDetailVisible(false)}
                >
                  <Ionicons name="chevron-down" size={18} color="#475569" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => {
                    setMarkerDetailVisible(false);
                    setSelectedMarkerId(null);
                  }}
                >
                  <Ionicons name="close" size={18} color="#475569" />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.bottomTitle}>{selectedMarker.name}</Text>
            <Text style={styles.bottomSubtitle}>{getMarkerSubtitle(selectedMarker)}</Text>

            <View style={styles.detailRow}>
              <Ionicons name="location" size={14} color="#64748B" />
              <Text selectable style={styles.detailText}>{getMarkerAddress(selectedMarker)}</Text>
            </View>

            {selectedMarker.description ? (
              <Text style={styles.descriptionText} numberOfLines={3}>
                {selectedMarker.description}
              </Text>
            ) : null}

            <View style={styles.statChipRow}>
              <View style={styles.statChip}>
                <Text style={styles.statChipLabel}>{selectedAvailabilityLabel}</Text>
              </View>

              {selectedMarker.markerType === 'food_bank' && selectedMarker.todaysHours ? (
                <View style={styles.statChip}>
                  <Text style={styles.statChipLabel}>{selectedMarker.todaysHours}</Text>
                </View>
              ) : null}

              {selectedMarker.markerType === 'food_beacon' && selectedMarker.availableUntil ? (
                <View style={styles.statChip}>
                  <Text style={styles.statChipLabel}>
                    Pickup until {formatTimestamp(selectedMarker.availableUntil)}
                  </Text>
                </View>
              ) : null}

              {selectedMarker.markerType === 'community_event' ? (
                <View style={styles.statChip}>
                  <Text style={styles.statChipLabel}>
                    {selectedMarker.isLiveNow ? 'Live now' : formatDateTime(selectedMarker.startTime)}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.bottomActionRow}>
              <TouchableOpacity
                style={styles.secondaryActionButton}
                onPress={() => openDirections(selectedMarker)}
              >
                <Ionicons name="navigate" size={16} color="#0F172A" />
                <Text style={styles.secondaryActionText}>Directions</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryActionButton}
                onPress={() => copyText(getMarkerAddress(selectedMarker))}
              >
                <Ionicons name="copy-outline" size={16} color="#0F172A" />
                <Text style={styles.secondaryActionText}>Copy address</Text>
              </TouchableOpacity>

              {(selectedMarker.markerType === 'food_bank' || selectedMarker.source === 'austinIndex') && selectedMarker.phone ? (
                <TouchableOpacity
                  style={styles.secondaryActionButton}
                  onPress={() => handleCall(selectedMarker.phone)}
                >
                  <Ionicons name="call" size={16} color="#0F172A" />
                  <Text style={styles.secondaryActionText}>Call</Text>
                </TouchableOpacity>
              ) : null}

              {selectedMarker.source === 'austinIndex' && selectedMarker.website ? (
                <TouchableOpacity
                  style={styles.secondaryActionButton}
                  onPress={() => Linking.openURL(selectedMarker.website)}
                >
                  <Ionicons name="globe-outline" size={16} color="#0F172A" />
                  <Text style={styles.secondaryActionText}>Website/Source</Text>
                </TouchableOpacity>
              ) : null}

              {selectedMarker.markerType === 'community_event' ? (
                <TouchableOpacity style={styles.primaryActionButton} onPress={openSelectedEvent}>
                  <Ionicons name="calendar" size={16} color="white" />
                  <Text style={styles.primaryActionText}>Open event</Text>
                </TouchableOpacity>
              ) : null}

              {selectedMarker.markerType === 'food_beacon' && feed.userBeacon?.id === selectedMarker.id ? (
                <TouchableOpacity
                  style={styles.primaryActionButton}
                  onPress={() => {
                    openBeaconComposer();
                  }}
                >
                  <Ionicons name="create" size={16} color="white" />
                  <Text style={styles.primaryActionText}>Edit beacon</Text>
                </TouchableOpacity>
              ) : null}

              {selectedMarker.markerType !== 'community_event' && selectedMarker.source !== 'austinIndex' ? (
                <TouchableOpacity
                  style={styles.primaryActionButton}
                  onPress={() => openEventComposer(buildEventDraft(selectedMarker))}
                >
                  <Ionicons name="flame" size={16} color="white" />
                  <Text style={styles.primaryActionText}>Create meal</Text>
                </TouchableOpacity>
              ) : null}

              {selectedMarker.markerType === 'community_event' ? (
                <TouchableOpacity
                  style={styles.secondaryActionButton}
                  onPress={() => openVolunteerOpsForMarker(selectedMarker)}
                >
                  <Ionicons name="people" size={16} color="#0F172A" />
                  <Text style={styles.secondaryActionText}>Staff it</Text>
                </TouchableOpacity>
              ) : null}

            </View>
          </View>
        ) : null}

        {beaconEditorVisible ? (
          <Animated.View
            style={[
              styles.beaconComposer,
              isMobile && styles.beaconComposerMobile,
              beaconComposerAnimatedStyle,
              {
                width: compactBeaconWidth,
                height: compactBeaconHeight,
              },
            ]}
          >
            <KeyboardAvoidingView
              style={styles.beaconKeyboardAvoider}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 74 : 0}
            >
            <LinearGradient
              colors={['rgba(255,255,255,1)', 'rgba(241,245,249,1)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.beaconComposerGlass}
            >
              <View style={styles.beaconComposerHeader}>
                <View style={styles.beaconComposerTitleWrap}>
                  <View style={styles.beaconComposerBadge}>
                    <Ionicons name="radio" size={12} color="#0F766E" />
                    <Text style={styles.beaconComposerBadgeText}>Beacon</Text>
                  </View>
                  <Text style={styles.beaconComposerTitle}>Share food</Text>
                  <Text style={styles.beaconComposerSubtitle}>
                    Add a photo, confirm the pickup spot, and publish.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => hideBeaconComposer()}
                  accessibilityRole="button"
                  accessibilityLabel="Close beacon editor"
                >
                  <Ionicons name="close" size={18} color="#475569" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.beaconComposerScroll}
                contentContainerStyle={styles.beaconComposerContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.compactInputGrid}>
                  <View style={[styles.inputGroup, styles.compactPrimaryField]}>
                    <Text style={styles.inputLabel}>Photo</Text>
                    {beaconDraft.photoUrl ? (
                      <View style={styles.beaconPhotoPreviewWrap}>
                        <Image
                          source={{ uri: publicPhotoUrl(beaconDraft.photoUrl) }}
                          style={styles.beaconPhotoPreview}
                          accessibilityLabel="Food photo preview"
                        />
                        <TouchableOpacity
                          style={styles.photoRemoveButton}
                          onPress={handleBeaconPhotoRemove}
                          accessibilityRole="button"
                          accessibilityLabel="Remove food photo"
                        >
                          <Ionicons name="trash-outline" size={15} color="#991B1B" />
                          <Text style={styles.photoRemoveText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    <View style={styles.photoActionRow}>
                      <TouchableOpacity
                        style={[styles.photoPrimaryButton, beaconPhotoUploading && styles.buttonDisabled]}
                        onPress={() => handleBeaconPhotoPick(isMobile || Platform.OS !== 'web' ? 'camera' : 'library')}
                        disabled={beaconPhotoUploading}
                        accessibilityRole="button"
                        accessibilityLabel={isMobile || Platform.OS !== 'web' ? 'Take food photo' : 'Add food photo'}
                      >
                        {beaconPhotoUploading ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <Ionicons name={isMobile || Platform.OS !== 'web' ? 'camera' : 'image-outline'} size={17} color="white" />
                        )}
                        <Text style={styles.photoPrimaryText}>
                          {beaconPhotoUploading
                            ? 'Uploading...'
                            : isMobile || Platform.OS !== 'web'
                              ? (beaconDraft.photoUrl ? 'Retake photo' : 'Take photo')
                              : (beaconDraft.photoUrl ? 'Replace photo' : 'Add photo')}
                        </Text>
                      </TouchableOpacity>
                      {isMobile || Platform.OS !== 'web' ? (
                        <TouchableOpacity
                          style={styles.photoSecondaryButton}
                          onPress={() => handleBeaconPhotoPick('library')}
                          disabled={beaconPhotoUploading}
                          accessibilityRole="button"
                          accessibilityLabel="Choose an existing food photo"
                        >
                          <Ionicons name="images-outline" size={16} color="#0F172A" />
                          <Text style={styles.photoSecondaryText}>Choose existing</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  <View style={[styles.inputGroup, styles.compactAddressField]}>
                    <Text style={styles.inputLabel}>Brief description</Text>
                    <TextInput
                      style={[styles.input, styles.textAreaCompact]}
                      multiline
                      maxLength={240}
                      value={beaconDraft.description}
                      onChangeText={(text) => setBeaconDraft((current) => ({ ...current, description: text }))}
                      placeholder="What food is available, and where should someone pick it up?"
                      placeholderTextColor="#94A3B8"
                      accessibilityLabel="Brief food and pickup description"
                    />
                  </View>

                  <View style={[styles.inputGroup, styles.compactFullField]}>
                    <View style={styles.inlineLabelRow}>
                      <Text style={styles.inputLabel}>Pickup location</Text>
                      <TouchableOpacity
                        style={styles.geotagButton}
                        onPress={handleUseLocationForBeacon}
                        disabled={locating}
                        accessibilityRole="button"
                        accessibilityLabel="Use my current location for this beacon"
                      >
                        {locating ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons name="locate" size={15} color="#FFFFFF" />
                        )}
                        <Text style={styles.geotagButtonText}>Use my location</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={[styles.locationStatusCard, beaconLocationStatus.ready && styles.locationStatusCardReady]}>
                      <Ionicons
                        name={beaconLocationStatus.ready ? 'checkmark-circle' : 'location-outline'}
                        size={17}
                        color={beaconLocationStatus.ready ? '#047857' : '#64748B'}
                      />
                      <View style={styles.locationStatusCopy}>
                        <Text style={styles.locationStatusTitle} numberOfLines={1}>{beaconLocationStatus.title}</Text>
                        <Text style={styles.locationStatusDetail} numberOfLines={2}>{beaconLocationStatus.detail}</Text>
                      </View>
                    </View>
                    <View style={styles.autocompleteWrap}>
                      <TextInput
                        style={[styles.input, styles.inputCompact]}
                        value={beaconDraft.locationLabel}
                        onChangeText={(text) => {
                          setBeaconDraft((current) => ({
                            ...current,
                            locationLabel: text,
                            latitude: '',
                            longitude: '',
                          }));
                          searchAddress(text);
                        }}
                        placeholder="Choose or type an address / landmark"
                        placeholderTextColor="#94A3B8"
                        accessibilityLabel="Pickup address or landmark"
                      />
                      {addressSearching ? (
                        <ActivityIndicator size="small" color="#0F766E" style={styles.autocompleteSpinner} />
                      ) : null}
                      {addressSuggestions.length > 0 ? (
                        <View style={styles.suggestionList}>
                          {addressSuggestions.map((s, i) => (
                            <TouchableOpacity
                              key={i}
                              style={[styles.suggestionItem, i < addressSuggestions.length - 1 && styles.suggestionItemBorder]}
                              onPress={() => selectAddressSuggestion(s)}
                              accessibilityRole="button"
                              accessibilityLabel={`Use ${s.shortLabel || s.label} as pickup location`}
                            >
                              <Ionicons name="location-outline" size={14} color="#0F766E" />
                              <View style={styles.suggestionText}>
                                <Text style={styles.suggestionPrimary} numberOfLines={1}>{s.shortLabel || s.label}</Text>
                                <Text style={styles.suggestionSecondary} numberOfLines={1}>{s.label}</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={[styles.inputGroup, styles.compactFullField]}>
                    <Text style={styles.inputLabel}>Available for</Text>
                    <View style={styles.availabilityRowCompact}>
                      {AVAILABILITY_OPTIONS.map((option) => {
                        const active = beaconDraft.availableWindow === option.key;
                        return (
                          <TouchableOpacity
                            key={option.key}
                            style={[styles.availabilityChip, styles.availabilityChipCompact, active && styles.availabilityChipActive]}
                            onPress={() => setBeaconDraft((current) => ({ ...current, availableWindow: option.key }))}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`Keep beacon available for ${option.label}`}
                          >
                            <Text style={[styles.availabilityText, active && styles.availabilityTextActive]}>{option.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.availabilityUntilText}>Available until {beaconAvailabilityUntil}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.moreDetailsToggle}
                  onPress={() => setBeaconMoreDetailsVisible((current) => !current)}
                  accessibilityRole="button"
                  accessibilityLabel={beaconMoreDetailsVisible ? 'Hide optional beacon details' : 'Show optional beacon details'}
                  accessibilityState={{ expanded: beaconMoreDetailsVisible }}
                >
                  <View style={styles.moreDetailsToggleCopy}>
                    <Text style={styles.moreDetailsToggleTitle}>More details</Text>
                    <Text style={styles.moreDetailsToggleHint}>Optional food label and amount</Text>
                  </View>
                  <Ionicons name={beaconMoreDetailsVisible ? 'chevron-up' : 'chevron-down'} size={17} color="#475569" />
                </TouchableOpacity>

                {beaconMoreDetailsVisible ? (
                  <View style={styles.moreDetailsPanel}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Food label (optional)</Text>
                      <TextInput
                        style={[styles.input, styles.inputCompact]}
                        value={beaconDraft.foodTypes}
                        onChangeText={(text) => setBeaconDraft((current) => ({ ...current, foodTypes: text }))}
                        placeholder="Sandwiches, produce, pantry goods"
                        placeholderTextColor="#94A3B8"
                        accessibilityLabel="Optional food type label"
                      />
                    </View>
                    <Text style={styles.inputLabel}>Amount (optional)</Text>
                    <View style={styles.optionGridCompact}>
                      {QUANTITY_OPTIONS.map((option) => {
                        const active = beaconDraft.quantityLevel === option.key;
                        return (
                          <TouchableOpacity
                            key={option.key}
                            style={[
                              styles.optionCard,
                              styles.optionCardCompact,
                              active && { borderColor: option.color, backgroundColor: `${option.color}12` },
                            ]}
                            onPress={() => setBeaconDraft((current) => ({ ...current, quantityLevel: option.key }))}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`Amount ${option.label}`}
                          >
                            <Text style={[styles.optionTitle, active && { color: option.color }]}>{option.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.beaconComposerFooter}>
                <Text style={styles.beaconFooterHint}>Publishes now • available until {beaconAvailabilityUntil}</Text>

                <View style={[styles.beaconComposerActions, isMobile && styles.beaconComposerActionsMobile]}>
                  <TouchableOpacity
                    style={[styles.secondaryActionButton, styles.beaconCloseAction]}
                    onPress={() => hideBeaconComposer()}
                    disabled={beaconSaving}
                    accessibilityRole="button"
                    accessibilityLabel="Close without publishing"
                  >
                    <Ionicons name="close-circle-outline" size={16} color="#0F172A" />
                    <Text style={styles.secondaryActionText}>Close</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryActionButton, styles.beaconGoLiveButton]}
                    onPress={() => handleSaveBeacon(true)}
                    disabled={beaconSaving}
                    accessibilityRole="button"
                    accessibilityLabel="Publish food beacon now"
                  >
                    {beaconSaving ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Ionicons name="radio" size={16} color="white" />
                    )}
                    <Text style={styles.primaryActionText}>Publish</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
            </KeyboardAvoidingView>
          </Animated.View>
        ) : null}

        {eventEditorVisible ? (
          <Animated.View
            style={[
              styles.eventComposer,
              eventComposerAnimatedStyle,
              {
                width: compactEventWidth,
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,1)', 'rgba(239,246,255,1)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.eventComposerGlass}
            >
              <View style={styles.eventComposerHeader}>
                <View style={styles.eventComposerTitleWrap}>
                  <View style={styles.eventComposerBadge}>
                    <Ionicons name="flame" size={12} color="#0EA5E9" />
                    <Text style={styles.eventComposerBadgeText}>Meal event</Text>
                  </View>
                  <Text style={styles.eventComposerTitle}>Publish public meal</Text>
                  <Text style={styles.eventComposerSubtitle}>
                    Pick type, servings, location, then publish.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => hideEventComposer()}
                >
                  <Ionicons name="close" size={18} color="#475569" />
                </TouchableOpacity>
              </View>

              <View style={styles.eventComposerContent}>
                <View style={styles.eventTypeGrid}>
                  {QUICK_EVENT_TYPES.map((option) => {
                    const active = eventDraft.eventType === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        style={[
                          styles.eventTypeCard,
                          active && { borderColor: `${option.color}88`, backgroundColor: `${option.color}14` },
                        ]}
                        onPress={() => setEventDraft((current) => ({ ...current, eventType: option.key }))}
                      >
                        <Ionicons name={option.icon} size={14} color={active ? option.color : '#64748B'} />
                        <Text style={[styles.eventTypeText, active && { color: '#0F172A' }]}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Event name</Text>
                  <TextInput
                    style={[styles.input, styles.inputCompact]}
                    value={eventDraft.eventName}
                    onChangeText={(text) => setEventDraft((current) => ({ ...current, eventName: text }))}
                    placeholder="Optional (auto-generated if empty)"
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                <View style={styles.eventMetaRow}>
                  <View style={[styles.inputGroup, styles.eventServingsField]}>
                    <Text style={styles.inputLabel}>Servings</Text>
                    <TextInput
                      style={[styles.input, styles.inputCompact]}
                      value={eventDraft.targetServings}
                      onChangeText={(text) => setEventDraft((current) => ({ ...current, targetServings: text.replace(/[^\d]/g, '') }))}
                      keyboardType="number-pad"
                      placeholder="30"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>

                  <View style={styles.eventMetaBlock}>
                    <Text style={styles.inputLabel}>Start</Text>
                    <View style={styles.eventChipRow}>
                      {EVENT_START_OPTIONS.map((option) => {
                        const active = eventDraft.startOffsetKey === option.key;
                        return (
                          <TouchableOpacity
                            key={option.key}
                            style={[styles.eventMetaChip, active && styles.eventMetaChipActive]}
                            onPress={() => setEventDraft((current) => ({ ...current, startOffsetKey: option.key }))}
                          >
                            <Text style={[styles.eventMetaChipText, active && styles.eventMetaChipTextActive]}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <View style={styles.eventMetaBlock}>
                  <Text style={styles.inputLabel}>Duration</Text>
                  <View style={styles.eventChipRow}>
                    {EVENT_DURATION_OPTIONS.map((option) => {
                      const active = eventDraft.durationKey === option.key;
                      return (
                        <TouchableOpacity
                          key={option.key}
                          style={[styles.eventMetaChip, active && styles.eventMetaChipActive]}
                          onPress={() => setEventDraft((current) => ({ ...current, durationKey: option.key }))}
                        >
                          <Text style={[styles.eventMetaChipText, active && styles.eventMetaChipTextActive]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.inlineLabelRow}>
                    <Text style={styles.inputLabel}>Address</Text>
                    <TouchableOpacity style={styles.miniActionButton} onPress={handleUseLocationForEvent}>
                      {locating ? (
                        <ActivityIndicator size="small" color="#0F172A" />
                      ) : (
                        <Ionicons name="locate" size={14} color="#0F172A" />
                      )}
                      <Text style={styles.miniActionText}>My location</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.autocompleteWrap}>
                    <TextInput
                      style={[styles.input, styles.inputCompact]}
                      value={eventDraft.locationLabel}
                      onChangeText={(text) => {
                        setEventDraft((current) => ({ ...current, locationLabel: text }));
                        searchEventAddress(text);
                      }}
                      placeholder="Address or landmark"
                      placeholderTextColor="#94A3B8"
                    />
                    {eventAddressSearching ? (
                      <ActivityIndicator size="small" color="#0F766E" style={styles.autocompleteSpinner} />
                    ) : null}
                    {eventAddressSuggestions.length > 0 ? (
                      <View style={styles.suggestionList}>
                        {eventAddressSuggestions.map((s, i) => (
                          <TouchableOpacity
                            key={i}
                            style={[styles.suggestionItem, i < eventAddressSuggestions.length - 1 && styles.suggestionItemBorder]}
                            onPress={() => selectEventAddressSuggestion(s)}
                          >
                            <Ionicons name="location-outline" size={14} color="#0F766E" />
                            <View style={styles.suggestionText}>
                              <Text style={styles.suggestionPrimary} numberOfLines={1}>
                                {s.shortLabel || s.label}
                              </Text>
                              <Text style={styles.suggestionSecondary} numberOfLines={1}>
                                {s.label}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={styles.eventComposerFooter}>
                <View style={styles.eventComposerActions}>
                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    onPress={() => hideEventComposer()}
                    disabled={eventSaving}
                  >
                    <Ionicons name="close-circle-outline" size={16} color="#0F172A" />
                    <Text style={styles.secondaryActionText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryActionButton, styles.eventPublishButton]}
                    onPress={handleCreateQuickEvent}
                    disabled={eventSaving}
                  >
                    {eventSaving ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Ionicons name="flame" size={16} color="white" />
                    )}
                    <Text style={styles.primaryActionText}>Publish meal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
        ) : null}

        {volunteerEditorVisible ? (
          <Animated.View
            style={[
              styles.volunteerComposer,
              volunteerComposerAnimatedStyle,
              {
                width: compactVolunteerWidth,
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,1)', 'rgba(236,253,245,1)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.volunteerComposerGlass}
            >
              <View style={styles.volunteerComposerHeader}>
                <View style={styles.volunteerComposerTitleWrap}>
                  <View style={styles.volunteerComposerBadge}>
                    <Ionicons name="people" size={12} color="#0F766E" />
                    <Text style={styles.volunteerComposerBadgeText}>Volunteer ops</Text>
                  </View>
                  <Text style={styles.volunteerComposerTitle}>Volunteer widget</Text>
                  <Text style={styles.volunteerComposerSubtitle}>
                    QR intake, one-tap pings, and centralized chat from the map.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => hideVolunteerComposer()}
                >
                  <Ionicons name="close" size={18} color="#475569" />
                </TouchableOpacity>
              </View>

              <View style={styles.volunteerSummaryRow}>
                <View style={styles.volunteerSummaryPill}>
                  <Text style={styles.volunteerSummaryValue}>{volunteerSummary?.total_volunteers || 0}</Text>
                  <Text style={styles.volunteerSummaryLabel}>Roster</Text>
                </View>
                <View style={styles.volunteerSummaryPill}>
                  <Text style={styles.volunteerSummaryValue}>{volunteerSummary?.active_volunteers || 0}</Text>
                  <Text style={styles.volunteerSummaryLabel}>Active</Text>
                </View>
                <View style={styles.volunteerSummaryPill}>
                  <Text style={styles.volunteerSummaryValue}>{volunteerSummary?.pending_opt_in || 0}</Text>
                  <Text style={styles.volunteerSummaryLabel}>Pending</Text>
                </View>
              </View>

              <View style={styles.volunteerActionRow}>
                <TouchableOpacity style={styles.secondaryActionButton} onPress={handleOpenVolunteerSignup}>
                  <Ionicons name="qr-code-outline" size={16} color="#0F172A" />
                  <Text style={styles.secondaryActionText}>Signup QR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryActionButton} onPress={loadVolunteerWidgetData}>
                  <Ionicons name="refresh" size={16} color="#0F172A" />
                  <Text style={styles.secondaryActionText}>Refresh</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryActionButton, volunteerBroadcasting && styles.disabledButton]}
                  onPress={handleVolunteerBroadcastPing}
                  disabled={volunteerBroadcasting}
                >
                  {volunteerBroadcasting ? (
                    <ActivityIndicator size="small" color="#0F172A" />
                  ) : (
                    <Ionicons name="megaphone-outline" size={16} color="#0F172A" />
                  )}
                  <Text style={styles.secondaryActionText}>Ping {broadcastScopeLabel}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.volunteerOpsGrid}>
                <View style={styles.volunteerRosterCard}>
                  <View style={styles.volunteerSectionHeader}>
                    <View>
                      <Text style={styles.volunteerSectionTitle}>Volunteer bubbles</Text>
                      <Text style={styles.volunteerSectionMeta}>
                        Tap to select. Hover or tap once to reveal contact info.
                      </Text>
                    </View>
                    <View style={styles.volunteerSelectionBadge}>
                      <Text style={styles.volunteerSelectionBadgeText}>{broadcastScopeLabel}</Text>
                    </View>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.volunteerTagRow}
                  >
                    <TouchableOpacity
                      style={[
                        styles.volunteerTagChip,
                        !activeVolunteerTag && styles.volunteerTagChipActive,
                      ]}
                      onPress={() => setActiveVolunteerTag('')}
                    >
                      <Text
                        style={[
                          styles.volunteerTagChipText,
                          !activeVolunteerTag && styles.volunteerTagChipTextActive,
                        ]}
                      >
                        All
                      </Text>
                    </TouchableOpacity>
                    {availableVolunteerTags.map((entry) => {
                      const active = activeVolunteerTag === entry.tag;
                      return (
                        <TouchableOpacity
                          key={entry.tag}
                          style={[
                            styles.volunteerTagChip,
                            active && styles.volunteerTagChipActive,
                          ]}
                          onPress={() => setActiveVolunteerTag(active ? '' : entry.tag)}
                        >
                          <Text
                            style={[
                              styles.volunteerTagChipText,
                              active && styles.volunteerTagChipTextActive,
                            ]}
                          >
                            {formatVolunteerTagLabel(entry.tag)} {entry.count ? `(${entry.count})` : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {volunteerLoading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color="#0F766E" />
                      <Text style={styles.volunteerLoadingText}>Loading volunteers...</Text>
                    </View>
                  ) : (
                    <View style={styles.volunteerBubbleWrap}>
                      {filteredVolunteerRoster.length > 0 ? filteredVolunteerRoster.map((volunteer) => {
                        const isSelected = selectedVolunteerIds.includes(volunteer.id);
                        const isRevealed = volunteerMetaRevealId === volunteer.id;
                        return (
                          <Pressable
                            key={volunteer.id}
                            onPress={() => toggleVolunteerSelection(volunteer.id)}
                            onHoverIn={() => setVolunteerMetaRevealId(volunteer.id)}
                            onHoverOut={() => setVolunteerMetaRevealId((current) => (current === volunteer.id ? null : current))}
                            style={[
                              styles.volunteerBubble,
                              isSelected && styles.volunteerBubbleSelected,
                              isRevealed && styles.volunteerBubbleRevealed,
                            ]}
                          >
                            <View style={styles.volunteerBubbleAvatar}>
                              <Text style={styles.volunteerBubbleAvatarText}>
                                {buildVolunteerInitials(volunteer.name)}
                              </Text>
                            </View>
                            <Text numberOfLines={1} style={styles.volunteerBubbleName}>
                              {volunteer.name || 'Volunteer'}
                            </Text>
                          </Pressable>
                        );
                      }) : (
                        <View style={styles.volunteerEmptyState}>
                          <Ionicons name="people-outline" size={16} color="#64748B" />
                          <Text style={styles.volunteerEmptyStateText}>
                            No volunteers match this filter yet.
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {revealedVolunteer ? (
                    <View style={styles.volunteerMetaCard}>
                      <View style={styles.volunteerMetaCopy}>
                        <Text style={styles.volunteerMetaName}>{revealedVolunteer.name || 'Volunteer'}</Text>
                        <Text style={styles.volunteerMetaDetail}>
                          {revealedVolunteer.phone_e164 || revealedVolunteer.email || 'No contact on file'}
                        </Text>
                        <Text style={styles.volunteerMetaDetail}>
                          {(revealedVolunteer.tags || []).map(formatVolunteerTagLabel).join(' • ') || 'No tags yet'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.miniActionButton, volunteerPingingId === revealedVolunteer.id && styles.disabledButton]}
                        onPress={() => handleVolunteerDirectPing(revealedVolunteer)}
                        disabled={volunteerPingingId === revealedVolunteer.id}
                      >
                        {volunteerPingingId === revealedVolunteer.id ? (
                          <ActivityIndicator size="small" color="#0F172A" />
                        ) : (
                          <Ionicons name="send-outline" size={14} color="#0F172A" />
                        )}
                        <Text style={styles.miniActionText}>Volunteer?</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <View style={styles.volunteerGroupAssignWrap}>
                    <Text style={styles.volunteerSectionTitle}>Assign group</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.volunteerGroupChipRow}
                    >
                      {volunteerGroupOptions.map((tag) => {
                        const active = volunteerGroupTag === tag;
                        return (
                          <TouchableOpacity
                            key={tag}
                            style={[
                              styles.volunteerGroupChip,
                              active && styles.volunteerGroupChipActive,
                            ]}
                            onPress={() => setVolunteerGroupTag(tag)}
                          >
                            <Text
                              style={[
                                styles.volunteerGroupChipText,
                                active && styles.volunteerGroupChipTextActive,
                              ]}
                            >
                              {formatVolunteerTagLabel(tag)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <TouchableOpacity
                      style={[
                        styles.primaryActionButton,
                        styles.volunteerAssignButton,
                        (volunteerTagAssigning || !selectedVolunteerIds.length) && styles.disabledButton,
                      ]}
                      onPress={handleAssignSelectedVolunteerTag}
                      disabled={volunteerTagAssigning || !selectedVolunteerIds.length}
                    >
                      {volunteerTagAssigning ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Ionicons name="pricetags-outline" size={16} color="white" />
                      )}
                      <Text style={styles.primaryActionText}>
                        {selectedVolunteerIds.length > 0
                          ? `Tag ${selectedVolunteerIds.length} volunteer${selectedVolunteerIds.length > 1 ? 's' : ''}`
                          : 'Select volunteers to tag'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.volunteerSideColumn}>
                  {volunteerSignupQrUrl ? (
                    <View style={styles.volunteerSignupRow}>
                      <Image source={{ uri: volunteerSignupQrUrl }} style={styles.volunteerQrImage} />
                      <View style={styles.volunteerSignupCopy}>
                        <Text style={styles.volunteerSignupTitle}>Live QR intake</Text>
                        <Text numberOfLines={3} style={styles.volunteerSignupMeta}>
                          Scans flow into the roster automatically with name, phone, and tags.
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {!!volunteerMessages.length ? (
                    <View style={styles.volunteerChatPreview}>
                      {volunteerMessages.slice(-2).map((message) => (
                        <View
                          key={message.id}
                          style={[
                            styles.volunteerMiniMessage,
                            message.role === 'user' ? styles.volunteerMiniMessageUser : styles.volunteerMiniMessageAssistant,
                          ]}
                        >
                          <Text style={styles.volunteerMiniRole}>{message.role === 'user' ? 'You' : 'Agent'}</Text>
                          <Text numberOfLines={3} style={styles.volunteerMiniText}>{message.text}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.volunteerPromptRow}>
                {VOLUNTEER_QUICK_PROMPTS.map((prompt) => (
                  <TouchableOpacity
                    key={prompt}
                    style={styles.promptChip}
                    onPress={() => handleVolunteerAsk(prompt)}
                    disabled={volunteerSending}
                  >
                    <Text numberOfLines={1} style={styles.promptChipText}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.chatComposer}>
                <TextInput
                  style={styles.chatInput}
                  value={volunteerPrompt}
                  onChangeText={setVolunteerPrompt}
                  placeholder="Ask volunteer assistant..."
                  placeholderTextColor="#94A3B8"
                  multiline
                />
                <View style={styles.composerActions}>
                  <TouchableOpacity
                    style={[styles.primaryActionButton, (!volunteerPrompt.trim() || volunteerSending) && styles.disabledButton]}
                    onPress={() => handleVolunteerAsk(volunteerPrompt)}
                    disabled={!volunteerPrompt.trim() || volunteerSending}
                  >
                    {volunteerSending ? (
                      <ActivityIndicator size="small" color="#07121F" />
                    ) : (
                      <Ionicons name="chatbubble-ellipses" size={18} color="#07121F" />
                    )}
                    <Text style={styles.primaryActionButtonText}>{volunteerSending ? 'Thinking...' : 'Send'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>Loading live food map...</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#07121F',
  },
  mapShade: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: Platform.OS === 'web' ? 22 : 54,
    paddingHorizontal: 14,
    paddingBottom: 108,
  },
  topStack: {
    gap: 10,
  },
  heroCard: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.32,
    shadowRadius: 26,
  },
  heroGlass: {
    backdropFilter: 'blur(18px) saturate(145%)',
    WebkitBackdropFilter: 'blur(18px) saturate(145%)',
  },
  heroLauncher: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
  },
  heroLauncherText: {
    fontSize: 13,
    fontWeight: '800',
    color: 'white',
    letterSpacing: 0.3,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  heroHeaderMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroCopy: {
    flex: 1,
    paddingRight: 12,
  },
  heroCopyMobile: {
    paddingRight: 0,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#86EFAC',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '800',
    color: 'white',
    marginBottom: 1,
  },
heroTitleMobile: {
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 0,
  },
  compactStatusText: {
    color: '#BFDBFE',
    fontSize: 11,
    fontWeight: '600',
  },
  heroText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#D7EAFE',
  },
  heroActions: {
    flexDirection: 'row',
    gap: 8,
  },
  heroActionsMobile: {
    justifyContent: 'flex-end',
    gap: 5,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusBadgeLive: {
    backgroundColor: 'rgba(16,185,129,0.18)',
  },
  statusBadgeFallback: {
    backgroundColor: 'rgba(245,158,11,0.18)',
  },
  statusBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  statusMeta: {
    color: '#BFDBFE',
    fontSize: 12,
    fontWeight: '600',
  },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 5,
  },
  reviewBadgeText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '700',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 6,
  },
  metricBlock: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metricValue: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 1,
  },
  metricLabel: {
    color: '#BFDBFE',
    fontSize: 11,
    fontWeight: '600',
  },
  noticeText: {
    color: '#FEF3C7',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 6,
  },
  quickActionText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  timeNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 8,
  },
  timeStepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  timeStepText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '800',
  },
  timeModeButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  timeModeButtonActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  timeModeText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '800',
  },
  timeModeTextActive: {
    color: '#047857',
  },
  browseModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
    marginTop: 7,
  },
  browseModeButton: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  browseModeButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  browseModeText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
  },
  browseModeTextActive: {
    color: '#0F172A',
  },
  chipRow: {
    paddingRight: 8,
    gap: 8,
  },
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 40,
    paddingVertical: 8,
    backgroundColor: 'rgba(9,24,43,0.72)',
    borderWidth: 1,
    gap: 8,
  },
  layerChipCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  layerMasterChip: {
    backgroundColor: 'rgba(9,24,43,0.88)',
    borderColor: 'rgba(255,255,255,0.34)',
  },
  layerMasterChipText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '800',
  },
  legendGlyph: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.86)',
  },
  legendGlyphText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '900',
  },
  layerChipActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  layerChipText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  layerChipTextActive: {
    color: '#0F172A',
  },
  radiusChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(15,23,42,0.56)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  radiusChipActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.36)',
  },
  radiusChipText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  radiusChipTextActive: {
    color: '#0F172A',
  },
  calendarCard: {
    borderRadius: 22,
    padding: 12,
    backgroundColor: 'rgba(248,250,252,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
    gap: 8,
  },
  calendarDockRow: {
    alignItems: 'flex-start',
  },
  calendarDockCard: {
    minWidth: 170,
    maxWidth: 218,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(248,250,252,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  calendarDockCardActive: {
    borderColor: 'rgba(110,231,183,0.88)',
    backgroundColor: 'rgba(236,253,245,0.92)',
  },
  calendarDockIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  calendarDockCopy: {
    flex: 1,
  },
  calendarDockTitle: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 1,
  },
  calendarDockSubtitle: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  calendarPanelCard: {
    alignSelf: 'flex-start',
    marginTop: 8,
    width: 432,
    maxWidth: '95%',
    borderRadius: 22,
    padding: 12,
    backgroundColor: 'rgba(248,250,252,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    gap: 8,
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  calendarHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  calendarTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  calendarSubtitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  calendarCreateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  calendarCreateText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  iconButtonSoft: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calendarEventList: {
    gap: 7,
  },
  calendarEventRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  calendarEventMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calendarDateBadge: {
    width: 40,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  calendarDateDay: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
  },
  calendarDateMonth: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    lineHeight: 12,
  },
  calendarEventCopy: {
    flex: 1,
    gap: 2,
  },
  calendarEventTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  calendarEventMeta: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  calendarEventAction: {
    width: 62,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calendarEventActionText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '800',
  },
  calendarEmptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  calendarEmptyText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  fabColumn: {
    position: 'absolute',
    right: 14,
    bottom: Platform.OS === 'web' ? 228 : 264,
    gap: 12,
    alignItems: 'center',
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 20,
    backgroundColor: 'rgba(15,23,42,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 20,
  },
  primaryFab: {
    width: 74,
    gap: 4,
  },
  fabText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomCard: {
    position: 'absolute',
    left: 14,
    right: 130,
    bottom: 108,
    maxWidth: 640,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  bottomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bottomHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markerMiniCard: {
    position: 'absolute',
    left: 14,
    bottom: 108,
    width: 244,
    minHeight: 226,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    padding: 12,
    gap: 8,
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  markerMiniHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  markerMiniBody: {
    flex: 1,
    gap: 7,
  },
  markerMiniTitle: {
    color: '#0F172A',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  markerMiniSubtitle: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  markerMiniStatus: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  markerMiniAddress: {
    flex: 1,
    color: '#475569',
    fontSize: 11,
    lineHeight: 15,
  },
  markerMiniActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markerMiniAction: {
    width: 40,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  markerMiniActionPrimary: {
    flex: 1,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F766E',
  },
  markerMiniActionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  typePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.12)',
  },
  bottomTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  bottomSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  detailText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#475569',
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#334155',
    marginBottom: 12,
  },
  statChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  statChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statChipLabel: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F766E',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryActionText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryActionText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  beaconComposer: {
    position: 'absolute',
    left: 14,
    bottom: 108,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    overflow: 'hidden',
  },
  beaconComposerMobile: {
    left: 0,
    right: 0,
    bottom: 82,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  beaconKeyboardAvoider: {
    flex: 1,
  },
  beaconComposerGlass: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  beaconComposerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  beaconComposerTitleWrap: {
    flex: 1,
    gap: 6,
  },
  beaconComposerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(236,253,245,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(110,231,183,0.75)',
  },
  beaconComposerBadgeText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  beaconComposerTitle: {
    color: '#0F172A',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
  },
  beaconComposerSubtitle: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
  },
  beaconComposerContent: {
    gap: 8,
    paddingBottom: 18,
  },
  beaconComposerScroll: {
    flex: 1,
    minHeight: 0,
  },
  authCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 22,
    padding: 16,
    gap: 14,
  },
  authText: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
  },
  inlineCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
    gap: 10,
  },
  inlineCardLabel: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  inlineCardValue: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  beaconLiveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(248,250,252,0.88)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  beaconLiveCopy: {
    flex: 1,
  },
  compactInputGrid: {
    gap: 8,
  },
  compactPrimaryField: {
    marginBottom: 0,
  },
  compactAddressField: {
    marginBottom: 0,
  },
  compactFullField: {
    marginBottom: 0,
  },
  inlineLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  miniActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  miniActionText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 10,
  },
  inputLabel: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  inputCompact: {
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  textAreaCompact: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  inlineButtonRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  autocompleteWrap: {
    position: 'relative',
  },
  autocompleteSpinner: {
    position: 'absolute',
    right: 14,
    top: 14,
  },
  suggestionList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionText: {
    flex: 1,
  },
  suggestionPrimary: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  suggestionSecondary: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 15,
  },
  coordinateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  coordinateInput: {
    flex: 1,
  },
  optionGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  optionCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  optionCardCompact: {
    paddingHorizontal: 9,
    paddingVertical: 10,
  },
  beaconPhotoPreview: {
    width: '100%',
    height: 108,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  geotagButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#0F766E',
  },
  geotagButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  locationStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  locationStatusCardReady: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  locationStatusCopy: {
    flex: 1,
  },
  locationStatusTitle: {
    color: '#0F172A',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  locationStatusDetail: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  beaconPhotoPreviewWrap: {
    position: 'relative',
    marginBottom: 8,
  },
  photoRemoveButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  photoRemoveText: {
    color: '#991B1B',
    fontSize: 11,
    fontWeight: '800',
  },
  photoActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoPrimaryButton: {
    flexGrow: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 14,
    backgroundColor: '#0F766E',
  },
  photoPrimaryText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '800',
  },
  photoSecondaryButton: {
    flexGrow: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  photoSecondaryText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  optionTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 0,
  },
  optionHint: {
    color: '#64748B',
    fontSize: 12,
  },
  availabilityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  availabilityRowCompact: {
    flexDirection: 'row',
    gap: 6,
  },
  metaControlRowCompact: {
    gap: 8,
  },
  metaControlBlockCompact: {
    gap: 6,
  },
  optionGridCompact: {
    flexDirection: 'row',
    gap: 8,
  },
  availabilityChip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  availabilityChipCompact: {
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  availabilityChipActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  availabilityText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  availabilityTextActive: {
    color: 'white',
  },
  availabilityUntilText: {
    color: '#475569',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 6,
  },
  moreDetailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  moreDetailsToggleCopy: {
    flex: 1,
  },
  moreDetailsToggleTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  moreDetailsToggleHint: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 15,
  },
  moreDetailsPanel: {
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  beaconComposerFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.18)',
    marginTop: 10,
    paddingTop: 10,
    gap: 8,
  },
  beaconFooterHint: {
    color: '#475569',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  beaconComposerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  beaconComposerActionsMobile: {
    flexWrap: 'nowrap',
  },
  beaconCloseAction: {
    minWidth: 92,
  },
  beaconGoLiveButton: {
    flex: 1,
  },
  eventComposer: {
    position: 'absolute',
    left: 14,
    bottom: 108,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    overflow: 'hidden',
  },
  eventComposerGlass: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  eventComposerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  eventComposerTitleWrap: {
    flex: 1,
    gap: 6,
  },
  eventComposerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(219,234,254,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.8)',
  },
  eventComposerBadgeText: {
    color: '#0EA5E9',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eventComposerTitle: {
    color: '#0F172A',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
  },
  eventComposerSubtitle: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
  },
  eventComposerContent: {
    gap: 8,
  },
  eventTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  eventTypeCard: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7E0EA',
    backgroundColor: 'rgba(255,255,255,0.78)',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  eventTypeText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  eventMetaRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  eventServingsField: {
    width: 96,
    marginBottom: 0,
  },
  eventMetaBlock: {
    flex: 1,
    gap: 6,
  },
  eventChipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  eventMetaChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7E0EA',
    backgroundColor: 'rgba(255,255,255,0.84)',
    alignItems: 'center',
    paddingVertical: 9,
  },
  eventMetaChipActive: {
    borderColor: '#0EA5E9',
    backgroundColor: 'rgba(14,165,233,0.16)',
  },
  eventMetaChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  eventMetaChipTextActive: {
    color: '#0369A1',
  },
  eventComposerFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.18)',
    marginTop: 10,
    paddingTop: 10,
  },
  eventComposerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  eventPublishButton: {
    flex: 1,
  },
  volunteerComposer: {
    position: 'absolute',
    right: 14,
    bottom: 108,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    overflow: 'hidden',
  },
  volunteerComposerGlass: {
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 12,
    gap: 8,
  },
  volunteerComposerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  volunteerComposerTitleWrap: {
    flex: 1,
    gap: 5,
  },
  volunteerComposerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(236,253,245,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(110,231,183,0.75)',
  },
  volunteerComposerBadgeText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  volunteerComposerTitle: {
    color: '#0F172A',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
  },
  volunteerComposerSubtitle: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 16,
  },
  volunteerSummaryRow: {
    flexDirection: 'row',
    gap: 7,
  },
  volunteerSummaryPill: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  volunteerSummaryValue: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 2,
  },
  volunteerSummaryLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  volunteerActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  volunteerOpsGrid: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  volunteerRosterCard: {
    flex: 1.2,
    gap: 8,
  },
  volunteerSideColumn: {
    width: 136,
    gap: 8,
  },
  volunteerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  volunteerSectionTitle: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  volunteerSectionMeta: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
  volunteerSelectionBadge: {
    borderRadius: 999,
    backgroundColor: 'rgba(15,118,110,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.18)',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  volunteerSelectionBadgeText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '800',
  },
  volunteerTagRow: {
    gap: 6,
    paddingRight: 4,
  },
  volunteerTagChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D7E0EA',
    backgroundColor: 'rgba(255,255,255,0.78)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  volunteerTagChipActive: {
    borderColor: '#0F766E',
    backgroundColor: 'rgba(15,118,110,0.12)',
  },
  volunteerTagChipText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  volunteerTagChipTextActive: {
    color: '#0F766E',
  },
  volunteerBubbleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minHeight: 90,
  },
  volunteerBubble: {
    width: 92,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D7E0EA',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 6,
  },
  volunteerBubbleSelected: {
    borderColor: '#0F766E',
    backgroundColor: 'rgba(220,252,231,0.9)',
    transform: [{ scale: 1.02 }],
  },
  volunteerBubbleRevealed: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  volunteerBubbleAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,118,110,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.18)',
  },
  volunteerBubbleAvatarText: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '800',
  },
  volunteerBubbleName: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  volunteerEmptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  volunteerEmptyStateText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  volunteerMetaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  volunteerMetaCopy: {
    flex: 1,
    gap: 2,
  },
  volunteerMetaName: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  volunteerMetaDetail: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 14,
  },
  volunteerGroupAssignWrap: {
    gap: 7,
  },
  volunteerGroupChipRow: {
    gap: 6,
    paddingRight: 4,
  },
  volunteerGroupChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D7E0EA',
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  volunteerGroupChipActive: {
    borderColor: '#0F766E',
    backgroundColor: 'rgba(15,118,110,0.12)',
  },
  volunteerGroupChipText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  volunteerGroupChipTextActive: {
    color: '#0F766E',
  },
  volunteerAssignButton: {
    minHeight: 44,
  },
  volunteerSignupRow: {
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    backgroundColor: 'rgba(255,255,255,0.92)',
    padding: 8,
    alignItems: 'center',
  },
  volunteerQrImage: {
    width: 92,
    height: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    alignSelf: 'center',
  },
  volunteerSignupCopy: {
    gap: 2,
  },
  volunteerSignupTitle: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  volunteerSignupMeta: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 14,
  },
  volunteerPromptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  volunteerChatPreview: {
    gap: 6,
  },
  volunteerMiniMessage: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
  },
  volunteerMiniMessageAssistant: {
    backgroundColor: 'rgba(248,250,252,0.9)',
    borderColor: '#E2E8F0',
  },
  volunteerMiniMessageUser: {
    backgroundColor: 'rgba(236,253,245,0.9)',
    borderColor: '#A7F3D0',
  },
  volunteerMiniRole: {
    color: '#0F766E',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 1,
  },
  volunteerMiniText: {
    color: '#334155',
    fontSize: 11,
    lineHeight: 14,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  volunteerLoadingText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.36)',
  },
  loadingCard: {
    minWidth: 220,
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  loadingText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
});
