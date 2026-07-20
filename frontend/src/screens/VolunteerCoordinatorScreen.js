import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  decideApproval,
  getApprovals,
  getVolunteerSummary,
  sendVolunteerChatMessage,
} from '../api/agentService';

const QUICK_PROMPTS = [
  'Who can help with this weekend’s pantry shift?',
  'Draft a reminder for tomorrow’s meal distribution volunteers.',
  'What volunteer follow-up needs approval right now?',
  'How should I cover a last-minute no-show?',
];

function formatApprovalPayload(payload) {
  if (!payload) return 'No approval details were returned.';
  if (typeof payload === 'string') return payload;

  const message = payload.message || payload.body || payload.sms || payload.summary;
  if (message) return message;

  return JSON.stringify(payload);
}

export default function VolunteerCoordinatorScreen({ navigation, route }) {
  const scrollRef = useRef(null);
  const handledRoutePromptRef = useRef('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'I handle volunteer coverage, reminder drafts, and approval-ready next steps. Ask a question or tap a prompt to get moving.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [decisionLoadingId, setDecisionLoadingId] = useState(null);

  useEffect(() => {
    loadContext();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const loadContext = async () => {
    try {
      const [summaryResponse, approvalsResponse] = await Promise.all([
        getVolunteerSummary(),
        getApprovals(),
      ]);

      setSummary(summaryResponse);
      setApprovals(approvalsResponse.approvals || []);
    } catch (error) {
      console.error('Error loading volunteer coordinator context:', error);
    }
  };

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadContext().catch(() => {});
    }, 7000);

    return () => clearInterval(intervalId);
  }, []);

  const addMessage = (message) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, ...message },
    ]);
  };

  useEffect(() => {
    const initialPrompt = route?.params?.initialPrompt?.trim();

    if (!initialPrompt || initialPrompt === handledRoutePromptRef.current) {
      return;
    }

    handledRoutePromptRef.current = initialPrompt;
    setInput(initialPrompt);
    addMessage({
      role: 'assistant',
      text: 'Context loaded from the map or an event. Edit the prompt if needed, then send it to start staffing work.',
    });
    navigation.setParams({ initialPrompt: undefined });
  }, [navigation, route?.params?.initialPrompt]);

  const send = async (messageText = input) => {
    const text = messageText.trim();
    if (!text || sending) return;

    if (messageText === input) {
      setInput('');
    }

    addMessage({ role: 'user', text });
    setSending(true);

    try {
      const response = await sendVolunteerChatMessage(text);
      addMessage({
        role: 'assistant',
        text: response.reply || 'No response received.',
      });
      await loadContext();
    } catch (error) {
      addMessage({
        role: 'assistant',
        text: 'Could not reach the volunteer coordination backend. Make sure the agent service is running.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleApprovalDecision = async (approvalId, approved) => {
    setDecisionLoadingId(approvalId);

    try {
      await decideApproval(approvalId, approved);
      await loadContext();
    } catch (error) {
      console.error('Error deciding approval:', error);
    } finally {
      setDecisionLoadingId(null);
    }
  };

  const statItems = [
    {
      label: 'Total',
      value: String(summary?.total_volunteers ?? 0),
      icon: 'people',
      color: '#10B981',
    },
    {
      label: 'Active',
      value: String(summary?.active_volunteers ?? 0),
      icon: 'checkmark-circle',
      color: '#0EA5E9',
    },
    {
      label: 'Pending opt-in',
      value: String(summary?.pending_opt_in ?? 0),
      icon: 'mail-open',
      color: '#F59E0B',
    },
    {
      label: 'Approvals',
      value: String(approvals.length),
      icon: 'checkbox',
      color: '#8B5CF6',
    },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Volunteer Coordinator</Text>
          <Text style={styles.headerSubtitle}>Conversational staffing, reminders, and approvals</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.workspacePanel}>
          <View style={styles.workspaceHeaderRow}>
            <View style={styles.workspaceHeaderCopy}>
              <Text style={styles.panelTitle}>Volunteer controls</Text>
              <Text style={styles.panelSubtitle}>
                Roster status, quick prompts, and approval work stay above the chat instead of in separate blocks.
              </Text>
            </View>
            <View style={styles.workspaceActions}>
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => navigation.navigate('VolunteerRoster')}
              >
                <Ionicons name="people-outline" size={18} color="#0F766E" />
                <Text style={styles.secondaryActionText}>Open roster</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inlineRefresh} onPress={loadContext}>
                <Ionicons name="refresh" size={16} color="#0F766E" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statusPillWrap}>
            {statItems.map((item) => (
              <View key={item.label} style={styles.statusPill}>
                <View style={[styles.statusPillIcon, { backgroundColor: `${item.color}16` }]}>
                  <Ionicons name={item.icon} size={14} color={item.color} />
                </View>
                <Text style={styles.statusPillValue}>{item.value}</Text>
                <Text style={styles.statusPillLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.promptWrap}>
            {QUICK_PROMPTS.map((prompt) => (
              <TouchableOpacity
                key={prompt}
                style={styles.promptChip}
                onPress={() => send(prompt)}
                disabled={sending}
              >
                <Text style={styles.promptChipText}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {approvals.length > 0 ? (
            <View style={styles.approvalsInlineSection}>
              <Text style={styles.inlineSectionTitle}>Waiting on approval</Text>
              {approvals.map((approval) => (
                <View key={approval.id} style={styles.approvalCard}>
                  <View style={styles.approvalHeader}>
                    <Text style={styles.approvalType}>{approval.action_type}</Text>
                    <Text style={styles.approvalTime}>{approval.created_at}</Text>
                  </View>
                  <Text style={styles.approvalBody}>{formatApprovalPayload(approval.payload)}</Text>
                  <View style={styles.approvalActions}>
                    <TouchableOpacity
                      style={[styles.approvalButton, styles.approveButton]}
                      onPress={() => handleApprovalDecision(approval.id, true)}
                      disabled={decisionLoadingId === approval.id}
                    >
                      {decisionLoadingId === approval.id ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Text style={styles.approvalButtonText}>Approve</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.approvalButton, styles.rejectButton]}
                      onPress={() => handleApprovalDecision(approval.id, false)}
                      disabled={decisionLoadingId === approval.id}
                    >
                      <Text style={styles.approvalButtonText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.panel}>
          <View style={styles.panelRow}>
            <Text style={styles.panelTitle}>Volunteer chat</Text>
            <Text style={styles.chatStatus}>{sending ? 'Thinking...' : 'Live'}</Text>
          </View>
          <Text style={styles.panelSubtitle}>
            Ask for coverage, follow-up drafts, or approval-ready next steps. The full thread stays here.
          </Text>
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                message.role === 'user' ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              {message.role === 'assistant' ? <View style={styles.avatarDot} /> : null}
              <Text
                style={[
                  styles.messageText,
                  message.role === 'user' ? styles.userText : styles.assistantText,
                ]}
              >
                {message.text}
              </Text>
            </View>
          ))}
          {sending ? (
            <View style={[styles.messageBubble, styles.assistantBubble]}>
              <View style={styles.avatarDot} />
              <View style={styles.loadingBubble}>
                <ActivityIndicator size="small" color="#10B981" />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about staffing, follow-up, or reminders..."
          placeholderTextColor="#94A3B8"
          multiline
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          onPress={() => send(input)}
          disabled={!input.trim() || sending}
        >
          <Ionicons name="send" size={20} color="white" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F6F2',
    minHeight: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  backButton: {
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.84)',
  },
  scroll: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 28,
  },
  panel: {
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    marginBottom: 14,
  },
  workspacePanel: {
    backgroundColor: 'rgba(236,253,245,0.92)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 14,
  },
  workspaceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  workspaceHeaderCopy: {
    flex: 1,
    paddingRight: 12,
  },
  workspaceActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  panelSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    marginBottom: 12,
  },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  panelLink: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '800',
  },
  statusPillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  statusPillIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  statusPillValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 6,
  },
  statusPillLabel: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryActionText: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 8,
  },
  inlineRefresh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    marginLeft: 8,
  },
  promptWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  promptChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  promptChipText: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  approvalsInlineSection: {
    marginTop: 6,
  },
  inlineSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 10,
  },
  approvalCard: {
    backgroundColor: 'rgba(255,247,237,0.82)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 12,
  },
  approvalHeader: {
    marginBottom: 8,
  },
  approvalType: {
    fontSize: 15,
    fontWeight: '800',
    color: '#9A3412',
    marginBottom: 4,
  },
  approvalTime: {
    fontSize: 11,
    color: '#C2410C',
  },
  approvalBody: {
    fontSize: 13,
    lineHeight: 19,
    color: '#9A3412',
    marginBottom: 12,
  },
  approvalActions: {
    flexDirection: 'row',
  },
  approvalButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
  },
  approveButton: {
    backgroundColor: '#10B981',
  },
  rejectButton: {
    backgroundColor: '#EF4444',
  },
  approvalButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '800',
  },
  chatStatus: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '800',
  },
  messageBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    maxWidth: '92%',
  },
  userBubble: {
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
  },
  avatarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginTop: 10,
    marginRight: 8,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 21,
    padding: 12,
    borderRadius: 16,
  },
  userText: {
    backgroundColor: '#0F766E',
    color: 'white',
  },
  assistantText: {
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
  },
  loadingBubble: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    maxHeight: 110,
    marginRight: 8,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
});
