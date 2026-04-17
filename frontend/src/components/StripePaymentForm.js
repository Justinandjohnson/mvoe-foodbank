// StripePaymentForm - Proper Stripe Elements integration for React Native Web
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';

// Stripe integration for web only
let stripe = null;
let Elements = null;
let CardElement = null;
let useStripe = null;
let useElements = null;

if (Platform.OS === 'web') {
  // Dynamic imports for web-only Stripe components
  Promise.all([
    import('@stripe/stripe-js').then(module => module.loadStripe),
    import('@stripe/react-stripe-js')
  ]).then(([loadStripe, stripeReact]) => {
    stripe = loadStripe;
    Elements = stripeReact.Elements;
    CardElement = stripeReact.CardElement;
    useStripe = stripeReact.useStripe;
    useElements = stripeReact.useElements;
  });
}

// Inner payment form component that uses Stripe hooks
const PaymentFormInner = ({ amount, organizationName, onSuccess, onError, loading }) => {
  const stripeInstance = useStripe ? useStripe() : null;
  const elements = useElements ? useElements() : null;
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [cardComplete, setCardComplete] = useState(false);

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#32325d',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSmoothing: 'antialiased',
        '::placeholder': {
          color: '#aab7c4',
        },
      },
      invalid: {
        color: '#fa755a',
        iconColor: '#fa755a',
      },
    },
    hidePostalCode: false,
  };

  const handleCardChange = (event) => {
    setError(event.error ? event.error.message : null);
    setCardComplete(event.complete);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripeInstance || !elements) {
      Alert.alert('Error', 'Payment system not ready. Please try again.');
      return;
    }

    if (!cardComplete) {
      Alert.alert('Error', 'Please complete your card information.');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const cardElement = elements.getElement(CardElement);

      // Create payment method with Stripe Elements (secure)
      const { error, paymentMethod } = await stripeInstance.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          name: 'Donor', // Could be made dynamic if needed
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      // Pass payment method ID to parent component
      if (onSuccess) {
        onSuccess(paymentMethod.id);
      }

    } catch (err) {
      console.error('Payment error:', err);
      setError(err.message);
      Alert.alert('Payment Failed', err.message || 'Please check your card details and try again.');

      if (onError) {
        onError(err);
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={webStyles.container}>
      <h3 style={webStyles.title}>💳 Payment Details</h3>
      <p style={webStyles.subtitle}>
        Securely donate ${(amount / 100).toFixed(2)} to {organizationName}
      </p>

      <form onSubmit={handleSubmit}>
        <div style={webStyles.formSection}>
          <label style={webStyles.label}>Credit or Debit Card</label>
          <div style={webStyles.cardElementContainer}>
            {CardElement && (
              <CardElement
                options={cardElementOptions}
                onChange={handleCardChange}
              />
            )}
          </div>
        </div>

        {error && (
          <div style={webStyles.errorMessage}>{error}</div>
        )}

        <button
          type="submit"
          disabled={!stripeInstance || processing || loading || !cardComplete}
          style={{
            ...webStyles.payButton,
            opacity: (!stripeInstance || processing || loading || !cardComplete) ? 0.6 : 1,
          }}
        >
          {processing || loading ? 'Processing...' : `Pay $${(amount / 100).toFixed(2)} Now`}
        </button>
      </form>

      <p style={webStyles.securityNote}>
        🔒 Your payment is secured by 256-bit SSL encryption
      </p>

      <div style={webStyles.testCardNotice}>
        <p style={webStyles.testCardTitle}>🧪 Test Mode</p>
        <p style={webStyles.testCardText}>
          Use card 4242 4242 4242 4242 for testing
        </p>
      </div>
    </div>
  );
};

// Main component that provides Stripe Elements context
export default function StripePaymentForm({
  amount,
  organizationName,
  onSuccess,
  onError,
  loading = false,
}) {
  const [stripePromise, setStripePromise] = useState(null);
  const [elementsReady, setElementsReady] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Initialize Stripe with publishable key
      const initStripe = async () => {
        try {
          const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
            'YOUR_STRIPE_PUBLISHABLE_KEY'; // Test key matching backend

          const stripeInstance = await stripe(publishableKey);
          setStripePromise(stripeInstance);

          // Wait a bit for Elements to be ready
          setTimeout(() => setElementsReady(true), 100);
        } catch (error) {
          console.error('Failed to initialize Stripe:', error);
          Alert.alert('Error', 'Payment system failed to initialize.');
        }
      };

      // Check if Stripe modules are loaded
      const checkStripeLoaded = setInterval(() => {
        if (stripe && Elements && CardElement && useStripe && useElements) {
          initStripe();
          clearInterval(checkStripeLoaded);
        }
      }, 100);

      return () => clearInterval(checkStripeLoaded);
    }
  }, []);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.mobileContainer}>
        <Text style={styles.mobileText}>
          💳 Payment processing requires web browser
        </Text>
        <Text style={styles.mobileSubtext}>
          Please visit our website to complete your donation
        </Text>
      </View>
    );
  }

  if (!stripePromise || !elementsReady || !Elements) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading payment form...</Text>
      </View>
    );
  }

  const elementsOptions = {
    mode: 'payment',
    amount: amount,
    currency: 'usd',
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#10B981',
        colorBackground: '#ffffff',
        colorText: '#30313d',
        colorDanger: '#df1b41',
        fontFamily: 'system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: '8px',
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <PaymentFormInner
        amount={amount}
        organizationName={organizationName}
        onSuccess={onSuccess}
        onError={onError}
        loading={loading}
      />
    </Elements>
  );
}

// React Native styles
const styles = StyleSheet.create({
  mobileContainer: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 20,
    margin: 16,
    alignItems: 'center',
  },
  mobileText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    textAlign: 'center',
    marginBottom: 8,
  },
  mobileSubtext: {
    fontSize: 14,
    color: '#B45309',
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
});

// Web-specific styles (CSS-in-JS for web)
const webStyles = {
  container: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    margin: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  title: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: '4px',
    marginTop: '0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6B7280',
    marginBottom: '24px',
    marginTop: '0',
  },
  formSection: {
    marginBottom: '16px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
    display: 'block',
  },
  cardElementContainer: {
    border: '1px solid #D1D5DB',
    borderRadius: '8px',
    padding: '12px',
    backgroundColor: '#F9FAFB',
  },
  errorMessage: {
    color: '#EF4444',
    fontSize: '14px',
    marginBottom: '16px',
  },
  payButton: {
    backgroundColor: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '16px',
    fontSize: '18px',
    fontWeight: 'bold',
    width: '100%',
    cursor: 'pointer',
    marginTop: '8px',
  },
  securityNote: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#6B7280',
    marginTop: '16px',
    marginBottom: '0',
  },
  testCardNotice: {
    backgroundColor: '#EEF2FF',
    borderRadius: '8px',
    padding: '12px',
    marginTop: '16px',
  },
  testCardTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#4338CA',
    marginBottom: '4px',
    marginTop: '0',
  },
  testCardText: {
    fontSize: '12px',
    color: '#6366F1',
    marginBottom: '0',
  },
};