import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import austinFoodIndex from '../data/austinFoodIndex.json';

const AUSTIN_TYPE_LABELS = {
  food_bank: 'Food Bank',
  pantry: 'Pantry',
  community_fridge: 'Community Fridge',
  meal: 'Meal',
  program: 'Program',
  event: 'Event',
};

const AUSTIN_INDEX_MARKERS = (austinFoodIndex?.entries || [])
  .filter((entry) => Number.isFinite(Number(entry?.lat)) && Number.isFinite(Number(entry?.lng)) && entry?.id)
  .map((entry) => ({
    id: `austin-${entry.id}`,
    source: 'austinIndex',
    markerType: `austin_${entry.type || 'program'}`,
    austinType: entry.type || 'program',
    name: entry.name || 'Untitled location',
    lat: Number(entry.lat),
    lng: Number(entry.lng),
    address: entry.address || '',
    phone: entry.phone || '',
    website: entry.website || entry.source_url || '',
    hours: entry.hours || '',
    eligibility: entry.eligibility || '',
    event_date: entry.event_date || null,
    last_verified: entry.last_verified || null,
  }));

const LAYER_OPTIONS = [
  { key: 'foodBanks', label: 'Food Banks', icon: 'business', color: '#22C55E' },
  { key: 'beacons', label: 'Beacons', icon: 'radio', color: '#F97316' },
  { key: 'events', label: 'Meals', icon: 'flame', color: '#8B5CF6' },
  { key: 'austinIndex', label: 'Community Index', icon: 'basket', color: '#0EA5E9' },
];

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
  if (marker.source === 'austinIndex') {
    return AUSTIN_TYPE_LABELS[marker.austinType] || 'Community listing';
  }
  if (marker.markerType === 'food_bank') return 'Food bank';
  if (marker.markerType === 'food_beacon') return 'Food beacon';
  return 'Meal event';
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
  const { width: windowWidth } = useWindowDimensions();
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
  const [userLocation, setUserLocation] = useState(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [mapFocusRequest, setMapFocusRequest] = useState(null);
  const [beaconEditorVisible, setBeaconEditorVisible] = useState(false);
  const [eventEditorVisible, setEventEditorVisible] = useState(false);
  const [volunteerEditorVisible, setVolunteerEditorVisible] = useState(false);
  const [calendarPanelVisible, setCalendarPanelVisible] = useState(false);
  const [markerDetailVisible, setMarkerDetailVisible] = useState(false);
  const [heroCollapsed, setHeroCollapsed] = useState(true);
  const showHeroBody = !isMobile || !heroCollapsed;
  const [layers, setLayers] = useState({
    foodBanks: true,
    beacons: true,
    events: true,
    austinIndex: true,
  });
  const [feed, setFeed] = useState({
    foodBanks: [],
    beacons: [],
    events: [],
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
  volunteerWidgetRefreshRef.current = loadVolunteerWidgetData;

  const canReviewHours = isStaffMember();
  const compactBeaconWidth = useMemo(() => {
    if (windowWidth >= 1440) return 448;
    if (windowWidth >= 1100) return 420;
    if (windowWidth >= 860) return 400;
    return Math.max(296, windowWidth - 28);
  }, [windowWidth]);
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
    if (windowWidth >= 1520) return 840;
    if (windowWidth >= 1280) return 760;
    if (windowWidth >= 980) return 690;
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

  const markerPool = useMemo(
    () => [...feed.foodBanks, ...feed.beacons, ...feed.events],
    [feed]
  );

  const visibleMarkers = useMemo(() => {
    const markers = [];

    if (layers.foodBanks) markers.push(...feed.foodBanks);
    if (layers.beacons) markers.push(...feed.beacons);
    if (layers.events) markers.push(...feed.events);
    if (layers.austinIndex) markers.push(...AUSTIN_INDEX_MARKERS);

    return markers.filter(
      (marker) => typeof marker.lat === 'number' && typeof marker.lng === 'number'
    );
  }, [feed, layers]);

  const selectedMarker = useMemo(
    () => markerPool.find((marker) => marker.id === selectedMarkerId) || null,
    [markerPool, selectedMarkerId]
  );

  const summaryMetrics = useMemo(() => ([
    {
      label: 'Open now',
      value: feed.foodBanks.filter((item) => item.openNow === true).length.toString(),
    },
    {
      label: 'Live beacons',
      value: feed.beacons.filter((item) => item.isActive).length.toString(),
    },
    {
      label: 'Meals coming',
      value: feed.events.length.toString(),
    },
  ]), [feed]);
  const liveCalendarEvents = useMemo(() => {
    const now = Date.now();
    const twoHoursAgo = now - (2 * 60 * 60 * 1000);

    return [...feed.events]
      .filter((event) => event?.id)
      .map((event) => {
        const startMs = Date.parse(event.startTime || event.eventDate || '');
        const endMs = Date.parse(event.endTime || '');
        return { event, startMs, endMs };
      })
      .filter(({ startMs, endMs }) => {
        if (!Number.isFinite(startMs)) return false;
        if (Number.isFinite(endMs)) return endMs >= now;
        return startMs >= twoHoursAgo;
      })
      .sort((left, right) => left.startMs - right.startMs)
      .map(({ event }) => event)
      .slice(0, 3);
  }, [feed.events]);
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
      await loadLiveFeed(null, { showSpinner: true, radiusOverride: 25 });
      await locateUser(false, { focusMap: false });
    };

    initialize();
  }, []);

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

    if (params.focusLayer && LAYER_OPTIONS.some((item) => item.key === params.focusLayer)) {
      setLayers({
        foodBanks: params.focusLayer === 'foodBanks',
        beacons: params.focusLayer === 'beacons',
        events: params.focusLayer === 'events',
      });
      nextParams.focusLayer = undefined;
      shouldClearParams = true;
    }

    if (params.openCalendarPanel) {
      setLayers((current) => ({ ...current, events: true }));
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
    const { showSpinner = false, radiusOverride } = options;
    const nextRadius = radiusOverride ?? radiusMiles;

    if (showSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const params = { radius: nextRadius };
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
        userBeacon: nextFeed.userBeacon || null,
        generatedAt: nextFeed.generatedAt || new Date().toISOString(),
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
    hideEventComposer({ immediate: true });
    hideVolunteerComposer({ immediate: true });
    setCalendarPanelVisible(false);
    setMarkerDetailVisible(false);
    showBeaconComposer();
    setSelectedMarkerId(null);
    setMapFocusRequest(null);
    setLayers((current) => ({ ...current, beacons: true }));

    const hasCoordinates = Number.isFinite(Number(beaconDraft.latitude)) && Number.isFinite(Number(beaconDraft.longitude));
    const hasAddress = beaconDraft.locationLabel.trim().length > 0;

    if (!hasCoordinates && !hasAddress) {
      await handleUseLocationForBeacon();
    }
  }

  async function handleBeaconStateChange(nextValue) {
    setBeaconDraft((current) => ({ ...current, isActive: nextValue }));

    if (!nextValue) return;

    const hasCoordinates = Number.isFinite(Number(beaconDraft.latitude)) && Number.isFinite(Number(beaconDraft.longitude));
    const hasAddress = beaconDraft.locationLabel.trim().length > 0;

    if (!hasCoordinates && !hasAddress) {
      await handleUseLocationForBeacon();
    }
  }

  async function openEventComposer(initialDraft = null) {
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
    setLayers((current) => ({ ...current, events: true }));

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
      setLayers((current) => ({ ...current, events: true }));
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

  async function handleBeaconPhotoPick() {
    setBeaconPhotoUploading(true);

    try {
      const uploaded = await pickAndUploadImage();
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

  async function handleSaveBeacon(forceLiveState = beaconDraft.isActive) {
    // Anyone can post a pantry — no account required. Guests are tracked by
    // session id so they can still edit or take down their own pin.

    let nextLocationLabel = beaconDraft.locationLabel.trim();
    let latitude = Number(beaconDraft.latitude);
    let longitude = Number(beaconDraft.longitude);

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
          setStatusNotice('Beacon published. Look for the pulsing orange marker on the map.');
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
    setLayers((current) => ({ ...current, events: true }));
    setSelectedMarkerId(event.id);
    setMapFocusRequest({ type: 'marker', id: event.id, nonce: Date.now() });
  }


  return (
    <View style={styles.container}>
      <FoodBankMap
        markers={visibleMarkers}
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
          <LinearGradient
            colors={['rgba(15,23,42,0.92)', 'rgba(10,37,64,0.76)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, { width: compactHeroWidth }]}
          >
            <View style={styles.heroHeader}>
              <View style={styles.heroCopy}>
                {showHeroBody ? (
                  <Text style={styles.heroEyebrow}>MVOE live map</Text>
                ) : null}
                <Text
                  style={showHeroBody ? styles.heroTitle : styles.heroTitleCompact}
                  numberOfLines={showHeroBody ? undefined : 1}
                >
                  {showHeroBody
                    ? 'Food access, neighbor beacons, and public meals in one view.'
                    : 'MVOE live map'}
                </Text>
                {showHeroBody ? (
                  <Text style={styles.heroText}>
                    Keep the map as the working surface. Beacons, verified hours, and meal gatherings all land here.
                  </Text>
                ) : null}
              </View>

              <View style={styles.heroActions}>
                {isMobile ? (
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => setHeroCollapsed((current) => !current)}
                    accessibilityLabel={heroCollapsed ? 'Expand map panel' : 'Collapse map panel'}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name={heroCollapsed ? 'chevron-down' : 'chevron-up'}
                      size={18}
                      color="white"
                    />
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity style={styles.iconButton} onPress={handleRefresh}>
                  {refreshing ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Ionicons name="refresh" size={18} color="white" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.iconButton} onPress={() => locateUser(true)}>
                  {locating ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Ionicons name="locate" size={18} color="white" />
                  )}
                </TouchableOpacity>

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
              </View>
            </View>

            {showHeroBody ? (
            <>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusBadge,
                dataMode === 'live' ? styles.statusBadgeLive : styles.statusBadgeFallback,
              ]}>
                <Text style={styles.statusBadgeText}>
                  {dataMode === 'live' ? 'Live feed' : 'Refresh issue'}
                </Text>
              </View>
              <Text style={styles.statusMeta}>Updated {formatTimestamp(feed.generatedAt)}</Text>
              {canReviewHours && hoursReviewCount > 0 ? (
                <View style={styles.reviewBadge}>
                  <Ionicons name="time" size={12} color="#FCD34D" />
                  <Text style={styles.reviewBadgeText}>{hoursReviewCount} hours checks due</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.metricRow}>
              {summaryMetrics.map((item) => (
                <View key={item.label} style={styles.metricBlock}>
                  <Text style={styles.metricValue}>{item.value}</Text>
                  <Text style={styles.metricLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            {statusNotice ? <Text style={styles.noticeText}>{statusNotice}</Text> : null}

            <View style={styles.quickRow}>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={handleBeaconQuickToggle}
                disabled={beaconSaving}
              >
                <Ionicons
                  name={feed.userBeacon?.isActive ? 'radio' : 'radio-outline'}
                  size={16}
                  color="#FDE68A"
                />
                <Text style={styles.quickActionText}>
                  {feed.userBeacon?.isActive ? 'Beacon live' : 'Start beacon'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.quickAction} onPress={() => openEventComposer()}>
                <Ionicons name="flame" size={16} color="#C4B5FD" />
                <Text style={styles.quickActionText}>Plan meal event</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => openVolunteerWidget()}
              >
                <Ionicons name="people" size={16} color="#A7F3D0" />
                <Text style={styles.quickActionText}>Volunteer ops</Text>
              </TouchableOpacity>
            </View>
            </>
            ) : null}
          </LinearGradient>

          {showHeroBody ? (
          <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {LAYER_OPTIONS.map((layer) => {
              const count = layer.key === 'foodBanks'
                ? feed.foodBanks.length
                : layer.key === 'beacons'
                  ? feed.beacons.length
                  : layer.key === 'austinIndex'
                    ? AUSTIN_INDEX_MARKERS.length
                    : feed.events.length;

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
                >
                  <Ionicons
                    name={layer.icon}
                    size={15}
                    color={active ? layer.color : '#CBD5E1'}
                  />
                  <Text style={[styles.layerChipText, active && styles.layerChipTextActive]}>
                    {layer.label} {count}
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
                setLayers((current) => ({ ...current, events: true }));
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
                    ? 'Meals synced to this map area.'
                    : 'No upcoming public meals in this radius yet.'}
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
                          {new Date(event.eventDate || event.startTime).getDate()}
                        </Text>
                        <Text style={styles.calendarDateMonth}>
                          {new Date(event.eventDate || event.startTime).toLocaleDateString([], { month: 'short' })}
                        </Text>
                      </View>
                      <View style={styles.calendarEventCopy}>
                        <Text numberOfLines={1} style={styles.calendarEventTitle}>{event.name}</Text>
                        <Text numberOfLines={1} style={styles.calendarEventMeta}>
                          {formatCalendarDay(event.eventDate || event.startTime)} • {formatCalendarTimeRange(event.startTime, event.endTime)}
                        </Text>
                        <Text numberOfLines={1} style={styles.calendarEventMeta}>
                          {event.location || event.address || 'Address pending'} • {event.targetServings || 0} servings
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.calendarEventAction}
                      onPress={() => navigation.navigate('EventDetail', { eventId: event.id })}
                    >
                      <Ionicons name="open-outline" size={14} color="#0F172A" />
                      <Text style={styles.calendarEventActionText}>Open</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.calendarEmptyState}>
                <Ionicons name="calendar-outline" size={15} color="#64748B" />
                <Text style={styles.calendarEmptyText}>Publish your first meal event from this map.</Text>
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.fabColumn}>
          <TouchableOpacity
            style={[styles.fab, styles.primaryFab]}
            onPress={openBeaconComposer}
          >
            <Ionicons name="radio" size={18} color="white" />
            <Text style={styles.fabText}>Beacon</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.fab} onPress={() => openEventComposer()}>
            <Ionicons name="flame" size={18} color="#E2E8F0" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.fab} onPress={() => openVolunteerWidget()}>
            <Ionicons name="people" size={18} color="#E2E8F0" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.fab} onPress={() => locateUser(true)}>
            <Ionicons name="locate" size={18} color="#E2E8F0" />
          </TouchableOpacity>
        </View>

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
                <Text style={styles.statChipLabel}>{getAvailabilityStatus(selectedMarker)}</Text>
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
                <Text style={styles.statChipLabel}>{getAvailabilityStatus(selectedMarker)}</Text>
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
              beaconComposerAnimatedStyle,
              {
                width: compactBeaconWidth,
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.94)', 'rgba(241,245,249,0.84)']}
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
                  <Text style={styles.beaconComposerTitle}>Share food nearby</Text>
                  <Text style={styles.beaconComposerSubtitle}>
                    Add the food, confirm the spot, and send it live.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => hideBeaconComposer()}
                >
                  <Ionicons name="close" size={18} color="#475569" />
                </TouchableOpacity>
              </View>

              <View style={styles.beaconComposerContent}>
                <View style={styles.beaconLiveRow}>
                  <View style={styles.beaconLiveCopy}>
                    <Text style={styles.inlineCardLabel}>Live on the map</Text>
                    <Text style={styles.inlineCardValue}>
                      {beaconDraft.isActive ? 'Turns on when you submit.' : 'Keep it hidden until you are ready.'}
                    </Text>
                  </View>

                  <Switch
                    value={beaconDraft.isActive}
                    onValueChange={handleBeaconStateChange}
                    trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                    thumbColor="#ffffff"
                  />
                </View>

                <View style={styles.compactInputGrid}>
                  <View style={[styles.inputGroup, styles.compactPrimaryField]}>
                    <Text style={styles.inputLabel}>Food</Text>
                    <TextInput
                      style={[styles.input, styles.inputCompact]}
                      value={beaconDraft.foodTypes}
                      onChangeText={(text) => setBeaconDraft((current) => ({ ...current, foodTypes: text }))}
                      placeholder="Sandwiches, canned goods, hot plates"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>

                  <View style={[styles.inputGroup, styles.compactAddressField]}>
                    <View style={styles.inlineLabelRow}>
                      <Text style={styles.inputLabel}>Address</Text>
                      <TouchableOpacity style={styles.miniActionButton} onPress={handleUseLocationForBeacon}>
                        <Ionicons name="locate" size={14} color="#0F172A" />
                        <Text style={styles.miniActionText}>My location</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.autocompleteWrap}>
                      <TextInput
                        style={[styles.input, styles.inputCompact]}
                        value={beaconDraft.locationLabel}
                        onChangeText={(text) => {
                          setBeaconDraft((current) => ({ ...current, locationLabel: text }));
                          searchAddress(text);
                        }}
                        placeholder="Address or landmark"
                        placeholderTextColor="#94A3B8"
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

                  <View style={[styles.inputGroup, styles.compactFullField]}>
                    <Text style={styles.inputLabel}>Pickup note</Text>
                    <TextInput
                      style={[styles.input, styles.textAreaCompact]}
                      multiline
                      value={beaconDraft.description}
                      onChangeText={(text) => setBeaconDraft((current) => ({ ...current, description: text }))}
                      placeholder="Front porch cooler, side gate, ask for blue tent"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>

                  <View style={[styles.inputGroup, styles.compactFullField]}>
                    <Text style={styles.inputLabel}>Photo</Text>
                    <TouchableOpacity
                      style={[styles.optionCard, styles.optionCardCompact]}
                      onPress={handleBeaconPhotoPick}
                      disabled={beaconPhotoUploading}
                    >
                      <Text style={styles.optionTitle}>
                        {beaconPhotoUploading
                          ? 'Uploading...'
                          : beaconDraft.photoUrl
                            ? 'Replace photo'
                            : 'Add a photo of the food'}
                      </Text>
                    </TouchableOpacity>
                    {beaconDraft.photoUrl ? (
                      <Image
                        source={{ uri: publicPhotoUrl(beaconDraft.photoUrl) }}
                        style={styles.beaconPhotoPreview}
                      />
                    ) : null}
                  </View>
                </View>

                <View style={styles.metaControlRowCompact}>
                  <View style={styles.metaControlBlockCompact}>
                    <Text style={styles.inputLabel}>Amount</Text>
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
                          >
                            <Text style={[styles.optionTitle, active && { color: option.color }]}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.metaControlBlockCompact}>
                    <Text style={styles.inputLabel}>Visible for</Text>
                    <View style={styles.availabilityRowCompact}>
                      {AVAILABILITY_OPTIONS.map((option) => {
                        const active = beaconDraft.availableWindow === option.key;

                        return (
                          <TouchableOpacity
                            key={option.key}
                            style={[styles.availabilityChip, styles.availabilityChipCompact, active && styles.availabilityChipActive]}
                            onPress={() => setBeaconDraft((current) => ({ ...current, availableWindow: option.key }))}
                          >
                            <Text style={[styles.availabilityText, active && styles.availabilityTextActive]}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.beaconComposerFooter}>
                <Text style={styles.beaconFooterHint}>
                  {beaconDraft.isActive
                    ? 'Ready to update this beacon live.'
                    : 'Draft stays hidden until you publish it.'}
                </Text>

                <View style={styles.beaconComposerActions}>
                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    onPress={() => hideBeaconComposer()}
                    disabled={beaconSaving}
                  >
                    <Ionicons name="close-circle-outline" size={16} color="#0F172A" />
                    <Text style={styles.secondaryActionText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    onPress={() => handleSaveBeacon(false)}
                    disabled={beaconSaving}
                  >
                    {beaconSaving && !beaconDraft.isActive ? (
                      <ActivityIndicator size="small" color="#0F172A" />
                    ) : (
                      <Ionicons name="document-text-outline" size={16} color="#0F172A" />
                    )}
                    <Text style={styles.secondaryActionText}>Save draft</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryActionButton, styles.beaconGoLiveButton]}
                    onPress={() => handleSaveBeacon(true)}
                    disabled={beaconSaving}
                  >
                    {beaconSaving ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Ionicons name="radio" size={16} color="white" />
                    )}
                    <Text style={styles.primaryActionText}>Publish beacon</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
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
              colors={['rgba(255,255,255,0.94)', 'rgba(239,246,255,0.84)']}
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
              colors={['rgba(255,255,255,0.94)', 'rgba(236,253,245,0.84)']}
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
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.32,
    shadowRadius: 26,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  heroCopy: {
    flex: 1,
    paddingRight: 12,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#86EFAC',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '800',
    color: 'white',
    marginBottom: 6,
  },
  heroTitleCompact: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: 'white',
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
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
  chipRow: {
    paddingRight: 8,
    gap: 8,
  },
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: 'rgba(15,23,42,0.56)',
    borderWidth: 1,
    gap: 8,
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
  beaconComposerGlass: {
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
    height: 140,
    borderRadius: 12,
    marginTop: 8,
    resizeMode: 'cover',
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
