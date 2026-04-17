// FoodBankMap - Interactive Mapbox GL map for food banks
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Alert } from 'react-native';
import * as Location from 'expo-location';

// Mapbox GL for web
let MapboxGL = null;
if (Platform.OS === 'web') {
  MapboxGL = require('mapbox-gl');
  require('mapbox-gl/dist/mapbox-gl.css');
}

export default function FoodBankMap({
  foodBanks = [],
  selectedFoodBank,
  onFoodBankSelect,
  mapStyle = 'standard',
  onLocationChange,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  const [userLocation, setUserLocation] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  // Get user location on mount
  useEffect(() => {
    getUserLocation();
  }, []);

  // Initialize map when container is ready
  useEffect(() => {
    if (Platform.OS === 'web' && mapContainerRef.current && !mapInstanceRef.current) {
      initializeMap();
    }
  }, [mapContainerRef.current]);

  // Update markers when food banks change
  useEffect(() => {
    if (mapReady && mapInstanceRef.current) {
      updateMarkers();
    }
  }, [foodBanks, mapReady]);

  // Update selected marker
  useEffect(() => {
    if (mapReady && selectedFoodBank) {
      centerOnFoodBank(selectedFoodBank);
    }
  }, [selectedFoodBank, mapReady]);

  // Update map style
  useEffect(() => {
    if (mapReady && mapInstanceRef.current) {
      const styleUrl = getMapStyleUrl(mapStyle);
      mapInstanceRef.current.setStyle(styleUrl);
    }
  }, [mapStyle, mapReady]);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        console.log('Location permission denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setUserLocation(coords);

      if (onLocationChange) {
        onLocationChange(coords);
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const getMapStyleUrl = (style) => {
    const styles = {
      standard: 'mapbox://styles/mapbox/streets-v12',
      satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
      dark: 'mapbox://styles/mapbox/dark-v11',
      light: 'mapbox://styles/mapbox/light-v11',
    };
    return styles[style] || styles.standard;
  };

  const getStatusColor = (foodBank) => {
    if (foodBank.status === 'closed' || foodBank.status?.foodAvailable === 'out') {
      return '#EF4444'; // Red
    }

    const donationLevel = foodBank.donationLevel || 100;
    if (donationLevel < 30 || foodBank.status?.foodAvailable === 'low') {
      return '#F59E0B'; // Orange
    }

    return '#10B981'; // Green
  };

  const initializeMap = () => {
    if (!MapboxGL) return;

    // Use demo token or environment variable
    // For production, set EXPO_PUBLIC_MAPBOX_TOKEN in .env
    const accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
      process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

    MapboxGL.accessToken = accessToken;

    const initialCenter = userLocation
      ? [userLocation.longitude, userLocation.latitude]
      : [-98.5795, 39.8283]; // Center of US

    const map = new MapboxGL.Map({
      container: mapContainerRef.current,
      style: getMapStyleUrl(mapStyle),
      center: initialCenter,
      zoom: userLocation ? 11 : 4,
    });

    map.on('load', () => {
      setMapReady(true);

      // Add user location marker if available
      if (userLocation) {
        new MapboxGL.Marker({ color: '#3B82F6' })
          .setLngLat([userLocation.longitude, userLocation.latitude])
          .addTo(map);
      }

      // Add navigation controls
      map.addControl(new MapboxGL.NavigationControl(), 'top-right');

      // Add fullscreen control
      map.addControl(new MapboxGL.FullscreenControl(), 'top-right');
    });

    mapInstanceRef.current = map;
  };

  const updateMarkers = () => {
    if (!MapboxGL || !mapInstanceRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add new markers for each food bank
    foodBanks.forEach(foodBank => {
      if (!foodBank.latitude || !foodBank.longitude) return;

      const color = getStatusColor(foodBank);

      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'food-bank-marker';
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = color;
      el.style.border = '3px solid white';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';
      el.style.transition = 'transform 0.2s';

      // Add hover effect
      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.2)';
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)';
      });

      const marker = new MapboxGL.Marker(el)
        .setLngLat([foodBank.longitude, foodBank.latitude])
        .addTo(mapInstanceRef.current);

      // Add popup
      const popup = new MapboxGL.Popup({ offset: 25 })
        .setHTML(`
          <div style="padding: 8px;">
            <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;">
              ${foodBank.name}
            </h3>
            <p style="margin: 0; font-size: 12px; color: #6B7280;">
              ${foodBank.type.replace('_', ' ')}
            </p>
            <div style="margin-top: 8px; font-size: 11px;">
              <div style="display: flex; align-items: center; margin-bottom: 4px;">
                <span style="color: ${color}; margin-right: 4px;">●</span>
                <span>${getStatusText(foodBank)}</span>
              </div>
            </div>
          </div>
        `);

      marker.setPopup(popup);

      // Handle marker click
      el.addEventListener('click', () => {
        if (onFoodBankSelect) {
          onFoodBankSelect(foodBank);
        }
      });

      markersRef.current.push(marker);
    });
  };

  const getStatusText = (foodBank) => {
    if (foodBank.status === 'closed' || foodBank.status?.foodAvailable === 'out') {
      return 'Closed';
    }
    const donationLevel = foodBank.donationLevel || 100;
    if (donationLevel < 30 || foodBank.status?.foodAvailable === 'low') {
      return 'Urgent Need';
    }
    return 'Available';
  };

  const centerOnFoodBank = (foodBank) => {
    if (!mapInstanceRef.current || !foodBank.latitude || !foodBank.longitude) return;

    mapInstanceRef.current.flyTo({
      center: [foodBank.longitude, foodBank.latitude],
      zoom: 14,
      duration: 1000,
    });
  };

  if (Platform.OS !== 'web') {
    // For mobile, show placeholder for now
    // TODO: Implement react-native-maps for native mobile
    return (
      <View style={styles.mobileContainer}>
        {/* Mobile map implementation would go here */}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  mobileContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
