import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getActiveAgentJobs, getAgentActivity } from '../api/agentService';
import AppScreenBackground from '../components/ui/AppScreenBackground';
import GlassSurface from '../components/ui/GlassSurface';

function normalizeEntryStatus(entry) {
  const explicit = entry?.status || entry?.details?.status;
  if (explicit) return String(explicit).toLowerCase();

  if (String(entry?.action || '').includes('FAILED')) return 'failed';
  if (String(entry?.action || '').includes('COMPLETED')) return 'completed';
  return 'info';
}

function formatActivityTime(value) {
  if (!value) return 'Pending';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusColor(status) {
  switch (status) {
    case 'completed':
      return '#10B981';
    case 'failed':
      return '#EF4444';
    case 'processing':
    case 'active':
      return '#F59E0B';
    default:
      return '#64748B';
  }
}

export default function JobHistoryScreen({ navigation }) {
  const [activity, setActivity] = useState([]);
  const [activeJobs, setActiveJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [activityResponse, activeResponse] = await Promise.all([
        getAgentActivity(60),
        getActiveAgentJobs().catch(() => ({ jobs: [] })),
      ]);

      setActivity(activityResponse.entries || []);
      setActiveJobs(activeResponse.jobs || []);
    } catch (error) {
      console.error('Error loading agent activity:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredEntries = useMemo(() => {
    if (filter === 'live') {
      return [];
    }

    if (filter === 'all') {
      return activity;
    }

    return activity.filter((entry) => normalizeEntryStatus(entry) === filter);
  }, [activity, filter]);

  return (
    <View style={styles.container}>
      <AppScreenBackground />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadJobs(true)} />}
      >
        <GlassSurface preset="dark" style={styles.heroCard} padding={20}>
          <View style={styles.heroHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color="white" />
            </TouchableOpacity>
          </View>
          <Text style={styles.heroTitle}>Agent activity</Text>
          <Text style={styles.heroBody}>
            This screen only shows real agent activity and currently running jobs. If there is no logged history yet, it stays empty instead of inventing examples.
          </Text>
        </GlassSurface>

        <GlassSurface style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Filters</Text>
          <View style={styles.filterRow}>
            {[
              { key: 'all', label: 'All' },
              { key: 'completed', label: 'Completed' },
              { key: 'failed', label: 'Failed' },
              { key: 'live', label: 'Live now' },
            ].map((tab) => {
              const active = filter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(tab.key)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </GlassSurface>

        {filter === 'live' ? (
          <GlassSurface style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Running jobs</Text>
            {activeJobs.length > 0 ? (
              activeJobs.map((job) => (
                <View key={job.jobId} style={styles.entryCard}>
                  <View style={styles.entryHeader}>
                    <Text style={styles.entryTitle}>{job.agentType || job.name || 'Agent job'}</Text>
                    <View style={[styles.statusPill, { backgroundColor: `${getStatusColor(job.status)}16` }]}>
                      <Text style={[styles.statusPillText, { color: getStatusColor(job.status) }]}>
                        {job.status || 'active'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.entryBody}>{job.request || 'A background agent job is running.'}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No agent jobs are currently running.</Text>
            )}
          </GlassSurface>
        ) : (
          <GlassSurface style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Recent logged activity</Text>
            {loading ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator size="large" color="#10B981" />
              </View>
            ) : filteredEntries.length > 0 ? (
              filteredEntries.map((entry, index) => {
                const status = normalizeEntryStatus(entry);

                return (
                  <View key={`${entry.id || entry.entityId || 'activity'}-${index}`} style={styles.entryCard}>
                    <View style={styles.entryHeader}>
                      <Text style={styles.entryTitle}>{entry.action || 'Agent event'}</Text>
                      <View style={[styles.statusPill, { backgroundColor: `${getStatusColor(status)}16` }]}>
                        <Text style={[styles.statusPillText, { color: getStatusColor(status) }]}>{status}</Text>
                      </View>
                    </View>
                    <Text style={styles.entryBody}>
                      {entry.details?.summary
                        || entry.details?.message
                        || entry.entityType
                        || 'A real activity entry was recorded for this agent action.'}
                    </Text>
                    <Text style={styles.entryMeta}>{formatActivityTime(entry.createdAt || entry.created_at)}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptyText}>No real agent activity has been recorded for this filter yet.</Text>
            )}
          </GlassSurface>
        )}
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
  heroCard: {
    marginBottom: 2,
  },
  heroHeader: {
    marginBottom: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
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
  },
  sectionCard: {
    gap: 14,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(15,118,110,0.14)',
    borderColor: 'rgba(15,118,110,0.18)',
  },
  filterText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  filterTextActive: {
    color: '#0F172A',
  },
  entryCard: {
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
    gap: 8,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  entryTitle: {
    flex: 1,
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  entryBody: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  entryMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  loadingBlock: {
    paddingVertical: 28,
    alignItems: 'center',
  },
});
