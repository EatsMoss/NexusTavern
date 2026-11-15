import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getAuthorizedAssetUrl } from '@core/api/apiClient.js';
import { useViewport } from '@core/hooks/useViewport.js';
import {
  fetchCharacterSummaries,
  fetchCharacterCard,
  updateCharacterCard,
  createCharacterCard,
  importCharacterCards,
  fetchPersonas,
  updatePersona,
  selectPersona,
  createPersona,
  uploadPersonaAvatar,
  duplicatePersona,
  deletePersona,
  fetchTags,
  createTag,
  renameTag,
  deleteTag,
  bulkSetCardTags,
  fetchGroups,
  createGroupChat,
  duplicateCharacterCard,
  deleteCharacterCard,
  deleteCharacterCards,
  getCardExportUrl,
  downloadCharacterCardsZip,
  replaceCharacterCardAvatar,
  replaceCharacterCardFromFile,
  updateCharacterScenarioMeta,
  uploadScenarioGalleryPortrait,
  removeScenarioGalleryPortrait,
  applyScenarioGalleryPortrait,
  convertCardToPersona,
  importEmbeddedCardTags,
  fetchAvailableWorlds,
  updateCharacterLoreBindings,
  importEmbeddedCardLore,
} from '@core/cards/cardsApi.js';
import {
  fetchCharacterChats,
  fetchChatWindow,
  createNewChat,
  branchCharacterChat,
  deleteCharacterChats,
  deleteAllCharacterChats,
  downloadCharacterChatsZip,
  importCharacterChats,
  uploadChatAttachments,
  appendMessageToChat,
  switchChatMessageSwipe,
  patchMessageInChat,
  deleteSwipeFromMessage,
  deleteMessageFromChat,
  deleteMessagesFromChat,
  updateChatMetadata,
  replaceChatPersona,
} from '@core/chats/chatsApi.js';
import { resolvePreferredCharacterChatFile } from '@core/chats/timelineForest.js';
import {
  fetchSession,
  patchSession,
  saveLastChat,
  readCachedLastChat,
  writeCachedLastChat,
  readCachedLastChatsMap,
  writeCachedLastChatsMap,
  upsertCachedCharacterLastChat,
  clearCachedCharacterLastChat,
  mergeLastChatsMaps,
  readCachedUiState,
  writeCachedUiState,
  readCachedPresetDraft,
  writeCachedPresetDraft,
  readCachedOnboardingDismissed,
  writeCachedOnboardingDismissed,
  pickNewestSessionSlice,
} from '@core/session/sessionApi.js';
import {
  fetchPresetsOverview,
  patchPresetAndConnectionSettings,
  fetchCategoryPresets,
  fetchPresetDetails,
  savePresetDetails,
  removePresetFile,
  renamePresetFile,
  duplicatePresetFile,
  exportPresetFile,
  importPresetFiles,
  bulkRemovePresetFiles,
  patchCategoryPresetsMeta,
  resolveCharacterBoundPreset,
} from '@core/presets/presetsApi.js';
import {
  fetchApiHubState,
  selectApiHubModel,
  patchApiHubProvider,
  fetchProviderModelsLive,
  createCustomApiHubProvider,
  removeCustomApiHubProvider,
  revealApiHubConnectionKey,
  pingApiHubConnections,
  fetchConnectionTelemetry,
  addApiHubCustomFamily,
  deleteApiHubCustomFamily,
} from '@core/api/apiHubApi.js';
import { M3_PRESET_SEEDS, applyM3ThemeTokens } from '@ui/tokens/themeTokens.js';
import { TokenSandbox } from '@ui/tokens/TokenSandbox.jsx';
import {
  Icon,
  SafeImage,
  Button,
  SegmentedGroup,
  Input,
  Switch,
  Slider,
  BookmarkRibbons,
  FolderCard,
  Dropdown,
  MarkdownEditor,
  Modal,
  WelcomeModal,
  UnsavedChangesModal,
  PearlescentShader,
  TopBar,
  PresetVaultInspector,
  PromptEditorSheet,
  resolvePromptEditorTarget,
  applyEditedPromptToOrdered,
  applyEditedGroupToOrdered,
  TomeResizeCurtain,
  ToastStack,
  useToastQueue,
  SplashScreen,
  ProgressIndicator,
  OverlayScrollArea,
  RefusalCatcherManager,
  createAttachmentDraft,
  revokeAttachmentDraft,
} from '@ui/index.js';
import { ChatViewport } from '@features/chat/ChatViewport.jsx';
import { ChatsTomePanel } from '@features/chat/ChatsTomePanel.jsx';
import { useChatStreaming } from '@features/chat/useChatStreaming.js';
import { useConsoleStream } from '@features/chat/useConsoleStream.js';
import { CharacterTome } from '@features/characters/CharacterTome.jsx';
import {
  CharacterSheet,
  serializeCardEditableSnapshot,
} from '@features/characters/CharacterSheet/CharacterSheet.jsx';
import { AdvancedDefinitionsPanel } from '@features/characters/CharacterSheet/AdvancedDefinitionsPanel.jsx';
import { IntroEditorSheet } from '@features/characters/CharacterSheet/IntroEditorSheet.jsx';
import {
  resolveIntroEditorTargetData,
  padIntroMetaArray,
  toServerIntroMetaPayload,
} from '@features/characters/CharacterSheet/IntrosTab.jsx';
import { ApiHubModal } from '@features/api-hub/ApiHubModal.jsx';
import { PersonaSheet } from '@features/personas/PersonaSheet.jsx';
import { RegexTomePanel } from '@features/regex/RegexTomePanel.jsx';
import { useRegexWorkspace } from '@features/regex/useRegexWorkspace.js';
import { useRefusalCatcher } from '@features/refusal/useRefusalCatcher.js';
import { RecapTomePanel } from '@features/recap/RecapTomePanel.jsx';
import { useMessageRecap } from '@features/recap/useMessageRecap.js';
import { StImporterTomePanel } from '@features/st-importer/StImporterTomePanel.jsx';
import { useStImporter } from '@features/st-importer/useStImporter.js';
import {
  isWorkspaceSheetExemptClickTarget,
  hasOpenTopLayerOverlay,
} from './useWorkspaceSheetDismiss.js';
import {
  CreateScenarioSheet,
  convertImageFileToPngBase64,
  readFileAsBase64,
} from '@features/characters/CreateScenarioSheet.jsx';
import { useCharacterGallery } from '@features/characters/useCharacterGallery.js';
import { usePinnedLayout, isCardInPinnedEntries } from '@features/characters/usePinnedLayout.js';
import { filterCards, sortCards } from '@features/characters/tagFilters.js';
import {
  estimateHistorySliceTokenBreakdown,
  estimateRecapInjectedPromptTokens,
} from '@core/presets/tokenEstimator.js';
import './AppShell.css';

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

const MODEL_OPTIONS = [
  { value: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet', meta: '200k' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', meta: '1M' },
  { value: 'gpt-4o-latest', label: 'ChatGPT-4o Latest', meta: '128k' },
  { value: 'deepseek-r1', label: 'DeepSeek R1', meta: '64k' },
];

const EMPTY_CHARACTER_FALLBACK = {
  id: '',
  avatar: '',
  name: 'No Scenario Selected',
  subtitle: '',
  initials: 'NT',
  thumbnailUrl: null,
  avatarUrl: null,
};

const DEFAULT_TOME_WIDTH = 550;
const MIN_TOME_WIDTH = 400;
const MAX_STORED_TOME_WIDTH = 2400;
const CHAT_COLUMN_WIDTH = 784;
const TOME_TOGGLE_CLEARANCE = 52; // 8px from tome edge + 36px toggle button + 8px gap to chat edge
const TOME_WIDTH_STORAGE_KEY = 'bookbound_panel_widths_v1';

function computeMaxTomeWidth(viewportWidth) {
  return Math.max(
    MIN_TOME_WIDTH,
    Math.floor((viewportWidth - CHAT_COLUMN_WIDTH) / 2) - TOME_TOGGLE_CLEARANCE,
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

function isDemoCardId(id) {
  return /^(?:c\d+|c_\d+)$/.test(String(id || ''));
}

function serializeOpenaiComparable(doc) {
  if (!doc) return '';
  return JSON.stringify({
    data: doc.data || {},
    orderedPrompts: doc.orderedPrompts || [],
    unlinkedPrompts: doc.unlinkedPrompts || [],
  });
}

function serializeTextgenComparable(doc) {
  if (!doc) return '';
  return JSON.stringify({ data: doc.data || {} });
}

export function AppShell({ serverStatus, onToggleTunnel, tunnelBusy, onRefreshStatus }) {
  const { width: viewportWidth, isMobile } = useViewport();
  const maxTomeWidth = useMemo(() => computeMaxTomeWidth(viewportWidth), [viewportWidth]);
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

  // Theme & Shader settings
  const [themeMode, setThemeMode] = useState('dark');
  const [activeSeed, setActiveSeed] = useState(M3_PRESET_SEEDS[0]);
  const [lowGpu, setLowGpu] = useState(false);
  const [idleFade, setIdleFade] = useState(false);
  const [shaderStyle, setShaderStyle] = useState('nacre'); // 'caustics' | 'nacre'
  const [shaderIntensity, setShaderIntensity] = useState(0.38);

  // Samplers & Dropdown state
  const [model, setModel] = useState('claude-3-7-sonnet');
  const [starredModels, setStarredModels] = useState(['claude-3-7-sonnet', 'gemini-2.5-pro']);
  const [temp, setTemp] = useState(1.05);
  const [minP, setMinP] = useState(0.08);
  const [ctxLen, setCtxLen] = useState(16384);

  // Characters, Personas & Modals state (clean boot — zero demo cards)
  const [cards, setCards] = useState([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [committedChatCardId, setCommittedChatCardId] = useState('');
  const [loadingCardAndChats, setLoadingCardAndChats] = useState(false);
  const [activeCardFull, setActiveCardFull] = useState(null);
  const [cleanCardSnapshot, setCleanCardSnapshot] = useState('');
  const cleanCardObjRef = useRef(null);
  const [busyPortrait, setBusyPortrait] = useState(false);
  const [busyLinksAction, setBusyLinksAction] = useState(false);
  const [worlds, setWorlds] = useState([]);
  const [activeChatWorld, setActiveChatWorld] = useState('');
  const [activeChatPortraitUrl, setActiveChatPortraitUrl] = useState(null);
  const [activeIntroIdx, setActiveIntroIdx] = useState(0);
  const [activeSheetTab, setActiveSheetTab] = useState(
    () => initialUi.activeSheetTab || 'description',
  );
  const [sheetExpanded, setSheetExpanded] = useState(() => Boolean(initialUi.sheetExpanded));
  const [editingPromptSelection, setEditingPromptSelection] = useState(null);
  const [editingIntroTarget, setEditingIntroTarget] = useState(null);
  const [cardSaveStatus, setCardSaveStatus] = useState('');
  const [cardSaving, setCardSaving] = useState(false);

  // Boot splash state (coordinates seamless transition from #bb-early-splash -> full hydration)
  const [bootSplashOpen, setBootSplashOpen] = useState(true);
  const [bootSplashExiting, setBootSplashExiting] = useState(false);
  const [bootStage, setBootStage] = useState({
    statusText: 'Restoring encrypted session & workspace...',
    stepLabel: 'Stage 1 / 3 · Connecting to server',
  });
  const bootCompletedRef = useRef(false);

  // Step 4.2.3 — character gallery (tags, groups, search & view state)
  const [tags, setTags] = useState([]);
  const [groups, setGroups] = useState([]);
  const [hiddenTagIds, setHiddenTagIds] = useState(() => {
    try {
      const raw = localStorage.getItem('nexustavern_hidden_tags_v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  });
  const [galleryStatus, setGalleryStatus] = useState('');
  const gallery = useCharacterGallery();

  // Multi-select & Rename/Delete dialog state for Right Tome
  const [multiSelectActive, setMultiSelectActive] = useState(false);
  const [multiSelectedIds, setMultiSelectedIds] = useState([]);
  const [multiSelectSubpopover, setMultiSelectSubpopover] = useState(null); // null | 'folder' | 'tags' | 'export'
  const [multiFolderInput, setMultiFolderInput] = useState('New Folder');
  const [multiTagInput, setMultiTagInput] = useState('');
  const [lastMultiClick, setLastMultiClick] = useState({ id: null, selected: true });
  const [renameDialog, setRenameDialog] = useState(null); // { kind: 'card'|'tag'|'folder', id, name, initialName? }
  const [renameDialogUnsavedOpen, setRenameDialogUnsavedOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null); // { kind: 'card'|'tag', id, name, deleteChats }
  const [createGroupDialog, setCreateGroupDialog] = useState(null); // { name, initialName?, members: Card[] }
  const [createGroupUnsavedOpen, setCreateGroupUnsavedOpen] = useState(false);
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(null); // { items: Entity[], deleteChats: boolean }
  const [createScenarioModalOpen, setCreateScenarioModalOpen] = useState(false);
  const [createScenarioModalMode, setCreateScenarioModalMode] = useState('create');
  const [creatingScenario, setCreatingScenario] = useState(false);
  const [createScenarioStatus, setCreateScenarioStatus] = useState('');

  // Central workspace sheet refs, dirty state & unsaved guard state
  const createScenarioSheetRef = useRef(null);
  const personaSheetRef = useRef(null);
  const promptEditorSheetRef = useRef(null);
  const introEditorSheetRef = useRef(null);
  const centerSheetSurfaceRef = useRef(null);
  const [sheetDirtyMeta, setSheetDirtyMeta] = useState({
    createScenario: { isDirty: false, canSave: false, cannotSaveReason: '', itemName: '', subtitle: '', saveLabel: 'Create & Close', busy: false },
    persona: { isDirty: false, canSave: false, cannotSaveReason: '', itemName: '', subtitle: '', saveLabel: 'Save & Close', busy: false },
    prompt: { isDirty: false, canSave: true, cannotSaveReason: '', itemName: '', subtitle: '', saveLabel: 'Save & Close', busy: false },
    intro: { isDirty: false, canSave: true, cannotSaveReason: '', itemName: '', subtitle: '', saveLabel: 'Save & Close', busy: false },
  });
  const [workspaceUnsavedGuard, setWorkspaceUnsavedGuard] = useState(null);
  const workspaceGuardActionRef = useRef(null);
  const workspaceGuardBridgeRef = useRef({
    activeKind: null,
    isCardDirty: false,
    runGuard: (fn) => fn?.(),
  });
  const runWithWorkspaceUnsavedGuard = useCallback((proceedAction, opts) => {
    workspaceGuardBridgeRef.current.runGuard(proceedAction, opts);
  }, []);

  const [personas, setPersonas] = useState([]);
  const [activePersonaAvatar, setActivePersonaAvatar] = useState('');
  const [personaName, setPersonaName] = useState('User');
  const [personaDesc, setPersonaDesc] = useState('');
  const [personaSaveStatus, setPersonaSaveStatus] = useState('');
  const [personaModalMode, setPersonaModalMode] = useState('manage'); // 'manage' | 'create'
  const [personaModalTargetAvatar, setPersonaModalTargetAvatar] = useState('');
  const personasRef = useRef([]);
  const activePersonaAvatarRef = useRef('');
  const sessionPersonaHintRef = useRef({
    chatPersonaAvatar: null,
    hasUserMessages: false,
    cardAvatar: null,
  });

  const [hudTool, setHudTool] = useState('cursor');
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const onboardingDismissedRef = useRef(readCachedOnboardingDismissed());
  const [draftMsg, setDraftMsg] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const pendingAttachmentsRef = useRef([]);
  const [swipeIdx, setSwipeIdx] = useState(0);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((item) => revokeAttachmentDraft(item));
    };
  }, []);

  const handleAddAttachments = useCallback(async (rawFiles) => {
    const list = Array.from(rawFiles || []).filter(Boolean);
    if (list.length === 0) return;
    const created = (await Promise.all(list.map((f) => createAttachmentDraft(f)))).filter(Boolean);
    if (created.length === 0) return;
    setPendingAttachments((prev) => [...prev, ...created]);
  }, []);

  const handleRemoveAttachment = useCallback((attId) => {
    setPendingAttachments((prev) => {
      const target = prev.find((x) => x.id === attId);
      if (target) revokeAttachmentDraft(target);
      return prev.filter((x) => x.id !== attId);
    });
  }, []);

  // Step 3.2: Real .jsonl Chat state (Tail-First Pagination, Lazy Swipes, Delta Sync)
  const [chatFiles, setChatFiles] = useState([]);
  const [chatListMeta, setChatListMeta] = useState({
    totalChats: 0,
    hasMore: false,
    nextOffset: 0,
    loadingMore: false,
  });
  const [activeChatFile, setActiveChatFile] = useState('');
  const [chatListOpen, setChatListOpen] = useState(false);
  const [timelinesOpen, setTimelinesOpen] = useState(() => Boolean(initialUi.timelinesOpen));
  const [timelineChats, setTimelineChats] = useState([]);
  const [loadingTimelines, setLoadingTimelines] = useState(false);
  const [focusedTimelineRequest, setFocusedTimelineRequest] = useState(null);
  const [focusedTimelineNodeFile, setFocusedTimelineNodeFile] = useState('');
  const [chatMetaStats, setChatMetaStats] = useState({
    totalMessages: 0,
    startIndex: 0,
    endIndex: 0,
    hasMoreOlder: false,
    olderCount: 0,
    olderHistoryTokens: 0,
    olderHistoryRawTokens: 0,
    fileSize: 0,
    elapsedMs: 0,
    syncStatus: '',
  });
  const [loadingChat, setLoadingChat] = useState(false);
  const [editingMsgIndex, setEditingMsgIndex] = useState(null);
  const [editingMsgText, setEditingMsgText] = useState('');
  const consoleStream = useConsoleStream();
  const loadedSessionRef = useRef({ cardId: null, chatFile: null });
  const chatWindowSeqRef = useRef(0);
  const cardLoadSeqRef = useRef(0);
  const chatStreamRef = useRef(null);
  // Last `{ avatar, file }` pair pushed to the persisted UI session, so re-entrant
  // window loads (stream completion, swipe reloads) don't rewrite the same pointer.
  const recordedSessionPointerRef = useRef(null);
  // Per-character `{ [avatar]: { file, updatedAtMs } }` map so switching characters
  // always re-opens the exact chat last visited on that character.
  const lastChatsByAvatarRef = useRef(readCachedLastChatsMap());
  // Restored `{ avatar, file }` from `session.json`, consumed once by the boot sequence.
  const restorePointerRef = useRef(null);
  const restoreCardAppliedRef = useRef(false);
  const restorePointerAppliedRef = useRef(false);

  // Step 3.3: Presets & Zero-Trust Secrets Vault state
  const [mainApi, setMainApi] = useState('openai');
  const [openaiPresets, setOpenaiPresets] = useState([]);
  const [textgenPresets, setTextgenPresets] = useState([]);
  const [activePresets, setActivePresets] = useState({
    openai: 'Default',
    textgen: 'Default',
  });
  const [starredPresets, setStarredPresets] = useState([]);
  const [presetCategoryMeta, setPresetCategoryMeta] = useState({
    openai: { starred: [], folders: [], presetFolders: {}, characterBindings: {} },
    textgen: { starred: [], folders: [], presetFolders: {}, characterBindings: {} },
  });
  const [presetsBootDone, setPresetsBootDone] = useState(false);
  const lastAutoPresetCardRef = useRef('');
  const [cleanOpenaiSnapshot, setCleanOpenaiSnapshot] = useState('');
  const [cleanTextgenSnapshot, setCleanTextgenSnapshot] = useState('');
  const [activeOpenaiDoc, setActiveOpenaiDoc] = useState(null);
  const [activeTextgenDoc, setActiveTextgenDoc] = useState(null);
  const [apiHubState, setApiHubState] = useState(null);
  const [presetStatusMsg, setPresetStatusMsg] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState(false);

  const sessionPromiseRef = useRef(null);
  const presetsBootReadyRef = useRef(false);
  const pendingSessionPatchRef = useRef({});
  const sessionPatchTimerRef = useRef(null);
  const lastSavedPresetDraftSigRef = useRef(null);

  const flushPendingSessionPatch = useCallback((preferKeepalive = false) => {
    if (sessionPatchTimerRef.current) {
      clearTimeout(sessionPatchTimerRef.current);
      sessionPatchTimerRef.current = null;
    }
    const patch = pendingSessionPatchRef.current;
    if (!patch || Object.keys(patch).length === 0) return;
    pendingSessionPatchRef.current = {};
    patchSession(patch, { preferKeepalive }).catch(() => {});
  }, []);

  const queueSessionPatch = useCallback(
    (partialPatch) => {
      pendingSessionPatchRef.current = {
        ...pendingSessionPatchRef.current,
        ...partialPatch,
      };
      if (sessionPatchTimerRef.current) {
        clearTimeout(sessionPatchTimerRef.current);
      }
      sessionPatchTimerRef.current = setTimeout(() => {
        flushPendingSessionPatch(false);
      }, 280);
    },
    [flushPendingSessionPatch],
  );

  useEffect(() => {
    const onPageHide = () => flushPendingSessionPatch(true);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      flushPendingSessionPatch(true);
    };
  }, [flushPendingSessionPatch]);

  const loadPresetsAndVault = useCallback(async () => {
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = fetchSession().catch(() => null);
    }
    try {
      const [overview, oaiRes, tgRes, hubRes, sessionRes] = await Promise.all([
        fetchPresetsOverview(),
        fetchCategoryPresets('openai'),
        fetchCategoryPresets('textgen'),
        fetchApiHubState().catch(() => null),
        sessionPromiseRef.current,
      ]);

      const localPresetDraft = readCachedPresetDraft();
      const serverPresetDraft = sessionRes?.presetDraft || null;
      const savedPresetDraft = pickNewestSessionSlice(localPresetDraft, serverPresetDraft);
      if (savedPresetDraft && !localPresetDraft) {
        writeCachedPresetDraft(savedPresetDraft);
      } else if (
        localPresetDraft &&
        (!serverPresetDraft ||
          (Number(localPresetDraft.updatedAtMs) || 0) > (Number(serverPresetDraft.updatedAtMs) || 0))
      ) {
        queueSessionPatch({ presetDraft: localPresetDraft });
      }

      if (overview?.mainApi) setMainApi(overview.mainApi);
      if (overview?.activePresets) setActivePresets(overview.activePresets);
      if (hubRes?.ok) setApiHubState(hubRes);

      setOpenaiPresets(oaiRes?.presets || []);
      setTextgenPresets(tgRes?.presets || []);

      if (oaiRes?.meta || tgRes?.meta) {
        setPresetCategoryMeta((prev) => ({
          ...prev,
          openai: oaiRes?.meta || prev.openai,
          textgen: tgRes?.meta || prev.textgen,
        }));
        if (Array.isArray(oaiRes?.meta?.starred) && oaiRes.meta.starred.length > 0) {
          setStarredPresets(oaiRes.meta.starred);
        }
      }

      const oaiName = overview?.activePresets?.openai || oaiRes?.presets?.[0]?.name;
      if (oaiName) {
        const oaiDoc = await fetchPresetDetails('openai', oaiName);
        if (oaiDoc?.preset) {
          setCleanOpenaiSnapshot(serializeOpenaiComparable(oaiDoc.preset));
          if (
            savedPresetDraft?.category === 'openai' &&
            savedPresetDraft?.presetName === oaiDoc.preset.name
          ) {
            const restoredDoc = {
              ...oaiDoc.preset,
              data:
                savedPresetDraft.data && typeof savedPresetDraft.data === 'object'
                  ? { ...oaiDoc.preset.data, ...savedPresetDraft.data }
                  : oaiDoc.preset.data,
              orderedPrompts: Array.isArray(savedPresetDraft.orderedPrompts)
                ? savedPresetDraft.orderedPrompts
                : oaiDoc.preset.orderedPrompts,
              unlinkedPrompts: Array.isArray(savedPresetDraft.unlinkedPrompts)
                ? savedPresetDraft.unlinkedPrompts
                : oaiDoc.preset.unlinkedPrompts,
            };
            lastSavedPresetDraftSigRef.current = serializeOpenaiComparable(restoredDoc);
            setActiveOpenaiDoc(restoredDoc);
          } else {
            lastSavedPresetDraftSigRef.current = null;
            setActiveOpenaiDoc(oaiDoc.preset);
            if (savedPresetDraft?.category === 'openai') {
              writeCachedPresetDraft(null);
              queueSessionPatch({ presetDraft: null });
            }
          }
        }
      }

      const tgName = overview?.activePresets?.textgen || tgRes?.presets?.[0]?.name;
      if (tgName) {
        const tgDoc = await fetchPresetDetails('textgen', tgName);
        if (tgDoc?.preset) {
          setCleanTextgenSnapshot(serializeTextgenComparable(tgDoc.preset));
          if (
            savedPresetDraft?.category === 'textgen' &&
            savedPresetDraft?.presetName === tgDoc.preset.name
          ) {
            const restoredTg = {
              ...tgDoc.preset,
              data:
                savedPresetDraft.data && typeof savedPresetDraft.data === 'object'
                  ? { ...tgDoc.preset.data, ...savedPresetDraft.data }
                  : tgDoc.preset.data,
            };
            lastSavedPresetDraftSigRef.current = serializeTextgenComparable(restoredTg);
            setActiveTextgenDoc(restoredTg);
          } else {
            setActiveTextgenDoc(tgDoc.preset);
            if (savedPresetDraft?.category === 'textgen') {
              writeCachedPresetDraft(null);
              queueSessionPatch({ presetDraft: null });
            }
          }
        }
      }
      presetsBootReadyRef.current = true;
      setPresetsBootDone(true);
    } catch {
      // Keep fallback UI state if server is unreachable
    }
  }, [queueSessionPatch]);

  useEffect(() => {
    loadPresetsAndVault();
  }, [loadPresetsAndVault]);
  const handleSelectPreset = async (category, nextName) => {
    if (!nextName) return;
    setActivePresets((prev) => ({ ...prev, [category]: nextName }));
    setLoadingPreset(true);
    try {
      const [docRes] = await Promise.all([
        fetchPresetDetails(category, nextName),
        patchPresetAndConnectionSettings({ activePresets: { [category]: nextName } }),
      ]);
      if (docRes?.preset) {
        if (category === 'openai') {
          lastSavedPresetDraftSigRef.current = null;
          writeCachedPresetDraft(null);
          queueSessionPatch({ presetDraft: null });
          setActiveOpenaiDoc(docRes.preset);
          setCleanOpenaiSnapshot(serializeOpenaiComparable(docRes.preset));
        } else if (category === 'textgen') {
          lastSavedPresetDraftSigRef.current = null;
          writeCachedPresetDraft(null);
          queueSessionPatch({ presetDraft: null });
          setActiveTextgenDoc(docRes.preset);
          setCleanTextgenSnapshot(serializeTextgenComparable(docRes.preset));
        }
        setPresetStatusMsg(`Loaded ${nextName} (${docRes.preset.elapsedMs} ms)`);
      }
    } catch (err) {
      setPresetStatusMsg(`Error: ${err.message}`);
    } finally {
      setLoadingPreset(false);
    }
  };

  const refreshCategoryListState = async (category) => {
    const res = await fetchCategoryPresets(category);
    if (category === 'openai') setOpenaiPresets(res?.presets || []);
    else if (category === 'textgen') setTextgenPresets(res?.presets || []);
    if (res?.meta && (category === 'openai' || category === 'textgen')) {
      setPresetCategoryMeta((prev) => ({ ...prev, [category]: res.meta }));
      if (category === 'openai') setStarredPresets(res.meta.starred || []);
    }
    return res;
  };

  const handleSavePresetDoc = async (category, doc) => {
    if (!doc || !doc.name || savingPreset) return;
    setSavingPreset(true);
    try {
      const res = await savePresetDetails(category, doc.name, {
        data: doc.data,
        orderedPrompts: doc.orderedPrompts,
        unlinkedPrompts: doc.unlinkedPrompts,
      });
      if (res?.preset) {
        if (category === 'openai') {
          lastSavedPresetDraftSigRef.current = null;
          writeCachedPresetDraft(null);
          queueSessionPatch({ presetDraft: null });
          setActiveOpenaiDoc(res.preset);
          setCleanOpenaiSnapshot(serializeOpenaiComparable(res.preset));
        } else if (category === 'textgen') {
          lastSavedPresetDraftSigRef.current = null;
          writeCachedPresetDraft(null);
          queueSessionPatch({ presetDraft: null });
          setActiveTextgenDoc(res.preset);
          setCleanTextgenSnapshot(serializeTextgenComparable(res.preset));
        }
        await refreshCategoryListState(category);
        setPresetStatusMsg(`Saved ${doc.name} (${res.preset.elapsedMs} ms)`);
      }
    } catch (err) {
      setPresetStatusMsg(`Save failed: ${err.message}`);
    } finally {
      setSavingPreset(false);
    }
  };
  const handleSaveAsPreset = async (category, newName, sourceDoc) => {
    if (!newName || !sourceDoc) return;
    setSavingPreset(true);
    try {
      const res = await savePresetDetails(category, newName, {
        data: sourceDoc.data,
        orderedPrompts: sourceDoc.orderedPrompts,
        unlinkedPrompts: sourceDoc.unlinkedPrompts,
      });
      await refreshCategoryListState(category);
      if (res?.preset) {
        await handleSelectPreset(category, res.preset.name);
        setPresetStatusMsg(`Created preset "${res.preset.name}"`);
      }
    } catch (err) {
      setPresetStatusMsg(`Save As failed: ${err.message}`);
    } finally {
      setSavingPreset(false);
    }
  };

  const handleRenamePreset = async (category, oldName, newName) => {
    if (!oldName || !newName) return;
    try {
      const res = await renamePresetFile(category, oldName, newName);
      await refreshCategoryListState(category);
      if (res?.newName) {
        setActivePresets((prev) => ({ ...prev, [category]: res.newName }));
        if (category === 'openai' && activeOpenaiDoc?.name === oldName) {
          setActiveOpenaiDoc((prev) => (prev ? { ...prev, name: res.newName } : prev));
        } else if (category === 'textgen' && activeTextgenDoc?.name === oldName) {
          setActiveTextgenDoc((prev) => (prev ? { ...prev, name: res.newName } : prev));
        } else {
          await handleSelectPreset(category, res.newName);
        }
        setPresetStatusMsg(`Renamed "${oldName}" → "${res.newName}"`);
      }
    } catch (err) {
      setPresetStatusMsg(`Rename failed: ${err.message}`);
    }
  };

  const handleDuplicatePreset = async (category, sourceName) => {
    if (!sourceName) return;
    try {
      const res = await duplicatePresetFile(category, sourceName);
      await refreshCategoryListState(category);
      if (res?.newName) {
        await handleSelectPreset(category, res.newName);
        setPresetStatusMsg(`Duplicated "${sourceName}" → "${res.newName}"`);
      }
    } catch (err) {
      setPresetStatusMsg(`Duplicate failed: ${err.message}`);
    }
  };

  const handleDeletePreset = async (category, targetName) => {
    if (!targetName) return;
    try {
      await removePresetFile(category, targetName);
      const listing = await refreshCategoryListState(category);
      const nextFallback = listing?.presets?.[0]?.name || '';
      if (nextFallback) await handleSelectPreset(category, nextFallback);
      setPresetStatusMsg(`Deleted "${targetName}" (backup saved)`);
    } catch (err) {
      setPresetStatusMsg(`Delete failed: ${err.message}`);
    }
  };

  const handleBulkDeletePresets = async (category, names) => {
    if (!Array.isArray(names) || names.length === 0) return;
    try {
      const res = await bulkRemovePresetFiles(category, names);
      const listing = await refreshCategoryListState(category);
      if (names.includes(activePresets[category])) {
        const nextFallback = listing?.presets?.[0]?.name || '';
        if (nextFallback) await handleSelectPreset(category, nextFallback);
      }
      setPresetStatusMsg(`Bulk deleted ${res?.deletedCount || names.length} presets (backed up)`);
    } catch (err) {
      setPresetStatusMsg(`Bulk delete failed: ${err.message}`);
    }
  };

  const handleExportPreset = async (category, name, includeConnection = false) => {
    if (!name) return;
    try {
      const res = await exportPresetFile(category, name, includeConnection);
      if (res?.data) {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.fileName || `${name}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setPresetStatusMsg(`Exported "${name}.json" (${includeConnection ? 'with connection' : 'clean'})`);
      }
    } catch (err) {
      setPresetStatusMsg(`Export failed: ${err.message}`);
    }
  };

  const handleImportPresetFiles = async (category, items) => {
    if (!Array.isArray(items) || items.length === 0) return;
    try {
      const res = await importPresetFiles(category, items);
      await refreshCategoryListState(category);
      const firstImported = res?.imported?.[0]?.name;
      if (firstImported) await handleSelectPreset(category, firstImported);
      setPresetStatusMsg(`Imported ${res?.importedCount || items.length} preset(s)`);
    } catch (err) {
      setPresetStatusMsg(`Import failed: ${err.message}`);
    }
  };

  const handlePresetMetaPatch = async (category, patch) => {
    try {
      const res = await patchCategoryPresetsMeta(category, patch);
      if (res?.presets) {
        if (category === 'openai') setOpenaiPresets(res.presets);
        else if (category === 'textgen') setTextgenPresets(res.presets);
      }
      if (res?.meta) {
        setPresetCategoryMeta((prev) => ({ ...prev, [category]: res.meta }));
        if (category === 'openai') setStarredPresets(res.meta.starred || []);
      }
    } catch {
      // ignore
    }
  };

  const isCurrentPresetDirty = useMemo(() => {
    if (mainApi === 'openai' && activeOpenaiDoc) {
      const snap = serializeOpenaiComparable(activeOpenaiDoc);
      return Boolean(cleanOpenaiSnapshot && snap !== cleanOpenaiSnapshot);
    }
    if (mainApi !== 'openai' && activeTextgenDoc) {
      const snap = serializeTextgenComparable(activeTextgenDoc);
      return Boolean(cleanTextgenSnapshot && snap !== cleanTextgenSnapshot);
    }
    return false;
  }, [mainApi, activeOpenaiDoc, activeTextgenDoc, cleanOpenaiSnapshot, cleanTextgenSnapshot]);

  const handleBindPresetToCharacter = useCallback(
    async (avatar, presetName, category = 'openai') => {
      const cleanAvatar = String(avatar || '').trim();
      if (!cleanAvatar) return;
      const cleanPreset = presetName ? String(presetName).trim() : '';
      await handlePresetMetaPatch(category, {
        bindCharacter: {
          avatar: cleanAvatar,
          presetName: cleanPreset || null,
        },
      });
      if (
        cleanPreset &&
        cleanAvatar === selectedCardId &&
        activePresets[category] !== cleanPreset &&
        !isCurrentPresetDirty
      ) {
        await handleSelectPreset(category, cleanPreset);
      }
    },
    [selectedCardId, activePresets, isCurrentPresetDirty],
  );

  const handleUnbindAllCharactersFromPreset = useCallback(
    async (presetName, category = 'openai') => {
      const cleanPreset = String(presetName || '').trim();
      if (!cleanPreset) return;
      await handlePresetMetaPatch(category, {
        unbindPresetCharacters: cleanPreset,
      });
    },
    [],
  );

  // Auto-activate character-bound preset whenever the active scenario changes
  useEffect(() => {
    if (!presetsBootDone || !selectedCardId || isDemoCardId(selectedCardId)) {
      return;
    }
    if (lastAutoPresetCardRef.current === selectedCardId) {
      return;
    }
    lastAutoPresetCardRef.current = selectedCardId;

    const activeCategory = mainApi === 'openai' ? 'openai' : 'textgen';
    const bindings = presetCategoryMeta[activeCategory]?.characterBindings || {};
    const boundPreset = resolveCharacterBoundPreset(bindings, selectedCardId);
    if (!boundPreset) return;

    const list = activeCategory === 'openai' ? openaiPresets : textgenPresets;
    const exists = list.some((p) => p.name === boundPreset);
    if (!exists || activePresets[activeCategory] === boundPreset) {
      return;
    }

    if (isCurrentPresetDirty) {
      pushToast({
        variant: 'info',
        icon: 'sliders',
        message: `Kept unsaved preset draft (bound preset "${boundPreset}" was not auto-applied)`,
      });
      return;
    }

    handleSelectPreset(activeCategory, boundPreset);
  }, [
    presetsBootDone,
    selectedCardId,
    mainApi,
    presetCategoryMeta,
    openaiPresets,
    textgenPresets,
    activePresets,
    isCurrentPresetDirty,
    pushToast,
  ]);

  // Persist unsaved prompt/sampler changes for the active preset (without overwriting its .json file)
  useEffect(() => {
    if (!presetsBootReadyRef.current) return;

    if (mainApi === 'openai' && activeOpenaiDoc?.name && cleanOpenaiSnapshot) {
      const currentSig = serializeOpenaiComparable(activeOpenaiDoc);
      if (currentSig !== cleanOpenaiSnapshot) {
        if (lastSavedPresetDraftSigRef.current === currentSig) return;
        lastSavedPresetDraftSigRef.current = currentSig;
        const draft = writeCachedPresetDraft({
          category: 'openai',
          presetName: activeOpenaiDoc.name,
          data: activeOpenaiDoc.data || {},
          orderedPrompts: activeOpenaiDoc.orderedPrompts || [],
          unlinkedPrompts: activeOpenaiDoc.unlinkedPrompts || [],
          updatedAtMs: Date.now(),
        });
        queueSessionPatch({ presetDraft: draft });
      } else if (lastSavedPresetDraftSigRef.current !== null || readCachedPresetDraft()?.category === 'openai') {
        lastSavedPresetDraftSigRef.current = null;
        writeCachedPresetDraft(null);
        queueSessionPatch({ presetDraft: null });
      }
    } else if (mainApi !== 'openai' && activeTextgenDoc?.name && cleanTextgenSnapshot) {
      const currentSig = serializeTextgenComparable(activeTextgenDoc);
      if (currentSig !== cleanTextgenSnapshot) {
        if (lastSavedPresetDraftSigRef.current === currentSig) return;
        lastSavedPresetDraftSigRef.current = currentSig;
        const draft = writeCachedPresetDraft({
          category: 'textgen',
          presetName: activeTextgenDoc.name,
          data: activeTextgenDoc.data || {},
          updatedAtMs: Date.now(),
        });
        queueSessionPatch({ presetDraft: draft });
      } else if (lastSavedPresetDraftSigRef.current !== null || readCachedPresetDraft()?.category === 'textgen') {
        lastSavedPresetDraftSigRef.current = null;
        writeCachedPresetDraft(null);
        queueSessionPatch({ presetDraft: null });
      }
    }
  }, [
    mainApi,
    activeOpenaiDoc,
    cleanOpenaiSnapshot,
    activeTextgenDoc,
    cleanTextgenSnapshot,
    queueSessionPatch,
  ]);

  const applyHubResponse = useCallback((res) => {
    if (!res) return;
    if (res.hub) {
      setApiHubState(res.hub);
    } else {
      setApiHubState(res);
    }
  }, []);

  const handleSelectHubModel = useCallback(
    async (providerId, modelId = null) => {
      try {
        const res = await selectApiHubModel(providerId, modelId);
        applyHubResponse(res);
      } catch (err) {
        setPresetStatusMsg(`Model switch error: ${err.message}`);
      }
    },
    [applyHubResponse],
  );

  const handleUpdateHubProvider = useCallback(
    async (providerId, patch) => {
      const res = await patchApiHubProvider(providerId, patch);
      applyHubResponse(res);
      return res;
    },
    [applyHubResponse],
  );

  const handleFetchHubModels = useCallback(
    async (providerId, pendingPatch) => {
      try {
        const res = await fetchProviderModelsLive(providerId, pendingPatch);
        applyHubResponse(res);
        return res;
      } catch (err) {
        const fresh = await fetchApiHubState().catch(() => null);
        if (fresh?.ok) applyHubResponse(fresh);
        throw err;
      }
    },
    [applyHubResponse],
  );

  const handleCreateCustomHubConn = useCallback(
    async (payload) => {
      const res = await createCustomApiHubProvider(payload);
      applyHubResponse(res);
      return res;
    },
    [applyHubResponse],
  );

  const handleDeleteCustomHubConn = useCallback(
    async (providerId) => {
      const res = await removeCustomApiHubProvider(providerId);
      applyHubResponse(res);
      return res;
    },
    [applyHubResponse],
  );

  const handleRevealHubKey = useCallback(async (connectionId, keyId = '') => {
    const res = await revealApiHubConnectionKey(connectionId, keyId);
    return res?.apiKey || '';
  }, []);

  const handlePingHubConnections = useCallback(async () => {
    const res = await pingApiHubConnections();
    applyHubResponse(res);
    return res;
  }, [applyHubResponse]);

  const handleFetchHubTelemetry = useCallback(
    async (connectionId) => {
      const res = await fetchConnectionTelemetry(connectionId);
      applyHubResponse(res);
      return res;
    },
    [applyHubResponse],
  );

  const handleAddHubCustomFamily = useCallback(
    async (payload) => {
      const res = await addApiHubCustomFamily(payload);
      applyHubResponse(res);
      return res;
    },
    [applyHubResponse],
  );

  const handleDeleteHubCustomFamily = useCallback(
    async (familyId) => {
      const res = await deleteApiHubCustomFamily(familyId);
      applyHubResponse(res);
      return res;
    },
    [applyHubResponse],
  );

  const scrollToChatBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatStreamRef.current) {
        chatStreamRef.current.scrollTop = chatStreamRef.current.scrollHeight;
      }
    });
  }, []);

  const applyResolvedPersonaLocally = useCallback((found, list = null) => {
    if (!found) return;
    activePersonaAvatarRef.current = found.avatar;
    setActivePersonaAvatar(found.avatar);
    setPersonaName(found.name);
    setPersonaDesc(found.description || '');
    if (Array.isArray(list)) {
      personasRef.current = list;
      setPersonas(list);
    }
  }, []);

  const syncSessionPersona = useCallback(
    (hint = {}, listOverride = null) => {
      const list = Array.isArray(listOverride) ? listOverride : personasRef.current;
      if (!Array.isArray(list) || list.length === 0) return;

      let chosen = null;

      // 1. Open chat already has a persona (from user messages / chat metadata) -> always match chat
      if (hint.chatPersonaAvatar) {
        chosen = list.find((p) => p.avatar === hint.chatPersonaAvatar) || null;
      }

      // 2. Empty/new chat with zero user messages -> check scenario-connected persona, else keep active
      if (!chosen && !hint.hasUserMessages && hint.cardAvatar && !hint.keepCurrentOnNewChat) {
        const stem = String(hint.cardAvatar).replace(/\.(png|json)$/i, '');
        chosen =
          list.find((p) =>
            (p.connections || []).some(
              (c) =>
                c &&
                c.type === 'character' &&
                (c.id === hint.cardAvatar || c.id === stem),
            ),
          ) || null;
      }

      if (!chosen) {
        chosen =
          list.find((p) => p.avatar === activePersonaAvatarRef.current) ||
          list.find((p) => p.isActive) ||
          list[0];
      }

      if (chosen) {
        const prevServerActive = list.find((p) => p.isActive)?.avatar || '';
        applyResolvedPersonaLocally(chosen);
        if (chosen.avatar !== prevServerActive) {
          selectPersona(chosen.avatar)
            .then((res) => {
              if (Array.isArray(res?.personas)) {
                personasRef.current = res.personas;
                setPersonas(res.personas);
              }
            })
            .catch(() => {});
        }
      }
    },
    [applyResolvedPersonaLocally],
  );

  const finishBootSplash = useCallback(() => {
    if (bootCompletedRef.current) return;
    bootCompletedRef.current = true;
    setBootSplashExiting(true);
    setTimeout(() => {
      setBootSplashOpen(false);
      setBootSplashExiting(false);
    }, 340);
  }, []);

  // Dismiss the static #bb-early-splash from index.html as soon as the live React SplashScreen paints
  useEffect(() => {
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        const early = document.getElementById('bb-early-splash');
        if (early) {
          early.classList.add('is-hidden');
          setTimeout(() => early.remove(), 260);
        }
      });
      return () => cancelAnimationFrame(raf2);
    });
    // Safety fallback so a slow or unreachable backend never locks the splash forever
    const safetyTimer = setTimeout(() => {
      finishBootSplash();
    }, 8000);
    return () => {
      cancelAnimationFrame(raf1);
      clearTimeout(safetyTimer);
    };
  }, [finishBootSplash]);

  const loadCardsAndPersonas = useCallback(async () => {
    setLoadingCards(true);
    try {
      const [charRes, personaRes, tagRes, groupRes, worldsList] = await Promise.all([
        fetchCharacterSummaries(),
        fetchPersonas(),
        fetchTags().catch(() => ({ tags: [], tagMap: {} })),
        fetchGroups().catch(() => ({ count: 0, groups: [] })),
        fetchAvailableWorlds().catch(() => []),
      ]);
      setWorlds(Array.isArray(worldsList) ? worldsList : []);
      const loadedChars = Array.isArray(charRes?.characters) ? charRes.characters : [];
      setCards(loadedChars);
      setTags(Array.isArray(tagRes?.tags) ? tagRes.tags : []);

      let chosenBootCardId = '';
      if (loadedChars.length > 0) {
        // Compute first-boot restoration OUTSIDE `setSelectedCardId` so React StrictMode's
        // double-invocation of state updaters remains 100% pure and never drops the restored card.
        const shouldRestoreBootCard = !restoreCardAppliedRef.current;
        if (shouldRestoreBootCard) {
          restoreCardAppliedRef.current = true;
        }
        const restoredAvatar = shouldRestoreBootCard ? restorePointerRef.current?.avatar : '';
        const validRestoredAvatar =
          restoredAvatar && loadedChars.some((c) => c.id === restoredAvatar)
            ? restoredAvatar
            : '';

        chosenBootCardId = validRestoredAvatar || loadedChars[0].id;
        setSelectedCardId((prev) => {
          if (validRestoredAvatar) {
            return validRestoredAvatar;
          }
          return loadedChars.some((c) => c.id === prev) ? prev : loadedChars[0].id;
        });
      } else {
        setSelectedCardId('');
      }

      setGroups(groupRes?.groups || []);

      const loadedPersonas = Array.isArray(personaRes?.personas) ? personaRes.personas : [];
      personasRef.current = loadedPersonas;
      setPersonas(loadedPersonas);
      if (loadedPersonas.length > 0) {
        if (!activePersonaAvatarRef.current && personaRes.activePersonaAvatar) {
          activePersonaAvatarRef.current = personaRes.activePersonaAvatar;
        }
        syncSessionPersona(sessionPersonaHintRef.current, loadedPersonas);
      } else {
        activePersonaAvatarRef.current = '';
        setActivePersonaAvatar('');
      }
      return {
        count: loadedChars.length,
        personasCount: loadedPersonas.length,
        selectedId: chosenBootCardId,
      };
    } catch {
      return { count: 0, personasCount: 0, selectedId: '' };
    } finally {
      setLoadingCards(false);
    }
  }, [syncSessionPersona]);

  useEffect(() => {
    if (!isMobile) {
      desktopPanesRef.current = { leftOpen, rightOpen };
    }
  }, [isMobile, leftOpen, rightOpen]);

  const uiBootHydratedRef = useRef(Boolean(readCachedUiState()));
  useEffect(() => {
    if (!uiBootHydratedRef.current) return;
    const nextUiState = writeCachedUiState({
      leftOpen: isMobile ? desktopPanesRef.current.leftOpen : leftOpen,
      rightOpen: isMobile ? desktopPanesRef.current.rightOpen : rightOpen,
      leftTab,
      rightTab,
      activeSheetTab,
      aiSubTab,
      timelinesOpen,
      sheetExpanded,
      charSplitRatio,
      updatedAtMs: Date.now(),
    });
    if (nextUiState) {
      queueSessionPatch({ uiState: nextUiState });
    }
  }, [
    isMobile,
    leftOpen,
    rightOpen,
    leftTab,
    rightTab,
    activeSheetTab,
    aiSubTab,
    timelinesOpen,
    sheetExpanded,
    charSplitRatio,
    queueSessionPatch,
  ]);

  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  const sessionBootCompletedRef = useRef(false);

  const markOnboardingDismissed = useCallback(() => {
    onboardingDismissedRef.current = true;
    writeCachedOnboardingDismissed(true);
    setWelcomeModalOpen(false);
    queueSessionPatch({ onboardingDismissed: true });
  }, [queueSessionPatch]);

  // Boot sequence: read the persisted session pointer FIRST, then load cards and
  // personas so `loadCardsAndPersonas` can select the restored character on first boot.
  useEffect(() => {
    if (sessionBootCompletedRef.current) return undefined;
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = fetchSession().catch(() => null);
    }

    let cancelled = false;
    sessionPromiseRef.current.then((res) => {
      if (cancelled || sessionBootCompletedRef.current) return undefined;
      sessionBootCompletedRef.current = true;
      if (res?.onboardingDismissed) {
        onboardingDismissedRef.current = true;
        writeCachedOnboardingDismissed(true);
      } else if (onboardingDismissedRef.current) {
        queueSessionPatch({ onboardingDismissed: true });
      }
      const localLastChat = readCachedLastChat();
      const serverLastChat = res?.lastChat || null;
      const bestLastChat = pickNewestSessionSlice(localLastChat, serverLastChat);
      const localMap = readCachedLastChatsMap();
      const { merged: mergedLastChats, localHasNewer } = mergeLastChatsMaps(
        localMap,
        res?.lastChats || null,
      );
      if (bestLastChat?.avatar && bestLastChat?.file) {
        const existingForBoot = mergedLastChats[bestLastChat.avatar];
        const bootTs = Number(bestLastChat.updatedAtMs) || 0;
        if (!existingForBoot || bootTs >= (Number(existingForBoot.updatedAtMs) || 0)) {
          mergedLastChats[bestLastChat.avatar] = {
            file: bestLastChat.file,
            updatedAtMs: bootTs,
          };
        }
      }
      lastChatsByAvatarRef.current = writeCachedLastChatsMap(mergedLastChats);
      if (localHasNewer) {
        queueSessionPatch({ lastChats: mergedLastChats });
      }
      if (bestLastChat?.avatar) {
        restorePointerRef.current = bestLastChat;
        recordedSessionPointerRef.current = bestLastChat;
        if (!localLastChat) {
          writeCachedLastChat(bestLastChat);
        } else if (
          !serverLastChat ||
          (Number(localLastChat.updatedAtMs) || 0) > (Number(serverLastChat.updatedAtMs) || 0)
        ) {
          queueSessionPatch({ lastChat: bestLastChat });
        }
      }
      if (!readCachedUiState() && res?.uiState) {
        const srvUi = res.uiState;
        desktopPanesRef.current = {
          leftOpen: srvUi.leftOpen,
          rightOpen: srvUi.rightOpen,
        };
        if (!isMobileRef.current) {
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
        writeCachedUiState(srvUi);
      }
      uiBootHydratedRef.current = true;
      setBootStage({
        statusText: 'Loading scenarios, personas & presets...',
        stepLabel: 'Stage 2 / 3 · Reading SillyTavern library',
      });
      return loadCardsAndPersonas().then((bootCardsInfo) => {
        if (cancelled) return undefined;
        if (!bootCardsInfo?.count) {
          finishBootSplash();
          if (
            !bootCardsInfo?.personasCount &&
            !onboardingDismissedRef.current
          ) {
            setWelcomeModalOpen(true);
          }
        } else {
          setBootStage({
            statusText: 'Opening active timeline...',
            stepLabel: 'Stage 3 / 3 · Restoring last conversation',
          });
        }
        return bootCardsInfo;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [loadCardsAndPersonas, queueSessionPatch, finishBootSplash]);

  const mapServerMsgToUi = useCallback((m) => ({
    id: `msg-${m.index}`,
    index: m.index,
    sender: m.name,
    isUser: Boolean(m.is_user),
    time: m.send_date || 'Saved',
    tokens: m.tokens || Math.max(8, Math.ceil(String(m.mes || '').length / 3.8)),
    text: String(m.mes || ''),
    swipeId: Number(m.swipe_id ?? 0),
    swipeCount: Number(m.swipe_count ?? 1),
    reasoning: m.reasoning || '',
    reasoningDurationMs: m.reasoningDurationMs ?? null,
    durationMs: m.durationMs ?? m.extra?.time_spent ?? null,
    api: m.extra?.api || null,
    model: m.extra?.model || null,
    fallbackInfo: m.fallbackInfo || m.extra?.fallback_info || null,
    userAvatarUrl: m.userAvatarUrl || null,
    userAvatarMissing: Boolean(m.userAvatarMissing),
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
  }), []);

  const selectedCardIdRef = useRef(selectedCardId);
  selectedCardIdRef.current = selectedCardId;

  const recordSessionPointer = useCallback((avatar, file = '', options = {}) => {
    const { clearCharacterChat = false } = options;
    if (!avatar || isDemoCardId(avatar)) return;
    const cleanFile = typeof file === 'string' ? file.trim() : '';
    const now = Date.now();

    // Any active session transition permanently retires the initial boot pointer.
    restoreCardAppliedRef.current = true;
    restorePointerAppliedRef.current = true;
    restorePointerRef.current = null;

    const prevPerChar = lastChatsByAvatarRef.current?.[avatar] || null;
    if (cleanFile) {
      lastChatsByAvatarRef.current = upsertCachedCharacterLastChat(avatar, cleanFile, now);
    } else if (clearCharacterChat) {
      lastChatsByAvatarRef.current = clearCachedCharacterLastChat(avatar);
    }

    const effectiveGlobalFile =
      cleanFile ||
      (!clearCharacterChat ? lastChatsByAvatarRef.current?.[avatar]?.file || '' : '');

    const previous = recordedSessionPointerRef.current;
    if (
      previous &&
      previous.avatar === avatar &&
      (previous.file || '') === effectiveGlobalFile &&
      (!cleanFile || prevPerChar?.file === cleanFile) &&
      (!clearCharacterChat || !prevPerChar)
    ) {
      return;
    }

    const nextPointer =
      writeCachedLastChat({
        avatar,
        file: effectiveGlobalFile,
        updatedAtMs: now,
      }) || { avatar, file: effectiveGlobalFile, updatedAtMs: now };
    recordedSessionPointerRef.current = nextPointer;
    saveLastChat(
      {
        avatar,
        file: cleanFile || effectiveGlobalFile,
        updatedAtMs: now,
      },
      { clearCharacterChat },
    ).catch(() => {
      recordedSessionPointerRef.current = previous;
    });
  }, []);

  const clearSessionPointer = useCallback(() => {
    if (recordedSessionPointerRef.current === null && !readCachedLastChat()) return;
    recordedSessionPointerRef.current = null;
    writeCachedLastChat(null);
    saveLastChat(null).catch(() => {});
  }, []);

  const openChatFileWindow = useCallback(
    async (avatarId, targetFile = null, options = {}) => {
      const { force = false } = options;
      if (!avatarId || isDemoCardId(avatarId)) return null;

      // Skip re-fetching if the exact same character and chat file are already open
      if (
        !force &&
        targetFile &&
        loadedSessionRef.current.cardId === avatarId &&
        loadedSessionRef.current.chatFile === targetFile
      ) {
        return null;
      }

      const reqSeq = ++chatWindowSeqRef.current;
      setLoadingChat(true);
      setEditingMsgIndex(null);
      try {
        const win = await fetchChatWindow(avatarId, {
          file: targetFile,
          limit: 20,
        });
        // Ignore late resolution if the user has already switched to another character or chat
        if (selectedCardIdRef.current !== avatarId || chatWindowSeqRef.current !== reqSeq) {
          return null;
        }
        if (win?.found && Array.isArray(win.messages)) {
          const resolvedName = win.fileName || '';
          loadedSessionRef.current = {
            cardId: avatarId,
            chatFile: resolvedName,
          };
          setActiveChatFile(resolvedName);
          setActiveChatWorld(String(win.chatMetadata?.world_info || ''));
          setActiveChatPortraitUrl(
            win.chatMetadata?.scenario_portrait_url
              ? getAuthorizedAssetUrl(win.chatMetadata.scenario_portrait_url)
              : null,
          );
          setCommittedChatCardId(avatarId);
          setMessages(win.messages.map(mapServerMsgToUi));
          setChatMetaStats({
            totalMessages: win.totalMessages || 0,
            startIndex: win.startIndex || 0,
            endIndex: win.endIndex || 0,
            hasMoreOlder: Boolean(win.hasMoreOlder),
            olderCount: win.olderCount || 0,
            olderHistoryTokens: Number(win.olderHistoryTokens || 0),
            olderHistoryRawTokens: Number(
              win.olderHistoryRawTokens ?? win.olderHistoryTokens ?? 0,
            ),
            hasUserMessages: Boolean(win.hasUserMessages),
            userMessageCount: Number(win.userMessageCount || 0),
            fileSize: win.fileSize || 0,
            elapsedMs: win.elapsedMs || 0,
            syncStatus: `Tail-First loaded (${win.elapsedMs || 0} ms)`,
          });
          const nextHint = {
            chatPersonaAvatar: win.chatPersonaAvatar || null,
            hasUserMessages: Boolean(win.hasUserMessages),
            cardAvatar: avatarId,
          };
          sessionPersonaHintRef.current = nextHint;
          syncSessionPersona(nextHint);
          recordSessionPointer(avatarId, resolvedName);
          scrollToChatBottom();
          return win;
        }
        return null;
      } catch {
        return null;
      } finally {
        if (chatWindowSeqRef.current === reqSeq) {
          setLoadingChat(false);
        }
      }
    },
    [mapServerMsgToUi, recordSessionPointer, scrollToChatBottom, syncSessionPersona],
  );

  useEffect(() => {
    if (!selectedCardId || isDemoCardId(selectedCardId)) {
      setLoadingCardAndChats(false);
      return undefined;
    }
    // Skip re-loading if this character is already the active loaded session
    if (loadedSessionRef.current.cardId === selectedCardId) {
      setCommittedChatCardId(selectedCardId);
      setLoadingCardAndChats(false);
      return undefined;
    }

    let cancelled = false;
    const loadSeq = ++cardLoadSeqRef.current;
    setLoadingCardAndChats(true);

    Promise.all([
      fetchCharacterCard(selectedCardId),
      fetchCharacterChats(selectedCardId, { offset: 0, limit: null }),
    ])
      .then(async ([full, chatListRes]) => {
        if (cancelled || cardLoadSeqRef.current !== loadSeq || !full) return;
        setActiveCardFull(full);
        cleanCardObjRef.current = full;
        setCleanCardSnapshot(serializeCardEditableSnapshot(full));
        setActiveIntroIdx(0);
        setCardSaveStatus('');

        const files = chatListRes?.chats || [];
        setChatFiles(files);
        setTimelineChats(files);
        if ((chatListRes?.totalChats ?? files.length) > files.length) {
          refreshTimelineChats(selectedCardId);
        }
        setChatListMeta({
          totalChats: chatListRes?.totalChats ?? files.length,
          hasMore: Boolean(chatListRes?.hasMore),
          nextOffset: chatListRes?.nextOffset ?? files.length,
          loadingMore: false,
        });

        if (files.length > 0) {
          // Honour the boot pointer or the per-character last-opened chat (`lastChats`),
          // falling back to SillyTavern's `card.chat` / freshest substantive conversation.
          const restored = restorePointerRef.current;
          const bootRemembered =
            !restorePointerAppliedRef.current &&
            restored &&
            restored.avatar === selectedCardId &&
            restored.file
              ? restored.file
              : '';
          if (!restorePointerAppliedRef.current) {
            restorePointerAppliedRef.current = true;
            restorePointerRef.current = null;
          }

          const perCharRemembered =
            bootRemembered || lastChatsByAvatarRef.current?.[selectedCardId]?.file || '';

          const targetFileName =
            resolvePreferredCharacterChatFile(files, {
              rememberedFile: perCharRemembered,
              cardChat: full.chat || '',
            }) ||
            chatListRes?.defaultChatFile ||
            files[0].fileName;

          const opened = await openChatFileWindow(selectedCardId, targetFileName, {
            force: true,
          });
          if (cancelled || cardLoadSeqRef.current !== loadSeq) return;
          // A stale pointer whose file vanished between listing and opening still
          // needs a working chat, so retry once with the fallback chat.
          if (!opened) {
            const fallbackFileName =
              resolvePreferredCharacterChatFile(
                files.filter((f) => f.fileName !== targetFileName),
                { rememberedFile: '', cardChat: full.chat || '' },
              ) || files[0]?.fileName;
            if (fallbackFileName && fallbackFileName !== targetFileName) {
              await openChatFileWindow(selectedCardId, fallbackFileName, { force: true });
            } else if (fallbackFileName) {
              await openChatFileWindow(selectedCardId, fallbackFileName, { force: true });
            }
          }
        } else {
          loadedSessionRef.current = { cardId: selectedCardId, chatFile: '' };
          setActiveChatFile('');
          setActiveChatWorld('');
          setActiveChatPortraitUrl(null);
          recordSessionPointer(selectedCardId, '', { clearCharacterChat: true });
          const allGreetings = [
            full.first_mes,
            ...(full.alternate_greetings || []),
          ].filter((g) => g !== undefined && g !== null && g !== '');
          setSwipeIdx(0);
          setChatMetaStats({
            totalMessages: allGreetings.length > 0 ? 1 : 0,
            startIndex: 0,
            endIndex: allGreetings.length > 0 ? 1 : 0,
            hasMoreOlder: false,
            olderCount: 0,
            olderHistoryTokens: 0,
            hasUserMessages: false,
            userMessageCount: 0,
            fileSize: 0,
            elapsedMs: 0,
            syncStatus: 'Previewing card greetings (no .jsonl yet)',
          });
          const emptyHint = {
            chatPersonaAvatar: null,
            hasUserMessages: false,
            cardAvatar: selectedCardId,
          };
          sessionPersonaHintRef.current = emptyHint;
          syncSessionPersona(emptyHint);
          setCommittedChatCardId(selectedCardId);
          if (allGreetings.length > 0) {
            setMessages([
              {
                id: `intro-${full.avatar}`,
                index: 0,
                sender: full.name,
                isUser: false,
                time: 'Intro',
                tokens: Math.max(12, Math.ceil((allGreetings[0] || '').length / 3.8)),
                text: allGreetings[0],
                swipes: allGreetings,
                swipeId: 0,
                swipeCount: allGreetings.length,
              },
            ]);
          } else {
            setMessages([]);
          }
        }
        if (!cancelled && cardLoadSeqRef.current === loadSeq) {
          setLoadingCardAndChats(false);
          finishBootSplash();
        }
      })
      .catch((err) => {
        if (!cancelled && cardLoadSeqRef.current === loadSeq) {
          setLoadingCardAndChats(false);
          finishBootSplash();
          pushToast({
            variant: 'error',
            message: err?.message || 'Failed to load character chats',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCardId, openChatFileWindow, recordSessionPointer, finishBootSplash, pushToast]);

  const handleSaveCardToPng = async () => {
    if (!activeCardFull || cardSaving) return false;
    setCardSaving(true);
    setCardSaveStatus('Saving card...');
    try {
      const updated = await updateCharacterCard(activeCardFull.avatar, {
        name: activeCardFull.name,
        description: activeCardFull.description,
        first_mes: activeCardFull.first_mes,
        creator_notes: activeCardFull.creator_notes,
        alternate_greetings: activeCardFull.alternate_greetings,
        group_only_greetings: activeCardFull.group_only_greetings,
        personality: activeCardFull.personality,
        scenario: activeCardFull.scenario,
        mes_example: activeCardFull.mes_example,
        system_prompt: activeCardFull.system_prompt,
        post_history_instructions: activeCardFull.post_history_instructions,
        creator: activeCardFull.creator,
        character_version: activeCardFull.character_version,
        nickname: activeCardFull.nickname,
        talkativeness: activeCardFull.talkativeness,
        embeddedTags: Array.isArray(activeCardFull.embeddedTags)
          ? activeCardFull.embeddedTags
          : undefined,
        extensions: activeCardFull.extensions,
        fav: activeCardFull.fav,
      });
      if (updated) {
        setActiveCardFull(updated);
        cleanCardObjRef.current = updated;
        setCleanCardSnapshot(serializeCardEditableSnapshot(updated));
        setCardSaveStatus('Saved to card');
        await loadCardsAndPersonas();
        setTimeout(() => setCardSaveStatus(''), 2500);
        return true;
      }
      return false;
    } catch (err) {
      setCardSaveStatus(`Error: ${err.message}`);
      return false;
    } finally {
      setCardSaving(false);
    }
  };

  const handlePersistCardPatch = useCallback(
    async (patch) => {
      if (!activeCardFull?.avatar || !patch) return;
      const targetAvatar = activeCardFull.avatar;
      setActiveCardFull((prev) =>
        prev && prev.avatar === targetAvatar ? { ...prev, ...patch } : prev,
      );
      if (isDemoCardId(targetAvatar)) return;
      try {
        const updated = await updateCharacterCard(targetAvatar, patch);
        if (updated) {
          if (cleanCardObjRef.current?.avatar === targetAvatar) {
            const nextClean = { ...cleanCardObjRef.current, ...patch };
            cleanCardObjRef.current = nextClean;
            setCleanCardSnapshot(serializeCardEditableSnapshot(nextClean));
          }
          setActiveCardFull((prev) => {
            if (!prev || prev.avatar !== targetAvatar) return prev;
            return {
              ...prev,
              ...patch,
              chatStats: updated.chatStats || prev.chatStats,
              scenarioMeta: updated.scenarioMeta || prev.scenarioMeta,
            };
          });
          await loadCardsAndPersonas();
          setCardSaveStatus('Saved greeting to card');
          setTimeout(() => setCardSaveStatus(''), 2200);
        }
      } catch (err) {
        setCardSaveStatus(`Error: ${err.message}`);
      }
    },
    [activeCardFull?.avatar, loadCardsAndPersonas],
  );

  // Keep the center preview greeting synced live when a 0-chat scenario has its
  // `first_mes` / `alternate_greetings` edited or saved.
  useEffect(() => {
    if (
      !selectedCardId ||
      committedChatCardId !== selectedCardId ||
      activeChatFile ||
      chatFiles.length > 0 ||
      loadingCardAndChats ||
      loadingChat ||
      !activeCardFull ||
      activeCardFull.avatar !== selectedCardId
    ) {
      return;
    }
    const allGreetings = [
      activeCardFull.first_mes,
      ...(activeCardFull.alternate_greetings || []),
    ].filter((g) => g !== undefined && g !== null && g !== '');

    setMessages((prev) => {
      if (allGreetings.length === 0) {
        return prev.length === 0 ? prev : [];
      }
      const clampedSwipe = Math.max(0, Math.min(swipeIdx, allGreetings.length - 1));
      const curText = allGreetings[clampedSwipe] || allGreetings[0] || '';
      if (
        prev.length === 1 &&
        prev[0]?.id === `intro-${activeCardFull.avatar}` &&
        prev[0]?.text === curText &&
        prev[0]?.swipeCount === allGreetings.length &&
        Array.isArray(prev[0]?.swipes) &&
        prev[0].swipes.length === allGreetings.length &&
        prev[0].swipes.every((s, idx) => s === allGreetings[idx])
      ) {
        return prev;
      }
      return [
        {
          id: `intro-${activeCardFull.avatar}`,
          index: 0,
          sender: activeCardFull.name,
          isUser: false,
          time: 'Intro',
          tokens: Math.max(12, Math.ceil(curText.length / 3.8)),
          text: curText,
          swipes: allGreetings,
          swipeId: clampedSwipe,
          swipeCount: allGreetings.length,
        },
      ];
    });
  }, [
    selectedCardId,
    committedChatCardId,
    activeChatFile,
    chatFiles.length,
    loadingCardAndChats,
    loadingChat,
    activeCardFull,
    swipeIdx,
  ]);

  const handleDiscardCardChanges = useCallback(() => {
    if (!cleanCardObjRef.current) return;
    setActiveCardFull(cleanCardObjRef.current);
    setCardSaveStatus('Reverted unsaved changes');
    setTimeout(() => setCardSaveStatus(''), 2000);
  }, []);

  const handleToggleSpoilerBlur = useCallback(
    async (nextBlur) => {
      if (!activeCardFull?.avatar) return;
      setActiveCardFull((prev) =>
        prev
          ? {
              ...prev,
              scenarioMeta: { ...(prev.scenarioMeta || {}), spoilerBlur: Boolean(nextBlur) },
            }
          : prev,
      );
      try {
        const meta = await updateCharacterScenarioMeta(activeCardFull.avatar, {
          spoilerBlur: Boolean(nextBlur),
        });
        if (meta) {
          setActiveCardFull((prev) => (prev ? { ...prev, scenarioMeta: meta } : prev));
          if (cleanCardObjRef.current?.avatar === activeCardFull.avatar) {
            cleanCardObjRef.current = { ...cleanCardObjRef.current, scenarioMeta: meta };
          }
        }
      } catch {
        // ignore
      }
    },
    [activeCardFull?.avatar],
  );

  const handlePickMainPortraitFile = useCallback(
    async (file) => {
      if (!activeCardFull?.avatar || !file || busyPortrait) return;
      setBusyPortrait(true);
      try {
        const pngBase64 = await convertImageFileToPngBase64(file);
        const label = file.name.replace(/\.[^.]+$/, '') || 'Portrait';
        const updated = await replaceCharacterCardAvatar(activeCardFull.avatar, pngBase64);
        if (updated) {
          setActiveCardFull(updated);
          cleanCardObjRef.current = updated;
          setCleanCardSnapshot(serializeCardEditableSnapshot(updated));
          setCardSaveStatus(`Main portrait updated (${label})`);
          await loadCardsAndPersonas();
          setTimeout(() => setCardSaveStatus(''), 2500);
        }
      } catch (err) {
        setCardSaveStatus(`Portrait error: ${err.message}`);
      } finally {
        setBusyPortrait(false);
      }
    },
    [activeCardFull?.avatar, busyPortrait, loadCardsAndPersonas],
  );

  const handleUploadGalleryPortraits = useCallback(
    async (files) => {
      if (!activeCardFull?.avatar || !files?.length || busyPortrait) return;
      setBusyPortrait(true);
      try {
        let latestMeta = null;
        for (const file of files) {
          const pngBase64 = await convertImageFileToPngBase64(file);
          const label = file.name.replace(/\.[^.]+$/, '') || 'Portrait';
          const res = await uploadScenarioGalleryPortrait(activeCardFull.avatar, {
            imageBase64: pngBase64,
            fileName: `${label}.png`,
            label,
          });
          if (res?.scenarioMeta) latestMeta = res.scenarioMeta;
        }
        if (latestMeta) {
          setActiveCardFull((prev) => (prev ? { ...prev, scenarioMeta: latestMeta } : prev));
          if (cleanCardObjRef.current?.avatar === activeCardFull.avatar) {
            cleanCardObjRef.current = { ...cleanCardObjRef.current, scenarioMeta: latestMeta };
          }
          setCardSaveStatus(`Added ${files.length} portrait(s) to gallery`);
          setTimeout(() => setCardSaveStatus(''), 2500);
        }
      } catch (err) {
        setCardSaveStatus(`Upload error: ${err.message}`);
      } finally {
        setBusyPortrait(false);
      }
    },
    [activeCardFull?.avatar, busyPortrait],
  );

  const handleSelectGalleryPortrait = useCallback(
    async (item) => {
      if (!activeCardFull?.avatar || !item?.id || busyPortrait) return;
      setBusyPortrait(true);
      try {
        const updated = await applyScenarioGalleryPortrait(activeCardFull.avatar, item.id);
        if (updated) {
          setActiveCardFull(updated);
          cleanCardObjRef.current = updated;
          setCleanCardSnapshot(serializeCardEditableSnapshot(updated));
          await loadCardsAndPersonas();
          setCardSaveStatus(`Switched portrait to "${item.label || 'Selected'}"`);
          setTimeout(() => setCardSaveStatus(''), 2200);
        }
      } catch (err) {
        setCardSaveStatus(`Switch failed: ${err.message}`);
      } finally {
        setBusyPortrait(false);
      }
    },
    [activeCardFull?.avatar, busyPortrait, loadCardsAndPersonas],
  );

  const handleDeleteGalleryPortrait = useCallback(
    async (item) => {
      if (!activeCardFull?.avatar || !item?.id || busyPortrait) return;
      setBusyPortrait(true);
      try {
        const meta = await removeScenarioGalleryPortrait(activeCardFull.avatar, item.id);
        if (meta) {
          setActiveCardFull((prev) => (prev ? { ...prev, scenarioMeta: meta } : prev));
          if (cleanCardObjRef.current?.avatar === activeCardFull.avatar) {
            cleanCardObjRef.current = { ...cleanCardObjRef.current, scenarioMeta: meta };
          }
        }
      } catch (err) {
        setCardSaveStatus(`Remove failed: ${err.message}`);
      } finally {
        setBusyPortrait(false);
      }
    },
    [activeCardFull?.avatar, busyPortrait],
  );

  const handlePickReplaceCardFile = useCallback(
    async (file) => {
      if (!activeCardFull?.avatar || !file) return;
      setCardSaving(true);
      try {
        const fileBase64 = await readFileAsBase64(file);
        const updated = await replaceCharacterCardFromFile(activeCardFull.avatar, { fileBase64 });
        if (updated) {
          setActiveCardFull(updated);
          cleanCardObjRef.current = updated;
          setCleanCardSnapshot(serializeCardEditableSnapshot(updated));
          await loadCardsAndPersonas();
          setCardSaveStatus(`Replaced card from "${file.name}"`);
          setTimeout(() => setCardSaveStatus(''), 2500);
        }
      } catch (err) {
        setCardSaveStatus(`Replace failed: ${err.message}`);
      } finally {
        setCardSaving(false);
      }
    },
    [activeCardFull?.avatar, loadCardsAndPersonas],
  );

  const handleConvertActiveCardToPersona = useCallback(async () => {
    if (!activeCardFull?.avatar) return;
    try {
      const res = await convertCardToPersona(activeCardFull.avatar);
      if (Array.isArray(res?.personas)) setPersonas(res.personas);
      setCardSaveStatus(`Converted to persona "${res?.createdPersonaAvatar || activeCardFull.name}"`);
      setTimeout(() => setCardSaveStatus(''), 3000);
    } catch (err) {
      setCardSaveStatus(`Convert failed: ${err.message}`);
    }
  }, [activeCardFull?.avatar, activeCardFull?.name]);

  const handleRefreshChatPortraits = useCallback(async () => {
    if (!activeCardFull?.avatar) return;
    try {
      const fresh = await fetchCharacterCard(activeCardFull.avatar);
      if (fresh) {
        const stamp = Date.now();
        const bust = (u) => (u ? `${u.split('?')[0]}?v=${stamp}` : u);
        const refreshed = {
          ...fresh,
          thumbnailUrl: bust(fresh.thumbnailUrl),
          avatarUrl: bust(fresh.avatarUrl),
        };
        setActiveCardFull(refreshed);
        cleanCardObjRef.current = refreshed;
        setCleanCardSnapshot(serializeCardEditableSnapshot(refreshed));
      }
      await loadCardsAndPersonas();
      setCardSaveStatus('Refreshed chat portraits');
      setTimeout(() => setCardSaveStatus(''), 2000);
    } catch {
      // ignore
    }
  }, [activeCardFull?.avatar, loadCardsAndPersonas]);

  const handleUpdateActiveScenarioMeta = useCallback(
    async (patch) => {
      if (!activeCardFull?.avatar || !patch) return;
      const targetAvatar = activeCardFull.avatar;
      if (patch.subtitle !== undefined) {
        const cleanSub = String(patch.subtitle || '').trim().slice(0, 120);
        setCards((prev) =>
          prev.map((c) =>
            c.id === targetAvatar || c.avatar === targetAvatar
              ? { ...c, subtitle: cleanSub }
              : c,
          ),
        );
      }
      setActiveCardFull((prev) => {
        if (!prev) return prev;
        const nextMeta = { ...(prev.scenarioMeta || {}), ...patch };
        const nextTopSubtitle =
          patch.subtitle !== undefined
            ? String(patch.subtitle || '').trim().slice(0, 120)
            : prev.subtitle;
        if (Array.isArray(patch.introsMeta)) {
          nextMeta.introsMeta = patch.introsMeta.map((im) => ({
            ...im,
            rawPortraitUrl: im?.portraitUrl || null,
            portraitUrl: im?.portraitUrl ? getAuthorizedAssetUrl(im.portraitUrl) : null,
          }));
        }
        if (Array.isArray(patch.groupIntrosMeta)) {
          nextMeta.groupIntrosMeta = patch.groupIntrosMeta.map((im) => ({
            ...im,
            rawPortraitUrl: im?.portraitUrl || null,
            portraitUrl: im?.portraitUrl ? getAuthorizedAssetUrl(im.portraitUrl) : null,
          }));
        }
        return { ...prev, subtitle: nextTopSubtitle, scenarioMeta: nextMeta };
      });
      try {
        const meta = await updateCharacterScenarioMeta(targetAvatar, patch);
        if (meta) {
          setActiveCardFull((prev) =>
            prev
              ? {
                  ...prev,
                  subtitle: String(meta.subtitle || ''),
                  scenarioMeta: meta,
                }
              : prev,
          );
          if (cleanCardObjRef.current?.avatar === targetAvatar) {
            cleanCardObjRef.current = {
              ...cleanCardObjRef.current,
              subtitle: String(meta.subtitle || ''),
              scenarioMeta: meta,
            };
          }
          if (patch.subtitle !== undefined) {
            setCards((prev) =>
              prev.map((c) =>
                c.id === targetAvatar || c.avatar === targetAvatar
                  ? { ...c, subtitle: String(meta.subtitle || '') }
                  : c,
              ),
            );
          }
        }
      } catch (err) {
        setCardSaveStatus(`Meta error: ${err.message}`);
      }
    },
    [activeCardFull?.avatar],
  );

  const handleUploadIntroPortrait = useCallback(
    async (kind, introIdx, file, { applyImmediately = true } = {}) => {
      if (!activeCardFull?.avatar || !file || busyPortrait) return null;
      setBusyPortrait(true);
      try {
        const pngBase64 = await convertImageFileToPngBase64(file);
        const label = file.name.replace(/\.[^.]+$/, '') || `Intro #${introIdx + 1}`;
        const res = await uploadScenarioGalleryPortrait(activeCardFull.avatar, {
          imageBase64: pngBase64,
          fileName: `${label}.png`,
          label,
        });
        const entry = res?.entry || null;
        let finalMeta = res?.scenarioMeta || null;

        if (applyImmediately && entry?.rawUrl && finalMeta) {
          const metaKey = kind === 'group' ? 'groupIntrosMeta' : 'introsMeta';
          const totalLen =
            kind === 'group'
              ? Math.max(introIdx + 1, (activeCardFull.group_only_greetings || []).length)
              : Math.max(introIdx + 1, 1 + (activeCardFull.alternate_greetings || []).length);
          const curList = Array.isArray(finalMeta[metaKey]) ? finalMeta[metaKey] : [];
          const nextPayload = Array.from({ length: totalLen }, (_, i) => ({
            title: String(curList[i]?.title || ''),
            portraitUrl:
              i === introIdx
                ? entry.rawUrl
                : curList[i]?.rawPortraitUrl || curList[i]?.portraitUrl || null,
          }));
          const updatedMeta = await updateCharacterScenarioMeta(activeCardFull.avatar, {
            [metaKey]: nextPayload,
          });
          if (updatedMeta) finalMeta = updatedMeta;
        }

        if (finalMeta) {
          setActiveCardFull((prev) => (prev ? { ...prev, scenarioMeta: finalMeta } : prev));
          if (cleanCardObjRef.current?.avatar === activeCardFull.avatar) {
            cleanCardObjRef.current = { ...cleanCardObjRef.current, scenarioMeta: finalMeta };
          }
          setCardSaveStatus(`Assigned portrait to Intro #${introIdx + 1}`);
          setTimeout(() => setCardSaveStatus(''), 2200);
        }
        return entry;
      } catch (err) {
        setCardSaveStatus(`Intro portrait error: ${err.message}`);
        return null;
      } finally {
        setBusyPortrait(false);
      }
    },
    [
      activeCardFull?.avatar,
      activeCardFull?.alternate_greetings,
      activeCardFull?.group_only_greetings,
      busyPortrait,
    ],
  );

  const handleAssignTagOnActiveCard = useCallback(
    async (tagId) => {
      if (!activeCardFull?.avatar || tagId == null) return;
      const tid = String(tagId);
      const cardId = activeCardFull.avatar;
      const tagObj = tags.find((t) => String(t.id) === tid);
      setActiveCardFull((prev) => {
        if (!prev) return prev;
        const nextIds = Array.from(new Set([...(prev.tagIds || []).map(String), tid]));
        const nextNames = tagObj?.name
          ? Array.from(new Set([...(prev.tags || []), tagObj.name]))
          : prev.tags || [];
        return { ...prev, tagIds: nextIds, tags: nextNames };
      });
      setCards((prev) =>
        prev.map((c) => {
          if (c.id !== cardId) return c;
          const existing = (c.tagIds || []).map(String);
          return existing.includes(tid) ? c : { ...c, tagIds: [...existing, tid] };
        }),
      );
      if (!isDemoCardId(cardId)) {
        try {
          await bulkSetCardTags([cardId], tid, 'add');
        } catch {
          // ignore
        }
      }
      await loadCardsAndPersonas();
    },
    [activeCardFull?.avatar, tags, loadCardsAndPersonas],
  );

  const handleRemoveTagOnActiveCard = useCallback(
    async (tagId) => {
      if (!activeCardFull?.avatar || tagId == null) return;
      const tid = String(tagId);
      const cardId = activeCardFull.avatar;
      const tagObj = tags.find((t) => String(t.id) === tid);
      setActiveCardFull((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tagIds: (prev.tagIds || []).map(String).filter((x) => x !== tid),
          tags: tagObj?.name
            ? (prev.tags || []).filter((n) => n !== tagObj.name)
            : prev.tags || [],
        };
      });
      setCards((prev) =>
        prev.map((c) =>
          c.id !== cardId
            ? c
            : { ...c, tagIds: (c.tagIds || []).map(String).filter((x) => x !== tid) },
        ),
      );
      if (!isDemoCardId(cardId)) {
        try {
          await bulkSetCardTags([cardId], tid, 'remove');
        } catch {
          // ignore
        }
      }
      await loadCardsAndPersonas();
    },
    [activeCardFull?.avatar, tags, loadCardsAndPersonas],
  );

  const handleCreateAndAssignTagOnActiveCard = useCallback(
    async (rawName) => {
      const clean = String(rawName || '').trim();
      if (!activeCardFull?.avatar || !clean) return;
      setBusyLinksAction(true);
      try {
        const created = await createTag(clean);
        const updatedTags = created?.tags || [];
        setTags(updatedTags);
        const match = updatedTags.find(
          (t) => String(t.name || '').toLowerCase() === clean.toLowerCase(),
        );
        if (match) {
          await bulkSetCardTags([activeCardFull.avatar], match.id, 'add');
          const fresh = await fetchCharacterCard(activeCardFull.avatar);
          if (fresh) {
            setActiveCardFull(fresh);
            cleanCardObjRef.current = fresh;
            setCleanCardSnapshot(serializeCardEditableSnapshot(fresh));
          }
          await loadCardsAndPersonas();
        }
      } catch (err) {
        setCardSaveStatus(`Tag error: ${err.message}`);
      } finally {
        setBusyLinksAction(false);
      }
    },
    [activeCardFull?.avatar, loadCardsAndPersonas],
  );

  const handleImportEmbeddedTagsOnActiveCard = useCallback(async () => {
    if (!activeCardFull?.avatar) return;
    setBusyLinksAction(true);
    try {
      const res = await importEmbeddedCardTags(activeCardFull.avatar);
      if (Array.isArray(res?.tags)) setTags(res.tags);
      if (res?.card) {
        setActiveCardFull(res.card);
        cleanCardObjRef.current = res.card;
        setCleanCardSnapshot(serializeCardEditableSnapshot(res.card));
      }
      await loadCardsAndPersonas();
      setCardSaveStatus('Imported embedded tags');
      setTimeout(() => setCardSaveStatus(''), 2200);
    } catch (err) {
      setCardSaveStatus(`Import tags error: ${err.message}`);
    } finally {
      setBusyLinksAction(false);
    }
  }, [activeCardFull?.avatar, loadCardsAndPersonas]);

  const handleBindPersonaToActiveCard = useCallback(
    async (personaAvatar) => {
      if (!activeCardFull?.avatar || !personaAvatar) return;
      const target = personas.find((p) => p.avatar === personaAvatar);
      if (!target) return;
      const charAvatar = activeCardFull.avatar;
      const existing = Array.isArray(target.connections) ? target.connections : [];
      if (existing.some((c) => c && c.type === 'character' && c.id === charAvatar)) return;
      setBusyLinksAction(true);
      try {
        const res = await updatePersona(personaAvatar, {
          connections: [...existing, { type: 'character', id: charAvatar }],
        });
        if (Array.isArray(res?.personas)) setPersonas(res.personas);
        setCardSaveStatus(`Bound persona "${target.name}"`);
        setTimeout(() => setCardSaveStatus(''), 2000);
      } catch (err) {
        setCardSaveStatus(`Persona bind error: ${err.message}`);
      } finally {
        setBusyLinksAction(false);
      }
    },
    [activeCardFull?.avatar, personas],
  );

  const handleUnbindPersonaFromActiveCard = useCallback(
    async (personaAvatar) => {
      if (!activeCardFull?.avatar || !personaAvatar) return;
      const target = personas.find((p) => p.avatar === personaAvatar);
      if (!target) return;
      const charAvatar = activeCardFull.avatar;
      const stem = charAvatar.replace(/\.(png|json)$/i, '');
      const nextConns = (target.connections || []).filter(
        (c) => !(c && c.type === 'character' && (c.id === charAvatar || c.id === stem)),
      );
      setBusyLinksAction(true);
      try {
        const res = await updatePersona(personaAvatar, { connections: nextConns });
        if (Array.isArray(res?.personas)) setPersonas(res.personas);
        setCardSaveStatus(`Unbound persona "${target.name}"`);
        setTimeout(() => setCardSaveStatus(''), 2000);
      } catch (err) {
        setCardSaveStatus(`Unbind error: ${err.message}`);
      } finally {
        setBusyLinksAction(false);
      }
    },
    [activeCardFull?.avatar, personas],
  );

  const handleUnbindAllPersonasFromActiveCard = useCallback(async () => {
    if (!activeCardFull?.avatar) return;
    const charAvatar = activeCardFull.avatar;
    const stem = charAvatar.replace(/\.(png|json)$/i, '');
    const linked = personas.filter((p) =>
      (p.connections || []).some(
        (c) => c && c.type === 'character' && (c.id === charAvatar || c.id === stem),
      ),
    );
    if (linked.length === 0) return;
    setBusyLinksAction(true);
    try {
      let latestList = personas;
      for (const p of linked) {
        const nextConns = (p.connections || []).filter(
          (c) => !(c && c.type === 'character' && (c.id === charAvatar || c.id === stem)),
        );
        const res = await updatePersona(p.avatar, { connections: nextConns });
        if (Array.isArray(res?.personas)) latestList = res.personas;
      }
      setPersonas(latestList);
      setCardSaveStatus('Unbound all personas from scenario');
      setTimeout(() => setCardSaveStatus(''), 2000);
    } catch (err) {
      setCardSaveStatus(`Unbind error: ${err.message}`);
    } finally {
      setBusyLinksAction(false);
    }
  }, [activeCardFull?.avatar, personas]);

  const handleChangePrimaryWorld = useCallback(
    async (worldName) => {
      if (!activeCardFull?.avatar) return;
      setBusyLinksAction(true);
      try {
        const updated = await updateCharacterLoreBindings(activeCardFull.avatar, {
          primaryWorld: worldName || '',
        });
        if (updated) {
          setActiveCardFull(updated);
          cleanCardObjRef.current = updated;
          setCleanCardSnapshot(serializeCardEditableSnapshot(updated));
        }
        setCardSaveStatus(worldName ? `Primary world set to "${worldName}"` : 'Cleared primary world');
        setTimeout(() => setCardSaveStatus(''), 2000);
      } catch (err) {
        setCardSaveStatus(`Lore error: ${err.message}`);
      } finally {
        setBusyLinksAction(false);
      }
    },
    [activeCardFull?.avatar],
  );

  const handleUpdateAuxWorlds = useCallback(
    async (nextBooks) => {
      if (!activeCardFull?.avatar) return;
      setBusyLinksAction(true);
      try {
        const updated = await updateCharacterLoreBindings(activeCardFull.avatar, {
          extraBooks: nextBooks,
        });
        if (updated) {
          setActiveCardFull(updated);
          if (cleanCardObjRef.current?.avatar === activeCardFull.avatar) {
            cleanCardObjRef.current = { ...cleanCardObjRef.current, auxWorlds: updated.auxWorlds };
          }
        }
      } catch (err) {
        setCardSaveStatus(`Aux lore error: ${err.message}`);
      } finally {
        setBusyLinksAction(false);
      }
    },
    [activeCardFull?.avatar],
  );

  const handleImportEmbeddedLoreOnActiveCard = useCallback(async () => {
    if (!activeCardFull?.avatar) return;
    setBusyLinksAction(true);
    try {
      const res = await importEmbeddedCardLore(activeCardFull.avatar);
      if (Array.isArray(res?.worlds)) setWorlds(res.worlds);
      if (res?.card) {
        setActiveCardFull(res.card);
        cleanCardObjRef.current = res.card;
        setCleanCardSnapshot(serializeCardEditableSnapshot(res.card));
      }
      setCardSaveStatus(`Extracted "${res?.worldName}" (${res?.entriesCount} entries)`);
      setTimeout(() => setCardSaveStatus(''), 2800);
    } catch (err) {
      setCardSaveStatus(`Extract lore error: ${err.message}`);
    } finally {
      setBusyLinksAction(false);
    }
  }, [activeCardFull?.avatar]);

  const handleChangeActiveChatWorld = useCallback(
    async (worldName) => {
      if (!selectedCardId || !activeChatFile) return;
      const clean = String(worldName || '').trim();
      setActiveChatWorld(clean);
      try {
        await updateChatMetadata(selectedCardId, activeChatFile, {
          world_info: clean || null,
        });
        setCardSaveStatus(clean ? `Chat lore set to "${clean}"` : 'Cleared chat lore');
        setTimeout(() => setCardSaveStatus(''), 2000);
      } catch (err) {
        setCardSaveStatus(`Chat lore error: ${err.message}`);
      }
    },
    [selectedCardId, activeChatFile],
  );

  const handleSelectPersona = useCallback(
    async (avatar) => {
      if (!avatar) return;
      const found = personas.find((p) => p.avatar === avatar);
      if (found) {
        applyResolvedPersonaLocally(found);
      } else {
        activePersonaAvatarRef.current = avatar;
        setActivePersonaAvatar(avatar);
      }
      sessionPersonaHintRef.current = {
        ...sessionPersonaHintRef.current,
        keepCurrentOnNewChat: true,
      };
      try {
        const res = await selectPersona(avatar);
        if (Array.isArray(res?.personas)) {
          personasRef.current = res.personas;
          setPersonas(res.personas);
        }
        // If an empty `.jsonl` chat is already created on disk (0 user messages), sync its header user_name silently
        if (
          selectedCardId &&
          !isDemoCardId(selectedCardId) &&
          activeChatFile &&
          !sessionPersonaHintRef.current.hasUserMessages &&
          found?.name
        ) {
          await replaceChatPersona(selectedCardId, activeChatFile, {
            personaAvatar: avatar,
            personaName: found.name,
          }).catch(() => {});
        }
      } catch {
        // ignore
      }
    },
    [personas, applyResolvedPersonaLocally, selectedCardId, activeChatFile],
  );

  const handleConfirmReplacePersonaInChat = useCallback(
    async (targetPersona) => {
      const avatar = targetPersona?.avatar;
      if (!avatar) return;
      const found = personas.find((p) => p.avatar === avatar) || targetPersona;
      applyResolvedPersonaLocally(found);

      try {
        const selectRes = await selectPersona(avatar);
        if (Array.isArray(selectRes?.personas)) {
          personasRef.current = selectRes.personas;
          setPersonas(selectRes.personas);
        }

        if (selectedCardId && !isDemoCardId(selectedCardId) && activeChatFile) {
          const replaced = await replaceChatPersona(selectedCardId, activeChatFile, {
            personaAvatar: avatar,
            personaName: found.name,
          });
          if (Array.isArray(replaced?.messages)) {
            setMessages(replaced.messages.map(mapServerMsgToUi));
          } else {
            setMessages((prev) =>
              prev.map((m) => (m.isUser ? { ...m, sender: found.name } : m)),
            );
          }
          sessionPersonaHintRef.current = {
            chatPersonaAvatar: avatar,
            hasUserMessages: Boolean(replaced?.hasUserMessages ?? true),
            cardAvatar: selectedCardId,
          };
          setChatMetaStats((prev) => ({
            ...prev,
            hasUserMessages: Boolean(replaced?.hasUserMessages ?? prev.hasUserMessages),
            userMessageCount: Number(replaced?.userMessageCount ?? prev.userMessageCount ?? 0),
            syncStatus: `Replaced chat persona with "${found.name}" (${replaced?.updatedUserMessages || 0} msgs)`,
          }));
          fetchCharacterChats(selectedCardId, { offset: 0, limit: Math.max(30, chatFiles.length) })
            .then((res) => {
              if (Array.isArray(res?.chats)) {
                setChatFiles(res.chats);
                setTimelineChats(res.chats);
              }
            })
            .catch(() => {});
        } else {
          // Demo session fallback
          setMessages((prev) =>
            prev.map((m) => (m.isUser ? { ...m, sender: found.name } : m)),
          );
        }
        pushComposerToast({
          variant: 'success',
          message: `Switched chat persona to "${found.name}"`,
        });
      } catch (err) {
        pushComposerToast({
          variant: 'error',
          message: err?.message || 'Failed to replace persona in chat',
        });
      }
    },
    [
      personas,
      applyResolvedPersonaLocally,
      selectedCardId,
      activeChatFile,
      mapServerMsgToUi,
      chatFiles.length,
      pushComposerToast,
    ],
  );

  const handleToggleBindPersonaToActiveCard = useCallback(
    async (personaAvatar, shouldBind) => {
      if (shouldBind) {
        await handleBindPersonaToActiveCard(personaAvatar);
      } else {
        await handleUnbindPersonaFromActiveCard(personaAvatar);
      }
    },
    [handleBindPersonaToActiveCard, handleUnbindPersonaFromActiveCard],
  );

  const handleOpenManagePersonaModal = useCallback(
    (targetAvatar = '') => {
      runWithWorkspaceUnsavedGuard(() => {
        const resolvedAv = targetAvatar || activePersonaAvatar;
        const found = personas.find((p) => p.avatar === resolvedAv);
        if (found) {
          setPersonaModalTargetAvatar(found.avatar);
        } else {
          setPersonaModalTargetAvatar(resolvedAv || '');
        }
        setChatListOpen(false);
        setTimelinesOpen(false);
        setEditingPromptSelection(null);
        setEditingIntroTarget(null);
        setCreateScenarioModalOpen(false);
        setSheetExpanded(false);
        if (isMobile) {
          setLeftOpen(false);
          setRightOpen(false);
        }
        setPersonaModalMode('manage');
        setPersonaModalOpen(true);
      });
    },
    [personas, activePersonaAvatar, isMobile, runWithWorkspaceUnsavedGuard],
  );

  const handleOpenCreatePersonaModal = useCallback(() => {
    runWithWorkspaceUnsavedGuard(() => {
      setChatListOpen(false);
      setTimelinesOpen(false);
      setEditingPromptSelection(null);
      setEditingIntroTarget(null);
      setCreateScenarioModalOpen(false);
      setSheetExpanded(false);
      if (isMobile) {
        setLeftOpen(false);
        setRightOpen(false);
      }
      setPersonaModalTargetAvatar('');
      setPersonaModalMode('create');
      setPersonaModalOpen(true);
    });
  }, [isMobile, runWithWorkspaceUnsavedGuard]);

  const handleCreatePersona = useCallback(
    async (payload) => {
      const res = await createPersona(payload);
      if (Array.isArray(res?.personas)) {
        personasRef.current = res.personas;
        setPersonas(res.personas);
      }
      if (!onboardingDismissedRef.current) {
        onboardingDismissedRef.current = true;
        writeCachedOnboardingDismissed(true);
        queueSessionPatch({ onboardingDismissed: true });
      }
      if (res?.createdPersonaAvatar) {
        const created = (res.personas || []).find(
          (p) => p.avatar === res.createdPersonaAvatar,
        );
        if (created) {
          activePersonaAvatarRef.current = created.avatar;
          setActivePersonaAvatar(created.avatar);
          setPersonaName(created.name);
          setPersonaDesc(created.description || '');
        }
      }
      return res;
    },
    [],
  );

  const handleSavePersonaById = useCallback(async (avatar, updates) => {
    if (!avatar) return null;
    const res = await updatePersona(avatar, updates);
    if (Array.isArray(res?.personas)) {
      personasRef.current = res.personas;
      setPersonas(res.personas);
      const updated = res.personas.find((p) => p.avatar === avatar);
      if (updated && updated.avatar === activePersonaAvatarRef.current) {
        setPersonaName(updated.name);
        setPersonaDesc(updated.description || '');
      }
    }
    return res;
  }, []);

  const handleUploadPersonaAvatar = useCallback(async (avatar, imageBase64) => {
    const res = await uploadPersonaAvatar(avatar, imageBase64);
    if (Array.isArray(res?.personas)) {
      personasRef.current = res.personas;
      setPersonas(res.personas);
    }
    return res;
  }, []);

  const handleDuplicatePersona = useCallback(async (avatar) => {
    const res = await duplicatePersona(avatar);
    if (Array.isArray(res?.personas)) {
      personasRef.current = res.personas;
      setPersonas(res.personas);
    }
    return res;
  }, []);

  const handleDeletePersona = useCallback(async (avatar) => {
    const res = await deletePersona(avatar);
    if (Array.isArray(res?.personas)) {
      personasRef.current = res.personas;
      setPersonas(res.personas);
    }
    setPersonaModalTargetAvatar((prevTarget) => {
      if (prevTarget && prevTarget === avatar) {
        setPersonaModalOpen(false);
        return '';
      }
      return prevTarget;
    });
    if (res?.activePersonaAvatar) {
      activePersonaAvatarRef.current = res.activePersonaAvatar;
      setActivePersonaAvatar(res.activePersonaAvatar);
      const found = (res.personas || []).find(
        (p) => p.avatar === res.activePersonaAvatar,
      );
      if (found) {
        setPersonaName(found.name);
        setPersonaDesc(found.description || '');
      }
    }
    return res;
  }, []);

  const handleSavePersona = async () => {
    const targetAv = personaModalTargetAvatar || activePersonaAvatar;
    if (!targetAv) return;
    setPersonaSaveStatus('Saving...');
    try {
      const res = await updatePersona(targetAv, {
        name: personaName,
        description: personaDesc,
        setAsActive: targetAv === activePersonaAvatar,
      });
      if (Array.isArray(res?.personas)) {
        personasRef.current = res.personas;
        setPersonas(res.personas);
      }
      setPersonaSaveStatus('Saved to settings.json!');
      setTimeout(() => setPersonaSaveStatus(''), 2000);
    } catch (err) {
      setPersonaSaveStatus(`Error: ${err.message}`);
    }
  };

  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const scenarioPresetId = activeCardFull?.scenarioMeta?.themePresetId;
    const scenarioSeed = scenarioPresetId
      ? M3_PRESET_SEEDS.find((s) => s.id === scenarioPresetId) || null
      : null;
    const effectiveSeed = scenarioSeed || activeSeed;
    const effectiveMode = scenarioSeed
      ? scenarioSeed.name.toLowerCase().includes('light')
        ? 'light'
        : 'dark'
      : themeMode;

    applyM3ThemeTokens({
      themeMode: effectiveMode,
      seedHex: effectiveSeed.primaryHex,
      secondaryHex: effectiveSeed.secondaryHex,
      fontScale: 1,
      lowGpu,
    });
  }, [themeMode, activeSeed, lowGpu, activeCardFull?.scenarioMeta?.themePresetId]);

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

  const handleLoadOlderMessages = async () => {
    if (!selectedCardId || !activeChatFile || !chatMetaStats.hasMoreOlder || loadingChat) {
      return;
    }
    setLoadingChat(true);
    try {
      const olderWin = await fetchChatWindow(selectedCardId, {
        file: activeChatFile,
        beforeIndex: chatMetaStats.startIndex,
        limit: 20,
      });
      if (olderWin?.found && Array.isArray(olderWin.messages)) {
        const olderMapped = olderWin.messages.map(mapServerMsgToUi);
        setMessages((prev) => [...olderMapped, ...prev]);
        setChatMetaStats((prev) => ({
          ...prev,
          startIndex: olderWin.startIndex,
          hasMoreOlder: Boolean(olderWin.hasMoreOlder),
          olderCount: olderWin.olderCount || 0,
          olderHistoryTokens: Number(olderWin.olderHistoryTokens || 0),
          olderHistoryRawTokens: Number(
            olderWin.olderHistoryRawTokens ?? olderWin.olderHistoryTokens ?? 0,
          ),
          elapsedMs: olderWin.elapsedMs || 0,
          syncStatus: `Prepended #${olderWin.startIndex + 1}..${olderWin.endIndex} (${olderWin.elapsedMs} ms)`,
        }));
      }
    } finally {
      setLoadingChat(false);
    }
  };

  // ---- Step 4.2.3: character gallery actions -------------------------------

  /**
   * Opens the card's chat folder by switching the sub-tab and selection, so the
   * sheet (4.2.5) shows the same card the tile pointed at.
   */
  const handleSelectCard = useCallback(
    (id) => {
      const isChangingCard = Boolean(id && id !== selectedCardIdRef.current);
      const { activeKind, isCardDirty } = workspaceGuardBridgeRef.current;
      const guardKind =
        isChangingCard &&
        (isCardDirty
          ? 'expandedCharacter'
          : activeKind === 'intro' ||
              activeKind === 'createScenario' ||
              activeKind === 'persona'
            ? activeKind
            : null);

      const proceed = () => {
        restoreCardAppliedRef.current = true;
        restorePointerAppliedRef.current = true;
        restorePointerRef.current = null;
        if (id && id !== selectedCardIdRef.current) {
          setEditingIntroTarget(null);
          if (!isDemoCardId(id)) {
            recordSessionPointer(id, '');
          }
        }
        setCreateScenarioModalOpen(false);
        setPersonaModalOpen(false);
        setSelectedCardId(id);
      };

      if (guardKind) {
        runWithWorkspaceUnsavedGuard(proceed, { targetKind: guardKind });
        return;
      }
      proceed();
    },
    [recordSessionPointer, runWithWorkspaceUnsavedGuard],
  );

  const handleGalleryOpenCard = useCallback(
    (id) => {
      const isChangingCard = Boolean(id && id !== selectedCardIdRef.current);
      const { activeKind, isCardDirty } = workspaceGuardBridgeRef.current;
      const guardKind =
        activeKind ||
        (isChangingCard && isCardDirty ? 'expandedCharacter' : null);

      const proceed = () => {
        restoreCardAppliedRef.current = true;
        restorePointerAppliedRef.current = true;
        restorePointerRef.current = null;
        if (id && id !== selectedCardIdRef.current && !isDemoCardId(id)) {
          recordSessionPointer(id, '');
        }
        setSelectedCardId(id);
        setChatListOpen(false);
        setTimelinesOpen(false);
        setSheetExpanded(false);
        setEditingPromptSelection(null);
        setEditingIntroTarget(null);
        setCreateScenarioModalOpen(false);
        setPersonaModalOpen(false);
        setLeftTab('chats');
      };

      if (guardKind) {
        runWithWorkspaceUnsavedGuard(proceed, { targetKind: guardKind });
        return;
      }
      proceed();
    },
    [recordSessionPointer, runWithWorkspaceUnsavedGuard],
  );

  const handleGalleryTogglePin = useCallback(
    async (id, forcePin) => {
      const target = cards.find((c) => c.id === id);
      if (!target) return;
      const nextPinned = forcePin !== undefined ? Boolean(forcePin) : !Boolean(target.pinned);
      if (Boolean(target.pinned) === nextPinned && Boolean(target.fav) === nextPinned) {
        return;
      }

      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, pinned: nextPinned, fav: nextPinned } : c)),
      );

      if (!isDemoCardId(id)) {
        try {
          await updateCharacterCard(id, { fav: nextPinned });
        } catch {
          setCards((prev) =>
            prev.map((c) => (c.id === id ? { ...c, pinned: !nextPinned, fav: !nextPinned } : c)),
          );
        }
      }
    },
    [cards],
  );

  const handleToggleTagHidden = useCallback((tagId) => {
    const id = String(tagId);
    setHiddenTagIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem('nexustavern_hidden_tags_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleExportCard = useCallback((id, format = 'png') => {
    if (!id || isDemoCardId(id)) return;
    const url = getCardExportUrl(id, format);
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);

  const handleDuplicateCard = useCallback(
    async (id) => {
      if (!id) return;
      if (isDemoCardId(id)) {
        setCards((prev) => {
          const orig = prev.find((c) => c.id === id);
          if (!orig) return prev;
          const cloneId = `c_${Date.now()}`;
          return [
            ...prev,
            {
              ...orig,
              id: cloneId,
              name: `${orig.name} (Copy)`,
              pinned: false,
              fav: false,
            },
          ];
        });
        return;
      }
      setGalleryStatus(`Duplicating ${id}...`);
      try {
        const cloned = await duplicateCharacterCard(id);
        await Promise.all([
          loadCardsAndPersonas(),
          refreshCategoryListState('openai').catch(() => null),
        ]);
        setGalleryStatus(cloned ? `Duplicated as ${cloned.avatar}` : 'Duplicated');
      } catch (err) {
        setGalleryStatus(`Duplicate failed: ${err.message}`);
      }
    },
    [loadCardsAndPersonas],
  );

  const handleOpenCreateScenarioModal = useCallback(
    (mode = 'create') => {
      runWithWorkspaceUnsavedGuard(() => {
        setChatListOpen(false);
        setTimelinesOpen(false);
        setEditingPromptSelection(null);
        setEditingIntroTarget(null);
        setSheetExpanded(false);
        setPersonaModalOpen(false);
        if (isMobile) {
          setLeftOpen(false);
          setRightOpen(false);
        }
        setCreateScenarioModalMode(mode);
        setCreateScenarioStatus('');
        setCreateScenarioModalOpen(true);
      });
    },
    [isMobile, runWithWorkspaceUnsavedGuard],
  );

  const handleCreateScenario = useCallback(
    async (payload) => {
      setCreatingScenario(true);
      setCreateScenarioStatus('Creating scenario card...');
      try {
        const res = await createCharacterCard(payload);
        await loadCardsAndPersonas();
        if (res?.card?.avatar) {
          setSelectedCardId(res.card.avatar);
          setActiveCardFull(res.card);
          cleanCardObjRef.current = res.card;
          setCleanCardSnapshot(serializeCardEditableSnapshot(res.card));
          setLeftTab('chats');
          setRightTab('selected');
          pushToast({
            variant: 'success',
            message: `Created scenario "${res.card.name || res.card.avatar}"`,
          });
        }
        setCreateScenarioStatus('');
        setCreateScenarioModalOpen(false);
      } catch (err) {
        setCreateScenarioStatus(`Error: ${err.message}`);
        pushToast({ variant: 'error', message: `Create failed: ${err.message}` });
      } finally {
        setCreatingScenario(false);
      }
    },
    [loadCardsAndPersonas, pushToast],
  );

  const handleImportScenarioFiles = useCallback(
    async (fileList, { importEmbeddedTags = true } = {}) => {
      const files = Array.from(fileList || []).filter((f) =>
        /\.(png|json)$/i.test(f.name),
      );
      if (files.length === 0) return;

      setCreatingScenario(true);
      setCreateScenarioStatus(`Importing ${files.length} card file(s)...`);
      try {
        const items = [];
        for (const file of files) {
          const base64 = await readFileAsBase64(file);
          items.push({ fileName: file.name, fileBase64: base64 });
        }
        const res = await importCharacterCards(items, { importEmbeddedTags });
        await loadCardsAndPersonas();
        if (res?.imported?.[0]?.avatar) {
          setSelectedCardId(res.imported[0].avatar);
          setActiveCardFull(res.imported[0]);
          cleanCardObjRef.current = res.imported[0];
          setCleanCardSnapshot(serializeCardEditableSnapshot(res.imported[0]));
        }
        setCreateScenarioStatus(`Imported ${res?.count || items.length} card(s)`);
        pushToast({
          variant: 'success',
          message: `Imported ${res?.count || items.length} scenario card(s)`,
        });
        setCreateScenarioModalOpen(false);
      } catch (err) {
        setCreateScenarioStatus(`Import failed: ${err.message}`);
        pushToast({ variant: 'error', message: `Import failed: ${err.message}` });
      } finally {
        setCreatingScenario(false);
      }
    },
    [loadCardsAndPersonas, pushToast],
  );

  const handleRenameCard = useCallback(
    async (id, newName) => {
      const trimmed = String(newName || '').trim();
      if (!id || !trimmed) return;
      const initials = trimmed.slice(0, 2).toUpperCase();
      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name: trimmed, initials } : c)),
      );
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, name: trimmed } : g)),
      );
      if (activeCardFull && selectedCardId === id) {
        setActiveCardFull((prev) => (prev ? { ...prev, name: trimmed } : prev));
      }
      if (!isDemoCardId(id)) {
        try {
          await updateCharacterCard(id, { name: trimmed });
        } catch {
          // ignore
        }
      }
    },
    [activeCardFull, selectedCardId],
  );

  const handleDeleteTag = useCallback(
    async (tagId) => {
      if (tagId == null) return;
      const tid = String(tagId);
      setTags((prev) => prev.filter((t) => String(t.id) !== tid));
      setCards((prev) =>
        prev.map((c) => ({
          ...c,
          tagIds: (c.tagIds || []).map(String).filter((x) => x !== tid),
          tags: (c.tags || []).map(String).filter((x) => x !== tid),
        })),
      );
      setHiddenTagIds((prev) => {
        const next = prev.filter((x) => x !== tid);
        try {
          localStorage.setItem('nexustavern_hidden_tags_v1', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      gallery.removeTagChip?.(tid);
      try {
        await deleteTag(tid);
      } catch {
        // ignore
      }
    },
    [gallery],
  );

  const visibleSelectableIds = useMemo(() => {
    const tagNameById = new Map();
    for (const t of tags) tagNameById.set(String(t.id), String(t.name || ''));
    const hiddenSet = new Set((hiddenTagIds || []).map(String));

    if (gallery.entityFilter === 'groups') {
      const q = String(gallery.query || '').trim().toLowerCase();
      const filteredGroups = q
        ? groups.filter((g) => String(g.name || '').toLowerCase().includes(q))
        : groups;
      return sortCards(filteredGroups, gallery.sortMode).map((g) => g.id);
    }

    const nonHidden =
      hiddenSet.size === 0
        ? cards
        : cards.filter((card) => {
            const cTags = card.tagIds || card.tags || [];
            return !cTags.some((tid) => hiddenSet.has(String(tid)));
          });

    const filtered = filterCards(nonHidden, {
      query: gallery.query,
      chipState: gallery.chipState,
      tagNameById,
    });
    return sortCards(filtered, gallery.sortMode).map((c) => c.id);
  }, [
    cards,
    groups,
    tags,
    hiddenTagIds,
    gallery.entityFilter,
    gallery.query,
    gallery.chipState,
    gallery.sortMode,
  ]);

  const allResultsSelected = useMemo(() => {
    if (visibleSelectableIds.length === 0) return false;
    const selectedSet = new Set(multiSelectedIds);
    return visibleSelectableIds.every((id) => selectedSet.has(id));
  }, [visibleSelectableIds, multiSelectedIds]);

  const handleToggleMultiSelectMode = useCallback((nextActive) => {
    const active = Boolean(nextActive);
    setMultiSelectActive(active);
    setMultiSelectSubpopover(null);
    if (!active) {
      setMultiSelectedIds([]);
      setLastMultiClick({ id: null, selected: true });
    }
  }, []);

  const handleExitMultiSelect = useCallback(() => {
    setMultiSelectActive(false);
    setMultiSelectSubpopover(null);
    setMultiSelectedIds([]);
    setLastMultiClick({ id: null, selected: true });
  }, []);

  const handleClearMultiSelect = useCallback(() => {
    setMultiSelectedIds([]);
    setMultiSelectSubpopover(null);
    setLastMultiClick({ id: null, selected: true });
  }, []);

  const handleSelectAllResults = useCallback(() => {
    if (visibleSelectableIds.length === 0) return;
    setMultiSelectedIds((prev) => {
      const set = new Set(prev);
      const everySelected = visibleSelectableIds.every((id) => set.has(id));
      if (everySelected) {
        for (const id of visibleSelectableIds) set.delete(id);
      } else {
        for (const id of visibleSelectableIds) set.add(id);
      }
      return Array.from(set);
    });
  }, [visibleSelectableIds]);

  useEffect(() => {
    if (!multiSelectActive) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (renameDialog || deleteDialog || createGroupDialog || bulkDeleteDialog) return;
        e.preventDefault();
        e.stopPropagation();
        if (multiSelectSubpopover) {
          setMultiSelectSubpopover(null);
        } else {
          handleExitMultiSelect();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    multiSelectActive,
    multiSelectSubpopover,
    renameDialog,
    deleteDialog,
    createGroupDialog,
    bulkDeleteDialog,
    handleExitMultiSelect,
  ]);

  const handleToggleMultiSelectCard = useCallback(
    (cardId, event) => {
      if (!cardId) return;
      if (!multiSelectActive) {
        setMultiSelectActive(true);
      }
      setMultiSelectedIds((prev) => {
        const set = new Set(prev);
        const targetState = !set.has(cardId);
        if (event?.shiftKey && lastMultiClick.id && lastMultiClick.id !== cardId) {
          const orderedIds =
            visibleSelectableIds.includes(lastMultiClick.id) &&
            visibleSelectableIds.includes(cardId)
              ? visibleSelectableIds
              : cards.map((c) => c.id);
          const a = orderedIds.indexOf(lastMultiClick.id);
          const b = orderedIds.indexOf(cardId);
          if (a !== -1 && b !== -1) {
            const [start, end] = a < b ? [a, b] : [b, a];
            for (let i = start; i <= end; i += 1) {
              if (lastMultiClick.selected) set.add(orderedIds[i]);
              else set.delete(orderedIds[i]);
            }
            return Array.from(set);
          }
        }
        if (targetState) set.add(cardId);
        else set.delete(cardId);
        setLastMultiClick({ id: cardId, selected: targetState });
        return Array.from(set);
      });
    },
    [multiSelectActive, visibleSelectableIds, cards, lastMultiClick],
  );

  const kebabItemsForCard = useCallback(
    (card) => {
      if (!card) return [];
      const isSelectedInMulti =
        multiSelectActive && multiSelectedIds.includes(card.id);
      return [
        {
          id: 'select',
          label: isSelectedInMulti ? 'Deselect' : 'Select',
          icon: 'check',
          onClick: () => {
            if (!multiSelectActive) {
              setMultiSelectActive(true);
              setMultiSelectedIds([card.id]);
              setLastMultiClick({ id: card.id, selected: true });
            } else {
              handleToggleMultiSelectCard(card.id);
            }
          },
        },
        {
          id: 'rename',
          label: 'Rename',
          icon: 'edit',
          onClick: () =>
            setRenameDialog({
              kind: 'card',
              id: card.id,
              name: card.name || '',
              initialName: card.name || '',
            }),
        },
        {
          id: 'duplicate',
          label: 'Duplicate',
          icon: 'copy',
          hidden: Boolean(card.isGroup),
          onClick: () => handleDuplicateCard(card.id),
        },
        {
          id: 'delete',
          label: 'Delete',
          icon: 'trash',
          danger: true,
          onClick: () =>
            setDeleteDialog({
              kind: 'card',
              id: card.id,
              name: card.name || card.id,
              isGroup: Boolean(card.isGroup),
              deleteChats: true,
            }),
        },
      ];
    },
    [
      multiSelectActive,
      multiSelectedIds,
      handleToggleMultiSelectCard,
      handleDuplicateCard,
    ],
  );

  // ---- Step 4.2.4: pinned section & folder management ----------------------

  const handleAssignTagToCard = useCallback(
    async (cardId, tagId) => {
      if (!cardId || tagId == null) return;
      const tid = String(tagId);
      setCards((prev) =>
        prev.map((c) => {
          if (c.id !== cardId) return c;
          const existing = (c.tagIds || []).map(String);
          if (existing.includes(tid)) return c;
          return { ...c, tagIds: [...existing, tid] };
        }),
      );
      if (!isDemoCardId(cardId)) {
        try {
          await bulkSetCardTags([cardId], tid, 'add');
        } catch {
          // ignore
        }
      }
    },
    [],
  );

  const handleRemoveTagFromCard = useCallback(
    async (cardId, tagId) => {
      if (!cardId || tagId == null) return;
      const tid = String(tagId);
      setCards((prev) =>
        prev.map((c) => {
          if (c.id !== cardId) return c;
          return { ...c, tagIds: (c.tagIds || []).map(String).filter((x) => x !== tid) };
        }),
      );
      if (!isDemoCardId(cardId)) {
        try {
          await bulkSetCardTags([cardId], tid, 'remove');
        } catch {
          // ignore
        }
      }
    },
    [],
  );

  const handleCreateTag = useCallback(async (rawName) => {
    const trimmed = String(rawName || '').trim();
    if (!trimmed) return;
    try {
      const res = await createTag(trimmed);
      if (Array.isArray(res?.tags) && res.tags.length > 0) {
        setTags(res.tags);
        return;
      }
    } catch {
      // Fallback to local state when server is unreachable
    }
    setTags((prev) => {
      if (prev.some((t) => String(t.name || '').toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      return [...prev, { id: `tag_${Date.now()}`, name: trimmed }];
    });
  }, []);

  const handleRenameTagFolder = useCallback(async (tagId, newName) => {
    if (tagId == null || !newName) return;
    const tid = String(tagId);
    setTags((prev) => prev.map((t) => (String(t.id) === tid ? { ...t, name: newName } : t)));
    try {
      await renameTag(tid, newName);
    } catch {
      // ignore
    }
  }, []);

  const pinnedLayout = usePinnedLayout({
    cards,
    tags,
    hiddenTagIds,
    onSyncCardPinServer: handleGalleryTogglePin,
    onAssignTagToCard: handleAssignTagToCard,
    onRemoveTagFromCard: handleRemoveTagFromCard,
    onRenameTag: handleRenameTagFolder,
  });

  const handleDeleteCard = useCallback(
    async (id, { deleteChats = true, isGroup = false } = {}) => {
      if (!id) return;
      pinnedLayout.bulkUnpinCards([id], { syncServer: false });
      const remainingCards = cards.filter((c) => c.id !== id);
      setCards(remainingCards);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      setMultiSelectedIds((prev) => prev.filter((x) => x !== id));
      lastChatsByAvatarRef.current = clearCachedCharacterLastChat(id);
      if (recordedSessionPointerRef.current?.avatar === id) {
        recordedSessionPointerRef.current = null;
        writeCachedLastChat(null);
      }

      if (selectedCardId === id) {
        const nextCardId = remainingCards[0]?.id || '';
        loadedSessionRef.current = { cardId: null, chatFile: '' };
        setCommittedChatCardId('');
        setSelectedCardId(nextCardId);
        setActiveCardFull(null);
        cleanCardObjRef.current = null;
        setCleanCardSnapshot('');
        setActiveChatFile('');
        setChatFiles([]);
        setTimelineChats([]);
        setMessages([]);
        setTimelinesOpen(false);
        setChatListOpen(false);
        setSheetExpanded(false);
        setEditingPromptSelection(null);
        setEditingIntroTarget(null);
        setLeftTab('characters');
      }
      if (!isDemoCardId(id)) {
        try {
          if (isGroup) {
            if (!id.startsWith('group_')) {
              await deleteCharacterCards([], { groupIds: [id], deleteChats });
            }
          } else {
            await deleteCharacterCard(id, { deleteChats });
          }
          await Promise.all([
            loadCardsAndPersonas(),
            refreshCategoryListState('openai').catch(() => null),
          ]);
          pushToast({
            variant: 'info',
            icon: 'trash',
            message: deleteChats
              ? 'Deleted scenario and its chats'
              : 'Deleted scenario card (chats kept on disk)',
          });
        } catch (err) {
          pushToast({
            variant: 'error',
            message: `Delete failed: ${err.message}`,
          });
        }
      }
    },
    [cards, selectedCardId, pinnedLayout, loadCardsAndPersonas, pushToast],
  );

  const allSelectedArePinned = useMemo(() => {
    if (multiSelectedIds.length === 0) return false;
    return multiSelectedIds.every((id) =>
      isCardInPinnedEntries(pinnedLayout.entries, id),
    );
  }, [multiSelectedIds, pinnedLayout.entries]);

  const handleBulkPinToggle = useCallback(() => {
    if (multiSelectedIds.length === 0) return;
    if (allSelectedArePinned) {
      pinnedLayout.bulkUnpinCards(multiSelectedIds);
    } else {
      pinnedLayout.bulkPinCards(multiSelectedIds);
    }
  }, [multiSelectedIds, allSelectedArePinned, pinnedLayout]);

  const selectedCharacterCards = useMemo(() => {
    if (multiSelectedIds.length === 0) return [];
    const set = new Set(multiSelectedIds);
    return cards.filter((c) => set.has(c.id));
  }, [cards, multiSelectedIds]);

  const handleBulkMoveToFolder = useCallback(
    (targetFolderId = null, customName = 'New Folder') => {
      if (multiSelectedIds.length === 0) return;
      pinnedLayout.moveCardsToFolder(multiSelectedIds, targetFolderId, customName);
      setMultiSelectSubpopover(null);
      setMultiFolderInput('New Folder');
    },
    [multiSelectedIds, pinnedLayout],
  );

  const handleBulkToggleTagOnSelected = useCallback(
    async (tagId) => {
      if (tagId == null || selectedCharacterCards.length === 0) return;
      const tid = String(tagId);
      const targetCardIds = selectedCharacterCards.map((c) => c.id);
      const targetSet = new Set(targetCardIds);
      const assignedCount = selectedCharacterCards.filter((c) =>
        (c.tagIds || c.tags || []).map(String).includes(tid),
      ).length;
      const mode = assignedCount === selectedCharacterCards.length ? 'remove' : 'add';

      setCards((prev) =>
        prev.map((c) => {
          if (!targetSet.has(c.id)) return c;
          const existing = (c.tagIds || c.tags || []).map(String);
          const nextTagIds =
            mode === 'remove'
              ? existing.filter((x) => x !== tid)
              : existing.includes(tid)
                ? existing
                : [...existing, tid];
          return { ...c, tagIds: nextTagIds, tags: nextTagIds };
        }),
      );

      const serverAvatars = targetCardIds.filter((id) => !isDemoCardId(id));
      if (serverAvatars.length > 0) {
        try {
          await bulkSetCardTags(serverAvatars, tid, mode);
        } catch {
          // ignore
        }
      }
    },
    [selectedCharacterCards],
  );

  const handleBulkCreateAndAssignTag = useCallback(
    async (rawName) => {
      const trimmed = String(rawName || '').trim();
      if (!trimmed || selectedCharacterCards.length === 0) return;
      const existingTag = tags.find(
        (t) => String(t.name || '').toLowerCase() === trimmed.toLowerCase(),
      );

      let resolvedTagId = existingTag ? String(existingTag.id) : null;
      if (!resolvedTagId) {
        try {
          const res = await createTag(trimmed);
          if (Array.isArray(res?.tags) && res.tags.length > 0) {
            setTags(res.tags);
            const created =
              res.tag ||
              res.tags.find(
                (t) => String(t.name || '').toLowerCase() === trimmed.toLowerCase(),
              );
            if (created) resolvedTagId = String(created.id);
          }
        } catch {
          // fallback to local tag creation below
        }
      }

      if (!resolvedTagId) {
        const localId = `tag_${Date.now()}`;
        resolvedTagId = localId;
        setTags((prev) => [...prev, { id: localId, name: trimmed }]);
      }

      const targetCardIds = selectedCharacterCards.map((c) => c.id);
      const targetSet = new Set(targetCardIds);
      setCards((prev) =>
        prev.map((c) => {
          if (!targetSet.has(c.id)) return c;
          const existing = (c.tagIds || c.tags || []).map(String);
          if (existing.includes(resolvedTagId)) return c;
          const next = [...existing, resolvedTagId];
          return { ...c, tagIds: next, tags: next };
        }),
      );

      const serverAvatars = targetCardIds.filter((id) => !isDemoCardId(id));
      if (serverAvatars.length > 0) {
        try {
          await bulkSetCardTags(serverAvatars, resolvedTagId, 'add');
        } catch {
          // ignore
        }
      }
      setMultiTagInput('');
    },
    [selectedCharacterCards, tags],
  );

  const handleBulkExport = useCallback(
    async (format = 'png') => {
      const serverAvatars = selectedCharacterCards
        .map((c) => c.id)
        .filter((id) => !isDemoCardId(id));
      if (serverAvatars.length === 0) return;
      setMultiSelectSubpopover(null);
      setGalleryStatus(`Packing ${serverAvatars.length} card(s) into ${format.toUpperCase()} ZIP...`);
      try {
        const res = await downloadCharacterCardsZip(serverAvatars, format);
        setGalleryStatus(`Exported ${res.count} card(s) to ${res.fileName}`);
      } catch (err) {
        setGalleryStatus(`ZIP export failed: ${err.message}`);
      }
    },
    [selectedCharacterCards],
  );

  const handleOpenCreateGroupModal = useCallback(() => {
    if (selectedCharacterCards.length === 0) return;
    setMultiSelectSubpopover(null);
    const previewNames = selectedCharacterCards
      .slice(0, 3)
      .map((c) => c.name)
      .join(', ');
    const defaultName = `Group: ${previewNames}${
      selectedCharacterCards.length > 3 ? '...' : ''
    }`;
    setCreateGroupDialog({
      name: defaultName,
      initialName: defaultName,
      members: selectedCharacterCards,
    });
  }, [selectedCharacterCards]);

  const handleConfirmCreateGroup = useCallback(async () => {
    if (!createGroupDialog) return;
    const trimmedName = String(createGroupDialog.name || '').trim();
    const memberIds = (createGroupDialog.members || []).map((m) => m.id);
    if (!trimmedName || memberIds.length === 0) return;

    setCreateGroupUnsavedOpen(false);
    setCreateGroupDialog(null);
    const serverMembers = memberIds.filter((id) => !isDemoCardId(id));

    if (serverMembers.length > 0) {
      try {
        const res = await createGroupChat({
          name: trimmedName,
          members: serverMembers,
          fav: false,
        });
        if (Array.isArray(res?.groups)) {
          setGroups(res.groups);
        }
        setGalleryStatus(`Created group "${trimmedName}"`);
      } catch (err) {
        setGalleryStatus(`Create group failed: ${err.message}`);
      }
    } else {
      const localGroupId = `group_${Date.now()}`;
      const firstMember = createGroupDialog.members[0];
      setGroups((prev) => [
        ...prev,
        {
          id: localGroupId,
          name: trimmedName,
          members: memberIds,
          memberCount: memberIds.length,
          pinned: false,
          fav: false,
          isGroup: true,
          avatarUrl: firstMember?.thumbnailUrl || firstMember?.avatarUrl || null,
        },
      ]);
    }

    handleExitMultiSelect();
  }, [createGroupDialog, handleExitMultiSelect]);

  const handleOpenBulkDeleteModal = useCallback(() => {
    if (multiSelectedIds.length === 0) return;
    setMultiSelectSubpopover(null);
    const selectedSet = new Set(multiSelectedIds);
    const matchedCards = cards.filter((c) => selectedSet.has(c.id));
    const matchedGroups = groups
      .filter((g) => selectedSet.has(g.id))
      .map((g) => ({ ...g, isGroup: true }));
    setBulkDeleteDialog({
      items: [...matchedCards, ...matchedGroups],
      deleteChats: true,
    });
  }, [multiSelectedIds, cards, groups]);

  const handleConfirmBulkDelete = useCallback(async () => {
    if (!bulkDeleteDialog || !Array.isArray(bulkDeleteDialog.items)) return;
    const items = bulkDeleteDialog.items;
    const deleteChats = Boolean(bulkDeleteDialog.deleteChats);
    setBulkDeleteDialog(null);

    const allIds = items.map((it) => it.id);
    const removeSet = new Set(allIds);
    const cardIds = items.filter((it) => !it.isGroup).map((it) => it.id);
    const groupIds = items.filter((it) => it.isGroup).map((it) => it.id);

    // Clean up Pinned & folders locally without firing competing PUT requests for cards being deleted
    pinnedLayout.bulkUnpinCards(allIds, { syncServer: false });

    const remainingCards = cards.filter((c) => !removeSet.has(c.id));
    setCards(remainingCards);
    setGroups((prev) => prev.filter((g) => !removeSet.has(g.id)));
    for (const cid of cardIds) {
      lastChatsByAvatarRef.current = clearCachedCharacterLastChat(cid);
    }
    if (recordedSessionPointerRef.current?.avatar && removeSet.has(recordedSessionPointerRef.current.avatar)) {
      recordedSessionPointerRef.current = null;
      writeCachedLastChat(null);
    }
    if (selectedCardId && removeSet.has(selectedCardId)) {
      loadedSessionRef.current = { cardId: null, chatFile: '' };
      setCommittedChatCardId('');
      setSelectedCardId(remainingCards[0]?.id || '');
      setActiveCardFull(null);
      cleanCardObjRef.current = null;
      setCleanCardSnapshot('');
      setActiveChatFile('');
      setChatFiles([]);
      setTimelineChats([]);
      setMessages([]);
      setTimelinesOpen(false);
      setChatListOpen(false);
      setSheetExpanded(false);
      setEditingPromptSelection(null);
      setEditingIntroTarget(null);
    }
    handleExitMultiSelect();

    const serverAvatars = cardIds.filter((id) => !isDemoCardId(id));
    const serverGroups = groupIds.filter((id) => !id.startsWith('group_'));

    if (serverAvatars.length > 0 || serverGroups.length > 0) {
      setGalleryStatus(`Deleting ${serverAvatars.length + serverGroups.length} item(s)...`);
      try {
        await deleteCharacterCards(serverAvatars, {
          groupIds: serverGroups,
          deleteChats,
        });
        await Promise.all([
          loadCardsAndPersonas(),
          refreshCategoryListState('openai').catch(() => null),
        ]);
        setGalleryStatus(`Deleted ${items.length} item(s)`);
      } catch (err) {
        setGalleryStatus(`Bulk delete failed: ${err.message}`);
      }
    }
  }, [bulkDeleteDialog, cards, selectedCardId, pinnedLayout, handleExitMultiSelect, loadCardsAndPersonas]);

  const multiSelectPopover = useMemo(() => {
    if (!multiSelectActive || !multiSelectSubpopover || multiSelectedIds.length === 0) {
      return null;
    }

    if (multiSelectSubpopover === 'folder') {
      const userFolders = (pinnedLayout.resolvedEntries || []).filter(
        (e) => e.type === 'folder',
      );
      return (
        <>
          <div className="bb-m3-ms-pop__header">
            <span className="bb-m3-ms-pop__title">
              <Icon name="folderPlus" size={14} />
              <span>Move to folder · {multiSelectedIds.length} selected</span>
            </span>
            <button
              type="button"
              className="bb-m3-ms-pop__close"
              title="Close"
              onClick={() => setMultiSelectSubpopover(null)}
            >
              <Icon name="close" size={13} />
            </button>
          </div>

          <div className="bb-m3-ms-pop__input-row">
            <input
              type="text"
              className="bb-m3-ms-pop__input"
              value={multiFolderInput}
              placeholder="New folder name..."
              maxLength={40}
              onChange={(e) => setMultiFolderInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleBulkMoveToFolder(null, multiFolderInput);
                }
              }}
            />
            <button
              type="button"
              className="bb-m3-ms-pop__btn"
              disabled={!multiFolderInput.trim()}
              title={
                multiSelectedIds.length < 2
                  ? 'Select at least 2 cards to form a new folder (1 card will be pinned)'
                  : 'Create new folder in Pinned with selected cards'
              }
              onClick={() => handleBulkMoveToFolder(null, multiFolderInput)}
            >
              <Icon name="plus" size={13} />
              <span>Create</span>
            </button>
          </div>

          {userFolders.length > 0 ? (
            <OverlayScrollArea
              viewportClassName="bb-m3-ms-pop__chips"
              variant="compact"
            >
              {userFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className="bb-m3-ms-pop__chip"
                  title={`Move selected cards into "${folder.name}"`}
                  onClick={() => handleBulkMoveToFolder(folder.id)}
                >
                  <Icon name="folder" size={12} />
                  <span>{folder.name}</span>
                  <span className="bb-m3-ms-pop__chip-meta">
                    {(folder.items || []).length}
                  </span>
                </button>
              ))}
            </OverlayScrollArea>
          ) : (
            <div className="bb-m3-ms-pop__empty">
              No existing folders in Pinned yet — enter a name above to create one.
            </div>
          )}
        </>
      );
    }

    if (multiSelectSubpopover === 'tags') {
      const charCount = selectedCharacterCards.length;
      const q = multiTagInput.trim().toLowerCase();
      const filteredTags = q
        ? tags.filter((t) => String(t.name || '').toLowerCase().includes(q))
        : tags;

      return (
        <>
          <div className="bb-m3-ms-pop__header">
            <span className="bb-m3-ms-pop__title">
              <Icon name="tags" size={14} />
              <span>Manage tags · {charCount} selected</span>
            </span>
            <button
              type="button"
              className="bb-m3-ms-pop__close"
              title="Close"
              onClick={() => setMultiSelectSubpopover(null)}
            >
              <Icon name="close" size={13} />
            </button>
          </div>

          {charCount === 0 ? (
            <div className="bb-m3-ms-pop__empty">
              Select at least one scenario card to manage tags.
            </div>
          ) : (
            <>
              <div className="bb-m3-ms-pop__input-row">
                <input
                  type="text"
                  className="bb-m3-ms-pop__input"
                  value={multiTagInput}
                  placeholder="Filter or create new tag..."
                  maxLength={40}
                  onChange={(e) => setMultiTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && multiTagInput.trim()) {
                      e.preventDefault();
                      handleBulkCreateAndAssignTag(multiTagInput);
                    }
                  }}
                />
                <button
                  type="button"
                  className="bb-m3-ms-pop__btn"
                  disabled={!multiTagInput.trim()}
                  onClick={() => handleBulkCreateAndAssignTag(multiTagInput)}
                >
                  <Icon name="plus" size={13} />
                  <span>Add</span>
                </button>
              </div>

              {filteredTags.length > 0 ? (
                <OverlayScrollArea
                  viewportClassName="bb-m3-ms-pop__chips"
                  variant="compact"
                >
                  {filteredTags.map((tag) => {
                    const tid = String(tag.id);
                    const assignedCount = selectedCharacterCards.filter((c) =>
                      (c.tagIds || c.tags || []).map(String).includes(tid),
                    ).length;
                    const state =
                      assignedCount === 0
                        ? 'none'
                        : assignedCount === charCount
                          ? 'all'
                          : 'partial';
                    return (
                      <button
                        key={tid}
                        type="button"
                        className={[
                          'bb-m3-ms-pop__chip',
                          state === 'all' ? 'is-all' : '',
                          state === 'partial' ? 'is-partial' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        title={
                          state === 'all'
                            ? `Assigned to all ${charCount} selected — click to remove from all`
                            : state === 'partial'
                              ? `Assigned to ${assignedCount} of ${charCount} selected — click to add to all`
                              : `Click to add "${tag.name}" to all ${charCount} selected`
                        }
                        onClick={() => handleBulkToggleTagOnSelected(tid)}
                      >
                        {state === 'all' ? (
                          <Icon name="check" size={12} />
                        ) : (
                          <Icon name="tags" size={11} />
                        )}
                        <span>{tag.name}</span>
                        {state === 'partial' && (
                          <span className="bb-m3-ms-pop__chip-meta">
                            {assignedCount}/{charCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </OverlayScrollArea>
              ) : (
                <div className="bb-m3-ms-pop__empty">
                  No matching tags — press Add to create &ldquo;{multiTagInput.trim()}&rdquo;.
                </div>
              )}
            </>
          )}
        </>
      );
    }

    if (multiSelectSubpopover === 'export') {
      const charCount = selectedCharacterCards.length;
      return (
        <>
          <div className="bb-m3-ms-pop__header">
            <span className="bb-m3-ms-pop__title">
              <Icon name="download" size={14} />
              <span>Export ZIP archive · {charCount} selected</span>
            </span>
            <button
              type="button"
              className="bb-m3-ms-pop__close"
              title="Close"
              onClick={() => setMultiSelectSubpopover(null)}
            >
              <Icon name="close" size={13} />
            </button>
          </div>

          <div className="bb-m3-ms-pop__grid-2">
            <button
              type="button"
              className="bb-m3-ms-pop__tile-btn"
              disabled={charCount === 0}
              title="Download selected scenarios packed as a PNG .zip archive"
              onClick={() => handleBulkExport('png')}
            >
              <Icon name="image" size={15} />
              <span>PNG Archive (.zip)</span>
            </button>
            <button
              type="button"
              className="bb-m3-ms-pop__tile-btn"
              disabled={charCount === 0}
              title="Download selected scenarios packed as a JSON .zip archive"
              onClick={() => handleBulkExport('json')}
            >
              <Icon name="download" size={15} />
              <span>JSON Archive (.zip)</span>
            </button>
          </div>
        </>
      );
    }

    return null;
  }, [
    multiSelectActive,
    multiSelectSubpopover,
    multiSelectedIds,
    pinnedLayout.resolvedEntries,
    multiFolderInput,
    multiTagInput,
    selectedCharacterCards,
    tags,
    handleBulkMoveToFolder,
    handleBulkCreateAndAssignTag,
    handleBulkToggleTagOnSelected,
    handleBulkExport,
  ]);

  const multiSelectActions = useMemo(
    () => [
      {
        id: 'pin',
        label: allSelectedArePinned ? 'Unpin' : 'Pin',
        icon: 'pin',
        title: allSelectedArePinned
          ? 'Unpin selected scenarios from Pinned'
          : 'Pin selected scenarios into Pinned',
        onClick: handleBulkPinToggle,
      },
      {
        id: 'folder',
        label: 'Folder',
        icon: 'folderPlus',
        title: 'Move selected scenarios into a new or existing folder',
        onClick: () =>
          setMultiSelectSubpopover((prev) => (prev === 'folder' ? null : 'folder')),
      },
      {
        id: 'group',
        label: 'Group',
        icon: 'users',
        disabled: selectedCharacterCards.length === 0,
        title: 'Create a group chat from selected scenarios',
        onClick: handleOpenCreateGroupModal,
      },
      {
        id: 'tags',
        label: 'Tags',
        icon: 'tags',
        disabled: selectedCharacterCards.length === 0,
        title: 'Manage tags on selected scenarios',
        onClick: () =>
          setMultiSelectSubpopover((prev) => (prev === 'tags' ? null : 'tags')),
      },
      {
        id: 'export',
        label: 'Export',
        icon: 'download',
        disabled: selectedCharacterCards.length === 0,
        title: 'Export selected scenarios as a ZIP archive (PNG or JSON)',
        onClick: () =>
          setMultiSelectSubpopover((prev) => (prev === 'export' ? null : 'export')),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'trash',
        danger: true,
        title: 'Delete selected scenarios',
        onClick: handleOpenBulkDeleteModal,
      },
    ],
    [
      allSelectedArePinned,
      selectedCharacterCards.length,
      handleBulkPinToggle,
      handleOpenCreateGroupModal,
      handleOpenBulkDeleteModal,
    ],
  );

  const kebabItemsForTagFolder = useCallback(
    (tag) => {
      if (!tag) return [];
      const tid = String(tag.id);
      const isHidden = hiddenTagIds.includes(tid);
      return [
        {
          id: 'rename-tag',
          label: 'Rename tag',
          icon: 'edit',
          onClick: () =>
            setRenameDialog({
              kind: 'tag',
              id: tid,
              name: tag.name || '',
              initialName: tag.name || '',
            }),
        },
        {
          id: 'toggle-hide-tag',
          label: isHidden ? 'Show tag' : 'Hide tag',
          icon: isHidden ? 'eye' : 'eyeSlash',
          onClick: () => handleToggleTagHidden(tid),
        },
        {
          id: 'delete-tag',
          label: 'Delete tag',
          icon: 'trash',
          danger: true,
          onClick: () => setDeleteDialog({ kind: 'tag', id: tid, name: tag.name || tid }),
        },
      ];
    },
    [hiddenTagIds, handleToggleTagHidden],
  );

  const kebabItemsForPinnedFolder = useCallback(
    (entry) => {
      if (!entry) return [];
      if (entry.type === 'tag-folder') {
        const tid = String(entry.tagId);
        const isHidden = hiddenTagIds.includes(tid);
        return [
          {
            id: 'rename-tag',
            label: 'Rename tag',
            icon: 'edit',
            onClick: () =>
              setRenameDialog({
                kind: 'tag',
                id: tid,
                name: entry.name || '',
                initialName: entry.name || '',
              }),
          },
          {
            id: 'toggle-hide-tag',
            label: isHidden ? 'Show tag' : 'Hide tag',
            icon: isHidden ? 'eye' : 'eyeSlash',
            onClick: () => handleToggleTagHidden(tid),
          },
          {
            id: 'unpin-tag-folder',
            label: 'Unpin folder',
            icon: 'pin',
            onClick: () => pinnedLayout.unpinTagFolder(tid),
          },
          {
            id: 'delete-tag',
            label: 'Delete tag',
            icon: 'trash',
            danger: true,
            onClick: () =>
              setDeleteDialog({ kind: 'tag', id: tid, name: entry.name || tid }),
          },
        ];
      }

      const memberIds = (entry.items || []).map((m) => m.id).filter(Boolean);
      return [
        {
          id: 'select-folder',
          label: 'Select',
          icon: 'check',
          onClick: () => {
            setMultiSelectActive(true);
            setMultiSelectedIds((prev) => Array.from(new Set([...prev, ...memberIds])));
            if (memberIds[0]) {
              setLastMultiClick({ id: memberIds[0], selected: true });
            }
          },
        },
        {
          id: 'rename-folder',
          label: 'Rename',
          icon: 'edit',
          onClick: () =>
            setRenameDialog({
              kind: 'folder',
              id: entry.id,
              name: entry.name || 'Folder',
              initialName: entry.name || 'Folder',
            }),
        },
        {
          id: 'ungroup-folder',
          label: 'Ungroup folder',
          icon: 'folder',
          onClick: () => pinnedLayout.dissolveFolder(entry.id),
        },
      ];
    },
    [hiddenTagIds, handleToggleTagHidden, pinnedLayout],
  );

  const refreshTimelineChats = useCallback(async (cardId) => {
    if (!cardId || isDemoCardId(cardId)) return;
    setLoadingTimelines(true);
    try {
      const res = await fetchCharacterChats(cardId, { offset: 0, limit: null });
      if (Array.isArray(res?.chats)) {
        setTimelineChats(res.chats);
      }
    } catch {
      // ignore
    } finally {
      setLoadingTimelines(false);
    }
  }, []);

  const handleBackToChat = useCallback(() => {
    runWithWorkspaceUnsavedGuard(() => {
      setChatListOpen(false);
      setTimelinesOpen(false);
      setEditingPromptSelection(null);
      setEditingIntroTarget(null);
      setCreateScenarioModalOpen(false);
      setPersonaModalOpen(false);
      setSheetExpanded((wasExpanded) => {
        if (wasExpanded) {
          setRightTab('selected');
        }
        return false;
      });
      scrollToChatBottom();
    });
  }, [runWithWorkspaceUnsavedGuard, scrollToChatBottom]);

  const handleToggleChatList = useCallback(async () => {
    if (isMobile) setRightOpen(false);
    setLeftOpen(true);
    setLeftTab('chats');
    if (selectedCardId && !isDemoCardId(selectedCardId)) {
      fetchCharacterChats(selectedCardId, { offset: 0, limit: null })
        .then((res) => {
          if (Array.isArray(res?.chats)) {
            setChatFiles(res.chats);
            setTimelineChats(res.chats);
            setChatListMeta({
              totalChats: res.totalChats ?? res.chats.length,
              hasMore: Boolean(res.hasMore),
              nextOffset: res.nextOffset ?? res.chats.length,
              loadingMore: false,
            });
          }
        })
        .catch(() => {});
    }
  }, [isMobile, selectedCardId]);

  const handleFocusNodeOnTree = useCallback(
    (fileName, { openTree = false } = {}) => {
      if (!fileName) return;
      const proceed = () => {
        if (openTree) {
          setEditingPromptSelection(null);
          setEditingIntroTarget(null);
          setCreateScenarioModalOpen(false);
          setPersonaModalOpen(false);
          setSheetExpanded((wasExpanded) => {
            if (wasExpanded) setRightTab('selected');
            return false;
          });
          setTimelinesOpen(true);
          if (selectedCardId && !isDemoCardId(selectedCardId)) {
            refreshTimelineChats(selectedCardId);
          }
        }
        setFocusedTimelineRequest((prev) => ({
          fileName,
          seq: (prev?.seq || 0) + 1,
        }));
      };
      if (openTree) {
        runWithWorkspaceUnsavedGuard(proceed);
      } else {
        proceed();
      }
    },
    [selectedCardId, refreshTimelineChats, runWithWorkspaceUnsavedGuard],
  );

  const handleToggleTimelines = useCallback(() => {
    runWithWorkspaceUnsavedGuard(() => {
      setChatListOpen(false);
      setFocusedTimelineRequest(null);
      setEditingPromptSelection(null);
      setEditingIntroTarget(null);
      setCreateScenarioModalOpen(false);
      setPersonaModalOpen(false);
      setSheetExpanded((wasExpanded) => {
        if (wasExpanded) {
          setRightTab('selected');
        }
        return false;
      });
      setTimelinesOpen((prev) => {
        const next = !prev;
        if (next && selectedCardId && !isDemoCardId(selectedCardId)) {
          refreshTimelineChats(selectedCardId);
        } else if (!next) {
          scrollToChatBottom();
        }
        return next;
      });
    });
  }, [selectedCardId, refreshTimelineChats, scrollToChatBottom, runWithWorkspaceUnsavedGuard]);

  const handleLoadMoreChats = useCallback(async () => {
    if (
      !selectedCardId ||
      isDemoCardId(selectedCardId) ||
      !chatListMeta.hasMore ||
      chatListMeta.loadingMore
    ) {
      return;
    }
    setChatListMeta((prev) => ({ ...prev, loadingMore: true }));
    try {
      const res = await fetchCharacterChats(selectedCardId, {
        offset: chatListMeta.nextOffset,
        limit: 30,
      });
      if (Array.isArray(res?.chats)) {
        setChatFiles((prev) => {
          const existing = new Set(prev.map((c) => c.fileName));
          const extra = res.chats.filter((c) => !existing.has(c.fileName));
          return [...prev, ...extra];
        });
        setChatListMeta({
          totalChats: res.totalChats ?? 0,
          hasMore: Boolean(res.hasMore),
          nextOffset: res.nextOffset ?? chatListMeta.nextOffset + res.chats.length,
          loadingMore: false,
        });
      } else {
        setChatListMeta((prev) => ({ ...prev, loadingMore: false }));
      }
    } catch {
      setChatListMeta((prev) => ({ ...prev, loadingMore: false }));
    }
  }, [selectedCardId, chatListMeta.hasMore, chatListMeta.loadingMore, chatListMeta.nextOffset]);

  const handleSelectChatFromList = useCallback(
    async (fileName) => {
      if (!fileName || !selectedCardId || isDemoCardId(selectedCardId)) {
        setChatListOpen(false);
        setTimelinesOpen(false);
        scrollToChatBottom();
        return;
      }
      await openChatFileWindow(selectedCardId, fileName);
      setChatListOpen(false);
      setTimelinesOpen(false);
      scrollToChatBottom();
    },
    [selectedCardId, openChatFileWindow, scrollToChatBottom],
  );

  const handleBranchChatFromList = useCallback(
    async (fileName) => {
      if (!fileName || !selectedCardId || isDemoCardId(selectedCardId) || loadingChat) {
        return;
      }
      setLoadingChat(true);
      try {
        const branched = await branchCharacterChat(selectedCardId, fileName);
        const chatListRes = await fetchCharacterChats(selectedCardId, {
          offset: 0,
          limit: null,
        });
        const files = chatListRes?.chats || [];
        setChatFiles(files);
        setTimelineChats(files);
        setChatListMeta({
          totalChats: chatListRes?.totalChats ?? files.length,
          hasMore: Boolean(chatListRes?.hasMore),
          nextOffset: chatListRes?.nextOffset ?? files.length,
          loadingMore: false,
        });
        if (branched?.fileName) {
          const targetCardId = selectedCardId;
          loadedSessionRef.current = {
            cardId: targetCardId,
            chatFile: branched.fileName,
          };
          setActiveChatFile(branched.fileName);
          setActiveChatWorld(String(branched.chatMetadata?.world_info || ''));
          setActiveChatPortraitUrl(
            branched.chatMetadata?.scenario_portrait_url
              ? getAuthorizedAssetUrl(branched.chatMetadata.scenario_portrait_url)
              : null,
          );
          setCommittedChatCardId(targetCardId);
          setMessages((branched.messages || []).map(mapServerMsgToUi));
          setChatMetaStats({
            totalMessages: branched.totalMessages || 0,
            startIndex: branched.startIndex || 0,
            endIndex: branched.endIndex || 0,
            hasMoreOlder: Boolean(branched.hasMoreOlder),
            olderCount: branched.olderCount || 0,
            olderHistoryTokens: Number(branched.olderHistoryTokens || 0),
            olderHistoryRawTokens: Number(
              branched.olderHistoryRawTokens ?? branched.olderHistoryTokens ?? 0,
            ),
            hasUserMessages: Boolean(branched.hasUserMessages),
            userMessageCount: Number(branched.userMessageCount || 0),
            fileSize: branched.fileSize || 0,
            elapsedMs: branched.elapsedMs || 0,
            syncStatus: `Branched chat ${branched.fileName} (${branched.elapsedMs || 0} ms)`,
          });
          const nextHint = {
            chatPersonaAvatar: branched.chatPersonaAvatar || null,
            hasUserMessages: Boolean(branched.hasUserMessages),
            cardAvatar: targetCardId,
          };
          sessionPersonaHintRef.current = nextHint;
          syncSessionPersona(nextHint);
          recordSessionPointer(targetCardId, branched.fileName);
          pushToast({
            variant: 'success',
            icon: 'codeBranch',
            message: 'Branch created',
          });
        }
        await loadCardsAndPersonas();
      } catch (err) {
        pushToast({
          variant: 'error',
          message: err?.message || 'Failed to create chat branch',
        });
      } finally {
        setLoadingChat(false);
      }
    },
    [
      selectedCardId,
      loadingChat,
      mapServerMsgToUi,
      syncSessionPersona,
      recordSessionPointer,
      loadCardsAndPersonas,
      pushToast,
    ],
  );

  const handleDeleteChatsFromList = useCallback(
    async (fileNames) => {
      const list = Array.isArray(fileNames) ? fileNames.filter(Boolean) : [];
      if (list.length === 0 || !selectedCardId || isDemoCardId(selectedCardId)) {
        return;
      }
      try {
        await deleteCharacterChats(selectedCardId, list);
        const chatListRes = await fetchCharacterChats(selectedCardId, {
          offset: 0,
          limit: null,
        });
        const files = chatListRes?.chats || [];
        setChatFiles(files);
        setTimelineChats(files);
        setChatListMeta({
          totalChats: chatListRes?.totalChats ?? files.length,
          hasMore: Boolean(chatListRes?.hasMore),
          nextOffset: chatListRes?.nextOffset ?? files.length,
          loadingMore: false,
        });

        const rememberedForCard = lastChatsByAvatarRef.current?.[selectedCardId]?.file || '';
        if (rememberedForCard && list.includes(rememberedForCard)) {
          lastChatsByAvatarRef.current = clearCachedCharacterLastChat(selectedCardId);
        }

        if (list.includes(activeChatFile)) {
          if (files.length > 0) {
            const nextTarget =
              resolvePreferredCharacterChatFile(files, {
                rememberedFile: '',
                cardChat: activeCardFull?.chat || '',
              }) || files[0].fileName;
            // Opening the replacement chat records the new pointer itself.
            await openChatFileWindow(selectedCardId, nextTarget, { force: true });
          } else {
            loadedSessionRef.current = { cardId: selectedCardId, chatFile: '' };
            setActiveChatFile('');
            setMessages([]);
            setChatMetaStats((prev) => ({
              ...prev,
              totalMessages: 0,
              startIndex: 0,
              endIndex: 0,
              hasMoreOlder: false,
              olderCount: 0,
              olderHistoryTokens: 0,
            }));
            recordSessionPointer(selectedCardId, '', { clearCharacterChat: true });
          }
        }
        await loadCardsAndPersonas();
        pushToast({
          variant: 'info',
          icon: 'trash',
          message: `Deleted ${list.length} chat${list.length === 1 ? '' : 's'}`,
        });
      } catch (err) {
        pushToast({
          variant: 'error',
          message: err?.message || 'Failed to delete chats',
        });
      }
    },
    [
      selectedCardId,
      chatFiles.length,
      activeChatFile,
      openChatFileWindow,
      clearSessionPointer,
      loadCardsAndPersonas,
      pushToast,
    ],
  );

  const [chatBulkBusy, setChatBulkBusy] = useState(false);

  const handleExportAllCharacterChats = useCallback(async () => {
    if (!selectedCardId || isDemoCardId(selectedCardId) || chatBulkBusy) return;
    setChatBulkBusy(true);
    try {
      const exported = await downloadCharacterChatsZip(selectedCardId);
      pushToast({
        variant: 'success',
        icon: 'download',
        message: `Exported ${exported.count || 0} chat${exported.count === 1 ? '' : 's'} (${exported.fileName})`,
      });
    } catch (err) {
      pushToast({
        variant: 'error',
        message: `Export failed: ${err?.message || 'Unable to export chats'}`,
      });
    } finally {
      setChatBulkBusy(false);
    }
  }, [selectedCardId, chatBulkBusy, pushToast]);

  const handleImportCharacterChats = useCallback(
    async (pickedFiles) => {
      const filesArr = Array.from(pickedFiles || []);
      if (filesArr.length === 0 || !selectedCardId || isDemoCardId(selectedCardId) || chatBulkBusy) {
        return;
      }
      setChatBulkBusy(true);
      try {
        const items = [];
        for (const file of filesArr) {
          const contentBase64 = await readFileAsBase64(file);
          items.push({ fileName: file.name, contentBase64 });
        }

        const res = await importCharacterChats(selectedCardId, items);
        const files = Array.isArray(res?.chats) ? res.chats : [];
        setChatFiles(files);
        setTimelineChats(files);
        setChatListMeta({
          totalChats: res?.totalChats ?? files.length,
          hasMore: false,
          nextOffset: files.length,
          loadingMore: false,
        });

        const firstImported = res?.imported?.[0] || '';
        if (firstImported) {
          await openChatFileWindow(selectedCardId, firstImported, { force: true });
        }

        await loadCardsAndPersonas();
        const count = res?.count || res?.imported?.length || 0;
        const skippedNote =
          res?.skippedCount > 0 ? ` (${res.skippedCount} skipped)` : '';
        pushToast({
          variant: 'success',
          icon: 'upload',
          message: `Imported ${count} chat${count === 1 ? '' : 's'}${skippedNote}`,
        });
      } catch (err) {
        pushToast({
          variant: 'error',
          message: `Import failed: ${err?.message || 'Unable to import chat files'}`,
        });
      } finally {
        setChatBulkBusy(false);
      }
    },
    [
      selectedCardId,
      chatBulkBusy,
      openChatFileWindow,
      loadCardsAndPersonas,
      pushToast,
    ],
  );

  const handleDeleteAllCharacterChats = useCallback(
    async ({ deleteScenario = false } = {}) => {
      if (!selectedCardId || isDemoCardId(selectedCardId) || chatBulkBusy) return;
      if (deleteScenario) {
        const isGroup = groups.some((g) => g.id === selectedCardId);
        await handleDeleteCard(selectedCardId, { deleteChats: true, isGroup });
        return;
      }

      setChatBulkBusy(true);
      try {
        const res = await deleteAllCharacterChats(selectedCardId);
        setChatFiles([]);
        setTimelineChats([]);
        setChatListMeta({
          totalChats: 0,
          hasMore: false,
          nextOffset: 0,
          loadingMore: false,
        });
        setTimelinesOpen(false);
        lastChatsByAvatarRef.current = clearCachedCharacterLastChat(selectedCardId);
        loadedSessionRef.current = { cardId: selectedCardId, chatFile: '' };
        setActiveChatFile('');
        setMessages([]);
        recordSessionPointer(selectedCardId, '', { clearCharacterChat: true });

        await loadCardsAndPersonas();
        const deletedCount = res?.deletedCount ?? 0;
        pushToast({
          variant: 'info',
          icon: 'trash',
          message: `Deleted all ${deletedCount} chat${deletedCount === 1 ? '' : 's'}`,
        });
      } catch (err) {
        pushToast({
          variant: 'error',
          message: `Delete failed: ${err?.message || 'Unable to delete chats'}`,
        });
      } finally {
        setChatBulkBusy(false);
      }
    },
    [
      selectedCardId,
      chatBulkBusy,
      groups,
      handleDeleteCard,
      recordSessionPointer,
      loadCardsAndPersonas,
      pushToast,
    ],
  );

  const handleCreateNewChat = async (introOverride = null) => {
    if (!selectedCardId || isDemoCardId(selectedCardId) || loadingChat) return;
    const hasExplicitIntro =
      introOverride && typeof introOverride === 'object' && Number.isInteger(introOverride.index);
    const chosenIdx = hasExplicitIntro ? introOverride.index : activeIntroIdx;
    if (hasExplicitIntro) {
      setActiveIntroIdx(chosenIdx);
    }

    const allCardGreetings = activeCardFull
      ? [
          String(activeCardFull.first_mes ?? ''),
          ...(Array.isArray(activeCardFull.alternate_greetings)
            ? activeCardFull.alternate_greetings.map((g) => String(g ?? ''))
            : []),
        ]
      : [];
    const chosenText = hasExplicitIntro
      ? introOverride.text
      : allCardGreetings[chosenIdx] ?? null;
    const chosenMeta = activeCardFull?.scenarioMeta?.introsMeta?.[chosenIdx] || null;
    const chosenRawPortrait = hasExplicitIntro
      ? introOverride.rawPortraitUrl || chosenMeta?.rawPortraitUrl || null
      : chosenMeta?.rawPortraitUrl || null;

    setLoadingChat(true);
    try {
      const created = await createNewChat(selectedCardId, chosenIdx, {
        greetingText: chosenText,
        introPortraitUrl: chosenRawPortrait,
      });
      const chatListRes = await fetchCharacterChats(selectedCardId, {
        offset: 0,
        limit: null,
      });
      const files = chatListRes?.chats || [];
      setChatFiles(files);
      setTimelineChats(files);
      setChatListMeta({
        totalChats: chatListRes?.totalChats ?? files.length,
        hasMore: Boolean(chatListRes?.hasMore),
        nextOffset: chatListRes?.nextOffset ?? files.length,
        loadingMore: false,
      });
      if (created?.fileName) {
        loadedSessionRef.current = {
          cardId: selectedCardId,
          chatFile: created.fileName,
        };
        setActiveChatFile(created.fileName);
        setActiveChatPortraitUrl(
          created.chatMetadata?.scenario_portrait_url
            ? getAuthorizedAssetUrl(created.chatMetadata.scenario_portrait_url)
            : chosenRawPortrait
              ? getAuthorizedAssetUrl(chosenRawPortrait)
              : null,
        );
        setCommittedChatCardId(selectedCardId);
        setMessages((created.messages || []).map(mapServerMsgToUi));
        sessionPersonaHintRef.current = {
          chatPersonaAvatar: null,
          hasUserMessages: false,
          cardAvatar: selectedCardId,
          keepCurrentOnNewChat: true,
        };
        setChatMetaStats({
          totalMessages: created.totalMessages || 0,
          startIndex: created.startIndex || 0,
          endIndex: created.endIndex || 0,
          hasMoreOlder: false,
          olderCount: 0,
          olderHistoryTokens: 0,
          hasUserMessages: false,
          userMessageCount: 0,
          fileSize: created.fileSize || 0,
          elapsedMs: created.elapsedMs || 0,
          syncStatus: `Created new chat with Intro #${chosenIdx + 1} (${created.elapsedMs || 0} ms)`,
        });
        setChatListOpen(false);
        setTimelinesOpen(false);
        recordSessionPointer(selectedCardId, created.fileName);
        scrollToChatBottom();
      }
      await loadCardsAndPersonas();
    } finally {
      setLoadingChat(false);
    }
  };

  const handleSwipeMessage = async (mes, nextSwipeId) => {
    if (isGenerating) return;
    if (mes.swipes && !activeChatFile) {
      const count = mes.swipes.length;
      const clamped = Math.max(0, Math.min(nextSwipeId, count - 1));
      setSwipeIdx(clamped);
      return;
    }
    if (!selectedCardId || !activeChatFile || mes.index === undefined) return;
    const clampedTarget = Math.max(0, Math.min(nextSwipeId, (mes.swipeCount || 1) - 1));
    try {
      const res = await switchChatMessageSwipe(
        selectedCardId,
        activeChatFile,
        mes.index,
        clampedTarget,
        true,
      );
      if (res?.message) {
        const updatedUi = mapServerMsgToUi(res.message);
        setMessages((prev) =>
          prev.map((item) =>
            item.index === mes.index ? { ...updatedUi, id: item.id } : item,
          ),
        );
        if (mes.index === 0) {
          const introPortrait =
            activeCardFull?.scenarioMeta?.introsMeta?.[updatedUi.swipeId]?.portraitUrl || null;
          setActiveChatPortraitUrl(
            introPortrait ? getAuthorizedAssetUrl(introPortrait) : null,
          );
          updateChatMetadata(selectedCardId, activeChatFile, {
            scenario_portrait_url: introPortrait || null,
          }).catch(() => {});
        }
        setChatMetaStats((prev) => ({
          ...prev,
          elapsedMs: res.elapsedMs || 0,
          syncStatus: `Lazy Swipe #${updatedUi.swipeId + 1}/${updatedUi.swipeCount} (${res.elapsedMs || 0} ms)`,
        }));
      }
    } catch {
      // ignore
    }
  };

  const handleRemoveMessageAttachment = async (mesIndex, attIndex, msgObj) => {
    if (isGenerating || mesIndex === undefined || mesIndex === null) return;
    const currentAtts = Array.isArray(msgObj?.attachments) ? msgObj.attachments : [];
    const hasRemainingContent =
      Boolean(String(msgObj?.text || '').trim()) ||
      Boolean(String(msgObj?.reasoning || '').trim()) ||
      currentAtts.length > 1;

    const isRealCard = Boolean(selectedCardId && !isDemoCardId(selectedCardId) && activeChatFile);
    if (!isRealCard) {
      setMessages((prev) => {
        if (!hasRemainingContent) {
          return prev.filter((m, idx) => (m.index ?? idx) !== mesIndex);
        }
        return prev.map((m, idx) =>
          (m.index ?? idx) === mesIndex
            ? {
                ...m,
                attachments: (m.attachments || []).filter((_, i) => i !== attIndex),
              }
            : m,
        );
      });
      return;
    }

    if (!hasRemainingContent) {
      await handleDeleteMessage(mesIndex, false);
      return;
    }

    try {
      const res = await patchMessageInChat(selectedCardId, activeChatFile, mesIndex, {
        removeAttachmentIndex: attIndex,
      });
      if (res?.message) {
        const updatedUi = mapServerMsgToUi(res.message);
        setMessages((prev) =>
          prev.map((item) =>
            item.index === mesIndex ? { ...updatedUi, id: item.id } : item,
          ),
        );
        setChatMetaStats((prev) => ({
          ...prev,
          elapsedMs: res.elapsedMs || 0,
          syncStatus: `Removed attachment from msg #${mesIndex + 1} (${res.elapsedMs || 0} ms)`,
        }));
      }
    } catch (err) {
      pushComposerToast({
        variant: 'error',
        message: err?.message || 'Failed to remove attachment',
      });
    }
  };

  const handleSaveEditedMessage = async (
    mesIndex,
    newText,
    asNewSwipe = false,
    newReasoning,
  ) => {
    if (!selectedCardId || !activeChatFile || mesIndex === null) return false;
    try {
      const patch = asNewSwipe ? { addSwipeText: newText } : { mes: newText };
      if (newReasoning !== undefined) {
        patch.reasoning = newReasoning;
      }
      const res = await patchMessageInChat(
        selectedCardId,
        activeChatFile,
        mesIndex,
        patch,
      );
      if (res?.message) {
        const updatedUi = mapServerMsgToUi(res.message);
        setMessages((prev) =>
          prev.map((item) =>
            item.index === mesIndex ? { ...updatedUi, id: item.id } : item,
          ),
        );
        setEditingMsgIndex(null);
        setChatMetaStats((prev) => ({
          ...prev,
          elapsedMs: res.elapsedMs || 0,
          syncStatus: `Delta Sync saved msg #${mesIndex + 1}${res.backupFile ? ' + backup' : ''} (${res.elapsedMs || 0} ms)`,
        }));
        return true;
      }
      return false;
    } catch (err) {
      pushComposerToast({
        variant: 'error',
        message: err?.message || 'Failed to save message edit',
      });
      return false;
    }
  };

  const handleCreateBranchAtMessage = useCallback(
    async (mesIndex, options = {}) => {
      const { deferApply = false } = options || {};
      if (mesIndex === undefined || mesIndex === null || !selectedCardId) {
        return null;
      }

      // Demo card fallback: slice local messages up to mesIndex inclusive
      if (isDemoCardId(selectedCardId)) {
        const applyDemo = () => {
          setMessages((prev) =>
            prev.filter((m, idx) => (m.index !== undefined ? m.index : idx) <= mesIndex),
          );
        };
        if (!deferApply) applyDemo();
        return {
          fileName: 'Demo - Branch #1.jsonl',
          branchLabel: 'Branch #1',
          apply: applyDemo,
        };
      }

      try {
        let sourceFile = activeChatFile;
        if (!sourceFile) {
          const created = await createNewChat(selectedCardId, activeIntroIdx);
          sourceFile = created?.fileName || '';
        }
        if (!sourceFile) return null;

        const branched = await branchCharacterChat(selectedCardId, sourceFile, {
          upToMessageIndex: mesIndex,
        });
        if (!branched?.fileName) return null;

        const chatListRes = await fetchCharacterChats(selectedCardId, {
          offset: 0,
          limit: null,
        });
        const files = chatListRes?.chats || [];

        const targetCardId = selectedCardId;
        const applyBranchState = () => {
          loadedSessionRef.current = {
            cardId: targetCardId,
            chatFile: branched.fileName,
          };
          setActiveChatFile(branched.fileName);
          setActiveChatWorld(String(branched.chatMetadata?.world_info || ''));
          setActiveChatPortraitUrl(
            branched.chatMetadata?.scenario_portrait_url
              ? getAuthorizedAssetUrl(branched.chatMetadata.scenario_portrait_url)
              : null,
          );
          setCommittedChatCardId(targetCardId);
          setMessages((branched.messages || []).map(mapServerMsgToUi));
          setChatFiles(files);
          setTimelineChats(files);
          const nextHint = {
            chatPersonaAvatar: branched.chatPersonaAvatar || null,
            hasUserMessages: Boolean(branched.hasUserMessages),
            cardAvatar: targetCardId,
          };
          sessionPersonaHintRef.current = nextHint;
          syncSessionPersona(nextHint);
          recordSessionPointer(targetCardId, branched.fileName);
          setChatListMeta({
            totalChats: chatListRes?.totalChats ?? files.length,
            hasMore: Boolean(chatListRes?.hasMore),
            nextOffset: chatListRes?.nextOffset ?? files.length,
            loadingMore: false,
          });
          setChatMetaStats({
            totalMessages: branched.totalMessages || 0,
            startIndex: branched.startIndex || 0,
            endIndex: branched.endIndex || 0,
            hasMoreOlder: Boolean(branched.hasMoreOlder),
            olderCount: branched.olderCount || 0,
            olderHistoryTokens: Number(branched.olderHistoryTokens || 0),
            olderHistoryRawTokens: Number(
              branched.olderHistoryRawTokens ?? branched.olderHistoryTokens ?? 0,
            ),
            hasUserMessages: Boolean(branched.hasUserMessages),
            userMessageCount: Number(branched.userMessageCount || 0),
            fileSize: branched.fileSize || 0,
            elapsedMs: branched.elapsedMs || 0,
            syncStatus: `Created ${branched.fileName} up to msg #${mesIndex + 1} (${branched.elapsedMs || 0} ms)`,
          });
          loadCardsAndPersonas();
        };

        if (!deferApply) {
          applyBranchState();
        }

        return {
          fileName: branched.fileName,
          apply: applyBranchState,
        };
      } catch (err) {
        pushComposerToast({
          variant: 'error',
          message: err?.message || 'Failed to create chat branch',
        });
        return null;
      }
    },
    [
      selectedCardId,
      activeChatFile,
      activeIntroIdx,
      mapServerMsgToUi,
      syncSessionPersona,
      recordSessionPointer,
      loadCardsAndPersonas,
      pushComposerToast,
    ],
  );

  const handleDeleteMessage = async (mesIndex, truncateTail = false) => {
    if (!selectedCardId || !activeChatFile || mesIndex === undefined) return;
    try {
      const res = await deleteMessageFromChat(
        selectedCardId,
        activeChatFile,
        mesIndex,
        truncateTail,
      );
      if (res?.ok) {
        await openChatFileWindow(selectedCardId, activeChatFile, { force: true });
        setChatMetaStats((prev) => ({
          ...prev,
          syncStatus: truncateTail
            ? `Truncated branch from msg #${mesIndex + 1} (${res.deletedCount || 1} removed, backup saved)`
            : `Deleted msg #${mesIndex + 1} (backup saved)`,
        }));
      }
    } catch (err) {
      pushComposerToast({
        variant: 'error',
        message: err?.message || 'Failed to delete message',
      });
    }
  };

  const handleDeleteMessagesBatch = async (messageIndices = []) => {
    if (
      !selectedCardId ||
      !activeChatFile ||
      !Array.isArray(messageIndices) ||
      messageIndices.length === 0
    ) {
      return false;
    }
    try {
      const res = await deleteMessagesFromChat(
        selectedCardId,
        activeChatFile,
        messageIndices,
      );
      if (res?.ok) {
        await openChatFileWindow(selectedCardId, activeChatFile, { force: true });
        const removed = Number(res.deletedCount || messageIndices.length);
        setChatMetaStats((prev) => ({
          ...prev,
          syncStatus:
            removed === 1
              ? 'Deleted 1 message (backup saved)'
              : `Deleted ${removed} messages (backup saved)`,
        }));
        return true;
      }
      return false;
    } catch (err) {
      pushComposerToast({
        variant: 'error',
        message: err?.message || 'Failed to delete selected messages',
      });
      return false;
    }
  };

  const selectedCharacterObj =
    (selectedCardId && cards.find((c) => c.id === selectedCardId)) || cards[0] || null;
  const hasActiveScenario = Boolean(selectedCharacterObj && selectedCardId);
  const activeCharacter = selectedCharacterObj || EMPTY_CHARACTER_FALLBACK;

  // Committed character strictly matches the currently loaded `messages` array,
  // preventing the portrait or sender name from updating ahead of message history.
  const isSwitchingScenario = Boolean(
    hasActiveScenario && (loadingCardAndChats || committedChatCardId !== selectedCardId),
  );
  const committedCharacterObj =
    (committedChatCardId && cards.find((c) => c.id === committedChatCardId)) || null;
  const chatDisplayCharacter = isSwitchingScenario
    ? activeCharacter
    : committedCharacterObj || activeCharacter;

  const regexWorkspace = useRegexWorkspace({
    activeCardAvatar: hasActiveScenario ? activeCharacter.avatar || activeCharacter.id : '',
    hasActiveScenario,
    activePresetName: activePresets?.openai || 'Default',
    liveCardScripts: hasActiveScenario ? activeCardFull?.extensions?.regex_scripts ?? null : null,
    livePresetScripts: activeOpenaiDoc?.data?.extensions?.regex_scripts ?? null,
    onRefreshActiveCard: (updatedCard) => {
      if (updatedCard && updatedCard.avatar === selectedCardId) {
        setActiveCardFull(updatedCard);
        cleanCardObjRef.current = updatedCard;
        setCleanCardSnapshot(serializeCardEditableSnapshot(updatedCard));
      }
    },
    onRefreshActivePresetScripts: (presetName, nextScripts) => {
      setActiveOpenaiDoc((prev) => {
        if (!prev || (presetName && prev.name && prev.name !== presetName)) return prev;
        const nextDoc = {
          ...prev,
          data: {
            ...(prev.data || {}),
            extensions: {
              ...(prev.data?.extensions || {}),
              regex_scripts: nextScripts,
            },
          },
        };
        setCleanOpenaiSnapshot((prevSnap) => {
          if (!prevSnap) return prevSnap;
          try {
            const parsedSnap = JSON.parse(prevSnap);
            parsedSnap.data = {
              ...(parsedSnap.data || {}),
              extensions: {
                ...(parsedSnap.data?.extensions || {}),
                regex_scripts: nextScripts,
              },
            };
            return JSON.stringify(parsedSnap);
          } catch {
            return prevSnap;
          }
        });
        return nextDoc;
      });
    },
    onNotify: (message, tone = 'info') => pushToast({ variant: tone, message }),
  });

  const refusalCatcher = useRefusalCatcher({
    connections: apiHubState?.connections || [],
    activeConnectionId:
      apiHubState?.activeConnectionId || apiHubState?.activeProviderId || '',
    activeModelId: apiHubState?.activeModelId || '',
    onNotify: (message, tone = 'info') => pushToast({ variant: tone, message }),
  });

  const messageRecap = useMessageRecap({
    onNotify: (message, tone = 'info') => pushToast({ variant: tone, message }),
  });

  const stImporter = useStImporter({
    onImportCompleted: async () => {
      if (!onboardingDismissedRef.current) {
        onboardingDismissedRef.current = true;
        writeCachedOnboardingDismissed(true);
        queueSessionPatch({ onboardingDismissed: true });
      }
      await Promise.all([
        loadCardsAndPersonas(),
        regexWorkspace.syncWorkspace(),
        Promise.resolve(onRefreshStatus?.()),
      ]);
      if (selectedCardId && !isDemoCardId(selectedCardId)) {
        try {
          const chatListRes = await fetchCharacterChats(selectedCardId, {
            offset: 0,
            limit: null,
          });
          const files = chatListRes?.chats || [];
          setChatFiles(files);
          setTimelineChats(files);
          setChatListMeta({
            totalChats: chatListRes?.totalChats ?? files.length,
            hasMore: Boolean(chatListRes?.hasMore),
            nextOffset: chatListRes?.nextOffset ?? files.length,
            loadingMore: false,
          });
        } catch {
          // ignore if active card chats refresh fails
        }
      }
    },
    onNotify: (message, tone = 'info') => pushToast({ variant: tone, message }),
  });

  // Keep the committed character's `latestChatPreview` & `chatsCount` in `cards` synced live
  // ONLY when `committedChatCardId`, `selectedCardId`, `activeChatFile`, and `messages`
  // are 100% aligned — never allowing a previous character's message snippet to flash onto
  // a newly clicked character's horizontal row (`CharacterCardRow`) during transitions.
  useEffect(() => {
    if (
      !committedChatCardId ||
      committedChatCardId !== selectedCardId ||
      loadingCardAndChats ||
      loadingChat
    ) {
      return;
    }
    const sessionSnap = loadedSessionRef.current;
    if (
      !sessionSnap ||
      sessionSnap.cardId !== committedChatCardId ||
      (sessionSnap.chatFile || '') !== (activeChatFile || '')
    ) {
      return;
    }

    if (!activeChatFile) {
      if (chatFiles.length === 0 && !chatListMeta.hasMore) {
        setCards((prev) => {
          let changed = false;
          const next = prev.map((c) => {
            if (c.id !== committedChatCardId) return c;
            if (Number(c.chatsCount ?? 0) === 0 && !c.latestChatPreview) return c;
            changed = true;
            return {
              ...c,
              chatsCount: 0,
              latestChatPreview: '',
            };
          });
          return changed ? next : prev;
        });
      }
      return;
    }

    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    if (lastMsg?.isStreaming) return;
    let rawPreview = '';
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const cand = messages[i];
      if (!cand) continue;
      const cleaned = String(cand.text || '')
        .replace(
          /<(?:think|thinking|reasoning|thought)>[\s\S]*?<\/(?:think|thinking|reasoning|thought)>/gi,
          ' ',
        )
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned) {
        rawPreview = cleaned.slice(0, 220);
        break;
      }
    }
    if (!rawPreview && Array.isArray(lastMsg?.attachments) && lastMsg.attachments.length > 0) {
      rawPreview = '[Attachment]';
    }
    const liveChatsCount = Math.max(
      Number(chatListMeta.totalChats || 0),
      chatFiles.length,
      1,
    );

    setCards((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (c.id !== committedChatCardId) return c;
        const curCount = Number(c.chatsCount ?? 0);
        const nextPreview = rawPreview || c.latestChatPreview || '';
        const nextCount = chatListMeta.hasMore
          ? Math.max(curCount, liveChatsCount)
          : liveChatsCount;
        if (c.latestChatPreview === nextPreview && curCount === nextCount) {
          return c;
        }
        changed = true;
        return {
          ...c,
          chatsCount: nextCount,
          latestChatPreview: nextPreview,
        };
      });
      return changed ? next : prev;
    });
  }, [
    committedChatCardId,
    selectedCardId,
    loadingCardAndChats,
    loadingChat,
    activeChatFile,
    messages,
    chatFiles.length,
    chatListMeta.totalChats,
    chatListMeta.hasMore,
  ]);

  const {
    isGenerating,
    generationError,
    setGenerationError,
    dismissGenerationError,
    generationNotice,
    dismissGenerationNotice,
    stopGeneration: handleStopGeneration,
    startGenerationStream: runChatGenerationStream,
    retryLastGeneration: handleRetryGeneration,
  } = useChatStreaming({
    selectedCardId,
    activeChatFile,
    activeCharacterName: activeCharacter?.name || 'Character',
    activeCardFull,
    messages,
    activeOpenaiDoc,
    apiHubState,
    setApiHubState,
    setMessages,
    setChatMetaStats,
    setChatFiles: (files) => {
      setChatFiles(files);
      setTimelineChats(files);
    },
    mapServerMsgToUi,
    openChatFileWindow,
  });

  const retryGenRef = useRef(handleRetryGeneration);
  retryGenRef.current = handleRetryGeneration;

  // Route streaming / generation / reply errors into the M3 overlay directly above the composer
  useEffect(() => {
    if (!generationError) return;
    pushComposerToast({
      variant: 'error',
      message: generationError,
      actionLabel: 'Retry',
      actionIcon: 'refresh',
      onAction: () => retryGenRef.current?.(),
    });
    dismissGenerationError();
  }, [generationError, pushComposerToast, dismissGenerationError]);

  useEffect(() => {
    if (!generationNotice) return;
    pushComposerToast({
      variant: 'warning',
      icon: 'shieldAlert',
      message: generationNotice,
    });
    dismissGenerationNotice();
  }, [generationNotice, pushComposerToast, dismissGenerationNotice]);

  // Surface completed card, gallery, and preset events/errors as TopBar notifications
  useEffect(() => {
    const text = String(cardSaveStatus || '').trim();
    if (!text || text.endsWith('...')) return;
    const isErr = /^(error|upload error|switch failed|remove failed|unbind error|lore error)/i.test(text);
    pushToast({
      variant: isErr ? 'error' : 'success',
      message: text,
    });
  }, [cardSaveStatus, pushToast]);

  useEffect(() => {
    const text = String(galleryStatus || '').trim();
    if (!text || text.endsWith('...')) return;
    const isErr = /failed|error/i.test(text);
    pushToast({
      variant: isErr ? 'error' : 'success',
      message: text,
    });
  }, [galleryStatus, pushToast]);

  useEffect(() => {
    const text = String(presetStatusMsg || '').trim();
    if (!text || text.endsWith('...') || /^loaded\s+/i.test(text)) return;
    const isErr = /failed|^error:/i.test(text);
    pushToast({
      variant: isErr ? 'error' : 'success',
      message: text,
    });
  }, [presetStatusMsg, pushToast]);

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

  const handleGenerateSwipe = useCallback(
    async (mes) => {
      if (isGenerating || isSwitchingScenario || loadingChat || !mes) return;
      const isRealCard = Boolean(selectedCardId && !isDemoCardId(selectedCardId));

      if (mes.isUser) {
        await runChatGenerationStream({
          mode: 'reply',
          targetFile: activeChatFile,
        });
        return;
      }

      if (mes.index === 0) return;

      if (isRealCard && !activeChatFile) return;

      await runChatGenerationStream({
        mode: 'swipe',
        targetFile: activeChatFile,
        targetMessageIndex: mes.index,
      });
    },
    [
      isGenerating,
      isSwitchingScenario,
      loadingChat,
      selectedCardId,
      activeChatFile,
      runChatGenerationStream,
    ],
  );

  const handleContinueMessage = useCallback(
    async (mes) => {
      if (isGenerating || isSwitchingScenario || loadingChat || !mes || mes.isUser) return;
      const isRealCard = Boolean(selectedCardId && !isDemoCardId(selectedCardId));

      let targetFile = activeChatFile;
      if (isRealCard && !targetFile) {
        try {
          const created = await createNewChat(selectedCardId, activeIntroIdx);
          targetFile = created?.fileName || '';
          if (targetFile) {
            loadedSessionRef.current = { cardId: selectedCardId, chatFile: targetFile };
            setActiveChatFile(targetFile);
            setCommittedChatCardId(selectedCardId);
            recordSessionPointer(selectedCardId, targetFile);
          }
          if (created?.messages) {
            setMessages(created.messages.map(mapServerMsgToUi));
          }
        } catch (err) {
          setGenerationError(err?.message || 'Failed to create chat for continuation');
          return;
        }
      }

      await runChatGenerationStream({
        mode: 'continue',
        targetFile,
        targetMessageIndex: mes.index ?? 0,
      });
    },
    [
      isGenerating,
      isSwitchingScenario,
      loadingChat,
      selectedCardId,
      activeChatFile,
      activeIntroIdx,
      mapServerMsgToUi,
      recordSessionPointer,
      setGenerationError,
      runChatGenerationStream,
    ],
  );

  const handleDeleteSwipe = useCallback(
    async (mesIndex, swipeId) => {
      if (isGenerating || !selectedCardId || !activeChatFile) return;
      try {
        const res = await deleteSwipeFromMessage(
          selectedCardId,
          activeChatFile,
          mesIndex,
          swipeId,
        );
        if (res?.message) {
          const updatedUi = mapServerMsgToUi(res.message);
          setMessages((prev) =>
            prev.map((item) =>
              item.index === mesIndex ? { ...updatedUi, id: item.id } : item,
            ),
          );
          setChatMetaStats((prev) => ({
            ...prev,
            elapsedMs: res.elapsedMs || 0,
            syncStatus: `Deleted swipe — now #${updatedUi.swipeId + 1}/${updatedUi.swipeCount} (${res.elapsedMs || 0} ms)`,
          }));
        }
      } catch (err) {
        setGenerationError(err?.message || 'Failed to delete swipe');
      }
    },
    [isGenerating, selectedCardId, activeChatFile, mapServerMsgToUi, setGenerationError],
  );

  const handleSend = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (isGenerating || isSwitchingScenario || loadingChat) return;

    const clean = draftMsg.trim();
    const attachmentsSnapshot = [...pendingAttachments];
    const hasPayload = Boolean(clean || attachmentsSnapshot.length > 0);
    const isRealCard = Boolean(selectedCardId && !isDemoCardId(selectedCardId));

    if (clean) {
      setDraftMsg('');
    }
    if (attachmentsSnapshot.length > 0) {
      setPendingAttachments([]);
    }

    if (isRealCard) {
      try {
        let targetFile = activeChatFile;
        let createdFreshChat = false;
        if (!targetFile) {
          const created = await createNewChat(selectedCardId, activeIntroIdx);
          targetFile = created?.fileName || '';
          createdFreshChat = Boolean(targetFile);
          if (targetFile) {
            loadedSessionRef.current = {
              cardId: selectedCardId,
              chatFile: targetFile,
            };
            setActiveChatFile(targetFile);
            setCommittedChatCardId(selectedCardId);
            recordSessionPointer(selectedCardId, targetFile);
          }
          if (created?.messages) {
            setMessages(created.messages.map(mapServerMsgToUi));
          }
        }

        if (targetFile) {
          if (hasPayload) {
            let savedAttachments = [];
            if (attachmentsSnapshot.length > 0) {
              const serialized = await Promise.all(
                attachmentsSnapshot.map(async (att) => ({
                  name: att.name,
                  mimeType: att.mimeType,
                  size: att.size,
                  dataUrl: att.file ? await readFileAsBase64(att.file) : att.url || '',
                })),
              );
              const uploadRes = await uploadChatAttachments(selectedCardId, serialized);
              savedAttachments = Array.isArray(uploadRes?.attachments)
                ? uploadRes.attachments
                : [];
            }

            const appended = await appendMessageToChat(selectedCardId, targetFile, {
              name: personaName,
              is_user: true,
              mes: clean,
              force_avatar: activePersonaAvatar ? `User Avatars/${activePersonaAvatar}` : null,
              attachments: savedAttachments,
            });
            attachmentsSnapshot.forEach((item) => revokeAttachmentDraft(item));

            if (appended?.message) {
              const newUi = mapServerMsgToUi(appended.message);
              setMessages((prev) => [...prev, newUi]);
              sessionPersonaHintRef.current = {
                chatPersonaAvatar: activePersonaAvatar,
                hasUserMessages: true,
                cardAvatar: selectedCardId,
              };
              setChatMetaStats((prev) => ({
                ...prev,
                totalMessages: appended.totalMessages || prev.totalMessages + 1,
                endIndex: appended.totalMessages || prev.endIndex + 1,
                hasUserMessages: true,
                userMessageCount: (prev.userMessageCount || 0) + 1,
                elapsedMs: appended.elapsedMs || 0,
                syncStatus: `Delta Sync appended msg #${newUi.index + 1} (${appended.elapsedMs || 0} ms)`,
              }));
            }
          }

          if (hasPayload || createdFreshChat) {
            scrollToChatBottom();
          }
          await runChatGenerationStream({
            mode: 'reply',
            targetFile,
          });
          return;
        }
      } catch (err) {
        if (clean) setDraftMsg((prev) => prev || clean);
        if (attachmentsSnapshot.length > 0) {
          setPendingAttachments((prev) => [...attachmentsSnapshot, ...prev]);
        }
        setGenerationError(err?.message || 'Failed to append message before generation');
        return;
      }
    }

    // Demo card fallback (in-memory session + live API Hub streaming if configured)
    let nextDemoMessages = messages;
    if (hasPayload) {
      const demoAttachments = await Promise.all(
        attachmentsSnapshot.map(async (att) => {
          const dataUrl =
            att.kind === 'image' && att.file ? await readFileAsBase64(att.file) : att.url || '';
          return {
            ...att,
            url: dataUrl || att.url || '',
            stUrl: dataUrl || '',
          };
        }),
      );
      const userMsg = {
        id: `m-${Date.now()}`,
        index: messages.length,
        sender: personaName,
        name: personaName,
        isUser: true,
        is_user: true,
        time: 'Now',
        tokens: Math.max(8, Math.ceil(clean.length / 4)),
        text: clean,
        mes: clean,
        swipeId: 0,
        swipeCount: 1,
        attachments: demoAttachments,
      };
      nextDemoMessages = [...messages, userMsg];
      setMessages(nextDemoMessages);
      scrollToChatBottom();
    }
    await runChatGenerationStream({
      mode: 'reply',
      targetFile: '',
      overrideMessages: nextDemoMessages,
    });
  };

  const selectedModelLabel =
    apiHubState?.activeModelName && apiHubState.activeModelName !== 'Select Model'
      ? apiHubState.activeModelName
      : 'Add Connection';
  const activeHubConnObj =
    (apiHubState?.connections || []).find(
      (c) => c.id === (apiHubState?.activeConnectionId || apiHubState?.activeProviderId),
    ) || null;
  const activeHubModelObj =
    (activeHubConnObj?.models || []).find((m) => m.id === apiHubState?.activeModelId) || null;
  const activeModelMeta = activeHubConnObj
    ? {
        modelId: activeHubModelObj?.upstreamModelId || apiHubState?.activeModelId || '',
        modelName: activeHubModelObj?.name || apiHubState?.activeModelName || '',
        protocol: activeHubModelObj?.protocol || 'openai',
        routeId: activeHubModelObj?.routeId || activeHubConnObj.activeRouteId || '',
        connectionType: activeHubConnObj.type || '',
      }
    : null;
  const activePersonaObj =
    personas.find((p) => p.avatar === activePersonaAvatar) || null;
  const visibleUserMessageCount = useMemo(
    () => messages.reduce((acc, m) => (m?.isUser ? acc + 1 : acc), 0),
    [messages],
  );
  const effectiveUserMessageCount = chatMetaStats.hasMoreOlder
    ? Math.max(Number(chatMetaStats.userMessageCount || 0), visibleUserMessageCount)
    : visibleUserMessageCount;
  const effectiveHasUserMessages = effectiveUserMessageCount > 0;
  const activePromptRegexScripts = useMemo(() => {
    if (!regexWorkspace.masterEnabled) return [];
    return [
      ...(regexWorkspace.globalScripts || []),
      ...(regexWorkspace.presetScripts || []),
      ...(hasActiveScenario ? regexWorkspace.cardScripts || [] : []),
    ];
  }, [
    regexWorkspace.masterEnabled,
    regexWorkspace.globalScripts,
    regexWorkspace.presetScripts,
    regexWorkspace.cardScripts,
    hasActiveScenario,
  ]);

  const chatHistoryTokenBreakdown = useMemo(() => {
    const resolvedCharName = activeCardFull?.name || activeCharacter?.name || 'Character';
    const resolvedUserName = personaName || 'User';
    const nameCtx = { charName: resolvedCharName, userName: resolvedUserName };
    if (hasActiveScenario && committedChatCardId === selectedCardId) {
      const olderActive = chatMetaStats.hasMoreOlder
        ? Number(chatMetaStats.olderHistoryTokens || 0)
        : 0;
      const olderRaw = chatMetaStats.hasMoreOlder
        ? Number(chatMetaStats.olderHistoryRawTokens ?? olderActive)
        : 0;
      const visible = estimateHistorySliceTokenBreakdown(messages, nameCtx, {
        regexScripts: activePromptRegexScripts,
        recapConfig: messageRecap.config,
      });
      const activeTokens = olderActive + visible.activeTokens;
      const rawTokens = Math.max(activeTokens, olderRaw + visible.rawTokens);
      return {
        activeTokens,
        rawTokens,
        savedTokens: Math.max(0, rawTokens - activeTokens),
      };
    }
    if (hasActiveScenario && activeCardFull?.first_mes) {
      return estimateHistorySliceTokenBreakdown(
        [{ isUser: false, text: activeCardFull.first_mes }],
        nameCtx,
        {
          regexScripts: activePromptRegexScripts,
          recapConfig: messageRecap.config,
        },
      );
    }
    return { activeTokens: 0, rawTokens: 0, savedTokens: 0 };
  }, [
    hasActiveScenario,
    committedChatCardId,
    selectedCardId,
    chatMetaStats.hasMoreOlder,
    chatMetaStats.olderHistoryTokens,
    chatMetaStats.olderHistoryRawTokens,
    messages,
    activeCardFull?.name,
    activeCardFull?.first_mes,
    activeCharacter?.name,
    personaName,
    activePromptRegexScripts,
    messageRecap.config,
  ]);

  const recapPluginPromptTokens = useMemo(
    () =>
      estimateRecapInjectedPromptTokens(messageRecap.config, {
        charName: activeCardFull?.name || activeCharacter?.name || 'Character',
        userName: personaName || 'User',
      }),
    [messageRecap.config, activeCardFull?.name, activeCharacter?.name, personaName],
  );

  const promptTokenContext = useMemo(
    () => ({
      charName: activeCardFull?.name || activeCharacter?.name || 'Character',
      userName: personaName || 'User',
      charDescription: activeCardFull?.description || '',
      charPersonality: activeCardFull?.personality || '',
      scenario: activeCardFull?.scenario || '',
      mesExample: activeCardFull?.mes_example || '',
      personaDescription: activePersonaObj?.description || '',
      chatHistoryTokens: chatHistoryTokenBreakdown.activeTokens,
      chatHistoryRawTokens: chatHistoryTokenBreakdown.rawTokens,
      chatHistorySavedTokens: chatHistoryTokenBreakdown.savedTokens,
      pluginExtraPromptTokens: recapPluginPromptTokens,
    }),
    [
      activeCardFull?.name,
      activeCardFull?.description,
      activeCardFull?.personality,
      activeCardFull?.scenario,
      activeCardFull?.mes_example,
      activeCharacter?.name,
      personaName,
      activePersonaObj?.description,
      chatHistoryTokenBreakdown,
      recapPluginPromptTokens,
    ],
  );
  const matchedActiveCardFull =
    activeCardFull && activeCardFull.avatar === selectedCardId ? activeCardFull : null;
  const matchedCommittedCardFull =
    activeCardFull && activeCardFull.avatar === committedChatCardId ? activeCardFull : null;

  const activeScenarioAvatarUrl =
    (committedChatCardId === selectedCardId ? activeChatPortraitUrl : null) ||
    (messages.length === 1 &&
      messages[0]?.index === 0 &&
      matchedActiveCardFull?.scenarioMeta?.introsMeta?.[messages[0]?.swipeId || 0]?.portraitUrl) ||
    activeCharacter.thumbnailUrl ||
    activeCharacter.avatarUrl ||
    null;

  const chatScenarioAvatarUrl = isSwitchingScenario
    ? activeCharacter.thumbnailUrl || activeCharacter.avatarUrl || null
    : activeChatPortraitUrl ||
      (messages.length === 1 &&
        messages[0]?.index === 0 &&
        matchedCommittedCardFull?.scenarioMeta?.introsMeta?.[messages[0]?.swipeId || 0]
          ?.portraitUrl) ||
      chatDisplayCharacter.thumbnailUrl ||
      chatDisplayCharacter.avatarUrl ||
      null;
  const activePersonaAvatarUrl =
    activePersonaObj?.thumbnailUrl || activePersonaObj?.avatarUrl || null;
  const topBarParticipants = [
    ...(hasActiveScenario
      ? [
          {
            id: `scenario-${selectedCardId || 'active'}`,
            name: activeCharacter.name || 'Scenario',
            avatarUrl: activeScenarioAvatarUrl,
            initials: activeCharacter.initials || 'CH',
          },
        ]
      : []),
    {
      id: `persona-${activePersonaAvatar || personaName || 'user'}`,
      name: personaName || 'User',
      avatarUrl: activePersonaAvatarUrl,
      initials: String(personaName || 'ME').trim().slice(0, 2).toUpperCase() || 'ME',
    },
  ];

  const resolvedEditingPrompt = useMemo(
    () =>
      resolvePromptEditorTarget(
        activeOpenaiDoc?.orderedPrompts || [],
        editingPromptSelection,
        promptTokenContext,
      ),
    [activeOpenaiDoc?.orderedPrompts, editingPromptSelection, promptTokenContext],
  );

  useEffect(() => {
    if (!loadingPreset && activeOpenaiDoc && editingPromptSelection && !resolvedEditingPrompt) {
      setEditingPromptSelection(null);
    }
  }, [loadingPreset, activeOpenaiDoc, editingPromptSelection, resolvedEditingPrompt]);

  const handleChangeEditingPromptSelection = useCallback(
    (nextSelection, opts) => {
      const skip = Boolean(opts && typeof opts === 'object' && opts.skipGuard);
      const isSamePrompt =
        Boolean(nextSelection && editingPromptSelection) &&
        nextSelection.mode === editingPromptSelection.mode &&
        (nextSelection.mode === 'group'
          ? nextSelection.groupId === editingPromptSelection.groupId
          : nextSelection.identifier === editingPromptSelection.identifier);
      if (isSamePrompt) return;

      runWithWorkspaceUnsavedGuard(
        () => {
          if (nextSelection) {
            setChatListOpen(false);
            setTimelinesOpen(false);
            setSheetExpanded(false);
            setEditingIntroTarget(null);
            setCreateScenarioModalOpen(false);
            setPersonaModalOpen(false);
            if (isMobile) {
              setRightOpen(false);
            }
            setEditingPromptSelection(nextSelection);
          } else {
            setEditingPromptSelection(null);
            scrollToChatBottom();
          }
        },
        { skipGuard: skip },
      );
    },
    [editingPromptSelection, isMobile, scrollToChatBottom, runWithWorkspaceUnsavedGuard],
  );

  const resolvedEditingIntro = useMemo(
    () => resolveIntroEditorTargetData(matchedActiveCardFull, editingIntroTarget),
    [matchedActiveCardFull, editingIntroTarget],
  );

  useEffect(() => {
    if (editingIntroTarget && matchedActiveCardFull && !resolvedEditingIntro) {
      setEditingIntroTarget(null);
    }
  }, [editingIntroTarget, matchedActiveCardFull, resolvedEditingIntro]);

  const handleOpenIntroEditor = useCallback(
    (nextTarget, opts) => {
      const skip = Boolean(opts && typeof opts === 'object' && opts.skipGuard);
      const isSameIntro =
        Boolean(nextTarget && editingIntroTarget) &&
        nextTarget.cardId === editingIntroTarget.cardId &&
        nextTarget.kind === editingIntroTarget.kind &&
        nextTarget.index === editingIntroTarget.index;
      if (isSameIntro) return;

      const curKind = workspaceGuardBridgeRef.current.activeKind;
      const targetKind = nextTarget && sheetExpanded
        ? curKind === 'expandedCharacter'
          ? null
          : curKind
        : curKind;

      runWithWorkspaceUnsavedGuard(
        () => {
          if (nextTarget) {
            setChatListOpen(false);
            setTimelinesOpen(false);
            setEditingPromptSelection(null);
            setCreateScenarioModalOpen(false);
            setPersonaModalOpen(false);
            if (isMobile) {
              setRightOpen(false);
            }
            setEditingIntroTarget(nextTarget);
          } else {
            setEditingIntroTarget(null);
            if (!sheetExpanded) {
              scrollToChatBottom();
            }
          }
        },
        { skipGuard: skip, targetKind },
      );
    },
    [
      editingIntroTarget,
      sheetExpanded,
      isMobile,
      scrollToChatBottom,
      runWithWorkspaceUnsavedGuard,
    ],
  );

  const handleSaveEditedIntro = useCallback(
    ({ kind, index, title, text, rawPortraitUrl, portraitUrl }) => {
      if (!activeCardFull) return;
      if (kind === 'group') {
        const curGroup = Array.isArray(activeCardFull.group_only_greetings)
          ? activeCardFull.group_only_greetings.map((g) => String(g ?? ''))
          : [];
        const curMeta = padIntroMetaArray(
          activeCardFull.scenarioMeta?.groupIntrosMeta,
          curGroup.length,
        );
        const nextTexts = curGroup.map((t, i) => (i === index ? text : t));
        const nextMeta = curMeta.map((m, i) =>
          i === index ? { title, rawPortraitUrl, portraitUrl } : m,
        );
        handlePersistCardPatch({ group_only_greetings: nextTexts });
        handleUpdateActiveScenarioMeta({
          groupIntrosMeta: toServerIntroMetaPayload(nextMeta.slice(0, nextTexts.length)),
        });
        return;
      }

      const curStd = [
        String(activeCardFull.first_mes ?? ''),
        ...(Array.isArray(activeCardFull.alternate_greetings)
          ? activeCardFull.alternate_greetings.map((g) => String(g ?? ''))
          : []),
      ];
      const curMeta = padIntroMetaArray(
        activeCardFull.scenarioMeta?.introsMeta,
        curStd.length,
      );
      const nextTexts = curStd.map((t, i) => (i === index ? text : t));
      const safeTexts = nextTexts.length > 0 ? nextTexts : [''];
      const [nextFirst, ...nextAlts] = safeTexts;
      const nextMeta = curMeta.map((m, i) =>
        i === index ? { title, rawPortraitUrl, portraitUrl } : m,
      );
      handlePersistCardPatch({
        first_mes: nextFirst,
        alternate_greetings: nextAlts,
      });
      handleUpdateActiveScenarioMeta({
        introsMeta: toServerIntroMetaPayload(nextMeta.slice(0, safeTexts.length)),
      });
    },
    [activeCardFull, handlePersistCardPatch, handleUpdateActiveScenarioMeta],
  );

  const handleSaveEditedPromptInDoc = useCallback((updatedPrompt) => {
    setActiveOpenaiDoc((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        orderedPrompts: applyEditedPromptToOrdered(prev.orderedPrompts || [], updatedPrompt),
      };
    });
  }, []);

  const handleSaveEditedGroupInDoc = useCallback(
    (updatedGroup) => {
      setActiveOpenaiDoc((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          orderedPrompts: applyEditedGroupToOrdered(
            prev.orderedPrompts || [],
            updatedGroup,
            promptTokenContext,
          ),
        };
      });
    },
    [promptTokenContext],
  );

  const isActiveCardDirty = Boolean(
    activeCardFull &&
      cleanCardSnapshot &&
      serializeCardEditableSnapshot(activeCardFull) !== cleanCardSnapshot,
  );

  const handleCreateScenarioDirtyChange = useCallback((meta) => {
    setSheetDirtyMeta((prev) => ({
      ...prev,
      createScenario: { ...prev.createScenario, ...meta },
    }));
  }, []);

  const handlePersonaDirtyChange = useCallback((meta) => {
    setSheetDirtyMeta((prev) => ({
      ...prev,
      persona: { ...prev.persona, ...meta },
    }));
  }, []);

  const handlePromptDirtyChange = useCallback((meta) => {
    setSheetDirtyMeta((prev) => ({
      ...prev,
      prompt: { ...prev.prompt, ...meta },
    }));
  }, []);

  const handleIntroDirtyChange = useCallback((meta) => {
    setSheetDirtyMeta((prev) => ({
      ...prev,
      intro: { ...prev.intro, ...meta },
    }));
  }, []);

  const activeWorkspaceSheetKind = useMemo(() => {
    if (viewMode === 'sandbox') return null;
    if (createScenarioModalOpen) return 'createScenario';
    if (personaModalOpen) return 'persona';
    if (resolvedEditingPrompt) return 'prompt';
    if (resolvedEditingIntro && matchedActiveCardFull) return 'intro';
    if (sheetExpanded && (matchedActiveCardFull || hasActiveScenario)) return 'expandedCharacter';
    return null;
  }, [
    viewMode,
    createScenarioModalOpen,
    personaModalOpen,
    resolvedEditingPrompt,
    resolvedEditingIntro,
    matchedActiveCardFull,
    sheetExpanded,
    hasActiveScenario,
  ]);

  const getWorkspaceDirtyDescriptor = useCallback(
    (targetKind = activeWorkspaceSheetKind) => {
      if (!targetKind) return null;
      if (targetKind === 'createScenario') {
        const m = sheetDirtyMeta.createScenario;
        if (!m.isDirty) return null;
        return {
          kind: 'createScenario',
          subtitle: m.subtitle || 'Create New Scenario',
          itemName: m.itemName || 'New Scenario',
          saveLabel: m.saveLabel || 'Create & Close',
          canSave: Boolean(m.canSave),
          cannotSaveReason: m.cannotSaveReason || '',
          save: async () => (await createScenarioSheetRef.current?.save?.()) !== false,
          discard: () => createScenarioSheetRef.current?.discard?.(),
        };
      }
      if (targetKind === 'persona') {
        const m = sheetDirtyMeta.persona;
        if (!m.isDirty) return null;
        return {
          kind: 'persona',
          subtitle: m.subtitle || 'Persona Workspace',
          itemName: m.itemName || 'Persona',
          saveLabel: m.saveLabel || 'Save & Close',
          canSave: Boolean(m.canSave),
          cannotSaveReason: m.cannotSaveReason || '',
          save: async () => (await personaSheetRef.current?.save?.()) !== false,
          discard: () => personaSheetRef.current?.discard?.(),
        };
      }
      if (targetKind === 'prompt') {
        const m = sheetDirtyMeta.prompt;
        if (!m.isDirty) return null;
        return {
          kind: 'prompt',
          subtitle: m.subtitle || 'Prompt Editor',
          itemName: m.itemName || 'Prompt',
          saveLabel: 'Save & Close',
          canSave: Boolean(m.canSave),
          cannotSaveReason: m.cannotSaveReason || '',
          save: async () => (await promptEditorSheetRef.current?.save?.()) !== false,
          discard: () => promptEditorSheetRef.current?.discard?.(),
        };
      }
      if (targetKind === 'intro') {
        const m = sheetDirtyMeta.intro;
        if (!m.isDirty) return null;
        return {
          kind: 'intro',
          subtitle: m.subtitle || 'Greeting Editor',
          itemName: m.itemName || 'Greeting',
          saveLabel: 'Save & Close',
          canSave: Boolean(m.canSave),
          cannotSaveReason: m.cannotSaveReason || '',
          save: async () => (await introEditorSheetRef.current?.save?.()) !== false,
          discard: () => introEditorSheetRef.current?.discard?.(),
        };
      }
      if (targetKind === 'expandedCharacter') {
        if (!isActiveCardDirty) return null;
        const canSaveCard = Boolean(
          activeCardFull && String(activeCardFull.name || '').trim() && !cardSaving,
        );
        return {
          kind: 'expandedCharacter',
          subtitle: 'Selected Scenario Workspace',
          itemName: String(activeCardFull?.name || activeCharacter?.name || 'Scenario').trim(),
          saveLabel: 'Save & Close',
          canSave: canSaveCard,
          cannotSaveReason: !String(activeCardFull?.name || '').trim()
            ? 'Scenario name cannot be empty.'
            : '',
          save: async () => (await handleSaveCardToPng()) !== false,
          discard: () => handleDiscardCardChanges(),
        };
      }
      return null;
    },
    [
      activeWorkspaceSheetKind,
      sheetDirtyMeta,
      isActiveCardDirty,
      activeCardFull,
      activeCharacter?.name,
      cardSaving,
      handleDiscardCardChanges,
    ],
  );

  workspaceGuardBridgeRef.current = {
    activeKind: activeWorkspaceSheetKind,
    isCardDirty: isActiveCardDirty,
    runGuard: (proceedAction, { skipGuard = false, targetKind } = {}) => {
      if (skipGuard) {
        proceedAction?.();
        return;
      }
      const dirtyDesc = getWorkspaceDirtyDescriptor(
        targetKind !== undefined ? targetKind : activeWorkspaceSheetKind,
      );
      if (!dirtyDesc) {
        proceedAction?.();
        return;
      }
      workspaceGuardActionRef.current = {
        descriptor: dirtyDesc,
        proceed: proceedAction,
      };
      setWorkspaceUnsavedGuard({
        kind: dirtyDesc.kind,
        subtitle: dirtyDesc.subtitle,
        itemName: dirtyDesc.itemName,
        saveLabel: dirtyDesc.saveLabel,
        canSave: dirtyDesc.canSave,
        cannotSaveReason: dirtyDesc.cannotSaveReason,
        busy: false,
      });
    },
  };

  const performCloseActiveWorkspaceSheet = useCallback(() => {
    if (createScenarioModalOpen) {
      setCreateScenarioModalOpen(false);
      scrollToChatBottom();
      return;
    }
    if (personaModalOpen) {
      setPersonaModalOpen(false);
      scrollToChatBottom();
      return;
    }
    if (resolvedEditingPrompt) {
      setEditingPromptSelection(null);
      scrollToChatBottom();
      return;
    }
    if (resolvedEditingIntro) {
      setEditingIntroTarget(null);
      if (!sheetExpanded) {
        scrollToChatBottom();
      }
      return;
    }
    if (sheetExpanded) {
      setSheetExpanded(false);
      setRightTab('selected');
      scrollToChatBottom();
    }
  }, [
    createScenarioModalOpen,
    personaModalOpen,
    resolvedEditingPrompt,
    resolvedEditingIntro,
    sheetExpanded,
    scrollToChatBottom,
  ]);

  const requestCloseActiveWorkspaceSheet = useCallback(
    (opts) => {
      const skip = Boolean(opts && typeof opts === 'object' && opts.skipGuard);
      runWithWorkspaceUnsavedGuard(performCloseActiveWorkspaceSheet, { skipGuard: skip });
    },
    [runWithWorkspaceUnsavedGuard, performCloseActiveWorkspaceSheet],
  );

  useEffect(() => {
    if (!activeWorkspaceSheetKind || workspaceUnsavedGuard) return undefined;

    let pressOutside = false;

    const handleDocPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) {
        pressOutside = false;
        return;
      }
      pressOutside = !isWorkspaceSheetExemptClickTarget(
        e.target,
        centerSheetSurfaceRef.current,
        activeWorkspaceSheetKind,
      );
    };

    const handleDocClick = (e) => {
      if (!pressOutside) return;
      pressOutside = false;
      if (
        isWorkspaceSheetExemptClickTarget(
          e.target,
          centerSheetSurfaceRef.current,
          activeWorkspaceSheetKind,
        )
      ) {
        return;
      }
      requestCloseActiveWorkspaceSheet();
    };

    const handleDocKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (hasOpenTopLayerOverlay()) return;
      e.stopPropagation();
      requestCloseActiveWorkspaceSheet();
    };

    document.addEventListener('pointerdown', handleDocPointerDown, true);
    document.addEventListener('click', handleDocClick, true);
    window.addEventListener('keydown', handleDocKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleDocPointerDown, true);
      document.removeEventListener('click', handleDocClick, true);
      window.removeEventListener('keydown', handleDocKeyDown);
    };
  }, [activeWorkspaceSheetKind, workspaceUnsavedGuard, requestCloseActiveWorkspaceSheet]);

  const characterSheetSharedProps = {
    card: matchedActiveCardFull,
    loading: Boolean(hasActiveScenario && !matchedActiveCardFull),
    cleanSnapshot: cleanCardSnapshot,
    activeIntroIdx,
    onChangeIntroIdx: setActiveIntroIdx,
    editingIntroTarget,
    onOpenIntroEditor: handleOpenIntroEditor,
    activeTab: activeSheetTab,
    onChangeTab: setActiveSheetTab,
    saving: cardSaving,
    busyPortrait,
    statusMsg: cardSaveStatus,
    onChangeCardField: (patch) =>
      setActiveCardFull((prev) => (prev ? { ...prev, ...patch } : prev)),
    onPersistCardPatch: handlePersistCardPatch,
    onSaveCard: handleSaveCardToPng,
    onDiscardChanges: handleDiscardCardChanges,
    onToggleSpoilerBlur: handleToggleSpoilerBlur,
    onTogglePin: () => {
      if (!activeCardFull) return;
      const nextFav = !Boolean(activeCardFull.fav || activeCardFull.pinned);
      setActiveCardFull((prev) =>
        prev ? { ...prev, fav: nextFav, pinned: nextFav } : prev,
      );
      if (cleanCardObjRef.current?.avatar === activeCardFull.avatar) {
        cleanCardObjRef.current = {
          ...cleanCardObjRef.current,
          fav: nextFav,
          pinned: nextFav,
        };
        setCleanCardSnapshot(
          serializeCardEditableSnapshot(cleanCardObjRef.current),
        );
      }
      handleGalleryTogglePin(activeCardFull.avatar || activeCardFull.id, nextFav);
    },
    onOpenAdvanced: () => {
      const guardKind =
        activeWorkspaceSheetKind && activeWorkspaceSheetKind !== 'expandedCharacter'
          ? activeWorkspaceSheetKind
          : null;
      runWithWorkspaceUnsavedGuard(
        () => {
          setTimelinesOpen(false);
          setEditingPromptSelection(null);
          setEditingIntroTarget(null);
          setCreateScenarioModalOpen(false);
          setPersonaModalOpen(false);
          setSheetExpanded(true);
          setRightOpen(true);
          setRightTab('selected');
        },
        { targetKind: guardKind },
      );
    },
    onToggleExpand: () => {
      if (sheetExpanded) {
        runWithWorkspaceUnsavedGuard(
          () => {
            setSheetExpanded(false);
            setRightTab('selected');
            scrollToChatBottom();
          },
          { targetKind: 'expandedCharacter' },
        );
        return;
      }
      const guardKind =
        activeWorkspaceSheetKind && activeWorkspaceSheetKind !== 'expandedCharacter'
          ? activeWorkspaceSheetKind
          : null;
      runWithWorkspaceUnsavedGuard(
        () => {
          setTimelinesOpen(false);
          setEditingPromptSelection(null);
          setEditingIntroTarget(null);
          setCreateScenarioModalOpen(false);
          setPersonaModalOpen(false);
          if (!isMobile) {
            setRightOpen(true);
          }
          setRightTab('selected');
          setSheetExpanded(true);
        },
        { targetKind: guardKind },
      );
    },
    onStartNewChat: handleCreateNewChat,
    onPickMainPortraitFile: handlePickMainPortraitFile,
    onUploadGalleryPortraits: handleUploadGalleryPortraits,
    onSelectGalleryPortrait: handleSelectGalleryPortrait,
    onDeleteGalleryPortrait: handleDeleteGalleryPortrait,
    onUploadIntroPortrait: handleUploadIntroPortrait,
    onPickReplaceCardFile: handlePickReplaceCardFile,
    onExportCard: (fmt) =>
      handleExportCard(activeCardFull?.avatar || selectedCardId, fmt),
    onDuplicateCard: () =>
      handleDuplicateCard(activeCardFull?.avatar || selectedCardId),
    onConvertToPersona: handleConvertActiveCardToPersona,
    onRefreshChatPortraits: handleRefreshChatPortraits,
    onDeleteCard: () => {
      if (!activeCardFull) return;
      setDeleteDialog({
        kind: 'card',
        id: activeCardFull.avatar || activeCardFull.id,
        name: activeCardFull.name || activeCardFull.avatar,
        deleteChats: true,
      });
    },
    linksProps: {
      allTags: tags,
      personas,
      worlds,
      themePresets: M3_PRESET_SEEDS,
      activeChatFile,
      activeChatWorld,
      busyAction: busyLinksAction,
      onAssignTag: handleAssignTagOnActiveCard,
      onRemoveTag: handleRemoveTagOnActiveCard,
      onCreateAndAssignTag: handleCreateAndAssignTagOnActiveCard,
      onImportEmbeddedTags: handleImportEmbeddedTagsOnActiveCard,
      onBindPersona: handleBindPersonaToActiveCard,
      onUnbindPersona: handleUnbindPersonaFromActiveCard,
      onUnbindAllPersonas: handleUnbindAllPersonasFromActiveCard,
      onSelectActivePersona: handleSelectPersona,
      openaiPresets,
      starredPresets: presetCategoryMeta.openai?.starred || starredPresets,
      onToggleStarPreset: (val) => handlePresetMetaPatch('openai', { toggleStar: val }),
      activePresetName: activePresets?.openai || '',
      boundPresetName: resolveCharacterBoundPreset(
        presetCategoryMeta.openai?.characterBindings,
        activeCardFull?.avatar || selectedCardId,
      ),
      onBindPreset: (presetName) =>
        handleBindPresetToCharacter(
          activeCardFull?.avatar || selectedCardId,
          presetName,
          'openai',
        ),
      onUnbindPreset: () =>
        handleBindPresetToCharacter(
          activeCardFull?.avatar || selectedCardId,
          null,
          'openai',
        ),
      onActivatePreset: (presetName) => handleSelectPreset('openai', presetName),
      onOpenPresetInspector: () => setRightTab('aiconfig'),
      onChangePrimaryWorld: handleChangePrimaryWorld,
      onAddAuxWorld: (wName) => {
        const cur = Array.isArray(activeCardFull?.auxWorlds)
          ? activeCardFull.auxWorlds
          : [];
        if (!cur.includes(wName)) handleUpdateAuxWorlds([...cur, wName]);
      },
      onRemoveAuxWorld: (wName) => {
        const cur = Array.isArray(activeCardFull?.auxWorlds)
          ? activeCardFull.auxWorlds
          : [];
        handleUpdateAuxWorlds(cur.filter((x) => x !== wName));
      },
      onImportEmbeddedLore: handleImportEmbeddedLoreOnActiveCard,
      onChangeChatWorld: handleChangeActiveChatWorld,
      onUpdateScenarioMeta: handleUpdateActiveScenarioMeta,
    },
  };

  return (
    <div className="bb-app-shell">
      {/* 1. LEFT TOME (Characters, Chats, Journal, Settings) — Full Height Left Side */}
      {leftOpen && (
        <aside
          id="left-nav-panel"
          className={`bb-tome bb-tome--left ${idleFade ? 'bb-tome--idle-fade' : ''}`}
          style={{ width: effectiveLeftWidth }}
        >
          <BookmarkRibbons
            tabs={LEFT_TABS}
            activeId={leftTab}
            onChange={setLeftTab}
          />

          <OverlayScrollArea
            className="bb-tome__body-wrap"
            viewportClassName="bb-tome__body"
            disabled={leftTab === 'characters' || leftTab === 'chats'}
          >
            {leftTab === 'characters' && (
              <CharacterTome
                pinnedLayout={pinnedLayout}
                cards={cards}
                groups={groups}
                tags={tags}
                gallery={gallery}
                selectedCardId={selectedCardId}
                hiddenTagIds={hiddenTagIds}
                multiSelectActive={multiSelectActive}
                multiSelectedIds={multiSelectedIds}
                onToggleMultiSelect={handleToggleMultiSelectCard}
                onToggleMultiSelectMode={handleToggleMultiSelectMode}
                onSelectAllResults={handleSelectAllResults}
                onClearMultiSelect={handleClearMultiSelect}
                onExitMultiSelect={handleExitMultiSelect}
                totalSelectableCount={visibleSelectableIds.length}
                allResultsSelected={allResultsSelected}
                multiSelectActions={multiSelectActions}
                multiSelectActiveActionId={multiSelectSubpopover}
                multiSelectPopover={multiSelectPopover}
                onSelect={handleSelectCard}
                onOpen={handleGalleryOpenCard}
                onTogglePin={handleGalleryTogglePin}
                onToggleTagHidden={handleToggleTagHidden}
                onCreateTag={handleCreateTag}
                onOpenCreateModal={handleOpenCreateScenarioModal}
                onDropImportFiles={(files) =>
                  handleImportScenarioFiles(files, { importEmbeddedTags: true })
                }
                kebabItemsFor={kebabItemsForCard}
                kebabItemsForFolder={kebabItemsForPinnedFolder}
                kebabItemsForTagFolder={kebabItemsForTagFolder}
                userName={personaName}
                loading={loadingCards || creatingScenario}
                splitRatio={charSplitRatio}
                onSplitRatioChange={setCharSplitRatio}
              />
            )}

            {leftTab === 'chats' && (
              <ChatsTomePanel
                isDemoCard={!hasActiveScenario || isDemoCardId(selectedCardId)}
                chatFiles={
                  committedChatCardId === selectedCardId || !loadingCardAndChats
                    ? timelineChats.length > 0
                      ? timelineChats
                      : chatFiles
                    : []
                }
                activeChatFile={committedChatCardId === selectedCardId ? activeChatFile : ''}
                focusedTreeFile={focusedTimelineNodeFile}
                characterName={activeCharacter.name}
                characterAvatarUrl={activeScenarioAvatarUrl}
                characterInitials={activeCharacter.initials || 'CH'}
                personaName={activePersonaObj?.name || personaName}
                personaAvatarUrl={activePersonaAvatarUrl}
                loadingChat={loadingChat}
                loadingList={loadingCardAndChats}
                timelinesOpen={timelinesOpen}
                onToggleTimelines={handleToggleTimelines}
                onFocusNodeOnTree={handleFocusNodeOnTree}
                onCreateNewChat={handleCreateNewChat}
                onSelectChatFile={handleSelectChatFromList}
                onBranchChatFile={handleBranchChatFromList}
                onDeleteChatFiles={handleDeleteChatsFromList}
                onImportChats={handleImportCharacterChats}
                onExportAllChats={handleExportAllCharacterChats}
                onDeleteAllChats={handleDeleteAllCharacterChats}
                busyBulkAction={chatBulkBusy}
              />
            )}

            {leftTab === 'worldinfo' && (
              <FolderCard
                title="Journal & Lorebooks"
                subtitle="World Info & Author's Notes"
                icon="bookAtlas"
              >
                <div className="bb-caption-text">
                  World Info &amp; Lorebooks module will be connected in Stage 4.
                </div>
              </FolderCard>
            )}

            {leftTab === 'usersettings' && (
                  <>
                    <FolderCard
                      title="Color Theme & Mode"
                      subtitle="NexusTavern palette engine"
                      icon="palette"
                    >
                      <SegmentedGroup
                        fullWidth
                        value={themeMode}
                        onChange={setThemeMode}
                        options={[
                          { value: 'dark', label: 'Dark Mode' },
                          { value: 'light', label: 'Light Mode' },
                        ]}
                      />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {M3_PRESET_SEEDS.map((seed) => (
                          <Button
                            key={seed.id}
                            variant="b1"
                            size="sm"
                            emphasis={activeSeed.id === seed.id ? 'filled' : 'outlined'}
                            onClick={() => setActiveSeed(seed)}
                          >
                            {seed.name.split(' (')[0]}
                          </Button>
                        ))}
                      </div>
                    </FolderCard>

                    <FolderCard
                      title="Last Message Shader"
                      subtitle="Both shader variants available"
                      icon="sparkles"
                      defaultOpen={false}
                    >
                      <SegmentedGroup
                        fullWidth
                        value={shaderStyle}
                        onChange={setShaderStyle}
                        options={[
                          { value: 'caustics', label: 'Chaotic Flow' },
                          { value: 'nacre', label: 'Pearl Nacre' },
                        ]}
                      />
                      <Slider
                        label="Shader Intensity"
                        value={Math.round(shaderIntensity * 100)}
                        min={15}
                        max={100}
                        step={5}
                        defaultValue={38}
                        unit="%"
                        onChange={(v) => setShaderIntensity(v / 100)}
                      />
                      <Switch
                        checked={lowGpu}
                        onChange={setLowGpu}
                        label="Low-GPU Mode"
                        description="Replace WebGL shader with static gradient"
                      />
                      <Switch
                        checked={idleFade}
                        onChange={setIdleFade}
                        label="Tome Idle Translucency"
                        description="Dim side tomes when cursor is in chat"
                      />
                    </FolderCard>
                  </>
                )}
          </OverlayScrollArea>

          <TomeResizeCurtain
            side="left"
            width={effectiveLeftWidth}
            minWidth={MIN_TOME_WIDTH}
            maxWidth={maxTomeWidth}
            defaultWidth={DEFAULT_TOME_WIDTH}
            onChangeWidth={setLeftWidth}
          />
        </aside>
      )}

      {/* 2. CENTER COLUMN (TopBar at top between Tomes + Central Chat Stage / Sandbox) */}
      <main className="bb-center-column">
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
            (committedChatCardId === selectedCardId ? activeChatFile : '') ||
            (hasActiveScenario ? activeCharacter.name : 'NexusTavern')
          }
          participants={topBarParticipants}
          chatListOpen={false}
          onToggleChatList={handleToggleChatList}
          timelinesOpen={timelinesOpen}
          onToggleTimelines={handleToggleTimelines}
          sheetExpanded={sheetExpanded}
          promptEditorOpen={Boolean(resolvedEditingPrompt)}
          workspaceSheetOpen={Boolean(
            resolvedEditingIntro || createScenarioModalOpen || personaModalOpen,
          )}
          onBackToChat={handleBackToChat}
          qrModalOpen={qrModalOpen}
          tunnelActive={Boolean(serverStatus?.tunnel?.active)}
          onClickQrButton={() => setQrModalOpen(true)}
          showQrButton={false}
          isDemoCard={!hasActiveScenario || isDemoCardId(selectedCardId)}
          loadingChat={loadingChat}
          onCreateNewChat={handleCreateNewChat}
        />

        {viewMode !== 'sandbox' && (
          <ToastStack toasts={toasts} onDismiss={dismissToast} />
        )}

        {viewMode === 'sandbox' ? (
          <OverlayScrollArea
            className="bb-sandbox-scroll-wrap"
            viewportClassName="bb-sandbox-scroll"
          >
            <div style={{ maxWidth: 1120, margin: '0 auto' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 14px',
                  marginBottom: 12,
                  borderRadius: 10,
                  background: 'var(--bb-m3-surface-container-high, rgba(28, 25, 21, 0.85))',
                  border: '1px solid var(--bb-m3-outline-variant, rgba(125, 113, 98, 0.28))',
                }}
              >
                <span className="bb-caption-text">
                  <strong>NexusTavern UI Kit &amp; Token Sandbox</strong> — Shortcut:{' '}
                  <code style={{ fontFamily: 'var(--bb-font-mono)' }}>Ctrl+Shift+U</code>
                </span>
                <Button
                  variant="b1"
                  size="sm"
                  emphasis="filled"
                  icon="close"
                  onClick={() => setViewMode('tavern')}
                >
                  Return to Tavern (Ctrl+Shift+U)
                </Button>
              </div>
              <TokenSandbox />
            </div>
          </OverlayScrollArea>
        ) : createScenarioModalOpen ? (
          <section className="bb-center-column__sheet" aria-label="Create scenario workspace">
            <div ref={centerSheetSurfaceRef} className="bb-center-column__sheet-surface">
              <CreateScenarioSheet
                ref={createScenarioSheetRef}
                initialMode={createScenarioModalMode}
                availableTags={tags}
                submitting={creatingScenario}
                statusMsg={createScenarioStatus}
                onClose={requestCloseActiveWorkspaceSheet}
                onCreateScenario={handleCreateScenario}
                onImportScenarioFiles={handleImportScenarioFiles}
                onDirtyChange={handleCreateScenarioDirtyChange}
              />
            </div>
          </section>
        ) : personaModalOpen ? (
          <section className="bb-center-column__sheet" aria-label="Persona workspace">
            <div ref={centerSheetSurfaceRef} className="bb-center-column__sheet-surface">
              <PersonaSheet
                ref={personaSheetRef}
                initialMode={personaModalMode}
                initialTargetAvatar={personaModalTargetAvatar}
                personas={personas}
                activePersonaAvatar={activePersonaAvatar}
                cards={cards}
                groups={groups}
                activeCharacter={activeCharacter}
                hasUserMessages={effectiveHasUserMessages}
                userMessageCount={effectiveUserMessageCount}
                onClose={requestCloseActiveWorkspaceSheet}
                onCreatePersona={handleCreatePersona}
                onSavePersona={handleSavePersonaById}
                onUploadPersonaAvatar={handleUploadPersonaAvatar}
                onDuplicatePersona={handleDuplicatePersona}
                onDeletePersona={handleDeletePersona}
                onSelectPersonaInChat={handleSelectPersona}
                onConfirmReplacePersonaInChat={handleConfirmReplacePersonaInChat}
                onDirtyChange={handlePersonaDirtyChange}
              />
            </div>
          </section>
        ) : resolvedEditingPrompt ? (
          <section className="bb-center-column__sheet" aria-label="Prompt editor workspace">
            <div ref={centerSheetSurfaceRef} className="bb-center-column__sheet-surface">
              <PromptEditorSheet
                ref={promptEditorSheetRef}
                mode={resolvedEditingPrompt.mode}
                target={resolvedEditingPrompt.target}
                isInherited={resolvedEditingPrompt.isInherited}
                onClose={requestCloseActiveWorkspaceSheet}
                onSavePrompt={handleSaveEditedPromptInDoc}
                onSaveGroup={handleSaveEditedGroupInDoc}
                onDirtyChange={handlePromptDirtyChange}
              />
            </div>
          </section>
        ) : resolvedEditingIntro && matchedActiveCardFull ? (
          <section className="bb-center-column__sheet" aria-label="Greeting editor workspace">
            <div ref={centerSheetSurfaceRef} className="bb-center-column__sheet-surface">
              <IntroEditorSheet
                ref={introEditorSheetRef}
                target={resolvedEditingIntro}
                scenarioName={matchedActiveCardFull.name || ''}
                defaultPortraitUrl={
                  matchedActiveCardFull.thumbnailUrl || matchedActiveCardFull.avatarUrl || null
                }
                fallbackInitials={
                  matchedActiveCardFull.initials ||
                  String(matchedActiveCardFull.name || 'CH').slice(0, 2).toUpperCase()
                }
                portraitGallery={matchedActiveCardFull.scenarioMeta?.avatarGallery || []}
                busyPortrait={busyPortrait}
                onClose={requestCloseActiveWorkspaceSheet}
                onSave={handleSaveEditedIntro}
                onDirtyChange={handleIntroDirtyChange}
                onNavigateIndex={(nextKind, nextIdx) => {
                  if (nextKind === 'standard') {
                    setActiveIntroIdx(nextIdx);
                  }
                  setEditingIntroTarget({
                    cardId: matchedActiveCardFull.avatar || matchedActiveCardFull.id,
                    kind: nextKind,
                    index: nextIdx,
                  });
                }}
                onStartChat={(introPayload) => handleCreateNewChat(introPayload)}
                onUploadPortraitFile={handleUploadIntroPortrait}
              />
            </div>
          </section>
        ) : sheetExpanded && (matchedActiveCardFull || hasActiveScenario) ? (
          <section className="bb-center-column__sheet" aria-label="Scenario sheet workspace">
            <div ref={centerSheetSurfaceRef} className="bb-center-column__sheet-surface">
              <CharacterSheet {...characterSheetSharedProps} isExpanded />
            </div>
          </section>
        ) : (
          <ChatViewport
            streamRef={chatStreamRef}
            isDemoCard={!hasActiveScenario || isDemoCardId(selectedCardId)}
            hasActiveScenario={hasActiveScenario}
            switchingScenario={isSwitchingScenario}
            onOpenCreateScenario={() => handleOpenCreateScenarioModal('create')}
            onOpenImportScenario={() => handleOpenCreateScenarioModal('import')}
            chatListOpen={chatListOpen}
            timelinesOpen={timelinesOpen}
            timelineChats={
              committedChatCardId === selectedCardId
                ? timelineChats.length > 0
                  ? timelineChats
                  : chatFiles
                : []
            }
            loadingTimelines={loadingTimelines}
            focusedTimelineRequest={focusedTimelineRequest}
            onTimelineFocusChange={setFocusedTimelineNodeFile}
            leftTomeInset={leftOpen && !isMobile ? effectiveLeftWidth : 0}
            rightTomeInset={rightOpen && !isMobile ? effectiveRightWidth : 0}
            chatFiles={committedChatCardId === selectedCardId ? chatFiles : []}
            totalChatsCount={committedChatCardId === selectedCardId ? chatListMeta.totalChats : 0}
            hasMoreChats={committedChatCardId === selectedCardId ? chatListMeta.hasMore : false}
            loadingMoreChats={chatListMeta.loadingMore}
            onLoadMoreChats={handleLoadMoreChats}
            onSelectChatFile={handleSelectChatFromList}
            onBranchChatFile={handleBranchChatFromList}
            onDeleteChatFiles={handleDeleteChatsFromList}
            onCloseChatList={handleBackToChat}
            onCloseTimelines={handleBackToChat}
            activeChatFile={committedChatCardId === selectedCardId ? activeChatFile : ''}
            chatMetaStats={chatMetaStats}
            loadingChat={loadingChat}
            onLoadOlderMessages={handleLoadOlderMessages}
            messages={messages}
            demoSwipeIdx={swipeIdx}
            personas={personas}
            activePersonaAvatar={activePersonaAvatar}
            personaName={activePersonaObj?.name || personaName}
            personaAvatarUrl={activePersonaAvatarUrl}
            cards={cards}
            groups={groups}
            activeCharacter={activeCharacter}
            hasUserMessages={effectiveHasUserMessages}
            userMessageCount={effectiveUserMessageCount}
            onSelectPersona={handleSelectPersona}
            onConfirmReplacePersonaInChat={handleConfirmReplacePersonaInChat}
            onToggleBindPersonaToActiveCard={handleToggleBindPersonaToActiveCard}
            onOpenManagePersonaModal={handleOpenManagePersonaModal}
            onOpenCreatePersonaModal={handleOpenCreatePersonaModal}
            onDuplicatePersona={handleDuplicatePersona}
            onDeletePersona={handleDeletePersona}
            onClickPersonaBadge={() => handleOpenManagePersonaModal(activePersonaAvatar)}
            modelLabel={selectedModelLabel}
            hubConnections={apiHubState?.connections || []}
            activeProviderId={apiHubState?.activeConnectionId || apiHubState?.activeProviderId || ''}
            activeModelId={apiHubState?.activeModelId || ''}
            activeModelName={apiHubState?.activeModelName || ''}
            onSelectHubModel={handleSelectHubModel}
            onUpdateHubConnection={handleUpdateHubProvider}
            onFetchHubModels={handleFetchHubModels}
            onDeleteHubConnection={handleDeleteCustomHubConn}
            onRevealHubKey={handleRevealHubKey}
            onPingHubConnections={handlePingHubConnections}
            onFetchHubTelemetry={handleFetchHubTelemetry}
            hubCustomFamilies={apiHubState?.customFamilies || []}
            onAddHubCustomFamily={handleAddHubCustomFamily}
            onDeleteHubCustomFamily={handleDeleteHubCustomFamily}
            onClickModelBadge={() => setApiModalOpen(true)}
            characterName={chatDisplayCharacter.name}
            characterAvatarUrl={chatScenarioAvatarUrl}
            characterInitials={chatDisplayCharacter.initials || 'CH'}
            shaderStyle={shaderStyle}
            shaderIntensity={shaderIntensity}
            lowGpu={lowGpu}
            onSwipeMessage={handleSwipeMessage}
            onGenerateSwipe={handleGenerateSwipe}
            onContinueMessage={handleContinueMessage}
            onDeleteSwipe={handleDeleteSwipe}
            onSaveEditedMessage={handleSaveEditedMessage}
            onRemoveMessageAttachment={handleRemoveMessageAttachment}
            onDeleteMessage={handleDeleteMessage}
            onDeleteMessagesBatch={handleDeleteMessagesBatch}
            onCreateBranch={handleCreateBranchAtMessage}
            onNotify={pushComposerToast}
            composerToasts={composerToasts}
            onDismissComposerToast={dismissComposerToast}
            draftMsg={draftMsg}
            onChangeDraftMsg={setDraftMsg}
            pendingAttachments={pendingAttachments}
            onAddAttachments={handleAddAttachments}
            onRemoveAttachment={handleRemoveAttachment}
            onSendMessage={handleSend}
            isGenerating={isGenerating}
            onStopGeneration={handleStopGeneration}
            consoleStream={consoleStream}
            recapCompressDepth={
              messageRecap.config.enabled && messageRecap.config.stripEnabled
                ? messageRecap.config.keepFullDepth
                : null
            }
          />
        )}
      </main>

      {/* 3. RIGHT TOME (Selected Scenario, Prompts, Media, Extensions) — Full Height Right Side */}
      {rightOpen && (
        <aside
          id="right-nav-panel"
          className={`bb-tome bb-tome--right ${idleFade ? 'bb-tome--idle-fade' : ''}`}
          style={{ width: effectiveRightWidth }}
        >
          <TomeResizeCurtain
            side="right"
            width={effectiveRightWidth}
            minWidth={MIN_TOME_WIDTH}
            maxWidth={maxTomeWidth}
            defaultWidth={DEFAULT_TOME_WIDTH}
            onChangeWidth={setRightWidth}
          />

          <BookmarkRibbons
            tabs={RIGHT_TABS}
            activeId={rightTab}
            onChange={setRightTab}
          />

          <OverlayScrollArea
            className="bb-tome__body-wrap"
            viewportClassName="bb-tome__body"
            disabled={rightTab === 'selected'}
          >
            {rightTab === 'selected' &&
              (sheetExpanded ? (
                <AdvancedDefinitionsPanel
                  card={matchedActiveCardFull}
                  isDirty={isActiveCardDirty}
                  saving={cardSaving}
                  onChangeCardField={characterSheetSharedProps.onChangeCardField}
                  onSaveCard={handleSaveCardToPng}
                  onDiscardChanges={handleDiscardCardChanges}
                  onCollapseExpand={characterSheetSharedProps.onToggleExpand}
                />
              ) : (
                <CharacterSheet {...characterSheetSharedProps} isExpanded={false} />
              ))}

            {rightTab === 'aiconfig' && (
              <PresetVaultInspector
                mode="aiconfig"
                openaiPresets={openaiPresets}
                activePresets={activePresets}
                onSelectPreset={handleSelectPreset}
                starredPresets={
                  mainApi === 'openai'
                    ? presetCategoryMeta.openai?.starred || starredPresets
                    : presetCategoryMeta.textgen?.starred || []
                }
                onToggleStarPreset={(val, cat = 'openai') =>
                  handlePresetMetaPatch(cat, { toggleStar: val })
                }
                presetFolders={
                  mainApi === 'openai'
                    ? presetCategoryMeta.openai?.folders || []
                    : presetCategoryMeta.textgen?.folders || []
                }
                onCreatePresetFolder={(cat, name, names) =>
                  handlePresetMetaPatch(cat, { createFolder: { name, names } })
                }
                onRenamePresetFolder={(cat, folderId, name) =>
                  handlePresetMetaPatch(cat, { renameFolder: { folderId, name } })
                }
                onDeletePresetFolder={(cat, folderId) =>
                  handlePresetMetaPatch(cat, { deleteFolder: { folderId } })
                }
                onAssignPresetFolder={(cat, names, folderId) =>
                  handlePresetMetaPatch(cat, { assignFolder: { names, folderId } })
                }
                onSaveAsPreset={handleSaveAsPreset}
                onRenamePreset={handleRenamePreset}
                onDuplicatePreset={handleDuplicatePreset}
                onDeletePreset={handleDeletePreset}
                onBulkDeletePresets={handleBulkDeletePresets}
                onExportPreset={handleExportPreset}
                onImportPresetFiles={handleImportPresetFiles}
                onRevertPreset={handleSelectPreset}
                isPresetDirty={isCurrentPresetDirty}
                activeOpenaiDoc={activeOpenaiDoc}
                onChangeOpenaiDoc={setActiveOpenaiDoc}
                onSaveOpenaiDoc={() => handleSavePresetDoc('openai', activeOpenaiDoc)}
                activeTextgenDoc={activeTextgenDoc}
                onChangeTextgenDoc={setActiveTextgenDoc}
                onSaveTextgenDoc={() => handleSavePresetDoc('textgen', activeTextgenDoc)}
                aiSubTab={aiSubTab}
                onChangeAiSubTab={setAiSubTab}
                presetStatusMsg={presetStatusMsg}
                savingPreset={savingPreset}
                loadingPreset={loadingPreset}
                promptTokenContext={promptTokenContext}
                activeModelMeta={activeModelMeta}
                editingPromptSelection={editingPromptSelection}
                onChangeEditingPromptSelection={handleChangeEditingPromptSelection}
                cards={cards}
                activeCharacter={activeCharacter}
                hasActiveScenario={hasActiveScenario}
                characterBindings={
                  mainApi === 'openai'
                    ? presetCategoryMeta.openai?.characterBindings || {}
                    : presetCategoryMeta.textgen?.characterBindings || {}
                }
                onBindCharacterPreset={(avatar, presetName) =>
                  handleBindPresetToCharacter(
                    avatar,
                    presetName,
                    mainApi === 'openai' ? 'openai' : 'textgen',
                  )
                }
                onUnbindAllCharactersFromPreset={(presetName) =>
                  handleUnbindAllCharactersFromPreset(
                    presetName,
                    mainApi === 'openai' ? 'openai' : 'textgen',
                  )
                }
                onSelectCharacter={handleSelectCard}
              />
            )}

            {rightTab === 'media' && (
              <FolderCard
                title="Media & Backgrounds"
                subtitle="Scenario backgrounds & gallery"
                icon="images"
              >
                <div className="bb-caption-text">
                  Backgrounds &amp; Gallery module will be connected in Stage 4.
                </div>
              </FolderCard>
            )}

            {rightTab === 'extensions' && (
              <div className="bb-rc-plugins-stack">
                <StImporterTomePanel
                  collapsible
                  defaultOpen={false}
                  importer={stImporter}
                />
                <RecapTomePanel
                  collapsible
                  defaultOpen={false}
                  recap={messageRecap}
                  tokenContext={promptTokenContext}
                  savedChatTokens={chatHistoryTokenBreakdown.savedTokens}
                />
                <RefusalCatcherManager
                  collapsible
                  defaultOpen={false}
                  enabled={refusalCatcher.enabled}
                  delayMs={refusalCatcher.delayMs}
                  bannedPhrases={refusalCatcher.bannedPhrases}
                  onToggleEnabled={refusalCatcher.handleToggleEnabled}
                  onAddPhrase={refusalCatcher.handleAddPhrase}
                  onRemovePhrase={refusalCatcher.handleRemovePhrase}
                  onReplacePhrases={refusalCatcher.handleReplacePhrases}
                  fallbackEnabled={refusalCatcher.fallbackEnabled}
                  fallbackConnectionId={refusalCatcher.fallbackConnectionId}
                  fallbackModelId={refusalCatcher.fallbackModelId}
                  onToggleFallbackEnabled={refusalCatcher.handleToggleFallbackEnabled}
                  onSelectFallbackTarget={refusalCatcher.handleSelectFallbackTarget}
                  connections={apiHubState?.connections || []}
                  customFamilies={apiHubState?.customFamilies || []}
                  onUpdateConnection={handleUpdateHubProvider}
                  onFetchConnectionModels={handleFetchHubModels}
                  onDeleteConnection={handleDeleteCustomHubConn}
                  onRevealConnectionKey={handleRevealHubKey}
                  onPingConnections={handlePingHubConnections}
                  onFetchTelemetry={handleFetchHubTelemetry}
                  onAddCustomFamily={handleAddHubCustomFamily}
                  onDeleteCustomFamily={handleDeleteHubCustomFamily}
                  onOpenAddConnection={() => setApiModalOpen(true)}
                />
                <RegexTomePanel
                  collapsible
                  defaultOpen={false}
                  workspace={regexWorkspace}
                  hasActiveScenario={hasActiveScenario}
                  activeCharacterName={activeCharacter?.name || ''}
                  activePresetName={activePresets?.openai || 'Default'}
                  personaName={activePersonaObj?.name || personaName || 'User'}
                  latestMessageText={
                    messages.length > 0 ? String(messages[messages.length - 1]?.text || '') : ''
                  }
                  onNotify={(message, tone = 'info') => pushToast({ message, tone })}
                />
              </div>
            )}
          </OverlayScrollArea>
        </aside>
      )}
      {/* 3. Popup Windows (Modals) */}
      <WelcomeModal
        open={welcomeModalOpen && !bootSplashOpen && viewMode === 'tavern'}
        onClose={markOnboardingDismissed}
        onStartEmpty={markOnboardingDismissed}
        onCreatePersona={() => {
          markOnboardingDismissed();
          handleOpenCreatePersonaModal();
        }}
        importer={stImporter}
      />

      <ApiHubModal
        open={apiModalOpen}
        hubState={apiHubState}
        onClose={() => setApiModalOpen(false)}
        onCreateCustomProvider={handleCreateCustomHubConn}
      />

      <Modal
        open={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title="Mobile Access & Server Status"
        subtitle="SSH Tunnel + End-to-End AES-256-GCM Encryption"
        icon="qr"
        width={620}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" icon="refresh" onClick={onRefreshStatus}>
              Refresh Status
            </Button>
            <Button variant="b1" emphasis="filled" icon="check" onClick={() => setQrModalOpen(false)}>
              Close
            </Button>
          </>
        }
      >
        {serverStatus ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="bb-tunnel-box">
              {tunnelBusy && (
                <ProgressIndicator
                  variant="linear"
                  size="sm"
                  overlay="top"
                  ariaLabel="Updating encrypted tunnel..."
                />
              )}
              {serverStatus.tunnel?.qrSvg && (
                <div
                  className="bb-qr-wrap"
                  dangerouslySetInnerHTML={{ __html: serverStatus.tunnel.qrSvg }}
                />
              )}
              <div className="bb-tunnel-info">
                <div className="bb-lan-label">
                  Tunnel Status:{' '}
                  <strong>
                    {serverStatus.tunnel?.active ? 'Active (Encrypted)' : 'Local Only'}
                  </strong>
                </div>
                {serverStatus.tunnel?.publicUrl && (
                  <a
                    href={serverStatus.tunnel.authorizedUrl || serverStatus.tunnel.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="bb-link"
                  >
                    {serverStatus.tunnel.publicUrl}
                  </a>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <Button
                    variant="b1"
                    emphasis="filled"
                    disabled={tunnelBusy}
                    onClick={() => handleToggleTunnelWithToast(false)}
                  >
                    {serverStatus.tunnel?.active ? 'Stop Tunnel' : 'Enable Mobile Access'}
                  </Button>
                  {serverStatus.tunnel?.active && (
                    <Button
                      variant="b1"
                      emphasis="outlined"
                      disabled={tunnelBusy}
                      onClick={() => handleToggleTunnelWithToast(true)}
                    >
                      Rotate Key
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="bb-caption-text">
              Storage: {serverStatus.storage?.readyDirectories}/{serverStatus.storage?.totalDirectories} SillyTavern folders ready ({serverStatus.storage?.root})
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
            <ProgressIndicator variant="circular" size="sm" ariaLabel="Connecting to server" />
            <span className="bb-caption-text">Connecting to NexusTavern Server...</span>
          </div>
        )}
      </Modal>

      {/* Rename Card / Tag / Folder Modal */}
      <Modal
        open={Boolean(renameDialog)}
        onClose={() => {
          if (
            renameDialog &&
            String(renameDialog.name || '').trim() !==
              String(renameDialog.initialName ?? '').trim()
          ) {
            setRenameDialogUnsavedOpen(true);
            return;
          }
          setRenameDialogUnsavedOpen(false);
          setRenameDialog(null);
        }}
        title={
          renameDialog?.kind === 'tag'
            ? 'Rename Tag'
            : renameDialog?.kind === 'folder'
              ? 'Rename Folder'
              : 'Rename Scenario'
        }
        subtitle="Enter a new display name"
        icon="edit"
        width={420}
        footer={
          <>
            <Button
              variant="b1"
              emphasis="outlined"
              onClick={() => {
                if (
                  renameDialog &&
                  String(renameDialog.name || '').trim() !==
                    String(renameDialog.initialName ?? '').trim()
                ) {
                  setRenameDialogUnsavedOpen(true);
                  return;
                }
                setRenameDialogUnsavedOpen(false);
                setRenameDialog(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="check"
              disabled={!renameDialog?.name?.trim()}
              onClick={() => {
                if (!renameDialog) return;
                const nextName = renameDialog.name.trim();
                if (nextName) {
                  if (renameDialog.kind === 'card') {
                    handleRenameCard(renameDialog.id, nextName);
                  } else if (renameDialog.kind === 'tag') {
                    handleRenameTagFolder(renameDialog.id, nextName);
                  } else if (renameDialog.kind === 'folder') {
                    pinnedLayout.renameFolder(renameDialog.id, nextName);
                  }
                }
                setRenameDialogUnsavedOpen(false);
                setRenameDialog(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {renameDialog && (
          <div
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameDialog.name.trim()) {
                e.preventDefault();
                const nextName = renameDialog.name.trim();
                if (renameDialog.kind === 'card') {
                  handleRenameCard(renameDialog.id, nextName);
                } else if (renameDialog.kind === 'tag') {
                  handleRenameTagFolder(renameDialog.id, nextName);
                } else if (renameDialog.kind === 'folder') {
                  pinnedLayout.renameFolder(renameDialog.id, nextName);
                }
                setRenameDialog(null);
              }
            }}
          >
            <Input
              label="Name"
              value={renameDialog.name}
              onChange={(val) =>
                setRenameDialog((prev) => (prev ? { ...prev, name: val } : null))
              }
              placeholder="Enter new name..."
            />
          </div>
        )}
      </Modal>

      {/* Confirm Delete Card / Tag Modal */}
      <Modal
        open={Boolean(deleteDialog)}
        onClose={() => setDeleteDialog(null)}
        title={
          deleteDialog?.kind === 'tag'
            ? 'Delete Tag'
            : deleteDialog?.isGroup
              ? 'Delete Group'
              : 'Delete Scenario'
        }
        subtitle="This action cannot be undone"
        icon="trash"
        width={420}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="b4"
              icon="trash"
              onClick={() => {
                if (!deleteDialog) return;
                if (deleteDialog.kind === 'tag') {
                  handleDeleteTag(deleteDialog.id);
                } else {
                  handleDeleteCard(deleteDialog.id, {
                    deleteChats: Boolean(deleteDialog.deleteChats),
                    isGroup: Boolean(deleteDialog.isGroup),
                  });
                }
                setDeleteDialog(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        {deleteDialog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="bb-caption-text">
              {deleteDialog.kind === 'tag' ? (
                <>
                  Delete tag <strong>&ldquo;{deleteDialog.name}&rdquo;</strong>? The tag will be
                  detached from all scenarios, while the scenario cards themselves will remain
                  intact.
                </>
              ) : (
                <>
                  Delete <strong>&ldquo;{deleteDialog.name}&rdquo;</strong>?{' '}
                  {deleteDialog.deleteChats
                    ? 'The scenario card and all of its chat histories will be permanently removed.'
                    : 'Only the scenario card file will be removed; existing .jsonl chat files will remain on disk.'}
                </>
              )}
            </div>

            {deleteDialog.kind !== 'tag' && (
              <Switch
                checked={Boolean(deleteDialog.deleteChats)}
                onChange={(checked) =>
                  setDeleteDialog((prev) =>
                    prev ? { ...prev, deleteChats: Boolean(checked) } : null,
                  )
                }
                label="Also delete chat files"
                description="Remove all associated .jsonl chat histories from disk"
              />
            )}
          </div>
        )}
      </Modal>

      {/* Create Group Chat Modal (Multi-Select) */}
      <Modal
        open={Boolean(createGroupDialog)}
        onClose={() => {
          if (
            createGroupDialog &&
            String(createGroupDialog.name || '').trim() !==
              String(createGroupDialog.initialName ?? '').trim()
          ) {
            setCreateGroupUnsavedOpen(true);
            return;
          }
          setCreateGroupUnsavedOpen(false);
          setCreateGroupDialog(null);
        }}
        title="Create Group Chat"
        subtitle={
          createGroupDialog
            ? `${(createGroupDialog.members || []).length} scenario(s) selected`
            : ''
        }
        icon="users"
        width={460}
        footer={
          <>
            <Button
              variant="b1"
              emphasis="outlined"
              onClick={() => {
                if (
                  createGroupDialog &&
                  String(createGroupDialog.name || '').trim() !==
                    String(createGroupDialog.initialName ?? '').trim()
                ) {
                  setCreateGroupUnsavedOpen(true);
                  return;
                }
                setCreateGroupUnsavedOpen(false);
                setCreateGroupDialog(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="check"
              disabled={!createGroupDialog?.name?.trim()}
              onClick={handleConfirmCreateGroup}
            >
              Create Group
            </Button>
          </>
        }
      >
        {createGroupDialog && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && createGroupDialog.name.trim()) {
                e.preventDefault();
                handleConfirmCreateGroup();
              }
            }}
          >
            <Input
              label="Group Name"
              value={createGroupDialog.name}
              onChange={(val) =>
                setCreateGroupDialog((prev) => (prev ? { ...prev, name: val } : null))
              }
              placeholder="Enter group name..."
            />

            <div>
              <div
                className="bb-caption-text"
                style={{ marginBottom: 6, fontWeight: 600 }}
              >
                Members ({(createGroupDialog.members || []).length})
              </div>
              <OverlayScrollArea
                viewportClassName="bb-m3-ms-modal-members"
                variant="compact"
              >
                {(createGroupDialog.members || []).map((member) => {
                  const avatarSrc = member.thumbnailUrl || member.avatarUrl || null;
                  return (
                    <span key={member.id} className="bb-m3-ms-modal-member-pill">
                      <SafeImage
                        src={avatarSrc}
                        alt={member.name}
                        className="bb-m3-ms-modal-member-avatar"
                        fallback={
                          <span className="bb-m3-ms-modal-member-avatar">
                            {member.initials || member.name?.[0] || 'CH'}
                          </span>
                        }
                      />
                      <span>{member.name}</span>
                    </span>
                  );
                })}
              </OverlayScrollArea>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Delete Confirmation Modal (Multi-Select) */}
      <Modal
        open={Boolean(bulkDeleteDialog)}
        onClose={() => setBulkDeleteDialog(null)}
        title={`Delete ${bulkDeleteDialog?.items?.length || 0} Selected Item(s)`}
        subtitle="This action cannot be undone"
        icon="trash"
        width={460}
        footer={
          <>
            <Button
              variant="b1"
              emphasis="outlined"
              onClick={() => setBulkDeleteDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant="b4"
              icon="trash"
              onClick={handleConfirmBulkDelete}
            >
              Delete ({bulkDeleteDialog?.items?.length || 0})
            </Button>
          </>
        }
      >
        {bulkDeleteDialog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="bb-caption-text">
              Are you sure you want to permanently delete the following{' '}
              <strong>{bulkDeleteDialog.items.length}</strong> selected item(s)?
            </div>

            <OverlayScrollArea
              viewportClassName="bb-m3-ms-modal-members"
              variant="compact"
            >
              {bulkDeleteDialog.items.map((item) => {
                const avatarSrc = item.thumbnailUrl || item.avatarUrl || null;
                return (
                  <span key={item.id} className="bb-m3-ms-modal-member-pill">
                    <SafeImage
                      src={avatarSrc}
                      alt={item.name}
                      className="bb-m3-ms-modal-member-avatar"
                      fallback={
                        <span className="bb-m3-ms-modal-member-avatar">
                          {item.initials || item.name?.[0] || 'CH'}
                        </span>
                      }
                    />
                    <span>{item.name}</span>
                  </span>
                );
              })}
            </OverlayScrollArea>

            <Switch
              checked={Boolean(bulkDeleteDialog.deleteChats)}
              onChange={(checked) =>
                setBulkDeleteDialog((prev) =>
                  prev ? { ...prev, deleteChats: Boolean(checked) } : null,
                )
              }
              label="Also delete chat files"
              description="Remove all associated .jsonl chat histories from disk"
            />
          </div>
        )}
      </Modal>

      <UnsavedChangesModal
        open={renameDialogUnsavedOpen && Boolean(renameDialog)}
        subtitle={
          renameDialog?.kind === 'tag'
            ? 'Rename Tag'
            : renameDialog?.kind === 'folder'
              ? 'Rename Folder'
              : 'Rename Scenario'
        }
        itemName={
          String(renameDialog?.name || '').trim() ||
          renameDialog?.initialName ||
          'Item'
        }
        saveLabel="Save"
        canSave={Boolean(renameDialog?.name?.trim())}
        cannotSaveReason="Name cannot be empty."
        onCancel={() => setRenameDialogUnsavedOpen(false)}
        onDiscard={() => {
          setRenameDialogUnsavedOpen(false);
          setRenameDialog(null);
        }}
        onSave={() => {
          if (!renameDialog) return;
          const nextName = renameDialog.name.trim();
          if (!nextName) return;
          if (renameDialog.kind === 'card') {
            handleRenameCard(renameDialog.id, nextName);
          } else if (renameDialog.kind === 'tag') {
            handleRenameTagFolder(renameDialog.id, nextName);
          } else if (renameDialog.kind === 'folder') {
            pinnedLayout.renameFolder(renameDialog.id, nextName);
          }
          setRenameDialogUnsavedOpen(false);
          setRenameDialog(null);
        }}
      />

      <UnsavedChangesModal
        open={createGroupUnsavedOpen && Boolean(createGroupDialog)}
        subtitle="Create Group Chat"
        itemName={String(createGroupDialog?.name || '').trim() || 'New Group'}
        saveLabel="Create Group"
        canSave={Boolean(createGroupDialog?.name?.trim())}
        cannotSaveReason="Group name cannot be empty."
        onCancel={() => setCreateGroupUnsavedOpen(false)}
        onDiscard={() => {
          setCreateGroupUnsavedOpen(false);
          setCreateGroupDialog(null);
        }}
        onSave={handleConfirmCreateGroup}
      />

      <UnsavedChangesModal
        open={Boolean(workspaceUnsavedGuard)}
        subtitle={workspaceUnsavedGuard?.subtitle || 'Your recent edits have not been saved yet'}
        itemName={workspaceUnsavedGuard?.itemName || ''}
        saveLabel={workspaceUnsavedGuard?.saveLabel || 'Save & Close'}
        canSave={Boolean(workspaceUnsavedGuard?.canSave)}
        cannotSaveReason={workspaceUnsavedGuard?.cannotSaveReason || ''}
        busy={Boolean(workspaceUnsavedGuard?.busy)}
        onCancel={() => {
          workspaceGuardActionRef.current = null;
          setWorkspaceUnsavedGuard(null);
        }}
        onDiscard={() => {
          const pending = workspaceGuardActionRef.current;
          workspaceGuardActionRef.current = null;
          setWorkspaceUnsavedGuard(null);
          pending?.descriptor?.discard?.();
          pending?.proceed?.();
        }}
        onSave={async () => {
          const pending = workspaceGuardActionRef.current;
          if (!pending) {
            setWorkspaceUnsavedGuard(null);
            return;
          }
          setWorkspaceUnsavedGuard((prev) => (prev ? { ...prev, busy: true } : null));
          const ok = await pending.descriptor?.save?.();
          if (ok !== false) {
            workspaceGuardActionRef.current = null;
            setWorkspaceUnsavedGuard(null);
            pending.proceed?.();
          } else {
            setWorkspaceUnsavedGuard((prev) => (prev ? { ...prev, busy: false } : null));
          }
        }}
      />

      {/* Lightweight Frameless M3 Boot Splash Screen */}
      <SplashScreen
        open={bootSplashOpen}
        exiting={bootSplashExiting}
        stepLabel={bootStage.stepLabel}
        lowGpu={lowGpu}
      />
    </div>
  );
}


