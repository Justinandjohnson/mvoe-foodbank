import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

// Help-heatmap weighting per Austin index entry type. Events only count if within 14 days.
const HEAT_WEIGHTS = {
  food_bank: 3, pantry: 2, meal: 2, community_fridge: 1.5, program: 1, event: 2,
};

function resolveHeatType(marker) {
  if (marker.austinType && HEAT_WEIGHTS[marker.austinType]) return marker.austinType;
  if (marker.displayType && HEAT_WEIGHTS[marker.displayType]) return marker.displayType;
  if (marker.type && HEAT_WEIGHTS[marker.type]) return marker.type;
  if (typeof marker.markerType === 'string' && marker.markerType.indexOf('austin_') === 0) {
    const raw = marker.markerType.slice('austin_'.length);
    return HEAT_WEIGHTS[raw] ? raw : 'program';
  }
  return 'program';
}

function buildHeatPoints(markers) {
  const now = Date.now();
  const twoWeeks = now + 14 * 24 * 60 * 60 * 1000;
  return (markers || [])
    .filter((marker) => Number.isFinite(Number(marker.lat)) && Number.isFinite(Number(marker.lng)))
    .filter((marker) => {
      if (resolveHeatType(marker) !== 'event') return true;
      const t = new Date(marker.event_date || marker.startTime).getTime();
      return Number.isFinite(t) && t >= now && t <= twoWeeks;
    })
    .map((marker) => {
      const type = resolveHeatType(marker);
      return [Number(marker.lat), Number(marker.lng), HEAT_WEIGHTS[type] || 1];
    });
}

/**
 * PIN TYPE SCHEME - CONSISTENT ACROSS ALL MAP MARKERS
 *
 * food_bank:         #22C55E (Green)   glyph "B"
 * pantry:            #0EA5E9 (Blue)    glyph "P"
 * community_fridge:  #06B6D4 (Cyan)    glyph "F"
 * meal:              #8B5CF6 (Purple)  glyph "M"
 * popup:             #F97316 (Orange)  glyph "E"
 * beacon:            #F59E0B (Amber)   glyph "N" (neighbor beacon)
 *
 * Legacy markerType values (food_bank / food_beacon / community_event, produced by the
 * live backend feed) are mapped onto this same 6-type palette so every pin on the map -
 * live feed or the Austin index - looks and reads consistently.
 */
const TYPE_META = {
  food_bank: { label: 'Food Bank', c1: '#22C55E', c2: '#15803D', glyph: 'B' },
  pantry: { label: 'Pantry', c1: '#0EA5E9', c2: '#0369A1', glyph: 'P' },
  community_fridge: { label: 'Community Fridge', c1: '#06B6D4', c2: '#0E7490', glyph: 'F' },
  meal: { label: 'Meal', c1: '#8B5CF6', c2: '#6D28D9', glyph: 'M' },
  popup: { label: 'Pop-up / Food Event', c1: '#F97316', c2: '#C2410C', glyph: 'E' },
  beacon: { label: 'Neighbor Beacon', c1: '#F59E0B', c2: '#B45309', glyph: 'N' },
};

function resolveDisplayType(marker) {
  if (marker.markerType === 'food_beacon') return 'beacon';
  const category = String(marker.category || '').toLowerCase();
  if (category === 'food_bank') return 'food_bank';
  if (category === 'pantry') return 'pantry';
  if (category === 'community_fridge') return 'community_fridge';
  if (category === 'meal') return 'meal';
  if (category === 'pop_up' || category === 'event') return 'popup';
  if (marker.displayType && TYPE_META[marker.displayType]) return marker.displayType;
  if (marker.markerType === 'community_event') {
    return ['community_meal', 'potluck', 'barbecue'].includes(marker.eventType) ? 'meal' : 'popup';
  }
  if (marker.markerType === 'food_bank') {
    const type = String(marker.type || '').toLowerCase();
    if (type.includes('fridge')) return 'community_fridge';
    if (type.includes('pantry')) return 'pantry';
    return 'food_bank';
  }
  if (typeof marker.markerType === 'string' && marker.markerType.indexOf('austin_') === 0) {
    const raw = marker.markerType.slice('austin_'.length);
    if (raw === 'program') return 'pantry';
    if (raw === 'event') return 'popup';
    return TYPE_META[raw] ? raw : 'pantry';
  }
  return 'food_bank';
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatWhen(marker) {
  const raw = marker.event_date || marker.startTime;
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function buildPinSvg(displayType, isLive) {
  const meta = TYPE_META[displayType] || TYPE_META.food_bank;
  const gradId = 'g-' + displayType;
  return (
    '<svg width="44" height="54" viewBox="0 0 44 54" xmlns="http://www.w3.org/2000/svg">'
    + '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0%" stop-color="' + meta.c1 + '"/>'
    + '<stop offset="100%" stop-color="' + meta.c2 + '"/>'
    + '</linearGradient></defs>'
    + '<path d="M22 2C10.4 2 2 10.8 2 21.6c0 14.6 20 30.4 20 30.4s20-15.8 20-30.4C42 10.8 33.6 2 22 2z" '
    + 'fill="url(#' + gradId + ')" stroke="rgba(255,255,255,0.95)" stroke-width="2"/>'
    + '<circle cx="22" cy="21" r="12" fill="rgba(255,255,255,0.22)"/>'
    + '<circle cx="22" cy="21" r="12" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="1.5"/>'
    + '<text x="22" y="26.5" font-size="15" font-weight="800" fill="white" text-anchor="middle" '
    + 'font-family="Arial, Helvetica, sans-serif">' + meta.glyph + '</text>'
    + (isLive ? '<circle cx="34" cy="10" r="5" fill="#FACC15" stroke="white" stroke-width="1.5"/>' : '')
    + '</svg>'
  );
}

function serializeMarkers(markers) {
  return markers
    .filter(
      (marker) => Number.isFinite(Number(marker.lat))
        && Number.isFinite(Number(marker.lng))
        && marker.id
    )
    .map((marker) => {
      const displayType = resolveDisplayType(marker);
      const meta = TYPE_META[displayType] || TYPE_META.food_bank;
      const isLive = marker.markerType === 'food_beacon' && !!marker.isActive;
      const address = marker.address
        || [marker.city, marker.state].filter(Boolean).join(', ')
        || marker.locationLabel
        || '';
      const hours = marker.hours || marker.todaysHours || '';
      const when = formatWhen(marker);
      const website = marker.website || marker.source_url || '';

      return {
        ...marker,
        lat: Number(marker.lat),
        lng: Number(marker.lng),
        displayType,
        typeLabel: meta.label,
        pinSvg: buildPinSvg(displayType, isLive),
        liveClass: isLive ? ' mbeacon-live' : '',
        popup: {
          name: marker.name || 'Untitled location',
          typeLabel: meta.label,
          hours,
          when,
          eligibility: marker.eligibility || '',
          address,
          phone: marker.phone || '',
          website,
        },
      };
    });
}

function buildMapHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body,#map{width:100%;height:100vh;background:#e5e3df;}
    .leaflet-container{background:#e5e3df;}
    .leaflet-control-attribution{
      font-size:9px!important;
      background:rgba(255,255,255,0.75)!important;
      color:#333!important;
    }
    .leaflet-control-zoom a{
      background:rgba(255,255,255,0.92)!important;
      color:#111!important;
      border:1px solid rgba(0,0,0,0.15)!important;
      font-size:16px;
    }
    .leaflet-control-zoom a:hover{background:#fff!important;}
    .custom-marker{cursor:pointer;}
    .mcore-wrap{
      display:flex;align-items:flex-end;justify-content:center;
      width:44px;height:54px;
      filter:drop-shadow(0 6px 10px rgba(0,0,0,0.45));
      transition:transform 0.12s ease;
      transform-origin:50% 100%;
    }
    .mcore-wrap svg{width:44px;height:54px;display:block;}
    .mbeacon-live{animation:beaconPulse 1.6s ease-in-out infinite;}
    .mshape-selected{transform:scale(1.22)!important;}
    @keyframes beaconPulse{
      0%,100%{filter:drop-shadow(0 6px 10px rgba(0,0,0,0.45));}
      50%{filter:drop-shadow(0 0 14px rgba(250,204,21,0.75)) drop-shadow(0 6px 10px rgba(0,0,0,0.45));}
    }
    .mlocation-wrap{width:22px;height:22px;display:flex;align-items:center;justify-content:center;}
    .mlocation-pulse{
      position:absolute;width:22px;height:22px;border-radius:50%;
      background:rgba(56,189,248,0.35);animation:locPulse 1.8s ease-out infinite;
    }
    .mlocation{
      width:14px;height:14px;border-radius:50%;background:#2563EB;
      border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.45);
      position:relative;z-index:1;
    }
    @keyframes locPulse{
      0%{transform:scale(0.6);opacity:0.9;}
      100%{transform:scale(2.4);opacity:0;}
    }
    .leaflet-popup-content-wrapper{border-radius:12px;}
    .mpopup{font-family:-apple-system,Segoe UI,Arial,sans-serif;min-width:200px;max-width:260px;}
    .mpopup h3{font-size:14px;margin:0 0 2px;color:#0F172A;}
    .mpopup .mtype{
      display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;
      letter-spacing:0.04em;color:#334155;background:#E2E8F0;border-radius:999px;
      padding:2px 8px;margin-bottom:6px;
    }
    .mpopup .mline{font-size:12px;color:#334155;margin:3px 0;line-height:1.35;}
    .mpopup .mline b{color:#0F172A;}
    .mpopup .mbtnrow{display:flex;gap:6px;margin-top:8px;}
    .mpopup .mbtn{
      flex:1;text-align:center;font-size:12px;font-weight:700;color:white;
      background:#0F172A;border-radius:8px;padding:8px 6px;text-decoration:none;
      display:block;min-height:32px;line-height:16px;
    }
    .mpopup .mbtn.secondary{background:#334155;}
    .locate-btn{
      background:white;width:44px;height:44px;border-radius:8px;
      box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;
      justify-content:center;cursor:pointer;font-size:20px;
    }
    .locate-btn:hover{background:#f1f5f9;}
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var markerEntries = {};
    var markerPayloadById = {};
    var selectedId = null;
    var userMarker = null;
    var viewportInitialized = false;
    var autoLocated = false;
    var map = L.map("map", {
      zoomControl: true,
      attributionControl: true,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      preferCanvas: true,
      zoomAnimation: true,
      markerZoomAnimation: true
    });

    // Esri World Street Map - free, no API key required, styled like a mainstream street map
    // (roads, labels, POIs) with required attribution below.
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, (c) OpenStreetMap contributors, and the GIS User Community"
      }
    ).addTo(map);

    function escapeHtml(value) {
      var div = document.createElement("div");
      div.textContent = value == null ? "" : String(value);
      return div.innerHTML;
    }

    function buildPopupHtml(marker) {
      var p = marker.popup || {};
      var when = p.hours || p.when || "";
      var rows = "";
      if (when) rows += '<div class="mline"><b>When/Hours:</b> ' + escapeHtml(when) + "</div>";
      if (p.eligibility) rows += '<div class="mline"><b>Eligibility:</b> ' + escapeHtml(p.eligibility) + "</div>";
      if (p.address) rows += '<div class="mline">' + escapeHtml(p.address) + "</div>";
      if (p.phone) rows += '<div class="mline">' + escapeHtml(p.phone) + "</div>";

      var dirUrl = "https://www.google.com/maps/dir/?api=1&destination=" + marker.lat + "," + marker.lng;
      var buttons = '<a class="mbtn" target="_blank" rel="noopener" href="' + dirUrl + '">Directions</a>';
      if (p.website) {
        buttons += '<a class="mbtn secondary" target="_blank" rel="noopener" href="' + escapeHtml(p.website) + '">Website</a>';
      }

      return '<div class="mpopup">'
        + '<span class="mtype">' + escapeHtml(p.typeLabel || "") + "</span>"
        + "<h3>" + escapeHtml(p.name || "") + "</h3>"
        + rows
        + '<div class="mbtnrow">' + buttons + "</div>"
        + "</div>";
    }

    function makeIcon(marker, isSelected) {
      return L.divIcon({
        className: "custom-marker",
        html: '<div class="mcore-wrap' + marker.liveClass + (isSelected ? " mshape-selected" : "") + '">' + marker.pinSvg + "</div>",
        iconSize: [44, 54],
        iconAnchor: [22, 52],
        popupAnchor: [0, -46]
      });
    }

    function setProgrammaticView(fn) {
      map.off("moveend", trackViewportInitialization);
      map.off("zoomend", trackViewportInitialization);
      fn();
      setTimeout(function () {
        map.on("moveend", trackViewportInitialization);
        map.on("zoomend", trackViewportInitialization);
      }, 0);
    }

    function trackViewportInitialization() {
      viewportInitialized = true;
    }

    map.on("moveend", trackViewportInitialization);
    map.on("zoomend", trackViewportInitialization);

    function syncSelection(nextSelectedId) {
      selectedId = nextSelectedId || null;
      Object.keys(markerEntries).forEach(function (key) {
        var entry = markerEntries[key];
        entry.instance.setIcon(makeIcon(entry.marker, key === selectedId));
      });
    }

    function upsertMarker(marker) {
      var markerId = String(marker.id);
      var existing = markerEntries[markerId];
      markerPayloadById[markerId] = marker;

      if (existing) {
        existing.marker = marker;
        existing.instance.setLatLng([marker.lat, marker.lng]);
        existing.instance.setIcon(makeIcon(marker, markerId === selectedId));
        existing.instance.setPopupContent(buildPopupHtml(marker));
        return;
      }

      var instance = L.marker([marker.lat, marker.lng], {
        icon: makeIcon(marker, markerId === selectedId),
        riseOnHover: true
      }).addTo(map);
      instance.bindPopup(buildPopupHtml(marker));
      instance.on("click", function () {
        window.parent.postMessage({ type: "marker_select", marker: markerPayloadById[markerId] || marker }, "*");
      });

      markerEntries[markerId] = {
        marker: marker,
        instance: instance
      };
    }

    function removeStaleMarkers(nextIdsSet) {
      Object.keys(markerEntries).forEach(function (markerId) {
        if (nextIdsSet.has(markerId)) return;
        map.removeLayer(markerEntries[markerId].instance);
        delete markerEntries[markerId];
        delete markerPayloadById[markerId];
      });
    }

    function syncMarkers(markers) {
      var nextIds = new Set();
      for (var index = 0; index < markers.length; index += 1) {
        var marker = markers[index];
        var markerId = String(marker.id);
        nextIds.add(markerId);
        upsertMarker(marker);
      }

      removeStaleMarkers(nextIds);
      syncSelection(selectedId);
    }

    function syncUserLocation(userLocation) {
      var hasUser = userLocation
        && typeof userLocation.latitude === "number"
        && typeof userLocation.longitude === "number";

      if (!hasUser) {
        if (userMarker) {
          map.removeLayer(userMarker);
          userMarker = null;
        }
        return;
      }

      var latLng = [userLocation.latitude, userLocation.longitude];
      if (!userMarker) {
        userMarker = L.marker(latLng, {
          icon: L.divIcon({
            className: "custom-marker",
            html: '<div class="mlocation-wrap"><div class="mlocation-pulse"></div><div class="mlocation"></div></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          }),
          zIndexOffset: 1000
        }).addTo(map);
        return;
      }

      userMarker.setLatLng(latLng);
    }

    function getPointsForBounds() {
      var points = Object.keys(markerEntries).map(function (markerId) {
        var marker = markerEntries[markerId].marker;
        return [marker.lat, marker.lng];
      });

      if (userMarker) {
        var ll = userMarker.getLatLng();
        points.push([ll.lat, ll.lng]);
      }

      return points;
    }

    function applyInitialViewport() {
      if (viewportInitialized) return;

      var points = getPointsForBounds();
      if (points.length > 1) {
        setProgrammaticView(function () {
          var bounds = L.latLngBounds(points);
          map.fitBounds(bounds.pad(0.18));
        });
      } else if (points.length === 1) {
        setProgrammaticView(function () {
          map.setView(points[0], 13);
        });
      } else {
        setProgrammaticView(function () {
          map.setView([30.2672, -97.7431], 13);
        });
      }

      viewportInitialized = true;
    }

    // As soon as we learn the user's real location (browser geolocation resolved),
    // recenter on it at ~zoom 13 exactly once, even if an Austin fallback view already ran.
    function autoCenterOnUser(latLng, zoom) {
      if (autoLocated) return;
      autoLocated = true;
      setProgrammaticView(function () {
        map.setView(latLng, zoom || 13);
      });
    }

    function applyData(data) {
      var markers = Array.isArray(data.markers) ? data.markers : [];
      syncMarkers(markers);
      syncUserLocation(data.userLocation || null);
      applyInitialViewport();
    }

    function focusMarker(markerId) {
      var key = String(markerId || "");
      var entry = markerEntries[key];
      if (!entry) return;
      syncSelection(key);
      var nextZoom = Math.max(map.getZoom() || 0, 15);
      map.flyTo(entry.instance.getLatLng(), nextZoom, { animate: true, duration: 0.65 });
      entry.instance.openPopup();
    }

    function focusUser(zoom) {
      var targetZoom = zoom || 15;
      if (userMarker) {
        map.flyTo(userMarker.getLatLng(), targetZoom, { animate: true, duration: 0.65 });
      }
    }

    // In-map locate-me control (in addition to any host-app locate button).
    var LocateControl = L.Control.extend({
      options: { position: "bottomright" },
      onAdd: function () {
        var div = L.DomUtil.create("div", "locate-btn");
        div.innerHTML = "\\u25CE";
        div.title = "Find my location";
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.on(div, "click", function () {
          window.parent.postMessage({ type: "locate_request" }, "*");
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function (pos) {
              var latLng = [pos.coords.latitude, pos.coords.longitude];
              syncUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
              map.flyTo(latLng, Math.max(map.getZoom() || 0, 13), { animate: true, duration: 0.65 });
            });
          }
        });
        return div;
      }
    });
    map.addControl(new LocateControl());

    window.addEventListener("message", function (event) {
      if (!event.data || !event.data.type) return;

      if (event.data.type === "set_data") {
        applyData(event.data);
        var ul = event.data.userLocation;
        if (ul && typeof ul.latitude === "number" && typeof ul.longitude === "number") {
          autoCenterOnUser([ul.latitude, ul.longitude], 13);
        }
      } else if (event.data.type === "select") {
        syncSelection(event.data.id);
      } else if (event.data.type === "focus_marker") {
        focusMarker(event.data.id);
      } else if (event.data.type === "focus_user") {
        focusUser(event.data.zoom);
      } else if (event.data.type === "zoom_in") {
        map.zoomIn();
      } else if (event.data.type === "zoom_out") {
        map.zoomOut();
      }
    });

    window.parent.postMessage({ type: "map_ready" }, "*");
  </script>
</body>
</html>`;
}

export default function FoodBankMap({ markers = [], heatmapMarkers = [], selectedId, focusRequest, onSelect, userLocation }) {
  const iframeRef = useRef(null);
  const [iframeLoadTick, setIframeLoadTick] = useState(0);
  const serializedMarkers = useMemo(() => serializeMarkers(markers), [markers]);
  const heatPoints = useMemo(() => buildHeatPoints(heatmapMarkers), [heatmapMarkers]);
  const heatSignature = useMemo(
    () => heatPoints.map((point) => point.join(':')).join('|'),
    [heatPoints]
  );
  const markerSignature = useMemo(
    () => serializedMarkers
      .map((marker) => `${marker.id}:${marker.lat}:${marker.lng}:${marker.displayType}:${marker.liveClass}:${marker.currentWindow?.startTime || marker.upcomingWindow?.startTime || ''}`)
      .join('|'),
    [serializedMarkers]
  );
  const safeUserLocation = useMemo(() => (
    userLocation && Number.isFinite(Number(userLocation.latitude)) && Number.isFinite(Number(userLocation.longitude))
      ? { latitude: Number(userLocation.latitude), longitude: Number(userLocation.longitude) }
      : null
  ), [userLocation]);
  const html = useMemo(() => buildMapHtml(), []);

  useEffect(() => {
    if (!iframeRef.current?.contentWindow || iframeLoadTick <= 0) {
      return;
    }

    try {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'set_data',
          markers: serializedMarkers,
          userLocation: safeUserLocation,
          heatPoints,
        },
        '*'
      );
    } catch (_) {
      // The map iframe may not be ready yet.
    }
  }, [heatPoints, heatSignature, iframeLoadTick, markerSignature, safeUserLocation, serializedMarkers]);

  useEffect(() => {
    if (iframeRef.current?.contentWindow && iframeLoadTick > 0) {
      try {
        iframeRef.current.contentWindow.postMessage({ type: 'select', id: selectedId }, '*');
      } catch (_) {
        // The map iframe may not be ready yet.
      }
    }
  }, [selectedId, iframeLoadTick, markerSignature]);

  useEffect(() => {
    if (!focusRequest || !iframeRef.current?.contentWindow || iframeLoadTick <= 0) {
      return;
    }

    try {
      if (focusRequest.type === 'user') {
        iframeRef.current.contentWindow.postMessage({ type: 'focus_user', zoom: focusRequest.zoom || 15 }, '*');
      } else if (focusRequest.type === 'zoom_in') {
        iframeRef.current.contentWindow.postMessage({ type: 'zoom_in' }, '*');
      } else if (focusRequest.type === 'zoom_out') {
        iframeRef.current.contentWindow.postMessage({ type: 'zoom_out' }, '*');
      } else if (focusRequest.id) {
        iframeRef.current.contentWindow.postMessage({ type: 'focus_marker', id: focusRequest.id }, '*');
      }
    } catch (_) {
      // The map iframe may not be ready yet.
    }
  }, [focusRequest, iframeLoadTick, markerSignature]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    const handleMessage = (event) => {
      if (event.data?.type === 'marker_select') {
        onSelect?.(event.data.marker);
      }

      if (event.data?.type === 'map_ready') {
        try {
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: 'set_data',
              markers: serializedMarkers,
              userLocation: safeUserLocation,
              heatPoints,
            },
            '*'
          );
        } catch (_) {
          // Ignore race conditions while the iframe boots.
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [heatPoints, heatSignature, onSelect, serializedMarkers, safeUserLocation]);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.fallback} accessibilityRole="summary">
        <View style={styles.fallbackCard}>
          <Text style={styles.fallbackTitle}>Map preview is available on the web</Text>
          <Text style={styles.fallbackText}>
            Current availability, time filters, and the Beacon button still work here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        onLoad={() => setIframeLoadTick((current) => current + 1)}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Live Food Map"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  fallback: {
    flex: 1,
    backgroundColor: '#07121f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  fallbackCard: {
    maxWidth: 420,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: '#0F2438',
    borderWidth: 1,
    borderColor: '#23415D',
  },
  fallbackTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    marginBottom: 6,
  },
  fallbackText: {
    color: '#BFDBFE',
    fontSize: 14,
    lineHeight: 20,
  },
});
