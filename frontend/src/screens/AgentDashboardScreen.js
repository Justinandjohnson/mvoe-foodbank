// AgentDashboardScreen - Central hub for all AI agents
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { getActiveAgentJobs } from '../api/agentService';

// Available AI Agents
const AVAILABLE_AGENTS = [
  {
    id: 'meal-planner',
    name: 'Community Meal Planner',
    description: 'AI-powered meal planning with nutrition analysis and bulk pricing',
    icon: 'restaurant',
    color: '#10B981',
    status: 'active',
    features: ['USDA Nutrition', 'Price Research', 'Allergen Check'],
  },
  {
    id: 'price-research',
    name: 'Price Research Agent',
    description: 'Find best bulk food prices across multiple wholesalers',
    icon: 'pricetag',
    color: '#F59E0B',
    status: 'coming-soon',
    features: ['Multi-store Search', 'Price Comparison', 'Deal Alerts'],
  },
  {
    id: 'food-bank-discovery',
    name: 'Food Bank Discovery',
    description: 'Automatically discover and verify food bank locations',
    icon: 'location',
    color: '#8B5CF6',
    status: 'coming-soon',
    features: ['Google Maps Search', 'Auto-verification', 'Duplicate Check'],
  },
  {
    id: 'receipt-processor',
    name: 'Receipt Processor',
    description: 'OCR and categorize receipt expenses automatically',
    icon: 'document-text',
    color: '#3B82F6',
    status: 'coming-soon',
    features: ['OCR', 'Auto-categorize', 'Expense Reports'],
  },
  {
    id: 'volunteer-coordinator',
    name: 'Volunteer Coordinator',
    description: 'Match volunteers with events and optimize schedules',
    icon: 'people',
    color: '#EC4899',
    status: 'coming-soon',
    features: ['Skill Matching', 'Route Optimization', 'Reminders'],
  },
  {
    id: 'content-creator',
    name: 'Content Creator',
    description: 'Generate social media posts, newsletters, and flyers',
    icon: 'create',
    color: '#06B6D4',
    status: 'coming-soon',
    features: ['Social Posts', 'Newsletters', 'Flyers'],
  },
];

export default function AgentDashboardScreen({ navigation }) {
  const { user, isAuthenticated } = useAuth();

  // State
  const [activeJobs, setActiveJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadActiveJobs();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadActiveJobs = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await getActiveAgentJobs();
      if (response.success) {
        setActiveJobs(response.jobs || []);
      }
    } catch (error) {
      console.error('Error loading active jobs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadActiveJobs(true);
  };

  const handleAgentPress = (agent) => {
    if (agent.status === 'coming-soon') {
      Alert.alert('Coming Soon', `${agent.name} will be available soon!`);
      return;
    }

    // Navigate to specific agent screen
    switch (agent.id) {
      case 'meal-planner':
        navigation.navigate('Community', {
          screen: 'MealPlanner',
        });
        break;
      default:
        Alert.alert('Agent', `${agent.name} is ready to use!`);
    }
  };

  const getJobStatusColor = (status) => {
    switch (status) {
      case 'active':
      case 'processing':
        return '#F59E0B';
      case 'completed':
        return '#10B981';
      case 'failed':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const renderAgentCard = (agent) => (
    <TouchableOpacity
      key={agent.id}
      style={[
        styles.agentCard,
        agent.status === 'coming-soon' && styles.agentCardDisabled,
      ]}
      onPress={() => handleAgentPress(agent)}
      disabled={agent.status === 'coming-soon'}
    >
      <View style={[styles.agentIcon, { backgroundColor: agent.color }]}>
        <Ionicons name={agent.icon} size={32} color="white" />
      </View>

      <View style={styles.agentInfo}>
        <View style={styles.agentHeader}>
          <Text style={styles.agentName}>{agent.name}</Text>
          {agent.status === 'coming-soon' && (
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Soon</Text>
            </View>
          )}
        </View>

        <Text style={styles.agentDescription}>{agent.description}</Text>

        <View style={styles.featuresList}>
          {agent.features.map((feature, index) => (
            <View key={index} style={styles.featureChip}>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </View>

      <Ionicons
        name="chevron-forward"
        size={24}
        color={agent.status === 'coming-soon' ? '#D1D5DB' : '#6B7280'}
      />
    </TouchableOpacity>
  );

  const renderActiveJobCard = (job) => (
    <TouchableOpacity
      key={job.id}
      style={styles.jobCard}
      onPress={() => {
        Alert.alert('Job Details', `Job ID: ${job.id}\nStatus: ${job.status}`);
      }}
    >
      <View style={styles.jobHeader}>
        <View style={styles.jobInfo}>
          <Text style={styles.jobTitle}>{job.agentType}</Text>
          <Text style={styles.jobTime}>
            Started {new Date(job.startedAt).toLocaleTimeString()}
          </Text>
        </View>

        <View
          style={[
            styles.jobStatusBadge,
            { backgroundColor: getJobStatusColor(job.status) },
          ]}
        >
          <Text style={styles.jobStatusText}>{job.status}</Text>
        </View>
      </View>

      {job.progress && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${job.progress}%`, backgroundColor: getJobStatusColor(job.status) },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{job.progress}%</Text>
        </View>
      )}

      {job.currentStep && (
        <Text style={styles.jobStep}>{job.currentStep}</Text>
      )}
    </TouchableOpacity>
  );

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="lock-closed" size={48} color="#6B7280" />
        <Text style={styles.authTitle}>Sign In Required</Text>
        <Text style={styles.authMessage}>
          Sign in to access AI agents and manage your jobs
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
        <Text style={styles.headerTitle}>AI Agents</Text>
        <Text style={styles.headerSubtitle}>
          Automate tasks with intelligent AI assistants
        </Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Active Jobs Section */}
        {activeJobs.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="hourglass" size={20} color="#F59E0B" />
              <Text style={styles.sectionTitle}>Active Jobs ({activeJobs.length})</Text>
            </View>

            {activeJobs.map(renderActiveJobCard)}
          </View>
        )}

        {/* Available Agents Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="apps" size={20} color="#10B981" />
            <Text style={styles.sectionTitle}>Available Agents</Text>
          </View>

          {AVAILABLE_AGENTS.map(renderAgentCard)}
        </View>

        {/* Stats Section */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsTitle}>Your AI Usage</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('JobHistory')}
              style={styles.viewAllButton}
            >
              <Text style={styles.viewAllText}>View All</Text>
              <Ionicons name="chevron-forward" size={16} color="#10B981" />
            </TouchableOpacity>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>12</Text>
              <Text style={styles.statLabel}>Total Jobs</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>8</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>2.5h</Text>
              <Text style={styles.statLabel}>Time Saved</Text>
            </View>
          </View>
        </View>

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

  // Content
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
  },

  // Agent Cards
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  agentCardDisabled: {
    opacity: 0.6,
  },
  agentIcon: {
    width: 64,
    height: 64,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  agentInfo: {
    flex: 1,
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  agentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  comingSoonBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  comingSoonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
  },
  agentDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
    lineHeight: 18,
  },
  featuresList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  featureChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  featureText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },

  // Job Cards
  jobCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  jobInfo: {
    flex: 1,
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  jobTime: {
    fontSize: 13,
    color: '#6B7280',
  },
  jobStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  jobStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
    textTransform: 'capitalize',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginRight: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    width: 40,
    textAlign: 'right',
  },
  jobStep: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
  },

  // Stats
  statsCard: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    marginRight: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
  },

  bottomSpacer: {
    height: 40,
  },
});
