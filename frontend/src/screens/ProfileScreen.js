import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import AppScreenBackground from '../components/ui/AppScreenBackground';
import GlassSurface from '../components/ui/GlassSurface';

function formatSessionLabel(sessionId) {
  if (!sessionId) return 'Session starting...';
  return `${sessionId.slice(0, 10)}...${sessionId.slice(-6)}`;
}

export default function ProfileScreen({ navigation }) {
  const { sessionId, resetSession, user, isAuthenticated, logout } = useAuth();

  const handleResetSession = () => {
    Alert.alert(
      'Reset local session',
      'This creates a new anonymous session for this device. Your current beacon and event ownership will stay tied to the old session.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset session',
          style: 'destructive',
          onPress: async () => {
            await resetSession();
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Log out',
      'This removes the saved account from this device and drops you back to guest mode.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <AppScreenBackground variant="soft" />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <GlassSurface preset="dark" style={styles.heroCard} padding={20}>
          <Text style={styles.heroEyebrow}>Guest-first settings</Text>
          <Text style={styles.heroTitle}>{isAuthenticated ? 'Account connected.' : 'No account required.'}</Text>
          <Text style={styles.heroBody}>
            {isAuthenticated
              ? 'Your saved account stays connected on this device while the guest session still handles quick local ownership.'
              : 'MVOE runs on an anonymous local session so people can publish beacons, plan meals, and use the map without a login wall. Sign in only when you want a portable account.'}
          </Text>
        </GlassSurface>

        <GlassSurface style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.sectionSubtitle}>
            Use guest mode for instant local access, or sign in so your account can persist across devices.
          </Text>

          {isAuthenticated ? (
            <>
              <View style={styles.sessionRow}>
                <View style={[styles.sessionBadge, styles.accountBadge]}>
                  <Ionicons name="person" size={16} color="#10B981" />
                </View>
                <View style={styles.sessionCopy}>
                  <Text style={styles.sessionLabel}>Signed in</Text>
                  <Text style={styles.sessionValue}>{user?.fullName || user?.email || 'Authenticated user'}</Text>
                  {!!user?.email && <Text style={styles.accountMeta}>{user.email}</Text>}
                </View>
              </View>

              <TouchableOpacity style={styles.secondaryButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={16} color="#0F172A" />
                <Text style={styles.secondaryButtonText}>Log out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.authActionRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Login')}>
                <Ionicons name="log-in-outline" size={16} color="#052E2B" />
                <Text style={styles.primaryButtonText}>Log in</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Register')}>
                <Ionicons name="person-add-outline" size={16} color="#0F172A" />
                <Text style={styles.secondaryButtonText}>Create account</Text>
              </TouchableOpacity>
            </View>
          )}
        </GlassSurface>

        <GlassSurface style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Current session</Text>
          <Text style={styles.sectionSubtitle}>This is the local ID that keeps your beacon and event ownership attached to this device.</Text>

          <View style={styles.sessionRow}>
            <View style={styles.sessionBadge}>
              <Ionicons name="sparkles" size={16} color="#0EA5E9" />
            </View>
            <View style={styles.sessionCopy}>
              <Text style={styles.sessionLabel}>Anonymous session</Text>
              <Text style={styles.sessionValue}>{formatSessionLabel(sessionId)}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleResetSession}>
            <Ionicons name="refresh" size={16} color="#0F172A" />
            <Text style={styles.secondaryButtonText}>Reset local session</Text>
          </TouchableOpacity>
        </GlassSurface>

        <GlassSurface style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Quick help</Text>
          <View style={styles.linkStack}>
            <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Map')}>
              <Ionicons name="map-outline" size={18} color="#22C55E" />
              <Text style={styles.linkText}>Back to the live map</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigation.navigate('Map', { openEventComposer: true })}
            >
              <Ionicons name="flame-outline" size={18} color="#8B5CF6" />
              <Text style={styles.linkText}>Create a public meal event</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigation.navigate('Agents', { screen: 'MealPlanner' })}
            >
              <Ionicons name="restaurant-outline" size={18} color="#0EA5E9" />
              <Text style={styles.linkText}>Open the meal planner</Text>
            </TouchableOpacity>
          </View>
        </GlassSurface>

        <GlassSurface style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Support</Text>
          <Text style={styles.sectionSubtitle}>
            If the map or a live food workflow looks wrong, refresh the screen first. If the issue persists, route it through the operations tools so the underlying data can be fixed.
          </Text>
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
  scroll: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  content: {
    flexGrow: 1,
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 132,
    gap: 14,
  },
  heroCard: {
    marginBottom: 2,
  },
  heroEyebrow: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  heroTitle: {
    color: 'white',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    marginBottom: 10,
  },
  heroBody: {
    color: '#D7F1E7',
    fontSize: 14,
    lineHeight: 21,
  },
  sectionCard: {
    gap: 14,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.54)',
  },
  sessionBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,165,233,0.14)',
  },
  accountBadge: {
    backgroundColor: 'rgba(16,185,129,0.14)',
  },
  sessionCopy: {
    flex: 1,
    gap: 2,
  },
  sessionLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  sessionValue: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  accountMeta: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  authActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D1FAE5',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.28)',
  },
  primaryButtonText: {
    color: '#052E2B',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  linkStack: {
    gap: 10,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.46)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.54)',
  },
  linkText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
});
