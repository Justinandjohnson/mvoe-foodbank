import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  connectGrantWriterDrive,
  createGrantWriterWorkspace,
  decideApproval,
  getApprovals,
  getGrantWriterDriveStatus,
  getGrantWriterIndexStatus,
  getVolunteerSignupShare,
  getGrantWriterWorkspace,
  getVolunteerSummary,
  listGrantWriterWorkspaces,
  listVolunteers,
  refreshGrantWriterIndex,
  sendGrantWriterWorkspaceMessage,
  sendVolunteerChatMessage,
  sendVolunteerSms,
  broadcastVolunteerSms,
  updateVolunteer,
} from '../api/agentService';
import AppScreenBackground from '../components/ui/AppScreenBackground';
import GlassSurface from '../components/ui/GlassSurface';

const GRANT_QUICK_STARTS = [
  {
    id: 'search',
    label: 'Find best-fit grants',
    prompt: 'Search for the best grant opportunities for MVOE food beacons, community meals, and emergency food response.',
    mode: 'search',
  },
  {
    id: 'brief',
    label: 'Draft beacon grant brief',
    prompt: 'Draft a grant brief for expanding MVOE food beacon coverage and community meal support in Austin.',
    mode: 'draft',
  },
  {
    id: 'prepare',
    label: 'Prepare selected application',
    prompt: 'Prepare the application workflow for the selected grant opportunity and stop before submission.',
    mode: 'prepare-application',
  },
];

const VOLUNTEER_PROMPT_STARTERS = [
  'Draft a volunteer reminder for this weekend’s pantry shift.',
  'Write a short follow-up asking who can cover a last-minute no-show.',
  'Draft an approval-ready message asking the team to confirm attendance.',
];

const VOLUNTEER_GROUP_TAGS = [
  { key: 'new-volunteer', label: 'Tag new' },
  { key: 'pantry-team', label: 'Pantry team' },
  { key: 'meal-response', label: 'Meal response' },
  { key: 'on-call', label: 'On call' },
];

function formatDateTime(value) {
  if (!value) return 'Pending';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(value) {
  if (!value) return 'Verify live';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getOpportunityDeadline(opportunity) {
  if (!opportunity) return 'No grant selected';

  return (
    opportunity.deadline
    || opportunity.applicationDeadline
    || opportunity.deadlineDate
    || opportunity.closeDate
    || 'Verify live'
  );
}

function reviewColor(status) {
  switch (status) {
    case 'approved':
      return '#10B981';
    case 'disapproved':
      return '#EF4444';
    default:
      return '#F59E0B';
  }
}

async function openExternalUrl(url) {
  if (!url) return;

  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  await Linking.openURL(url);
}

export default function AgentDashboardScreen({ navigation, route }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 1180;
  const [refreshing, setRefreshing] = useState(false);
  const operationsScrollRef = useRef(null);
  const volunteerWidgetRef = useRef(null);
  const volunteerWidgetYRef = useRef(0);
  const handledVolunteerIntentRef = useRef('');

  const [workspaceList, setWorkspaceList] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [grantComposer, setGrantComposer] = useState('');
  const [grantLoading, setGrantLoading] = useState(true);
  const [grantSending, setGrantSending] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [indexStatus, setIndexStatus] = useState(null);
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [indexRefreshing, setIndexRefreshing] = useState(false);

  const [volunteerSummary, setVolunteerSummary] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [volunteerSignupShareUrl, setVolunteerSignupShareUrl] = useState('');
  const [volunteerLoading, setVolunteerLoading] = useState(true);
  const [volunteerDraftRequest, setVolunteerDraftRequest] = useState('');
  const [volunteerDraftLoading, setVolunteerDraftLoading] = useState(false);
  const [volunteerChatMessages, setVolunteerChatMessages] = useState([
    {
      id: 'volunteer-welcome',
      role: 'assistant',
      text: 'Ask me who should get pulled in, what reminder to send, or which volunteer group needs a broadcast.',
    },
  ]);
  const [smsMessage, setSmsMessage] = useState('');
  const [recipientMode, setRecipientMode] = useState('all');
  const [selectedVolunteerIds, setSelectedVolunteerIds] = useState([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [volunteerTagLoading, setVolunteerTagLoading] = useState(false);
  const [decisionLoadingId, setDecisionLoadingId] = useState(null);

  const refreshGrantList = async (preferredWorkspaceId = null) => {
    const response = await listGrantWriterWorkspaces();
    const items = response.workspaces || [];
    setWorkspaceList(items);
    return preferredWorkspaceId || activeWorkspaceId || items[0]?.id || null;
  };

  const refreshGrantWorkspace = async (workspaceId) => {
    if (!workspaceId) return null;
    const response = await getGrantWriterWorkspace(workspaceId);
    const workspace = response.workspace || null;
    setActiveWorkspace(workspace);
    setActiveWorkspaceId(workspace?.id || null);
    return workspace;
  };

  const refreshDriveStatus = async (workspaceId) => {
    if (!workspaceId) return null;
    const response = await getGrantWriterDriveStatus(workspaceId);
    const connection = response.connection || null;
    setActiveWorkspace((current) => (
      current?.id === workspaceId ? { ...current, driveConnection: connection } : current
    ));
    return connection;
  };

  const bootstrapGrant = async () => {
    setGrantLoading(true);
    try {
      const statusResponse = await getGrantWriterIndexStatus().catch(() => null);
      setIndexStatus(statusResponse?.snapshot || null);
      setRuntimeStatus(statusResponse?.runtime || null);

      let nextWorkspaceId = await refreshGrantList();

      if (!nextWorkspaceId) {
        const created = await createGrantWriterWorkspace({});
        nextWorkspaceId = created.workspace?.id || null;
        await refreshGrantList(nextWorkspaceId);
      }

      if (nextWorkspaceId) {
        await refreshGrantWorkspace(nextWorkspaceId);
        await refreshDriveStatus(nextWorkspaceId).catch(() => null);
      }
    } catch (error) {
      Alert.alert('Grant writer unavailable', error.message || 'The grant workspace could not be loaded.');
    } finally {
      setGrantLoading(false);
    }
  };

  const refreshVolunteerData = async () => {
    setVolunteerLoading(true);
    try {
      const [summaryResponse, approvalsResponse, volunteersResponse, signupShareResponse] = await Promise.all([
        getVolunteerSummary().catch(() => null),
        getApprovals().catch(() => null),
        listVolunteers().catch(() => null),
        getVolunteerSignupShare().catch(() => null),
      ]);

      setVolunteerSummary(summaryResponse || null);
      setApprovals(approvalsResponse?.approvals || []);
      setVolunteers(volunteersResponse?.volunteers || []);
      setVolunteerSignupShareUrl(signupShareResponse?.share_url || '');
    } catch (error) {
      Alert.alert('Volunteer tools unavailable', error.message || 'The volunteer dashboard could not be loaded.');
    } finally {
      setVolunteerLoading(false);
    }
  };

  const loadAll = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      await Promise.all([bootstrapGrant(), refreshVolunteerData()]);
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!activeWorkspace?.id || activeWorkspace.status !== 'running') {
      return undefined;
    }

    const intervalId = setInterval(() => {
      Promise.all([
        refreshGrantWorkspace(activeWorkspace.id),
        refreshGrantList(activeWorkspace.id),
      ]).catch(() => {});
    }, 1500);

    return () => clearInterval(intervalId);
  }, [activeWorkspace?.id, activeWorkspace?.status]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshVolunteerData().catch(() => {});
    }, 7000);

    return () => clearInterval(intervalId);
  }, []);

  const volunteerTags = useMemo(
    () => [...new Set(volunteers.flatMap((volunteer) => volunteer.tags || []))].sort(),
    [volunteers]
  );

  const selectedVolunteers = useMemo(
    () => volunteers.filter((volunteer) => selectedVolunteerIds.includes(volunteer.id)),
    [selectedVolunteerIds, volunteers]
  );
  const visibleVolunteers = useMemo(() => {
    if (recipientMode === 'tag' && selectedTag) {
      return volunteers.filter((volunteer) => (volunteer.tags || []).includes(selectedTag));
    }
    if (recipientMode === 'selected') {
      return selectedVolunteers;
    }
    return volunteers;
  }, [recipientMode, selectedTag, selectedVolunteers, volunteers]);
  const latestVolunteerDraft = [...volunteerChatMessages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.id !== 'volunteer-welcome')
    ?.text || '';
  const pendingGrantReviews = activeWorkspace?.drafts?.filter((draft) => draft.status === 'needs_review').length || 0;
  const latestDriveConnection = activeWorkspace?.driveConnection || null;
  const grantPreviewMessages = useMemo(
    () => (activeWorkspace?.messages || []).filter((message) => message.role !== 'system').slice(-4),
    [activeWorkspace?.messages]
  );
  const grantLatestError = [...(activeWorkspace?.messages || [])]
    .reverse()
    .find((message) => message.role === 'error')
    ?.content || null;
  const volunteerSignupQrUrl = volunteerSignupShareUrl
    ? `https://quickchart.io/qr?text=${encodeURIComponent(volunteerSignupShareUrl)}&size=220`
    : '';

  const summaryWidgets = useMemo(() => ([
    {
      label: 'Grant chats',
      value: String(workspaceList.length),
      detail: activeWorkspace?.status ? `Current ${activeWorkspace.status}` : 'No active chat',
      icon: 'document-text',
      color: '#A78BFA',
    },
    {
      label: 'Grant reviews',
      value: String(pendingGrantReviews),
      detail: activeWorkspace?.drafts?.length ? `${activeWorkspace.drafts.length} drafts` : 'No drafts yet',
      icon: 'shield-checkmark',
      color: '#60A5FA',
    },
    {
      label: 'Volunteer roster',
      value: String(volunteerSummary?.total_volunteers || 0),
      detail: `${volunteerSummary?.active_volunteers || 0} active`,
      icon: 'people',
      color: '#34D399',
    },
    {
      label: 'Pending approvals',
      value: String(approvals.length),
      detail: approvals.length ? 'Review below' : 'Nothing waiting',
      icon: 'checkbox',
      color: '#FB923C',
    },
  ]), [activeWorkspace?.drafts?.length, activeWorkspace?.status, approvals.length, pendingGrantReviews, volunteerSummary?.active_volunteers, volunteerSummary?.total_volunteers, workspaceList.length]);

  const handleGrantSend = async (prompt, mode = null) => {
    const trimmed = String(prompt || '').trim();
    if (!trimmed || grantSending) return;

    setGrantSending(true);
    try {
      let workspaceId = activeWorkspace?.id;
      if (!workspaceId) {
        const created = await createGrantWriterWorkspace({});
        workspaceId = created.workspace?.id;
        await refreshGrantList(workspaceId);
        await refreshGrantWorkspace(workspaceId);
      }

      const response = await sendGrantWriterWorkspaceMessage(workspaceId, { message: trimmed, mode });
      setActiveWorkspace(response.workspace);
      setActiveWorkspaceId(response.workspace?.id || workspaceId);
      await refreshGrantList(response.workspace?.id || workspaceId);
      setGrantComposer('');
    } catch (error) {
      Alert.alert('Grant writer failed', error.message || 'The grant writer could not complete this request.');
    } finally {
      setGrantSending(false);
    }
  };

  const openGrantWriterScreen = (params = {}) => {
    if (typeof navigation.push === 'function') {
      navigation.push('GrantWriter', params);
      return;
    }

    navigation.navigate('GrantWriter', params);
  };

  const handleCreateGrantChat = async () => {
    try {
      const created = await createGrantWriterWorkspace({});
      await refreshGrantList(created.workspace?.id);
      await refreshGrantWorkspace(created.workspace?.id);
      setGrantComposer('');
    } catch (error) {
      Alert.alert('New chat failed', error.message || 'A new grant chat could not be created.');
    }
  };

  const handleConnectDrive = async () => {
    if (!activeWorkspace?.id || driveLoading) return;

    setDriveLoading(true);
    try {
      const response = await connectGrantWriterDrive(activeWorkspace.id);
      if (response.redirectUrl) {
        await openExternalUrl(response.redirectUrl);
      }
      await refreshDriveStatus(activeWorkspace.id).catch(() => null);
      await refreshGrantList(activeWorkspace.id);
    } catch (error) {
      Alert.alert('Drive connection failed', error.message || 'Google Drive could not be connected.');
    } finally {
      setDriveLoading(false);
    }
  };

  const handleRefreshGrantIndex = async () => {
    if (indexRefreshing) return;

    setIndexRefreshing(true);
    try {
      const response = await refreshGrantWriterIndex();
      setIndexStatus(response.snapshot || null);
      setRuntimeStatus(response.runtime || runtimeStatus);
    } catch (error) {
      Alert.alert('Grant index refresh failed', error.message || 'The source index could not be refreshed.');
    } finally {
      setIndexRefreshing(false);
    }
  };

  const handleVolunteerDraft = async (prompt = volunteerDraftRequest) => {
    const trimmed = String(prompt || '').trim();
    if (!trimmed || volunteerDraftLoading) return;

    setVolunteerChatMessages((current) => [
      ...current,
      { id: `vol-user-${Date.now()}`, role: 'user', text: trimmed },
    ]);
    setVolunteerDraftLoading(true);
    try {
      const response = await sendVolunteerChatMessage(trimmed);
      const nextDraft = response.reply || 'No reply received.';
      setVolunteerChatMessages((current) => [
        ...current,
        { id: `vol-assistant-${Date.now()}`, role: 'assistant', text: nextDraft },
      ]);
      setSmsMessage((current) => current.trim() || nextDraft);
      setVolunteerDraftRequest('');
    } catch (error) {
      Alert.alert('Draft failed', error.message || 'The volunteer coordinator could not draft the message.');
    } finally {
      setVolunteerDraftLoading(false);
    }
  };

  const handleSendVolunteerSms = async () => {
    const trimmed = String(smsMessage || '').trim();
    if (!trimmed || smsSending) return;

    setSmsSending(true);
    try {
      if (recipientMode === 'all') {
        await broadcastVolunteerSms(trimmed);
      } else if (recipientMode === 'tag') {
        const matchingVolunteers = volunteers.filter((volunteer) => (
          selectedTag && (volunteer.tags || []).includes(selectedTag) && volunteer.opt_in_state !== 'stopped'
        ));

        if (!matchingVolunteers.length) {
          throw new Error('No volunteers match that tag yet.');
        }

        await Promise.all(matchingVolunteers.map((volunteer) => sendVolunteerSms(volunteer.id, trimmed)));
      } else if (recipientMode === 'selected') {
        if (!selectedVolunteerIds.length) {
          throw new Error('Select volunteers first.');
        }
        await Promise.all(selectedVolunteerIds.map((volunteerId) => sendVolunteerSms(volunteerId, trimmed)));
      }

      Alert.alert('SMS sent', 'The volunteer message has been dispatched.');
    } catch (error) {
      Alert.alert('SMS failed', error.message || 'The volunteer message could not be sent.');
    } finally {
      setSmsSending(false);
    }
  };

  const handleVolunteerSelection = (volunteerId) => {
    setSelectedVolunteerIds((current) => (
      current.includes(volunteerId)
        ? current.filter((value) => value !== volunteerId)
        : [...current, volunteerId]
    ));
  };

  const handleApplyVolunteerTag = async (tag) => {
    if (!selectedVolunteerIds.length || volunteerTagLoading) {
      if (!selectedVolunteerIds.length) {
        Alert.alert('Select volunteers first', 'Pick one or more volunteers, then apply a broadcast tag.');
      }
      return;
    }

    setVolunteerTagLoading(true);
    try {
      await Promise.all(selectedVolunteers.map((volunteer) => (
        updateVolunteer(volunteer.id, {
          name: volunteer.name,
          phone_e164: volunteer.phone_e164,
          email: volunteer.email || undefined,
          tags: [...new Set([...(volunteer.tags || []), tag])],
        })
      )));
      setRecipientMode('tag');
      setSelectedTag(tag);
      await refreshVolunteerData();
      Alert.alert('Tag applied', `Selected volunteers are now grouped under ${tag}.`);
    } catch (error) {
      Alert.alert('Tag update failed', error.message || 'The volunteers could not be grouped.');
    } finally {
      setVolunteerTagLoading(false);
    }
  };

  const handleOpenVolunteerSignup = async () => {
    if (!volunteerSignupShareUrl) {
      Alert.alert('Signup link unavailable', 'The volunteer signup page could not be loaded yet.');
      return;
    }

    await openExternalUrl(volunteerSignupShareUrl);
  };

  const handleApprovalDecision = async (approvalId, approved) => {
    setDecisionLoadingId(approvalId);
    try {
      await decideApproval(approvalId, approved);
      await refreshVolunteerData();
    } catch (error) {
      Alert.alert('Approval update failed', error.message || 'The approval decision could not be saved.');
    } finally {
      setDecisionLoadingId(null);
    }
  };

  const focusVolunteerWidget = () => {
    const y = Math.max(0, (volunteerWidgetYRef.current || 0) - 90);
    operationsScrollRef.current?.scrollTo({ y, animated: true });
  };

  useEffect(() => {
    const focusVolunteerOps = Boolean(route?.params?.focusVolunteerOps);
    const initialVolunteerPrompt = route?.params?.initialVolunteerPrompt?.trim();

    if (!focusVolunteerOps && !initialVolunteerPrompt) return;

    const intentKey = `${focusVolunteerOps ? '1' : '0'}:${initialVolunteerPrompt || ''}`;
    if (intentKey === handledVolunteerIntentRef.current) return;
    handledVolunteerIntentRef.current = intentKey;

    setTimeout(() => {
      focusVolunteerWidget();
    }, 30);

    if (initialVolunteerPrompt) {
      setVolunteerDraftRequest(initialVolunteerPrompt);
      handleVolunteerDraft(initialVolunteerPrompt);
    }

    navigation.setParams({
      focusVolunteerOps: undefined,
      initialVolunteerPrompt: undefined,
    });
  }, [navigation, route?.params?.focusVolunteerOps, route?.params?.initialVolunteerPrompt]);

  const renderGrantPanel = () => (
    <View style={styles.toolContent}>
      <View style={[styles.workspaceSplit, isWide && styles.workspaceSplitWide]}>
        <View style={[styles.workspaceColumn, isWide && styles.workspaceColumnPrimary]}>
          <View style={styles.toolSectionHeader}>
            <View>
              <Text style={styles.toolTitle}>Grant workspace</Text>
              <Text style={styles.toolBody}>Kick off search and drafting here, then use the full screen only when you need deeper editing.</Text>
            </View>
            <View style={styles.runtimeStack}>
              <View style={styles.runtimeBadge}>
                <Text style={styles.runtimeBadgeText}>{runtimeStatus?.ai?.configured ? runtimeStatus.ai.provider : 'AI offline'}</Text>
              </View>
              <View style={styles.runtimeBadge}>
                <Text style={styles.runtimeBadgeText}>{runtimeStatus?.drive?.configured ? 'Drive ready' : 'Drive offline'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.promptRow}>
            {GRANT_QUICK_STARTS.map((starter) => (
              <TouchableOpacity
                key={starter.id}
                style={styles.promptChip}
                onPress={() => handleGrantSend(starter.prompt, starter.mode)}
                disabled={grantSending}
              >
                <Text style={styles.promptChipText}>{starter.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.chatComposer}>
            <TextInput
              style={styles.chatInput}
              value={grantComposer}
              onChangeText={setGrantComposer}
              placeholder="Ask the grant writer to search, draft, or prepare the next application..."
              placeholderTextColor="#94A3B8"
              multiline
            />
            <View style={styles.composerActions}>
              <TouchableOpacity
                style={[styles.primaryActionButton, (!grantComposer.trim() || grantSending) && styles.disabledButton]}
                onPress={() => handleGrantSend(grantComposer)}
                disabled={!grantComposer.trim() || grantSending}
              >
                {grantSending ? <ActivityIndicator size="small" color="#07121F" /> : <Ionicons name="sparkles" size={18} color="#07121F" />}
                <Text style={styles.primaryActionButtonText}>{grantSending ? 'Running...' : 'Send to grant writer'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryActionButton} onPress={handleCreateGrantChat}>
                <Ionicons name="add-circle-outline" size={18} color="#0F172A" />
                <Text style={styles.secondaryActionButtonText}>New chat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryActionButton}
                onPress={() => openGrantWriterScreen({ workspaceId: activeWorkspace?.id || null })}
              >
                <Ionicons name="open-outline" size={18} color="#0F172A" />
                <Text style={styles.secondaryActionButtonText}>Open full writer</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.metricMiniRow}>
            <View style={styles.metricMiniCard}>
              <Text style={styles.metricMiniValue}>{indexStatus?.totalOpportunities || 0}</Text>
              <Text style={styles.metricMiniLabel}>Indexed grants</Text>
            </View>
            <View style={styles.metricMiniCard}>
              <Text style={styles.metricMiniValue}>{pendingGrantReviews}</Text>
              <Text style={styles.metricMiniLabel}>Need review</Text>
            </View>
            <View style={styles.metricMiniCard}>
              <Text style={styles.metricMiniValue}>{latestDriveConnection?.status || 'offline'}</Text>
              <Text style={styles.metricMiniLabel}>Drive</Text>
            </View>
          </View>

          <View style={styles.inlineActionRow}>
            <TouchableOpacity
              style={[styles.secondaryActionButton, driveLoading && styles.disabledButton]}
              onPress={handleConnectDrive}
              disabled={driveLoading}
            >
              <Ionicons name="logo-google" size={18} color="#0F172A" />
              <Text style={styles.secondaryActionButtonText}>{driveLoading ? 'Connecting...' : 'Connect Drive'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryActionButton, indexRefreshing && styles.disabledButton]}
              onPress={handleRefreshGrantIndex}
              disabled={indexRefreshing}
            >
              <Ionicons name="refresh" size={18} color="#0F172A" />
              <Text style={styles.secondaryActionButtonText}>{indexRefreshing ? 'Refreshing...' : 'Refresh grant index'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.activityCard}>
            <View style={styles.activityHeader}>
              <Text style={styles.activityTitle}>Grant activity</Text>
              <View style={[styles.statusDot, activeWorkspace?.status === 'running' && styles.statusDotLive]} />
            </View>
            {grantLatestError ? (
              <Text style={styles.activityErrorText}>{grantLatestError}</Text>
            ) : null}
            {grantPreviewMessages.length ? grantPreviewMessages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.compactMessageRow,
                  message.role === 'user' ? styles.compactMessageRowUser : styles.compactMessageRowAssistant,
                ]}
              >
                <Text style={styles.compactMessageRole}>{message.role === 'user' ? 'You' : message.role === 'error' ? 'Error' : 'Agent'}</Text>
                <Text style={styles.compactMessageText} numberOfLines={3}>{message.content}</Text>
              </View>
            )) : (
              <Text style={styles.activityEmptyText}>Run a quick start or send a prompt and the latest grant work will show here immediately.</Text>
            )}
          </View>
        </View>

        <View style={[styles.workspaceColumn, isWide && styles.workspaceColumnSecondary]}>
          <Text style={styles.tableTitle}>Grant pipeline</Text>
          {grantLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#A78BFA" />
              <Text style={styles.loadingText}>Loading grant workspaces...</Text>
            </View>
          ) : (
            <View style={styles.tableWrap}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, styles.tableTitleCell]}>Workspace</Text>
                <Text style={styles.tableHeaderCell}>Status</Text>
                <Text style={styles.tableHeaderCell}>Drafts</Text>
                <Text style={styles.tableHeaderCell}>Drive</Text>
                <Text style={styles.tableHeaderCell}>Updated</Text>
              </View>
              {workspaceList.slice(0, 5).map((workspace) => (
                <TouchableOpacity
                  key={workspace.id}
                  style={[styles.tableRow, workspace.id === activeWorkspaceId && styles.tableRowActive]}
                  onPress={() => {
                    setActiveWorkspaceId(workspace.id);
                    refreshGrantWorkspace(workspace.id).catch(() => {});
                    refreshDriveStatus(workspace.id).catch(() => {});
                  }}
                >
                  <Text style={[styles.tableCell, styles.tableTitleCell]} numberOfLines={1}>{workspace.title || workspace.projectNeed || 'Grant chat'}</Text>
                  <Text style={styles.tableCell}>{workspace.status || 'idle'}</Text>
                  <Text style={styles.tableCell}>{workspace.draftCount || 0}</Text>
                  <Text style={styles.tableCell}>{workspace.driveStatus || 'offline'}</Text>
                  <Text style={styles.tableCell}>{formatDateTime(workspace.updatedAt)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activeWorkspace ? (
            <View style={styles.activeSummaryCard}>
              <Text style={styles.activeSummaryTitle}>Selected grant work</Text>
              <Text style={styles.activeSummaryHeadline}>{activeWorkspace.title || activeWorkspace.projectNeed || 'Grant chat'}</Text>
              <Text style={styles.activeSummaryMeta}>
                Deadline: {formatDate(getOpportunityDeadline(activeWorkspace.selectedOpportunity))}
              </Text>
              <Text style={styles.activeSummaryMeta}>
                {activeWorkspace.selectedOpportunity?.programName || activeWorkspace.selectedOpportunity?.funderName || 'No opportunity selected yet'}
              </Text>

              {(activeWorkspace.drafts || []).slice(0, 3).map((draft) => (
                <View key={draft.id} style={styles.draftRow}>
                  <View style={styles.draftCopy}>
                    <Text style={styles.draftTitle}>{draft.title}</Text>
                    <Text style={styles.draftMeta}>{draft.artifactType} • {formatDateTime(draft.updatedAt)}</Text>
                  </View>
                  <View style={[styles.reviewPill, { backgroundColor: `${reviewColor(draft.status)}18` }]}>
                    <Text style={[styles.reviewPillText, { color: reviewColor(draft.status) }]}>{draft.status}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );

  const renderVolunteerPanel = () => (
    <View style={styles.toolContent}>
      <View style={[styles.workspaceSplit, isWide && styles.workspaceSplitWide]}>
        <View style={[styles.workspaceColumn, isWide && styles.workspaceColumnPrimary]}>
          <View style={styles.toolSectionHeader}>
            <View>
              <Text style={styles.toolTitle}>Volunteer messaging</Text>
              <Text style={styles.toolBody}>Talk to the coordinator once, then target people with tags and buttons instead of more typing.</Text>
            </View>
            <View style={styles.workspaceActions}>
              <TouchableOpacity
                style={styles.secondaryActionButton}
                onPress={() => navigation.push('VolunteerRoster')}
              >
                <Ionicons name="people-outline" size={18} color="#0F172A" />
                <Text style={styles.secondaryActionButtonText}>Open roster</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inlineRefresh} onPress={refreshVolunteerData}>
                <Ionicons name="refresh" size={16} color="#0F172A" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.metricMiniRow}>
            <View style={styles.metricMiniCard}>
              <Text style={styles.metricMiniValue}>{volunteerSummary?.total_volunteers || 0}</Text>
              <Text style={styles.metricMiniLabel}>Roster</Text>
            </View>
            <View style={styles.metricMiniCard}>
              <Text style={styles.metricMiniValue}>{volunteerSummary?.active_volunteers || 0}</Text>
              <Text style={styles.metricMiniLabel}>Active</Text>
            </View>
            <View style={styles.metricMiniCard}>
              <Text style={styles.metricMiniValue}>{approvals.length}</Text>
              <Text style={styles.metricMiniLabel}>Approvals</Text>
            </View>
          </View>

          <View style={styles.promptRow}>
            {VOLUNTEER_PROMPT_STARTERS.map((starter) => (
              <TouchableOpacity
                key={starter}
                style={styles.promptChip}
                onPress={() => {
                  setVolunteerDraftRequest(starter);
                  handleVolunteerDraft(starter);
                }}
                disabled={volunteerDraftLoading}
              >
                <Text style={styles.promptChipText}>{starter}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.chatThreadCard}>
            <View style={styles.activityHeader}>
              <Text style={styles.activityTitle}>Coordinator chat</Text>
              <Text style={styles.chatLivePill}>{volunteerDraftLoading ? 'Thinking...' : 'Live'}</Text>
            </View>
            <View style={styles.compactChatStack}>
              {volunteerChatMessages.slice(-6).map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.chatBubbleMini,
                    message.role === 'user' ? styles.chatBubbleMiniUser : styles.chatBubbleMiniAssistant,
                  ]}
                >
                  <Text style={styles.chatBubbleMiniRole}>{message.role === 'user' ? 'You' : 'Coordinator'}</Text>
                  <Text style={[styles.chatBubbleMiniText, message.role === 'user' && styles.chatBubbleMiniTextUser]}>
                    {message.text}
                  </Text>
                </View>
              ))}
            </View>
            <TextInput
              style={styles.chatInput}
              value={volunteerDraftRequest}
              onChangeText={setVolunteerDraftRequest}
              placeholder="Ask the coordinator to draft or improve the SMS copy..."
              placeholderTextColor="#94A3B8"
              multiline
            />

            <View style={styles.inlineActionRow}>
              <TouchableOpacity
                style={[styles.primaryActionButton, (!volunteerDraftRequest.trim() || volunteerDraftLoading) && styles.disabledButton]}
                onPress={() => handleVolunteerDraft(volunteerDraftRequest)}
                disabled={!volunteerDraftRequest.trim() || volunteerDraftLoading}
              >
                {volunteerDraftLoading ? <ActivityIndicator size="small" color="#07121F" /> : <Ionicons name="chatbubble-ellipses" size={18} color="#07121F" />}
                <Text style={styles.primaryActionButtonText}>{volunteerDraftLoading ? 'Drafting...' : 'Draft with coordinator'}</Text>
              </TouchableOpacity>
              {latestVolunteerDraft ? (
                <TouchableOpacity style={styles.secondaryActionButton} onPress={() => setSmsMessage(latestVolunteerDraft)}>
                  <Ionicons name="copy-outline" size={18} color="#0F172A" />
                  <Text style={styles.secondaryActionButtonText}>Use latest draft</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        <View style={[styles.workspaceColumn, isWide && styles.workspaceColumnSecondary]}>
          <View style={styles.inlineFormCard}>
            <View style={styles.activityHeader}>
              <Text style={styles.inlineFormTitle}>Volunteer intake</Text>
              <TouchableOpacity style={styles.secondaryActionButton} onPress={handleOpenVolunteerSignup}>
                <Ionicons name="open-outline" size={18} color="#0F172A" />
                <Text style={styles.secondaryActionButtonText}>Open form</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inlineFormHint}>Anyone can scan this QR code, enter their information, and land directly in the live volunteer roster.</Text>
            {volunteerSignupQrUrl ? (
              <View style={styles.signupQrRow}>
                <Image source={{ uri: volunteerSignupQrUrl }} style={styles.signupQrImage} />
                <View style={styles.signupQrCopy}>
                  <Text style={styles.signupQrTitle}>Live signup page</Text>
                  <Text style={styles.signupQrMeta}>{volunteerSignupShareUrl}</Text>
                  <Text style={styles.signupQrMeta}>New signups are tagged as new-volunteer automatically.</Text>
                </View>
              </View>
            ) : (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#34D399" />
                <Text style={styles.loadingText}>Loading signup QR...</Text>
              </View>
            )}
          </View>

          <View style={styles.inlineFormCard}>
            <Text style={styles.inlineFormTitle}>Broadcast controls</Text>
            <Text style={styles.inlineFormHint}>Switch audiences with taps only, then send the latest coordinator draft or your edited copy.</Text>
            <View style={styles.modeRow}>
              {[
                { key: 'all', label: 'All active' },
                { key: 'tag', label: 'By tag' },
                { key: 'selected', label: 'Selected' },
              ].map((mode) => (
                <TouchableOpacity
                  key={mode.key}
                  style={[styles.modeChip, recipientMode === mode.key && styles.modeChipActive]}
                  onPress={() => setRecipientMode(mode.key)}
                >
                  <Text style={[styles.modeChipText, recipientMode === mode.key && styles.modeChipTextActive]}>{mode.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.selectionWrap}>
              <TouchableOpacity
                style={[styles.selectionChip, recipientMode === 'all' && !selectedTag && styles.selectionChipActive]}
                onPress={() => {
                  setRecipientMode('all');
                  setSelectedTag('');
                }}
              >
                <Text style={[styles.selectionChipText, recipientMode === 'all' && !selectedTag && styles.selectionChipTextActive]}>All volunteers</Text>
              </TouchableOpacity>
              {volunteerTags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={[styles.selectionChip, selectedTag === tag && styles.selectionChipActive]}
                  onPress={() => {
                    setRecipientMode('tag');
                    setSelectedTag(tag);
                  }}
                >
                  <Text style={[styles.selectionChipText, selectedTag === tag && styles.selectionChipTextActive]}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.chatInput}
              value={smsMessage}
              onChangeText={setSmsMessage}
              placeholder="SMS text to send out..."
              placeholderTextColor="#94A3B8"
              multiline
            />

            <TouchableOpacity
              style={[styles.primaryActionButton, (!smsMessage.trim() || smsSending) && styles.disabledButton]}
              onPress={handleSendVolunteerSms}
              disabled={!smsMessage.trim() || smsSending}
            >
              {smsSending ? <ActivityIndicator size="small" color="#07121F" /> : <Ionicons name="send" size={18} color="#07121F" />}
              <Text style={styles.primaryActionButtonText}>
                {smsSending
                  ? 'Sending...'
                  : recipientMode === 'tag'
                    ? `Send to ${selectedTag || 'tagged group'}`
                    : recipientMode === 'selected'
                      ? `Send to ${selectedVolunteerIds.length || 0} selected`
                      : 'Broadcast to all active'}
              </Text>
            </TouchableOpacity>
          </View>

          {approvals.slice(0, 2).map((approval) => (
            <View key={approval.id} style={styles.approvalCard}>
              <View style={styles.approvalHeader}>
                <Text style={styles.approvalType}>{approval.action_type}</Text>
                <Text style={styles.approvalTime}>{formatDateTime(approval.created_at)}</Text>
              </View>
              <Text style={styles.approvalBody}>
                {typeof approval.payload === 'string' ? approval.payload : JSON.stringify(approval.payload)}
              </Text>
              <View style={styles.inlineActionRow}>
                <TouchableOpacity
                  style={[styles.approvalButton, styles.approveButton]}
                  onPress={() => handleApprovalDecision(approval.id, true)}
                  disabled={decisionLoadingId === approval.id}
                >
                  {decisionLoadingId === approval.id ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.approvalButtonText}>Approve</Text>}
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

          <View style={styles.inlineFormCard}>
            <View style={styles.activityHeader}>
              <Text style={styles.inlineFormTitle}>Volunteer roster cloud</Text>
              <Text style={styles.selectionHint}>{selectedVolunteerIds.length} selected</Text>
            </View>
            <Text style={styles.inlineFormHint}>Tap people to group them. Hover a bubble to reveal contact details before you broadcast.</Text>
            <View style={styles.selectionWrap}>
              {VOLUNTEER_GROUP_TAGS.map((tag) => (
                <TouchableOpacity
                  key={tag.key}
                  style={[styles.selectionChip, volunteerTagLoading && styles.disabledButton]}
                  onPress={() => handleApplyVolunteerTag(tag.key)}
                  disabled={volunteerTagLoading}
                >
                  <Text style={styles.selectionChipText}>{tag.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.selectionChip}
                onPress={() => setSelectedVolunteerIds([])}
              >
                <Text style={styles.selectionChipText}>Clear selection</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.rosterBubbleWrap}>
              {volunteerLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#34D399" />
                  <Text style={styles.loadingText}>Loading roster...</Text>
                </View>
              ) : visibleVolunteers.slice(0, 18).map((volunteer, index) => {
                const selected = selectedVolunteerIds.includes(volunteer.id);
                return (
                  <Pressable
                    key={volunteer.id}
                    onPress={() => handleVolunteerSelection(volunteer.id)}
                    style={({ hovered, pressed }) => [
                      styles.rosterBubble,
                      selected && styles.rosterBubbleSelected,
                      hovered && styles.rosterBubbleHovered,
                      pressed && styles.rosterBubblePressed,
                      { transform: [{ rotate: `${((index % 3) - 1) * 1.5}deg` }] },
                    ]}
                  >
                    {({ hovered }) => (
                      <View>
                        <Text style={[styles.rosterBubbleName, selected && styles.rosterBubbleNameSelected]}>{volunteer.name}</Text>
                        {(hovered || selected) ? (
                          <>
                            <Text style={styles.rosterBubbleMeta}>{volunteer.phone_e164}</Text>
                            {volunteer.email ? <Text style={styles.rosterBubbleMeta}>{volunteer.email}</Text> : null}
                          </>
                        ) : null}
                        <View style={styles.tagRow}>
                          {(volunteer.tags || []).slice(0, 2).map((tag) => (
                            <View key={`${volunteer.id}-${tag}`} style={styles.tagPill}>
                              <Text style={styles.tagPillText}>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  if (grantLoading && volunteerLoading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <AppScreenBackground />
        <ActivityIndicator size="large" color="#A78BFA" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppScreenBackground />

      <ScrollView
        ref={operationsScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} />}
      >
        <View style={styles.topStrip}>
          <View style={styles.titleBlock}>
            <Text style={styles.pageLabel}>Operations</Text>
            <Text style={styles.pageTitle}>Keep the back office tight and visible.</Text>
          </View>
          <View style={styles.topActionRow}>
            <TouchableOpacity style={styles.topAction} onPress={() => navigation.navigate('Map')}>
              <Ionicons name="map" size={16} color="#D1FAE5" />
              <Text style={styles.topActionText}>Back to map</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.topAction} onPress={() => navigation.navigate('Map', { focusLayer: 'events', openCalendarPanel: true })}>
              <Ionicons name="flame" size={16} color="#D1FAE5" />
              <Text style={styles.topActionText}>Open meal layer</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.widgetStrip}>
          {summaryWidgets.map((item) => (
            <GlassSurface key={item.label} style={styles.widgetCard} padding={12}>
              <View style={[styles.widgetIcon, { backgroundColor: `${item.color}20` }]}>
                <Ionicons name={item.icon} size={14} color={item.color} />
              </View>
              <Text style={styles.widgetValue}>{item.value}</Text>
              <Text style={styles.widgetLabel}>{item.label}</Text>
              <Text style={styles.widgetDetail}>{item.detail}</Text>
            </GlassSurface>
          ))}
        </View>

        <GlassSurface preset="dark" style={styles.mainBoard} padding={18}>
          <View style={styles.boardHeader}>
            <View>
              <Text style={styles.boardTitle}>Mission widgets</Text>
              <Text style={styles.boardSubtitle}>Everything stays in one surface: grants on top, volunteer ops right below it.</Text>
            </View>
          </View>

          <View style={styles.toolContent}>
            {renderGrantPanel()}
            <View
              ref={volunteerWidgetRef}
              onLayout={(event) => {
                volunteerWidgetYRef.current = event.nativeEvent.layout.y;
              }}
              style={styles.volunteerWidgetAnchor}
            >
              <Text style={styles.widgetSectionTitle}>Volunteer Ops Widget</Text>
              <Text style={styles.widgetSectionSubtitle}>Chat, broadcast, approvals, and roster grouping in one compact block.</Text>
              {renderVolunteerPanel()}
            </View>
          </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#07121F',
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
    paddingBottom: 112,
    gap: 14,
  },
  topStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
  },
  pageLabel: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  pageTitle: {
    color: 'white',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
  },
  topActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  topAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.50)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  topActionText: {
    color: '#D1FAE5',
    fontSize: 12,
    fontWeight: '800',
  },
  widgetStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  widgetCard: {
    minWidth: 170,
    flex: 1,
  },
  widgetIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  widgetValue: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  widgetLabel: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  widgetDetail: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
  },
  mainBoard: {
    overflow: 'hidden',
  },
  boardHeader: {
    marginBottom: 16,
  },
  boardTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  boardSubtitle: {
    color: '#D7F1E7',
    fontSize: 13,
    lineHeight: 18,
  },
  widgetSectionTitle: {
    color: '#D1FAE5',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  widgetSectionSubtitle: {
    color: '#9DC7B7',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  volunteerWidgetAnchor: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
    paddingTop: 14,
    marginTop: 2,
  },
  workspaceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineRefresh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  toolContent: {
    gap: 14,
  },
  workspaceSplit: {
    gap: 14,
  },
  workspaceSplitWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  workspaceColumn: {
    gap: 14,
  },
  workspaceColumnPrimary: {
    flex: 1.1,
  },
  workspaceColumnSecondary: {
    flex: 0.9,
  },
  toolSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  toolTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  toolBody: {
    color: '#D7F1E7',
    fontSize: 13,
    lineHeight: 19,
  },
  runtimeStack: {
    gap: 8,
    alignItems: 'flex-end',
  },
  runtimeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  runtimeBadgeText: {
    color: '#D1FAE5',
    fontSize: 12,
    fontWeight: '800',
  },
  promptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  promptChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  promptChipText: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  chatComposer: {
    gap: 10,
  },
  chatInput: {
    minHeight: 96,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: 'white',
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  composerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#D1FAE5',
    alignSelf: 'flex-start',
  },
  primaryActionButtonText: {
    color: '#07121F',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.84)',
    alignSelf: 'flex-start',
  },
  secondaryActionButtonText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.55,
  },
  metricMiniRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricMiniCard: {
    flex: 1,
    minWidth: 110,
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  metricMiniValue: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
    textTransform: 'capitalize',
  },
  metricMiniLabel: {
    color: '#D7F1E7',
    fontSize: 12,
    fontWeight: '700',
  },
  inlineActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  activityCard: {
    borderRadius: 18,
    padding: 14,
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  activityTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(148,163,184,0.7)',
  },
  statusDotLive: {
    backgroundColor: '#34D399',
  },
  activityErrorText: {
    color: '#FCA5A5',
    fontSize: 12,
    lineHeight: 18,
  },
  compactMessageRow: {
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  compactMessageRowUser: {
    backgroundColor: 'rgba(209,250,229,0.14)',
  },
  compactMessageRowAssistant: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  compactMessageRole: {
    color: '#A7F3D0',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  compactMessageText: {
    color: 'white',
    fontSize: 13,
    lineHeight: 19,
  },
  activityEmptyText: {
    color: '#D7F1E7',
    fontSize: 12,
    lineHeight: 18,
  },
  tableTitle: {
    color: '#D1FAE5',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#D7F1E7',
    fontSize: 13,
  },
  tableWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tableHeaderCell: {
    flex: 0.8,
    color: '#A7F3D0',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  tableTitleCell: {
    flex: 1.6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  tableRowActive: {
    backgroundColor: 'rgba(167,243,208,0.10)',
  },
  tableCell: {
    flex: 0.8,
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  activeSummaryCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'rgba(6,78,59,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(167,243,208,0.16)',
    gap: 8,
  },
  activeSummaryTitle: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  activeSummaryHeadline: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  activeSummaryMeta: {
    color: '#D7F1E7',
    fontSize: 13,
    lineHeight: 18,
  },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 8,
  },
  draftCopy: {
    flex: 1,
  },
  draftTitle: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  draftMeta: {
    color: '#D7F1E7',
    fontSize: 12,
  },
  chatThreadCard: {
    borderRadius: 20,
    padding: 14,
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chatLivePill: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '800',
  },
  compactChatStack: {
    gap: 8,
  },
  chatBubbleMini: {
    borderRadius: 16,
    padding: 12,
    gap: 5,
    maxWidth: '92%',
  },
  chatBubbleMiniUser: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(209,250,229,0.92)',
  },
  chatBubbleMiniAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  chatBubbleMiniRole: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: '#475569',
  },
  chatBubbleMiniText: {
    color: 'white',
    fontSize: 13,
    lineHeight: 18,
  },
  chatBubbleMiniTextUser: {
    color: '#052E16',
  },
  reviewPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  reviewPillText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  modeChipActive: {
    backgroundColor: '#D1FAE5',
    borderColor: '#D1FAE5',
  },
  modeChipText: {
    color: '#D7F1E7',
    fontSize: 12,
    fontWeight: '800',
  },
  modeChipTextActive: {
    color: '#07121F',
  },
  selectionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectionChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  selectionChipActive: {
    backgroundColor: 'rgba(167,243,208,0.18)',
    borderColor: 'rgba(167,243,208,0.38)',
  },
  selectionChipText: {
    color: '#D7F1E7',
    fontSize: 12,
    fontWeight: '700',
  },
  selectionChipTextActive: {
    color: '#D1FAE5',
  },
  selectionHint: {
    color: '#D7F1E7',
    fontSize: 12,
  },
  inlineFormCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    gap: 10,
  },
  inlineFormTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  inlineFormHint: {
    color: '#D7F1E7',
    fontSize: 12,
    lineHeight: 18,
  },
  inlineField: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    color: 'white',
    fontSize: 13,
  },
  approvalCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,247,237,0.88)',
    borderWidth: 1,
    borderColor: '#FED7AA',
    gap: 10,
  },
  approvalHeader: {
    gap: 4,
  },
  approvalType: {
    color: '#9A3412',
    fontSize: 14,
    fontWeight: '800',
  },
  approvalTime: {
    color: '#C2410C',
    fontSize: 11,
    fontWeight: '700',
  },
  approvalBody: {
    color: '#9A3412',
    fontSize: 13,
    lineHeight: 18,
  },
  approvalButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
  signupQrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  signupQrImage: {
    width: 110,
    height: 110,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  signupQrCopy: {
    flex: 1,
    gap: 6,
  },
  signupQrTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  signupQrMeta: {
    color: '#D7F1E7',
    fontSize: 12,
    lineHeight: 18,
  },
  rosterList: {
    gap: 10,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rosterCopy: {
    flex: 1,
  },
  rosterName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 3,
  },
  rosterMeta: {
    color: '#D7F1E7',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rosterBubbleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  rosterBubble: {
    minWidth: 136,
    maxWidth: '48%',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  rosterBubbleSelected: {
    backgroundColor: 'rgba(209,250,229,0.18)',
    borderColor: 'rgba(209,250,229,0.42)',
  },
  rosterBubbleHovered: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  rosterBubblePressed: {
    opacity: 0.82,
  },
  rosterBubbleName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  rosterBubbleNameSelected: {
    color: '#D1FAE5',
  },
  rosterBubbleMeta: {
    color: '#D7F1E7',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 2,
  },
  tagPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tagPillText: {
    color: '#D7F1E7',
    fontSize: 11,
    fontWeight: '700',
  },
});
