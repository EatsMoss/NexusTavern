import { useState, useRef, useEffect, useCallback } from 'react';
import {
  streamApiHubGeneration,
  stopApiHubGeneration,
  fetchConnectionTelemetry,
} from '@core/api/apiHubApi.js';
import { fetchCharacterChats } from '@core/chats/chatsApi.js';
import {
  getCustomizationRuntimeSnapshot,
  maybePlayCompletionChime,
} from '@core/customization/customizationRuntimeStore.js';

const STREAM_STALL_THRESHOLD_MS = 850;

function applyOptimisticStreamStart(setMessages, {
  mode,
  tempStreamId,
  activeCharacterName,
  targetMessageIndex,
  streamApiName,
  streamModelName,
  onCaptureContinueBase,
}) {
  if (mode === 'reply') {
    setMessages((prev) => {
      const nextIdx =
        prev.length > 0 && Number.isInteger(prev[prev.length - 1]?.index)
          ? prev[prev.length - 1].index + 1
          : prev.length;
      return [
        ...prev,
        {
          id: tempStreamId,
          index: nextIdx,
          sender: activeCharacterName || 'Character',
          isUser: false,
          isStreaming: true,
          streamPhase: 'waiting',
          streamStalled: false,
          time: 'Now',
          tokens: 0,
          text: '',
          reasoning: '',
          swipeId: 0,
          swipeCount: 1,
          api: streamApiName,
          model: streamModelName,
          fallbackInfo: null,
        },
      ];
    });
    return;
  }

  setMessages((prev) =>
    prev.map((m, idx) => {
      const isTarget =
        targetMessageIndex !== null ? m.index === targetMessageIndex : idx === prev.length - 1;
      if (!isTarget) return m;
      if (mode === 'continue') {
        onCaptureContinueBase(m.text || '', m.reasoning || '');
        return { ...m, isStreaming: true, streamPhase: 'waiting', streamStalled: false };
      }
      return {
        ...m,
        isStreaming: true,
        streamPhase: 'waiting',
        streamStalled: false,
        text: '',
        reasoning: '',
        fallbackInfo: null,
        swipeId: m.swipeCount || 1,
        swipeCount: (m.swipeCount || 1) + 1,
      };
    }),
  );
}

function applyStreamDonePayload({
  evt,
  mode,
  tempStreamId,
  targetMessageIndex,
  baseText,
  streamText,
  streamReasoning,
  streamApiName,
  streamModelName,
  streamFallbackInfo = null,
  isRealCard,
  selectedCardId,
  targetFile,
  mapServerMsgToUi,
  setMessages,
  setChatMetaStats,
  openChatFileWindow,
}) {
  if (evt.message) {
    const committedUi = mapServerMsgToUi(evt.message);
    setMessages((prev) =>
      prev.map((m, idx) => {
        if (mode === 'reply') {
          return m.id === tempStreamId ? { ...committedUi, id: m.id } : m;
        }
        const isTarget =
          targetMessageIndex !== null ? m.index === targetMessageIndex : idx === prev.length - 1;
        return isTarget ? { ...committedUi, id: m.id } : m;
      }),
    );
    if (evt.totalMessages) {
      setChatMetaStats((prev) => ({
        ...prev,
        totalMessages: evt.totalMessages,
        endIndex: evt.totalMessages,
        elapsedMs: evt.durationMs || 0,
        syncStatus: `${evt.stopped ? 'Stopped & saved' : 'Generated'} via ${evt.model || 'LLM'} (${evt.durationMs || 0} ms)`,
      }));
    }
    return;
  }

  const finalBody = evt.text ?? (mode === 'continue' ? `${baseText}${streamText}` : streamText);
  if (!finalBody && !evt.reasoning) {
    if (mode === 'reply') {
      setMessages((prev) => prev.filter((m) => m.id !== tempStreamId));
    } else if (isRealCard && targetFile) {
      openChatFileWindow(selectedCardId, targetFile, { force: true });
    }
    return;
  }

  setMessages((prev) =>
    prev.map((m, idx) => {
      const isMatch =
        mode === 'reply'
          ? m.id === tempStreamId
          : targetMessageIndex !== null
            ? m.index === targetMessageIndex
            : idx === prev.length - 1;
      if (!isMatch) return { ...m, isStreaming: false, streamPhase: null, streamStalled: false };

      const nextSwipes =
        mode === 'swipe' && Array.isArray(m.swipes)
          ? [...m.swipes, finalBody]
          : mode === 'continue' && Array.isArray(m.swipes)
            ? m.swipes.map((sw, sIdx) => (sIdx === (m.swipeId || 0) ? finalBody : sw))
            : m.swipes;

      return {
        ...m,
        isStreaming: false,
        streamPhase: null,
        streamStalled: false,
        text: finalBody,
        ...(nextSwipes ? { swipes: nextSwipes, swipeCount: nextSwipes.length } : {}),
        reasoning: evt.reasoning || streamReasoning,
        durationMs: evt.durationMs || null,
        reasoningDurationMs: evt.reasoningDurationMs || null,
        tokens: Math.max(1, Math.ceil(finalBody.length / 3.8)),
        api: evt.api || streamApiName,
        model: evt.model || streamModelName,
        fallbackInfo:
          evt.fallbackInfo ||
          streamFallbackInfo ||
          (mode === 'continue' ? m.fallbackInfo || null : null),
      };
    }),
  );
}

/**
 * Word-aware, frame-rate independent stream pacer.
 * Advances along complete word boundaries whenever possible so each mounted
 * `.bb-stream-word` span receives its full word and plays a smooth 320ms M3
 * fade+blur reveal instead of mutating letter-by-letter mid-animation.
 */
function advanceWordPacedSlice(displayed = '', target = '', budgetChars = 0, forceFlushTail = false) {
  if (!target || displayed.length >= target.length) {
    return { next: target, consumed: 0 };
  }
  if (!target.startsWith(displayed)) {
    return { next: target, consumed: target.length };
  }
  if (budgetChars < 1) {
    return { next: displayed, consumed: 0 };
  }

  const start = displayed.length;
  const maxEnd = Math.min(target.length, start + Math.floor(budgetChars));
  let cursor = start;

  while (cursor < maxEnd) {
    let tokenEnd = cursor;
    while (tokenEnd < target.length && /\s/.test(target[tokenEnd])) {
      tokenEnd += 1;
    }
    const wordStart = tokenEnd;
    while (tokenEnd < target.length && !/\s/.test(target[tokenEnd])) {
      tokenEnd += 1;
    }

    const wordLen = tokenEnd - wordStart;
    const isUnterminatedTailWord = tokenEnd === target.length && wordLen > 0;

    // Wait briefly for the trailing word's closing whitespace from the next SSE
    // chunk unless we are draining after `done` or the word itself is very long.
    if (isUnterminatedTailWord && !forceFlushTail && wordLen < 18) {
      break;
    }

    if (tokenEnd <= maxEnd || (cursor === start && tokenEnd - start <= budgetChars + 8)) {
      cursor = tokenEnd;
      if (tokenEnd >= target.length) break;
    } else if (cursor === start && wordLen >= 18) {
      cursor = maxEnd;
      break;
    } else {
      break;
    }
  }

  if (cursor === start && forceFlushTail) {
    cursor = maxEnd;
  }

  return {
    next: target.slice(0, cursor),
    consumed: cursor - start,
  };
}

function advanceReasoningSlice(displayed = '', target = '') {
  if (!target || displayed.length >= target.length) return target;
  if (!target.startsWith(displayed)) return target;
  const remaining = target.length - displayed.length;
  const step = Math.max(4, Math.ceil(remaining * 0.35));
  return target.slice(0, Math.min(target.length, displayed.length + step));
}

function flushStreamFrame({
  mode,
  tempStreamId,
  targetMessageIndex,
  baseText,
  baseReasoning,
  streamText,
  streamReasoning,
  streamPhase,
  streamStalled = false,
  streamApiName,
  streamModelName,
  streamFallbackInfo = null,
  setMessages,
}) {
  const displayBody = mode === 'continue' ? `${baseText}${streamText}` : streamText;
  const displayReasoning =
    mode === 'continue'
      ? [baseReasoning, streamReasoning].filter(Boolean).join('\n\n')
      : streamReasoning;
  const approxTok = displayBody ? Math.max(1, Math.ceil(displayBody.length / 3.8)) : 0;

  setMessages((prev) =>
    prev.map((m, idx) => {
      if (mode === 'reply') {
        return m.id === tempStreamId
          ? {
              ...m,
              streamPhase,
              streamStalled,
              text: displayBody,
              reasoning: displayReasoning,
              tokens: approxTok,
              api: streamApiName,
              model: streamModelName,
              fallbackInfo: streamFallbackInfo,
            }
          : m;
      }
      const isTarget =
        targetMessageIndex !== null ? m.index === targetMessageIndex : idx === prev.length - 1;
      return isTarget
        ? {
            ...m,
            streamPhase,
            streamStalled,
            text: displayBody,
            reasoning: displayReasoning,
            tokens: approxTok,
            api: streamApiName || m.api,
            model: streamModelName || m.model,
            fallbackInfo:
              streamFallbackInfo || (mode === 'continue' ? m.fallbackInfo || null : null),
          }
        : m;
    }),
  );
}

async function recoverPostStreamState({
  streamErrorMsg,
  discardAttemptOutput = false,
  preStreamSnapshot = null,
  receivedDone,
  mode,
  streamText,
  tempStreamId,
  isRealCard,
  selectedCardId,
  targetFile,
  setGenerationError,
  setMessages,
  setChatFiles,
  openChatFileWindow,
}) {
  if (streamErrorMsg) {
    setGenerationError(streamErrorMsg);
    if (mode === 'reply' && (discardAttemptOutput || !streamText.trim())) {
      setMessages((prev) => prev.filter((m) => m.id !== tempStreamId));
    } else if (isRealCard && targetFile) {
      await openChatFileWindow(selectedCardId, targetFile, { force: true });
    } else if (discardAttemptOutput && Array.isArray(preStreamSnapshot)) {
      setMessages(preStreamSnapshot);
    } else {
      setMessages((prev) =>
        prev.map((m) => ({ ...m, isStreaming: false, streamPhase: null, streamStalled: false })),
      );
    }
  } else if (!receivedDone) {
    if (isRealCard && targetFile) {
      await openChatFileWindow(selectedCardId, targetFile, { force: true });
    } else if (!streamText.trim() && mode === 'reply') {
      setMessages((prev) => prev.filter((m) => m.id !== tempStreamId));
    } else {
      setMessages((prev) =>
        prev.map((m) => ({ ...m, isStreaming: false, streamPhase: null, streamStalled: false })),
      );
    }
  }

  if (isRealCard && targetFile) {
    fetchCharacterChats(selectedCardId, { offset: 0, limit: null })
      .then((listRes) => {
        if (Array.isArray(listRes?.chats)) setChatFiles(listRes.chats);
      })
      .catch(() => {});
  }
}

export function useChatStreaming({
  selectedCardId,
  activeChatFile,
  activeCharacterName,
  activeCardFull,
  messages,
  activeOpenaiDoc,
  apiHubState,
  setApiHubState,
  setMessages,
  setChatMetaStats,
  setChatFiles,
  mapServerMsgToUi,
  openChatFileWindow,
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [generationNotice, setGenerationNotice] = useState('');
  const genAbortRef = useRef(null);
  const genRequestIdRef = useRef('');
  const activeStreamCardRef = useRef('');
  const latestContextRef = useRef({ selectedCardId, activeChatFile });
  latestContextRef.current = { selectedCardId, activeChatFile };
  const lastStoppedAtMsRef = useRef(0);
  const genRafRef = useRef(null);
  const genStallTimerRef = useRef(null);
  const lastGenRequestRef = useRef(null);

  useEffect(() => {
    return () => {
      if (genRequestIdRef.current) {
        stopApiHubGeneration(genRequestIdRef.current).catch(() => {});
        genRequestIdRef.current = '';
      }
      if (genAbortRef.current) genAbortRef.current.abort();
      if (genRafRef.current) cancelAnimationFrame(genRafRef.current);
      if (genStallTimerRef.current) clearTimeout(genStallTimerRef.current);
    };
  }, []);

  const stopGeneration = useCallback(() => {
    lastStoppedAtMsRef.current = performance.now();
    if (genStallTimerRef.current) {
      clearTimeout(genStallTimerRef.current);
      genStallTimerRef.current = null;
    }
    const activeReqId = genRequestIdRef.current;
    if (activeReqId) {
      genRequestIdRef.current = '';
      stopApiHubGeneration(activeReqId).catch(() => {});
    }
    if (genAbortRef.current) genAbortRef.current.abort();
  }, []);

  // Automatically abort any active stream when switching to a different character
  useEffect(() => {
    if (
      activeStreamCardRef.current &&
      selectedCardId &&
      activeStreamCardRef.current !== selectedCardId
    ) {
      stopGeneration();
    }
  }, [selectedCardId, stopGeneration]);

  const dismissGenerationError = useCallback(() => setGenerationError(''), []);
  const dismissGenerationNotice = useCallback(() => setGenerationNotice(''), []);
  const startGenerationStream = useCallback(
    async ({
      mode = 'reply',
      targetFile = activeChatFile,
      targetMessageIndex = null,
      overrideMessages = null,
    } = {}) => {
      if (performance.now() - lastStoppedAtMsRef.current < 80) {
        return;
      }
      if (genRequestIdRef.current) {
        stopApiHubGeneration(genRequestIdRef.current).catch(() => {});
        genRequestIdRef.current = '';
      }
      if (genAbortRef.current) genAbortRef.current.abort();
      if (genStallTimerRef.current) {
        clearTimeout(genStallTimerRef.current);
        genStallTimerRef.current = null;
      }
      const isRealCard = Boolean(
        selectedCardId && !/^(?:c\d+|c_\d+)$/.test(String(selectedCardId)),
      );
      lastGenRequestRef.current = { mode, targetFile, targetMessageIndex, overrideMessages };
      setGenerationError('');
      setGenerationNotice('');
      setIsGenerating(true);

      const streamCardId = selectedCardId;
      activeStreamCardRef.current = streamCardId || '';
      const requestId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      genRequestIdRef.current = requestId;
      const abortCtrl = new AbortController();
      genAbortRef.current = abortCtrl;
      const tempStreamId = `stream-${Date.now()}`;
      let streamText = '';
      let streamReasoning = '';
      let displayedText = '';
      let displayedReasoning = '';
      let baseText = '';
      let baseReasoning = '';
      let streamPhase = 'waiting';
      let streamStalled = false;
      let streamApiName = apiHubState?.activeProviderName || null;
      let streamModelName = apiHubState?.activeModelName || null;
      let streamFallbackInfo = null;
      let receivedDone = false;
      let donePayloadRef = null;
      let resolveDrainRef = null;
      const drainCompletePromise = new Promise((resolve) => {
        resolveDrainRef = resolve;
      });
      const clearStallTimer = () => {
        if (genStallTimerRef.current) {
          clearTimeout(genStallTimerRef.current);
          genStallTimerRef.current = null;
        }
      };
      abortCtrl.signal.addEventListener(
        'abort',
        () => {
          clearStallTimer();
          resolveDrainRef?.();
        },
        { once: true },
      );
      let lastDeltaAtMs = performance.now();
      let lastFrameAtMs = 0;
      let textBudgetCarry = 0;
      let streamErrorMsg = '';
      let discardAttemptOutput = false;
      const preStreamSnapshot = Array.isArray(messages) ? messages : null;

      applyOptimisticStreamStart(setMessages, {
        mode,
        tempStreamId,
        activeCharacterName,
        targetMessageIndex,
        streamApiName,
        streamModelName,
        onCaptureContinueBase: (txt, rsn) => {
          baseText = txt;
          baseReasoning = rsn;
        },
      });

      const scheduleUiFlush = () => {
        if (genRafRef.current) return;
        const stepPacer = (nowMs) => {
          genRafRef.current = null;
          if (abortCtrl.signal.aborted || latestContextRef.current.selectedCardId !== streamCardId) {
            resolveDrainRef?.();
            return;
          }

          const now = typeof nowMs === 'number' ? nowMs : performance.now();
          const dtMs =
            lastFrameAtMs > 0 ? Math.min(50, Math.max(4, now - lastFrameAtMs)) : 16.6;
          lastFrameAtMs = now;

          const rtAi = getCustomizationRuntimeSnapshot()?.chatAndAi;
          const smoothOn = rtAi?.smoothStreaming !== false;
          const bypassThinkSmooth = rtAi?.bypassSmoothingInThinking !== false;

          const remainingText = Math.max(0, streamText.length - displayedText.length);
          if (!smoothOn) {
            displayedText = streamText;
            textBudgetCarry = 0;
          } else if (remainingText > 0) {
            let charsPerSec;
            if (receivedDone) {
              charsPerSec = Math.max(210, remainingText * 5.2);
            } else if (remainingText <= 48) {
              charsPerSec = 115;
            } else if (remainingText <= 180) {
              charsPerSec = 115 + (remainingText - 48) * 2.2;
            } else {
              charsPerSec = 405 + (remainingText - 180) * 4.0;
            }

            textBudgetCarry = Math.min(
              remainingText + 16,
              textBudgetCarry + (charsPerSec * dtMs) / 1000,
            );
            const forceFlushTail = receivedDone || now - lastDeltaAtMs > 95;
            const stepped = advanceWordPacedSlice(
              displayedText,
              streamText,
              textBudgetCarry,
              forceFlushTail,
            );
            if (stepped.consumed > 0) {
              displayedText = stepped.next;
              textBudgetCarry = Math.max(0, textBudgetCarry - stepped.consumed);
            }
          } else {
            textBudgetCarry = 0;
          }

          displayedReasoning =
            receivedDone || !smoothOn || bypassThinkSmooth
              ? streamReasoning
              : advanceReasoningSlice(displayedReasoning, streamReasoning);

          flushStreamFrame({
            mode,
            tempStreamId,
            targetMessageIndex,
            baseText,
            baseReasoning,
            streamText: displayedText,
            streamReasoning: displayedReasoning,
            streamPhase,
            streamStalled,
            streamApiName,
            streamModelName,
            streamFallbackInfo,
            setMessages,
          });

          const hasPendingSlice =
            displayedText.length < streamText.length ||
            displayedReasoning.length < streamReasoning.length;

          if (hasPendingSlice) {
            clearStallTimer();
            genRafRef.current = requestAnimationFrame(stepPacer);
          } else {
            lastFrameAtMs = 0;
            if (receivedDone) {
              clearStallTimer();
              resolveDrainRef?.();
            } else if (
              streamPhase === 'streaming' &&
              Boolean(streamText.trim()) &&
              !streamStalled &&
              !genStallTimerRef.current
            ) {
              genStallTimerRef.current = setTimeout(() => {
                genStallTimerRef.current = null;
                if (
                  abortCtrl.signal.aborted ||
                  receivedDone ||
                  streamPhase !== 'streaming' ||
                  !streamText.trim() ||
                  displayedText.length < streamText.length ||
                  displayedReasoning.length < streamReasoning.length
                ) {
                  return;
                }
                streamStalled = true;
                flushStreamFrame({
                  mode,
                  tempStreamId,
                  targetMessageIndex,
                  baseText,
                  baseReasoning,
                  streamText: displayedText,
                  streamReasoning: displayedReasoning,
                  streamPhase,
                  streamStalled: true,
                  streamApiName,
                  streamModelName,
                  streamFallbackInfo,
                  setMessages,
                });
              }, STREAM_STALL_THRESHOLD_MS);
            }
          }
        };
        genRafRef.current = requestAnimationFrame(stepPacer);
      };

      try {
        await streamApiHubGeneration(
          {
            requestId,
            characterAvatar: isRealCard ? selectedCardId : '',
            cardOverride:
              activeCardFull || (activeCharacterName ? { name: activeCharacterName } : null),
            chatFileName: isRealCard ? targetFile : '',
            messagesOverride: !isRealCard || !targetFile ? overrideMessages || messages : null,
            presetOverride: activeOpenaiDoc
              ? { data: activeOpenaiDoc.data || {}, orderedPrompts: activeOpenaiDoc.orderedPrompts || [] }
              : null,
            mode,
            targetMessageIndex,
            persist: Boolean(isRealCard && targetFile),
          },
          {
            signal: abortCtrl.signal,
            onEvent: (evt) => {
              if (!evt || typeof evt !== 'object') return;
              if (evt.hub) setApiHubState(evt.hub);
              if (evt.type === 'phase') {
                if (evt.phase && streamPhase !== 'streaming') {
                  streamPhase = evt.phase;
                  scheduleUiFlush();
                }
              } else if (evt.type === 'start') {
                streamApiName = evt.api || streamApiName;
                streamModelName = evt.model || streamModelName;
                if (mode === 'continue' && typeof evt.baseText === 'string') baseText = evt.baseText;
                scheduleUiFlush();
              } else if (evt.type === 'fallback_reset') {
                clearStallTimer();
                streamText = '';
                displayedText = '';
                streamReasoning = '';
                displayedReasoning = '';
                textBudgetCarry = 0;
                streamPhase = 'waiting';
                streamStalled = false;
                streamApiName = evt.toApi || streamApiName;
                streamModelName = evt.toModel || streamModelName;
                streamFallbackInfo = evt.fallbackInfo || {
                  fromApi: evt.fromApi || '',
                  fromModel: evt.fromModel || '',
                  toApi: evt.toApi || '',
                  toModel: evt.toModel || '',
                  reason: 'Model refusal detected',
                  error: 'Primary model refused generation',
                };
                scheduleUiFlush();
              } else if (evt.type === 'delta') {
                if (evt.reasoningDelta || evt.textDelta) {
                  if (evt.textDelta) {
                    clearStallTimer();
                    streamStalled = false;
                  }
                  lastDeltaAtMs = performance.now();
                  if (evt.reasoningDelta) streamReasoning += evt.reasoningDelta;
                  if (evt.textDelta) streamText += evt.textDelta;
                  streamPhase = 'streaming';
                  scheduleUiFlush();
                }
              } else if (evt.type === 'error') {
                clearStallTimer();
                streamStalled = false;
                streamErrorMsg = evt.error || 'Generation failed';
                discardAttemptOutput = Boolean(evt.refusalDetected || evt.emptyResponse);
                resolveDrainRef?.();
              } else if (evt.type === 'done') {
                clearStallTimer();
                streamStalled = false;
                receivedDone = true;
                donePayloadRef = evt;
                if (evt.fallbackInfo) {
                  streamFallbackInfo = evt.fallbackInfo;
                }
                if (!streamText && typeof evt.appendedText === 'string' && evt.appendedText) {
                  streamText = evt.appendedText;
                  streamPhase = 'streaming';
                }
                if (
                  !evt.stopped &&
                  !abortCtrl.signal.aborted &&
                  (displayedText.length < streamText.length ||
                    displayedReasoning.length < streamReasoning.length)
                ) {
                  scheduleUiFlush();
                } else {
                  resolveDrainRef?.();
                }
              }
            },
          },
        );

        if (donePayloadRef && latestContextRef.current.selectedCardId === streamCardId) {
          if (!donePayloadRef.stopped && !abortCtrl.signal.aborted) {
            await drainCompletePromise;
            maybePlayCompletionChime(getCustomizationRuntimeSnapshot()?.chatAndAi);
          }
          if (genRafRef.current) {
            cancelAnimationFrame(genRafRef.current);
            genRafRef.current = null;
          }
          if (latestContextRef.current.selectedCardId === streamCardId) {
            applyStreamDonePayload({
              evt: donePayloadRef,
              mode,
              tempStreamId,
              targetMessageIndex,
              baseText,
              streamText,
              streamReasoning,
              streamApiName,
              streamModelName,
              streamFallbackInfo,
              isRealCard,
              selectedCardId: streamCardId,
              targetFile,
              mapServerMsgToUi,
              setMessages,
              setChatMetaStats,
              openChatFileWindow,
            });
          }
        }
      } catch (err) {
        if (err?.name !== 'AbortError' && !abortCtrl.signal.aborted) {
          streamErrorMsg = err?.message || 'Connection error during generation';
          const activeConnId = apiHubState?.activeConnectionId || '';
          if (activeConnId) {
            try {
              const telState = await fetchConnectionTelemetry(activeConnId);
              if (telState?.connections) {
                setApiHubState(telState);
                const checkedConn = telState.connections.find((c) => c.id === activeConnId);
                if (checkedConn?.health?.state === 'offline') {
                  streamErrorMsg = `${checkedConn.name}: Proxy is unavailable, please try again later.`;
                }
              }
            } catch {
              // Local server or tunnel unreachable — keep original network error message
            }
          }
        }
      } finally {
        clearStallTimer();
        if (genRafRef.current) {
          cancelAnimationFrame(genRafRef.current);
          genRafRef.current = null;
        }
        if (genRequestIdRef.current === requestId) genRequestIdRef.current = '';
        if (genAbortRef.current === abortCtrl) genAbortRef.current = null;
        if (activeStreamCardRef.current === streamCardId) activeStreamCardRef.current = '';
        setIsGenerating(false);
        if (latestContextRef.current.selectedCardId === streamCardId) {
          await recoverPostStreamState({
            streamErrorMsg,
            discardAttemptOutput,
            preStreamSnapshot,
            receivedDone,
            mode,
            streamText,
            tempStreamId,
            isRealCard,
            selectedCardId: streamCardId,
            targetFile,
            setGenerationError,
            setMessages,
            setChatFiles: (files) => {
              if (latestContextRef.current.selectedCardId === streamCardId) {
                setChatFiles(files);
              }
            },
            openChatFileWindow,
          });
        }
      }
    },
    [
      activeChatFile,
      selectedCardId,
      activeCharacterName,
      activeCardFull,
      messages,
      activeOpenaiDoc,
      apiHubState,
      setApiHubState,
      setMessages,
      setChatMetaStats,
      setChatFiles,
      mapServerMsgToUi,
      openChatFileWindow,
    ],
  );

  const retryLastGeneration = useCallback(() => {
    if (!lastGenRequestRef.current || isGenerating) return;
    startGenerationStream(lastGenRequestRef.current);
  }, [isGenerating, startGenerationStream]);

  return {
    isGenerating,
    generationError,
    setGenerationError,
    dismissGenerationError,
    generationNotice,
    dismissGenerationNotice,
    stopGeneration,
    startGenerationStream,
    retryLastGeneration,
  };
}




