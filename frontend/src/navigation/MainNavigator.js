// MainNavigator - Root navigation with auth-based routing
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

// Context
import { useAuth } from '../contexts/AuthContext';

// Navigators
import AuthNavigator from './AuthNavigator';
import StaffNavigator from './StaffNavigator';
import CommunityNavigator from './CommunityNavigator';
import AgentNavigator from './AgentNavigator';

// Screens
import HomeScreen from '../screens/HomeScreen';
import DonateScreen from '../screens/DonateScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MapScreen from '../screens/MapScreen';
import DonationReceiptScreen from '../screens/DonationReceiptScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Loading screen component
function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#10B981" />
    </View>
  );
}

// Main app tabs (for authenticated and guest users)
function MainTabNavigator() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Donate') {
            iconName = focused ? 'heart' : 'heart-outline';
          } else if (route.name === 'Community') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Agents') {
            iconName = focused ? 'flash' : 'flash-outline';
          } else if (route.name === 'Map') {
            iconName = focused ? 'map' : 'map-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'Staff') {
            iconName = focused ? 'briefcase' : 'briefcase-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#10B981',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Donate" component={DonateScreen} />
      <Tab.Screen name="Community" component={CommunityNavigator} />
      <Tab.Screen
        name="Agents"
        component={AgentNavigator}
        options={{
          title: 'AI Agents',
        }}
      />
      <Tab.Screen name="Map" component={MapScreen} />

      {/* Show Staff tab only for staff/admin users */}
      {isAuthenticated && (user?.userType === 'staff' || user?.userType === 'admin') && (
        <Tab.Screen
          name="Staff"
          component={StaffNavigator}
          options={{
            title: 'Staff Portal',
          }}
        />
      )}

      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// Root navigator
export default function MainNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading screen while checking authentication
  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Main app screens (available to all users) */}
      <Stack.Screen name="Main" component={MainTabNavigator} />

      {/* Donation receipt screen */}
      <Stack.Screen
        name="DonationReceipt"
        component={DonationReceiptScreen}
        options={{
          headerShown: true,
          title: 'Donation Receipt',
          headerBackTitle: 'Back',
        }}
      />

      {/* Authentication screens */}
      <Stack.Screen
        name="Auth"
        component={AuthNavigator}
        options={{
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
});