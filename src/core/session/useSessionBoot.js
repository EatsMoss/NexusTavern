import { useState, useEffect, useCallback, useRef } from 'react';
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
  readCachedOnboardingDismissed,
  writeCachedOnboardingDismissed,
  pickNewestSessionSlice,
} from './sessionApi.js';
import { readCachedCustomization } from '@core/customization/customizationApi.js';

function isDemoAvatarId(id) {
  return /^(?:c\d+|c_\d+)$/.test(String(id || ''));
}

/**
 * Coordinates the startup boot pipeline, SplashScreen lifecycle, first-run
 * WelcomeModal onboarding state, UI layout persistence, and last-opened chat
 * restoration/recording across `localStorage` and `PUT /api/system/session`.
 */
export function useSessionBoot({
  isMobile,
  uiSnapshot,
  onHydrateServerUiState,
  loadCardsAndPersonasRef,
}) {
  // Boot splash state (coordinates seamless transition from #bb-early-splash -> full hydration)
  const [bootSplashOpen, setBootSplashOpen] = useState(true);
  const [bootSplashExiting, setBootSplashExiting] = useState(false);
  const [bootStage, setBootStage] = useState({
    statusText: 'Restoring encrypted session & workspace...',
    stepLabel: 'Stage 1 / 3 · Connecting to server',
  });
  const bootCompletedRef = useRef(false);

  // First-run onboarding modal state
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const onboardingDismissedRef = useRef(readCachedOnboardingDismissed());

  // Shared session fetch promise & debounced session patch queue
  const sessionPromiseRef = useRef(null);
  const pendingSessionPatchRef = useRef({});
  const sessionPatchTimerRef = useRef(null);
  const sessionBootCompletedRef = useRef(false);
  const uiBootHydratedRef = useRef(Boolean(readCachedUiState()));

  // Chat restoration & active session pointers
  const recordedSessionPointerRef = useRef(null);
  const lastChatsByAvatarRef = useRef(readCachedLastChatsMap());
  const restorePointerRef = useRef(null);
  const restoreCardAppliedRef = useRef(false);
  const restorePointerAppliedRef = useRef(false);

  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  const onHydrateServerUiStateRef = useRef(onHydrateServerUiState);
  onHydrateServerUiStateRef.current = onHydrateServerUiState;

  const ensureSessionPromise = useCallback(() => {
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = fetchSession().catch(() => null);
    }
    return sessionPromiseRef.current;
  }, []);

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
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const early = document.getElementById('bb-early-splash');
        if (early) {
          early.classList.add('is-hidden');
          setTimeout(() => early.remove(), 260);
        }
      });
    });
    // Safety fallback so a slow or unreachable backend never locks the splash forever
    const safetyTimer = setTimeout(() => {
      finishBootSplash();
    }, 8000);
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      clearTimeout(safetyTimer);
    };
  }, [finishBootSplash]);

  // Persist workspace UI layout slices once hydration has completed
  const {
    desktopLeftOpen,
    desktopRightOpen,
    leftOpen,
    rightOpen,
    leftTab,
    rightTab,
    activeSheetTab,
    aiSubTab,
    timelinesOpen,
    sheetExpanded,
    charSplitRatio,
  } = uiSnapshot;

  useEffect(() => {
    if (!uiBootHydratedRef.current) return;
    const nextUiState = writeCachedUiState({
      leftOpen: isMobile ? desktopLeftOpen : leftOpen,
      rightOpen: isMobile ? desktopRightOpen : rightOpen,
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
    desktopLeftOpen,
    desktopRightOpen,
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

  const markOnboardingDismissed = useCallback(
    (options = {}) => {
      const closeModal = options?.closeModal !== false;
      const wasDismissed = onboardingDismissedRef.current;
      onboardingDismissedRef.current = true;
      writeCachedOnboardingDismissed(true);
      if (closeModal) {
        setWelcomeModalOpen(false);
      }
      if (!wasDismissed || closeModal) {
        queueSessionPatch({ onboardingDismissed: true });
      }
    },
    [queueSessionPatch],
  );

  // Boot sequence: read the persisted session pointer FIRST, then load cards and
  // personas so `loadCardsAndPersonas` can select the restored character on first boot.
  useEffect(() => {
    if (sessionBootCompletedRef.current) return undefined;
    const sessionPromise = ensureSessionPromise();

    let cancelled = false;
    sessionPromise.then((res) => {
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

      const autoLoadEnabled =
        readCachedCustomization()?.chatAndAi?.autoLoadLastChat !== false;

      if (bestLastChat?.avatar && autoLoadEnabled) {
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
        onHydrateServerUiStateRef.current?.(res.uiState, isMobileRef.current);
        writeCachedUiState(res.uiState);
      }

      uiBootHydratedRef.current = true;
      setBootStage({
        statusText: 'Loading scenarios, personas & presets...',
        stepLabel: 'Stage 2 / 3 · Reading SillyTavern library',
      });

      const loader = loadCardsAndPersonasRef?.current;
      if (typeof loader !== 'function') {
        finishBootSplash();
        return undefined;
      }

      return loader().then((bootCardsInfo) => {
        if (cancelled) return undefined;
        if (!bootCardsInfo?.count) {
          finishBootSplash();
          if (!bootCardsInfo?.personasCount && !onboardingDismissedRef.current) {
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
  }, [ensureSessionPromise, loadCardsAndPersonasRef, queueSessionPatch, finishBootSplash]);

  /**
   * Consumes the one-time boot card pointer outside state updaters so React StrictMode
   * remains pure and never drops the restored character ID.
   */
  const consumeRestoredCardAvatar = useCallback((loadedChars) => {
    if (!Array.isArray(loadedChars) || loadedChars.length === 0) return '';
    const shouldRestoreBootCard = !restoreCardAppliedRef.current;
    if (shouldRestoreBootCard) {
      restoreCardAppliedRef.current = true;
    }
    const restoredAvatar = shouldRestoreBootCard ? restorePointerRef.current?.avatar : '';
    return restoredAvatar && loadedChars.some((c) => c.id === restoredAvatar)
      ? restoredAvatar
      : '';
  }, []);

  /**
   * Resolves the remembered chat filename for `avatarId` (preferring the one-time boot
   * pointer on initial load, then falling back to the per-character `lastChats` map).
   */
  const consumeRestoredChatFile = useCallback((avatarId) => {
    const restored = restorePointerRef.current;
    const bootRemembered =
      !restorePointerAppliedRef.current &&
      restored &&
      restored.avatar === avatarId &&
      restored.file
        ? restored.file
        : '';
    if (!restorePointerAppliedRef.current) {
      restorePointerAppliedRef.current = true;
      restorePointerRef.current = null;
    }
    return bootRemembered || lastChatsByAvatarRef.current?.[avatarId]?.file || '';
  }, []);

  const retireRestorePointers = useCallback(() => {
    restoreCardAppliedRef.current = true;
    restorePointerAppliedRef.current = true;
    restorePointerRef.current = null;
  }, []);

  const recordSessionPointer = useCallback((avatar, file = '', options = {}) => {
    const { clearCharacterChat = false } = options;
    if (!avatar || isDemoAvatarId(avatar)) return;
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

  const forgetDeletedCharactersSession = useCallback((avatarIds) => {
    const ids = Array.isArray(avatarIds) ? avatarIds.filter(Boolean) : [avatarIds].filter(Boolean);
    if (ids.length === 0) return;
    const removeSet = new Set(ids);
    for (const cid of ids) {
      lastChatsByAvatarRef.current = clearCachedCharacterLastChat(cid);
    }
    if (
      recordedSessionPointerRef.current?.avatar &&
      removeSet.has(recordedSessionPointerRef.current.avatar)
    ) {
      recordedSessionPointerRef.current = null;
      writeCachedLastChat(null);
    }
  }, []);

  const forgetDeletedCharacterChats = useCallback((avatarId, deletedFileNames = null) => {
    if (!avatarId) return;
    if (deletedFileNames === null) {
      lastChatsByAvatarRef.current = clearCachedCharacterLastChat(avatarId);
      return;
    }
    const list = Array.isArray(deletedFileNames) ? deletedFileNames : [];
    const rememberedForCard = lastChatsByAvatarRef.current?.[avatarId]?.file || '';
    if (rememberedForCard && list.includes(rememberedForCard)) {
      lastChatsByAvatarRef.current = clearCachedCharacterLastChat(avatarId);
    }
  }, []);

  const openWelcomeModal = useCallback(() => {
    setWelcomeModalOpen(true);
  }, []);

  return {
    bootSplashOpen,
    bootSplashExiting,
    bootStage,
    finishBootSplash,
    welcomeModalOpen,
    openWelcomeModal,
    markOnboardingDismissed,
    ensureSessionPromise,
    queueSessionPatch,
    consumeRestoredCardAvatar,
    consumeRestoredChatFile,
    retireRestorePointers,
    recordSessionPointer,
    clearSessionPointer,
    forgetDeletedCharactersSession,
    forgetDeletedCharacterChats,
  };
}

