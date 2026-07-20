// MainNavigator - Root navigation with auth-based routing
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

// Context
import { useAuth } from '../contexts/AuthContext';

// Navigators
import AgentNavigator from './AgentNavigator';

// Screens
import HomeScreen from '../screens/HomeScreen';
import DonateScreen from '../screens/DonateScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MapScreen from '../screens/MapScreen';
import DonationReceiptScreen from '../screens/DonationReceiptScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const baseTabBarStyle = {
  height: 68,
  paddingBottom: 10,
  paddingTop: 8,
  borderTopColor: 'rgba(255,255,255,0.4)',
  backgroundColor: 'rgba(248,250,252,0.92)',
  position: 'absolute',
};

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
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = focused ? 'grid' : 'grid-outline';
          } else if (route.name === 'Map') {
            iconName = focused ? 'navigate' : 'navigate-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#10B981',
        tabBarInactiveTintColor: '#6B7280',
        headerShown: false,
        tabBarStyle: baseTabBarStyle,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      })}
      initialRouteName="Map"
    >
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          title: 'Find Food',
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Command',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={ProfileScreen}
        options={{
          title: 'Settings',
        }}
      />
    </Tab.Navigator>
  );
}

// Root navigator
export default function MainNavigator() {
  const { isLoading } = useAuth();

  // Show loading screen while checking authentication
  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Main app screens (available to all users) */}
      <Stack.Screen name="Main" component={MainTabNavigator} />

      <Stack.Screen
        name="Donate"
        component={DonateScreen}
        options={{
          headerShown: false,
        }}
      />

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

      <Stack.Screen
        name="CreateEvent"
        component={CreateEventScreen}
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="Agents"
        component={AgentNavigator}
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{
          headerShown: false,
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
