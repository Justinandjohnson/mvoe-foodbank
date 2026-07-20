import React, { useCallback, useEffect, useState } from 'react';
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
import { decideApproval, getActiveAgentJobs, getAgentActivity, getApprovals, getVolunteerAgentActivity } from '../api/agentService';
import { subscribeToAgentEvents } from '../services/socketService';

function StatusPill({ status }) {
  const color = status === 'pending' ? '#F59E0B' : status === 'approved' || status === 'completed' ? '#10B981' : status === 'rejected' || status === 'failed' ? '#EF4444' : '#6B7280';
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={styles.pillText}>{status}</Text>
    </View>
  );
}

export default function AgentNotificationsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [activity, setActivity] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [volunteerActivity, setVolunteerActivity] = useState([]);

  const loadAll = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      const [jobRes, activityRes, approvalsRes, volunteerRes] = await Promise.all([
        getActiveAgentJobs(),
        getAgentActivity(),
        getApprovals(),
        getVolunteerAgentActivity(),
      ]);
      setJobs(jobRes.jobs || []);
      setActivity(activityRes.entries || []);
      setApprovals(approvalsRes.approvals || []);
      setVolunteerActivity(volunteerRes.entries || []);
    } catch (error) {
      Alert.alert('Error', 'Could not load notifications and activity.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const unsubscribe = subscribeToAgentEvents({
      onProgress: async () => loadAll(true),
      onComplete: async () => loadAll(true),
      onError: async () => loadAll(true),
    });

    return unsubscribe;
  }, [loadAll]);

  const handleDecision = async (approvalId, approved) => {
    try {
      await decideApproval(approvalId, approved);
      await loadAll(true);
    } catch (error) {
      Alert.alert('Error', 'Could not update approval status.');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Agent Notifications</Text>
          <Text style={styles.headerSubtitle}>Activity, approvals, and live agent status</Text>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} />}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Action Required</Text>
          {approvals.length === 0 ? <Text style={styles.emptyText}>No approvals waiting.</Text> : approvals.map((approval) => (
            <View key={approval.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{approval.action_type}</Text>
                <StatusPill status="pending" />
              </View>
              <Text style={styles.cardBody}>{JSON.stringify(approval.payload)}</Text>
              <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.actionButton, styles.approveButton]} onPress={() => handleDecision(approval.id, true)}>
                  <Text style={styles.actionButtonText} accessibilityRole="button" accessibilityLabel="Approve">Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={() => handleDecision(approval.id, false)}>
                  <Text style={styles.actionButtonText} accessibilityRole="button" accessibilityLabel="Reject">Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Live Jobs</Text>
          {jobs.length === 0 ? <Text style={styles.emptyText}>No active agent jobs.</Text> : jobs.map((job) => (
            <View key={job.jobId} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{job.name || job.jobId}</Text>
                <StatusPill status={job.status} />
              </View>
              <Text style={styles.cardBody}>Job ID: {job.jobId}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {[...activity, ...volunteerActivity].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 20).map((entry, index) => (
            <View key={`${entry.type}-${entry.id}-${index}`} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{entry.type}</Text>
                <StatusPill status={entry.status || 'info'} />
              </View>
              <Text style={styles.cardBody}>{entry.message}</Text>
              <Text style={styles.cardMeta}>{entry.created_at}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#10B981', paddingTop: 60, paddingBottom: 18, paddingHorizontal: 16 },
  headerContent: { marginLeft: 12, flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: 'white' },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  content: { flex: 1, flexBasis: 0, minHeight: 0 },
  contentContainer: { flexGrow: 1, paddingBottom: 24 },
  section: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptyText: { color: '#6B7280' },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 14, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontWeight: '700', color: '#111827', flex: 1, paddingRight: 12 },
  cardBody: { color: '#374151', lineHeight: 20 },
  cardMeta: { color: '#6B7280', fontSize: 12 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { color: 'white', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionButton: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  approveButton: { backgroundColor: '#10B981' },
  rejectButton: { backgroundColor: '#EF4444' },
  actionButtonText: { color: 'white', fontWeight: '700' },
});
