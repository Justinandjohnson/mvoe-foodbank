// CommunityNavigator - Stack navigator for community features
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// Screens
import CommunityScreen from '../screens/CommunityScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import MealPlannerScreen from '../screens/MealPlannerScreen';
import EventDetailScreen from '../screens/EventDetailScreen';

const Stack = createStackNavigator();

export default function CommunityNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="CommunityMain" component={CommunityScreen} />
      <Stack.Screen name="CreateEvent" component={CreateEventScreen} />
      <Stack.Screen name="MealPlanner" component={MealPlannerScreen} />
      <Stack.Screen name="EventDetail" component={EventDetailScreen} />
    </Stack.Navigator>
  );
}