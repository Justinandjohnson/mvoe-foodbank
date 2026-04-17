// StaffNavigator - Staff portal navigation
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import StaffDashboardScreen from '../screens/staff/StaffDashboardScreen';
import StatusUpdateScreen from '../screens/staff/StatusUpdateScreen';
import FoodNeedsScreen from '../screens/staff/FoodNeedsScreen';
import OrganizationSettingsScreen from '../screens/staff/OrganizationSettingsScreen';

const Stack = createStackNavigator();

export default function StaffNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#10B981',
        },
        headerTintColor: 'white',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="StaffDashboard"
        component={StaffDashboardScreen}
        options={{
          title: 'Staff Dashboard',
          headerLeft: null, // Disable back button
        }}
      />
      <Stack.Screen
        name="StatusUpdate"
        component={StatusUpdateScreen}
        options={{
          title: 'Update Status',
        }}
      />
      <Stack.Screen
        name="FoodNeeds"
        component={FoodNeedsScreen}
        options={{
          title: 'Food Needs',
        }}
      />
      <Stack.Screen
        name="OrganizationSettings"
        component={OrganizationSettingsScreen}
        options={{
          title: 'Organization Settings',
        }}
      />
    </Stack.Navigator>
  );
}