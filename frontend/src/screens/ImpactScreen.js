// Impact Screen - Public transparency ledger
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { ledgerService } from '../api/services';

export default function ImpactScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    loadLedger();
  }, []);

  const loadLedger = async () => {
    try {
      const response = await ledgerService.getPublic({ limit: 50 });
      setEntries(response.data.entries);
    } catch (error) {
      console.error('Error loading ledger:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLedger();
    setRefreshing(false);
  };

  const formatAmount = (cents) => {
    const amount = Math.abs(cents) / 100;
    return `$${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffMins < 1440) {
      return `${Math.floor(diffMins / 60)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

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
      <View style={styles.header}>
        <Text style={styles.title}>📊 Public Ledger</Text>
        <Text style={styles.subtitle}>100% transparency, every transaction</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>

        {entries.map((entry) => (
          <View key={entry.id} style={styles.entryCard}>
            <View style={styles.entryHeader}>
              <View style={styles.entryLeft}>
                <Text style={styles.entryType}>
                  {entry.entryType === 'FUNDS_CAPTURED' ? '💚' : '🛒'}{' '}
                  {entry.entryType === 'FUNDS_CAPTURED'
                    ? 'Donation'
                    : 'Expense'}
                </Text>
                <Text style={styles.entryTime}>
                  {formatDate(entry.createdAt)}
                </Text>
              </View>
              <Text
                style={[
                  styles.entryAmount,
                  entry.amountCents < 0
                    ? styles.expenseAmount
                    : styles.donationAmount,
                ]}
              >
                {entry.amountCents < 0 ? '-' : '+'}
                {formatAmount(entry.amountCents)}
              </Text>
            </View>

            <Text style={styles.entryDescription}>{entry.description}</Text>

            <View style={styles.entryFooter}>
              <Text style={styles.orgName}>{entry.organization.name}</Text>
              <Text style={styles.balance}>
                Balance: {formatAmount(entry.balanceCents)}
              </Text>
            </View>

            {entry.category && (
              <Text style={styles.category}>
                Category: {entry.category.toUpperCase()}
              </Text>
            )}
          </View>
        ))}

        {entries.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        )}
      </View>
    </ScrollView>
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
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#10B981',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  entryCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  entryLeft: {
    flex: 1,
  },
  entryType: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  entryTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  entryAmount: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  donationAmount: {
    color: '#10B981',
  },
  expenseAmount: {
    color: '#EF4444',
  },
  entryDescription: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 12,
    lineHeight: 20,
  },
  entryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  orgName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  balance: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  category: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
});
