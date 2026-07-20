import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { communityService, mapService } from '../api/services';
import AppScreenBackground from '../components/ui/AppScreenBackground';
import GlassSurface from '../components/ui/GlassSurface';

const SECONDARY_ACTIONS = [
  {
    id: 'beacon',
    title: 'Start beacon',
    subtitle: 'Turn on a live pickup point from the map.',
    icon: 'radio',
    color: '#F97316',
    onPress: (navigation) => navigation.navigate('Map', { openBeaconComposer: true }),
  },
  {
    id: 'gatherings',
    title: 'Live meal calendar',
    subtitle: 'Open map meals and upcoming event timeline.',
    icon: 'calendar',
    color: '#8B5CF6',
    onPress: (navigation) => navigation.navigate('Map', { focusLayer: 'events', openCalendarPanel: true }),
  },
  {
    id: 'volunteers',
    title: 'Volunteer ops',
    subtitle: 'Manage reminders, coverage, and approvals.',
    icon: 'people',
    color: '#10B981',
    onPress: (navigation) => navigation.navigate('Map', { openVolunteerWidget: true }),
  },
  {
    id: 'grants',
    title: 'Grant writer',
    subtitle: 'Open the funding workspace and Drive sync.',
    icon: 'document-text',
    color: '#0EA5E9',
    onPress: (navigation) => navigation.navigate('Agents', { screen: 'GrantWriter' }),
  },
];

function formatDateTime(value) {
  if (!value) return 'Feed pending';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function HomeScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 1040;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mapFeed, setMapFeed] = useState(null);
  const [events, setEvents] = useState([]);

  const loadDesk = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [feedResponse, eventsResponse] = await Promise.all([
        mapService.getLiveFeed({ radius: 25 }).catch(() => null),
        communityService.getEvents({ limit: 4, upcoming: true }).catch(() => null),
      ]);

      setMapFeed(feedResponse?.data || {
        foodBanks: [],
        beacons: [],
        events: [],
        generatedAt: null,
      });
      setEvents(eventsResponse?.data?.events || []);
    } catch (error) {
      console.error('Error loading command desk:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDesk();
  }, []);

  const snapshotItems = useMemo(() => {
    const foodBanks = mapFeed?.foodBanks || [];
    const beacons = mapFeed?.beacons || [];
    const liveEvents = mapFeed?.events || [];
    const openNow = foodBanks.filter((item) => item.openNow === true).length;
    const servingsPlanned = events.reduce((sum, event) => sum + (event.targetServings || 0), 0);

    return [
      { label: 'Open now', value: String(openNow), icon: 'business', color: '#34D399' },
      { label: 'Beacons live', value: String(beacons.filter((item) => item.isActive).length), icon: 'radio', color: '#FB923C' },
      { label: 'Public meals', value: String(liveEvents.length), icon: 'flame', color: '#A78BFA' },
      { label: 'Servings', value: servingsPlanned.toLocaleString(), icon: 'restaurant', color: '#60A5FA' },
    ];
  }, [events, mapFeed]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <AppScreenBackground variant="soft" />
        <ActivityIndicator size="large" color="#34D399" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppScreenBackground variant="soft" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDesk(true)} />}
      >
        <View style={styles.topStrip}>
          <View style={styles.titleBlock}>
            <Text style={styles.pageLabel}>Command</Text>
            <Text style={styles.pageTitle}>Launch food response fast.</Text>
          </View>
          <View style={styles.feedBadge}>
            <Ionicons name="pulse" size={14} color="#A7F3D0" />
            <Text style={styles.feedBadgeText}>{formatDateTime(mapFeed?.generatedAt)}</Text>
          </View>
        </View>

        <View style={styles.snapshotStrip}>
          {snapshotItems.map((item) => (
            <GlassSurface key={item.label} style={styles.snapshotPill} padding={12}>
              <View style={[styles.snapshotIcon, { backgroundColor: `${item.color}20` }]}>
                <Ionicons name={item.icon} size={14} color={item.color} />
              </View>
              <Text style={styles.snapshotValue}>{item.value}</Text>
              <Text style={styles.snapshotLabel}>{item.label}</Text>
            </GlassSurface>
          ))}
        </View>

        <View style={[styles.launchRow, isWide && styles.launchRowWide]}>
          <GlassSurface preset="dark" style={[styles.primaryLauncher, isWide && styles.primaryLauncherWide]} padding={18}>
            <Text style={styles.launchEyebrow}>Primary action</Text>
            <Text style={styles.launchTitle}>Open live map</Text>
            <Text style={styles.launchBody}>Stay on the live surface with food banks, beacons, and public meals in one view.</Text>
            <TouchableOpacity
              style={styles.launchButtonPrimary}
              onPress={() => navigation.navigate('Map')}
              accessibilityRole="button"
              accessibilityLabel="Open live map"
            >
              <Ionicons name="navigate" size={18} color="#07121F" />
              <Text style={styles.launchButtonPrimaryText}>Open live map</Text>
            </TouchableOpacity>
          </GlassSurface>

          <GlassSurface style={[styles.primaryLauncher, styles.lightLauncher, isWide && styles.primaryLauncherWide]} padding={18}>
            <Text style={styles.lightEyebrow}>Fast start</Text>
            <Text style={styles.lightTitle}>Create meal event</Text>
            <Text style={styles.lightBody}>Start a potluck, barbecue, or public meal without hunting through the app.</Text>
            <TouchableOpacity
              style={styles.launchButtonSecondary}
              onPress={() => navigation.navigate('Map', { openEventComposer: true })}
              accessibilityRole="button"
              accessibilityLabel="Create meal event"
            >
              <Ionicons name="flame" size={18} color="#0F172A" />
              <Text style={styles.launchButtonSecondaryText}>Create meal event</Text>
            </TouchableOpacity>
          </GlassSurface>
        </View>

        <GlassSurface style={styles.actionsBoard} padding={18}>
          <View style={styles.boardHeader}>
            <View>
              <Text style={styles.boardTitle}>Immediate actions</Text>
              <Text style={styles.boardSubtitle}>Everything here should move work forward in one tap.</Text>
            </View>
            <TouchableOpacity
              style={styles.subtleMapLink}
              onPress={() => navigation.navigate('Map')}
            >
              <Text style={styles.subtleMapLinkText}>Map first</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionGrid}>
            {SECONDARY_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.actionTile}
                onPress={() => action.onPress(navigation)}
                accessibilityRole="button"
                accessibilityLabel={action.title}
              >
                <View style={[styles.actionIcon, { backgroundColor: `${action.color}18` }]}>
                  <Ionicons name={action.icon} size={18} color={action.color} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#64748B" />
              </TouchableOpacity>
            ))}
          </View>
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
    paddingBottom: 108,
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
  feedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.46)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  feedBadgeText: {
    color: '#D1FAE5',
    fontSize: 12,
    fontWeight: '700',
  },
  snapshotStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  snapshotPill: {
    minWidth: 150,
    flex: 1,
  },
  snapshotIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  snapshotValue: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  snapshotLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  launchRow: {
    gap: 12,
  },
  launchRowWide: {
    flexDirection: 'row',
  },
  primaryLauncher: {
    overflow: 'hidden',
  },
  primaryLauncherWide: {
    flex: 1,
  },
  lightLauncher: {
    backgroundColor: 'transparent',
  },
  launchEyebrow: {
    color: '#86EFAC',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  launchTitle: {
    color: 'white',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  launchBody: {
    color: '#D1FAE5',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  lightEyebrow: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  lightTitle: {
    color: '#0F172A',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  lightBody: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  launchButtonPrimary: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#D1FAE5',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  launchButtonPrimaryText: {
    color: '#07121F',
    fontSize: 14,
    fontWeight: '800',
  },
  launchButtonSecondary: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  launchButtonSecondaryText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  actionsBoard: {
    flex: 1,
  },
  boardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  boardTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  boardSubtitle: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
  subtleMapLink: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,118,110,0.10)',
  },
  subtleMapLinkText: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '800',
  },
  actionGrid: {
    gap: 10,
  },
  actionTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.70)',
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  actionSubtitle: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
});
