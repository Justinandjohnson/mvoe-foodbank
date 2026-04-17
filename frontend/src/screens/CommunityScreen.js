// CommunityScreen - Community events hub (Phase 3B)
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { communityService } from '../api/services';

export default function CommunityScreen({ navigation }) {
  const { isAuthenticated, user } = useAuth();

  // State
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('upcoming'); // 'all', 'upcoming', 'my-events'

  useEffect(() => {
    loadEvents();
  }, [filter]);

  const loadEvents = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Fetch real events from API
      const response = await communityService.getEvents();
      let fetchedEvents = response.data?.events || [];

      // Convert date strings to Date objects for filtering
      fetchedEvents = fetchedEvents.map(event => ({
        ...event,
        eventDate: new Date(event.eventDate),
        startTime: new Date(event.startTime),
        endTime: new Date(event.endTime),
        volunteerCount: event.volunteers?.length || 0,
        resourceCount: event.resources?.length || 0,
      }));

      // Use real events from API
      let allEvents = fetchedEvents;

      // Filter events based on selected filter
      let filteredEvents = allEvents;

      if (filter === 'upcoming') {
        const now = new Date();
        filteredEvents = allEvents.filter(event => event.eventDate >= now);
      } else if (filter === 'my-events' && user) {
        filteredEvents = allEvents.filter(event => event.organizerId === user.id);
      }

      setEvents(filteredEvents);

    } catch (error) {
      console.error('Error loading events:', error);
      Alert.alert('Error', 'Failed to load community events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadEvents(true);
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (cents) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'planned': return '#10B981';
      case 'active': return '#F59E0B';
      case 'completed': return '#6B7280';
      case 'cancelled': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const renderFilterTabs = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
      {[
        { key: 'upcoming', label: 'Upcoming', icon: 'calendar' },
        { key: 'all', label: 'All Events', icon: 'grid' },
        { key: 'my-events', label: 'My Events', icon: 'person' },
      ].map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.filterTab,
            filter === tab.key && styles.filterTabActive
          ]}
          onPress={() => setFilter(tab.key)}
        >
          <Ionicons
            name={tab.icon}
            size={16}
            color={filter === tab.key ? 'white' : '#6B7280'}
          />
          <Text style={[
            styles.filterTabText,
            filter === tab.key && styles.filterTabTextActive
          ]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderEventCard = (event) => (
    <TouchableOpacity
      key={event.id}
      style={styles.eventCard}
      onPress={() => {
        navigation.navigate('EventDetail', { eventId: event.id });
      }}
    >
      <View style={styles.eventHeader}>
        <View style={styles.eventInfo}>
          <Text style={styles.eventName}>{event.eventName}</Text>
          <Text style={styles.eventDate}>{formatDate(event.eventDate)}</Text>
          <Text style={styles.eventTime}>
            {formatTime(event.startTime)} - {formatTime(event.endTime)}
          </Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(event.status) }]}>
          <Text style={styles.statusText}>{event.status}</Text>
        </View>
      </View>

      <View style={styles.eventLocation}>
        <Ionicons name="location" size={16} color="#6B7280" />
        <Text style={styles.locationText}>{event.location}</Text>
      </View>

      <Text style={styles.eventDescription} numberOfLines={2}>
        {event.description}
      </Text>

      <View style={styles.eventMetrics}>
        <View style={styles.metric}>
          <Ionicons name="people" size={16} color="#10B981" />
          <Text style={styles.metricText}>{event.targetServings} servings</Text>
        </View>

        <View style={styles.metric}>
          <Ionicons name="hand-right" size={16} color="#F59E0B" />
          <Text style={styles.metricText}>{event.volunteerCount} volunteers</Text>
        </View>

        <View style={styles.metric}>
          <Ionicons name="cube" size={16} color="#8B5CF6" />
          <Text style={styles.metricText}>{event.resourceCount} resources</Text>
        </View>

        {event.budgetCents && (
          <View style={styles.metric}>
            <Ionicons name="card" size={16} color="#6B7280" />
            <Text style={styles.metricText}>{formatCurrency(event.budgetCents)}</Text>
          </View>
        )}
      </View>

      {event.organizerId === user?.userId && (
        <View style={styles.ownerBadge}>
          <Ionicons name="star" size={14} color="#F59E0B" />
          <Text style={styles.ownerText}>Your Event</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderQuickActions = () => (
    <View style={styles.quickActions}>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => navigation.navigate('CreateEvent')}
      >
        <View style={styles.actionIcon}>
          <Ionicons name="add-circle" size={24} color="#10B981" />
        </View>
        <View style={styles.actionInfo}>
          <Text style={styles.actionTitle}>Create Event</Text>
          <Text style={styles.actionSubtitle}>Plan a community meal</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#6B7280" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => Alert.alert('Feature Coming Soon', 'Volunteer signup coming soon!')}
      >
        <View style={styles.actionIcon}>
          <Ionicons name="hand-right" size={24} color="#F59E0B" />
        </View>
        <View style={styles.actionInfo}>
          <Text style={styles.actionTitle}>Volunteer</Text>
          <Text style={styles.actionSubtitle}>Help with events</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#6B7280" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => Alert.alert('Feature Coming Soon', 'Resource sharing coming soon!')}
      >
        <View style={styles.actionIcon}>
          <Ionicons name="cube" size={24} color="#8B5CF6" />
        </View>
        <View style={styles.actionInfo}>
          <Text style={styles.actionTitle}>Share Resources</Text>
          <Text style={styles.actionSubtitle}>Venues, equipment, supplies</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#6B7280" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => navigation.navigate('MealPlanner')}
      >
        <View style={styles.actionIcon}>
          <Ionicons name="restaurant" size={24} color="#10B981" />
        </View>
        <View style={styles.actionInfo}>
          <Text style={styles.actionTitle}>AI Meal Planner</Text>
          <Text style={styles.actionSubtitle}>Plan community meals with AI</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#6B7280" />
      </TouchableOpacity>
    </View>
  );

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="people" size={48} color="#6B7280" />
        <Text style={styles.authTitle}>Join the Community</Text>
        <Text style={styles.authMessage}>
          Sign in to create events, volunteer, and connect with your community
        </Text>
        <TouchableOpacity
          style={styles.authButton}
          onPress={() => navigation.navigate('Auth')}
        >
          <Text style={styles.authButtonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Community Events</Text>
        <Text style={styles.headerSubtitle}>
          Plan meals, volunteer, and bring people together
        </Text>
      </View>

      {/* Quick Actions */}
      {renderQuickActions()}

      {/* Filter Tabs */}
      {renderFilterTabs()}

      {/* Events List */}
      <ScrollView
        style={styles.eventsList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>Loading community events...</Text>
          </View>
        ) : events.length > 0 ? (
          events.map(renderEventCard)
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Events Found</Text>
            <Text style={styles.emptyMessage}>
              {filter === 'my-events'
                ? "You haven't created any events yet"
                : "No community events match your current filter"
              }
            </Text>
            {filter === 'my-events' && (
              <TouchableOpacity
                style={styles.createFirstButton}
                onPress={() => navigation.navigate('CreateEvent')}
              >
                <Text style={styles.createFirstButtonText}>Create Your First Event</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
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
    padding: 20,
  },

  // Header
  header: {
    backgroundColor: '#10B981',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },

  // Auth
  authTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  authMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  authButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  authButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  // Quick Actions
  quickActions: {
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  actionIcon: {
    marginRight: 12,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },

  // Filters
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
  },
  filterTabActive: {
    backgroundColor: '#10B981',
  },
  filterTabText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 6,
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: 'white',
  },

  // Events List
  eventsList: {
    flex: 1,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  createFirstButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createFirstButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },

  // Event Cards
  eventCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  eventInfo: {
    flex: 1,
    marginRight: 12,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  eventTime: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  eventLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 6,
  },
  eventDescription: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 12,
  },
  eventMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  ownerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  ownerText: {
    fontSize: 12,
    color: '#D97706',
    fontWeight: '600',
    marginLeft: 4,
  },
});