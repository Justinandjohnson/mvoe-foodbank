// Find Screen - Food bank finder with interactive map (Phase 2)
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { foodBankService, organizationService } from '../api/services';
import MapView from '../components/map/MapView';

export default function FindScreen() {
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState([]);
  const [foodBanks, setFoodBanks] = useState([]);
  const [selectedFoodBank, setSelectedFoodBank] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('map'); // 'map' or 'list'
  const [nearbyRadius, setNearbyRadius] = useState(10); // miles

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load both organizations (for backward compatibility) and food banks with status
      const [orgsResponse, foodBanksResponse] = await Promise.all([
        organizationService.getAll(),
        foodBankService.getAll()
      ]);

      setOrganizations(orgsResponse.data.organizations);
      setFoodBanks(foodBanksResponse.data.foodBanks || []);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load food bank data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLocationUpdate = async (location) => {
    setUserLocation(location);

    // Load nearby food banks when location is available
    try {
      const response = await foodBankService.getNearby({
        latitude: location.latitude,
        longitude: location.longitude,
        radius: nearbyRadius
      });

      if (response.data.foodBanks) {
        setFoodBanks(response.data.foodBanks);
      }
    } catch (error) {
      console.error('Error loading nearby food banks:', error);
    }
  };

  const handleMarkerClick = (foodBank) => {
    setSelectedFoodBank(foodBank);
  };

  const handleFindNearest = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          handleLocationUpdate(location);
        },
        (error) => {
          Alert.alert(
            'Location Error',
            'Unable to get your location. Please enable location services and try again.'
          );
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    } else {
      Alert.alert('Not Supported', 'Geolocation is not supported by this device.');
    }
  };

  // Filter food banks based on search
  const filteredFoodBanks = foodBanks.filter(fb =>
    fb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    fb.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
    fb.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Fallback to organizations if no food banks with geolocation
  const displayItems = filteredFoodBanks.length > 0 ? filteredFoodBanks : organizations;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🗺️ Find Food Banks</Text>
        <Text style={styles.subtitle}>
          Interactive map with live status
        </Text>

        {/* Search and controls */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search food banks..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity
            style={styles.findNearestButton}
            onPress={handleFindNearest}
          >
            <Text style={styles.findNearestText}>📍 Find Nearest</Text>
          </TouchableOpacity>
        </View>

        {/* View mode toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'map' && styles.activeToggle]}
            onPress={() => setViewMode('map')}
          >
            <Text style={[styles.toggleText, viewMode === 'map' && styles.activeToggleText]}>
              Map
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'list' && styles.activeToggle]}
            onPress={() => setViewMode('list')}
          >
            <Text style={[styles.toggleText, viewMode === 'list' && styles.activeToggleText]}>
              List
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {viewMode === 'map' ? (
          <MapView
            style={styles.map}
            foodBanks={filteredFoodBanks}
            selectedFoodBank={selectedFoodBank}
            onMarkerClick={handleMarkerClick}
            userLocation={userLocation}
            onLocationUpdate={handleLocationUpdate}
          />
        ) : (
          <ScrollView style={styles.listContainer}>
            <Text style={styles.sectionTitle}>
              {userLocation ? `Nearby Food Banks (${filteredFoodBanks.length})` : `All Food Banks (${displayItems.length})`}
            </Text>

            {displayItems.map((org) => (
              <TouchableOpacity
                key={org.id}
                style={[
                  styles.orgCard,
                  selectedFoodBank?.id === org.id && styles.selectedCard
                ]}
                onPress={() => setSelectedFoodBank(org)}
              >
                <View style={styles.orgHeader}>
                  <Text style={styles.orgName}>{org.name}</Text>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>Verified</Text>
                  </View>
                </View>

                {/* Live Status (Phase 2) */}
                {org.status && (
                  <View style={styles.liveStatus}>
                    <View style={[
                      styles.statusDot,
                      { backgroundColor: getStatusColor(org.status.foodAvailable) }
                    ]} />
                    <Text style={styles.statusLabel}>
                      {getStatusLabel(org.status.foodAvailable)}
                    </Text>
                    {org.status.waitTimeMinutes && (
                      <Text style={styles.waitTime}>
                        • {org.status.waitTimeMinutes}min wait
                      </Text>
                    )}
                  </View>
                )}

                <Text style={styles.orgAddress}>
                  {org.address}
                  {'\n'}
                  {org.city}, {org.state} {org.zipCode}
                </Text>

                {/* Distance (if user location available) */}
                {org.distance && (
                  <Text style={styles.distance}>
                    📍 {org.distance} miles away
                  </Text>
                )}

                {org.phone && (
                  <Text style={styles.orgPhone}>📞 {org.phone}</Text>
                )}

                {org.description && (
                  <Text style={styles.orgDescription} numberOfLines={2}>
                    {org.description}
                  </Text>
                )}

                <View style={styles.orgFooter}>
                  <Text style={styles.orgType}>
                    {org.type.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            {displayItems.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {searchQuery ? 'No food banks match your search' : 'No food banks found'}
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );

  // Helper functions for status display
  function getStatusColor(status) {
    switch (status) {
      case 'available': return '#10B981';
      case 'low': return '#F59E0B';
      case 'out': return '#EF4444';
      default: return '#6B7280';
    }
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'available': return 'Food Available';
      case 'low': return 'Low Stock';
      case 'out': return 'Out of Stock';
      default: return 'Status Unknown';
    }
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#10B981',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  findNearestButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  findNearestText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeToggle: {
    backgroundColor: 'white',
  },
  toggleText: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  activeToggleText: {
    color: '#10B981',
  },
  content: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    marginTop: 16,
  },
  orgCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: '#10B981',
  },
  orgHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orgName: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  statusBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  liveStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  waitTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  orgAddress: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
  distance: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
    marginBottom: 8,
  },
  orgPhone: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  orgDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  orgFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  orgType: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
});
