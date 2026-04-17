// CreateEventScreen - Community meal event creation (Phase 3B)
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// DateTimePicker removed - not compatible with web
import { useAuth } from '../contexts/AuthContext';
import { communityService } from '../api/services';

export default function CreateEventScreen({ navigation }) {
  const { isAuthenticated } = useAuth();

  // Form state
  const [formData, setFormData] = useState({
    eventName: '',
    description: '',
    location: '',
    targetServings: '',
    budgetCents: '',
    maxVolunteers: '',
    isPublic: true,
  });

  // Date/time state - using string inputs for web compatibility
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const defaultTime = '12:00'; // Default to noon
  const [eventDate, setEventDate] = useState(today);
  const [startTime, setStartTime] = useState(defaultTime);
  const [endTime, setEndTime] = useState('13:00'); // 1 PM default

  // UI state
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({}); // Track which fields have been touched

  const validateForm = () => {
    const newErrors = {};

    if (!formData.eventName.trim()) {
      newErrors.eventName = 'Event name is required';
    }

    if (!formData.targetServings || isNaN(formData.targetServings) || parseInt(formData.targetServings) < 1) {
      newErrors.targetServings = 'Please enter a valid number of servings';
    }

    if (formData.budgetCents && (isNaN(formData.budgetCents) || parseFloat(formData.budgetCents) < 0)) {
      newErrors.budgetCents = 'Please enter a valid budget amount';
    }

    if (formData.maxVolunteers && (isNaN(formData.maxVolunteers) || parseInt(formData.maxVolunteers) < 1)) {
      newErrors.maxVolunteers = 'Please enter a valid number of volunteers';
    }

    // Time validation - compare time strings
    if (startTime >= endTime) {
      newErrors.endTime = 'End time must be after start time';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = async () => {
    console.log('🚀 handleCreate function called!');

    // Prevent multiple submissions
    if (loading) {
      console.log('Already creating event, ignoring duplicate click');
      return;
    }

    if (!isAuthenticated) {
      Alert.alert('Authentication Required', 'Please log in to create events.');
      return;
    }

    if (!validateForm()) {
      return;
    }

    console.log('Starting event creation...');
    setLoading(true);

    try {
      // Create ISO datetime strings from date and time inputs
      const eventDateTime = new Date(eventDate);

      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const startDateTime = new Date(eventDate);
      startDateTime.setHours(startHours, startMinutes, 0, 0);

      const [endHours, endMinutes] = endTime.split(':').map(Number);
      const endDateTime = new Date(eventDate);
      endDateTime.setHours(endHours, endMinutes, 0, 0);

      const eventData = {
        eventName: formData.eventName.trim(),
        description: formData.description.trim() || undefined,
        eventDate: eventDateTime.toISOString(),
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        location: formData.location.trim() || undefined,
        targetServings: parseInt(formData.targetServings),
        budgetCents: formData.budgetCents ? Math.round(parseFloat(formData.budgetCents) * 100) : undefined,
        maxVolunteers: formData.maxVolunteers ? parseInt(formData.maxVolunteers) : undefined,
        isPublic: formData.isPublic,
      };

      console.log('Creating event:', eventData);

      // Call API to create event
      const response = await communityService.createEvent(eventData);
      console.log('Event created successfully:', response);

      // Use window.alert for web compatibility
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Success! Your community event has been created successfully.');
        navigation.goBack();
      } else {
        Alert.alert(
          'Success!',
          'Your community event has been created successfully.',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }

    } catch (error) {
      console.error('Error creating event:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response,
        stack: error.stack
      });

      // Use window.alert for web compatibility in error case too
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Error: Failed to create event. Please try again.');
      } else {
        Alert.alert(
          'Error',
          'Failed to create event. Please try again.',
        );
      }
    } finally {
      console.log('Finished event creation attempt, setting loading to false');
      setLoading(false);
    }
  };

  const renderDateTimePickers = () => (
    <View style={styles.dateTimeSection}>
      <Text style={styles.sectionTitle}>📅 Event Schedule</Text>

      {/* Event Date */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Event Date</Text>
        <TextInput
          style={styles.textInput}
          value={eventDate}
          onChangeText={(date) => {
            setEventDate(date);
            setTouched({ ...touched, eventDate: true });
          }}
          placeholder="YYYY-MM-DD"
          keyboardType="default"
        />
      </View>

      {/* Start Time */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Start Time</Text>
        <TextInput
          style={styles.textInput}
          value={startTime}
          onChangeText={(time) => {
            setStartTime(time);
            setTouched({ ...touched, startTime: true });
          }}
          placeholder="HH:MM (24-hour format)"
          keyboardType="default"
        />
      </View>

      {/* End Time */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>End Time</Text>
        <TextInput
          style={[styles.textInput, errors.endTime && styles.inputError]}
          value={endTime}
          onChangeText={(time) => {
            setEndTime(time);
            setTouched({ ...touched, endTime: true });
          }}
          placeholder="HH:MM (24-hour format)"
          keyboardType="default"
        />
        {touched.endTime && errors.endTime && <Text style={styles.errorText}>{errors.endTime}</Text>}
      </View>
    </View>
  );

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="lock-closed" size={48} color="#6B7280" />
        <Text style={styles.authMessage}>Please log in to create events</Text>
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
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Community Event</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Basic Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 Basic Information</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Event Name *</Text>
            <TextInput
              style={[styles.textInput, touched.eventName && errors.eventName && styles.inputError]}
              placeholder="Community Cookout, Holiday Meal, etc."
              value={formData.eventName}
              onChangeText={(text) => {
                setFormData({ ...formData, eventName: text });
                setTouched({ ...touched, eventName: true });
              }}
              maxLength={100}
            />
            {touched.eventName && errors.eventName && <Text style={styles.errorText}>{errors.eventName}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.textAreaInput]}
              placeholder="Describe your event, menu, special requirements, etc."
              value={formData.description}
              onChangeText={(text) => setFormData({ ...formData, description: text })}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
            <Text style={styles.charCount}>{formData.description.length}/500</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Address or venue name"
              value={formData.location}
              onChangeText={(text) => setFormData({ ...formData, location: text })}
            />
          </View>
        </View>

        {/* Date and Time */}
        {renderDateTimePickers()}

        {/* Event Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👥 Event Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Target Servings *</Text>
            <TextInput
              style={[styles.textInput, touched.targetServings && errors.targetServings && styles.inputError]}
              placeholder="How many people will this serve?"
              value={formData.targetServings}
              onChangeText={(text) => {
                setFormData({ ...formData, targetServings: text });
                setTouched({ ...touched, targetServings: true });
              }}
              keyboardType="numeric"
            />
            {touched.targetServings && errors.targetServings && <Text style={styles.errorText}>{errors.targetServings}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Budget (USD)</Text>
            <TextInput
              style={[styles.textInput, touched.budgetCents && errors.budgetCents && styles.inputError]}
              placeholder="0.00"
              value={formData.budgetCents}
              onChangeText={(text) => {
                setFormData({ ...formData, budgetCents: text });
                setTouched({ ...touched, budgetCents: true });
              }}
              keyboardType="decimal-pad"
            />
            {touched.budgetCents && errors.budgetCents && <Text style={styles.errorText}>{errors.budgetCents}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Max Volunteers</Text>
            <TextInput
              style={[styles.textInput, touched.maxVolunteers && errors.maxVolunteers && styles.inputError]}
              placeholder="Leave empty for unlimited"
              value={formData.maxVolunteers}
              onChangeText={(text) => {
                setFormData({ ...formData, maxVolunteers: text });
                setTouched({ ...touched, maxVolunteers: true });
              }}
              keyboardType="numeric"
            />
            {touched.maxVolunteers && errors.maxVolunteers && <Text style={styles.errorText}>{errors.maxVolunteers}</Text>}
          </View>
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔒 Privacy Settings</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Public Event</Text>
              <Text style={styles.switchDescription}>
                Make this event visible to all community members
              </Text>
            </View>
            <Switch
              value={formData.isPublic}
              onValueChange={(value) => setFormData({ ...formData, isPublic: value })}
              trackColor={{ false: '#E5E7EB', true: '#10B981' }}
              thumbColor={formData.isPublic ? '#ffffff' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.createButton, loading && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading ? (
              <Text style={styles.createButtonText}>Creating...</Text>
            ) : (
              <>
                <Ionicons name="add-circle" size={20} color="white" />
                <Text style={styles.createButtonText}>Create Event</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPadding} />
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    flex: 1,
  },

  // Auth
  authMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
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
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: 'white',
    marginTop: 12,
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },

  // Form
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  textAreaInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
  charCount: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
    marginTop: 4,
  },

  // Date/Time
  dateTimeSection: {
    backgroundColor: 'white',
    marginTop: 12,
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  dateTimeText: {
    fontSize: 16,
    color: '#111827',
    marginLeft: 8,
  },

  // Switch
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchInfo: {
    flex: 1,
    marginRight: 16,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  switchDescription: {
    fontSize: 14,
    color: '#6B7280',
  },

  // Actions
  actionSection: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  createButton: {
    flex: 2,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  bottomPadding: {
    height: 40,
  },
});