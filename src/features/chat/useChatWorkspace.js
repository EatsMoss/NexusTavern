import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getAuthorizedAssetUrl } from '@core/api/apiClient.js';
import { fetchCharacterCard, isDemoCardId } from '@core/cards/cardsApi.js';
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
} from '@core/chats/chatsApi.js';
import { resolvePreferredCharacterChatFile } from '@core/chats/timelineForest.js';
import { getCustomizationRuntimeSnapshot } from '@core/customization/customizationRuntimeStore.js';
import { applyTextFormattingRules } from '@core/messages/messageDecorator.js';
import { readFileAsBase64 } from '@core/utils/imageCodec.js';
import { revokeAttachmentDraft } from '@ui/index.js';
import { useChatStreaming } from './useChatStreaming.js';

/**
 * Domain workspace controller for `.jsonl` chat windows, tail-first pagination,
 * timeline branching, bulk chat import/export/delete, message swipes, edits,
 * batch deletions, file attachments, and LLM generation streaming.
 */
export function useChatWorkspace({
  isMobile,
  cards,
  setCards,
  groups,
  selectedCardId,
  selectedCardIdRef,
  hasActiveScenario,
  activeCharacter,
  activeCardFull,
  matchedActiveCardFull,
  activeIntroIdx,
  setActiveIntroIdx,
  commitLoadedActiveCard,
  loadCardsAndPersonas,
  handleDeleteCard,
  setCardSaveStatus,
  personaName,
  activePersonaAvatar,
  sessionPersonaHintRef,
  syncSessionPersona,
  activeOpenaiDoc,
  apiHubState,
  setApiHubState,
  chatListOpen: _chatListOpen,
  setChatListOpen,
  timelinesOpen: _timelinesOpen,
  setTimelinesOpen,
  setEditingPromptSelection,
  setEditingIntroTarget,
  setCreateScenarioModalOpen,
  setPersonaModalOpen,
  setSheetExpanded,
  setLeftOpen,
  setRightOpen,
  setLeftTab,
  setRightTab,
  consumeRestoredChatFile,
  recordSessionPointer,
  forgetDeletedCharacterChats,
  finishBootSplash,
  runWithWorkspaceUnsavedGuard,
  chatStreamRef: _chatStreamRef,
  chatComposerRef: _chatComposerRef,
  scrollToChatBottom,
  pushToast,
  pushComposerToast,
}) {
  const [committedChatCardId, setCommittedChatCardId] = useState('');
  const [loadingCardAndChats, setLoadingCardAndChats] = useState(false);
  const [activeChatWorld, setActiveChatWorld] = useState('');
  const [activeChatPortraitUrl, setActiveChatPortraitUrl] = useState(null);
  const [swipeIdx, setSwipeIdx] = useState(0);

  const [chatFiles, setChatFiles] = useState([]);
  const [chatListMeta, setChatListMeta] = useState({
    totalChats: 0,
    hasMore: false,
    nextOffset: 0,
    loadingMore: false,
  });
  const [activeChatFile, setActiveChatFile] = useState('');
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
  const [chatBulkBusy, setChatBulkBusy] = useState(false);
  const [messages, setMessages] = useState([]);

  const loadedSessionRef = useRef({ cardId: null, chatFile: null });
  const chatWindowSeqRef = useRef(0);
  const cardLoadSeqRef = useRef(0);

  const mapServerMsgToUi = useCallback(
    (m) => ({
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
    }),
    [],
  );

  const resetActiveCardChatSession = useCallback(() => {
    loadedSessionRef.current = { cardId: null, chatFile: '' };
    setCommittedChatCardId('');
    setActiveChatFile('');
    setChatFiles([]);
    setTimelineChats([]);
    setMessages([]);
    setTimelinesOpen(false);
    setChatListOpen(false);
  }, [setTimelinesOpen, setChatListOpen]);

  const reloadActiveCharacterChatList = useCallback(async () => {
    const cid = selectedCardIdRef.current;
    if (!cid || isDemoCardId(cid)) return;
    try {
      const chatListRes = await fetchCharacterChats(cid, {
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
  }, [selectedCardIdRef]);

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
      try {
        const tailLimit =
          getCustomizationRuntimeSnapshot()?.chatAndAi?.tailLoadCount || 20;
        const win = await fetchChatWindow(avatarId, {
          file: targetFile,
          limit: tailLimit,
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
    [
      selectedCardIdRef,
      mapServerMsgToUi,
      sessionPersonaHintRef,
      syncSessionPersona,
      recordSessionPointer,
      scrollToChatBottom,
    ],
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
        commitLoadedActiveCard(full, { resetIntroState: true });

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
          const perCharRemembered = consumeRestoredChatFile(selectedCardId);

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
  }, [
    selectedCardId,
    commitLoadedActiveCard,
    consumeRestoredChatFile,
    openChatFileWindow,
    refreshTimelineChats,
    sessionPersonaHintRef,
    syncSessionPersona,
    recordSessionPointer,
    finishBootSplash,
    pushToast,
  ]);

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
    [selectedCardId, activeChatFile, setCardSaveStatus],
  );

  const handleLoadOlderMessages = useCallback(async () => {
    if (!selectedCardId || !activeChatFile || !chatMetaStats.hasMoreOlder || loadingChat) {
      return;
    }
    setLoadingChat(true);
    try {
      const tailLimit =
        getCustomizationRuntimeSnapshot()?.chatAndAi?.tailLoadCount || 20;
      const olderWin = await fetchChatWindow(selectedCardId, {
        file: activeChatFile,
        beforeIndex: chatMetaStats.startIndex,
        limit: tailLimit,
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
  }, [
    selectedCardId,
    activeChatFile,
    chatMetaStats.hasMoreOlder,
    chatMetaStats.startIndex,
    loadingChat,
    mapServerMsgToUi,
  ]);

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
  }, [
    setChatListOpen,
    setTimelinesOpen,
    setEditingPromptSelection,
    setEditingIntroTarget,
    setCreateScenarioModalOpen,
    setPersonaModalOpen,
    setSheetExpanded,
    setRightTab,
    runWithWorkspaceUnsavedGuard,
    scrollToChatBottom,
  ]);

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
  }, [isMobile, selectedCardId, setRightOpen, setLeftOpen, setLeftTab]);

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
    [
      selectedCardId,
      refreshTimelineChats,
      setEditingPromptSelection,
      setEditingIntroTarget,
      setCreateScenarioModalOpen,
      setPersonaModalOpen,
      setSheetExpanded,
      setRightTab,
      setTimelinesOpen,
      runWithWorkspaceUnsavedGuard,
    ],
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
  }, [
    selectedCardId,
    refreshTimelineChats,
    setChatListOpen,
    setEditingPromptSelection,
    setEditingIntroTarget,
    setCreateScenarioModalOpen,
    setPersonaModalOpen,
    setSheetExpanded,
    setRightTab,
    setTimelinesOpen,
    scrollToChatBottom,
    runWithWorkspaceUnsavedGuard,
  ]);

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
    [selectedCardId, openChatFileWindow, setChatListOpen, setTimelinesOpen, scrollToChatBottom],
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
      sessionPersonaHintRef,
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

        forgetDeletedCharacterChats(selectedCardId, list);

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
      activeCardFull?.chat,
      activeChatFile,
      openChatFileWindow,
      forgetDeletedCharacterChats,
      recordSessionPointer,
      loadCardsAndPersonas,
      pushToast,
    ],
  );

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
        forgetDeletedCharacterChats(selectedCardId);
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
      setTimelinesOpen,
      forgetDeletedCharacterChats,
      recordSessionPointer,
      loadCardsAndPersonas,
      pushToast,
    ],
  );

  const handleCreateNewChat = useCallback(
    async (introOverride = null) => {
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
    },
    [
      selectedCardId,
      loadingChat,
      activeIntroIdx,
      setActiveIntroIdx,
      activeCardFull,
      mapServerMsgToUi,
      sessionPersonaHintRef,
      setChatListOpen,
      setTimelinesOpen,
      recordSessionPointer,
      scrollToChatBottom,
      loadCardsAndPersonas,
    ],
  );

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
    setCards,
  ]);

  const setSyncedChatFiles = useCallback((files) => {
    setChatFiles(files);
    setTimelineChats(files);
  }, []);

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
    setChatFiles: setSyncedChatFiles,
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
      sessionPersonaHintRef,
      syncSessionPersona,
      recordSessionPointer,
      loadCardsAndPersonas,
      pushComposerToast,
    ],
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

  const handleSend = async (payloadOrEvent) => {
    if (payloadOrEvent?.preventDefault) payloadOrEvent.preventDefault();
    if (isGenerating || isSwitchingScenario || loadingChat) {
      return { ok: false, restoreDraft: true };
    }

    const rawText =
      payloadOrEvent && typeof payloadOrEvent === 'object' && 'text' in payloadOrEvent
        ? payloadOrEvent.text
        : '';
    const clean = String(rawText || '').trim();
    const attachmentsSnapshot =
      payloadOrEvent && Array.isArray(payloadOrEvent.attachments)
        ? [...payloadOrEvent.attachments]
        : [];
    const hasPayload = Boolean(clean || attachmentsSnapshot.length > 0);
    const isRealCard = Boolean(selectedCardId && !isDemoCardId(selectedCardId));

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
          const sendEmptyContinues =
            getCustomizationRuntimeSnapshot()?.chatAndAi?.sendEmptyToContinue !== false;
          const tailMsg = messages.length > 0 ? messages[messages.length - 1] : null;
          const shouldContinueLastAi =
            !hasPayload &&
            !createdFreshChat &&
            sendEmptyContinues &&
            Boolean(tailMsg && !tailMsg.isUser && messages.length > 1);

          await runChatGenerationStream({
            mode: shouldContinueLastAi ? 'continue' : 'reply',
            targetFile,
            ...(shouldContinueLastAi ? { targetMessageIndex: tailMsg.index } : {}),
          });
          return { ok: true };
        }
      } catch (err) {
        setGenerationError(err?.message || 'Failed to append message before generation');
        return { ok: false, restoreDraft: true };
      }
    }

    // Demo card fallback (in-memory session + live API Hub streaming if configured)
    let nextDemoMessages = messages;
    if (hasPayload) {
      const aiRuntime = getCustomizationRuntimeSnapshot()?.chatAndAi;
      const formattedDemoText = applyTextFormattingRules(clean, {
        trimSpaces: aiRuntime?.trimSpaces !== false,
        collapseNewlines: aiRuntime?.collapseNewlines !== false,
        autoFixMarkdown: aiRuntime?.autoFixMarkdown !== false,
        trimIncompleteSentences: false,
      });
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
        tokens: Math.max(8, Math.ceil(formattedDemoText.length / 4)),
        text: formattedDemoText,
        mes: formattedDemoText,
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
    return { ok: true };
  };

  const chatMsgHandlersRef = useRef({});
  chatMsgHandlersRef.current = {
    swipe: handleSwipeMessage,
    generateSwipe: handleGenerateSwipe,
    continueMsg: handleContinueMessage,
    deleteSwipe: handleDeleteSwipe,
    saveEdit: handleSaveEditedMessage,
    removeAttachment: handleRemoveMessageAttachment,
    deleteMsg: handleDeleteMessage,
    deleteBatch: handleDeleteMessagesBatch,
    createBranch: handleCreateBranchAtMessage,
  };

  const stableHandleSwipeMessage = useCallback(
    (mes, nextId) => chatMsgHandlersRef.current.swipe(mes, nextId),
    [],
  );
  const stableHandleGenerateSwipe = useCallback(
    (mes) => chatMsgHandlersRef.current.generateSwipe(mes),
    [],
  );
  const stableHandleContinueMessage = useCallback(
    (mes) => chatMsgHandlersRef.current.continueMsg(mes),
    [],
  );
  const stableHandleDeleteSwipe = useCallback(
    (mIdx, swipeId) => chatMsgHandlersRef.current.deleteSwipe(mIdx, swipeId),
    [],
  );
  const stableHandleSaveEditedMessage = useCallback(
    (mIdx, txt, asSwipe, rsn) => chatMsgHandlersRef.current.saveEdit(mIdx, txt, asSwipe, rsn),
    [],
  );
  const stableHandleRemoveMessageAttachment = useCallback(
    (mIdx, attIdx, msgObj) => chatMsgHandlersRef.current.removeAttachment(mIdx, attIdx, msgObj),
    [],
  );
  const stableHandleDeleteMessage = useCallback(
    (mIdx, truncate) => chatMsgHandlersRef.current.deleteMsg(mIdx, truncate),
    [],
  );
  const stableHandleDeleteMessagesBatch = useCallback(
    (indices) => chatMsgHandlersRef.current.deleteBatch(indices),
    [],
  );
  const stableHandleCreateBranchAtMessage = useCallback(
    (mIdx, opts) => chatMsgHandlersRef.current.createBranch(mIdx, opts),
    [],
  );

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const stableHandleSend = useCallback((payload) => handleSendRef.current(payload), []);

  const visibleUserMessageCount = useMemo(
    () => messages.reduce((acc, m) => (m?.isUser ? acc + 1 : acc), 0),
    [messages],
  );
  const effectiveUserMessageCount = chatMetaStats.hasMoreOlder
    ? Math.max(Number(chatMetaStats.userMessageCount || 0), visibleUserMessageCount)
    : visibleUserMessageCount;
  const effectiveHasUserMessages = effectiveUserMessageCount > 0;

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

  return {
    committedChatCardId,
    loadingCardAndChats,
    activeChatWorld,
    activeChatPortraitUrl,
    swipeIdx,
    chatFiles,
    setChatFiles,
    chatListMeta,
    activeChatFile,
    timelineChats,
    setTimelineChats,
    loadingTimelines,
    focusedTimelineRequest,
    focusedTimelineNodeFile,
    setFocusedTimelineNodeFile,
    chatMetaStats,
    setChatMetaStats,
    loadingChat,
    chatBulkBusy,
    messages,
    setMessages,
    isGenerating,
    isSwitchingScenario,
    chatDisplayCharacter,
    activeScenarioAvatarUrl,
    chatScenarioAvatarUrl,
    effectiveUserMessageCount,
    effectiveHasUserMessages,
    mapServerMsgToUi,
    resetActiveCardChatSession,
    reloadActiveCharacterChatList,
    handleChangeActiveChatWorld,
    handleLoadOlderMessages,
    handleBackToChat,
    handleToggleChatList,
    handleFocusNodeOnTree,
    handleToggleTimelines,
    handleLoadMoreChats,
    handleSelectChatFromList,
    handleBranchChatFromList,
    handleDeleteChatsFromList,
    handleExportAllCharacterChats,
    handleImportCharacterChats,
    handleDeleteAllCharacterChats,
    handleCreateNewChat,
    handleStopGeneration,
    stableHandleSwipeMessage,
    stableHandleGenerateSwipe,
    stableHandleContinueMessage,
    stableHandleDeleteSwipe,
    stableHandleSaveEditedMessage,
    stableHandleRemoveMessageAttachment,
    stableHandleDeleteMessage,
    stableHandleDeleteMessagesBatch,
    stableHandleCreateBranchAtMessage,
    stableHandleSend,
  };
}
