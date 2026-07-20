import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { communityService } from '../api/services';

const EVENT_TYPES = [
  { key: 'community_meal', label: 'Community meal', icon: 'restaurant', color: '#10B981' },
  { key: 'potluck', label: 'Potluck', icon: 'people', color: '#0EA5E9' },
  { key: 'barbecue', label: 'Barbecue', icon: 'flame', color: '#F97316' },
  { key: 'distribution', label: 'Distribution', icon: 'cube', color: '#8B5CF6' },
  { key: 'other', label: 'Other', icon: 'calendar', color: '#64748B' },
];

function formatCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(6) : '';
}

async function getCurrentLocation() {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
        reject,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Location permission was denied');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

function isLocationDeniedError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return error?.code === 1 || message.includes('denied') || message.includes('permission');
}

function showMessage(title, message, onPress) {
  if (typeof window !== 'undefined' && window.alert) {
    window.alert(`${title}: ${message}`);
    if (onPress) onPress();
    return;
  }

  Alert.alert(title, message, onPress ? [{ text: 'OK', onPress }] : undefined);
}

export default function CreateEventScreen({ navigation, route }) {
  const initialLocation = route?.params?.initialLocation || null;
  const initialDraft = route?.params?.initialDraft || null;
  const editingEventId = route?.params?.eventId || null;
  const editingEvent = route?.params?.event || null;

  const [formData, setFormData] = useState({
    eventName: '',
    eventType: 'community_meal',
    description: '',
    location: '',
    targetServings: '',
    budgetCents: '',
    maxVolunteers: '',
    latitude: '',
    longitude: '',
    isPublic: true,
  });
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('14:00');
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!initialLocation) return;

    setFormData((current) => ({
      ...current,
      latitude: current.latitude || formatCoordinate(initialLocation.latitude),
      longitude: current.longitude || formatCoordinate(initialLocation.longitude),
    }));
  }, [initialLocation]);

  useEffect(() => {
    if (!initialDraft) return;

    setFormData((current) => ({
      ...current,
      eventName: current.eventName || initialDraft.eventName || '',
      eventType: current.eventType === 'community_meal'
        ? (initialDraft.eventType || current.eventType)
        : current.eventType,
      description: current.description || initialDraft.description || '',
      location: current.location || initialDraft.location || '',
      latitude: current.latitude || formatCoordinate(initialDraft.latitude),
      longitude: current.longitude || formatCoordinate(initialDraft.longitude),
    }));
  }, [initialDraft]);

  useEffect(() => {
    if (!editingEvent) return;

    setFormData((current) => ({
      ...current,
      eventName: editingEvent.eventName || current.eventName,
      eventType: editingEvent.eventType || current.eventType,
      description: editingEvent.description || current.description,
      location: editingEvent.location || current.location,
      targetServings: editingEvent.targetServings ? String(editingEvent.targetServings) : current.targetServings,
      budgetCents: typeof editingEvent.budgetCents === 'number'
        ? String(editingEvent.budgetCents / 100)
        : current.budgetCents,
      maxVolunteers: editingEvent.maxVolunteers ? String(editingEvent.maxVolunteers) : current.maxVolunteers,
      latitude: current.latitude || formatCoordinate(editingEvent.latitude),
      longitude: current.longitude || formatCoordinate(editingEvent.longitude),
      isPublic: typeof editingEvent.isPublic === 'boolean' ? editingEvent.isPublic : current.isPublic,
    }));

    if (editingEvent.eventDate) {
      setEventDate(new Date(editingEvent.eventDate).toISOString().split('T')[0]);
    }

    if (editingEvent.startTime) {
      const start = new Date(editingEvent.startTime);
      setStartTime(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`);
    }

    if (editingEvent.endTime) {
      const end = new Date(editingEvent.endTime);
      setEndTime(`${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`);
    }
  }, [editingEvent]);

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, coordinates: undefined }));
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!formData.eventName.trim()) {
      nextErrors.eventName = 'Event name is required';
    }

    if (!formData.targetServings || Number.isNaN(Number(formData.targetServings)) || Number(formData.targetServings) < 1) {
      nextErrors.targetServings = 'Enter a valid number of servings';
    }

    if (formData.budgetCents && (Number.isNaN(Number(formData.budgetCents)) || Number(formData.budgetCents) < 0)) {
      nextErrors.budgetCents = 'Enter a valid budget amount';
    }

    if (formData.maxVolunteers && (Number.isNaN(Number(formData.maxVolunteers)) || Number(formData.maxVolunteers) < 1)) {
      nextErrors.maxVolunteers = 'Enter a valid volunteer count';
    }

    if (startTime >= endTime) {
      nextErrors.endTime = 'End time must be after start time';
    }

    const hasLatitude = formData.latitude.trim().length > 0;
    const hasLongitude = formData.longitude.trim().length > 0;

    if ((hasLatitude && !hasLongitude) || (!hasLatitude && hasLongitude)) {
      nextErrors.coordinates = 'Add both latitude and longitude to place this event on the map';
    }

    if (hasLatitude) {
      const latitude = Number(formData.latitude);
      const longitude = Number(formData.longitude);

      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        nextErrors.coordinates = 'Latitude must be between -90 and 90';
      }

      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        nextErrors.coordinates = 'Longitude must be between -180 and 180';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleUseMyLocation = async () => {
    setLocating(true);

    try {
      const location = await getCurrentLocation();
      setFormData((current) => ({
        ...current,
        latitude: formatCoordinate(location.latitude),
        longitude: formatCoordinate(location.longitude),
      }));
      setErrors((current) => ({ ...current, coordinates: undefined }));
    } catch (error) {
      if (!isLocationDeniedError(error)) {
        console.error('Error getting event location:', error);
      }
      showMessage(
        'Location unavailable',
        'Enable location access or enter coordinates manually so the event can show on the map.'
      );
    } finally {
      setLocating(false);
    }
  };

  const handleCreate = async () => {
    if (loading) return;

    if (!validateForm()) return;

    setLoading(true);

    try {
      const eventDateTime = new Date(eventDate);

      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const startDateTime = new Date(eventDate);
      startDateTime.setHours(startHours, startMinutes, 0, 0);

      const [endHours, endMinutes] = endTime.split(':').map(Number);
      const endDateTime = new Date(eventDate);
      endDateTime.setHours(endHours, endMinutes, 0, 0);

      const hasCoordinates = formData.latitude.trim() && formData.longitude.trim();

      const payload = {
        eventName: formData.eventName.trim(),
        eventType: formData.eventType,
        description: formData.description.trim() || undefined,
        eventDate: eventDateTime.toISOString(),
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        location: formData.location.trim() || undefined,
        latitude: hasCoordinates ? Number(formData.latitude) : undefined,
        longitude: hasCoordinates ? Number(formData.longitude) : undefined,
        targetServings: parseInt(formData.targetServings, 10),
        budgetCents: formData.budgetCents
          ? Math.round(parseFloat(formData.budgetCents) * 100)
          : undefined,
        maxVolunteers: formData.maxVolunteers
          ? parseInt(formData.maxVolunteers, 10)
          : undefined,
        isPublic: formData.isPublic,
      };

      if (editingEventId) {
        await communityService.updateEvent(editingEventId, payload);
      } else {
        await communityService.createEvent(payload);
      }

      showMessage(
        'Success',
        editingEventId ? 'Your food gathering has been updated.' : 'Your food gathering has been created.',
        () => navigation.goBack()
      );
    } catch (error) {
      console.error('Error saving community event:', error);
      showMessage('Error', editingEventId ? 'Failed to update the event. Please try again.' : 'Failed to create the event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const hasCoordinates = formData.latitude.trim() && formData.longitude.trim();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#06131F', '#0C2235', '#123047']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="white" />
        </TouchableOpacity>

        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>Map-connected gathering</Text>
          <Text style={styles.heroTitle}>
            {editingEventId
              ? 'Update a public meal that already lives on MVOE’s live map.'
              : 'Create a public meal that can show up on MVOE’s live map.'}
          </Text>
          <Text style={styles.heroText}>
            Add the event type, timing, and coordinates so neighbors can see where the food is happening.
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.glassCard}>
          <Text style={styles.sectionTitle}>Event type</Text>
          <View style={styles.typeGrid}>
            {EVENT_TYPES.map((option) => {
              const active = formData.eventType === option.key;

              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.typeCard,
                    active && {
                      borderColor: option.color,
                      backgroundColor: `${option.color}12`,
                    },
                  ]}
                  onPress={() => updateField('eventType', option.key)}
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={active ? option.color : '#64748B'}
                  />
                  <Text style={[styles.typeCardTitle, active && { color: option.color }]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.glassCard}>
          <Text style={styles.sectionTitle}>Basic details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Event name</Text>
            <TextInput
              style={[styles.input, errors.eventName && styles.inputError]}
              value={formData.eventName}
              onChangeText={(text) => updateField('eventName', text)}
              placeholder="Neighborhood cookout, pop-up pantry, Sunday potluck"
              placeholderTextColor="#94A3B8"
            />
            {errors.eventName ? <Text style={styles.errorText}>{errors.eventName}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              value={formData.description}
              onChangeText={(text) => updateField('description', text)}
              placeholder="Share the menu, serving plan, or pickup details."
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location name or address</Text>
            <TextInput
              style={styles.input}
              value={formData.location}
              onChangeText={(text) => updateField('location', text)}
              placeholder="Church parking lot, community center, 123 Main St"
              placeholderTextColor="#94A3B8"
            />
          </View>
        </View>

        <View style={styles.glassCard}>
          <Text style={styles.sectionTitle}>Schedule</Text>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.rowItem]}>
              <Text style={styles.label}>Date</Text>
              <TextInput
                style={styles.input}
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <View style={[styles.inputGroup, styles.rowItem]}>
              <Text style={styles.label}>Start</Text>
              <TextInput
                style={styles.input}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="HH:MM"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <View style={[styles.inputGroup, styles.rowItem]}>
              <Text style={styles.label}>End</Text>
              <TextInput
                style={[styles.input, errors.endTime && styles.inputError]}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="HH:MM"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          {errors.endTime ? <Text style={styles.errorText}>{errors.endTime}</Text> : null}
        </View>

        <View style={styles.glassCard}>
          <Text style={styles.sectionTitle}>Capacity</Text>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.rowItem]}>
              <Text style={styles.label}>Target servings</Text>
              <TextInput
                style={[styles.input, errors.targetServings && styles.inputError]}
                value={formData.targetServings}
                onChangeText={(text) => updateField('targetServings', text)}
                placeholder="150"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
              />
              {errors.targetServings ? <Text style={styles.errorText}>{errors.targetServings}</Text> : null}
            </View>

            <View style={[styles.inputGroup, styles.rowItem]}>
              <Text style={styles.label}>Budget (USD)</Text>
              <TextInput
                style={[styles.input, errors.budgetCents && styles.inputError]}
                value={formData.budgetCents}
                onChangeText={(text) => updateField('budgetCents', text)}
                placeholder="0.00"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
              />
              {errors.budgetCents ? <Text style={styles.errorText}>{errors.budgetCents}</Text> : null}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Max volunteers</Text>
            <TextInput
              style={[styles.input, errors.maxVolunteers && styles.inputError]}
              value={formData.maxVolunteers}
              onChangeText={(text) => updateField('maxVolunteers', text)}
              placeholder="Leave blank for open signup"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
            />
            {errors.maxVolunteers ? <Text style={styles.errorText}>{errors.maxVolunteers}</Text> : null}
          </View>
        </View>

        <View style={styles.glassCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Map visibility</Text>
              <Text style={styles.sectionMeta}>
                Coordinates are what place this event on the live map for food seekers.
              </Text>
            </View>

            <TouchableOpacity style={styles.secondaryButton} onPress={handleUseMyLocation}>
              {locating ? (
                <ActivityIndicator size="small" color="#0F172A" />
              ) : (
                <>
                  <Ionicons name="locate" size={16} color="#0F172A" />
                  <Text style={styles.secondaryButtonText}>Use my location</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.rowItem]}>
              <Text style={styles.label}>Latitude</Text>
              <TextInput
                style={[styles.input, errors.coordinates && styles.inputError]}
                value={formData.latitude}
                onChangeText={(text) => updateField('latitude', text)}
                placeholder="37.774900"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
              />
            </View>

            <View style={[styles.inputGroup, styles.rowItem]}>
              <Text style={styles.label}>Longitude</Text>
              <TextInput
                style={[styles.input, errors.coordinates && styles.inputError]}
                value={formData.longitude}
                onChangeText={(text) => updateField('longitude', text)}
                placeholder="-122.419400"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {errors.coordinates ? <Text style={styles.errorText}>{errors.coordinates}</Text> : null}

          <View style={[styles.mapStatus, hasCoordinates ? styles.mapReady : styles.mapPending]}>
            <Ionicons
              name={hasCoordinates ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={hasCoordinates ? '#047857' : '#B45309'}
            />
            <Text style={[styles.mapStatusText, hasCoordinates ? styles.mapReadyText : styles.mapPendingText]}>
              {hasCoordinates
                ? 'This event is ready to appear on the public map.'
                : 'Without coordinates, this event can be public but it will not appear on the live map.'}
            </Text>
          </View>
        </View>

        <View style={styles.glassCard}>
          <View style={styles.privacyRow}>
            <View style={styles.privacyCopy}>
              <Text style={styles.sectionTitle}>Public event</Text>
              <Text style={styles.sectionMeta}>
                Keep this on if the event should be visible to neighbors and discoverable on the map.
              </Text>
            </View>

            <Switch
              value={formData.isPublic}
              onValueChange={(value) => updateField('isPublic', value)}
              trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name={editingEventId ? 'save' : 'add-circle'} size={18} color="white" />
                <Text style={styles.primaryButtonText}>{editingEventId ? 'Save event' : 'Create event'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#EEF4F8',
  },
  headerGradient: {
    paddingTop: Platform.OS === 'web' ? 28 : 54,
    paddingHorizontal: 18,
    paddingBottom: 26,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginBottom: 18,
  },
  heroCopy: {
    maxWidth: 620,
  },
  heroEyebrow: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  heroTitle: {
    color: 'white',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    marginBottom: 10,
  },
  heroText: {
    color: '#DBEAFE',
    fontSize: 15,
    lineHeight: 22,
  },
  scrollView: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  content: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 42,
    gap: 14,
  },
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionMeta: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D9E2EC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#0F172A',
    fontSize: 15,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeCard: {
    minWidth: 130,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  typeCardTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D9E2EC',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  mapStatus: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 2,
  },
  mapReady: {
    backgroundColor: '#ECFDF5',
  },
  mapPending: {
    backgroundColor: '#FFF7ED',
  },
  mapStatusText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  mapReadyText: {
    color: '#047857',
  },
  mapPendingText: {
    color: '#B45309',
  },
  privacyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
  },
  privacyCopy: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingVertical: 14,
    backgroundColor: '#E2E8F0',
  },
  cancelButtonText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F766E',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
