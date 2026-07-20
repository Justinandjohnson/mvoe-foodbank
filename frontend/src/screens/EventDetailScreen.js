import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { communityService } from '../api/services';
import AppScreenBackground from '../components/ui/AppScreenBackground';
import GlassSurface from '../components/ui/GlassSurface';

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function flattenShoppingList(shoppingList) {
  if (Array.isArray(shoppingList)) return shoppingList;
  if (!shoppingList || typeof shoppingList !== 'object') return [];

  return Object.entries(shoppingList).flatMap(([group, items]) =>
    (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      group,
    }))
  );
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(cents = 0) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function getStatusColor(status) {
  switch (status) {
    case 'planned':
      return '#10B981';
    case 'active':
      return '#F59E0B';
    case 'completed':
      return '#6B7280';
    case 'cancelled':
      return '#EF4444';
    default:
      return '#6B7280';
  }
}

function buildMealPlannerPrompt(event) {
  return `Help me plan the food for "${event.eventName}". It is a ${event.eventType} for ${event.targetServings} people at ${event.location || 'the listed location'}. Keep the menu practical, the math easy to follow, and the budget realistic.`;
}

function buildVolunteerPrompt(event) {
  return `Help me cover volunteers for "${event.eventName}". It is scheduled for ${formatDate(event.eventDate)} from ${formatTime(event.startTime)} to ${formatTime(event.endTime)} at ${event.location || 'the listed location'}. I need clear staffing roles, follow-up, and reminder language.`;
}

function buildGrantPrefill(event) {
  return {
    organizationName: 'MVOE',
    mission: 'Connect people to food quickly and support community-led meals and emergency response.',
    location: event.location || '',
    populationServed: 'Neighbors experiencing food insecurity',
    projectNeed: `Support "${event.eventName}" and similar public meal work with food, supplies, volunteer coordination, and outreach.`,
    grantType: 'Program support',
    existingPrograms: 'Public food gatherings, food beacon coordination, volunteer staffing, and emergency food response.',
    notes: event.description || '',
  };
}

export default function EventDetailScreen({ route, navigation }) {
  const { eventId } = route.params;
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [volunteering, setVolunteering] = useState(false);

  const loadEventDetails = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await communityService.getEventById(eventId);
      setEvent(response.data?.event || null);
    } catch (error) {
      console.error('Error loading event details:', error);
      Alert.alert('Error', 'Failed to load event details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadEventDetails();
  }, [eventId]);

  const menuItems = useMemo(() => asArray(event?.mealPlan?.menuItems), [event]);
  const shoppingItems = useMemo(() => flattenShoppingList(event?.mealPlan?.shoppingList), [event]);
  const timelineItems = useMemo(() => asArray(event?.mealPlan?.cookingTimeline), [event]);
  const dietaryProfiles = useMemo(() => event?.dietaryProfiles || [], [event]);

  const isOrganizer = Boolean(event?.isOwnedByCurrentActor);
  const isVolunteer = Boolean(event?.currentActorIsVolunteer);

  const handleVolunteer = async () => {
    try {
      setVolunteering(true);

      if (isVolunteer) {
        await communityService.leaveEvent(eventId);
        Alert.alert('Volunteer removed', 'You have been removed from this event.');
      } else {
        await communityService.joinEvent(eventId, {
          volunteerType: 'hosting',
          notes: 'Joined from the event detail screen',
        });
        Alert.alert('Volunteer added', 'You have been added to this event.');
      }

      await loadEventDetails(true);
    } catch (error) {
      console.error('Error updating volunteer status:', error);
      Alert.alert('Error', 'Could not update your volunteer status.');
    } finally {
      setVolunteering(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <AppScreenBackground />
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading event details...</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.loadingContainer}>
        <AppScreenBackground />
        <Ionicons name="alert-circle-outline" size={44} color="#CBD5E1" />
        <Text style={styles.loadingText}>Event not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppScreenBackground />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadEventDetails(true)} />}
      >
        <GlassSurface preset="dark" style={styles.heroCard} padding={20}>
          <View style={styles.heroHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color="white" />
            </TouchableOpacity>

            <View style={styles.heroStatusWrap}>
              <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(event.status)}24` }]}>
                <Text style={[styles.statusText, { color: getStatusColor(event.status) }]}>{event.status}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.heroTitle}>{event.eventName}</Text>
          <Text style={styles.heroBody}>
            {event.description || 'This gathering has no description yet, but its timing, map presence, and ops hooks are now live.'}
          </Text>

          <View style={styles.heroMetaRow}>
            <View style={styles.heroMetaPill}>
              <Ionicons name="calendar" size={14} color="#BFDBFE" />
              <Text style={styles.heroMetaText}>{formatDate(event.eventDate)}</Text>
            </View>
            <View style={styles.heroMetaPill}>
              <Ionicons name="time" size={14} color="#BFDBFE" />
              <Text style={styles.heroMetaText}>
                {formatTime(event.startTime)} - {formatTime(event.endTime)}
              </Text>
            </View>
          </View>
        </GlassSurface>

        <GlassSurface style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Immediate actions</Text>
          <Text style={styles.sectionSubtitle}>Everything needed to run this event should be one tap away from the event itself.</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('Map', { focusLayer: 'events' })}
            >
              <Ionicons name="map" size={18} color="#0EA5E9" />
              <Text style={styles.actionTitle}>Open on map</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('Agents', {
                screen: 'MealPlanner',
                params: { prefillPrompt: buildMealPlannerPrompt(event) },
              })}
            >
              <Ionicons name="restaurant" size={18} color="#F97316" />
              <Text style={styles.actionTitle}>Plan menu</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('Map', {
                openVolunteerWidget: true,
                initialVolunteerPrompt: buildVolunteerPrompt(event),
              })}
            >
              <Ionicons name="people" size={18} color="#10B981" />
              <Text style={styles.actionTitle}>Cover staffing</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('Agents', {
                screen: 'GrantWriter',
                params: { prefill: buildGrantPrefill(event) },
              })}
            >
              <Ionicons name="document-text" size={18} color="#8B5CF6" />
              <Text style={styles.actionTitle}>Find funding</Text>
            </TouchableOpacity>
          </View>
        </GlassSurface>

        <GlassSurface style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Event details</Text>
          <View style={styles.detailList}>
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={16} color="#64748B" />
              <Text style={styles.detailText}>{event.location || 'Location pending'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={16} color="#64748B" />
              <Text style={styles.detailText}>{event.targetServings} planned servings</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="wallet-outline" size={16} color="#64748B" />
              <Text style={styles.detailText}>
                {event.budgetCents ? `${formatCurrency(event.budgetCents)} budget` : 'Budget not set'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="people-circle-outline" size={16} color="#64748B" />
              <Text style={styles.detailText}>{event.volunteers?.length || 0} volunteers attached</Text>
            </View>
          </View>

          <View style={styles.detailActionRow}>
            <TouchableOpacity
              style={[styles.primaryButton, volunteering && styles.buttonDisabled]}
              onPress={handleVolunteer}
              disabled={volunteering}
            >
              {volunteering ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name={isVolunteer ? 'person-remove' : 'person-add'} size={16} color="white" />
              )}
              <Text style={styles.primaryButtonText}>
                {isVolunteer ? 'Leave volunteer list' : 'Join as volunteer'}
              </Text>
            </TouchableOpacity>

            {isOrganizer ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('CreateEvent', { eventId, event })}
              >
                <Ionicons name="create-outline" size={16} color="#0F172A" />
                <Text style={styles.secondaryButtonText}>Edit event</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </GlassSurface>

        {menuItems.length > 0 || shoppingItems.length > 0 ? (
          <GlassSurface style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Meal plan</Text>
            {menuItems.length > 0 ? (
              <View style={styles.stack}>
                {menuItems.map((item, index) => (
                  <View key={`${item.name || item.item || 'menu'}-${index}`} style={styles.listCard}>
                    <Text style={styles.listTitle}>{item.name || item.item}</Text>
                    <Text style={styles.listMeta}>
                      {item.servings ? `${item.servings} servings` : ''}
                      {item.ingredients?.length ? ` • ${item.ingredients.length} ingredients` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {shoppingItems.length > 0 ? (
              <View style={styles.stack}>
                {shoppingItems.slice(0, 6).map((item, index) => (
                  <View key={`${item.item || 'shop'}-${index}`} style={styles.shoppingRow}>
                    <View style={styles.shoppingCopy}>
                      <Text style={styles.listTitle}>{item.item}</Text>
                      <Text style={styles.listMeta}>
                        {item.quantity || item.unit || 'Quantity pending'}
                        {item.group ? ` • ${item.group}` : ''}
                      </Text>
                    </View>
                    {typeof item.estimatedCost === 'number' ? (
                      <Text style={styles.priceText}>${item.estimatedCost.toFixed(2)}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {timelineItems.length > 0 ? (
              <View style={styles.stack}>
                <Text style={styles.subsectionTitle}>Prep timeline</Text>
                {timelineItems.map((item, index) => (
                  <View key={`${item.time || 'timeline'}-${index}`} style={styles.timelineRow}>
                    <Text style={styles.timelineTime}>{item.time || 'Step'}</Text>
                    <Text style={styles.timelineTask}>{item.task || item.description || 'Task pending'}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </GlassSurface>
        ) : null}

        <GlassSurface style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>People and resources</Text>
          <View style={styles.metricStrip}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{event.volunteers?.length || 0}</Text>
              <Text style={styles.metricLabel}>Volunteers</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{event.resources?.length || 0}</Text>
              <Text style={styles.metricLabel}>Resources</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{dietaryProfiles.length}</Text>
              <Text style={styles.metricLabel}>Dietary profiles</Text>
            </View>
          </View>

          {event.volunteers?.length > 0 ? (
            <View style={styles.stack}>
              {event.volunteers.slice(0, 4).map((volunteer) => (
                <View key={volunteer.id} style={styles.listCard}>
                  <Text style={styles.listTitle}>{volunteer.volunteerType}</Text>
                  <Text style={styles.listMeta}>
                    {volunteer.status}
                    {volunteer.specialSkills ? ` • ${volunteer.specialSkills}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No volunteers attached yet.</Text>
          )}
        </GlassSurface>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  content: {
    flexGrow: 1,
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 132,
    gap: 14,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07121F',
    gap: 10,
  },
  loadingText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  heroCard: {
    marginBottom: 2,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  heroTitle: {
    color: 'white',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    marginBottom: 10,
  },
  heroBody: {
    color: '#D7EAFE',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  heroMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  heroMetaText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionCard: {
    gap: 14,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionCard: {
    width: '47.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  actionTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },
  detailList: {
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  detailText: {
    flex: 1,
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  detailActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0F766E',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  stack: {
    gap: 10,
  },
  listCard: {
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderRadius: 18,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  listTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 3,
  },
  listMeta: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
  },
  shoppingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderRadius: 18,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  shoppingCopy: {
    flex: 1,
  },
  priceText: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '800',
  },
  subsectionTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderRadius: 18,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  timelineTime: {
    width: 82,
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '800',
  },
  timelineTask: {
    flex: 1,
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  metricStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '31%',
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  metricValue: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
});
