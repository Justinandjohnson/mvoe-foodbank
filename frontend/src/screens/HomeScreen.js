// Home Screen - Redesigned cohesive layout
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { donationService, organizationService } from '../api/services';

export default function HomeScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [organizations, setOrganizations] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsData, orgsData] = await Promise.all([
        donationService.getStats(),
        organizationService.getAll({ limit: 5 }),
      ]);

      setStats(statsData.data.stats);
      setOrganizations(orgsData.data.organizations);
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getAgentCards = () => [
    { id: 1, name: 'Price Research', icon: 'pricetag', color: '#10B981', statusColor: '#10B981', currentTask: 'Scanning bulk deals', timeSaved: '5h → 15m' },
    { id: 2, name: 'Partner Outreach', icon: 'people', color: '#F59E0B', statusColor: '#10B981', currentTask: 'Contacted 12 orgs', timeSaved: '8h → 30m' },
    { id: 3, name: 'Content Creation', icon: 'create', color: '#8B5CF6', statusColor: '#6B7280', currentTask: 'Idle', timeSaved: '3h → 10m' },
    { id: 4, name: 'Grant Research', icon: 'document-text', color: '#EF4444', statusColor: '#6B7280', currentTask: 'Idle', timeSaved: '4h → 20m' },
    { id: 5, name: 'Data Analysis', icon: 'analytics', color: '#06B6D4', statusColor: '#10B981', currentTask: 'Processing metrics', timeSaved: '3h → 10m' },
    { id: 6, name: 'Receipt Processing', icon: 'receipt', color: '#84CC16', statusColor: '#6B7280', currentTask: 'Idle', timeSaved: '2h → 5m' },
    { id: 7, name: 'Meal Planner', icon: 'restaurant', color: '#F97316', statusColor: '#F59E0B', currentTask: 'Planning cookout', timeSaved: '8h → 20m' },
    { id: 8, name: 'Volunteer Coord', icon: 'person-add', color: '#A855F7', statusColor: '#6B7280', currentTask: 'Idle', timeSaved: '4h → 15m' },
  ];

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Hero Section */}
      <View style={styles.hero}>
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>Fighting Hunger</Text>
          <Text style={styles.heroSubtitle}>Together</Text>
          <Text style={styles.heroDescription}>
            Connect with local food banks, track your impact, and help build stronger communities through transparent giving.
          </Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.primaryAction]}
          onPress={() => navigation.navigate('Donate')}
        >
          <Ionicons name="heart" size={24} color="white" />
          <Text style={styles.primaryActionText}>Donate Now</Text>
        </TouchableOpacity>
        <View style={styles.secondaryActions}>
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={() => navigation.navigate('Map')}
          >
            <Ionicons name="location" size={20} color="#10B981" />
            <Text style={styles.secondaryActionText}>Find Food Banks</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={() => navigation.navigate('Agents')}
          >
            <Ionicons name="bar-chart" size={20} color="#10B981" />
            <Text style={styles.secondaryActionText}>View Impact</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Live Impact Metrics */}
      {stats && (
        <View style={styles.impactSection}>
          <Text style={styles.sectionTitle}>🌟 Live Community Impact</Text>
          <View style={styles.impactGrid}>
            <View style={styles.impactCard}>
              <Ionicons name="wallet" size={28} color="#10B981" />
              <Text style={styles.impactValue}>
                ${(stats.totalRaised / 100).toLocaleString()}
              </Text>
              <Text style={styles.impactLabel}>Total Raised</Text>
            </View>
            <View style={styles.impactCard}>
              <Ionicons name="restaurant" size={28} color="#F59E0B" />
              <Text style={styles.impactValue}>
                {stats.mealsProvided.toLocaleString()}
              </Text>
              <Text style={styles.impactLabel}>Meals Provided</Text>
            </View>
            <View style={styles.impactCard}>
              <Ionicons name="home" size={28} color="#8B5CF6" />
              <Text style={styles.impactValue}>
                {stats.familiesServed.toLocaleString()}
              </Text>
              <Text style={styles.impactLabel}>Families Served</Text>
            </View>
            <View style={styles.impactCard}>
              <Ionicons name="people" size={28} color="#EF4444" />
              <Text style={styles.impactValue}>{stats.totalDonations}</Text>
              <Text style={styles.impactLabel}>Donations</Text>
            </View>
          </View>
        </View>
      )}

      {/* AI Agent Dashboard */}
      <View style={styles.agentSection}>
        <Text style={styles.sectionTitle}>🤖 AI Agent Dashboard</Text>
        <Text style={styles.sectionSubtitle}>
          11 AI agents automating 94% of manual tasks
        </Text>

        {/* Community Meal Planner Chat */}
        <TouchableOpacity style={styles.chatCard} onPress={() => navigation.navigate('Agents')}>
          <View style={styles.chatHeader}>
            <View style={styles.chatIcon}>
              <Ionicons name="chatbubbles" size={24} color="#8B5CF6" />
            </View>
            <View style={styles.chatInfo}>
              <Text style={styles.chatTitle}>Plan Community Cookout</Text>
              <Text style={styles.chatSubtext}>Chat with AI to organize meals & events</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color="#8B5CF6" />
          </View>
        </TouchableOpacity>

        {/* Agent Grid */}
        <View style={styles.agentGrid}>
          {getAgentCards().map((agent) => (
            <TouchableOpacity key={agent.id} style={styles.agentCard} onPress={() => navigation.navigate('Agents')}>
              <View style={styles.agentCardHeader}>
                <Ionicons name={agent.icon} size={20} color={agent.color} />
                <View style={[styles.agentStatus, { backgroundColor: agent.statusColor }]} />
              </View>
              <Text style={styles.agentName}>{agent.name}</Text>
              <Text style={styles.agentTask}>{agent.currentTask}</Text>
              <Text style={styles.agentSaved}>{agent.timeSaved}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Active Jobs Feed */}
        <View style={styles.jobsFeed}>
          <Text style={styles.feedTitle}>🔄 Live Agent Activity</Text>
          <View style={styles.jobItem}>
            <View style={styles.jobIcon}>
              <Ionicons name="search" size={16} color="#10B981" />
            </View>
            <View style={styles.jobInfo}>
              <Text style={styles.jobName}>Price Research Agent</Text>
              <Text style={styles.jobStatus}>Finding bulk pasta deals... 87% complete</Text>
            </View>
            <Text style={styles.jobTime}>2m ago</Text>
          </View>
          <View style={styles.jobItem}>
            <View style={styles.jobIcon}>
              <Ionicons name="mail" size={16} color="#F59E0B" />
            </View>
            <View style={styles.jobInfo}>
              <Text style={styles.jobName}>Partner Outreach Agent</Text>
              <Text style={styles.jobStatus}>Contacted 5 churches, 3 responses</Text>
            </View>
            <Text style={styles.jobTime}>15m ago</Text>
          </View>
          <View style={styles.jobItem}>
            <View style={styles.jobIcon}>
              <Ionicons name="restaurant" size={16} color="#8B5CF6" />
            </View>
            <View style={styles.jobInfo}>
              <Text style={styles.jobName}>Meal Planner Agent</Text>
              <Text style={styles.jobStatus}>Planned cookout for 75 people, $367 budget</Text>
            </View>
            <Text style={styles.jobTime}>1h ago</Text>
          </View>
        </View>
      </View>

      {/* Bottom Spacer */}
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },

  // Hero Section
  hero: {
    backgroundColor: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    backgroundColor: '#10B981',
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  heroContent: {
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#D1FAE5',
    textAlign: 'center',
    marginBottom: 16,
  },
  heroDescription: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },

  // Quick Actions
  quickActions: {
    padding: 20,
    paddingTop: 24,
  },
  primaryAction: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryActionText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  secondaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  secondaryActionText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },

  // Impact Section
  impactSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  impactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  impactCard: {
    width: '48%',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  impactValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 8,
  },
  impactLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },

  // AI Agent Section
  agentSection: {
    padding: 20,
    paddingTop: 0,
  },

  // Chat Card
  chatCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  chatIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#F3E8FF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  chatInfo: {
    flex: 1,
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  chatSubtext: {
    fontSize: 14,
    color: '#6B7280',
  },

  // Agent Grid
  agentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  agentCard: {
    width: '48%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  agentCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  agentStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  agentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  agentTask: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  agentSaved: {
    fontSize: 10,
    color: '#10B981',
    fontWeight: '600',
  },

  // Jobs Feed
  jobsFeed: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  feedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  jobItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  jobIcon: {
    width: 32,
    height: 32,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  jobInfo: {
    flex: 1,
  },
  jobName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  jobStatus: {
    fontSize: 12,
    color: '#6B7280',
  },
  jobTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 20,
  },
});
