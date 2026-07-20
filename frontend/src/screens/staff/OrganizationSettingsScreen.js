// OrganizationSettingsScreen - Manage organization settings
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function OrganizationSettingsScreen() {
  const settingsItems = [
    {
      title: 'Contact Information',
      description: 'Phone, email, and address',
      icon: 'call-outline',
      color: '#10B981',
    },
    {
      title: 'Operating Hours',
      description: 'Update daily operating hours',
      icon: 'time-outline',
      color: '#F59E0B',
    },
    {
      title: 'Staff Management',
      description: 'Add, remove, and manage staff',
      icon: 'people-outline',
      color: '#6366F1',
    },
    {
      title: 'Organization Profile',
      description: 'Description and public information',
      icon: 'business-outline',
      color: '#8B5CF6',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Organization Settings</Text>
        <Text style={styles.subtitle}>
          Manage your food bank's information and settings
        </Text>

        <View style={styles.infoCard}>
          <Text style={styles.orgName}>Downtown Food Bank</Text>
          <Text style={styles.orgAddress}>123 Main St, Springfield, IL 62701</Text>
          <Text style={styles.orgStatus}>✅ Verified Organization</Text>
        </View>

        {settingsItems.map((item, index) => (
          <TouchableOpacity key={index} style={styles.settingItem}>
            <View style={[styles.settingIcon, { backgroundColor: `${item.color}20` }]}>
              <Ionicons name={item.icon} size={24} color={item.color} />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>{item.title}</Text>
              <Text style={styles.settingDescription}>{item.description}</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        ))}

        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <TouchableOpacity style={styles.dangerButton}>
            <Text style={styles.dangerButtonText}>Deactivate Organization</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#F9FAFB',
  },
  scroll: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  content: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 32,
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
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  orgName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  orgAddress: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  orgStatus: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  settingIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  dangerZone: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 20,
    marginTop: 32,
    marginBottom: 20,
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 12,
  },
  dangerButton: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
