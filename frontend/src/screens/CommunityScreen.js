import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getApprovals,
  getVolunteerSummary,
  sendVolunteerChatMessage,
} from '../api/agentService';
import { communityService } from '../api/services';
import AppScreenBackground from '../components/ui/AppScreenBackground';
import GlassSurface from '../components/ui/GlassSurface';

const TOOL_OPTIONS = [
  { key: 'create', label: 'Create gathering', icon: 'add-circle' },
  { key: 'map', label: 'Open map layer', icon: 'map' },
  { key: 'volunteers', label: 'Volunteer ops', icon: 'people' },
];

const EVENT_TYPES = [
  { key: 'community_meal', label: 'Community meal', icon: 'restaurant', color: '#34D399' },
  { key: 'potluck', label: 'Potluck', icon: 'people', color: '#60A5FA' },
  { key: 'barbecue', label: 'Barbecue', icon: 'flame', color: '#FB923C' },
  { key: 'distribution', label: 'Distribution', icon: 'cube', color: '#A78BFA' },
];

const VOLUNTEER_QUICK_PROMPTS = [
  'Who can help with this weekend’s pantry shift?',
  'Draft a reminder for tomorrow’s meal distribution volunteers.',
  'How should I cover a last-minute no-show?',
];

function formatDate(date) {
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(date) {
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}



export default function CommunityScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 1160;
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTool, setActiveTool] = useState('create');
  const [volunteerSummary, setVolunteerSummary] = useState(null);
  const [approvalCount, setApprovalCount] = useState(0);

  const [volunteerPrompt, setVolunteerPrompt] = useState('');
  const [volunteerLoading, setVolunteerLoading] = useState(false);
  const [volunteerReply, setVolunteerReply] = useState('');

  const loadWorkspace = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [eventsResponse, volunteerSummaryResponse, approvalsResponse] = await Promise.all([
        communityService.getEvents().catch(() => null),
        getVolunteerSummary().catch(() => null),
        getApprovals().catch(() => null),
      ]);

      const fetchedEvents = (eventsResponse?.data?.events || []).map((event) => ({
        ...event,
        eventDate: new Date(event.eventDate),
        startTime: new Date(event.startTime),
        endTime: new Date(event.endTime),
        volunteerCount: event.volunteers?.length || event._count?.volunteers || 0,
      }));

      setAllEvents(fetchedEvents);
      setVolunteerSummary(volunteerSummaryResponse || null);
      setApprovalCount((approvalsResponse?.approvals || []).length);
    } catch (error) {
      console.error('Error loading gatherings workspace:', error);
      Alert.alert('Gatherings unavailable', 'The gatherings workspace could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  const upcomingEvents = useMemo(
    () => allEvents
      .filter((event) => event.eventDate >= new Date())
      .sort((left, right) => left.eventDate.getTime() - right.eventDate.getTime()),
    [allEvents]
  );

  const nextEvent = upcomingEvents[0] || null;

  const topWidgets = useMemo(() => {
    const plannedServings = upcomingEvents.reduce((sum, event) => sum + (event.targetServings || 0), 0);
    const volunteerRoles = upcomingEvents.reduce((sum, event) => sum + (event.volunteerCount || 0), 0);

    return [
      {
        label: 'Upcoming',
        value: String(upcomingEvents.length),
        detail: nextEvent ? `Next ${formatDate(nextEvent.eventDate)}` : 'No event yet',
        icon: 'calendar',
        color: '#34D399',
      },
      {
        label: 'Planned servings',
        value: plannedServings.toLocaleString(),
        detail: 'Across live public meals',
        icon: 'restaurant',
        color: '#60A5FA',
      },
      {
        label: 'Volunteer roles',
        value: volunteerRoles.toLocaleString(),
        detail: `${volunteerSummary?.total_volunteers || 0} on roster`,
        icon: 'people',
        color: '#FB923C',
      },
      {
        label: 'Pending approvals',
        value: String(approvalCount),
        detail: approvalCount === 0 ? 'Nothing waiting' : 'Needs review',
        icon: 'checkmark-circle',
        color: '#A78BFA',
      },
    ];
  }, [approvalCount, nextEvent, upcomingEvents, volunteerSummary?.total_volunteers]);

  const handleVolunteerAsk = async (prompt = volunteerPrompt) => {
    const trimmed = String(prompt || '').trim();
    if (!trimmed || volunteerLoading) return;

    setVolunteerLoading(true);
    try {
      const response = await sendVolunteerChatMessage(trimmed);
      setVolunteerReply(response.reply || 'No response received.');
    } catch (error) {
      setVolunteerReply(error.message || 'The volunteer coordinator could not answer right now.');
    } finally {
      setVolunteerLoading(false);
    }
  };

  const renderCreatePanel = () => (
    <View style={styles.toolContent}>
      <Text style={styles.toolTitle}>Create a new public meal fast.</Text>
      <Text style={styles.toolBody}>
        Pick the event shape first, then open the full form with the type already selected.
      </Text>
      <View style={styles.eventTypeGrid}>
        {EVENT_TYPES.map((type) => (
          <TouchableOpacity
            key={type.key}
            style={styles.eventTypeTile}
            onPress={() => navigation.navigate('CreateEvent', { initialDraft: { eventType: type.key } })}
          >
            <View style={[styles.eventTypeIcon, { backgroundColor: `${type.color}18` }]}>
              <Ionicons name={type.icon} size={18} color={type.color} />
            </View>
            <Text style={styles.eventTypeLabel}>{type.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.inlineActionRow}>
        <TouchableOpacity
          style={styles.primaryInlineButton}
          onPress={() => navigation.navigate('CreateEvent')}
        >
          <Ionicons name="add-circle" size={18} color="#07121F" />
          <Text style={styles.primaryInlineButtonText}>Open full create form</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryInlineButton}
          onPress={() => navigation.navigate('Map', { focusLayer: 'events' })}
        >
          <Ionicons name="map" size={18} color="#0F172A" />
          <Text style={styles.secondaryInlineButtonText}>Check meal layer first</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderMapPanel = () => (
    <View style={styles.toolContent}>
      <Text style={styles.toolTitle}>Keep gatherings tied to place.</Text>
      <Text style={styles.toolBody}>
        Open the live meal layer to see which public meals are active, when they happen, and where they land on the map.
      </Text>
      <View style={styles.mapSignalGrid}>
        <View style={styles.mapSignalCard}>
          <Text style={styles.mapSignalValue}>{upcomingEvents.length}</Text>
          <Text style={styles.mapSignalLabel}>Upcoming meals on the layer</Text>
        </View>
        <View style={styles.mapSignalCard}>
          <Text style={styles.mapSignalValue}>{nextEvent ? formatDate(nextEvent.eventDate) : '--'}</Text>
          <Text style={styles.mapSignalLabel}>Next meal date</Text>
        </View>
      </View>
      <View style={styles.inlineActionRow}>
        <TouchableOpacity
          style={styles.primaryInlineButton}
          onPress={() => navigation.navigate('Map', { focusLayer: 'events' })}
        >
          <Ionicons name="map" size={18} color="#07121F" />
          <Text style={styles.primaryInlineButtonText}>Open meal layer</Text>
        </TouchableOpacity>
        {nextEvent ? (
          <TouchableOpacity
            style={styles.secondaryInlineButton}
            onPress={() => navigation.navigate('EventDetail', { eventId: nextEvent.id })}
          >
            <Ionicons name="calendar" size={18} color="#0F172A" />
            <Text style={styles.secondaryInlineButtonText}>Open next event</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const renderVolunteerPanel = () => (
    <View style={styles.toolContent}>
      <View style={styles.inlineHeaderRow}>
        <View>
          <Text style={styles.toolTitle}>Run volunteer ops from here.</Text>
          <Text style={styles.toolBody}>Draft coverage decisions or reminder copy without leaving the gatherings board.</Text>
        </View>
        <View style={styles.signalBadge}>
          <Text style={styles.signalBadgeText}>{approvalCount} approvals</Text>
        </View>
      </View>

      <View style={styles.metricMiniRow}>
        <View style={styles.metricMiniCard}>
          <Text style={styles.metricMiniValue}>{volunteerSummary?.total_volunteers || 0}</Text>
          <Text style={styles.metricMiniLabel}>Roster</Text>
        </View>
        <View style={styles.metricMiniCard}>
          <Text style={styles.metricMiniValue}>{volunteerSummary?.active_volunteers || 0}</Text>
          <Text style={styles.metricMiniLabel}>Active</Text>
        </View>
        <View style={styles.metricMiniCard}>
          <Text style={styles.metricMiniValue}>{volunteerSummary?.pending_opt_in || 0}</Text>
          <Text style={styles.metricMiniLabel}>Pending opt-in</Text>
        </View>
      </View>

      <View style={styles.promptRow}>
        {VOLUNTEER_QUICK_PROMPTS.map((prompt) => (
          <TouchableOpacity
            key={prompt}
            style={styles.promptChip}
            onPress={() => {
              setVolunteerPrompt(prompt);
              handleVolunteerAsk(prompt);
            }}
            disabled={volunteerLoading}
          >
            <Text style={styles.promptChipText}>{prompt}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.chatComposer}>
        <TextInput
          style={styles.chatInput}
          value={volunteerPrompt}
          onChangeText={setVolunteerPrompt}
          placeholder="Ask about reminder drafts, staffing gaps, or approvals..."
          placeholderTextColor="#94A3B8"
          multiline
        />
        <View style={styles.composerActions}>
          <TouchableOpacity
            style={[styles.primaryInlineButton, (!volunteerPrompt.trim() || volunteerLoading) && styles.disabledButton]}
            onPress={() => handleVolunteerAsk(volunteerPrompt)}
            disabled={!volunteerPrompt.trim() || volunteerLoading}
          >
            {volunteerLoading ? <ActivityIndicator size="small" color="#07121F" /> : <Ionicons name="chatbubble-ellipses" size={18} color="#07121F" />}
            <Text style={styles.primaryInlineButtonText}>{volunteerLoading ? 'Thinking...' : 'Ask coordinator'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryInlineButton}
            onPress={() => navigation.navigate('Map', {
              openVolunteerWidget: true,
              initialVolunteerPrompt: volunteerPrompt.trim() || VOLUNTEER_QUICK_PROMPTS[0],
            })}
          >
            <Ionicons name="open-outline" size={18} color="#0F172A" />
            <Text style={styles.secondaryInlineButtonText}>Open full volunteer board</Text>
          </TouchableOpacity>
        </View>
      </View>

      {volunteerReply ? (
        <View style={styles.agentResultShell}>
          <Text style={styles.agentResultTitle}>Latest volunteer guidance</Text>
          <Text style={styles.agentResultBody}>{volunteerReply}</Text>
        </View>
      ) : null}
    </View>
  );

  const renderActivePanel = () => {
    switch (activeTool) {
      case 'map':
        return renderMapPanel();
      case 'volunteers':
        return renderVolunteerPanel();
      case 'create':
      default:
        return renderCreatePanel();
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <AppScreenBackground />
        <ActivityIndicator size="large" color="#34D399" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppScreenBackground />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadWorkspace(true)} />}
      >
        <View style={styles.topStrip}>
          <View style={styles.titleBlock}>
            <Text style={styles.pageLabel}>Gatherings</Text>
            <Text style={styles.pageTitle}>Run meal events from one board.</Text>
          </View>
          <TouchableOpacity
            style={styles.topAction}
            onPress={() => navigation.navigate('Map', { focusLayer: 'events' })}
          >
            <Ionicons name="map" size={16} color="#D1FAE5" />
            <Text style={styles.topActionText}>Open map layer</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.widgetStrip}>
          {topWidgets.map((item) => (
            <GlassSurface key={item.label} style={styles.widgetCard} padding={12}>
              <View style={[styles.widgetIcon, { backgroundColor: `${item.color}20` }]}>
                <Ionicons name={item.icon} size={14} color={item.color} />
              </View>
              <Text style={styles.widgetValue}>{item.value}</Text>
              <Text style={styles.widgetLabel}>{item.label}</Text>
              <Text style={styles.widgetDetail}>{item.detail}</Text>
            </GlassSurface>
          ))}
        </View>

        <View style={[styles.workspaceRow, isWide && styles.workspaceRowWide]}>
          <GlassSurface preset="dark" style={[styles.controlPanel, isWide && styles.controlPanelWide]} padding={18}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>Action board</Text>
                <Text style={styles.panelSubtitle}>Choose the job, then work it in place.</Text>
              </View>
            </View>

            <View style={styles.toolPicker}>
              {TOOL_OPTIONS.map((option) => {
                const active = option.key === activeTool;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.toolChip, active && styles.toolChipActive]}
                    onPress={() => setActiveTool(option.key)}
                  >
                    <Ionicons name={option.icon} size={15} color={active ? '#07121F' : '#D7F1E7'} />
                    <Text style={[styles.toolChipText, active && styles.toolChipTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {renderActivePanel()}
          </GlassSurface>

          <GlassSurface style={[styles.calendarPanel, isWide && styles.calendarPanelWide]} padding={18}>
            <View style={styles.calendarHeader}>
              <View>
                <Text style={styles.calendarTitle}>Live calendar</Text>
                <Text style={styles.calendarSubtitle}>Results stay visible here while you work the panel.</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('CreateEvent')}>
                <Text style={styles.calendarLink}>New event</Text>
              </TouchableOpacity>
            </View>

            {upcomingEvents.length > 0 ? (
              upcomingEvents.slice(0, 4).map((event) => (
                <TouchableOpacity
                  key={event.id}
                  style={styles.timelineRow}
                  onPress={() => navigation.navigate('EventDetail', { eventId: event.id })}
                >
                  <View style={styles.timelineDateBadge}>
                    <Text style={styles.timelineDateDay}>{event.eventDate.getDate()}</Text>
                    <Text style={styles.timelineDateMonth}>{event.eventDate.toLocaleDateString([], { month: 'short' })}</Text>
                  </View>
                  <View style={styles.timelineCopy}>
                    <Text style={styles.timelineTitle}>{event.eventName}</Text>
                    <Text style={styles.timelineMeta}>
                      {formatTime(event.startTime)} • {event.location || 'Location pending'}
                    </Text>
                    <Text style={styles.timelineMetaSecondary}>
                      {event.targetServings || 0} servings • {event.volunteerCount || 0} volunteers
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#64748B" />
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={18} color="#64748B" />
                <Text style={styles.emptyStateText}>No live gatherings scheduled yet.</Text>
              </View>
            )}
          </GlassSurface>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#07121F',
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
    paddingBottom: 112,
    gap: 14,
  },
  topStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
  },
  pageLabel: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  pageTitle: {
    color: 'white',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
  },
  topAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.50)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  topActionText: {
    color: '#D1FAE5',
    fontSize: 12,
    fontWeight: '800',
  },
  widgetStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  widgetCard: {
    minWidth: 170,
    flex: 1,
  },
  widgetIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  widgetValue: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  widgetLabel: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  widgetDetail: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
  },
  workspaceRow: {
    gap: 12,
  },
  workspaceRowWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  controlPanel: {
    overflow: 'hidden',
  },
  controlPanelWide: {
    flex: 1.2,
  },
  calendarPanel: {},
  calendarPanelWide: {
    flex: 0.8,
  },
  panelHeader: {
    marginBottom: 16,
  },
  panelTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  panelSubtitle: {
    color: '#D7F1E7',
    fontSize: 13,
    lineHeight: 18,
  },
  toolPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  toolChipActive: {
    backgroundColor: '#D1FAE5',
    borderColor: '#D1FAE5',
  },
  toolChipText: {
    color: '#D7F1E7',
    fontSize: 13,
    fontWeight: '800',
  },
  toolChipTextActive: {
    color: '#07121F',
  },
  toolContent: {
    gap: 14,
  },
  toolTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  toolBody: {
    color: '#D7F1E7',
    fontSize: 13,
    lineHeight: 19,
  },
  eventTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  eventTypeTile: {
    flex: 1,
    minWidth: 150,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  eventTypeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  eventTypeLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  inlineActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryInlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#D1FAE5',
  },
  primaryInlineButtonText: {
    color: '#07121F',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryInlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  secondaryInlineButtonText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.55,
  },
  inlineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  signalBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  signalBadgeText: {
    color: '#D1FAE5',
    fontSize: 12,
    fontWeight: '800',
  },
  promptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  promptChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  promptChipText: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  chatComposer: {
    gap: 10,
  },
  chatInput: {
    minHeight: 96,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: 'white',
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  composerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  agentResultShell: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: 'rgba(6,78,59,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(167,243,208,0.16)',
    gap: 10,
  },
  agentResultTitle: {
    color: '#D1FAE5',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  agentResultBody: {
    color: 'white',
    fontSize: 14,
    lineHeight: 20,
  },
  metricMiniRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricMiniCard: {
    flex: 1,
    minWidth: 110,
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  metricMiniValue: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  metricMiniLabel: {
    color: '#D7F1E7',
    fontSize: 12,
    fontWeight: '700',
  },
  inlineBullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  inlineBulletText: {
    flex: 1,
    color: '#D7F1E7',
    fontSize: 13,
    lineHeight: 18,
  },
  resultCard: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    gap: 4,
  },
  resultCardTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  resultCardMeta: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '700',
  },
  resultCardBody: {
    color: '#D7F1E7',
    fontSize: 13,
    lineHeight: 18,
  },
  mapSignalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  mapSignalCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  mapSignalValue: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  mapSignalLabel: {
    color: '#D7F1E7',
    fontSize: 12,
    fontWeight: '700',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  calendarTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  calendarSubtitle: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
  calendarLink: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '800',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  timelineDateBadge: {
    width: 52,
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(15,118,110,0.10)',
  },
  timelineDateDay: {
    color: '#0F766E',
    fontSize: 18,
    fontWeight: '800',
  },
  timelineDateMonth: {
    color: '#0F766E',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  timelineCopy: {
    flex: 1,
  },
  timelineTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 3,
  },
  timelineMeta: {
    color: '#475569',
    fontSize: 12,
    marginBottom: 2,
  },
  timelineMetaSecondary: {
    color: '#64748B',
    fontSize: 12,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  emptyStateText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
});
