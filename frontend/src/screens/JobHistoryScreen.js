// JobHistoryScreen - View all past agent jobs
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getActiveAgentJobs } from '../api/agentService';

export default function JobHistoryScreen({ navigation }) {
  // State
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, completed, failed

  useEffect(() => {
    loadJobs();
  }, [filter]);

  const loadJobs = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // TODO: Implement API call to get job history
      // const response = await getJobHistory({ status: filter });

      // Mock data for now
      const mockJobs = [
        {
          id: 'job-1',
          agentType: 'meal-planner',
          agentName: 'Community Meal Planner',
          status: 'completed',
          startedAt: new Date('2025-10-28T10:00:00'),
          completedAt: new Date('2025-10-28T10:05:32'),
          duration: '5m 32s',
          result: {
            servings: 100,
            estimatedCost: 500,
          },
        },
        {
          id: 'job-2',
          agentType: 'meal-planner',
          agentName: 'Community Meal Planner',
          status: 'completed',
          startedAt: new Date('2025-10-27T14:30:00'),
          completedAt: new Date('2025-10-27T14:34:12'),
          duration: '4m 12s',
          result: {
            servings: 50,
            estimatedCost: 250,
          },
        },
        {
          id: 'job-3',
          agentType: 'price-research',
          agentName: 'Price Research Agent',
          status: 'failed',
          startedAt: new Date('2025-10-26T09:15:00'),
          completedAt: new Date('2025-10-26T09:16:45'),
          duration: '1m 45s',
          error: 'Rate limit exceeded',
        },
      ];

      // Filter based on selection
      let filteredJobs = mockJobs;
      if (filter !== 'all') {
        filteredJobs = mockJobs.filter((job) => job.status === filter);
      }

      setJobs(filteredJobs);
    } catch (error) {
      console.error('Error loading job history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadJobs(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#10B981';
      case 'failed':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const getAgentIcon = (agentType) => {
    switch (agentType) {
      case 'meal-planner':
        return 'restaurant';
      case 'price-research':
        return 'pricetag';
      case 'food-bank-discovery':
        return 'location';
      case 'receipt-processor':
        return 'document-text';
      default:
        return 'flash';
    }
  };

  const renderFilterTabs = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
      {[
        { key: 'all', label: 'All Jobs' },
        { key: 'completed', label: 'Completed' },
        { key: 'failed', label: 'Failed' },
      ].map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
          onPress={() => setFilter(tab.key)}
        >
          <Text style={[styles.filterTabText, filter === tab.key && styles.filterTabTextActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderJobCard = (job) => (
    <TouchableOpacity
      key={job.id}
      style={styles.jobCard}
      onPress={() => {
        // Navigate to job detail
        navigation.navigate('JobDetail', { jobId: job.id });
      }}
    >
      <View style={styles.jobHeader}>
        <View style={[styles.agentIcon, { backgroundColor: getStatusColor(job.status) }]}>
          <Ionicons name={getAgentIcon(job.agentType)} size={24} color="white" />
        </View>

        <View style={styles.jobInfo}>
          <Text style={styles.jobName}>{job.agentName}</Text>
          <Text style={styles.jobTime}>
            {job.startedAt.toLocaleDateString()} at {job.startedAt.toLocaleTimeString()}
          </Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(job.status) }]}>
          <Text style={styles.statusText}>{job.status}</Text>
        </View>
      </View>

      <View style={styles.jobDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={16} color="#6B7280" />
          <Text style={styles.detailText}>Duration: {job.duration}</Text>
        </View>

        {job.status === 'completed' && job.result && (
          <>
            {job.result.servings && (
              <View style={styles.detailRow}>
                <Ionicons name="people-outline" size={16} color="#6B7280" />
                <Text style={styles.detailText}>{job.result.servings} servings</Text>
              </View>
            )}
            {job.result.estimatedCost && (
              <View style={styles.detailRow}>
                <Ionicons name="card-outline" size={16} color="#6B7280" />
                <Text style={styles.detailText}>${job.result.estimatedCost.toFixed(2)}</Text>
              </View>
            )}
          </>
        )}

        {job.status === 'failed' && job.error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{job.error}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Job History</Text>
          <Text style={styles.headerSubtitle}>{jobs.length} total jobs</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      {renderFilterTabs()}

      {/* Jobs List */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>Loading jobs...</Text>
          </View>
        ) : jobs.length > 0 ? (
          jobs.map(renderJobCard)
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Jobs Found</Text>
            <Text style={styles.emptyMessage}>
              {filter === 'all'
                ? "You haven't run any AI agents yet"
                : `No ${filter} jobs found`}
            </Text>
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  backButton: {
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
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

  // Filters
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
  },
  filterTab: {
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
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: 'white',
  },

  // Content
  content: {
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
  },

  // Job Cards
  jobCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  agentIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  jobInfo: {
    flex: 1,
  },
  jobName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  jobTime: {
    fontSize: 13,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
    textTransform: 'capitalize',
  },
  jobDetails: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    marginLeft: 8,
    flex: 1,
  },

  bottomSpacer: {
    height: 40,
  },
});
