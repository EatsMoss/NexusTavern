import { useState, useCallback, useMemo, useRef } from 'react';
import {
  updatePersona,
  selectPersona,
  createPersona,
  uploadPersonaAvatar,
  duplicatePersona,
  deletePersona,
  isDemoCardId,
} from '@core/cards/cardsApi.js';
import {
  fetchCharacterChats,
  replaceChatPersona,
} from '@core/chats/chatsApi.js';

/**
 * Domain workspace controller for user personas (`settings.json -> personas`,
 * `User Avatars/`), scenario/character persona bindings, active chat persona
 * resolution & replacement, and the central `PersonaSheet` create/edit lifecycle
 * with `UnsavedChangesModal` guard integration.
 */
export function usePersonasWorkspace({
  isMobile,
  selectedCardId,
  activeCardFull,
  chatSessionBridgeRef,
  setBusyLinksAction,
  setCardSaveStatus,
  setChatListOpen,
  setTimelinesOpen,
  setEditingPromptSelection,
  setEditingIntroTarget,
  setCreateScenarioModalOpen,
  setSheetExpanded,
  setLeftOpen,
  setRightOpen,
  runWithWorkspaceUnsavedGuard,
  markOnboardingDismissed,
  pushComposerToast,
}) {
  const personaSheetRef = useRef(null);

  const [personas, setPersonas] = useState([]);
  const [activePersonaAvatar, setActivePersonaAvatar] = useState('');
  const [personaName, setPersonaName] = useState('User');
  const [personaDesc, setPersonaDesc] = useState('');
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [personaModalMode, setPersonaModalMode] = useState('manage'); // 'manage' | 'create'
  const [personaModalTargetAvatar, setPersonaModalTargetAvatar] = useState('');

  const personasRef = useRef([]);
  const activePersonaAvatarRef = useRef('');
  const sessionPersonaHintRef = useRef({
    chatPersonaAvatar: null,
    hasUserMessages: false,
    cardAvatar: null,
  });

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

  const syncPersonasFromServer = useCallback(
    (personaRes) => {
      const loadedPersonas = Array.isArray(personaRes?.personas) ? personaRes.personas : [];
      personasRef.current = loadedPersonas;
      setPersonas(loadedPersonas);
      if (loadedPersonas.length > 0) {
        if (!activePersonaAvatarRef.current && personaRes?.activePersonaAvatar) {
          activePersonaAvatarRef.current = personaRes.activePersonaAvatar;
        }
        syncSessionPersona(sessionPersonaHintRef.current, loadedPersonas);
      } else {
        activePersonaAvatarRef.current = '';
        setActivePersonaAvatar('');
      }
    },
    [syncSessionPersona],
  );

  const updatePersonasList = useCallback((nextPersonas) => {
    if (!Array.isArray(nextPersonas)) return;
    personasRef.current = nextPersonas;
    setPersonas(nextPersonas);
    if (activePersonaAvatarRef.current) {
      const current = nextPersonas.find((p) => p.avatar === activePersonaAvatarRef.current);
      if (current) {
        setPersonaName(current.name);
        setPersonaDesc(current.description || '');
      }
    }
  }, []);

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
        if (Array.isArray(res?.personas)) {
          personasRef.current = res.personas;
          setPersonas(res.personas);
        }
        setCardSaveStatus(`Bound persona "${target.name}"`);
        setTimeout(() => setCardSaveStatus(''), 2000);
      } catch (err) {
        setCardSaveStatus(`Persona bind error: ${err.message}`);
      } finally {
        setBusyLinksAction(false);
      }
    },
    [activeCardFull?.avatar, personas, setBusyLinksAction, setCardSaveStatus],
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
        if (Array.isArray(res?.personas)) {
          personasRef.current = res.personas;
          setPersonas(res.personas);
        }
        setCardSaveStatus(`Unbound persona "${target.name}"`);
        setTimeout(() => setCardSaveStatus(''), 2000);
      } catch (err) {
        setCardSaveStatus(`Unbind error: ${err.message}`);
      } finally {
        setBusyLinksAction(false);
      }
    },
    [activeCardFull?.avatar, personas, setBusyLinksAction, setCardSaveStatus],
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
      personasRef.current = latestList;
      setPersonas(latestList);
      setCardSaveStatus('Unbound all personas from scenario');
      setTimeout(() => setCardSaveStatus(''), 2000);
    } catch (err) {
      setCardSaveStatus(`Unbind error: ${err.message}`);
    } finally {
      setBusyLinksAction(false);
    }
  }, [activeCardFull?.avatar, personas, setBusyLinksAction, setCardSaveStatus]);

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
        const chatCtx = chatSessionBridgeRef?.current;
        const activeChatFile = chatCtx?.activeChatFile || '';
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
    [personas, applyResolvedPersonaLocally, selectedCardId, chatSessionBridgeRef],
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

        const chatCtx = chatSessionBridgeRef?.current;
        const activeChatFile = chatCtx?.activeChatFile || '';
        const chatFilesLength = Number(chatCtx?.chatFilesLength || 0);

        if (selectedCardId && !isDemoCardId(selectedCardId) && activeChatFile) {
          const replaced = await replaceChatPersona(selectedCardId, activeChatFile, {
            personaAvatar: avatar,
            personaName: found.name,
          });
          if (Array.isArray(replaced?.messages) && chatCtx?.mapServerMsgToUi) {
            chatCtx.setMessages?.(replaced.messages.map(chatCtx.mapServerMsgToUi));
          } else {
            chatCtx?.setMessages?.((prev) =>
              prev.map((m) => (m.isUser ? { ...m, sender: found.name } : m)),
            );
          }
          sessionPersonaHintRef.current = {
            chatPersonaAvatar: avatar,
            hasUserMessages: Boolean(replaced?.hasUserMessages ?? true),
            cardAvatar: selectedCardId,
          };
          chatCtx?.setChatMetaStats?.((prev) => ({
            ...prev,
            hasUserMessages: Boolean(replaced?.hasUserMessages ?? prev.hasUserMessages),
            userMessageCount: Number(replaced?.userMessageCount ?? prev.userMessageCount ?? 0),
            syncStatus: `Replaced chat persona with "${found.name}" (${replaced?.updatedUserMessages || 0} msgs)`,
          }));
          fetchCharacterChats(selectedCardId, {
            offset: 0,
            limit: Math.max(30, chatFilesLength),
          })
            .then((res) => {
              if (Array.isArray(res?.chats)) {
                chatCtx?.setChatFiles?.(res.chats);
                chatCtx?.setTimelineChats?.(res.chats);
              }
            })
            .catch(() => {});
        } else {
          // Demo session fallback
          chatCtx?.setMessages?.((prev) =>
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
      chatSessionBridgeRef,
      pushComposerToast,
    ],
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
    [
      personas,
      activePersonaAvatar,
      isMobile,
      setChatListOpen,
      setTimelinesOpen,
      setEditingPromptSelection,
      setEditingIntroTarget,
      setCreateScenarioModalOpen,
      setSheetExpanded,
      setLeftOpen,
      setRightOpen,
      runWithWorkspaceUnsavedGuard,
    ],
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
  }, [
    isMobile,
    setChatListOpen,
    setTimelinesOpen,
    setEditingPromptSelection,
    setEditingIntroTarget,
    setCreateScenarioModalOpen,
    setSheetExpanded,
    setLeftOpen,
    setRightOpen,
    runWithWorkspaceUnsavedGuard,
  ]);

  const handleClickPersonaBadge = useCallback(
    () => handleOpenManagePersonaModal(activePersonaAvatarRef.current),
    [handleOpenManagePersonaModal],
  );

  const handleCreatePersona = useCallback(
    async (payload) => {
      const res = await createPersona(payload);
      if (Array.isArray(res?.personas)) {
        personasRef.current = res.personas;
        setPersonas(res.personas);
      }
      markOnboardingDismissed({ closeModal: false });
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
    [markOnboardingDismissed],
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

  const activePersonaObj = useMemo(
    () => personas.find((p) => p.avatar === activePersonaAvatar) || null,
    [personas, activePersonaAvatar],
  );

  const activePersonaAvatarUrl =
    activePersonaObj?.thumbnailUrl || activePersonaObj?.avatarUrl || null;

  return {
    personaSheetRef,
    personas,
    setPersonas,
    activePersonaAvatar,
    personaName,
    personaDesc,
    activePersonaObj,
    activePersonaAvatarUrl,
    personaModalOpen,
    setPersonaModalOpen,
    personaModalMode,
    personaModalTargetAvatar,
    sessionPersonaHintRef,
    syncSessionPersona,
    syncPersonasFromServer,
    updatePersonasList,
    handleBindPersonaToActiveCard,
    handleUnbindPersonaFromActiveCard,
    handleUnbindAllPersonasFromActiveCard,
    handleToggleBindPersonaToActiveCard,
    handleSelectPersona,
    handleConfirmReplacePersonaInChat,
    handleOpenManagePersonaModal,
    handleOpenCreatePersonaModal,
    handleClickPersonaBadge,
    handleCreatePersona,
    handleSavePersonaById,
    handleUploadPersonaAvatar,
    handleDuplicatePersona,
    handleDeletePersona,
  };
}
