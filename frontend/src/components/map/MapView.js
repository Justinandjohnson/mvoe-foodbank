// MapView component for food bank locations with live status
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

// Mapbox access token from environment
const MAPBOX_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
  '';

export default function MapView({
  foodBanks = [],
  onMarkerClick,
  selectedFoodBank,
  userLocation,
  onLocationUpdate,
  style,
  showControls = true,
  initialViewport = {
    latitude: 39.7817,
    longitude: -89.6501,
    zoom: 11
  }
}) {
  const [showMapPlaceholder, setShowMapPlaceholder] = useState(true);

  // Get marker color based on food availability status
  const getMarkerColor = (foodBank) => {
    if (!foodBank.status) return '#6B7280'; // Gray for no status

    switch (foodBank.status.foodAvailable) {
      case 'available':
        return '#10B981'; // Green
      case 'low':
        return '#F59E0B'; // Orange
      case 'out':
        return '#EF4444'; // Red
      default:
        return '#6B7280'; // Gray for unknown
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'available': return 'Food Available';
      case 'low': return 'Low Stock';
      case 'out': return 'Out of Stock';
      default: return 'Status Unknown';
    }
  };

  // Calculate approximate distance for demo (this would use real coordinates with Mapbox)
  const calculateDistance = (foodBank) => {
    if (!userLocation || !foodBank.latitude || !foodBank.longitude) return null;

    // Simple distance approximation for demo
    const latDiff = Math.abs(foodBank.latitude - userLocation.latitude);
    const lonDiff = Math.abs(foodBank.longitude - userLocation.longitude);
    const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 69; // Very rough miles approximation
    return distance.toFixed(1);
  };

  // For now, show a demo map view since Mapbox requires a real token
  return (
    <View style={[styles.container, style]}>
      {/* Map Header */}
      <View style={styles.mapHeader}>
        <Text style={styles.mapTitle}>🗺️ Springfield, IL Food Banks</Text>
        {userLocation && (
          <Text style={styles.locationText}>📍 Your location found</Text>
        )}
      </View>

      {/* Interactive Map Area (Demo Version) */}
      <View style={styles.mapArea}>
        <View style={styles.mapGrid}>
          {foodBanks.slice(0, 6).map((foodBank, index) => (
            <TouchableOpacity
              key={foodBank.id}
              style={[
                styles.mapMarker,
                { backgroundColor: getMarkerColor(foodBank) },
                selectedFoodBank?.id === foodBank.id && styles.selectedMarker,
                {
                  // Position markers in a grid layout for demo
                  left: `${20 + (index % 3) * 25}%`,
                  top: `${20 + Math.floor(index / 3) * 30}%`
                }
              ]}
              onPress={() => onMarkerClick && onMarkerClick(foodBank)}
            >
              <Text style={styles.markerEmoji}>🏪</Text>
              {foodBank.status && (
                <View style={[styles.statusIndicator, { backgroundColor: getMarkerColor(foodBank) }]} />
              )}
            </TouchableOpacity>
          ))}

          {/* User location marker */}
          {userLocation && (
            <View style={[styles.userMarker, { left: '50%', top: '50%' }]}>
              <Text style={styles.userMarkerText}>📍</Text>
            </View>
          )}

          {/* Demo overlay */}
          <View style={styles.demoOverlay}>
            <Text style={styles.demoText}>Interactive Map Demo</Text>
            <Text style={styles.demoSubtext}>
              {MAPBOX_TOKEN ? 'Loading Mapbox...' : 'Add Mapbox token for full map'}
            </Text>
          </View>
        </View>
      </View>

      {/* Selected Food Bank Info */}
      {selectedFoodBank && (
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedName}>{selectedFoodBank.name}</Text>
          {selectedFoodBank.status && (
            <View style={styles.selectedStatus}>
              <View style={[styles.statusDot, { backgroundColor: getMarkerColor(selectedFoodBank) }]} />
              <Text style={styles.statusText}>{getStatusLabel(selectedFoodBank.status.foodAvailable)}</Text>
              {selectedFoodBank.status.waitTimeMinutes && (
                <Text style={styles.waitTime}>• {selectedFoodBank.status.waitTimeMinutes}min wait</Text>
              )}
            </View>
          )}
          <Text style={styles.selectedAddress}>
            {selectedFoodBank.city}, {selectedFoodBank.state}
          </Text>
          {calculateDistance(selectedFoodBank) && (
            <Text style={styles.selectedDistance}>
              📍 ~{calculateDistance(selectedFoodBank)} miles away
            </Text>
          )}
        </View>
      )}

      {/* Map Controls */}
      {showControls && (
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    const location = {
                      latitude: position.coords.latitude,
                      longitude: position.coords.longitude
                    };
                    onLocationUpdate && onLocationUpdate(location);
                  },
                  (error) => console.error('Location error:', error),
                  { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
                );
              }
            }}
          >
            <Text style={styles.controlButtonText}>📍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton}>
            <Text style={styles.controlButtonText}>🧭</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F0F9FF',
  },
  mapHeader: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  mapTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  locationText: {
    fontSize: 12,
    color: '#10B981',
  },
  mapArea: {
    flex: 1,
    position: 'relative',
  },
  mapGrid: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#E0F2FE',
    margin: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#BAE6FD',
  },
  mapMarker: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  selectedMarker: {
    borderColor: '#3B82F6',
    borderWidth: 3,
    transform: [{ scale: 1.1 }],
  },
  markerEmoji: {
    fontSize: 16,
  },
  statusIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'white',
  },
  userMarker: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    marginLeft: -16,
    marginTop: -16,
  },
  userMarkerText: {
    fontSize: 14,
  },
  demoOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  demoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  demoSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  selectedInfo: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  selectedName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  selectedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  waitTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  selectedAddress: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  selectedDistance: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
  },
  controls: {
    position: 'absolute',
    top: 80,
    right: 16,
    flexDirection: 'column',
    gap: 8,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  controlButtonText: {
    fontSize: 18,
  },
});
