import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useImperativeHandle,
  useSyncExternalStore,
  forwardRef,
  memo,
} from 'react';
import {
  subscribeCustomizationRuntime,
  getCustomizationRuntimeSnapshot,
} from '@core/customization/customizationRuntimeStore.js';
import {
  Icon,
  Button,
  ScrollIndicator,
  ConnectionModelPicker,
  PersonaPicker,
  AttachmentTray,
  ConsoleToggleButton,
  createAttachmentDraft,
  revokeAttachmentDraft,
} from '@ui/index.js';

const COMPOSER_DRAFT_STORAGE_KEY = 'nexustavern_composer_draft_v1';

function getComposerPrefsSnapshot() {
  const ai = getCustomizationRuntimeSnapshot()?.chatAndAi;
  return `${ai?.enterToSend || 'enter'}|${ai?.restoreUnsavedDraft !== false ? '1' : '0'}`;
}

function loadInitialComposerDraft() {
  try {
    if (getCustomizationRuntimeSnapshot()?.chatAndAi?.restoreUnsavedDraft === false) {
      return '';
    }
    return localStorage.getItem(COMPOSER_DRAFT_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function hasDraggedFiles(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files');
}

export const ChatComposer = memo(
  forwardRef(function ChatComposer(
    {
      hasActiveScenario = true,
      isGenerating = false,
      switchingScenario = false,
      loadingChat = false,
      characterName = 'Character',
      isMobile = false,
      emojiOpen = false,
      emojiBtnRef,
      onToggleEmoji,
      onCloseEmoji,
      consoleOpen = false,
      onToggleConsole,
      onSendMessage,
      onStopGeneration,
      modelLabel = 'No Model Selected',
      hubConnections = [],
      hubCustomFamilies = [],
      activeProviderId = '',
      activeModelId = '',
      activeModelName = '',
      onSelectHubModel,
      onUpdateHubConnection,
      onFetchHubModels,
      onDeleteHubConnection,
      onRevealHubKey,
      onPingHubConnections,
      onFetchHubTelemetry,
      onAddHubCustomFamily,
      onDeleteHubCustomFamily,
      onClickModelBadge,
      personas = [],
      activePersonaAvatar = '',
      personaName = 'User',
      personaAvatarUrl = null,
      cards = [],
      groups = [],
      activeCharacter = null,
      hasUserMessages = false,
      userMessageCount = 0,
      onSelectPersona,
      onConfirmReplacePersonaInChat,
      onToggleBindPersonaToActiveCard,
      onOpenManagePersonaModal,
      onOpenCreatePersonaModal,
      onDuplicatePersona,
      onDeletePersona,
      onClickPersonaBadge,
    },
    ref,
  ) {
    const [draftMsg, setDraftMsg] = useState(() => loadInitialComposerDraft());
    const [pendingAttachments, setPendingAttachments] = useState([]);
    const [composerDragOver, setComposerDragOver] = useState(false);
    const prefsKey = useSyncExternalStore(
      subscribeCustomizationRuntime,
      getComposerPrefsSnapshot,
      getComposerPrefsSnapshot,
    );
    const [globalEnterMode, restoreDraftFlag] = prefsKey.split('|');
    const [localEnterOverride, setLocalEnterOverride] = useState(null);
    const effectiveEnterMode = localEnterOverride || globalEnterMode || 'enter';
    const enterToSend = effectiveEnterMode === 'enter';
    const restoreUnsavedDraft = restoreDraftFlag === '1';

    const draftMsgRef = useRef(draftMsg);
    draftMsgRef.current = draftMsg;

    const pendingAttachmentsRef = useRef(pendingAttachments);
    pendingAttachmentsRef.current = pendingAttachments;

    const textareaRef = useRef(null);
    const attachFileInputRef = useRef(null);
    const composerSelectionRef = useRef(null);
    const composerDragCounterRef = useRef(0);

    useEffect(() => {
      return () => {
        pendingAttachmentsRef.current.forEach((item) => revokeAttachmentDraft(item));
      };
    }, []);

    useLayoutEffect(() => {
      if (!draftMsg && textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }, [draftMsg]);

    useEffect(() => {
      try {
        if (restoreUnsavedDraft && draftMsg) {
          localStorage.setItem(COMPOSER_DRAFT_STORAGE_KEY, draftMsg);
        } else {
          localStorage.removeItem(COMPOSER_DRAFT_STORAGE_KEY);
        }
      } catch {
        // Ignore storage errors
      }
    }, [draftMsg, restoreUnsavedDraft]);

    useEffect(() => {
      setLocalEnterOverride(null);
    }, [globalEnterMode]);

    const syncTextareaHeight = useCallback(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.style.height = 'auto';
      if (ta.value) {
        ta.style.height = `${Math.min(160, ta.scrollHeight)}px`;
      }
    }, []);


    const captureComposerSelection = useCallback(() => {
      const curText = draftMsgRef.current;
      const ta = textareaRef.current;
      if (ta && document.activeElement === ta) {
        const sel = {
          start: ta.selectionStart ?? curText.length,
          end: ta.selectionEnd ?? curText.length,
        };
        composerSelectionRef.current = sel;
        return sel;
      }
      if (composerSelectionRef.current) {
        return {
          start: Math.min(composerSelectionRef.current.start, curText.length),
          end: Math.min(composerSelectionRef.current.end, curText.length),
        };
      }
      return { start: curText.length, end: curText.length };
    }, []);

    const handleAddAttachments = useCallback(async (rawFiles) => {
      const list = Array.from(rawFiles || []).filter(Boolean);
      if (list.length === 0) return;
      const created = (await Promise.all(list.map((f) => createAttachmentDraft(f)))).filter(
        Boolean,
      );
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

    const focusKeyboard = useCallback(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const curText = draftMsgRef.current;
      const sel = composerSelectionRef.current || {
        start: curText.length,
        end: curText.length,
      };
      const start = Math.min(sel.start, curText.length);
      const end = Math.min(sel.end, curText.length);
      ta.focus();
      ta.setSelectionRange(start, end);
    }, []);

    const insertEmoji = useCallback(
      (emoji) => {
        const curText = draftMsgRef.current;
        const { start, end } = captureComposerSelection();
        const next = `${curText.slice(0, start)}${emoji}${curText.slice(end)}`;
        const cursor = start + emoji.length;
        composerSelectionRef.current = { start: cursor, end: cursor };
        setDraftMsg(next);

        window.requestAnimationFrame(() => {
          syncTextareaHeight();
          const searchActive =
            document.activeElement &&
            document.activeElement.classList?.contains('bb-emoji-picker__search-input');
          if (!isMobile && !searchActive && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(cursor, cursor);
          }
        });
      },
      [captureComposerSelection, isMobile, syncTextareaHeight],
    );

    useImperativeHandle(
      ref,
      () => ({
        getDraftText: () => draftMsgRef.current,
        setDraftText: (nextVal = '') => {
          const str = String(nextVal ?? '');
          composerSelectionRef.current = { start: str.length, end: str.length };
          setDraftMsg(str);
          window.requestAnimationFrame(syncTextareaHeight);
        },
        clearDraft: () => {
          setDraftMsg('');
          setPendingAttachments((prev) => {
            prev.forEach((item) => revokeAttachmentDraft(item));
            return [];
          });
        },
        addAttachments: handleAddAttachments,
        insertEmoji,
        focusKeyboard,
        captureSelection: captureComposerSelection,
        blurInput: () => textareaRef.current?.blur(),
      }),
      [
        captureComposerSelection,
        focusKeyboard,
        handleAddAttachments,
        insertEmoji,
        syncTextareaHeight,
      ],
    );

    const handleTextareaChange = (e) => {
      const val = e.target.value;
      composerSelectionRef.current = {
        start: e.target.selectionStart ?? val.length,
        end: e.target.selectionEnd ?? val.length,
      };
      setDraftMsg(val);
      const ta = textareaRef.current;
      if (ta) {
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(160, ta.scrollHeight)}px`;
      }
    };

    const handleFileInputChange = (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleAddAttachments(files);
      }
      e.target.value = '';
    };

    const handleTextareaPaste = (e) => {
      if (!hasActiveScenario) return;
      const items = e.clipboardData?.items;
      const files = [];
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i += 1) {
          const item = items[i];
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      } else if (e.clipboardData?.files?.length > 0) {
        files.push(...Array.from(e.clipboardData.files));
      }
      if (files.length > 0) {
        const plainText = e.clipboardData?.getData('text/plain') || '';
        if (!plainText) {
          e.preventDefault();
        }
        handleAddAttachments(files);
      }
    };

    const handleComposerDragEnter = (e) => {
      if (!hasActiveScenario || !hasDraggedFiles(e)) return;
      e.preventDefault();
      composerDragCounterRef.current += 1;
      setComposerDragOver(true);
    };

    const handleComposerDragOver = (e) => {
      if (!hasActiveScenario || !hasDraggedFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (!composerDragOver) setComposerDragOver(true);
    };

    const handleComposerDragLeave = (e) => {
      if (!hasDraggedFiles(e)) return;
      composerDragCounterRef.current = Math.max(0, composerDragCounterRef.current - 1);
      if (composerDragCounterRef.current === 0) {
        setComposerDragOver(false);
      }
    };

    const handleComposerDrop = (e) => {
      composerDragCounterRef.current = 0;
      setComposerDragOver(false);
      if (!hasActiveScenario) return;
      const dropped = e.dataTransfer?.files;
      if (dropped && dropped.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        handleAddAttachments(dropped);
      }
    };

    const handleToggleEnterToSend = useCallback(() => {
      setLocalEnterOverride((prev) => {
        const cur = prev || globalEnterMode || 'enter';
        return cur === 'enter' ? 'ctrl-enter' : 'enter';
      });
    }, [globalEnterMode]);

    const dispatchSubmit = useCallback(async () => {
      if (!hasActiveScenario || isGenerating || switchingScenario || loadingChat) return;
      if (!onSendMessage) return;

      const clean = draftMsgRef.current.trim();
      const attachmentsSnapshot = [...pendingAttachmentsRef.current];

      if (clean) {
        setDraftMsg('');
      }
      if (attachmentsSnapshot.length > 0) {
        setPendingAttachments([]);
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      try {
        const res = await onSendMessage({
          text: clean,
          attachments: attachmentsSnapshot,
        });
        if (res && res.ok === false && res.restoreDraft) {
          if (clean) setDraftMsg((prev) => prev || clean);
          if (attachmentsSnapshot.length > 0) {
            setPendingAttachments((prev) => [...attachmentsSnapshot, ...prev]);
          }
        }
      } catch {
        if (clean) setDraftMsg((prev) => prev || clean);
        if (attachmentsSnapshot.length > 0) {
          setPendingAttachments((prev) => [...attachmentsSnapshot, ...prev]);
        }
      }
    }, [hasActiveScenario, isGenerating, switchingScenario, loadingChat, onSendMessage]);

    const handleTextareaKeyDown = (e) => {
      if (e.key === 'Escape' && isGenerating && onStopGeneration) {
        e.preventDefault();
        onStopGeneration();
        return;
      }
      if (e.key === 'Enter') {
        if (effectiveEnterMode === 'button-only') return;
        const shouldSend =
          effectiveEnterMode === 'enter'
            ? !e.shiftKey && !isMobile
            : Boolean(e.ctrlKey || e.metaKey);
        if (shouldSend) {
          e.preventDefault();
          if (isGenerating) return;
          dispatchSubmit();
        }
      }
    };

    const handleFormSubmit = (e) => {
      e.preventDefault();
      if (isGenerating) {
        onStopGeneration?.();
        return;
      }
      dispatchSubmit();
    };

    return (
      <form
        className={`bb-chat-viewport__composer ${
          composerDragOver ? 'is-drag-over' : ''
        }`.trim()}
        onSubmit={handleFormSubmit}
        onDragEnter={handleComposerDragEnter}
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
      >
        <input
          ref={attachFileInputRef}
          type="file"
          multiple
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleFileInputChange}
        />
        {composerDragOver && (
          <div className="bb-chat-viewport__drop-hint" aria-hidden="true">
            <Icon name="paperclip" size={16} />
            <span>Drop files or images to attach</span>
          </div>
        )}
        <AttachmentTray items={pendingAttachments} onRemove={handleRemoveAttachment} />
        <div className="bb-chat-viewport__composer-row">
          <Button
            type="button"
            variant="b2"
            size="lg"
            borderless
            active={pendingAttachments.length > 0}
            disabled={!hasActiveScenario}
            icon="paperclip"
            title="Attach files or images (or paste / drag & drop)"
            aria-label="Attach files or images"
            className="bb-chat-viewport__composer-icon-btn"
            onClick={() => attachFileInputRef.current?.click()}
          />
          <div className="bb-chat-viewport__input-stage">
            <textarea
              ref={textareaRef}
              rows={1}
              value={draftMsg}
              disabled={!hasActiveScenario}
              onChange={handleTextareaChange}
              onPaste={handleTextareaPaste}
              onSelect={captureComposerSelection}
              onKeyUp={captureComposerSelection}
              onMouseUp={captureComposerSelection}
              onFocus={() => {
                if (isMobile && emojiOpen) {
                  onCloseEmoji?.();
                }
              }}
              onKeyDown={handleTextareaKeyDown}
              placeholder=""
              aria-label={`Write a message to ${characterName}`}
              className="bb-chat-viewport__textarea bb-scrollbar--hidden"
            />
            <ScrollIndicator
              scrollRef={textareaRef}
              variant="compact"
              watchValue={draftMsg}
            />
            {!draftMsg && (
              <div className="bb-chat-viewport__placeholder" aria-hidden="true">
                <span className="bb-chat-viewport__placeholder-text">
                  {!hasActiveScenario
                    ? 'Select or create a scenario card to begin...'
                    : isGenerating
                      ? `${characterName} is responding... (Press Esc or Stop to halt)`
                      : enterToSend
                        ? `Write a message to ${characterName}... (Enter to send, Shift+Enter for new line)`
                        : `Write a message to ${characterName}... (Ctrl+Enter to send, Enter for new line)`}
                </span>
                {!isGenerating && (
                  <button
                    type="button"
                    className={`bb-chat-viewport__send-mode-btn ${
                      !enterToSend ? 'is-newline-mode' : ''
                    }`.trim()}
                    title={
                      enterToSend
                        ? 'Enter to send is ON • Click to switch Enter to new line'
                        : 'Enter to send is OFF (Enter = new line, Ctrl+Enter = send) • Click to enable Enter to send'
                    }
                    aria-label="Toggle Enter to send"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleToggleEnterToSend}
                  >
                    <Icon name="shuffle" size={13} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="bb-chat-viewport__composer-actions">
            <Button
              ref={emojiBtnRef}
              type="button"
              variant="b2"
              size="lg"
              borderless
              active={emojiOpen}
              disabled={!hasActiveScenario}
              icon={isMobile && emojiOpen ? 'keyboard' : 'smile'}
              title={
                isMobile && emojiOpen ? 'Switch back to keyboard' : 'Insert emoji'
              }
              aria-label={
                isMobile && emojiOpen ? 'Switch back to keyboard' : 'Insert emoji'
              }
              className="bb-chat-viewport__composer-icon-btn"
              onMouseDown={(e) => {
                captureComposerSelection();
                if (!isMobile) e.preventDefault();
              }}
              onClick={onToggleEmoji}
            />
            {isGenerating ? (
              <Button
                key="composer-stop"
                type="button"
                variant="b2"
                size="lg"
                borderless
                icon="stop"
                title="Stop generation (Esc)"
                aria-label="Stop generation"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onStopGeneration?.();
                }}
              />
            ) : (
              <Button
                key="composer-send"
                type="submit"
                variant="b2"
                size="lg"
                borderless
                disabled={!hasActiveScenario}
                icon="send"
                title={
                  draftMsg.trim() || pendingAttachments.length > 0
                    ? 'Send message (Enter)'
                    : `Generate ${characterName}'s reply`
                }
                aria-label="Send message"
              />
            )}
          </div>
        </div>

        <div className="bb-chat-viewport__composer-chips">
          <div className="bb-chat-viewport__composer-chips-left">
            <ConnectionModelPicker
              connections={hubConnections}
              customFamilies={hubCustomFamilies}
              activeConnectionId={activeProviderId}
              activeModelId={activeModelId}
              activeModelName={activeModelName || modelLabel}
              placement="top"
              onSelectConnection={onSelectHubModel}
              onUpdateConnection={onUpdateHubConnection}
              onFetchConnectionModels={onFetchHubModels}
              onDeleteConnection={onDeleteHubConnection}
              onRevealConnectionKey={onRevealHubKey}
              onPingConnections={onPingHubConnections}
              onFetchTelemetry={onFetchHubTelemetry}
              onAddCustomFamily={onAddHubCustomFamily}
              onDeleteCustomFamily={onDeleteHubCustomFamily}
              onOpenAddConnection={onClickModelBadge}
            />

            <ConsoleToggleButton
              open={consoleOpen}
              onClick={onToggleConsole}
              title={
                consoleOpen
                  ? 'Hide live output console'
                  : 'Open live output console (prompts, LLM outputs & workspace logs)'
              }
            />
          </div>

          <PersonaPicker
            personas={personas}
            activePersonaAvatar={activePersonaAvatar}
            personaName={personaName}
            personaAvatarUrl={personaAvatarUrl}
            cards={cards}
            groups={groups}
            activeCharacter={activeCharacter}
            hasUserMessages={hasUserMessages}
            userMessageCount={userMessageCount}
            disabled={isGenerating}
            onSelectPersona={onSelectPersona}
            onConfirmReplacePersonaInChat={onConfirmReplacePersonaInChat}
            onToggleBindActiveCharacter={onToggleBindPersonaToActiveCard}
            onOpenManageModal={onOpenManagePersonaModal || onClickPersonaBadge}
            onOpenCreateModal={onOpenCreatePersonaModal || onClickPersonaBadge}
            onDuplicatePersona={onDuplicatePersona}
            onDeletePersona={onDeletePersona}
          />
        </div>
      </form>
    );
  }),
);

