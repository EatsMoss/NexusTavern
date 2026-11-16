import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useViewport } from '@core/hooks/useViewport.js';
import { isDemoCardId } from '@core/cards/cardsApi.js';
import { readCachedUiState } from '@core/session/sessionApi.js';
import { useSessionBoot } from '@core/session/useSessionBoot.js';
import {
  TopBar,
  resolvePromptEditorTarget,
  ToastStack,
  useToastQueue,
  WorkspaceLayout,
} from '@ui/index.js';
import { useChatWorkspace } from '@features/chat/useChatWorkspace.js';
import { useConsoleStream } from '@features/chat/useConsoleStream.js';
import { useScenarioWorkspace } from '@features/characters/useScenarioWorkspace.js';
import { usePersonasWorkspace } from '@features/personas/usePersonasWorkspace.js';
import { useApiHubWorkspace } from '@features/api-hub/useApiHubWorkspace.js';
import { usePresetsWorkspace } from '@features/settings-tome/usePresetsWorkspace.js';
import { useRegexWorkspace } from '@features/regex/useRegexWorkspace.js';
import { useRefusalCatcher } from '@features/refusal/useRefusalCatcher.js';
import { useMessageRecap } from '@features/recap/useMessageRecap.js';
import { useStImporter } from '@features/st-importer/useStImporter.js';
import { useCustomizationWorkspace } from '@features/customization/useCustomizationWorkspace.js';
import { useWorkspaceSheetDismiss } from './useWorkspaceSheetDismiss.js';
import { usePromptTokenTelemetry } from './usePromptTokenTelemetry.js';
import { buildCharacterSheetSharedProps } from './buildCharacterSheetSharedProps.js';
import { LeftTomeContent } from './LeftTomeContent.jsx';
import { RightTomeContent } from './RightTomeContent.jsx';
import { CenterWorkspaceSheets } from './CenterWorkspaceSheets.jsx';
import { AppShellOverlays } from './AppShellOverlays.jsx';

const LEFT_TABS = [
  { id: 'characters', label: 'Characters', icon: 'addressCard' },
  { id: 'chats', label: 'Chats', icon: 'comments' },
  { id: 'worldinfo', label: 'Journal', icon: 'bookAtlas' },
  { id: 'usersettings', label: 'Settings', icon: 'settings' },
];

const RIGHT_TABS = [
  { id: 'selected', label: 'Selected', icon: 'bookOpen' },
  { id: 'aiconfig', label: 'Prompts', icon: 'sliders' },
  { id: 'media', label: 'Media', icon: 'images' },
  { id: 'extensions', label: 'Plugins', icon: 'puzzle' },
];

const DEFAULT_TOME_WIDTH = 550;
const MIN_TOME_WIDTH = 400;
const MAX_STORED_TOME_WIDTH = 2400;
const CHAT_COLUMN_WIDTH = 784;
const TOME_TOGGLE_CLEARANCE = 52; // 8px from tome edge + 36px toggle button + 8px gap to chat edge
const TOME_WIDTH_STORAGE_KEY = 'bookbound_panel_widths_v1';

function computeMaxTomeWidth(viewportWidth, chatColWidth = CHAT_COLUMN_WIDTH) {
  return Math.max(
    MIN_TOME_WIDTH,
    Math.floor((viewportWidth - chatColWidth) / 2) - TOME_TOGGLE_CLEARANCE,
  );
}

function sanitizeStoredTomeWidth(width) {
  return Math.max(MIN_TOME_WIDTH, Math.min(MAX_STORED_TOME_WIDTH, Math.round(width)));
}

function loadInitialTomeWidths() {
  try {
    const raw = localStorage.getItem(TOME_WIDTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const left = Number(parsed?.left);
    const right = Number(parsed?.right);
    return {
      left: sanitizeStoredTomeWidth(
        Number.isFinite(left) && left >= MIN_TOME_WIDTH ? left : DEFAULT_TOME_WIDTH,
      ),
      right: sanitizeStoredTomeWidth(
        Number.isFinite(right) && right >= MIN_TOME_WIDTH ? right : DEFAULT_TOME_WIDTH,
      ),
    };
  } catch (_err) {
    const def = sanitizeStoredTomeWidth(DEFAULT_TOME_WIDTH);
    return { left: def, right: def };
  }
}

export function AppShell({ serverStatus, onToggleTunnel, tunnelBusy, onRefreshStatus }) {
  const { width: viewportWidth, isMobile } = useViewport();
  const initialUiRef = useRef(null);
  if (initialUiRef.current === null) {
    initialUiRef.current = readCachedUiState() || {};
  }
  const initialUi = initialUiRef.current;
  const desktopPanesRef = useRef({
    leftOpen: typeof initialUi.leftOpen === 'boolean' ? initialUi.leftOpen : true,
    rightOpen: typeof initialUi.rightOpen === 'boolean' ? initialUi.rightOpen : true,
  });

  const [viewMode, setViewMode] = useState('tavern'); // 'tavern' | 'sandbox'
  const { toasts, pushToast, dismissToast } = useToastQueue();
  const {
    toasts: composerToasts,
    pushToast: pushComposerToast,
    dismissToast: dismissComposerToast,
  } = useToastQueue();
  const [leftOpen, setLeftOpen] = useState(() =>
    isMobile ? false : desktopPanesRef.current.leftOpen,
  );
  const [rightOpen, setRightOpen] = useState(() =>
    isMobile ? false : desktopPanesRef.current.rightOpen,
  );
  const [leftWidth, setLeftWidth] = useState(() => loadInitialTomeWidths().left);
  const [rightWidth, setRightWidth] = useState(() => loadInitialTomeWidths().right);
  const [leftTab, setLeftTab] = useState(() => initialUi.leftTab || 'chats');
  const [rightTab, setRightTab] = useState(() => initialUi.rightTab || 'selected');
  const [aiSubTab, setAiSubTab] = useState(() => initialUi.aiSubTab || 'prompts');
  const [charSplitRatio, setCharSplitRatio] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('nexustavern_char_split_ratio');
        if (raw !== null && raw.trim() !== '') {
          const parsed = Number(raw);
          if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
            return Number(parsed.toFixed(6));
          }
        }
      } catch {
        // ignore storage errors
      }
    }
    return initialUi.charSplitRatio ?? null;
  });

  const [activeSheetTab, setActiveSheetTab] = useState(
    () => initialUi.activeSheetTab || 'description',
  );
  const [sheetExpanded, setSheetExpanded] = useState(() => Boolean(initialUi.sheetExpanded));

  // Central workspace sheet refs & cross-domain bridges
  const createScenarioSheetRef = useRef(null);
  const introEditorSheetRef = useRef(null);
  const centerSheetSurfaceRef = useRef(null);
  const workspaceGuardBridgeRef = useRef({
    activeKind: null,
    isCardDirty: false,
    runGuard: (fn) => fn?.(),
  });
  const runWithWorkspaceUnsavedGuard = useCallback((proceedAction, opts) => {
    workspaceGuardBridgeRef.current.runGuard(proceedAction, opts);
  }, []);

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const chatComposerRef = useRef(null);
  const chatStreamRef = useRef(null);
  const [chatListOpen, setChatListOpen] = useState(false);
  const [timelinesOpen, setTimelinesOpen] = useState(() => Boolean(initialUi.timelinesOpen));
  const consoleStream = useConsoleStream();

  const loadCardsAndPersonasRef = useRef(null);
  const presetBridgeRef = useRef({
    refreshCategory: async () => null,
    setEditingPromptSelection: () => {},
    setStatusMsg: () => {},
  });
  const personaBridgeRef = useRef({
    setModalOpen: () => {},
    onLoaded: () => {},
    onUpdated: () => {},
  });
  const chatSessionBridgeRef = useRef({
    activeChatFile: '',
    chatFilesLength: 0,
    mapServerMsgToUi: null,
    setMessages: null,
    setChatMetaStats: null,
    setChatFiles: null,
    setTimelineChats: null,
    resetSession: () => {},
  });

  useEffect(() => {
    if (!isMobile) {
      desktopPanesRef.current = { leftOpen, rightOpen };
    }
  }, [isMobile, leftOpen, rightOpen]);

  const handleHydrateServerUiState = useCallback((srvUi, mobileNow) => {
    desktopPanesRef.current = {
      leftOpen: srvUi.leftOpen,
      rightOpen: srvUi.rightOpen,
    };
    if (!mobileNow) {
      setLeftOpen(srvUi.leftOpen);
      setRightOpen(srvUi.rightOpen);
    }
    setLeftTab(srvUi.leftTab);
    setRightTab(srvUi.rightTab);
    setActiveSheetTab(srvUi.activeSheetTab);
    setAiSubTab(srvUi.aiSubTab);
    setTimelinesOpen(Boolean(srvUi.timelinesOpen));
    setSheetExpanded(Boolean(srvUi.sheetExpanded));
    if (srvUi.charSplitRatio !== null && srvUi.charSplitRatio !== undefined) {
      setCharSplitRatio(srvUi.charSplitRatio);
    }
  }, []);

  const boot = useSessionBoot({
    isMobile,
    uiSnapshot: {
      desktopLeftOpen: desktopPanesRef.current.leftOpen,
      desktopRightOpen: desktopPanesRef.current.rightOpen,
      leftOpen,
      rightOpen,
      leftTab,
      rightTab,
      activeSheetTab,
      aiSubTab,
      timelinesOpen,
      sheetExpanded,
      charSplitRatio,
    },
    onHydrateServerUiState: handleHydrateServerUiState,
    loadCardsAndPersonasRef,
  });

  const scrollToChatBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatStreamRef.current) {
        chatStreamRef.current.scrollTop = chatStreamRef.current.scrollHeight;
      }
    });
  }, []);

  const handleResetActiveCardChatSession = useCallback(() => {
    chatSessionBridgeRef.current.resetSession();
  }, []);

  const handleSetPersonaModalOpenBridge = useCallback((nextOpen) => {
    personaBridgeRef.current.setModalOpen(nextOpen);
  }, []);

  const handlePersonasLoadedFromBootOrRefresh = useCallback((personaRes) => {
    personaBridgeRef.current.onLoaded(personaRes);
  }, []);

  const handlePersonasUpdatedList = useCallback((nextPersonas) => {
    personaBridgeRef.current.onUpdated(nextPersonas);
  }, []);

  const handleRefreshOpenaiPresetsSafe = useCallback(() => {
    return presetBridgeRef.current.refreshCategory('openai')?.catch?.(() => null);
  }, []);

  const handleSetEditingPromptSelectionBridge = useCallback((nextVal) => {
    presetBridgeRef.current.setEditingPromptSelection(nextVal);
  }, []);

  const handleHubModelErrorBridge = useCallback((msg) => {
    presetBridgeRef.current.setStatusMsg(msg);
  }, []);

  const scenario = useScenarioWorkspace({
    isMobile,
    sheetExpanded,
    setSheetExpanded,
    setLeftOpen,
    setRightOpen,
    setLeftTab,
    setRightTab,
    setChatListOpen,
    setTimelinesOpen,
    setEditingPromptSelection: handleSetEditingPromptSelectionBridge,
    setPersonaModalOpen: handleSetPersonaModalOpenBridge,
    consumeRestoredCardAvatar: boot.consumeRestoredCardAvatar,
    retireRestorePointers: boot.retireRestorePointers,
    recordSessionPointer: boot.recordSessionPointer,
    forgetDeletedCharactersSession: boot.forgetDeletedCharactersSession,
    runWithWorkspaceUnsavedGuard,
    workspaceGuardBridgeRef,
    onPersonasLoaded: handlePersonasLoadedFromBootOrRefresh,
    onPersonasUpdated: handlePersonasUpdatedList,
    onRefreshOpenaiPresets: handleRefreshOpenaiPresetsSafe,
    onResetActiveCardChatSession: handleResetActiveCardChatSession,
    scrollToChatBottom,
    pushToast,
  });

  loadCardsAndPersonasRef.current = scenario.loadCardsAndPersonas;

  const personasWs = usePersonasWorkspace({
    isMobile,
    selectedCardId: scenario.selectedCardId,
    activeCardFull: scenario.activeCardFull,
    chatSessionBridgeRef,
    setBusyLinksAction: scenario.setBusyLinksAction,
    setCardSaveStatus: scenario.setCardSaveStatus,
    setChatListOpen,
    setTimelinesOpen,
    setEditingPromptSelection: handleSetEditingPromptSelectionBridge,
    setEditingIntroTarget: scenario.setEditingIntroTarget,
    setCreateScenarioModalOpen: scenario.setCreateScenarioModalOpen,
    setSheetExpanded,
    setLeftOpen,
    setRightOpen,
    runWithWorkspaceUnsavedGuard,
    markOnboardingDismissed: boot.markOnboardingDismissed,
    pushComposerToast,
  });

  personaBridgeRef.current = {
    setModalOpen: personasWs.setPersonaModalOpen,
    onLoaded: personasWs.syncPersonasFromServer,
    onUpdated: personasWs.updatePersonasList,
  };

  const apiHub = useApiHubWorkspace({
    onModelError: handleHubModelErrorBridge,
  });

  const presets = usePresetsWorkspace({
    isMobile,
    selectedCardId: scenario.selectedCardId,
    ensureSessionPromise: boot.ensureSessionPromise,
    queueSessionPatch: boot.queueSessionPatch,
    onHydrateApiHub: apiHub.setApiHubState,
    setChatListOpen,
    setTimelinesOpen,
    setSheetExpanded,
    setEditingIntroTarget: scenario.setEditingIntroTarget,
    setCreateScenarioModalOpen: scenario.setCreateScenarioModalOpen,
    setPersonaModalOpen: personasWs.setPersonaModalOpen,
    setRightOpen,
    runWithWorkspaceUnsavedGuard,
    scrollToChatBottom,
    pushToast,
  });

  presetBridgeRef.current = {
    refreshCategory: presets.refreshCategoryListState,
    setEditingPromptSelection: presets.setEditingPromptSelection,
    setStatusMsg: presets.setPresetStatusMsg,
  };

  const chat = useChatWorkspace({
    isMobile,
    cards: scenario.cards,
    setCards: scenario.setCards,
    groups: scenario.groups,
    selectedCardId: scenario.selectedCardId,
    selectedCardIdRef: scenario.selectedCardIdRef,
    hasActiveScenario: scenario.hasActiveScenario,
    activeCharacter: scenario.activeCharacter,
    activeCardFull: scenario.activeCardFull,
    matchedActiveCardFull: scenario.matchedActiveCardFull,
    activeIntroIdx: scenario.activeIntroIdx,
    setActiveIntroIdx: scenario.setActiveIntroIdx,
    commitLoadedActiveCard: scenario.commitLoadedActiveCard,
    loadCardsAndPersonas: scenario.loadCardsAndPersonas,
    handleDeleteCard: scenario.handleDeleteCard,
    setCardSaveStatus: scenario.setCardSaveStatus,
    personaName: personasWs.personaName,
    activePersonaAvatar: personasWs.activePersonaAvatar,
    sessionPersonaHintRef: personasWs.sessionPersonaHintRef,
    syncSessionPersona: personasWs.syncSessionPersona,
    activeOpenaiDoc: presets.activeOpenaiDoc,
    apiHubState: apiHub.apiHubState,
    setApiHubState: apiHub.setApiHubState,
    chatListOpen,
    setChatListOpen,
    timelinesOpen,
    setTimelinesOpen,
    setEditingPromptSelection: presets.setEditingPromptSelection,
    setEditingIntroTarget: scenario.setEditingIntroTarget,
    setCreateScenarioModalOpen: scenario.setCreateScenarioModalOpen,
    setPersonaModalOpen: personasWs.setPersonaModalOpen,
    setSheetExpanded,
    setLeftOpen,
    setRightOpen,
    setLeftTab,
    setRightTab,
    consumeRestoredChatFile: boot.consumeRestoredChatFile,
    recordSessionPointer: boot.recordSessionPointer,
    forgetDeletedCharacterChats: boot.forgetDeletedCharacterChats,
    finishBootSplash: boot.finishBootSplash,
    runWithWorkspaceUnsavedGuard,
    chatStreamRef,
    chatComposerRef,
    scrollToChatBottom,
    pushToast,
    pushComposerToast,
  });

  chatSessionBridgeRef.current = {
    activeChatFile: chat.activeChatFile,
    chatFilesLength: chat.chatFiles.length,
    mapServerMsgToUi: chat.mapServerMsgToUi,
    setMessages: chat.setMessages,
    setChatMetaStats: chat.setChatMetaStats,
    setChatFiles: chat.setChatFiles,
    setTimelineChats: chat.setTimelineChats,
    resetSession: chat.resetActiveCardChatSession,
  };

  const customization = useCustomizationWorkspace({
    scenarioThemePresetId: scenario.activeCardFull?.scenarioMeta?.themePresetId || null,
    activePortraitUrl:
      chat.activeScenarioAvatarUrl || scenario.activeCharacter?.avatarUrl || null,
    onNotify: (message, tone = 'info') => pushToast({ message, tone }),
  });

  const lowGpu = Boolean(customization.config.system?.lowGpu);
  const idleFade = Boolean(customization.config.idleFade);
  const shaderStyle =
    customization.config.shaderStyle === 'off' ? 'none' : customization.config.shaderStyle;
  const shaderIntensity =
    customization.config.shaderStyle === 'off'
      ? 0
      : Number((customization.config.shaderIntensity / 100).toFixed(2));
  const maxTomeWidth = useMemo(
    () => computeMaxTomeWidth(viewportWidth, customization.config.chatColumnMaxWidth),
    [viewportWidth, customization.config.chatColumnMaxWidth],
  );

  // Global shortcut Ctrl+Shift+U to toggle UI Kit Sandbox page
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyU' || e.key?.toLowerCase() === 'u')) {
        e.preventDefault();
        setViewMode((prev) => (prev === 'sandbox' ? 'tavern' : 'sandbox'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Effective rendered widths clamp to current viewport space without overwriting the user's preferred widths
  const effectiveLeftWidth = Math.max(MIN_TOME_WIDTH, Math.min(maxTomeWidth, leftWidth));
  const effectiveRightWidth = Math.max(MIN_TOME_WIDTH, Math.min(maxTomeWidth, rightWidth));

  // Persist user-selected tome widths to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        TOME_WIDTH_STORAGE_KEY,
        JSON.stringify({
          left: sanitizeStoredTomeWidth(leftWidth),
          right: sanitizeStoredTomeWidth(rightWidth),
        }),
      );
    } catch (_err) {
      // ignore storage quota errors
    }
  }, [leftWidth, rightWidth]);

  const regexWorkspace = useRegexWorkspace({
    activeCardAvatar: scenario.hasActiveScenario
      ? scenario.activeCharacter.avatar || scenario.activeCharacter.id
      : '',
    hasActiveScenario: scenario.hasActiveScenario,
    activePresetName: presets.activePresets?.openai || 'Default',
    liveCardScripts: scenario.hasActiveScenario
      ? scenario.activeCardFull?.extensions?.regex_scripts ?? null
      : null,
    livePresetScripts: presets.activeOpenaiDoc?.data?.extensions?.regex_scripts ?? null,
    onRefreshActiveCard: (updatedCard) => {
      if (updatedCard && updatedCard.avatar === scenario.selectedCardId) {
        scenario.commitLoadedActiveCard(updatedCard);
      }
    },
    onRefreshActivePresetScripts: presets.handleRefreshActivePresetScripts,
    onNotify: (message, tone = 'info') => pushToast({ variant: tone, message }),
  });

  const refusalCatcher = useRefusalCatcher({
    connections: apiHub.apiHubState?.connections || [],
    activeConnectionId:
      apiHub.apiHubState?.activeConnectionId || apiHub.apiHubState?.activeProviderId || '',
    activeModelId: apiHub.apiHubState?.activeModelId || '',
    onNotify: (message, tone = 'info') => pushToast({ variant: tone, message }),
  });

  const messageRecap = useMessageRecap({
    onNotify: (message, tone = 'info') => pushToast({ variant: tone, message }),
  });

  const stImporter = useStImporter({
    onImportCompleted: async () => {
      boot.markOnboardingDismissed({ closeModal: false });
      await Promise.all([
        scenario.loadCardsAndPersonas(),
        regexWorkspace.syncWorkspace(),
        chat.reloadActiveCharacterChatList(),
        Promise.resolve(onRefreshStatus?.()),
      ]);
    },
    onNotify: (message, tone = 'info') => pushToast({ variant: tone, message }),
  });

  // Surface completed card and gallery events/errors as TopBar notifications
  useEffect(() => {
    const text = String(scenario.cardSaveStatus || '').trim();
    if (!text || text.endsWith('...')) return;
    const isErr = /^(error|upload error|switch failed|remove failed|unbind error|lore error)/i.test(text);
    pushToast({
      variant: isErr ? 'error' : 'success',
      message: text,
    });
  }, [scenario.cardSaveStatus, pushToast]);

  useEffect(() => {
    const text = String(scenario.galleryStatus || '').trim();
    if (!text || text.endsWith('...')) return;
    const isErr = /failed|error/i.test(text);
    pushToast({
      variant: isErr ? 'error' : 'success',
      message: text,
    });
  }, [scenario.galleryStatus, pushToast]);

  const handleToggleTunnelWithToast = useCallback(
    async (rotate = false) => {
      if (!onToggleTunnel) return;
      try {
        const res = await onToggleTunnel(rotate);
        if (res?.isStopping) {
          pushToast({ variant: 'info', message: 'Mobile tunnel stopped' });
        } else if (rotate) {
          pushToast({ variant: 'success', message: 'Encrypted tunnel key rotated' });
        } else if (res?.tunnel?.active) {
          pushToast({ variant: 'success', message: 'Encrypted mobile tunnel enabled' });
        }
      } catch (err) {
        pushToast({
          variant: 'error',
          message: `Tunnel error: ${err?.message || 'Failed to toggle mobile tunnel'}`,
        });
      }
    },
    [onToggleTunnel, pushToast],
  );

  const { chatHistoryTokenBreakdown, promptTokenContext } = usePromptTokenTelemetry({
    hasActiveScenario: scenario.hasActiveScenario,
    committedChatCardId: chat.committedChatCardId,
    selectedCardId: scenario.selectedCardId,
    activeChatFile: chat.activeChatFile,
    chatMetaStats: chat.chatMetaStats,
    messages: chat.messages,
    activeCardFull: scenario.activeCardFull,
    activeCharacter: scenario.activeCharacter,
    personaName: personasWs.personaName,
    activePersonaObj: personasWs.activePersonaObj,
    regexWorkspace,
    recapConfig: messageRecap.config,
  });

  const topBarParticipants = [
    ...(scenario.hasActiveScenario
      ? [
          {
            id: `scenario-${scenario.selectedCardId || 'active'}`,
            name: scenario.activeCharacter.name || 'Scenario',
            avatarUrl: chat.activeScenarioAvatarUrl,
            initials: scenario.activeCharacter.initials || 'CH',
          },
        ]
      : []),
    {
      id: `persona-${personasWs.activePersonaAvatar || personasWs.personaName || 'user'}`,
      name: personasWs.personaName || 'User',
      avatarUrl: personasWs.activePersonaAvatarUrl,
      initials: String(personasWs.personaName || 'ME').trim().slice(0, 2).toUpperCase() || 'ME',
    },
  ];

  const resolvedEditingPrompt = useMemo(
    () =>
      resolvePromptEditorTarget(
        presets.activeOpenaiDoc?.orderedPrompts || [],
        presets.editingPromptSelection,
        promptTokenContext,
      ),
    [presets.activeOpenaiDoc?.orderedPrompts, presets.editingPromptSelection, promptTokenContext],
  );

  useEffect(() => {
    if (
      !presets.loadingPreset &&
      presets.activeOpenaiDoc &&
      presets.editingPromptSelection &&
      !resolvedEditingPrompt
    ) {
      presets.setEditingPromptSelection(null);
    }
  }, [
    presets.loadingPreset,
    presets.activeOpenaiDoc,
    presets.editingPromptSelection,
    resolvedEditingPrompt,
    presets.setEditingPromptSelection,
  ]);

  const handleSaveGroupWithContext = useCallback(
    (updatedGroup) => presets.handleSaveEditedGroupInDoc(updatedGroup, promptTokenContext),
    [presets.handleSaveEditedGroupInDoc, promptTokenContext],
  );

  const sheetDismiss = useWorkspaceSheetDismiss({
    viewMode,
    createScenarioModalOpen: scenario.createScenarioModalOpen,
    setCreateScenarioModalOpen: scenario.setCreateScenarioModalOpen,
    personaModalOpen: personasWs.personaModalOpen,
    setPersonaModalOpen: personasWs.setPersonaModalOpen,
    resolvedEditingPrompt,
    setEditingPromptSelection: presets.setEditingPromptSelection,
    resolvedEditingIntro: scenario.resolvedEditingIntro,
    setEditingIntroTarget: scenario.setEditingIntroTarget,
    sheetExpanded,
    setSheetExpanded,
    setRightTab,
    matchedActiveCardFull: scenario.matchedActiveCardFull,
    hasActiveScenario: scenario.hasActiveScenario,
    isActiveCardDirty: scenario.isActiveCardDirty,
    activeCardFull: scenario.activeCardFull,
    activeCharacterName: scenario.activeCharacter?.name,
    cardSaving: scenario.cardSaving,
    handleSaveCardToPng: scenario.handleSaveCardToPng,
    handleDiscardCardChanges: scenario.handleDiscardCardChanges,
    createScenarioSheetRef,
    personaSheetRef: personasWs.personaSheetRef,
    promptEditorSheetRef: presets.promptEditorSheetRef,
    introEditorSheetRef,
    centerSheetSurfaceRef,
    workspaceGuardBridgeRef,
    scrollToChatBottom,
  });

  const characterSheetSharedProps = buildCharacterSheetSharedProps({
    isMobile,
    scenario,
    personasWs,
    presets,
    chat,
    activeSheetTab,
    setActiveSheetTab,
    sheetExpanded,
    setSheetExpanded,
    setRightOpen,
    setRightTab,
    setTimelinesOpen,
    activeWorkspaceSheetKind: sheetDismiss.activeWorkspaceSheetKind,
    runWithWorkspaceUnsavedGuard,
    scrollToChatBottom,
  });

  const leftTomeContent = (
    <LeftTomeContent
      leftTab={leftTab}
      scenario={scenario}
      personasWs={personasWs}
      chat={chat}
      charSplitRatio={charSplitRatio}
      setCharSplitRatio={setCharSplitRatio}
      timelinesOpen={timelinesOpen}
      customization={customization}
      onNotifyToast={(message, tone = 'info') => pushToast({ message, tone })}
      serverStatus={serverStatus}
      tunnelBusy={tunnelBusy}
      onToggleTunnelWithToast={handleToggleTunnelWithToast}
      onRefreshStatus={onRefreshStatus}
      onOpenQrModal={() => setQrModalOpen(true)}
      onOpenWelcomeGuide={boot.openWelcomeModal}
    />
  );

  const centerContent = (
    <>
      <TopBar
        leftOpen={leftOpen}
        onToggleLeft={() => {
          if (isMobile && !leftOpen) setRightOpen(false);
          setLeftOpen((v) => !v);
        }}
        rightOpen={rightOpen}
        onToggleRight={() => {
          if (isMobile && !rightOpen) setLeftOpen(false);
          setRightOpen((v) => !v);
        }}
        leftTomeInset={leftOpen && viewportWidth > 900 ? effectiveLeftWidth : 0}
        rightTomeInset={rightOpen && viewportWidth > 900 ? effectiveRightWidth : 0}
        chatTitle={
          (chat.committedChatCardId === scenario.selectedCardId ? chat.activeChatFile : '') ||
          (scenario.hasActiveScenario ? scenario.activeCharacter.name : 'NexusTavern')
        }
        participants={topBarParticipants}
        chatListOpen={false}
        onToggleChatList={chat.handleToggleChatList}
        timelinesOpen={timelinesOpen}
        onToggleTimelines={chat.handleToggleTimelines}
        sheetExpanded={sheetExpanded}
        promptEditorOpen={Boolean(resolvedEditingPrompt)}
        workspaceSheetOpen={Boolean(
          scenario.resolvedEditingIntro ||
            scenario.createScenarioModalOpen ||
            personasWs.personaModalOpen,
        )}
        onBackToChat={chat.handleBackToChat}
        qrModalOpen={qrModalOpen}
        tunnelActive={Boolean(serverStatus?.tunnel?.active)}
        onClickQrButton={() => setQrModalOpen(true)}
        showQrButton={false}
        isDemoCard={!scenario.hasActiveScenario || isDemoCardId(scenario.selectedCardId)}
        loadingChat={chat.loadingChat}
        onCreateNewChat={chat.handleCreateNewChat}
      />

      {viewMode !== 'sandbox' && (
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      )}

      <CenterWorkspaceSheets
        viewMode={viewMode}
        onExitSandbox={() => setViewMode('tavern')}
        isMobile={isMobile}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        effectiveLeftWidth={effectiveLeftWidth}
        effectiveRightWidth={effectiveRightWidth}
        chatListOpen={chatListOpen}
        timelinesOpen={timelinesOpen}
        centerSheetSurfaceRef={centerSheetSurfaceRef}
        createScenarioSheetRef={createScenarioSheetRef}
        introEditorSheetRef={introEditorSheetRef}
        chatStreamRef={chatStreamRef}
        chatComposerRef={chatComposerRef}
        scenario={scenario}
        personasWs={personasWs}
        apiHub={apiHub}
        presets={presets}
        chat={chat}
        sheetDismiss={sheetDismiss}
        resolvedEditingPrompt={resolvedEditingPrompt}
        onSaveEditedGroupInDoc={handleSaveGroupWithContext}
        sheetExpanded={sheetExpanded}
        characterSheetSharedProps={characterSheetSharedProps}
        shaderStyle={shaderStyle}
        shaderIntensity={shaderIntensity}
        lowGpu={lowGpu}
        pushComposerToast={pushComposerToast}
        composerToasts={composerToasts}
        dismissComposerToast={dismissComposerToast}
        consoleStream={consoleStream}
        recapConfig={messageRecap.config}
      />
    </>
  );

  const rightTomeContent = (
    <RightTomeContent
      rightTab={rightTab}
      sheetExpanded={sheetExpanded}
      scenario={scenario}
      personasWs={personasWs}
      apiHub={apiHub}
      presets={presets}
      chat={chat}
      characterSheetSharedProps={characterSheetSharedProps}
      aiSubTab={aiSubTab}
      setAiSubTab={setAiSubTab}
      promptTokenContext={promptTokenContext}
      savedChatTokens={chatHistoryTokenBreakdown.savedTokens}
      stImporter={stImporter}
      messageRecap={messageRecap}
      refusalCatcher={refusalCatcher}
      regexWorkspace={regexWorkspace}
      onNotifyToast={(message, tone = 'info') => pushToast({ message, tone })}
    />
  );

  const overlaysContent = (
    <AppShellOverlays
      viewMode={viewMode}
      boot={boot}
      scenario={scenario}
      personasWs={personasWs}
      apiHub={apiHub}
      sheetDismiss={sheetDismiss}
      lowGpu={lowGpu}
      stImporter={stImporter}
      qrModalOpen={qrModalOpen}
      onCloseQrModal={() => setQrModalOpen(false)}
      serverStatus={serverStatus}
      tunnelBusy={tunnelBusy}
      onRefreshStatus={onRefreshStatus}
      onToggleTunnelWithToast={handleToggleTunnelWithToast}
    />
  );

  return (
    <WorkspaceLayout
      idleFade={idleFade}
      minTomeWidth={MIN_TOME_WIDTH}
      maxTomeWidth={maxTomeWidth}
      defaultTomeWidth={DEFAULT_TOME_WIDTH}
      leftOpen={leftOpen}
      leftWidth={effectiveLeftWidth}
      onChangeLeftWidth={setLeftWidth}
      leftTabs={LEFT_TABS}
      leftTab={leftTab}
      onChangeLeftTab={setLeftTab}
      leftScrollDisabled={
        leftTab === 'characters' || leftTab === 'chats' || leftTab === 'usersettings'
      }
      leftContent={leftTomeContent}
      rightOpen={rightOpen}
      rightWidth={effectiveRightWidth}
      onChangeRightWidth={setRightWidth}
      rightTabs={RIGHT_TABS}
      rightTab={rightTab}
      onChangeRightTab={setRightTab}
      rightScrollDisabled={rightTab === 'selected'}
      rightContent={rightTomeContent}
      overlays={overlaysContent}
    >
      {centerContent}
    </WorkspaceLayout>
  );
}


