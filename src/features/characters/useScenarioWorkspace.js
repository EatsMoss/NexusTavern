import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getAuthorizedAssetUrl } from '@core/api/apiClient.js';
import {
  fetchCharacterSummaries,
  fetchCharacterCard,
  updateCharacterCard,
  createCharacterCard,
  importCharacterCards,
  fetchPersonas,
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
  isDemoCardId,
} from '@core/cards/cardsApi.js';
import {
  convertImageFileToPngBase64,
  readFileAsBase64,
} from '@core/utils/imageCodec.js';
import { serializeCardEditableSnapshot } from './CharacterSheet/CharacterSheet.jsx';
import {
  resolveIntroEditorTargetData,
  padIntroMetaArray,
  toServerIntroMetaPayload,
} from './CharacterSheet/IntrosTab.jsx';
import { useCharacterGallery } from './useCharacterGallery.js';
import { usePinnedLayout, isCardInPinnedEntries } from './usePinnedLayout.js';
import { filterCards, sortCards } from './tagFilters.js';
import { MultiSelectPopoverContent } from './MultiSelectPopoverContent.jsx';

export { isDemoCardId };

export const EMPTY_CHARACTER_FALLBACK = {
  id: '',
  avatar: '',
  name: 'No Scenario Selected',
  subtitle: '',
  initials: 'NT',
  thumbnailUrl: null,
  avatarUrl: null,
};

/**
 * Domain workspace controller for Scenario/Character cards, gallery filtering,
 * pinned folders, tags, groups, multi-select actions, portraits, lore bindings,
 * and `CharacterSheet` draft/save lifecycle with `UnsavedChangesModal` support.
 */
export function useScenarioWorkspace({
  isMobile,
  sheetExpanded,
  setSheetExpanded,
  setLeftOpen,
  setRightOpen,
  setLeftTab,
  setRightTab,
  setChatListOpen,
  setTimelinesOpen,
  setEditingPromptSelection,
  setPersonaModalOpen,
  consumeRestoredCardAvatar,
  retireRestorePointers,
  recordSessionPointer,
  forgetDeletedCharactersSession,
  runWithWorkspaceUnsavedGuard,
  workspaceGuardBridgeRef,
  onPersonasLoaded,
  onPersonasUpdated,
  onRefreshOpenaiPresets,
  onResetActiveCardChatSession,
  scrollToChatBottom,
  pushToast,
}) {
  const [cards, setCards] = useState([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState('');
  const selectedCardIdRef = useRef(selectedCardId);
  selectedCardIdRef.current = selectedCardId;

  const [activeCardFull, setActiveCardFull] = useState(null);
  const [cleanCardSnapshot, setCleanCardSnapshot] = useState('');
  const cleanCardObjRef = useRef(null);
  const [busyPortrait, setBusyPortrait] = useState(false);
  const [busyLinksAction, setBusyLinksAction] = useState(false);
  const [worlds, setWorlds] = useState([]);
  const [activeIntroIdx, setActiveIntroIdx] = useState(0);
  const [editingIntroTarget, setEditingIntroTarget] = useState(null);
  const [cardSaveStatus, setCardSaveStatus] = useState('');
  const [cardSaving, setCardSaving] = useState(false);

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

  // Multi-select & Rename/Delete/Group dialog state
  const [multiSelectActive, setMultiSelectActive] = useState(false);
  const [multiSelectedIds, setMultiSelectedIds] = useState([]);
  const [multiSelectSubpopover, setMultiSelectSubpopover] = useState(null);
  const [multiFolderInput, setMultiFolderInput] = useState('New Folder');
  const [multiTagInput, setMultiTagInput] = useState('');
  const [lastMultiClick, setLastMultiClick] = useState({ id: null, selected: true });
  const [renameDialog, setRenameDialog] = useState(null);
  const [renameDialogUnsavedOpen, setRenameDialogUnsavedOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [createGroupDialog, setCreateGroupDialog] = useState(null);
  const [createGroupUnsavedOpen, setCreateGroupUnsavedOpen] = useState(false);
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(null);

  const [createScenarioModalOpen, setCreateScenarioModalOpen] = useState(false);
  const [createScenarioModalMode, setCreateScenarioModalMode] = useState('create');
  const [creatingScenario, setCreatingScenario] = useState(false);
  const [createScenarioStatus, setCreateScenarioStatus] = useState('');

  const commitLoadedActiveCard = useCallback((cardObj, { resetIntroState = false } = {}) => {
    setActiveCardFull(cardObj || null);
    cleanCardObjRef.current = cardObj || null;
    setCleanCardSnapshot(cardObj ? serializeCardEditableSnapshot(cardObj) : '');
    if (resetIntroState) {
      setActiveIntroIdx(0);
      setCardSaveStatus('');
    }
  }, []);

  const onPersonasLoadedRef = useRef(onPersonasLoaded);
  onPersonasLoadedRef.current = onPersonasLoaded;
  const onPersonasUpdatedRef = useRef(onPersonasUpdated);
  onPersonasUpdatedRef.current = onPersonasUpdated;
  const onRefreshOpenaiPresetsRef = useRef(onRefreshOpenaiPresets);
  onRefreshOpenaiPresetsRef.current = onRefreshOpenaiPresets;
  const onResetActiveCardChatSessionRef = useRef(onResetActiveCardChatSession);
  onResetActiveCardChatSessionRef.current = onResetActiveCardChatSession;

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
        const validRestoredAvatar = consumeRestoredCardAvatar(loadedChars);
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
      onPersonasLoadedRef.current?.(personaRes);

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
  }, [consumeRestoredCardAvatar]);

  const handleSaveCardToPng = useCallback(async () => {
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
        commitLoadedActiveCard(updated);
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
  }, [activeCardFull, cardSaving, commitLoadedActiveCard, loadCardsAndPersonas]);

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
          commitLoadedActiveCard(updated);
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
    [activeCardFull?.avatar, busyPortrait, commitLoadedActiveCard, loadCardsAndPersonas],
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
          commitLoadedActiveCard(updated);
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
    [activeCardFull?.avatar, busyPortrait, commitLoadedActiveCard, loadCardsAndPersonas],
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
          commitLoadedActiveCard(updated);
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
    [activeCardFull?.avatar, commitLoadedActiveCard, loadCardsAndPersonas],
  );

  const handleConvertActiveCardToPersona = useCallback(async () => {
    if (!activeCardFull?.avatar) return;
    try {
      const res = await convertCardToPersona(activeCardFull.avatar);
      if (Array.isArray(res?.personas)) {
        onPersonasUpdatedRef.current?.(res.personas);
      }
      setCardSaveStatus(
        `Converted to persona "${res?.createdPersonaAvatar || activeCardFull.name}"`,
      );
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
        commitLoadedActiveCard(refreshed);
      }
      await loadCardsAndPersonas();
      setCardSaveStatus('Refreshed chat portraits');
      setTimeout(() => setCardSaveStatus(''), 2000);
    } catch {
      // ignore
    }
  }, [activeCardFull?.avatar, commitLoadedActiveCard, loadCardsAndPersonas]);

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
            commitLoadedActiveCard(fresh);
          }
          await loadCardsAndPersonas();
        }
      } catch (err) {
        setCardSaveStatus(`Tag error: ${err.message}`);
      } finally {
        setBusyLinksAction(false);
      }
    },
    [activeCardFull?.avatar, commitLoadedActiveCard, loadCardsAndPersonas],
  );

  const handleImportEmbeddedTagsOnActiveCard = useCallback(async () => {
    if (!activeCardFull?.avatar) return;
    setBusyLinksAction(true);
    try {
      const res = await importEmbeddedCardTags(activeCardFull.avatar);
      if (Array.isArray(res?.tags)) setTags(res.tags);
      if (res?.card) {
        commitLoadedActiveCard(res.card);
      }
      await loadCardsAndPersonas();
      setCardSaveStatus('Imported embedded tags');
      setTimeout(() => setCardSaveStatus(''), 2200);
    } catch (err) {
      setCardSaveStatus(`Import tags error: ${err.message}`);
    } finally {
      setBusyLinksAction(false);
    }
  }, [activeCardFull?.avatar, commitLoadedActiveCard, loadCardsAndPersonas]);

  const handleChangePrimaryWorld = useCallback(
    async (worldName) => {
      if (!activeCardFull?.avatar) return;
      setBusyLinksAction(true);
      try {
        const updated = await updateCharacterLoreBindings(activeCardFull.avatar, {
          primaryWorld: worldName || '',
        });
        if (updated) {
          commitLoadedActiveCard(updated);
        }
        setCardSaveStatus(
          worldName ? `Primary world set to "${worldName}"` : 'Cleared primary world',
        );
        setTimeout(() => setCardSaveStatus(''), 2000);
      } catch (err) {
        setCardSaveStatus(`Lore error: ${err.message}`);
      } finally {
        setBusyLinksAction(false);
      }
    },
    [activeCardFull?.avatar, commitLoadedActiveCard],
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
            cleanCardObjRef.current = {
              ...cleanCardObjRef.current,
              auxWorlds: updated.auxWorlds,
            };
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
        commitLoadedActiveCard(res.card);
      }
      setCardSaveStatus(`Extracted "${res?.worldName}" (${res?.entriesCount} entries)`);
      setTimeout(() => setCardSaveStatus(''), 2500);
    } catch (err) {
      setCardSaveStatus(`Import lore error: ${err.message}`);
    } finally {
      setBusyLinksAction(false);
    }
  }, [activeCardFull?.avatar, commitLoadedActiveCard]);

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
        retireRestorePointers();
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
    [
      retireRestorePointers,
      recordSessionPointer,
      setPersonaModalOpen,
      runWithWorkspaceUnsavedGuard,
      workspaceGuardBridgeRef,
    ],
  );

  const handleGalleryOpenCard = useCallback(
    (id) => {
      const isChangingCard = Boolean(id && id !== selectedCardIdRef.current);
      const { activeKind, isCardDirty } = workspaceGuardBridgeRef.current;
      const guardKind =
        activeKind || (isChangingCard && isCardDirty ? 'expandedCharacter' : null);

      const proceed = () => {
        retireRestorePointers();
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
    [
      retireRestorePointers,
      recordSessionPointer,
      setChatListOpen,
      setTimelinesOpen,
      setSheetExpanded,
      setEditingPromptSelection,
      setPersonaModalOpen,
      setLeftTab,
      runWithWorkspaceUnsavedGuard,
      workspaceGuardBridgeRef,
    ],
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

  const handleToggleActiveCardPin = useCallback(() => {
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
      setCleanCardSnapshot(serializeCardEditableSnapshot(cleanCardObjRef.current));
    }
    handleGalleryTogglePin(activeCardFull.avatar || activeCardFull.id, nextFav);
  }, [activeCardFull, handleGalleryTogglePin]);

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
          Promise.resolve(onRefreshOpenaiPresetsRef.current?.()),
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
    [
      isMobile,
      setChatListOpen,
      setTimelinesOpen,
      setEditingPromptSelection,
      setSheetExpanded,
      setPersonaModalOpen,
      setLeftOpen,
      setRightOpen,
      runWithWorkspaceUnsavedGuard,
    ],
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
          commitLoadedActiveCard(res.card);
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
    [commitLoadedActiveCard, loadCardsAndPersonas, setLeftTab, setRightTab, pushToast],
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
          commitLoadedActiveCard(res.imported[0]);
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
    [commitLoadedActiveCard, loadCardsAndPersonas, pushToast],
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
      const isSelectedInMulti = multiSelectActive && multiSelectedIds.includes(card.id);
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
    [multiSelectActive, multiSelectedIds, handleToggleMultiSelectCard, handleDuplicateCard],
  );

  const galleryHandlersRef = useRef({});
  galleryHandlersRef.current = {
    selectCard: handleSelectCard,
    openCard: handleGalleryOpenCard,
    togglePin: handleGalleryTogglePin,
    toggleMultiSelect: handleToggleMultiSelectCard,
    kebabForCard: kebabItemsForCard,
    importFiles: handleImportScenarioFiles,
  };

  const stableHandleSelectCard = useCallback(
    (id) => galleryHandlersRef.current.selectCard(id),
    [],
  );
  const stableHandleGalleryOpenCard = useCallback(
    (id) => galleryHandlersRef.current.openCard(id),
    [],
  );
  const stableHandleGalleryTogglePin = useCallback(
    (id, forcePin) => galleryHandlersRef.current.togglePin(id, forcePin),
    [],
  );
  const stableHandleToggleMultiSelectCard = useCallback(
    (id, ev) => galleryHandlersRef.current.toggleMultiSelect(id, ev),
    [],
  );
  const stableKebabItemsForCard = useCallback(
    (card) => galleryHandlersRef.current.kebabForCard(card),
    [],
  );
  const stableHandleDropImportGalleryFiles = useCallback(
    (files) => galleryHandlersRef.current.importFiles(files, { importEmbeddedTags: true }),
    [],
  );

  const handleAssignTagToCard = useCallback(async (cardId, tagId) => {
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
  }, []);

  const handleRemoveTagFromCard = useCallback(async (cardId, tagId) => {
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
  }, []);

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
      forgetDeletedCharactersSession(id);

      if (selectedCardId === id) {
        const nextCardId = remainingCards[0]?.id || '';
        setSelectedCardId(nextCardId);
        commitLoadedActiveCard(null);
        setSheetExpanded(false);
        setEditingPromptSelection(null);
        setEditingIntroTarget(null);
        setLeftTab('characters');
        onResetActiveCardChatSessionRef.current?.();
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
            Promise.resolve(onRefreshOpenaiPresetsRef.current?.()),
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
    [
      cards,
      selectedCardId,
      pinnedLayout,
      forgetDeletedCharactersSession,
      commitLoadedActiveCard,
      setSheetExpanded,
      setEditingPromptSelection,
      setLeftTab,
      loadCardsAndPersonas,
      pushToast,
    ],
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

    pinnedLayout.bulkUnpinCards(allIds, { syncServer: false });

    const remainingCards = cards.filter((c) => !removeSet.has(c.id));
    setCards(remainingCards);
    setGroups((prev) => prev.filter((g) => !removeSet.has(g.id)));
    forgetDeletedCharactersSession(cardIds);

    if (selectedCardId && removeSet.has(selectedCardId)) {
      setSelectedCardId(remainingCards[0]?.id || '');
      commitLoadedActiveCard(null);
      setSheetExpanded(false);
      setEditingPromptSelection(null);
      setEditingIntroTarget(null);
      onResetActiveCardChatSessionRef.current?.();
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
          Promise.resolve(onRefreshOpenaiPresetsRef.current?.()),
        ]);
        setGalleryStatus(`Deleted ${items.length} item(s)`);
      } catch (err) {
        setGalleryStatus(`Bulk delete failed: ${err.message}`);
      }
    }
  }, [
    bulkDeleteDialog,
    cards,
    selectedCardId,
    pinnedLayout,
    forgetDeletedCharactersSession,
    commitLoadedActiveCard,
    setSheetExpanded,
    setEditingPromptSelection,
    handleExitMultiSelect,
    loadCardsAndPersonas,
  ]);

  const multiSelectPopover = useMemo(() => {
    if (!multiSelectActive || !multiSelectSubpopover || multiSelectedIds.length === 0) {
      return null;
    }
    const userFolders = (pinnedLayout.resolvedEntries || []).filter(
      (e) => e.type === 'folder',
    );
    return React.createElement(MultiSelectPopoverContent, {
      subpopover: multiSelectSubpopover,
      selectedCount: multiSelectedIds.length,
      userFolders,
      folderInput: multiFolderInput,
      onChangeFolderInput: setMultiFolderInput,
      onMoveToFolder: handleBulkMoveToFolder,
      tagInput: multiTagInput,
      onChangeTagInput: setMultiTagInput,
      tags,
      selectedCharacterCards,
      onCreateAndAssignTag: handleBulkCreateAndAssignTag,
      onToggleTagOnSelected: handleBulkToggleTagOnSelected,
      onBulkExport: handleBulkExport,
      onClose: () => setMultiSelectSubpopover(null),
    });
  }, [
    multiSelectActive,
    multiSelectSubpopover,
    multiSelectedIds.length,
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

  const handleConfirmRenameDialog = useCallback(() => {
    if (!renameDialog) return;
    const nextName = String(renameDialog.name || '').trim();
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
  }, [renameDialog, handleRenameCard, handleRenameTagFolder, pinnedLayout]);

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

  const selectedCharacterObj =
    (selectedCardId && cards.find((c) => c.id === selectedCardId)) || cards[0] || null;
  const hasActiveScenario = Boolean(selectedCharacterObj && selectedCardId);
  const activeCharacter = selectedCharacterObj || EMPTY_CHARACTER_FALLBACK;
  const matchedActiveCardFull =
    activeCardFull && activeCardFull.avatar === selectedCardId ? activeCardFull : null;

  const isActiveCardDirty = Boolean(
    activeCardFull &&
      cleanCardSnapshot &&
      serializeCardEditableSnapshot(activeCardFull) !== cleanCardSnapshot,
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
      const targetKind =
        nextTarget && sheetExpanded
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
      setChatListOpen,
      setTimelinesOpen,
      setEditingPromptSelection,
      setPersonaModalOpen,
      setRightOpen,
      scrollToChatBottom,
      runWithWorkspaceUnsavedGuard,
      workspaceGuardBridgeRef,
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

  return {
    cards,
    setCards,
    loadingCards,
    selectedCardId,
    setSelectedCardId,
    selectedCardIdRef,
    activeCardFull,
    setActiveCardFull,
    cleanCardSnapshot,
    commitLoadedActiveCard,
    busyPortrait,
    busyLinksAction,
    setBusyLinksAction,
    worlds,
    activeIntroIdx,
    setActiveIntroIdx,
    editingIntroTarget,
    setEditingIntroTarget,
    cardSaveStatus,
    setCardSaveStatus,
    cardSaving,
    tags,
    groups,
    hiddenTagIds,
    galleryStatus,
    gallery,
    pinnedLayout,
    multiSelectActive,
    multiSelectedIds,
    multiSelectSubpopover,
    visibleSelectableIds,
    allResultsSelected,
    multiSelectPopover,
    multiSelectActions,
    renameDialog,
    setRenameDialog,
    renameDialogUnsavedOpen,
    setRenameDialogUnsavedOpen,
    handleConfirmRenameDialog,
    deleteDialog,
    setDeleteDialog,
    createGroupDialog,
    setCreateGroupDialog,
    createGroupUnsavedOpen,
    setCreateGroupUnsavedOpen,
    handleConfirmCreateGroup,
    bulkDeleteDialog,
    setBulkDeleteDialog,
    handleConfirmBulkDelete,
    createScenarioModalOpen,
    setCreateScenarioModalOpen,
    createScenarioModalMode,
    creatingScenario,
    createScenarioStatus,
    selectedCharacterObj,
    hasActiveScenario,
    activeCharacter,
    matchedActiveCardFull,
    isActiveCardDirty,
    resolvedEditingIntro,
    loadCardsAndPersonas,
    handleSaveCardToPng,
    handlePersistCardPatch,
    handleDiscardCardChanges,
    handleToggleSpoilerBlur,
    handleToggleActiveCardPin,
    handlePickMainPortraitFile,
    handleUploadGalleryPortraits,
    handleSelectGalleryPortrait,
    handleDeleteGalleryPortrait,
    handleUploadIntroPortrait,
    handlePickReplaceCardFile,
    handleConvertActiveCardToPersona,
    handleRefreshChatPortraits,
    handleUpdateActiveScenarioMeta,
    handleAssignTagOnActiveCard,
    handleRemoveTagOnActiveCard,
    handleCreateAndAssignTagOnActiveCard,
    handleImportEmbeddedTagsOnActiveCard,
    handleChangePrimaryWorld,
    handleUpdateAuxWorlds,
    handleImportEmbeddedLoreOnActiveCard,
    handleOpenCreateScenarioModal,
    handleCreateScenario,
    handleImportScenarioFiles,
    handleSelectCard,
    handleRenameCard,
    handleDeleteTag,
    handleCreateTag,
    handleRenameTagFolder,
    handleToggleTagHidden,
    handleExportCard,
    handleDuplicateCard,
    handleDeleteCard,
    handleToggleMultiSelectMode,
    handleExitMultiSelect,
    handleClearMultiSelect,
    handleSelectAllResults,
    stableHandleSelectCard,
    stableHandleGalleryOpenCard,
    stableHandleGalleryTogglePin,
    stableHandleToggleMultiSelectCard,
    stableKebabItemsForCard,
    stableHandleDropImportGalleryFiles,
    kebabItemsForTagFolder,
    kebabItemsForPinnedFolder,
    handleOpenIntroEditor,
    handleSaveEditedIntro,
  };
}

