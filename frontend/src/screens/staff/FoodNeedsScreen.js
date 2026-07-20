import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { foodBankService } from '../../api/services';
import AppScreenBackground from '../../components/ui/AppScreenBackground';
import GlassSurface from '../../components/ui/GlassSurface';

function getPriorityColor(priority) {
  switch (priority) {
    case 'urgent':
      return '#EF4444';
    case 'high':
      return '#F59E0B';
    case 'medium':
      return '#10B981';
    default:
      return '#6B7280';
  }
}

export default function FoodNeedsScreen() {
  const [foodBanks, setFoodBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNeeds = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await foodBankService.getAll({ limit: 100 });
      setFoodBanks(response.data?.foodBanks || []);
    } catch (error) {
      console.error('Error loading food needs:', error);
      setFoodBanks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNeeds();
  }, []);

  const needs = useMemo(() => (
    foodBanks.flatMap((foodBank) =>
      (foodBank.foodNeeds || []).map((need) => ({
        ...need,
        foodBankName: foodBank.name,
      }))
    )
  ), [foodBanks]);

  const urgentCount = needs.filter((need) => need.priority === 'urgent').length;

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadNeeds(true)} />}
      >
        <GlassSurface preset="dark" style={styles.heroCard} padding={20}>
          <Text style={styles.heroTitle}>Live food needs</Text>
          <Text style={styles.heroBody}>
            This list comes from unfulfilled food need records on verified food bank entries. If nothing is listed here, the system currently has no live needs to show.
          </Text>
        </GlassSurface>

        <GlassSurface style={styles.sectionCard}>
          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{needs.length}</Text>
              <Text style={styles.metricLabel}>Open needs</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{urgentCount}</Text>
              <Text style={styles.metricLabel}>Urgent</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{foodBanks.length}</Text>
              <Text style={styles.metricLabel}>Food banks tracked</Text>
            </View>
          </View>
        </GlassSurface>

        <GlassSurface style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Needs queue</Text>
          {needs.length > 0 ? (
            needs.map((need) => (
              <View key={need.id} style={styles.needCard}>
                <View style={styles.needHeader}>
                  <Text style={styles.needItem}>{need.itemName || need.title || 'Food need'}</Text>
                  <View style={[styles.priorityBadge, { backgroundColor: `${getPriorityColor(need.priority)}18` }]}>
                    <Text style={[styles.priorityText, { color: getPriorityColor(need.priority) }]}>
                      {need.priority || 'open'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.needMeta}>{need.foodBankName}</Text>
                <Text style={styles.needMeta}>{need.quantity || need.amountNeeded || 'Quantity not set'}</Text>
                {need.notes ? <Text style={styles.needNotes}>{need.notes}</Text> : null}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#10B981" />
              <Text style={styles.emptyStateText}>No unfulfilled live food needs are recorded right now.</Text>
            </View>
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
  sectionCard: {
    gap: 14,
  },
  metricRow: {
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
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  needCard: {
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
    gap: 6,
  },
  needHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  needItem: {
    flex: 1,
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  priorityBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  needMeta: {
    color: '#475569',
    fontSize: 13,
  },
  needNotes: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyStateText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
});
