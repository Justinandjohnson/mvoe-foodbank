// FoodBankMap — live Leaflet map inside an iframe.
//
// Why an iframe instead of react-leaflet: this app is React Native Web, and
// pulling a DOM-only map library into the RN bundler was the original problem
// (see git history — the previous version was a static Mapbox embed with no
// markers at all). The iframe keeps Leaflet completely outside the bundle; data
// crosses via postMessage. OpenStreetMap tiles need no token.
//
// Two marker layers:
//   green  — food banks (Organizations), with live open/closed + stock status
//   amber  — beacons, people offering food right now; demo ones are labelled
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../config/api';

const DEFAULT_CENTER = { latitude: 39.5, longitude: -98.35, zoom: 4 };

/** Same deep link the API returns, for anything we plot client-side. */
function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

/** "9:00 AM" / "17:30" -> minutes since midnight. null if unparseable. */
function toMinutes(str) {
  const m = String(str).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ampm = m[3] && m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

/**
 * Is this food bank open right now?
 *
 * Handles both shapes the data actually uses: the seeded strings
 * ("9:00 AM - 5:00 PM", "Closed") and the object form ({open, close, closed}).
 * Returns null when hours are missing or unparseable — the UI shows no badge
 * rather than guessing, because a wrong "Open now" sends someone on a trip to a
 * locked door.
 */
function isOpenNow(hours) {
  if (!hours) return null;
  try {
    const parsed = typeof hours === 'string' ? JSON.parse(hours) : hours;
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = parsed[days[new Date().getDay()]];
    if (today == null) return null;

    let openMin;
    let closeMin;
    if (typeof today === 'string') {
      if (/closed/i.test(today)) return false;
      const parts = today.split(/\s*[-–]\s*/);
      if (parts.length !== 2) return null;
      openMin = toMinutes(parts[0]);
      closeMin = toMinutes(parts[1]);
    } else {
      if (today.closed) return false;
      openMin = toMinutes(today.open);
      closeMin = toMinutes(today.close);
    }
    if (openMin == null || closeMin == null) return null;

    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    // Overnight windows (e.g. 20:00 - 02:00) wrap past midnight.
    return closeMin < openMin
      ? mins >= openMin || mins <= closeMin
      : mins >= openMin && mins <= closeMin;
  } catch {
    return null;
  }
}

const MAP_HTML = `<!doctype html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{height:100%;margin:0;background:#0f172a}
  .leaflet-popup-content{margin:12px 14px;font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif}
  .ttl{font-weight:600;font-size:15px;margin:0 0 4px}
  .meta{color:#475569;font-size:12.5px;margin:2px 0}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;margin:4px 4px 0 0}
  .b-open{background:#dcfce7;color:#166534}.b-closed{background:#fee2e2;color:#991b1b}
  .b-demo{background:#fef3c7;color:#92400e}.b-live{background:#dbeafe;color:#1e40af}
  .go{display:block;margin-top:10px;padding:8px 10px;background:#2563eb;color:#fff;
      text-align:center;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px}
  .legend{position:absolute;bottom:14px;left:14px;z-index:1000;background:rgba(255,255,255,.95);
      padding:8px 11px;border-radius:8px;font:12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;
      box-shadow:0 1px 6px rgba(0,0,0,.25)}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
</style></head><body>
<div id="map"></div>
<div class="legend">
  <div><span class="dot" style="background:#16a34a"></span>Food bank</div>
  <div><span class="dot" style="background:#f59e0b"></span>Someone offering food</div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  var map = L.map('map', {zoomControl:true, attributionControl:true})
             .setView([39.5,-98.35], 4);
  var layers = {
    standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {maxZoom:19, attribution:'&copy; OpenStreetMap'}),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {maxZoom:19, attribution:'&copy; Esri'})
  };
  layers.hybrid = layers.satellite;
  var current = layers.standard.addTo(map);
  var group = L.layerGroup().addTo(map);
  var userMarker = null;

  function pin(color){
    return L.divIcon({className:'', iconSize:[22,22], iconAnchor:[11,11],
      html:'<div style="width:18px;height:18px;border-radius:50%;background:'+color+
           ';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>'});
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function render(data){
    group.clearLayers();
    var pts = [];

    (data.foodBanks||[]).forEach(function(fb){
      if (fb.latitude == null || fb.longitude == null) return;
      pts.push([fb.latitude, fb.longitude]);
      var open = fb.openNow;
      var badge = open === true ? '<span class="badge b-open">Open now</span>'
                : open === false ? '<span class="badge b-closed">Closed</span>' : '';
      var stock = fb.foodAvailable && fb.foodAvailable !== 'unknown'
                ? '<span class="badge b-live">Food: '+esc(fb.foodAvailable)+'</span>' : '';
      var wait = fb.waitTimeMinutes != null
                ? '<div class="meta">Approx. wait: '+esc(fb.waitTimeMinutes)+' min</div>' : '';
      var dist = fb.distance != null ? '<div class="meta">'+esc(fb.distance)+' mi away</div>' : '';
      var html = '<div><p class="ttl">'+esc(fb.name)+'</p>'
        + '<div class="meta">'+esc([fb.address,fb.city,fb.state].filter(Boolean).join(', '))+'</div>'
        + dist + wait + badge + stock
        + '<a class="go" target="_blank" rel="noopener" href="'+esc(fb.directionsUrl)+'">Get directions</a></div>';
      L.marker([fb.latitude, fb.longitude], {icon: pin('#16a34a')})
        .bindPopup(html).addTo(group)
        .on('click', function(){ post({type:'select', kind:'foodBank', id: fb.id}); });
    });

    (data.beacons||[]).forEach(function(b){
      if (b.latitude == null || b.longitude == null) return;
      pts.push([b.latitude, b.longitude]);
      var left = b.minutesRemaining != null
        ? '<div class="meta">Available for about '+esc(b.minutesRemaining)+' more min</div>' : '';
      var who = b.contactName ? '<div class="meta">Offered by '+esc(b.contactName)+'</div>' : '';
      var serv = b.servings ? '<div class="meta">~'+esc(b.servings)+' servings</div>' : '';
      var dist = b.distanceMiles != null ? '<div class="meta">'+esc(b.distanceMiles)+' mi away</div>' : '';
      var tag = b.isDemo ? '<span class="badge b-demo">Example beacon</span>'
                         : '<span class="badge b-live">Live offer</span>';
      var html = '<div><p class="ttl">'+esc(b.title)+'</p>'
        + '<div class="meta">'+esc(b.description)+'</div>'
        + who + serv + dist + left + tag
        + '<a class="go" target="_blank" rel="noopener" href="'+esc(b.directionsUrl)+'">Get directions</a></div>';
      L.marker([b.latitude, b.longitude], {icon: pin('#f59e0b')})
        .bindPopup(html).addTo(group)
        .on('click', function(){ post({type:'select', kind:'beacon', id: b.id}); });
    });

    if (data.user) {
      if (userMarker) map.removeLayer(userMarker);
      userMarker = L.circleMarker([data.user.latitude, data.user.longitude],
        {radius:8, color:'#2563eb', fillColor:'#3b82f6', fillOpacity:.9, weight:3})
        .bindPopup('You are here').addTo(map);
      pts.push([data.user.latitude, data.user.longitude]);
    }

    if (data.style && layers[data.style] && layers[data.style] !== current) {
      map.removeLayer(current); current = layers[data.style].addTo(map);
    }
    if (data.focus && data.focus.latitude != null) {
      map.setView([data.focus.latitude, data.focus.longitude], 14);
    } else if (pts.length === 1) {
      map.setView(pts[0], 13);
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), {padding:[45,45], maxZoom:14});
    }
    post({type:'rendered', foodBanks:(data.foodBanks||[]).length, beacons:(data.beacons||[]).length});
  }

  function post(msg){ try { parent.postMessage(JSON.stringify(msg), '*'); } catch(e){} }
  window.addEventListener('message', function(e){
    var d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch(_) { return; }
    if (d && d.type === 'data') render(d.payload || {});
  });
  post({type:'ready'});
})();
</script></body></html>`;

export default function FoodBankMap({
  foodBanks = [],
  selectedFoodBank,
  onFoodBankSelect,
  mapStyle = 'standard',
  onLocationChange,
}) {
  const iframeRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [beacons, setBeacons] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [counts, setCounts] = useState({ foodBanks: 0, beacons: 0 });

  // Enrich each food bank with an open/closed verdict and a directions link so
  // the map works even for records that predate the API adding directionsUrl.
  const enriched = useMemo(
    () =>
      (foodBanks || [])
        .filter((fb) => fb && fb.latitude != null && fb.longitude != null)
        .map((fb) => ({
          ...fb,
          openNow: isOpenNow(fb.hours),
          foodAvailable: fb.status?.foodAvailable ?? fb.foodAvailable,
          waitTimeMinutes: fb.status?.waitTimeMinutes ?? fb.waitTimeMinutes,
          directionsUrl: fb.directionsUrl || directionsUrl(fb.latitude, fb.longitude),
        })),
    [foodBanks]
  );

  // Listen for messages coming back out of the map.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onMessage = (e) => {
      let d;
      try {
        d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!d || !d.type) return;
      if (d.type === 'ready') setReady(true);
      if (d.type === 'rendered') setCounts({ foodBanks: d.foodBanks, beacons: d.beacons });
      if (d.type === 'select' && d.kind === 'foodBank') {
        const hit = enriched.find((fb) => fb.id === d.id);
        if (hit) onFoodBankSelect?.(hit);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [enriched, onFoodBankSelect]);

  // Beacons are location-scoped, so they only load once we know where we are.
  useEffect(() => {
    if (!userLocation) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const url = `${API_URL}/api/beacons/nearby?latitude=${userLocation.latitude}` +
          `&longitude=${userLocation.longitude}&radius=25`;
        const res = await fetch(url);
        const json = await res.json();
        if (!cancelled && json?.success) setBeacons(json.data.beacons || []);
      } catch {
        if (!cancelled) setBeacons([]);
      }
    };
    load();
    // Beacons expire; keep the map honest without hammering the API.
    const timer = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userLocation]);

  // Push everything into the frame whenever any input changes.
  useEffect(() => {
    if (!ready || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({
        type: 'data',
        payload: {
          foodBanks: enriched,
          beacons,
          user: userLocation,
          style: mapStyle,
          focus: selectedFoodBank,
        },
      }),
      '*'
    );
  }, [ready, enriched, beacons, userLocation, mapStyle, selectedFoodBank]);

  const requestLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setUserLocation(loc);
        onLocationChange?.(loc);
      },
      () => {
        // Denied or unavailable: fall back to the map centre so beacons still
        // demonstrate the mechanic rather than showing nothing.
        const loc = { latitude: DEFAULT_CENTER.latitude, longitude: DEFAULT_CENTER.longitude };
        setUserLocation(loc);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Ask once on mount so the map is populated without a click.
  useEffect(() => {
    if (Platform.OS === 'web') requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDirections = () => {
    const target = selectedFoodBank || enriched[0] || beacons[0];
    Linking.openURL(
      target?.directionsUrl ||
        (target?.latitude != null
          ? directionsUrl(target.latitude, target.longitude)
          : 'https://maps.google.com/?q=food+bank+near+me')
    );
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.fallback}>Map available on web</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <iframe
        ref={iframeRef}
        srcDoc={MAP_HTML}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Food banks and community food beacons"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      />

      <View style={styles.overlay}>
        <TouchableOpacity style={styles.pill} onPress={requestLocation}>
          <Ionicons name="location" size={16} color="#10B981" />
          <Text style={styles.pillText}>Find Nearest</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pill} onPress={openDirections}>
          <Ionicons name="navigate" size={16} color="#3B82F6" />
          <Text style={styles.pillText}>Directions</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.counter}>
        <Text style={styles.counterText}>
          {counts.foodBanks} food banks · {counts.beacons} offers nearby
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', position: 'relative' },
  fallback: { color: '#94A3B8', textAlign: 'center', marginTop: 24 },
  overlay: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 12,
    paddingVertical: 8, borderRadius: 999,
  },
  pillText: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  counter: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(15,23,42,0.85)', paddingHorizontal: 10,
    paddingVertical: 6, borderRadius: 8,
  },
  counterText: { color: '#E2E8F0', fontSize: 12, fontWeight: '600' },
});
