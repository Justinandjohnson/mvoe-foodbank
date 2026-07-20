// AgentNavigator - Stack navigator for AI agent features
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// Screens
import AgentDashboardScreen from '../screens/AgentDashboardScreen';
import JobHistoryScreen from '../screens/JobHistoryScreen';
import VolunteerRosterScreen from '../screens/VolunteerRosterScreen';
import GrantWriterScreen from '../screens/GrantWriterScreen';
import AgentNotificationsScreen from '../screens/AgentNotificationsScreen';

const Stack = createStackNavigator();

export default function AgentNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="AgentDashboard" component={AgentDashboardScreen} />
      <Stack.Screen name="AgentNotifications" component={AgentNotificationsScreen} />
      <Stack.Screen name="GrantWriter" component={GrantWriterScreen} />
      <Stack.Screen name="VolunteerRoster" component={VolunteerRosterScreen} />
      <Stack.Screen name="JobHistory" component={JobHistoryScreen} />
    </Stack.Navigator>
  );
}
