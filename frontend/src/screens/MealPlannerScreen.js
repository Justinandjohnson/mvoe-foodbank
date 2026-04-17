// MealPlannerScreen - AI-powered meal planning assistant
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { startMealPlannerAgent, getAgentJobStatus } from '../api/agentService';
import WebSocketService from '../services/WebSocketService';

export default function MealPlannerScreen({ navigation }) {
  const { user } = useAuth();
  const scrollViewRef = useRef();

  // State
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      id: '1',
      type: 'bot',
      text: '👋 Hi! I\'m your AI meal planning assistant. I can help you plan community meals and cookouts.\n\nTell me about your event! For example:\n• "Plan a cookout for 50 people with a $300 budget"\n• "Create a vegan meal for 25 people with $150"\n• "Plan lunch for 100 people, nut-free"',
      timestamp: new Date(),
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // Connect to WebSocket on mount
  useEffect(() => {
    WebSocketService.connect();

    // Listen for agent events
    const handleProgress = (data) => {
      addMessage({
        type: 'progress',
        text: data.message,
        timestamp: new Date(data.timestamp),
      });
    };

    const handleComplete = (data) => {
      addMessage({
        type: 'bot',
        text: formatMealPlan(data.result.plan),
        timestamp: new Date(data.timestamp),
        plan: data.result.plan,
      });
      setLoading(false);
      setCurrentJobId(null);
      setCurrentSessionId(null);
    };

    const handleError = (data) => {
      addMessage({
        type: 'error',
        text: `Error: ${data.error}`,
        timestamp: new Date(data.timestamp),
      });
      setLoading(false);
      setCurrentJobId(null);
      setCurrentSessionId(null);
    };

    WebSocketService.on('agent:progress', handleProgress);
    WebSocketService.on('agent:complete', handleComplete);
    WebSocketService.on('agent:error', handleError);

    return () => {
      WebSocketService.off('agent:progress', handleProgress);
      WebSocketService.off('agent:complete', handleComplete);
      WebSocketService.off('agent:error', handleError);
    };
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const addMessage = (message) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        ...message,
      },
    ]);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');

    // Add user message
    addMessage({
      type: 'user',
      text: userMessage,
      timestamp: new Date(),
    });

    setLoading(true);

    try {
      // Start meal planning agent
      const response = await startMealPlannerAgent(userMessage);

      if (response.success) {
        setCurrentJobId(response.jobId);
        setCurrentSessionId(response.sessionId);

        // Join WebSocket session
        WebSocketService.joinSession(response.sessionId);

        addMessage({
          type: 'bot',
          text: '🤖 Starting meal planner...',
          timestamp: new Date(),
        });
      } else {
        throw new Error(response.error || 'Failed to start meal planner');
      }
    } catch (error) {
      console.error('Error starting meal planner:', error);
      addMessage({
        type: 'error',
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      });
      setLoading(false);
    }
  };

  const formatMealPlan = (plan) => {
    if (!plan) return 'Meal plan generated!';

    let text = '✅ **Meal Plan Complete!**\n\n';

    // Zen AI suggestions
    if (plan.zenSuggestions && plan.zenSuggestions !== 'AI planning complete') {
      text += '🤖 **AI Recommendations:**\n';
      text += `${plan.zenSuggestions}\n\n`;
    }

    // Menu
    text += '📋 **Menu:**\n';
    plan.menu.forEach((item) => {
      text += `• ${item.quantity} ${item.unit} ${item.item}\n`;
    });

    // Nutrition
    if (plan.nutrition?.perServing) {
      const { calories, protein, carbs, fat } = plan.nutrition.perServing;
      text += `\n${plan.nutrition.summary}\n`;
      text += `Per Person: ${calories} cal | ${protein}g protein | ${carbs}g carbs | ${fat}g fat\n`;
    }

    // Cost & Price Research
    text += `\n💰 **Estimated Cost:** $${plan.estimatedCost.toFixed(2)} for ${plan.servings} people\n`;
    text += `($${(plan.estimatedCost / plan.servings).toFixed(2)} per person)\n`;

    // Best Deals
    if (plan.bestDeals?.totalSavings) {
      text += `\n💵 **Bulk Savings:** Save up to $${plan.bestDeals.totalSavings.toFixed(2)} by buying in bulk!\n`;
    }

    // Allergen info
    if (plan.allergenVerification && !plan.allergenVerification.safe) {
      text += `\n⚠️ **Allergen Alert:** ${plan.allergenVerification.message}\n`;
    }

    // Timeline
    text += '\n⏱️ **Cooking Timeline:**\n';
    plan.timeline.forEach((step) => {
      text += `${step.time}: ${step.task}\n`;
    });

    return text;
  };

  const renderMessage = (message) => {
    const isBot = message.type === 'bot' || message.type === 'progress';
    const isError = message.type === 'error';

    return (
      <View
        key={message.id}
        style={[
          styles.messageBubble,
          isBot ? styles.botBubble : styles.userBubble,
          isError && styles.errorBubble,
        ]}
      >
        {isBot && (
          <View style={styles.botIcon}>
            <Ionicons name="restaurant" size={16} color="#fff" />
          </View>
        )}
        <View style={styles.messageContent}>
          <Text
            style={[
              styles.messageText,
              isBot ? styles.botText : styles.userText,
              isError && styles.errorText,
            ]}
          >
            {message.text}
          </Text>
          <Text style={styles.timestamp}>
            {message.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>AI Meal Planner</Text>
          <Text style={styles.headerSubtitle}>Powered by USDA Food Database</Text>
        </View>
        <View style={styles.headerRight}>
          <Ionicons name="restaurant-outline" size={24} color="#10B981" />
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.map(renderMessage)}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#10B981" />
            <Text style={styles.loadingText}>Planning your meal...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Describe your event..."
          placeholderTextColor="#999"
          multiline
          maxLength={500}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || loading) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || loading}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  headerRight: {
    marginLeft: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  messageBubble: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '85%',
  },
  botBubble: {
    alignSelf: 'flex-start',
  },
  userBubble: {
    alignSelf: 'flex-end',
  },
  errorBubble: {
    alignSelf: 'center',
  },
  botIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  messageContent: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  botText: {
    color: '#374151',
  },
  userText: {
    color: '#fff',
  },
  errorText: {
    color: '#EF4444',
  },
  timestamp: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginTop: 8,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
});
