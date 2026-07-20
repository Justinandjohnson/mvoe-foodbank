// Donate Screen - Donation flow
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { organizationService, donationService } from '../api/services';
import StripePaymentForm from '../components/StripePaymentForm';

const AMOUNT_OPTIONS = [10, 25, 50, 100];

export default function DonateScreen({ navigation }) {
  const [selectedAmount, setSelectedAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState('');
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      const response = await organizationService.getAll();
      setOrganizations(response.data.organizations);
      if (response.data.organizations.length > 0) {
        setSelectedOrg(response.data.organizations[0]);
      }
    } catch (error) {
      console.error('Error loading organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAmount = () => {
    return customAmount ? parseFloat(customAmount) : selectedAmount;
  };

  const handleDonate = async () => {
    if (!selectedOrg) {
      Alert.alert('Error', 'Please select an organization');
      return;
    }

    const amount = getAmount();
    if (isNaN(amount) || amount < 1) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    // Show payment form
    setShowPaymentForm(true);
  };

  const handlePaymentSuccess = async (paymentMethodId) => {
    setProcessing(true);

    try {
      const amount = getAmount();

      // Create donation with Stripe payment method
      const response = await donationService.create({
        organizationId: selectedOrg.id,
        amountCents: Math.round(amount * 100),
        paymentMethodId,
        isAnonymous: false,
        isRecurring: false,
      });

      // Navigate to receipt screen
      navigation.navigate('DonationReceipt', {
        donationId: response.data.donation.id,
      });

      // Reset form
      resetForm();
      setShowPaymentForm(false);

    } catch (error) {
      Alert.alert('Error', 'Failed to process donation. Please try again.');
      console.error('Donation error:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handlePaymentError = (error) => {
    setProcessing(false);
    console.error('Payment error:', error);
  };

  const resetForm = () => {
    setSelectedAmount(25);
    setCustomAmount('');
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>💚 Make a Donation</Text>
        <Text style={styles.subtitle}>Every dollar makes a difference</Text>
      </View>

      <View style={styles.content}>
        {/* Amount Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>Choose Amount</Text>
          <View style={styles.amountGrid}>
            {AMOUNT_OPTIONS.map((amount) => (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.amountButton,
                  selectedAmount === amount &&
                    !customAmount &&
                    styles.amountButtonSelected,
                ]}
                onPress={() => {
                  setSelectedAmount(amount);
                  setCustomAmount('');
                }}
              >
                <Text
                  style={[
                    styles.amountText,
                    selectedAmount === amount &&
                      !customAmount &&
                      styles.amountTextSelected,
                  ]}
                >
                  ${amount}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Custom amount"
            keyboardType="numeric"
            value={customAmount}
            onChangeText={(text) => {
              setCustomAmount(text);
              setSelectedAmount(null);
            }}
          />
        </View>

        {/* Impact Preview */}
        <View style={styles.impactCard}>
          <Text style={styles.impactText}>
            💚 ${getAmount().toFixed(2)} = ~{Math.round(getAmount() * 2)} meals
          </Text>
        </View>

        {/* Organization Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>Choose Organization</Text>
          {organizations.length > 0 ? (
            organizations.map((org) => (
              <TouchableOpacity
                key={org.id}
                style={[
                  styles.orgOption,
                  selectedOrg?.id === org.id && styles.orgOptionSelected,
                ]}
                onPress={() => setSelectedOrg(org)}
              >
                <Text style={styles.orgName}>{org.name}</Text>
                <Text style={styles.orgLocation}>
                  {org.city}, {org.state}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyOrganizationsText}>
              No verified organizations are available right now.
            </Text>
          )}
        </View>

        {/* Donate Button */}
        <TouchableOpacity
          style={[styles.donateButton, processing && styles.donateButtonDisabled]}
          onPress={handleDonate}
          disabled={processing || !selectedOrg}
        >
          {processing ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.donateButtonText}>
              Donate ${getAmount().toFixed(2)} Now
            </Text>
          )}
        </TouchableOpacity>

        {/* Stripe Payment Form */}
        {showPaymentForm && selectedOrg && (
          <View style={styles.paymentFormContainer}>
            <StripePaymentForm
              amount={Math.round(getAmount() * 100)}
              organizationName={selectedOrg.name}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
              loading={processing}
            />

            <TouchableOpacity
              style={styles.cancelPaymentButton}
              onPress={() => setShowPaymentForm(false)}
            >
              <Text style={styles.cancelPaymentButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
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
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  amountButton: {
    flex: 1,
    minWidth: '22%',
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  amountButtonSelected: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  amountTextSelected: {
    color: '#10B981',
  },
  input: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 16,
  },
  impactCard: {
    backgroundColor: '#ECFDF5',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  impactText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
    textAlign: 'center',
  },
  orgOption: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  orgOptionSelected: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  orgName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  orgLocation: {
    fontSize: 14,
    color: '#6B7280',
  },
  emptyOrganizationsText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  donateButton: {
    backgroundColor: '#10B981',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  donateButtonDisabled: {
    opacity: 0.6,
  },
  donateButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginHint: {
    textAlign: 'center',
    color: '#6B7280',
    marginTop: 12,
    fontSize: 14,
  },

  // Payment Form
  paymentFormContainer: {
    marginTop: 16,
  },
  cancelPaymentButton: {
    backgroundColor: '#EF4444',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
    marginHorizontal: 16,
  },
  cancelPaymentButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
