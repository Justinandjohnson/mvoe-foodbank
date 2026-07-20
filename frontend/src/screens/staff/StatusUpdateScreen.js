import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { foodBankService } from '../../api/services';
import AppScreenBackground from '../../components/ui/AppScreenBackground';
import GlassSurface from '../../components/ui/GlassSurface';

export default function StatusUpdateScreen({ navigation }) {
  const { user } = useAuth();
  const organizationId = user?.organizationId || null;
  const [formData, setFormData] = useState({
    foodAvailable: 'available',
    waitTimeMinutes: '',
    capacityPercentage: '',
    notes: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadCurrentStatus = async () => {
      if (!organizationId) {
        setLoading(false);
        return;
      }

      try {
        const response = await foodBankService.getById(organizationId);
        const foodBank = response.data?.foodBank;
        const status = foodBank?.status || {};

        setFormData({
          foodAvailable: status.foodAvailable || 'available',
          waitTimeMinutes: status.waitTimeMinutes != null ? String(status.waitTimeMinutes) : '',
          capacityPercentage: status.capacityPercentage != null ? String(status.capacityPercentage) : '',
          notes: status.notes || '',
        });
      } catch (error) {
        console.error('Error loading current food bank status:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCurrentStatus();
  }, [organizationId]);

  const handleSubmit = async () => {
    if (!organizationId) {
      Alert.alert('No organization linked', 'Your account is not linked to a food bank organization yet.');
      return;
    }

    setSaving(true);
    try {
      await foodBankService.updateStatus(organizationId, {
        foodAvailable: formData.foodAvailable,
        waitTimeMinutes: formData.waitTimeMinutes ? parseInt(formData.waitTimeMinutes, 10) : null,
        capacityPercentage: formData.capacityPercentage ? parseInt(formData.capacityPercentage, 10) : null,
        notes: formData.notes || null,
      });

      Alert.alert('Status updated', 'The live food bank status was updated successfully.');
      navigation.goBack();
    } catch (error) {
      console.error('Error updating food bank status:', error);
      Alert.alert('Update failed', 'Could not update the live status right now.');
    } finally {
      setSaving(false);
    }
  };

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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <GlassSurface preset="dark" style={styles.heroCard} padding={20}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="white" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Update live status</Text>
          <Text style={styles.heroBody}>
            This writes directly to the food bank status record used across the app.
          </Text>
        </GlassSurface>

        <GlassSurface style={styles.formCard}>
          {!organizationId ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={18} color="#F59E0B" />
              <Text style={styles.emptyStateText}>Your account is not linked to an organization yet.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Availability</Text>
              <View style={styles.pickerWrap}>
                <Picker
                  selectedValue={formData.foodAvailable}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, foodAvailable: value }))}
                >
                  <Picker.Item label="Food available" value="available" />
                  <Picker.Item label="Low stock" value="low" />
                  <Picker.Item label="Out of stock" value="out" />
                  <Picker.Item label="Status unknown" value="unknown" />
                </Picker>
              </View>

              <Text style={styles.sectionTitle}>Wait time (minutes)</Text>
              <TextInput
                style={styles.input}
                value={formData.waitTimeMinutes}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, waitTimeMinutes: value }))}
                placeholder="e.g. 15"
                keyboardType="numeric"
              />

              <Text style={styles.sectionTitle}>Capacity (%)</Text>
              <TextInput
                style={styles.input}
                value={formData.capacityPercentage}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, capacityPercentage: value }))}
                placeholder="e.g. 75"
                keyboardType="numeric"
              />

              <Text style={styles.sectionTitle}>Notes</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={formData.notes}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, notes: value }))}
                placeholder="Additional information for visitors..."
                multiline
                numberOfLines={4}
              />

              <TouchableOpacity
                style={[styles.submitButton, saving && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="checkmark-circle" size={18} color="white" />
                )}
                <Text style={styles.submitButtonText}>Update live status</Text>
              </TouchableOpacity>
            </>
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
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 12,
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
  formCard: {
    gap: 12,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  pickerWrap: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
    overflow: 'hidden',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: '#0F172A',
  },
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F766E',
    borderRadius: 18,
    paddingVertical: 14,
  },
  submitButtonDisabled: {
    opacity: 0.72,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyStateText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
});
