import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

/**
 * MARKER COLOR SCHEME - CONSISTENT ACROSS ALL MAP MARKERS
 *
 * Food Banks:  #22C55E (Green)   - Circle shape
 * Beacons:     #F97316 (Orange)  - Diamond shape (rotated square)
 * Meals:       #8B5CF6 (Purple)  - Square shape
 *
 * Each marker type has ONE color only - no variations based on status.
 */
function getMarkerColor(marker) {
  if (marker.markerType === 'food_beacon') {
    return '#F97316'; // Orange for all beacons
  }

  if (marker.markerType === 'community_event') {
    return '#8B5CF6'; // Purple for all events/meals
  }

  return '#22C55E'; // Green for all food banks
}

function getMarkerClass(marker) {
  if (marker.markerType === 'food_beacon') return 'mshape-beacon';
  if (marker.markerType === 'community_event') return 'mshape-event';
  return 'mshape-bank';
}

function serializeMarkers(markers) {
  return markers
    .filter(
      (marker) => Number.isFinite(Number(marker.lat))
        && Number.isFinite(Number(marker.lng))
        && marker.id
    )
    .map((marker) => ({
      ...marker,
      lat: Number(marker.lat),
      lng: Number(marker.lng),
      color: getMarkerColor(marker),
      shapeClass: getMarkerClass(marker),
      liveClass: marker.markerType === 'food_beacon' && marker.isActive ? ' mbeacon-live' : '',
    }));
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
    html,body,#map{width:100%;height:100vh;background:#07121f;}
    .leaflet-container{background:#07121f;}
    .leaflet-control-attribution{display:none;}
    .leaflet-control-zoom a{
      background:rgba(255,255,255,0.14)!important;
      backdrop-filter:blur(8px);
      color:white!important;
      border:1px solid rgba(255,255,255,0.2)!important;
      font-size:16px;
    }
    .leaflet-control-zoom a:hover{background:rgba(255,255,255,0.26)!important;}
    .custom-marker{display:flex;align-items:center;justify-content:center;cursor:pointer;}
    .mcore{
      width:18px;
      height:18px;
      border:2px solid rgba(255,255,255,0.92);
      box-shadow:0 0 0 4px rgba(255,255,255,0.12),0 6px 18px rgba(0,0,0,0.42);
      transition:transform 0.15s ease, box-shadow 0.15s ease;
    }
    .mshape-bank{border-radius:50%;}
    .mshape-beacon{border-radius:5px;transform:rotate(45deg);}
    .mshape-event{border-radius:4px;}
    .mbeacon-live{animation:beaconPulse 1.7s ease-in-out infinite;}
    .mshape-selected{
      transform:scale(1.18)!important;
      box-shadow:0 0 0 7px rgba(255,255,255,0.16),0 8px 22px rgba(0,0,0,0.56)!important;
    }
    .mshape-beacon.mshape-selected{transform:rotate(45deg) scale(1.16)!important;}
    .mlocation{
      width:12px;
      height:12px;
      border-radius:50%;
      background:#38BDF8;
      border:2px solid white;
      box-shadow:0 0 0 6px rgba(56,189,248,0.16),0 2px 8px rgba(0,0,0,0.4);
    }
    @keyframes beaconPulse{
      0%,100%{
        filter:saturate(1) brightness(1);
        box-shadow:0 0 0 4px rgba(249,115,22,0.14),0 6px 18px rgba(0,0,0,0.42);
      }
      50%{
        filter:saturate(1.24) brightness(1.15);
        box-shadow:0 0 0 8px rgba(249,115,22,0.20),0 0 18px rgba(249,115,22,0.45),0 6px 18px rgba(0,0,0,0.42);
      }
    }
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
    var map = L.map("map", {
      zoomControl: true,
      attributionControl: false,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(map);

    function makeIcon(marker, isSelected) {
      return L.divIcon({
        className: "custom-marker",
        html: '<div class="mcore ' + marker.shapeClass + marker.liveClass + (isSelected ? " mshape-selected" : "") + '" style="background:' + marker.color + '"></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
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
        return;
      }

      var instance = L.marker([marker.lat, marker.lng], { icon: makeIcon(marker, markerId === selectedId) }).addTo(map);
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
            html: '<div class="mlocation"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          })
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
          map.setView([30.2672, -97.7431], 11);
        });
      }

      viewportInitialized = true;
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
    }

    function focusUser(zoom) {
      var targetZoom = zoom || 15;
      if (userMarker) {
        map.flyTo(userMarker.getLatLng(), targetZoom, { animate: true, duration: 0.65 });
      }
    }

    window.addEventListener("message", function (event) {
      if (!event.data || !event.data.type) return;

      if (event.data.type === "set_data") {
        applyData(event.data);
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

export default function FoodBankMap({ markers = [], selectedId, focusRequest, onSelect, userLocation }) {
  const iframeRef = useRef(null);
  const [iframeLoadTick, setIframeLoadTick] = useState(0);
  const serializedMarkers = useMemo(() => serializeMarkers(markers), [markers]);
  const markerSignature = useMemo(
    () => serializedMarkers
      .map((marker) => `${marker.id}:${marker.lat}:${marker.lng}:${marker.liveClass}`)
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
        },
        '*'
      );
    } catch (_) {
      // The map iframe may not be ready yet.
    }
  }, [iframeLoadTick, markerSignature, safeUserLocation, serializedMarkers]);

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
  }, [onSelect, serializedMarkers, safeUserLocation]);

  if (Platform.OS !== 'web') {
    return <View style={styles.fallback} />;
  }

  return (
    <View style={styles.container}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        onLoad={() => setIframeLoadTick((current) => current + 1)}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Live Food Map"
        sandbox="allow-scripts allow-same-origin"
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
  },
});
