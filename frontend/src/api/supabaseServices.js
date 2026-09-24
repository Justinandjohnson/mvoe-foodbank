// Beacon + map data, straight from Supabase.
// Mirrors the shapes the old API server returned so screens don't need rewriting.
import { supabase, ensureAnonymousSession, publicPhotoUrl, BEACON_PHOTO_BUCKET } from './supabaseClient';
import {
  buildBeaconMapItem,
  buildFoodBankMapItem,
  buildCommunityEventMapItem,
  collectChunkedPages,
  evaluateAvailabilityWindows,
  normalizeResourceCategory,
  partitionLiveFeedItems,
  withinRadius,
} from '../utils/liveMap';

const MAX_BEACONS = 200;
const MAX_AUSTIN_INDEX_ENTRIES = 1000;

// Postgres columns are snake_case; the serializers expect camelCase.
function toBeacon(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    locationLabel: row.location_label,
    latitude: row.latitude,
    longitude: row.longitude,
    quantityLevel: row.quantity_level,
    foodTypes: row.food_types,
    photoUrl: publicPhotoUrl(row.photo_url),
    availableFrom: row.available_from,
    availableUntil: row.available_until,
    isActive: row.is_active,
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toFoodBank(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    address: row.address,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    phone: row.phone,
    website: row.website,
    latitude: row.latitude,
    longitude: row.longitude,
    hours: row.hours,
    timezone: row.timezone || row.metadata?.timezone || 'America/Chicago',
    updatedAt: row.updated_at,
  };
}

function toEvent(row) {
  return {
    id: row.id,
    eventName: row.event_name || row.title,
    eventType: row.event_type,
    description: row.description,
    eventDate: row.event_date,
    location: row.location || row.location_label,
    latitude: row.latitude,
    longitude: row.longitude,
    startTime: row.start_time || row.starts_at,
    endTime: row.end_time || row.ends_at,
    targetServings: row.target_servings,
    isPublic: row.is_public,
    status: row.status,
  };
}

function formatDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function toAustinIndexMarker(row, availabilityRows, referenceDate) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const sourceId = metadata.austinId || row.fingerprint || row.id;
  const type = row.venue_type || metadata.venueType || 'program';
  const fallbackCategory = normalizeResourceCategory(type, `${row.canonical_name || ''} ${row.hours || ''}`);
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);

  if (!sourceId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const availability = evaluateAvailabilityWindows(availabilityRows, referenceDate, fallbackCategory);
  const category = availability.currentWindow?.category || availability.nextWindow?.category || fallbackCategory;

  return {
    id: `austin-${sourceId}`,
    source: 'austinIndex',
    markerType: `austin_${category}`,
    austinType: type,
    category,
    name: row.canonical_name || 'Untitled location',
    lat: latitude,
    lng: longitude,
    address: row.address || '',
    phone: row.phone || '',
    website: row.website || row.source_url || '',
    hours: row.hours || '',
    eligibility: row.eligibility_notes || '',
    event_date: metadata.eventDate || null,
    last_verified: formatDateOnly(row.last_verified_at || metadata.lastVerified),
    ...availability,
  };
}

async function fetchLiveBeacons() {
  const { data, error } = await supabase
    .from('food_beacons')
    .select('*')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
    .limit(MAX_BEACONS);

  if (error) throw error;

  return (data || []).map(toBeacon);
}

async function fetchAustinIndexRows() {
  const { data, error } = await supabase
    .from('food_bank_directory_entries')
    .select(`
      id,
      fingerprint,
      canonical_name,
      source_url,
      website,
      phone,
      address,
      latitude,
      longitude,
      hours,
      eligibility_notes,
      venue_type,
      discovery_status,
      disappeared_at,
      last_verified_at,
      metadata
    `)
    .eq('discovery_status', 'indexed')
    .is('disappeared_at', null)
    .order('canonical_name', { ascending: true })
    .limit(MAX_AUSTIN_INDEX_ENTRIES);

  if (error) throw error;

  return data || [];
}

function isMissingAvailabilityTable(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return ['42p01', 'pgrst205'].includes(String(error?.code || '').toLowerCase())
    || (message.includes('food_bank_availability_windows')
      && (message.includes('does not exist') || message.includes('schema cache')));
}

async function fetchAvailabilityWindows(entryIds) {
  try {
    return await collectChunkedPages(entryIds, async (idChunk, from, to) => (
      supabase
        .from('food_bank_availability_windows')
        .select('*')
        .in('entry_id', idChunk)
        .order('id', { ascending: true })
        .range(from, to)
    ));
  } catch (error) {
    // Deploys can briefly serve the new client before the migration reaches
    // PostgREST's schema cache. Zero rows remain unknown, never open.
    if (isMissingAvailabilityTable(error)) return [];
    throw error;
  }
}

function resolveReferenceInstant(params) {
  const supplied = params.referenceTime ?? params.referenceDate ?? params.at;
  if (supplied == null) return new Date();
  const reference = new Date(supplied);
  if (Number.isNaN(reference.getTime())) throw new TypeError('referenceTime must be a valid date or ISO timestamp');
  return reference;
}

export const mapService = {
  async getLiveFeed(params = {}) {
    const { latitude, longitude, radius } = params;
    const referenceDate = resolveReferenceInstant(params);

    const [beaconRows, orgRes, eventRes, austinIndexRows, mine] = await Promise.all([
      fetchLiveBeacons(),
      supabase.from('organizations').select('*').eq('is_active', true).limit(500),
      supabase.from('community_events').select('*').limit(200),
      fetchAustinIndexRows(),
      foodBeaconService.getMineRaw(),
    ]);

    if (orgRes.error) throw orgRes.error;
    if (eventRes.error) throw eventRes.error;

    const availabilityRows = await fetchAvailabilityWindows(austinIndexRows.map((row) => row.id));

    const windowsByEntry = new Map();
    availabilityRows.forEach((window) => {
      const rows = windowsByEntry.get(window.entry_id) || [];
      rows.push(window);
      windowsByEntry.set(window.entry_id, rows);
    });

    let allFoodBanks = (orgRes.data || []).map(toFoodBank).map((f) => buildFoodBankMapItem(f, referenceDate));
    let allBeacons = beaconRows.map((b) => buildBeaconMapItem(b, referenceDate));
    let allEvents = (eventRes.data || []).map(toEvent).map((e) => buildCommunityEventMapItem(e, referenceDate));
    let allAustinIndex = austinIndexRows
      .map((row) => toAustinIndexMarker(row, windowsByEntry.get(row.id) || [], referenceDate))
      .filter(Boolean);

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const miles = radius || 25;
      const near = (item) => withinRadius(item, latitude, longitude, miles);
      allFoodBanks = allFoodBanks.filter(near);
      allBeacons = allBeacons.filter(near);
      allEvents = allEvents.filter(near);
      allAustinIndex = allAustinIndex.filter((item) => (
        withinRadius({ latitude: item.lat, longitude: item.lng }, latitude, longitude, miles)
      ));
    }

    const partitioned = partitionLiveFeedItems({
      foodBanks: allFoodBanks,
      beacons: allBeacons,
      events: allEvents,
      austinIndex: allAustinIndex,
    }, referenceDate);

    return {
      data: {
        ...partitioned,
        referenceTime: referenceDate.toISOString(),
        userBeacon: mine ? buildBeaconMapItem(mine, referenceDate) : null,
      },
    };
  },
};

export const foodBeaconService = {
  async getMineRaw() {
    const user = await ensureAnonymousSession();

    const { data, error } = await supabase
      .from('food_beacons')
      .select('*')
      .eq('session_id', user.id)
      .maybeSingle();

    if (error) throw error;
    return data ? toBeacon(data) : null;
  },

  async getAll(params = {}) {
    const beacons = await fetchLiveBeacons();
    const referenceDate = resolveReferenceInstant(params);
    return { data: { beacons: beacons.map((b) => buildBeaconMapItem(b, referenceDate)) } };
  },

  async getMine(params = {}) {
    const beacon = await this.getMineRaw();
    const referenceDate = resolveReferenceInstant(params);
    return { data: { beacon: beacon ? buildBeaconMapItem(beacon, referenceDate) : null } };
  },

  async upsertMine(payload) {
    const user = await ensureAnonymousSession();

    const row = {
      session_id: user.id,
      title: payload.title,
      description: payload.description ?? null,
      location_label: payload.locationLabel ?? null,
      latitude: payload.latitude,
      longitude: payload.longitude,
      quantity_level: payload.quantityLevel,
      food_types: payload.foodTypes ?? null,
      photo_url: payload.photoUrl ?? null,
      available_until: payload.availableUntil ?? null,
      is_active: payload.isActive,
      is_public: payload.isPublic ?? true,
    };

    const { data, error } = await supabase
      .from('food_beacons')
      .upsert(row, { onConflict: 'session_id' })
      .select()
      .single();

    if (error) throw error;
    return { data: { beacon: buildBeaconMapItem(toBeacon(data)) } };
  },

  async toggleMine(isActive) {
    const user = await ensureAnonymousSession();

    const { data, error } = await supabase
      .from('food_beacons')
      .update({ is_active: isActive })
      .eq('session_id', user.id)
      .select()
      .single();

    if (error) throw error;
    return { data: { beacon: buildBeaconMapItem(toBeacon(data)) } };
  },

  async deleteMine() {
    const user = await ensureAnonymousSession();

    const { error } = await supabase
      .from('food_beacons')
      .delete()
      .eq('session_id', user.id);

    if (error) throw error;
    return { success: true };
  },
};

/**
 * Uploads to Supabase Storage under the visitor's own folder and returns the
 * stored path (Storage policies key off the folder name).
 */
export async function uploadBeaconPhoto(blobOrFile, extension = 'jpg') {
  const user = await ensureAnonymousSession();
  const path = `${user.id}/beacon-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(BEACON_PHOTO_BUCKET)
    .upload(path, blobOrFile, { contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`, upsert: true });

  if (error) throw error;
  return { path, url: publicPhotoUrl(path) };
}
