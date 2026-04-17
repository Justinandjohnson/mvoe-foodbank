// StatusUpdateScreen - Update food bank status
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../../contexts/AuthContext';
import { foodBankService } from '../../api/services';

export default function StatusUpdateScreen({ navigation }) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    foodAvailable: 'available',
    waitTimeMinutes: '',
    capacityPercentage: '',
    notes: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      // For now, update a placeholder food bank (in real app, would get user's org ID)
      await foodBankService.updateStatus('dcdb68d2-ce31-4565-80d8-fea28a427b24', {
        foodAvailable: formData.foodAvailable,
        waitTimeMinutes: formData.waitTimeMinutes ? parseInt(formData.waitTimeMinutes) : null,
        capacityPercentage: formData.capacityPercentage ? parseInt(formData.capacityPercentage) : null,
        notes: formData.notes || null,
      });

      Alert.alert('Success', 'Status updated successfully!');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to update status. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Update Food Bank Status</Text>
        <Text style={styles.subtitle}>
          Update current availability and wait times for visitors
        </Text>

        {/* Food Availability */}
        <View style={styles.section}>
          <Text style={styles.label}>Food Availability</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={formData.foodAvailable}
              onValueChange={(value) => setFormData(prev => ({ ...prev, foodAvailable: value }))}
              style={styles.picker}
            >
              <Picker.Item label="✅ Food Available" value="available" />
              <Picker.Item label="🟠 Low Stock" value="low" />
              <Picker.Item label="❌ Out of Stock" value="out" />
              <Picker.Item label="❓ Status Unknown" value="unknown" />
            </Picker>
          </View>
        </View>

        {/* Wait Time */}
        <View style={styles.section}>
          <Text style={styles.label}>Wait Time (minutes)</Text>
          <TextInput
            style={styles.input}
            value={formData.waitTimeMinutes}
            onChangeText={(value) => setFormData(prev => ({ ...prev, waitTimeMinutes: value }))}
            placeholder="e.g. 15"
            keyboardType="numeric"
          />
        </View>

        {/* Capacity */}
        <View style={styles.section}>
          <Text style={styles.label}>Capacity (%)</Text>
          <TextInput
            style={styles.input}
            value={formData.capacityPercentage}
            onChangeText={(value) => setFormData(prev => ({ ...prev, capacityPercentage: value }))}
            placeholder="e.g. 75"
            keyboardType="numeric"
          />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Notes (Optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={formData.notes}
            onChangeText={(value) => setFormData(prev => ({ ...prev, notes: value }))}
            placeholder="Additional information for visitors..."
            multiline
            numberOfLines={3}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          <Text style={styles.submitButtonText}>
            {isLoading ? 'Updating...' : 'Update Status'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
  },
  picker: {
    height: 50,
  },
  submitButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});