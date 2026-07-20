import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AppScreenBackground from '../components/ui/AppScreenBackground';
import GlassSurface from '../components/ui/GlassSurface';
import {
  connectGrantWriterDrive,
  createGrantWriterWorkspace,
  getGrantWriterDriveStatus,
  getGrantWriterIndexStatus,
  getGrantWriterWorkspace,
  listGrantWriterWorkspaces,
  refreshGrantWriterIndex,
  reviewGrantWriterDraft,
  selectGrantWriterOpportunity,
  sendGrantWriterWorkspaceMessage,
  syncGrantWriterDraftToDrive,
  updateGrantWriterDraft,
  updateGrantWriterWorkspace,
} from '../api/agentService';

const QUICK_STARTS = [
  {
    id: 'search-food-access',
    label: 'Find best-fit grants',
    prompt: 'Search for the best grant opportunities for MVOE food beacons, community meals, and emergency food response.',
    mode: 'search',
  },
  {
    id: 'draft-beacon',
    label: 'Draft a beacon grant brief',
    prompt: 'Draft a grant brief for expanding MVOE food beacon coverage and community meal support in Austin.',
    mode: 'draft',
  },
  {
    id: 'draft-volunteers',
    label: 'Write a staffing narrative',
    prompt: 'Write a grant narrative that explains how volunteer coordination supports MVOE food access and public meals.',
    mode: 'draft',
  },
  {
    id: 'prepare-application',
    label: 'Prepare selected application',
    prompt: 'Prepare the application workflow for the selected grant opportunity and stop before submission.',
    mode: 'prepare-application',
  },
];

function formatTime(value) {
  if (!value) return '';

  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateTime(value) {
  if (!value) return '';

  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildWorkspaceTitle(workspace) {
  return workspace?.title || workspace?.projectNeed || 'New grant chat';
}

function buildProfileState(workspace) {
  return {
    organizationName: workspace?.organizationName || 'MVOE',
    projectNeed: workspace?.projectNeed || '',
    amountTarget: workspace?.amountTarget || '',
    location: workspace?.location || '',
    mission: workspace?.mission || '',
  };
}

function artifactLabel(type) {
  switch (type) {
    case 'opportunity_search':
      return 'Opportunity search';
    case 'application_preparation':
      return 'Application prep';
    case 'grant_brief':
      return 'Grant brief';
    default:
      return 'Grant artifact';
  }
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

function buildDraftEditor(draft) {
  const data = draft?.data || {};
  const sections = data?.draftSections || {};

  return {
    title: draft?.title || '',
    summary: draft?.summary || '',
    executiveSummary: sections.executiveSummary || '',
    needStatement: sections.needStatement || '',
    programDescription: sections.programDescription || '',
    outcomesAndEvaluation: sections.outcomesAndEvaluation || '',
    budgetNarrative: sections.budgetNarrative || '',
    applicationChecklistText: Array.isArray(data?.applicationChecklist)
      ? data.applicationChecklist.join('\n')
      : '',
    reviewNotes: draft?.reviewNotes || '',
  };
}

function buildUpdatedDraftData(draft, editor) {
  const nextData = {
    ...(draft?.data || {}),
  };

  if (draft?.artifactType === 'grant_brief') {
    nextData.draftSections = {
      ...(nextData.draftSections || {}),
      executiveSummary: editor.executiveSummary.trim(),
      needStatement: editor.needStatement.trim(),
      programDescription: editor.programDescription.trim(),
      outcomesAndEvaluation: editor.outcomesAndEvaluation.trim(),
      budgetNarrative: editor.budgetNarrative.trim(),
    };

    nextData.applicationChecklist = editor.applicationChecklistText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return nextData;
}

function mergeWorkspaceConnection(workspace, connection) {
  if (!workspace || !connection) return workspace;
  return {
    ...workspace,
    driveConnection: connection,
  };
}

async function openExternalUrl(url) {
  if (!url) return;

  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  await Linking.openURL(url);
}

function hasMeaningfulWorkspaceContent(workspace) {
  if (!workspace) return false;
  if ((workspace.messages || []).length > 1) return true;
  if ((workspace.drafts || []).length > 0) return true;
  return Boolean(workspace.projectNeed);
}

function getApiErrorMessage(error, fallbackMessage) {
  const status = error?.response?.status;
  const code = error?.response?.data?.code || error?.response?.data?.errorCode || null;
  const message = error?.response?.data?.error || error?.message || fallbackMessage;
  return { status, code, message };
}

export default function GrantWriterScreen({ navigation, route }) {
  const chatScrollRef = useRef(null);
  const handledPrefillRef = useRef('');
  const handledLaunchRef = useRef('');
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1320;
  const isWide = width >= 980;
  const [workspaceList, setWorkspaceList] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [profile, setProfile] = useState(buildProfileState(null));
  const [composer, setComposer] = useState('');
  const [selectedDraftId, setSelectedDraftId] = useState(null);
  const [draftEditor, setDraftEditor] = useState(buildDraftEditor(null));
  const [bootstrapping, setBootstrapping] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [sending, setSending] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [indexStatus, setIndexStatus] = useState(null);
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [indexRefreshing, setIndexRefreshing] = useState(false);
  const [runNotice, setRunNotice] = useState(null);

  const selectedDraft = useMemo(
    () => activeWorkspace?.drafts?.find((draft) => draft.id === selectedDraftId) || activeWorkspace?.drafts?.[0] || null,
    [activeWorkspace, selectedDraftId]
  );

  const driveConnection = activeWorkspace?.driveConnection || null;
  const pendingReviewCount = activeWorkspace?.drafts?.filter((draft) => draft.status === 'needs_review').length || 0;
  const selectedOpportunity = activeWorkspace?.selectedOpportunity || null;
  const latestDriveUrl = selectedDraft?.driveFileUrl || activeWorkspace?.driveSyncs?.find((sync) => sync.fileUrl)?.fileUrl || null;
  const latestWorkspaceError = [...(activeWorkspace?.messages || [])].reverse().find((message) => message.role === 'error')?.content || null;

  useEffect(() => {
    if (!selectedDraft?.id) {
      setDraftEditor(buildDraftEditor(null));
      return;
    }

    setDraftEditor(buildDraftEditor(selectedDraft));
  }, [selectedDraft?.id]);

  useEffect(() => {
    if (!activeWorkspace?.id) return;

    setProfile(buildProfileState(activeWorkspace));
  }, [activeWorkspace?.id]);

  useEffect(() => {
    const routeWorkspaceId = route?.params?.workspaceId;
    if (!routeWorkspaceId || bootstrapping || routeWorkspaceId === activeWorkspaceId) {
      return;
    }

    loadWorkspaceDetail(routeWorkspaceId).catch((error) => {
      Alert.alert('Workspace load failed', error.message || 'The requested grant workspace could not be opened.');
    });
  }, [activeWorkspaceId, bootstrapping, route?.params?.workspaceId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 60);

    return () => clearTimeout(timer);
  }, [activeWorkspace?.messages?.length]);

  useEffect(() => {
    if (!activeWorkspace?.id || activeWorkspace.status !== 'running') {
      return undefined;
    }

    const intervalId = setInterval(() => {
      refreshActiveWorkspace(activeWorkspace.id).catch(() => {});
    }, 1500);

    return () => clearInterval(intervalId);
  }, [activeWorkspace?.id, activeWorkspace?.status]);

  useEffect(() => {
    if (!activeWorkspace?.id) {
      return undefined;
    }

    loadDriveStatus({ workspaceId: activeWorkspace.id, silent: true }).catch(() => {});
    return undefined;
  }, [activeWorkspace?.id]);

  const loadIndexStatus = async ({ silent = false } = {}) => {
    try {
      if (!silent) setIndexRefreshing(true);
      const response = await getGrantWriterIndexStatus();
      setIndexStatus(response.snapshot || null);
      setRuntimeStatus(response.runtime || null);
    } catch (_error) {
      if (!silent) {
        setIndexStatus(null);
        setRuntimeStatus(null);
      }
    } finally {
      if (!silent) setIndexRefreshing(false);
    }
  };

  const loadWorkspaceList = async (preferredWorkspaceId = null) => {
    const response = await listGrantWriterWorkspaces();
    const items = response.workspaces || [];
    setWorkspaceList(items);

    const nextId = preferredWorkspaceId
      || activeWorkspaceId
      || items[0]?.id
      || null;

    return { items, nextId };
  };

  const loadWorkspaceDetail = async (workspaceId) => {
    if (!workspaceId) return null;

    setWorkspaceLoading(true);
    try {
      const response = await getGrantWriterWorkspace(workspaceId);
      const workspace = response.workspace || null;
      setActiveWorkspace(workspace);
      setActiveWorkspaceId(workspace?.id || null);
      setSelectedDraftId((current) => (
        current && workspace?.drafts?.some((draft) => draft.id === current)
          ? current
          : workspace?.drafts?.[0]?.id || null
      ));
      return workspace;
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const bootstrap = async () => {
    setBootstrapping(true);
    try {
      await loadIndexStatus({ silent: true });
      const { items, nextId } = await loadWorkspaceList();

      if (items.length === 0) {
        const created = await createGrantWriterWorkspace({});
        const workspace = created.workspace;
        setWorkspaceList([
          {
            id: workspace.id,
            title: workspace.title,
            status: workspace.status,
            organizationName: workspace.organizationName,
            preview: workspace.messages?.[0]?.content || 'Start a new grant conversation.',
            latestDraftStatus: null,
            latestDraftType: null,
            driveStatus: workspace.driveConnection?.status || 'disconnected',
            draftCount: 0,
            messageCount: workspace.messages?.length || 0,
            updatedAt: workspace.updatedAt,
            lastActivityAt: workspace.lastActivityAt,
          },
        ]);
        setActiveWorkspace(workspace);
        setActiveWorkspaceId(workspace.id);
      } else {
        await loadWorkspaceDetail(nextId);
      }
    } catch (error) {
      Alert.alert('Grant workspace unavailable', error.message || 'The grant writer workspace could not be loaded.');
    } finally {
      setBootstrapping(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    const prefill = route?.params?.prefill;
    const prefillKey = JSON.stringify(prefill || {});

    if (!prefill || prefillKey === '{}' || prefillKey === handledPrefillRef.current || bootstrapping || !activeWorkspace) {
      return;
    }

    handledPrefillRef.current = prefillKey;

    const applyPrefill = async () => {
      const targetWorkspace = hasMeaningfulWorkspaceContent(activeWorkspace)
        ? (await createGrantWriterWorkspace(prefill)).workspace
        : (await updateGrantWriterWorkspace(activeWorkspace.id, prefill)).workspace;

      setActiveWorkspace(targetWorkspace);
      setActiveWorkspaceId(targetWorkspace.id);
      const { items } = await loadWorkspaceList(targetWorkspace.id);
      if (!items.some((item) => item.id === targetWorkspace.id)) {
        setWorkspaceList((current) => current);
      }
      navigation.setParams({ prefill: undefined });
    };

    applyPrefill().catch((error) => {
      Alert.alert('Prefill failed', error.message || 'The grant workspace could not be updated from the map context.');
    });
  }, [activeWorkspace, bootstrapping, navigation, route?.params?.prefill]);

  useEffect(() => {
    const launchPrompt = route?.params?.launchPrompt?.trim();
    const launchMode = route?.params?.launchMode || null;
    const launchKey = JSON.stringify({
      launchPrompt,
      launchMode,
      workspaceId: route?.params?.workspaceId || activeWorkspace?.id || null,
    });

    if (!launchPrompt || bootstrapping || handledLaunchRef.current === launchKey) {
      return;
    }

    handledLaunchRef.current = launchKey;

    const runLaunchPrompt = async () => {
      let targetWorkspace = activeWorkspace;

      if (!targetWorkspace?.id) {
        const created = await createGrantWriterWorkspace({});
        targetWorkspace = created.workspace;
        setActiveWorkspace(targetWorkspace);
        setActiveWorkspaceId(targetWorkspace.id);
        await loadWorkspaceList(targetWorkspace.id);
      }

      if (targetWorkspace?.id && hasMeaningfulWorkspaceContent(targetWorkspace) && !route?.params?.workspaceId) {
        const created = await createGrantWriterWorkspace({});
        targetWorkspace = created.workspace;
        setActiveWorkspace(targetWorkspace);
        setActiveWorkspaceId(targetWorkspace.id);
        await loadWorkspaceList(targetWorkspace.id);
      }

      const response = await sendGrantWriterWorkspaceMessage(targetWorkspace.id, {
        message: launchPrompt,
        mode: launchMode,
        profile: buildProfileState(targetWorkspace),
      });
      setActiveWorkspace(response.workspace);
      await loadWorkspaceList(response.workspace?.id || targetWorkspace.id);
      navigation.setParams({
        launchPrompt: undefined,
        launchMode: undefined,
        workspaceId: targetWorkspace.id,
      });
    };

    runLaunchPrompt().catch((error) => {
      Alert.alert('Grant launch failed', error.message || 'The grant writer could not start from that button.');
    });
  }, [activeWorkspace, bootstrapping, navigation, route?.params?.launchMode, route?.params?.launchPrompt, route?.params?.workspaceId]);

  const refreshActiveWorkspace = async (workspaceId = activeWorkspaceId) => {
    const workspace = await loadWorkspaceDetail(workspaceId);
    await loadWorkspaceList(workspaceId);
    return workspace;
  };

  const loadDriveStatus = async ({ workspaceId = activeWorkspaceId, silent = false } = {}) => {
    if (!workspaceId) return null;

    try {
      if (!silent) setDriveLoading(true);
      const response = await getGrantWriterDriveStatus(workspaceId);
      const connection = response.connection || null;

      setActiveWorkspace((current) => (
        current?.id === workspaceId
          ? mergeWorkspaceConnection(current, connection)
          : current
      ));
      await loadWorkspaceList(workspaceId);
      return connection;
    } catch (error) {
      if (!silent) {
        Alert.alert('Drive refresh failed', error.message || 'The Drive status could not be refreshed.');
      }
      throw error;
    } finally {
      if (!silent) setDriveLoading(false);
    }
  };

  const handleCreateWorkspace = async () => {
    try {
      const created = await createGrantWriterWorkspace({});
      setActiveWorkspace(created.workspace);
      setActiveWorkspaceId(created.workspace.id);
      setComposer('');
      setRunNotice({ tone: 'success', message: 'New grant chat ready.' });
      await loadWorkspaceList(created.workspace.id);
    } catch (error) {
      const parsed = getApiErrorMessage(error, 'A new grant chat could not be created.');
      setRunNotice({ tone: 'error', message: parsed.message });
      Alert.alert('New chat failed', parsed.message);
    }
  };

  const handleSaveProfile = async () => {
    if (!activeWorkspace?.id || savingProfile) return;

    setSavingProfile(true);
    try {
      const response = await updateGrantWriterWorkspace(activeWorkspace.id, profile);
      setActiveWorkspace(response.workspace);
      await loadWorkspaceList(activeWorkspace.id);
    } catch (error) {
      Alert.alert('Profile save failed', error.message || 'The grant profile could not be updated.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSend = async (messageText = composer, mode = null) => {
    if (sending) return;

    const trimmed = String(messageText || '').trim();
    if (!trimmed) {
      setRunNotice({ tone: 'error', message: 'Type a prompt before sending.' });
      return;
    }

    if (messageText === composer) {
      setComposer('');
    }

    if (activeWorkspace?.status === 'running') {
      setRunNotice({ tone: 'info', message: 'Grant writer is already running. Wait for this turn to finish, then send the next prompt.' });
      await refreshActiveWorkspace(activeWorkspace.id).catch(() => {});
      return;
    }

    setSending(true);
    setRunNotice({ tone: 'info', message: 'Grant writer is running your request...' });
    try {
      let workspaceId = activeWorkspace?.id;
      if (!workspaceId) {
        const created = await createGrantWriterWorkspace({});
        workspaceId = created.workspace?.id;
        setActiveWorkspace(created.workspace || null);
        setActiveWorkspaceId(workspaceId || null);
        await loadWorkspaceList(workspaceId);
      }

      if (!workspaceId) {
        throw new Error('Grant workspace unavailable. Create a new chat and try again.');
      }

      const response = await sendGrantWriterWorkspaceMessage(workspaceId, {
        message: trimmed,
        mode,
        profile,
      });
      const responseWorkspace = response?.workspace || null;
      const nextWorkspaceId = responseWorkspace?.id || workspaceId;

      if (responseWorkspace) {
        setActiveWorkspace(responseWorkspace);
        setActiveWorkspaceId(nextWorkspaceId);
      } else {
        await refreshActiveWorkspace(nextWorkspaceId);
      }

      await loadWorkspaceList(nextWorkspaceId);
      setRunNotice({
        tone: 'success',
        message: mode === 'search' ? 'Searching best-fit grants now.' : 'Grant writer turn accepted.',
      });
    } catch (error) {
      const parsed = getApiErrorMessage(error, 'The grant writer could not complete this request.');
      const isRunningConflict = parsed.status === 409 || parsed.code === 'GRANT_WORKSPACE_RUNNING';

      if (activeWorkspace?.id) {
        await refreshActiveWorkspace(activeWorkspace.id).catch(() => {});
      }

      if (isRunningConflict) {
        setRunNotice({ tone: 'info', message: 'Grant writer is already running. Wait for completion before sending again.' });
        return;
      }

      setRunNotice({ tone: 'error', message: parsed.message });
      Alert.alert('Grant writer failed', parsed.message);
    } finally {
      setSending(false);
    }
  };

  const handleSelectOpportunity = async (opportunity) => {
    if (!activeWorkspace?.id) return;

    try {
      const response = await selectGrantWriterOpportunity(activeWorkspace.id, opportunity);
      setActiveWorkspace(response.workspace);
      await loadWorkspaceList(activeWorkspace.id);
    } catch (error) {
      Alert.alert('Selection failed', error.message || 'The grant opportunity could not be selected.');
    }
  };

  const handleReviewDraft = async (approved) => {
    if (!activeWorkspace?.id || !selectedDraft?.id) return;

    try {
      const response = await reviewGrantWriterDraft(activeWorkspace.id, selectedDraft.id, {
        approved,
        notes: draftEditor.reviewNotes,
      });
      setActiveWorkspace(response.workspace);
      await loadWorkspaceList(activeWorkspace.id);
    } catch (error) {
      Alert.alert('Review failed', error.message || 'The draft review could not be saved.');
    }
  };

  const handleSaveDraft = async () => {
    if (!activeWorkspace?.id || !selectedDraft?.id || draftSaving) return;

    setDraftSaving(true);
    try {
      const response = await updateGrantWriterDraft(activeWorkspace.id, selectedDraft.id, {
        title: draftEditor.title,
        summary: draftEditor.summary,
        reviewNotes: draftEditor.reviewNotes,
        data: buildUpdatedDraftData(selectedDraft, draftEditor),
      });
      setActiveWorkspace(response.workspace);
      await loadWorkspaceList(activeWorkspace.id);
    } catch (error) {
      Alert.alert('Draft save failed', error.message || 'The draft edits could not be saved.');
    } finally {
      setDraftSaving(false);
    }
  };

  const handleConnectDrive = async () => {
    if (!activeWorkspace?.id || driveLoading) return;

    setDriveLoading(true);
    try {
      const response = await connectGrantWriterDrive(activeWorkspace.id);
      if (response.redirectUrl) {
        await openExternalUrl(response.redirectUrl);
        Alert.alert(
          'Complete Google Drive auth',
          'Finish the Google Drive connection in the new tab, then return here and refresh the Drive widget.'
        );
      }
      await refreshActiveWorkspace(activeWorkspace.id);
    } catch (error) {
      Alert.alert('Drive connection failed', error.message || 'Google Drive could not be connected.');
    } finally {
      setDriveLoading(false);
    }
  };

  const handleRefreshDrive = async () => {
    if (!activeWorkspace?.id || driveLoading) return;
    await loadDriveStatus({ workspaceId: activeWorkspace.id, silent: false });
  };

  const handleSyncDrive = async () => {
    if (!activeWorkspace?.id || !selectedDraft?.id || driveLoading) return;

    setDriveLoading(true);
    try {
      const response = await syncGrantWriterDraftToDrive(activeWorkspace.id, selectedDraft.id);
      setActiveWorkspace(response.workspace);
      await loadWorkspaceList(activeWorkspace.id);
    } catch (error) {
      Alert.alert('Drive sync failed', error.message || 'The draft could not be synced to Google Drive.');
    } finally {
      setDriveLoading(false);
    }
  };

  const handleRefreshIndex = async () => {
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

  const renderMessage = (message) => {
    if (message.role === 'system') {
      return (
        <View key={message.id} style={styles.timelineRow}>
          <View style={styles.timelineDot} />
          <Text style={styles.timelineText}>{message.content}</Text>
        </View>
      );
    }

    const isUser = message.role === 'user';
    const isError = message.role === 'error';

    return (
      <View
        key={message.id}
        style={[
          styles.messageWrap,
          isUser ? styles.userWrap : styles.assistantWrap,
        ]}
      >
        {!isUser ? (
          <View style={[styles.avatar, isError && styles.avatarError]}>
            <Ionicons name={isError ? 'warning' : 'document-text'} size={14} color="white" />
          </View>
        ) : null}
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
            isError && styles.errorBubble,
          ]}
        >
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {message.content}
          </Text>
          <Text style={[styles.messageTime, isUser && styles.userMessageTime]}>
            {formatTime(message.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  const renderDraftBody = () => {
    if (!selectedDraft) {
      return (
        <View style={styles.emptyDraftState}>
          <Ionicons name="document-text-outline" size={18} color="#64748B" />
          <Text style={styles.emptyDraftText}>Run the grant writer to create a draft, opportunity search, or application plan.</Text>
        </View>
      );
    }

    if (selectedDraft.artifactType === 'opportunity_search') {
      const searchResults = selectedDraft.data?.searchResults || [];

      return (
        <ScrollView style={styles.draftScroll} contentContainerStyle={styles.draftScrollContent}>
          <View style={styles.draftMetaRow}>
            <Text style={styles.draftSummary}>{selectedDraft.summary}</Text>
          </View>
          {selectedOpportunity ? (
            <View style={styles.selectionBanner}>
              <Ionicons name="checkmark-circle" size={15} color="#047857" />
              <Text style={styles.selectionBannerText}>
                Selected opportunity: {selectedOpportunity.programName}
              </Text>
            </View>
          ) : null}
          {searchResults.map((item, index) => {
            const active = selectedOpportunity?.programName === item.programName;
            return (
              <TouchableOpacity
                key={`${item.programName}-${index}`}
                style={[styles.opportunityCard, active && styles.opportunityCardActive]}
                onPress={() => handleSelectOpportunity(item)}
              >
                <View style={styles.opportunityHeader}>
                  <View style={styles.opportunityCopy}>
                    <Text style={styles.opportunityTitle}>{item.programName}</Text>
                    <Text style={styles.opportunityMeta}>
                      {item.funderType} {item.portalType ? `• ${item.portalType}` : ''}
                    </Text>
                  </View>
                  {active ? (
                    <View style={styles.selectedPill}>
                      <Text style={styles.selectedPillText}>Selected</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.opportunityBody}>{item.whyItFits}</Text>
                <Text style={styles.warningLine}>Verify live: {item.whatToVerifyLive}</Text>
                {item.applicationUrl ? (
                  <Text style={styles.linkLine}>{item.applicationUrl}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      );
    }

    if (selectedDraft.artifactType === 'application_preparation') {
      const plan = selectedDraft.data?.automationPlan || {};

      return (
        <ScrollView style={styles.draftScroll} contentContainerStyle={styles.draftScrollContent}>
          <Text style={styles.editorLabel}>Summary</Text>
          <TextInput
            style={[styles.editorInput, styles.editorMultiline]}
            value={draftEditor.summary}
            onChangeText={(value) => setDraftEditor((current) => ({ ...current, summary: value }))}
            multiline
          />

          <View style={styles.readOnlyBlock}>
            <Text style={styles.readOnlyLabel}>Portal type</Text>
            <Text style={styles.readOnlyText}>{plan.portalType || 'Pending'}</Text>
          </View>
          <View style={styles.readOnlyBlock}>
            <Text style={styles.readOnlyLabel}>Automation mode</Text>
            <Text style={styles.readOnlyText}>{plan.automationMode || 'Pending'}</Text>
          </View>
          {Array.isArray(plan.stepPlan) && plan.stepPlan.length > 0 ? (
            <View style={styles.readOnlyBlock}>
              <Text style={styles.readOnlyLabel}>Step plan</Text>
              {plan.stepPlan.map((item) => (
                <Text key={item} style={styles.readOnlyListItem}>• {item}</Text>
              ))}
            </View>
          ) : null}

          <Text style={styles.editorLabel}>Review notes</Text>
          <TextInput
            style={[styles.editorInput, styles.editorMultiline]}
            value={draftEditor.reviewNotes}
            onChangeText={(value) => setDraftEditor((current) => ({ ...current, reviewNotes: value }))}
            multiline
          />
        </ScrollView>
      );
    }

    return (
      <ScrollView style={styles.draftScroll} contentContainerStyle={styles.draftScrollContent}>
        <Text style={styles.editorLabel}>Draft title</Text>
        <TextInput
          style={styles.editorInput}
          value={draftEditor.title}
          onChangeText={(value) => setDraftEditor((current) => ({ ...current, title: value }))}
        />

        <Text style={styles.editorLabel}>Summary</Text>
        <TextInput
          style={[styles.editorInput, styles.editorMultiline]}
          value={draftEditor.summary}
          onChangeText={(value) => setDraftEditor((current) => ({ ...current, summary: value }))}
          multiline
        />

        <Text style={styles.editorLabel}>Executive summary</Text>
        <TextInput
          style={[styles.editorInput, styles.editorMultiline]}
          value={draftEditor.executiveSummary}
          onChangeText={(value) => setDraftEditor((current) => ({ ...current, executiveSummary: value }))}
          multiline
        />

        <Text style={styles.editorLabel}>Need statement</Text>
        <TextInput
          style={[styles.editorInput, styles.editorMultiline]}
          value={draftEditor.needStatement}
          onChangeText={(value) => setDraftEditor((current) => ({ ...current, needStatement: value }))}
          multiline
        />

        <Text style={styles.editorLabel}>Program description</Text>
        <TextInput
          style={[styles.editorInput, styles.editorMultiline]}
          value={draftEditor.programDescription}
          onChangeText={(value) => setDraftEditor((current) => ({ ...current, programDescription: value }))}
          multiline
        />

        <Text style={styles.editorLabel}>Outcomes and evaluation</Text>
        <TextInput
          style={[styles.editorInput, styles.editorMultiline]}
          value={draftEditor.outcomesAndEvaluation}
          onChangeText={(value) => setDraftEditor((current) => ({ ...current, outcomesAndEvaluation: value }))}
          multiline
        />

        <Text style={styles.editorLabel}>Budget narrative</Text>
        <TextInput
          style={[styles.editorInput, styles.editorMultiline]}
          value={draftEditor.budgetNarrative}
          onChangeText={(value) => setDraftEditor((current) => ({ ...current, budgetNarrative: value }))}
          multiline
        />

        <Text style={styles.editorLabel}>Application checklist</Text>
        <TextInput
          style={[styles.editorInput, styles.editorMultiline]}
          value={draftEditor.applicationChecklistText}
          onChangeText={(value) => setDraftEditor((current) => ({ ...current, applicationChecklistText: value }))}
          multiline
        />

        <Text style={styles.editorLabel}>Review notes</Text>
        <TextInput
          style={[styles.editorInput, styles.editorMultiline]}
          value={draftEditor.reviewNotes}
          onChangeText={(value) => setDraftEditor((current) => ({ ...current, reviewNotes: value }))}
          multiline
        />
      </ScrollView>
    );
  };

  if (bootstrapping) {
    return (
      <View style={styles.loadingContainer}>
        <AppScreenBackground />
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <AppScreenBackground />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Grant Writer</Text>
          <Text style={styles.headerSubtitle}>Chat-first grant drafting, review control, and Google Drive tracking in one workspace.</Text>
        </View>
      </View>

      <View style={[styles.workspaceFrame, isDesktop && styles.workspaceFrameDesktop]}>
        <GlassSurface style={[styles.threadRail, isDesktop && styles.threadRailDesktop]}>
          <View style={styles.threadRailHeader}>
            <View>
              <Text style={styles.sectionTitle}>Grant chats</Text>
              <Text style={styles.sectionSubtitle}>New chat starts a fresh workspace with its own drafts and Drive history.</Text>
            </View>
            <TouchableOpacity
              style={styles.newChatButton}
              onPress={handleCreateWorkspace}
              accessibilityRole="button"
              accessibilityLabel="New grant chat"
            >
              <Ionicons name="add-circle" size={17} color="#0F172A" />
              <Text style={styles.newChatText}>New chat</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.quickStartWrap}>
            {QUICK_STARTS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.quickStartChip,
                  (item.mode === 'prepare-application' && !selectedOpportunity) && styles.quickStartChipDisabled,
                  (sending || workspaceLoading || activeWorkspace?.status === 'running') && styles.quickStartChipDisabled,
                ]}
                onPress={() => handleSend(item.prompt, item.mode)}
                disabled={(item.mode === 'prepare-application' && !selectedOpportunity) || sending || workspaceLoading || activeWorkspace?.status === 'running'}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Text style={styles.quickStartChipText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={styles.threadList} contentContainerStyle={styles.threadListContent}>
            {workspaceList.map((workspace) => {
              const active = workspace.id === activeWorkspaceId;
              return (
                <TouchableOpacity
                  key={workspace.id}
                  style={[styles.threadCard, active && styles.threadCardActive]}
                  onPress={() => {
                    setActiveWorkspaceId(workspace.id);
                    loadWorkspaceDetail(workspace.id).catch((error) => {
                      Alert.alert('Workspace unavailable', error.message || 'The selected grant chat could not be loaded.');
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={workspace.title}
                >
                  <View style={styles.threadCardTop}>
                    <Text style={[styles.threadTitle, active && styles.threadTitleActive]}>{buildWorkspaceTitle(workspace)}</Text>
                    <Text style={[styles.threadTime, active && styles.threadTimeActive]}>{formatTime(workspace.lastActivityAt || workspace.updatedAt)}</Text>
                  </View>
                  <Text style={[styles.threadPreview, active && styles.threadPreviewActive]} numberOfLines={2}>{workspace.preview}</Text>
                  <View style={styles.threadMetaRow}>
                    {workspace.latestDraftType ? (
                      <View style={[styles.threadMetaPill, active && styles.threadMetaPillActive]}>
                        <Text style={[styles.threadMetaPillText, active && styles.threadMetaPillTextActive]}>{artifactLabel(workspace.latestDraftType)}</Text>
                      </View>
                    ) : null}
                    <View style={[styles.threadMetaPill, active && styles.threadMetaPillActive]}>
                      <Text style={[styles.threadMetaPillText, active && styles.threadMetaPillTextActive]}>{workspace.driveStatus || 'disconnected'}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </GlassSurface>

        <View style={styles.mainColumn}>
          <View style={[styles.widgetGrid, isWide && styles.widgetGridWide]}>
            <GlassSurface style={styles.widgetCard}>
              <View style={styles.widgetHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Grant profile</Text>
                  <Text style={styles.sectionSubtitle}>Keep the org, need, and location visible so chat turns stay grounded.</Text>
                </View>
                <TouchableOpacity onPress={handleSaveProfile} disabled={savingProfile}>
                  <Text style={styles.linkText}>{savingProfile ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.profileGrid}>
                <View style={styles.profileField}>
                  <Text style={styles.profileLabel}>Organization</Text>
                  <TextInput
                    style={styles.profileInput}
                    value={profile.organizationName}
                    onChangeText={(value) => setProfile((current) => ({ ...current, organizationName: value }))}
                  />
                </View>
                <View style={styles.profileField}>
                  <Text style={styles.profileLabel}>Target amount</Text>
                  <TextInput
                    style={styles.profileInput}
                    value={profile.amountTarget}
                    onChangeText={(value) => setProfile((current) => ({ ...current, amountTarget: value }))}
                  />
                </View>
                <View style={[styles.profileField, styles.profileFieldFull]}>
                  <Text style={styles.profileLabel}>Project need</Text>
                  <TextInput
                    style={[styles.profileInput, styles.profileInputMultiline]}
                    value={profile.projectNeed}
                    onChangeText={(value) => setProfile((current) => ({ ...current, projectNeed: value }))}
                    multiline
                  />
                </View>
                <View style={styles.profileField}>
                  <Text style={styles.profileLabel}>Location</Text>
                  <TextInput
                    style={styles.profileInput}
                    value={profile.location}
                    onChangeText={(value) => setProfile((current) => ({ ...current, location: value }))}
                  />
                </View>
                <View style={styles.profileField}>
                  <Text style={styles.profileLabel}>Mission</Text>
                  <TextInput
                    style={styles.profileInput}
                    value={profile.mission}
                    onChangeText={(value) => setProfile((current) => ({ ...current, mission: value }))}
                  />
                </View>
              </View>
            </GlassSurface>

            <GlassSurface style={styles.widgetCard}>
              <View style={styles.widgetHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Source index</Text>
                  <Text style={styles.sectionSubtitle}>Keep the funding source view grounded before the chat drafts anything confident.</Text>
                </View>
                <TouchableOpacity onPress={handleRefreshIndex} disabled={indexRefreshing}>
                  <Text style={styles.linkText}>{indexRefreshing ? 'Refreshing...' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.statRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{indexStatus?.sourceCount || 0}</Text>
                  <Text style={styles.statLabel}>Sources</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{pendingReviewCount}</Text>
                  <Text style={styles.statLabel}>Need review</Text>
                </View>
              </View>
              <View style={styles.runtimeStack}>
                <View style={styles.runtimeRow}>
                  <Text style={styles.runtimeLabel}>AI runtime</Text>
                  <Text style={[styles.runtimeValue, (runtimeStatus?.ai?.configured === false || latestWorkspaceError) && styles.runtimeValueWarning]}>
                    {latestWorkspaceError ? 'offline' : (runtimeStatus?.ai?.provider || 'unknown')}
                  </Text>
                </View>
                <Text style={styles.smallMetaText}>
                  {latestWorkspaceError || runtimeStatus?.ai?.message || 'Grant runs require a live AI provider.'}
                </Text>
                <View style={styles.runtimeRow}>
                  <Text style={styles.runtimeLabel}>Drive runtime</Text>
                  <Text style={[styles.runtimeValue, runtimeStatus?.drive?.configured === false && styles.runtimeValueWarning]}>
                    {runtimeStatus?.drive?.configured ? 'ready' : 'offline'}
                  </Text>
                </View>
                <Text style={styles.smallMetaText}>
                  {runtimeStatus?.drive?.message || 'Drive sync requires Composio.'}
                </Text>
              </View>
              <Text style={styles.smallMetaText}>
                {indexStatus?.refreshedAt ? `Updated ${formatDateTime(indexStatus.refreshedAt)}` : 'Use refresh when you want a new grounded source pass.'}
              </Text>
            </GlassSurface>

            <GlassSurface style={styles.widgetCard}>
              <View style={styles.widgetHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Google Drive</Text>
                  <Text style={styles.sectionSubtitle}>Connect once, then sync the current draft so you can review it later from your phone.</Text>
                </View>
                <TouchableOpacity onPress={handleRefreshDrive} disabled={driveLoading}>
                  <Text style={styles.linkText}>{driveLoading ? 'Checking...' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.driveStatusRow}>
                <View style={[styles.driveStatusPill, { backgroundColor: `${reviewColor(driveConnection?.status === 'connected' ? 'approved' : driveConnection?.status === 'failed' ? 'disapproved' : 'needs_review')}1A` }]}>
                  <Text style={[styles.driveStatusText, { color: reviewColor(driveConnection?.status === 'connected' ? 'approved' : driveConnection?.status === 'failed' ? 'disapproved' : 'needs_review') }]}>
                    {driveConnection?.status || 'disconnected'}
                  </Text>
                </View>
                {driveConnection?.connectedAt ? (
                  <Text style={styles.smallMetaText}>Connected {formatDateTime(driveConnection.connectedAt)}</Text>
                ) : (
                  <Text style={styles.smallMetaText}>{driveConnection?.errorMessage || 'Drive not connected yet.'}</Text>
                )}
              </View>
              <View style={styles.driveButtonRow}>
                <TouchableOpacity
                  style={[styles.secondaryAction, runtimeStatus?.drive?.configured === false && styles.secondaryActionDisabled]}
                  onPress={handleConnectDrive}
                  disabled={driveLoading || runtimeStatus?.drive?.configured === false}
                  accessibilityRole="button"
                  accessibilityLabel="Connect Google Drive"
                >
                  <Ionicons name="cloud-upload" size={16} color="#0F172A" />
                  <Text style={styles.secondaryActionText}>
                    {runtimeStatus?.drive?.configured === false ? 'Composio required' : 'Connect Drive'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryAction, (!selectedDraft || driveConnection?.status !== 'connected') && styles.primaryActionDisabled]}
                  onPress={handleSyncDrive}
                  disabled={!selectedDraft || driveConnection?.status !== 'connected' || driveLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Sync current draft to Google Drive"
                >
                  <Ionicons name="arrow-up-circle" size={16} color="white" />
                  <Text style={styles.primaryActionText}>Sync current draft</Text>
                </TouchableOpacity>
              </View>
              {latestDriveUrl ? (
                <TouchableOpacity
                  style={styles.driveOpenLink}
                  onPress={() => openExternalUrl(latestDriveUrl)}
                  accessibilityRole="button"
                  accessibilityLabel="Open current grant draft in Google Drive"
                >
                  <Ionicons name="open-outline" size={15} color="#A7F3D0" />
                  <Text style={styles.driveOpenLinkText}>Open latest Drive file</Text>
                </TouchableOpacity>
              ) : null}
              {(activeWorkspace?.driveSyncs || []).slice(0, 3).map((sync) => (
                <TouchableOpacity
                  key={sync.id}
                  style={styles.syncRow}
                  onPress={() => sync.fileUrl ? openExternalUrl(sync.fileUrl) : undefined}
                  disabled={!sync.fileUrl}
                >
                  <Text style={styles.syncName}>{sync.fileName || artifactLabel(selectedDraft?.artifactType)}</Text>
                  <Text style={styles.syncMeta}>
                    {sync.status}
                    {sync.syncedAt ? ` • ${formatTime(sync.syncedAt)}` : ''}
                    {sync.fileUrl ? ' • Open' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </GlassSurface>
          </View>

          <View style={[styles.contentSplit, isWide && styles.contentSplitWide]}>
            <GlassSurface style={styles.chatCard}>
              <View style={styles.chatHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Grant chat</Text>
                  <Text style={styles.sectionSubtitle}>Ask for a search, a new draft, or an application prep plan. The workspace keeps the history attached to the review panel.</Text>
                </View>
                {workspaceLoading || sending ? <ActivityIndicator size="small" color="#8B5CF6" /> : null}
              </View>
              {runNotice ? (
                <View
                  style={[
                    styles.runNotice,
                    runNotice.tone === 'error'
                      ? styles.runNoticeError
                      : runNotice.tone === 'success'
                        ? styles.runNoticeSuccess
                        : styles.runNoticeInfo,
                  ]}
                >
                  <Text
                    style={[
                      styles.runNoticeText,
                      runNotice.tone === 'error'
                        ? styles.runNoticeTextError
                        : runNotice.tone === 'success'
                          ? styles.runNoticeTextSuccess
                          : styles.runNoticeTextInfo,
                    ]}
                  >
                    {runNotice.message}
                  </Text>
                </View>
              ) : null}

              <ScrollView
                ref={chatScrollRef}
                style={styles.chatScroll}
                contentContainerStyle={styles.chatScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {(activeWorkspace?.messages || []).map(renderMessage)}
              </ScrollView>

              <View style={styles.composerWrap}>
                <TextInput
                  style={styles.composerInput}
                  value={composer}
                  onChangeText={setComposer}
                  placeholder="Ask the grant writer to search, draft, tighten a section, or prepare the selected application..."
                  placeholderTextColor="#94A3B8"
                  multiline
                />
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    (!composer.trim() || sending || activeWorkspace?.status === 'running') && styles.sendButtonDisabled,
                  ]}
                  onPress={() => handleSend()}
                  disabled={!composer.trim() || sending || activeWorkspace?.status === 'running'}
                  accessibilityRole="button"
                  accessibilityLabel="Send grant writer message"
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Ionicons name="send" size={18} color="white" />
                  )}
                </TouchableOpacity>
              </View>
            </GlassSurface>

            <GlassSurface style={styles.draftCard}>
              <View style={styles.draftHeader}>
                <View style={styles.draftHeaderCopy}>
                  <Text style={styles.sectionTitle}>Draft review</Text>
                  <Text style={styles.sectionSubtitle}>Edit what the agent produced, approve it, or sync it to Drive without leaving the chat.</Text>
                </View>
                {selectedDraft ? (
                  <View style={[styles.reviewPill, { backgroundColor: `${reviewColor(selectedDraft.status)}1A` }]}>
                    <Text style={[styles.reviewPillText, { color: reviewColor(selectedDraft.status) }]}>
                      {selectedDraft.status}
                    </Text>
                  </View>
                ) : null}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.draftTabs}>
                {(activeWorkspace?.drafts || []).map((draft) => (
                  <TouchableOpacity
                    key={draft.id}
                    style={[styles.draftTab, draft.id === selectedDraft?.id && styles.draftTabActive]}
                    onPress={() => setSelectedDraftId(draft.id)}
                    accessibilityRole="button"
                    accessibilityLabel={draft.title}
                  >
                    <Text style={styles.draftTabType}>{artifactLabel(draft.artifactType)}</Text>
                    <Text style={[styles.draftTabTitle, draft.id === selectedDraft?.id && styles.draftTabTitleActive]} numberOfLines={1}>{draft.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {selectedDraft ? (
                <View style={styles.draftToolbar}>
                  <TouchableOpacity
                    style={styles.secondaryAction}
                    onPress={handleSaveDraft}
                    disabled={draftSaving}
                    accessibilityRole="button"
                    accessibilityLabel="Save draft edits"
                  >
                    <Ionicons name="create" size={16} color="#0F172A" />
                    <Text style={styles.secondaryActionText}>{draftSaving ? 'Saving...' : 'Save edits'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveAction}
                    onPress={() => handleReviewDraft(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Approve draft"
                  >
                    <Ionicons name="checkmark-circle" size={16} color="white" />
                    <Text style={styles.primaryActionText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectAction}
                    onPress={() => handleReviewDraft(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Disapprove draft"
                  >
                    <Ionicons name="close-circle" size={16} color="white" />
                    <Text style={styles.primaryActionText}>Disapprove</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {renderDraftBody()}
            </GlassSurface>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07121F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 18,
    paddingBottom: 18,
    backgroundColor: 'rgba(8,15,28,0.84)',
  },
  backButton: {
    marginRight: 12,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    lineHeight: 18,
  },
  workspaceFrame: {
    flex: 1,
    minHeight: 0,
    padding: 16,
    gap: 14,
  },
  workspaceFrameDesktop: {
    flexDirection: 'row',
  },
  threadRail: {
    minHeight: 0,
    gap: 14,
  },
  threadRailDesktop: {
    width: 320,
  },
  threadRailHeader: {
    gap: 12,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  newChatText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  quickStartWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickStartChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(139,92,246,0.12)',
  },
  quickStartChipDisabled: {
    opacity: 0.45,
  },
  quickStartChipText: {
    color: '#4C1D95',
    fontSize: 12,
    fontWeight: '800',
  },
  threadList: {
    flex: 1,
    minHeight: 0,
  },
  threadListContent: {
    gap: 10,
    paddingBottom: 8,
  },
  threadCard: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    gap: 10,
  },
  threadCardActive: {
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderColor: 'rgba(139,92,246,0.3)',
  },
  threadCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  threadTitle: {
    flex: 1,
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  threadTitleActive: {
    color: 'white',
  },
  threadTime: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  threadTimeActive: {
    color: 'rgba(255,255,255,0.72)',
  },
  threadPreview: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
  },
  threadPreviewActive: {
    color: 'rgba(255,255,255,0.82)',
  },
  threadMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  threadMetaPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.68)',
  },
  threadMetaPillActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  threadMetaPillText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '800',
  },
  threadMetaPillTextActive: {
    color: 'rgba(255,255,255,0.86)',
  },
  mainColumn: {
    flex: 1,
    minHeight: 0,
    gap: 14,
  },
  widgetGrid: {
    gap: 12,
  },
  widgetGridWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  widgetCard: {
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  widgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  linkText: {
    color: '#6D28D9',
    fontSize: 13,
    fontWeight: '800',
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  profileField: {
    width: '48%',
  },
  profileFieldFull: {
    width: '100%',
  },
  profileLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  profileInput: {
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0F172A',
    fontSize: 13,
  },
  profileInputMultiline: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  statValue: {
    color: '#0F172A',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  smallMetaText: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
  },
  runtimeStack: {
    gap: 6,
  },
  runtimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  runtimeLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  runtimeValue: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  runtimeValueWarning: {
    color: '#B45309',
  },
  driveStatusRow: {
    gap: 8,
  },
  driveStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  driveStatusText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  driveButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  secondaryActionText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryActionDisabled: {
    opacity: 0.55,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#6D28D9',
  },
  primaryActionDisabled: {
    opacity: 0.45,
  },
  primaryActionText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '800',
  },
  driveOpenLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  driveOpenLinkText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '800',
  },
  syncRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
  },
  syncName: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 3,
  },
  syncMeta: {
    color: '#64748B',
    fontSize: 12,
  },
  contentSplit: {
    flex: 1,
    minHeight: 0,
    gap: 14,
  },
  contentSplitWide: {
    flexDirection: 'row',
  },
  chatCard: {
    flex: 1.2,
    minHeight: 0,
    padding: 0,
    overflow: 'hidden',
  },
  chatHeader: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  runNotice: {
    marginHorizontal: 18,
    marginBottom: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
  },
  runNoticeInfo: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: 'rgba(59,130,246,0.30)',
  },
  runNoticeSuccess: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.30)',
  },
  runNoticeError: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.30)',
  },
  runNoticeText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  runNoticeTextInfo: {
    color: '#1D4ED8',
  },
  runNoticeTextSuccess: {
    color: '#047857',
  },
  runNoticeTextError: {
    color: '#B91C1C',
  },
  chatScroll: {
    flex: 1,
    minHeight: 0,
  },
  chatScrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8B5CF6',
    marginRight: 10,
  },
  timelineText: {
    flex: 1,
    color: '#6D28D9',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  messageWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userWrap: {
    justifyContent: 'flex-end',
  },
  assistantWrap: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 8,
  },
  avatarError: {
    backgroundColor: '#EF4444',
  },
  messageBubble: {
    maxWidth: '84%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  assistantBubble: {
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  userBubble: {
    backgroundColor: '#0F172A',
  },
  errorBubble: {
    backgroundColor: '#FEE2E2',
  },
  messageText: {
    color: '#0F172A',
    fontSize: 14,
    lineHeight: 21,
  },
  userMessageText: {
    color: 'white',
  },
  messageTime: {
    marginTop: 8,
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  userMessageTime: {
    color: 'rgba(255,255,255,0.72)',
  },
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.08)',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  composerInput: {
    flex: 1,
    minHeight: 56,
    maxHeight: 120,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#0F172A',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  draftCard: {
    flex: 1,
    minHeight: 0,
    gap: 12,
  },
  draftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  draftHeaderCopy: {
    flex: 1,
  },
  reviewPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  reviewPillText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  draftTabs: {
    flexGrow: 0,
  },
  draftTab: {
    width: 178,
    marginRight: 10,
    borderRadius: 18,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  draftTabActive: {
    backgroundColor: 'rgba(15,23,42,0.88)',
  },
  draftTabType: {
    color: '#6D28D9',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  draftTabTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  draftTabTitleActive: {
    color: 'white',
  },
  draftToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  approveAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#10B981',
  },
  rejectAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#EF4444',
  },
  draftScroll: {
    flex: 1,
    minHeight: 0,
  },
  draftScrollContent: {
    paddingBottom: 6,
  },
  emptyDraftState: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.56)',
    borderRadius: 18,
    padding: 14,
  },
  emptyDraftText: {
    marginLeft: 10,
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  draftMetaRow: {
    marginBottom: 14,
  },
  draftSummary: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 20,
  },
  selectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    marginBottom: 12,
  },
  selectionBannerText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '800',
  },
  opportunityCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
    marginBottom: 10,
  },
  opportunityCardActive: {
    borderColor: 'rgba(16,185,129,0.4)',
    backgroundColor: 'rgba(236,253,245,0.9)',
  },
  opportunityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  opportunityCopy: {
    flex: 1,
  },
  opportunityTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  opportunityMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  selectedPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#10B981',
  },
  selectedPillText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
  },
  opportunityBody: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  warningLine: {
    color: '#B45309',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  linkLine: {
    color: '#6D28D9',
    fontSize: 12,
    lineHeight: 18,
  },
  editorLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  editorInput: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0F172A',
    fontSize: 13,
    marginBottom: 12,
  },
  editorMultiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  readOnlyBlock: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  readOnlyLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  readOnlyText: {
    color: '#0F172A',
    fontSize: 13,
    lineHeight: 20,
  },
  readOnlyListItem: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 20,
  },
});
