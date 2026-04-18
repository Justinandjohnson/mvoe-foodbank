// MealPlannerScreen - AI-powered chat agents via OpenRouter
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { callGLMAgent, searchWithPerplexity } from '../api/agentService';

const AGENT_CONFIGS = {
  'meal-planner': {
    name: 'AI Meal Planner',
    subtitle: 'Powered by GLM + USDA Data',
    icon: 'restaurant-outline',
    useSearch: false,
    systemPrompt: `You are an expert community meal planning assistant for MVOE, a food bank platform.
Help plan nutritious, affordable community meals and cookouts. For each request provide:
- Specific menu items with quantities (in bulk units)
- Total estimated cost and per-person cost
- Simple cooking timeline
- Key allergen notes
- Bulk buying tips (Costco, Restaurant Depot, etc.)
Keep responses clear, practical, and formatted with sections.`,
    welcome: `👋 Hi! I'm your AI Meal Planner. I can help plan community meals and cookouts.

Tell me about your event:
• "Plan a cookout for 50 people with a $300 budget"
• "Create a vegan meal for 25 people with $150"
• "Plan lunch for 100 people, nut-free"`,
  },
  'price-research': {
    name: 'Price Research Agent',
    subtitle: 'Live web search for best deals',
    icon: 'pricetag-outline',
    useSearch: true,
    systemPrompt: '',
    welcome: `💰 Hi! I'm your Price Research Agent. I search the web for current bulk food prices.

Tell me what you need:
• "Best bulk price for rice and beans for 100 people"
• "Where to buy 50 lbs of chicken cheapest near me"
• "Compare Costco vs Restaurant Depot pasta prices"`,
  },
  'food-bank-discovery': {
    name: 'Food Bank Discovery',
    subtitle: 'Find & verify food banks near you',
    icon: 'location-outline',
    useSearch: true,
    systemPrompt: '',
    welcome: `📍 Hi! I'm your Food Bank Discovery Agent. I can find food banks and community resources.

Ask me things like:
• "Find food banks in Chicago, IL"
• "Food pantries open on weekends in Atlanta"
• "Community fridges near Brooklyn, NY"`,
  },
  'volunteer-coordinator': {
    name: 'Volunteer Coordinator',
    subtitle: 'Match volunteers to events',
    icon: 'people-outline',
    useSearch: false,
    systemPrompt: `You are a volunteer coordination assistant for MVOE food bank. Help match volunteers to events, suggest schedules, create sign-up structures, and write volunteer outreach messages. Be specific and actionable.`,
    welcome: `🤝 Hi! I'm your Volunteer Coordinator. I help organize volunteers for food bank events.

Examples:
• "I have a food drive Saturday, need 10 volunteers"
• "Create a volunteer sign-up for a monthly soup kitchen"
• "Write a message to recruit college students for volunteering"`,
  },
  'content-creator': {
    name: 'Content Creator',
    subtitle: 'Social media, newsletters & flyers',
    icon: 'create-outline',
    useSearch: false,
    systemPrompt: `You are a content creation assistant for MVOE, a food bank platform. Create engaging social media posts, newsletter content, and event flyers. Match the tone to the platform (Instagram, Facebook, email). Keep content warm, community-focused, and action-oriented.`,
    welcome: `✍️ Hi! I'm your Content Creator. I write posts, newsletters, and flyers for your food bank.

Examples:
• "Write an Instagram post for our Saturday food drive"
• "Create a newsletter about our monthly impact stats"
• "Design a flyer text for a community cookout"`,
  },
  'receipt-processor': {
    name: 'Receipt Processor',
    subtitle: 'Categorize & analyze expenses',
    icon: 'receipt-outline',
    useSearch: false,
    systemPrompt: `You are an expense categorization assistant for MVOE food bank. Help users describe receipts and expenses, categorize them (food, supplies, transport, etc.), and provide spending summaries. Suggest budget optimizations.`,
    welcome: `🧾 Hi! I'm your Receipt Processor. Describe your purchases and I'll help categorize and track them.

Examples:
• "Spent $247 at Costco: 20 lbs rice, 10 lbs beans, paper plates"
• "Gas receipt $45 for food bank delivery run"
• "Give me a summary of our spending this month"`,
  },
};

const DEFAULT_CONFIG = AGENT_CONFIGS['meal-planner'];

export default function MealPlannerScreen({ navigation, route }) {
  const agentType = route?.params?.agentType || 'meal-planner';
  const config = AGENT_CONFIGS[agentType] || DEFAULT_CONFIG;

  const scrollViewRef = useRef();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { id: '1', type: 'bot', text: config.welcome, timestamp: new Date() },
  ]);
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const addMessage = (message) => {
    setMessages((prev) => [...prev, { id: Date.now().toString(), ...message }]);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');

    addMessage({ type: 'user', text: userText, timestamp: new Date() });
    setLoading(true);

    const updatedHistory = [...conversationHistory, { role: 'user', content: userText }];
    setConversationHistory(updatedHistory);

    try {
      let reply;
      if (config.useSearch) {
        reply = await searchWithPerplexity(
          config.systemPrompt
            ? `${config.systemPrompt}\n\nUser question: ${userText}`
            : userText
        );
      } else {
        reply = await callGLMAgent(updatedHistory, config.systemPrompt);
      }

      addMessage({ type: 'bot', text: reply, timestamp: new Date() });
      setConversationHistory([...updatedHistory, { role: 'assistant', content: reply }]);
    } catch (err) {
      const isKeyMissing = err.message.includes('EXPO_PUBLIC_OPENROUTER_API_KEY');
      addMessage({
        type: 'error',
        text: isKeyMissing
          ? '⚙️ OpenRouter API key not set. Add EXPO_PUBLIC_OPENROUTER_API_KEY to your .env file.'
          : `Error: ${err.message}`,
        timestamp: new Date(),
      });
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (message) => {
    const isBot = message.type === 'bot' || message.type === 'progress';
    const isError = message.type === 'error';

    return (
      <View
        key={message.id}
        style={[
          styles.messageBubble,
          isBot ? styles.botBubble : isError ? styles.errorBubble : styles.userBubble,
        ]}
      >
        {isBot && (
          <View style={styles.botIcon}>
            <Ionicons name={config.icon} size={16} color="#fff" />
          </View>
        )}
        <View style={[styles.messageContent, isError && styles.errorContent]}>
          <Text style={[styles.messageText, isBot ? styles.botText : isError ? styles.errorText : styles.userText]}>
            {message.text}
          </Text>
          <Text style={styles.timestamp}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{config.name}</Text>
          <Text style={styles.headerSubtitle}>{config.subtitle}</Text>
        </View>
        <View style={styles.headerRight}>
          <Ionicons name={config.icon} size={24} color="#10B981" />
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.map(renderMessage)}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#10B981" />
            <Text style={styles.loadingText}>
              {config.useSearch ? 'Searching the web...' : 'Thinking...'}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Type your message..."
          placeholderTextColor="#999"
          multiline
          maxLength={500}
          editable={!loading}
          onSubmitEditing={handleSend}
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: { padding: 8, marginRight: 8 },
  headerContent: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  headerSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  headerRight: { marginLeft: 8 },
  messagesContainer: { flex: 1 },
  messagesContent: { padding: 16 },
  messageBubble: { flexDirection: 'row', marginBottom: 16, maxWidth: '85%' },
  botBubble: { alignSelf: 'flex-start' },
  userBubble: { alignSelf: 'flex-end' },
  errorBubble: { alignSelf: 'center', maxWidth: '95%' },
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
  errorContent: { backgroundColor: '#FEF2F2' },
  messageText: { fontSize: 15, lineHeight: 22 },
  botText: { color: '#374151' },
  userText: { color: '#fff', backgroundColor: '#10B981', borderRadius: 12, padding: 4 },
  errorText: { color: '#DC2626' },
  timestamp: { fontSize: 10, color: '#9CA3AF', marginTop: 4 },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginTop: 8,
  },
  loadingText: { marginLeft: 12, fontSize: 14, color: '#6B7280' },
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
  sendButtonDisabled: { backgroundColor: '#D1D5DB' },
});
