// Beacon + map data, straight from Supabase.
// Mirrors the shapes the old API server returned so screens don't need rewriting.
import { supabase, ensureAnonymousSession, publicPhotoUrl, BEACON_PHOTO_BUCKET } from './supabaseClient';
import {
  buildBeaconMapItem,
  buildFoodBankMapItem,
  buildCommunityEventMapItem,
  withinRadius,
} from '../utils/liveMap';

const MAX_BEACONS = 200;

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
    updatedAt: row.updated_at,
  };
}

function toEvent(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    locationLabel: row.location_label,
    latitude: row.latitude,
    longitude: row.longitude,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
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

  const now = new Date();
  // Belt and braces — RLS already hides expired pins, but a stale pin on the
  // map is the one failure that makes people stop trusting the app.
  return data
    .map(toBeacon)
    .filter((b) => !b.availableUntil || new Date(b.availableUntil) > now);
}

export const mapService = {
  async getLiveFeed(params = {}) {
    const { latitude, longitude, radius } = params;

    const [beaconRows, orgRes, eventRes, mine] = await Promise.all([
      fetchLiveBeacons(),
      supabase.from('organizations').select('*').eq('is_active', true).limit(500),
      supabase.from('community_events').select('*').limit(200),
      foodBeaconService.getMineRaw(),
    ]);

    if (orgRes.error) throw orgRes.error;
    if (eventRes.error) throw eventRes.error;

    const now = new Date();
    let foodBanks = orgRes.data.map(toFoodBank).map((f) => buildFoodBankMapItem(f, now));
    let beacons = beaconRows.map((b) => buildBeaconMapItem(b, now));
    let events = eventRes.data.map(toEvent).map((e) => buildCommunityEventMapItem(e, now));

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const miles = radius || 25;
      const near = (item) => withinRadius(item, latitude, longitude, miles);
      foodBanks = foodBanks.filter(near);
      beacons = beacons.filter(near);
      events = events.filter(near);
    }

    return {
      data: {
        foodBanks,
        beacons,
        events,
        userBeacon: mine ? buildBeaconMapItem(mine, now) : null,
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

  async getAll() {
    const beacons = await fetchLiveBeacons();
    const now = new Date();
    return { data: { beacons: beacons.map((b) => buildBeaconMapItem(b, now)) } };
  },

  async getMine() {
    const beacon = await this.getMineRaw();
    return { data: { beacon: beacon ? buildBeaconMapItem(beacon) : null } };
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
