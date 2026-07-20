import React, { useEffect, useState } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { foodBankDirectoryService, foodBankService } from '../../api/services';
import AppScreenBackground from '../../components/ui/AppScreenBackground';
import GlassSurface from '../../components/ui/GlassSurface';

export default function StaffDashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [foodBanks, setFoodBanks] = useState([]);
  const [hoursQueueCount, setHoursQueueCount] = useState(0);
  const [directoryStatus, setDirectoryStatus] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [foodBanksResponse, hoursResponse, directoryResponse] = await Promise.all([
        foodBankService.getAll({ limit: 100 }).catch(() => ({ data: { foodBanks: [] } })),
        foodBankService.getHoursReviewQueue().catch(() => ({ data: { count: 0 } })),
        foodBankDirectoryService.getStatus().catch(() => null),
      ]);

      setFoodBanks(foodBanksResponse.data?.foodBanks || []);
      setHoursQueueCount(hoursResponse.data?.count || 0);
      setDirectoryStatus(directoryResponse?.data || null);
    } catch (error) {
      console.error('Error loading staff dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const indexedResources = directoryStatus?.regions?.reduce(
    (total, region) => total + (region?._count?.entries || 0),
    0
  ) || 0;
  const pendingReviews = directoryStatus?.pendingReviews || 0;
  const availableCount = foodBanks.filter((item) => item.status?.foodAvailable === 'available').length;

  const menuItems = [
    {
      title: 'Update food status',
      description: 'Write to the real food bank status record for your organization.',
      icon: 'restaurant-outline',
      screen: 'StatusUpdate',
      color: '#10B981',
    },
    {
      title: 'Live food needs',
      description: 'Review real unfulfilled needs pulled from tracked food banks.',
      icon: 'list-outline',
      screen: 'FoodNeeds',
      color: '#F59E0B',
    },
    {
      title: 'Organization settings',
      description: 'Maintain hours, contact info, and staff configuration.',
      icon: 'settings-outline',
      screen: 'OrganizationSettings',
      color: '#6366F1',
    },
  ];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <AppScreenBackground />
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppScreenBackground />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDashboard(true)} />}
      >
        <GlassSurface preset="dark" style={styles.heroCard} padding={20}>
          <View style={styles.heroHeader}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>{user?.fullName || 'Staff dashboard'}</Text>
              <Text style={styles.heroBody}>
                Real operational status for the food network, review queues, and organization maintenance.
              </Text>
            </View>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color="#FCA5A5" />
            </TouchableOpacity>
          </View>
        </GlassSurface>

        <GlassSurface style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Live overview</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{foodBanks.length}</Text>
              <Text style={styles.statLabel}>Food banks tracked</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{availableCount}</Text>
              <Text style={styles.statLabel}>Marked available</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{hoursQueueCount}</Text>
              <Text style={styles.statLabel}>Hours reviews due</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{pendingReviews}</Text>
              <Text style={styles.statLabel}>Directory reviews</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{indexedResources}</Text>
              <Text style={styles.statLabel}>Indexed resources</Text>
            </View>
          </View>
        </GlassSurface>

        <GlassSurface style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Staff tools</Text>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={styles.menuItem}
              onPress={() => navigation.navigate(item.screen)}
            >
              <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
                <Ionicons name={item.icon} size={22} color={item.color} />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuDescription}>{item.description}</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={18} color="#64748B" />
            </TouchableOpacity>
          ))}
        </GlassSurface>

        <GlassSurface style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Operational notes</Text>
          <Text style={styles.noteText}>
            The staff portal only surfaces live operational data. If a section has no current updates yet, it stays empty until real records arrive.
          </Text>
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
    paddingBottom: 80,
    gap: 14,
  },
  heroCard: {
    marginBottom: 2,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroCopy: {
    flex: 1,
  },
  heroTitle: {
    color: 'white',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 10,
  },
  heroBody: {
    color: '#D7EAFE',
    fontSize: 14,
    lineHeight: 21,
  },
  logoutButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  sectionCard: {
    gap: 14,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '31%',
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  statValue: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  menuIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  noteText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
});
