// VolunteerRosterScreen - Manage volunteer roster and send SMS
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  broadcastVolunteerSms,
  createVolunteer,
  deleteVolunteer,
  listVolunteers,
  sendVolunteerSms,
} from '../api/agentService';

const OPT_IN_COLORS = {
  active: '#10B981',
  pending: '#F59E0B',
  stopped: '#EF4444',
};

export default function VolunteerRosterScreen({ navigation }) {
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add volunteer modal
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // SMS modal
  const [smsTarget, setSmsTarget] = useState(null); // null = broadcast, volunteer obj = single
  const [showSms, setShowSms] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [smsSending, setSmsSending] = useState(false);

  const loadVolunteers = useCallback(async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      const res = await listVolunteers();
      setVolunteers(res.volunteers || res.data?.volunteers || []);
    } catch (e) {
      Alert.alert('Error', 'Could not load volunteers. Is the server running?');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadVolunteers(); }, [loadVolunteers]);

  const handleAddVolunteer = async () => {
    if (!addName.trim() || !addPhone.trim()) {
      Alert.alert('Required', 'Name and phone number are required.');
      return;
    }
    // Ensure E.164 format
    let phone = addPhone.trim();
    if (!phone.startsWith('+')) phone = '+1' + phone.replace(/\D/g, '');

    setAddSaving(true);
    try {
      await createVolunteer({
        name: addName.trim(),
        phone_e164: phone,
        email: addEmail.trim() || null,
        tags: [],
      });
      setShowAdd(false);
      setAddName(''); setAddPhone(''); setAddEmail('');
      loadVolunteers();
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || 'Failed to add volunteer';
      Alert.alert('Error', msg);
    } finally {
      setAddSaving(false);
    }
  };

  const handleDelete = (volunteer) => {
    Alert.alert(
      'Remove Volunteer',
      `Remove ${volunteer.name} from the roster?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVolunteer(volunteer.id);
              loadVolunteers();
            } catch {
              Alert.alert('Error', 'Could not remove volunteer.');
            }
          },
        },
      ]
    );
  };

  const openSms = (target) => {
    setSmsTarget(target);
    setSmsMessage('');
    setShowSms(true);
  };

  const handleSendSms = async () => {
    if (!smsMessage.trim()) return;
    setSmsSending(true);
    try {
      if (smsTarget) {
        await sendVolunteerSms(smsTarget.id, smsMessage.trim());
        Alert.alert('Sent', `Message sent to ${smsTarget.name}`);
      } else {
        const res = await broadcastVolunteerSms(smsMessage.trim());
        const data = res.data || res;
        Alert.alert('Broadcast Sent', `Sent to ${data.sent} volunteer${data.sent !== 1 ? 's' : ''}${data.failed ? `, ${data.failed} failed` : ''}`);
      }
      setShowSms(false);
      setSmsMessage('');
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || 'Failed to send SMS';
      Alert.alert('Error', msg);
    } finally {
      setSmsSending(false);
    }
  };

  const activeCount = volunteers.filter(v => v.opt_in_state === 'active').length;

  const renderVolunteer = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.phone}>{item.phone_e164}</Text>
          {item.email ? <Text style={styles.email}>{item.email}</Text> : null}
        </View>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.badge, { backgroundColor: OPT_IN_COLORS[item.opt_in_state] || '#6B7280' }]}>
          <Text style={styles.badgeText}>{item.opt_in_state}</Text>
        </View>
        <View style={styles.cardActions}>
          {item.opt_in_state !== 'stopped' && (
            <TouchableOpacity style={styles.iconBtn} onPress={() => openSms(item)}>
              <Ionicons name="chatbubble-outline" size={18} color="#10B981" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Volunteer Roster</Text>
          <Text style={styles.headerSub}>{volunteers.length} total · {activeCount} active</Text>
        </View>
        <TouchableOpacity style={styles.headerAdd} onPress={() => setShowAdd(true)}>
          <Ionicons name="person-add" size={22} color="white" />
        </TouchableOpacity>
      </View>

      {/* Broadcast banner */}
      {activeCount > 0 && (
        <TouchableOpacity style={styles.broadcastBanner} onPress={() => openSms(null)}>
          <Ionicons name="megaphone-outline" size={18} color="white" />
          <Text style={styles.broadcastText}>Broadcast to {activeCount} active volunteer{activeCount !== 1 ? 's' : ''}</Text>
          <Ionicons name="chevron-forward" size={16} color="white" />
        </TouchableOpacity>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading roster...</Text>
        </View>
      ) : (
        <FlatList
          data={volunteers}
          keyExtractor={(item) => item.id}
          renderItem={renderVolunteer}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadVolunteers(true)} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No Volunteers Yet</Text>
              <Text style={styles.emptySub}>Tap the + icon to add your first volunteer</Text>
              <TouchableOpacity style={styles.addFirstBtn} onPress={() => setShowAdd(true)}>
                <Text style={styles.addFirstBtnText}>Add Volunteer</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Add Volunteer Modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Volunteer</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                value={addName}
                onChangeText={setAddName}
                placeholder="Jane Smith"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.label}>Phone * (US number, e.g. 8041234567)</Text>
              <TextInput
                style={styles.input}
                value={addPhone}
                onChangeText={setAddPhone}
                placeholder="+18041234567"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>Email (optional)</Text>
              <TextInput
                style={styles.input}
                value={addEmail}
                onChangeText={setAddEmail}
                placeholder="jane@example.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[styles.saveBtn, addSaving && styles.saveBtnDisabled]}
                onPress={handleAddVolunteer}
                disabled={addSaving}
              >
                {addSaving
                  ? <ActivityIndicator color="white" />
                  : <Text style={styles.saveBtnText}>Add Volunteer</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* SMS Modal */}
      <Modal visible={showSms} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {smsTarget ? `Message ${smsTarget.name}` : `Broadcast to ${activeCount} Volunteers`}
              </Text>
              <TouchableOpacity onPress={() => setShowSms(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Message</Text>
            <TextInput
              style={[styles.input, styles.smsInput]}
              value={smsMessage}
              onChangeText={setSmsMessage}
              placeholder="Your shift is tomorrow at 9am. Reply Y to confirm."
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={300}
            />
            <Text style={styles.charCount}>{smsMessage.length}/300</Text>

            <TouchableOpacity
              style={[styles.saveBtn, (!smsMessage.trim() || smsSending) && styles.saveBtnDisabled]}
              onPress={handleSendSms}
              disabled={!smsMessage.trim() || smsSending}
            >
              {smsSending
                ? <ActivityIndicator color="white" />
                : (
                  <View style={styles.sendBtnInner}>
                    <Ionicons name="send" size={16} color="white" />
                    <Text style={styles.saveBtnText}> Send SMS</Text>
                  </View>
                )
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, backgroundColor: '#F9FAFB' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backBtn: { marginRight: 12, padding: 4 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  headerAdd: { padding: 4 },

  broadcastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  broadcastText: { flex: 1, color: 'white', fontWeight: '600', fontSize: 14 },

  list: { padding: 16, paddingBottom: 32 },

  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#10B981' },
  cardInfo: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#111827' },
  phone: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  email: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },

  cardRight: { alignItems: 'flex-end', gap: 8 },
  badge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: { fontSize: 11, color: 'white', fontWeight: '600', textTransform: 'capitalize' },
  cardActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 15 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#9CA3AF', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  addFirstBtn: {
    marginTop: 20,
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addFirstBtnText: { color: 'white', fontWeight: '600', fontSize: 15 },

  // Modals
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  smsInput: { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 },
  charCount: { fontSize: 12, color: '#9CA3AF', textAlign: 'right', marginTop: 4 },
  saveBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnDisabled: { backgroundColor: '#D1D5DB' },
  saveBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  sendBtnInner: { flexDirection: 'row', alignItems: 'center' },
});
