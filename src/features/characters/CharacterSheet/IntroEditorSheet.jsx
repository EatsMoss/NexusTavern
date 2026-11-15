import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  Button,
  Icon,
  InlineEditableTitle,
  MarkdownEditor,
  OverlayScrollArea,
  SafeImage,
  estimateIntroTokens,
} from '@ui/index.js';

function serializeIntroSnapshot(draft) {
  if (!draft) return '';
  return JSON.stringify({
    title: String(draft.title || '').trim(),
    text: String(draft.text ?? ''),
    rawPortraitUrl: draft.rawPortraitUrl || null,
    portraitUrl: draft.portraitUrl || null,
  });
}

export const IntroEditorSheet = forwardRef(function IntroEditorSheet(
  {
    target = null,
    scenarioName = '',
    defaultPortraitUrl = null,
    fallbackInitials = 'CH',
    portraitGallery = [],
    busyPortrait = false,
    onClose,
    onSave,
    onNavigateIndex,
    onStartChat,
    onUploadPortraitFile,
    onDirtyChange,
  },
  ref,
) {
  const [draft, setDraft] = useState(null);
  const [baselineSnapshot, setBaselineSnapshot] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const fileInputRef = useRef(null);

  const identityKey = target
    ? `${target.cardId || ''}:${target.kind}:${target.index}`
    : '';
  const prevIdentityRef = useRef('');

  useEffect(() => {
    if (!target) {
      setDraft(null);
      setBaselineSnapshot('');
      prevIdentityRef.current = '';
      return;
    }

    const normalized = {
      title: target.title ?? '',
      text: target.text ?? '',
      rawPortraitUrl: target.rawPortraitUrl ?? target.portraitUrl ?? null,
      portraitUrl: target.portraitUrl ?? null,
    };
    const nextSnap = serializeIntroSnapshot(normalized);

    if (prevIdentityRef.current !== identityKey) {
      prevIdentityRef.current = identityKey;
      setGalleryOpen(false);
      setDraft(normalized);
      setBaselineSnapshot(nextSnap);
      return;
    }

    setDraft((prevDraft) => {
      const prevSnap = serializeIntroSnapshot(prevDraft);
      if (!prevDraft || prevSnap === baselineSnapshot) {
        setBaselineSnapshot(nextSnap);
        return normalized;
      }
      return prevDraft;
    });
  }, [target, identityKey, baselineSnapshot]);

  const currentSnapshot = useMemo(() => serializeIntroSnapshot(draft), [draft]);
  const isDirty = Boolean(
    draft && baselineSnapshot && currentSnapshot && currentSnapshot !== baselineSnapshot,
  );

  const commitDraft = useCallback(() => {
    if (!target || !draft) return;
    const cleaned = {
      kind: target.kind,
      index: target.index,
      title: String(draft.title || '').trim(),
      text: draft.text ?? '',
      rawPortraitUrl: draft.rawPortraitUrl || null,
      portraitUrl: draft.portraitUrl || null,
    };
    const savedState = {
      title: cleaned.title,
      text: cleaned.text,
      rawPortraitUrl: cleaned.rawPortraitUrl,
      portraitUrl: cleaned.portraitUrl,
    };
    setDraft(savedState);
    setBaselineSnapshot(serializeIntroSnapshot(savedState));
    onSave?.(cleaned);
  }, [target, draft, onSave]);

  const handleDiscard = useCallback(() => {
    if (!target) return;
    const restored = {
      title: target.title ?? '',
      text: target.text ?? '',
      rawPortraitUrl: target.rawPortraitUrl ?? target.portraitUrl ?? null,
      portraitUrl: target.portraitUrl ?? null,
    };
    setDraft(restored);
    setBaselineSnapshot(serializeIntroSnapshot(restored));
  }, [target]);

  useEffect(() => {
    const kind = target?.kind;
    const idx = Number(target?.index || 0);
    const fallbackLabel =
      kind === 'group'
        ? `Group Greeting #${idx + 1}`
        : idx === 0
          ? 'First Message'
          : `Intro #${idx + 1}`;
    const label = String(draft?.title || '').trim() || fallbackLabel;
    onDirtyChange?.({
      isDirty,
      canSave: Boolean(target && draft),
      cannotSaveReason: '',
      itemName: label,
      subtitle: scenarioName ? `Greeting Editor · ${scenarioName}` : 'Greeting Editor',
    });
  }, [isDirty, target, draft, scenarioName, onDirtyChange]);

  useImperativeHandle(
    ref,
    () => ({
      isDirty,
      canSave: Boolean(target && draft),
      save: async () => {
        if (!target || !draft) return false;
        commitDraft();
        return true;
      },
      discard: () => {
        handleDiscard();
      },
    }),
    [isDirty, target, draft, commitDraft, handleDiscard],
  );

  useEffect(() => {
    if (!target || !draft) return undefined;
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyS' || e.key?.toLowerCase() === 's')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isDirty) commitDraft();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [target, draft, isDirty, commitDraft]);

  if (!target || !draft) {
    return (
      <div className="bb-pm-sheet__empty">
        <Icon name="bookOpen" size={28} />
        <div className="bb-pm-sheet__empty-title">No Greeting Selected</div>
        <div className="bb-pm-sheet__empty-sub">
          Choose any greeting from the Intros tab in the Right Tome to edit it here.
        </div>
      </div>
    );
  }
  const { kind, index, totalCount = 1 } = target;
  const isFirst = kind === 'standard' && index === 0;
  const defaultTitle =
    kind === 'group'
      ? `Group Greeting #${index + 1}`
      : isFirst
        ? 'First Message'
        : `Intro #${index + 1}`;

  const badgeLabel =
    kind === 'group'
      ? `Group-Only #${index + 1}`
      : isFirst
        ? '#1 First Message'
        : `Alternate #${index + 1}`;

  const effectivePortrait = draft.portraitUrl || defaultPortraitUrl || null;
  const hasCustomPortrait = Boolean(draft.rawPortraitUrl || draft.portraitUrl);
  const tokens = estimateIntroTokens(draft.text);

  const handleStep = (delta) => {
    if (totalCount <= 1 || !onNavigateIndex) return;
    if (isDirty) commitDraft();
    const nextIdx = (index + delta + totalCount) % totalCount;
    onNavigateIndex(kind, nextIdx);
  };

  const handleUploadLocalFile = async (file) => {
    if (!file || !onUploadPortraitFile) return;
    const uploaded = await onUploadPortraitFile(kind, index, file, { applyImmediately: false });
    if (uploaded?.rawUrl || uploaded?.url) {
      setDraft((prev) => ({
        ...(prev || {}),
        rawPortraitUrl: uploaded.rawUrl || uploaded.url,
        portraitUrl: uploaded.url || uploaded.rawUrl,
      }));
    }
  };

  return (
    <div className={`bb-intro-sheet ${isDirty ? 'has-dirty-bar' : ''}`.trim()}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadLocalFile(f);
          e.target.value = '';
        }}
      />

      <header className="bb-intro-sheet__header">
        <button
          type="button"
          className="bb-intro-sheet__portrait"
          title="Click to choose or upload a custom 2:3 portrait for this greeting"
          onClick={() => setGalleryOpen((v) => !v)}
        >
          <SafeImage
            src={effectivePortrait}
            alt={defaultTitle}
            draggable={false}
            fallback={<span className="bb-intro-modal__portrait-fallback">{fallbackInitials}</span>}
          />
          {hasCustomPortrait && <span className="bb-intro-modal__portrait-dot" />}
        </button>

        <div className="bb-intro-sheet__head-main">
          <InlineEditableTitle
            value={draft.title || ''}
            onChange={(nextTitle) =>
              setDraft((prev) => ({ ...(prev || {}), title: nextTitle }))
            }
            placeholder={defaultTitle}
            size="lg"
            allowEmpty
            clearable
            editTooltip="Click to set an optional custom title for this greeting"
            trailing={
              <div className="bb-intro-sheet__head-actions">
                {totalCount > 1 && (
                  <div className="bb-intro-modal__stepper">
                    <Button
                      variant="b2"
                      size="sm"
                      icon="chevronLeft"
                      title="Previous greeting"
                      onClick={() => handleStep(-1)}
                    />
                    <span className="bb-intro-modal__step-count">
                      {index + 1} / {totalCount}
                    </span>
                    <Button
                      variant="b2"
                      size="sm"
                      icon="chevronRight"
                      title="Next greeting"
                      onClick={() => handleStep(1)}
                    />
                  </div>
                )}

                {kind === 'standard' && onStartChat && (
                  <Button
                    variant="b2"
                    size="sm"
                    icon="chatPlus"
                    disabled={!String(draft.text || '').trim()}
                    title="Save & start a new chat from this greeting"
                    onClick={() => {
                      if (isDirty) commitDraft();
                      onStartChat({
                        index,
                        text: draft.text,
                        rawPortraitUrl: draft.rawPortraitUrl || null,
                        portraitUrl: draft.portraitUrl || null,
                      });
                      onClose?.({ skipGuard: true });
                    }}
                  >
                    Start Chat
                  </Button>
                )}

                {onClose && (
                  <Button
                    variant="b2"
                    size="sm"
                    icon="close"
                    title="Close greeting editor"
                    onClick={onClose}
                  />
                )}
              </div>
            }
          />
          <div className="bb-intro-sheet__meta-row">
            <div className="bb-pm-sheet__telemetry">
              <span className="bb-pm-sheet__pill">{badgeLabel}</span>
              {scenarioName && (
                <>
                  <span className="bb-pm-sheet__telemetry-dot">·</span>
                  <span className="bb-pm-sheet__telemetry-item">{scenarioName}</span>
                </>
              )}
              <span className="bb-pm-sheet__telemetry-dot">·</span>
              <span className="bb-pm-sheet__telemetry-item">
                ~<strong>{tokens.toLocaleString()}</strong> tok
              </span>
            </div>

            <div className="bb-intro-sheet__portrait-btns">
              <Button
                variant="b2"
                size="sm"
                icon="images"
                active={galleryOpen}
                onClick={() => setGalleryOpen((v) => !v)}
              >
                {hasCustomPortrait ? 'Custom Portrait' : 'Portrait'}
              </Button>
              <Button
                variant="b2"
                size="sm"
                icon="plus"
                disabled={busyPortrait}
                onClick={() => fileInputRef.current?.click()}
              >
                {busyPortrait ? 'Uploading...' : 'Upload'}
              </Button>
              {hasCustomPortrait && (
                <Button
                  variant="b2"
                  size="sm"
                  icon="undo"
                  title="Reset to scenario default portrait"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...(prev || {}),
                      rawPortraitUrl: null,
                      portraitUrl: null,
                    }))
                  }
                >
                  Default
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {galleryOpen && (
        <OverlayScrollArea
          viewportClassName="bb-intro-modal__gallery-tray"
          variant="compact"
        >
          {portraitGallery.length > 0 ? (
            portraitGallery.map((g, idx) => {
              const gRaw = g.rawUrl || g.url;
              const isPicked =
                hasCustomPortrait &&
                (draft.rawPortraitUrl === gRaw || draft.portraitUrl === g.url);
              return (
                <button
                  key={g.id || idx}
                  type="button"
                  className={`bb-intro-modal__gallery-item ${isPicked ? 'is-active' : ''}`}
                  title={g.label || `Portrait #${idx + 1}`}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...(prev || {}),
                      rawPortraitUrl: gRaw,
                      portraitUrl: g.url,
                    }))
                  }
                >
                  <SafeImage
                    src={g.url}
                    alt={g.label || `Portrait ${idx + 1}`}
                    draggable={false}
                    fallback={<Icon name="image" size={14} />}
                  />
                </button>
              );
            })
          ) : (
            <span className="bb-caption-text">
              No alternate portraits in this scenario gallery yet — click Upload to add one.
            </span>
          )}
        </OverlayScrollArea>
      )}

      <div className="bb-pm-sheet__stage">
        <div className="bb-pm-sheet__editor-fill">
          <MarkdownEditor
            label={`${badgeLabel} Content`}
            headerActions={
              <span className="bb-caption-text">
                Supports <code>{'{{char}}'}</code>, <code>{'{{user}}'}</code> &amp; Live Markdown
              </span>
            }
            fillHeight
            value={draft.text}
            onChange={(val) => setDraft((prev) => ({ ...(prev || {}), text: val }))}
            placeholder="Write the character's opening scene..."
          />
        </div>
      </div>

      {isDirty && (
        <div
          className="bb-pm-sheet__dirty-bar"
          role="region"
          aria-label="Unsaved greeting changes"
        >
          <div className="bb-pm-sheet__dirty-info">
            <span className="bb-pm-sheet__dirty-dot" aria-hidden="true" />
            <span>Unsaved changes</span>
            <kbd className="bb-pm-sheet__dirty-kbd">Ctrl+S</kbd>
          </div>
          <div className="bb-pm-sheet__dirty-actions">
            <Button variant="b2" size="sm" icon="undo" onClick={handleDiscard}>
              Discard
            </Button>
            <Button
              variant="b1"
              size="sm"
              emphasis="filled"
              icon="check"
              onClick={commitDraft}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
