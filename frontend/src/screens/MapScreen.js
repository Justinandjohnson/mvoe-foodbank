// MapScreen - Advanced real-time food bank mapping (Phase 4)
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { organizationService, foodBankService } from '../api/services';
import FoodBankMap from '../components/FoodBankMap';

export default function MapScreen() {
  const [organizations, setOrganizations] = useState([]);
  const [filteredOrgs, setFilteredOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [mapView, setMapView] = useState('standard'); // standard, satellite, hybrid
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    loadOrganizations();
  }, []);

  useEffect(() => {
    filterOrganizations();
  }, [searchQuery, selectedFilter, organizations]);

  const loadOrganizations = async () => {
    try {
      // Load food banks with real-time status data
      const response = await foodBankService.getAll();
      const foodBanks = response.data.foodBanks || [];

      // Transform food bank data to include status information
      const orgsWithStatus = foodBanks.map(fb => ({
        ...fb,
        currentCapacity: fb.status?.capacityPercentage || 0,
        waitTime: fb.status?.waitTimeMinutes || 0,
        donationLevel: fb.status?.foodAvailable === 'available' ? 100 :
                      fb.status?.foodAvailable === 'low' ? 30 : 10,
        status: fb.status?.foodAvailable === 'out' ? 'closed' : 'open',
        urgentNeeds: fb.status?.notes || '',
        lastUpdated: fb.status?.lastUpdated ? new Date(fb.status.lastUpdated).toLocaleTimeString() : 'Never',
      }));

      setOrganizations(orgsWithStatus);
    } catch (error) {
      console.error('Error loading organizations:', error);
      Alert.alert('Error', 'Failed to load food bank locations');
    } finally {
      setLoading(false);
    }
  };

  const filterOrganizations = () => {
    let filtered = organizations;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(org =>
        org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.type.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (selectedFilter !== 'all') {
      if (selectedFilter === 'open') {
        filtered = filtered.filter(org => org.status === 'open');
      } else if (selectedFilter === 'urgent') {
        filtered = filtered.filter(org => org.donationLevel < 30);
      } else if (selectedFilter === 'nearby') {
        // Mock nearby filter - in production would use user location
        filtered = filtered.filter(org => org.latitude > 40.71);
      }
    }

    setFilteredOrgs(filtered);
  };

  const getStatusColor = (org) => {
    if (org.status === 'closed') return '#EF4444';
    if (org.donationLevel < 30) return '#F59E0B';
    if (org.currentCapacity > 80) return '#EF4444';
    return '#10B981';
  };

  const getStatusText = (org) => {
    if (org.status === 'closed') return 'Closed';
    if (org.donationLevel < 30) return 'Urgent Need';
    if (org.currentCapacity > 80) return 'High Capacity';
    return 'Available';
  };

  const getUrgencyIcon = (org) => {
    if (org.status === 'closed') return 'close-circle';
    if (org.donationLevel < 30) return 'warning';
    if (org.currentCapacity > 80) return 'people';
    return 'checkmark-circle';
  };

  const handleOrgSelect = (org) => {
    setSelectedOrg(selectedOrg?.id === org.id ? null : org);
  };

  const handleLocationChange = async (coords) => {
    setUserLocation(coords);

    // Load nearby food banks when location is available
    try {
      const response = await foodBankService.getNearby({
        latitude: coords.latitude,
        longitude: coords.longitude,
        radius: 25,
        limit: 50,
      });

      if (response.data) {
        const foodBanks = response.data.foodBanks || [];
        const orgsWithStatus = foodBanks.map(fb => ({
          ...fb,
          currentCapacity: fb.status?.capacityPercentage || 0,
          waitTime: fb.status?.waitTimeMinutes || 0,
          donationLevel: fb.status?.foodAvailable === 'available' ? 100 :
                        fb.status?.foodAvailable === 'low' ? 30 : 10,
          status: fb.status?.foodAvailable === 'out' ? 'closed' : 'open',
          urgentNeeds: fb.status?.notes || '',
          lastUpdated: fb.status?.lastUpdated ? new Date(fb.status.lastUpdated).toLocaleTimeString() : 'Never',
        }));

        setOrganizations(orgsWithStatus);
      }
    } catch (error) {
      console.error('Error loading nearby food banks:', error);
    }
  };

  const renderFilterButton = (key, label, icon) => (
    <TouchableOpacity
      key={key}
      style={[
        styles.filterButton,
        selectedFilter === key && styles.filterButtonActive
      ]}
      onPress={() => setSelectedFilter(key)}
    >
      <Ionicons
        name={icon}
        size={16}
        color={selectedFilter === key ? 'white' : '#6B7280'}
      />
      <Text style={[
        styles.filterButtonText,
        selectedFilter === key && styles.filterButtonTextActive
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading food bank locations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Food Bank Map</Text>
        <Text style={styles.subtitle}>
          {filteredOrgs.length} locations • Real-time status
        </Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search food banks..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        {renderFilterButton('all', 'All', 'grid')}
        {renderFilterButton('open', 'Open Now', 'time')}
        {renderFilterButton('urgent', 'Urgent Need', 'warning')}
        {renderFilterButton('nearby', 'Nearby', 'location')}
      </ScrollView>

      {/* Interactive Map */}
      <View style={styles.mapContainer}>
        <FoodBankMap
          foodBanks={filteredOrgs}
          selectedFoodBank={selectedOrg}
          onFoodBankSelect={handleOrgSelect}
          mapStyle={mapView}
          onLocationChange={handleLocationChange}
        />

        {/* Map Style Controls Overlay */}
        <View style={styles.mapControlsOverlay}>
          <TouchableOpacity
            style={[styles.mapControlButton, mapView === 'standard' && styles.mapControlActive]}
            onPress={() => setMapView('standard')}
          >
            <Text style={[styles.mapControlText, mapView === 'standard' && styles.mapControlTextActive]}>
              Standard
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mapControlButton, mapView === 'satellite' && styles.mapControlActive]}
            onPress={() => setMapView('satellite')}
          >
            <Text style={[styles.mapControlText, mapView === 'satellite' && styles.mapControlTextActive]}>
              Satellite
            </Text>
          </TouchableOpacity>
        </View>

        {/* Live Status Legend Overlay */}
        <View style={styles.statusOverlay}>
          <View style={styles.legendContainer}>
            <Text style={styles.legendTitle}>Live Status</Text>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.legendText}>Available</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.legendText}>Urgent Need</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.legendText}>Closed/Full</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Organization List */}
      <ScrollView style={styles.orgList}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Food Bank Locations</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={loadOrganizations}>
            <Ionicons name="refresh" size={20} color="#10B981" />
          </TouchableOpacity>
        </View>

        {filteredOrgs.map((org) => (
          <TouchableOpacity
            key={org.id}
            style={[
              styles.orgCard,
              selectedOrg?.id === org.id && styles.orgCardSelected
            ]}
            onPress={() => handleOrgSelect(org)}
          >
            <View style={styles.orgCardHeader}>
              <View style={styles.orgInfo}>
                <Text style={styles.orgName}>{org.name}</Text>
                <Text style={styles.orgType}>{org.type.replace('_', ' ')}</Text>
              </View>

              <View style={styles.statusContainer}>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(org) }]}>
                  <Ionicons name={getUrgencyIcon(org)} size={14} color="white" />
                  <Text style={styles.statusText}>{getStatusText(org)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.orgMetrics}>
              <View style={styles.metric}>
                <Ionicons name="time" size={16} color="#6B7280" />
                <Text style={styles.metricText}>{org.waitTime}min wait</Text>
              </View>
              <View style={styles.metric}>
                <Ionicons name="people" size={16} color="#6B7280" />
                <Text style={styles.metricText}>{org.currentCapacity}% capacity</Text>
              </View>
              <View style={styles.metric}>
                <Ionicons name="heart" size={16} color="#6B7280" />
                <Text style={styles.metricText}>{org.donationLevel}% funded</Text>
              </View>
            </View>

            {selectedOrg?.id === org.id && (
              <View style={styles.orgDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Urgent Need:</Text>
                  <Text style={styles.detailValue}>{org.urgentNeeds}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Last Updated:</Text>
                  <Text style={styles.detailValue}>{org.lastUpdated}</Text>
                </View>

                <View style={styles.actionButtons}>
                  <TouchableOpacity style={styles.actionButton}>
                    <Ionicons name="navigate" size={16} color="#10B981" />
                    <Text style={styles.actionButtonText}>Directions</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton}>
                    <Ionicons name="call" size={16} color="#10B981" />
                    <Text style={styles.actionButtonText}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton}>
                    <Ionicons name="heart" size={16} color="#10B981" />
                    <Text style={styles.actionButtonText}>Donate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },

  // Header
  header: {
    backgroundColor: '#10B981',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },

  // Search
  searchContainer: {
    padding: 16,
    backgroundColor: 'white',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
    color: '#111827',
  },

  // Filters
  filterContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
  },
  filterButtonActive: {
    backgroundColor: '#10B981',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 6,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: 'white',
  },

  // Map
  mapContainer: {
    height: 250,
    backgroundColor: '#E5E7EB',
    position: 'relative',
  },
  mapControlsOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    flexDirection: 'row',
    gap: 8,
  },
  mapControlButton: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  mapControlActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  mapControlText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  mapControlTextActive: {
    color: 'white',
  },

  // Status Overlay
  statusOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  legendContainer: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    color: '#6B7280',
  },

  // Organization List
  orgList: {
    flex: 1,
    backgroundColor: 'white',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  refreshButton: {
    padding: 4,
  },

  // Organization Cards
  orgCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  orgCardSelected: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  orgCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  orgType: {
    fontSize: 14,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  statusContainer: {
    marginLeft: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
    marginLeft: 4,
  },

  // Metrics
  orgMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  metricText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },

  // Details
  orgDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  actionButtonText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
    marginLeft: 6,
  },
});