// EventDetailScreen - Detailed view of a community event
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { communityService } from '../api/services';

export default function EventDetailScreen({ route, navigation }) {
  const { eventId } = route.params;
  const { user } = useAuth();

  // State
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [volunteering, setVolunteering] = useState(false);

  useEffect(() => {
    loadEventDetails();
  }, [eventId]);

  const loadEventDetails = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // TODO: Implement API call to get event details
      // const response = await communityService.getEventById(eventId);

      // Mock data for now
      const mockEvent = {
        id: eventId,
        eventName: 'Community Cookout',
        description: 'Annual summer cookout for 100 people',
        eventDate: new Date('2025-11-15'),
        startTime: new Date('2025-11-15T12:00:00'),
        endTime: new Date('2025-11-15T16:00:00'),
        location: 'Central Park Pavilion',
        targetServings: 100,
        budgetCents: 50000,
        status: 'planned',
        isPublic: true,
        organizerId: user?.userId || 'user-123',
        volunteers: [
          { id: '1', name: 'John Doe', role: 'cook', confirmedAt: new Date() },
          { id: '2', name: 'Jane Smith', role: 'server', confirmedAt: new Date() },
        ],
        resources: [
          { id: '1', type: 'venue', description: 'Pavilion rental', providedBy: 'City Parks' },
          { id: '2', type: 'equipment', description: '2 Grills', providedBy: 'Local Church' },
        ],
        mealPlan: {
          menu: [
            { item: 'Hamburger Patties', quantity: 75, unit: 'patties' },
            { item: 'Hot Dogs', quantity: 50, unit: 'hot dogs' },
            { item: 'Hamburger Buns', quantity: 150, unit: 'buns' },
            { item: 'Potato Salad', quantity: 10, unit: 'pounds' },
          ],
          shoppingList: {
            protein: [
              { item: 'Hamburger Patties', quantity: 75, unit: 'patties', estimatedCost: 187.5 },
              { item: 'Hot Dogs', quantity: 50, unit: 'hot dogs', estimatedCost: 75 },
            ],
            sides: [
              { item: 'Potato Salad', quantity: 10, unit: 'pounds', estimatedCost: 80 },
            ],
          },
          timeline: [
            { time: 'T-2 hours', task: 'Start setting up grills' },
            { time: 'T-1 hour', task: 'Prepare sides' },
            { time: 'T-30 min', task: 'Start grilling' },
          ],
          estimatedCost: 500,
        },
      };

      setEvent(mockEvent);
    } catch (error) {
      console.error('Error loading event details:', error);
      Alert.alert('Error', 'Failed to load event details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadEventDetails(true);
  };

  const handleVolunteer = async () => {
    try {
      setVolunteering(true);
      // TODO: Implement volunteer signup API call
      Alert.alert('Success', 'You have been added as a volunteer!');
      loadEventDetails(true);
    } catch (error) {
      console.error('Error signing up as volunteer:', error);
      Alert.alert('Error', 'Failed to sign up as volunteer');
    } finally {
      setVolunteering(false);
    }
  };

  const handleEditEvent = () => {
    navigation.navigate('CreateEvent', { eventId, event });
  };

  const handleDeleteEvent = () => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // TODO: Implement delete API call
              Alert.alert('Success', 'Event deleted');
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete event');
            }
          },
        },
      ]
    );
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

  const isOrganizer = event?.organizerId === user?.userId;
  const isVolunteer = event?.volunteers?.some(v => v.userId === user?.userId);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading event details...</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#6B7280" />
        <Text style={styles.errorText}>Event not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{event.eventName}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(event.status) }]}>
            <Text style={styles.statusText}>{event.status}</Text>
          </View>
        </View>
        {isOrganizer && (
          <TouchableOpacity onPress={handleEditEvent} style={styles.headerEditButton}>
            <Ionicons name="create-outline" size={24} color="white" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Event Info Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar" size={20} color="#10B981" />
            <Text style={styles.cardTitle}>Event Details</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color="#6B7280" />
            <Text style={styles.infoText}>{formatDate(event.eventDate)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color="#6B7280" />
            <Text style={styles.infoText}>
              {formatTime(event.startTime)} - {formatTime(event.endTime)}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color="#6B7280" />
            <Text style={styles.infoText}>{event.location}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="people-outline" size={16} color="#6B7280" />
            <Text style={styles.infoText}>{event.targetServings} servings</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="card-outline" size={16} color="#6B7280" />
            <Text style={styles.infoText}>{formatCurrency(event.budgetCents)} budget</Text>
          </View>

          <Text style={styles.description}>{event.description}</Text>
        </View>

        {/* Meal Plan Card */}
        {event.mealPlan && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="restaurant" size={20} color="#10B981" />
              <Text style={styles.cardTitle}>Meal Plan</Text>
            </View>

            <Text style={styles.sectionLabel}>Menu</Text>
            {event.mealPlan.menu.map((item, index) => (
              <View key={index} style={styles.menuItem}>
                <Text style={styles.menuItemText}>
                  • {item.quantity} {item.unit} {item.item}
                </Text>
              </View>
            ))}

            <Text style={styles.sectionLabel}>Estimated Cost</Text>
            <Text style={styles.costText}>
              ${event.mealPlan.estimatedCost.toFixed(2)} for {event.targetServings} people
              <Text style={styles.perPersonText}>
                {' '}
                (${(event.mealPlan.estimatedCost / event.targetServings).toFixed(2)}/person)
              </Text>
            </Text>

            <Text style={styles.sectionLabel}>Cooking Timeline</Text>
            {event.mealPlan.timeline.map((step, index) => (
              <View key={index} style={styles.timelineItem}>
                <Text style={styles.timelineTime}>{step.time}</Text>
                <Text style={styles.timelineTask}>{step.task}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Volunteers Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="hand-right" size={20} color="#F59E0B" />
            <Text style={styles.cardTitle}>
              Volunteers ({event.volunteers.length})
            </Text>
          </View>

          {event.volunteers.length > 0 ? (
            event.volunteers.map((volunteer) => (
              <View key={volunteer.id} style={styles.volunteerItem}>
                <View style={styles.volunteerAvatar}>
                  <Ionicons name="person" size={20} color="#10B981" />
                </View>
                <View style={styles.volunteerInfo}>
                  <Text style={styles.volunteerName}>{volunteer.name}</Text>
                  <Text style={styles.volunteerRole}>{volunteer.role}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No volunteers yet. Be the first!</Text>
          )}

          {!isVolunteer && !isOrganizer && (
            <TouchableOpacity
              style={styles.volunteerButton}
              onPress={handleVolunteer}
              disabled={volunteering}
            >
              {volunteering ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="hand-right" size={20} color="white" />
                  <Text style={styles.volunteerButtonText}>Volunteer for this event</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Resources Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cube" size={20} color="#8B5CF6" />
            <Text style={styles.cardTitle}>
              Resources ({event.resources.length})
            </Text>
          </View>

          {event.resources.length > 0 ? (
            event.resources.map((resource) => (
              <View key={resource.id} style={styles.resourceItem}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <View style={styles.resourceInfo}>
                  <Text style={styles.resourceDescription}>{resource.description}</Text>
                  <Text style={styles.resourceProvider}>Provided by {resource.providedBy}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No resources shared yet</Text>
          )}

          {isOrganizer && (
            <TouchableOpacity
              style={styles.addResourceButton}
              onPress={() => Alert.alert('Coming Soon', 'Resource sharing coming soon!')}
            >
              <Ionicons name="add-circle" size={20} color="#8B5CF6" />
              <Text style={styles.addResourceButtonText}>Add Resource</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Organizer Actions */}
        {isOrganizer && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="settings" size={20} color="#6B7280" />
              <Text style={styles.cardTitle}>Manage Event</Text>
            </View>

            <TouchableOpacity style={styles.actionButton} onPress={handleEditEvent}>
              <Ionicons name="create-outline" size={20} color="#10B981" />
              <Text style={styles.actionButtonText}>Edit Event</Text>
              <Ionicons name="chevron-forward" size={20} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={handleDeleteEvent}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete Event</Text>
              <Ionicons name="chevron-forward" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerBackButton: {
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerEditButton: {
    marginLeft: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
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

  // Content
  content: {
    flex: 1,
  },
  card: {
    backgroundColor: 'white',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
  },

  // Info
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 15,
    color: '#374151',
    marginLeft: 8,
  },
  description: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginTop: 8,
  },

  // Meal Plan
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  menuItem: {
    marginBottom: 4,
  },
  menuItemText: {
    fontSize: 14,
    color: '#374151',
  },
  costText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#10B981',
  },
  perPersonText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6B7280',
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  timelineTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    width: 80,
  },
  timelineTask: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },

  // Volunteers
  volunteerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  volunteerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  volunteerInfo: {
    flex: 1,
  },
  volunteerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  volunteerRole: {
    fontSize: 13,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  volunteerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  volunteerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },

  // Resources
  resourceItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  resourceInfo: {
    flex: 1,
    marginLeft: 12,
  },
  resourceDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  resourceProvider: {
    fontSize: 13,
    color: '#6B7280',
  },
  addResourceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  addResourceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B5CF6',
    marginLeft: 8,
  },

  // Actions
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  actionButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginLeft: 12,
  },
  deleteButton: {
    borderBottomWidth: 0,
  },
  deleteButtonText: {
    color: '#EF4444',
  },

  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  bottomSpacer: {
    height: 40,
  },
});
