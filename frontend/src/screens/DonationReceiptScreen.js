// DonationReceiptScreen - Show donation confirmation and receipt
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { donationService } from '../api/services';

export default function DonationReceiptScreen({ route, navigation }) {
  const { donationId } = route.params;
  const [donation, setDonation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDonation();
  }, [donationId]);

  const loadDonation = async () => {
    try {
      const response = await donationService.getById(donationId);
      setDonation(response.data.donation);
    } catch (error) {
      console.error('Error loading donation:', error);
      Alert.alert('Error', 'Failed to load donation details');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!donation) return;

    try {
      const message = `🎉 I just donated $${(donation.amountCents / 100).toFixed(2)} to ${donation.organization.name}!

Every dollar helps provide meals to families in need. Join me in making a difference!

#FoodBankDonation #CommunitySupport #Mvoe`;

      await Share.share({
        message,
        title: 'My Food Bank Donation',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getEstimatedMeals = (amountCents) => {
    // Estimate ~2 meals per dollar donated
    return Math.round((amountCents / 100) * 2);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading receipt...</Text>
      </View>
    );
  }

  if (!donation) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color="#EF4444" />
        <Text style={styles.errorText}>Receipt not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Success Header */}
      <View style={styles.successHeader}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={40} color="white" />
        </View>
        <Text style={styles.successTitle}>Thank You!</Text>
        <Text style={styles.successSubtitle}>Your donation has been processed</Text>
      </View>

      {/* Receipt Details */}
      <View style={styles.receiptContainer}>
        <View style={styles.receiptHeader}>
          <Text style={styles.receiptTitle}>Donation Receipt</Text>
          <Text style={styles.receiptId}>ID: {donation.id.slice(0, 8)}</Text>
        </View>

        <View style={styles.receiptDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Amount</Text>
            <Text style={styles.detailValue}>
              ${(donation.amountCents / 100).toFixed(2)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Recipient</Text>
            <Text style={styles.detailValue}>{donation.organization.name}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date</Text>
            <Text style={styles.detailValue}>
              {formatDate(donation.createdAt)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status</Text>
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.detailValue, { color: '#10B981' }]}>
                Completed
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Payment Method</Text>
            <Text style={styles.detailValue}>Credit Card ••••4242</Text>
          </View>
        </View>

        {/* Impact Section */}
        <View style={styles.impactSection}>
          <Text style={styles.impactTitle}>🍽️ Your Impact</Text>
          <View style={styles.impactStats}>
            <View style={styles.impactStat}>
              <Text style={styles.impactNumber}>
                {getEstimatedMeals(donation.amountCents)}
              </Text>
              <Text style={styles.impactLabel}>Meals Provided</Text>
            </View>
            <View style={styles.impactStat}>
              <Text style={styles.impactNumber}>
                {Math.ceil(getEstimatedMeals(donation.amountCents) / 3)}
              </Text>
              <Text style={styles.impactLabel}>Families Helped</Text>
            </View>
          </View>
          <Text style={styles.impactDescription}>
            Your donation helps provide nutritious meals to families in need in your community.
          </Text>
        </View>

        {/* Tax Information */}
        <View style={styles.taxSection}>
          <Text style={styles.taxTitle}>📄 Tax Information</Text>
          <Text style={styles.taxText}>
            This donation is tax-deductible. {donation.organization.name} is a registered
            501(c)(3) nonprofit organization. Keep this receipt for your tax records.
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color="#10B981" />
          <Text style={styles.shareButtonText}>Share Your Impact</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.donateAgainButton}
          onPress={() => navigation.navigate('Donate')}
        >
          <Ionicons name="heart" size={20} color="white" />
          <Text style={styles.donateAgainButtonText}>Donate Again</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.homeButtonText}>Return to Home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#EF4444',
    marginTop: 16,
    marginBottom: 20,
  },

  // Success Header
  successHeader: {
    backgroundColor: '#10B981',
    paddingTop: 60,
    paddingBottom: 40,
    alignItems: 'center',
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
  },

  // Receipt
  receiptContainer: {
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  receiptTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  receiptId: {
    fontSize: 14,
    color: '#6B7280',
  },
  receiptDetails: {
    paddingVertical: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  detailLabel: {
    fontSize: 16,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },

  // Impact Section
  impactSection: {
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    padding: 16,
    marginVertical: 20,
  },
  impactTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#065F46',
    marginBottom: 16,
    textAlign: 'center',
  },
  impactStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  impactStat: {
    alignItems: 'center',
  },
  impactNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#10B981',
  },
  impactLabel: {
    fontSize: 14,
    color: '#065F46',
    marginTop: 4,
  },
  impactDescription: {
    fontSize: 14,
    color: '#047857',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Tax Section
  taxSection: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 16,
  },
  taxTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 8,
  },
  taxText: {
    fontSize: 14,
    color: '#B45309',
    lineHeight: 20,
  },

  // Action Buttons
  actionButtons: {
    padding: 16,
    gap: 12,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 8,
  },
  donateAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 8,
  },
  donateAgainButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },

  // Footer
  footer: {
    padding: 16,
  },
  homeButton: {
    alignItems: 'center',
    padding: 16,
  },
  homeButtonText: {
    fontSize: 16,
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
  backButton: {
    backgroundColor: '#10B981',
    padding: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});