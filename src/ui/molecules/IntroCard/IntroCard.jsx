import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { SafeImage } from '../../atoms/SafeImage/SafeImage.jsx';
import { OverlayScrollArea } from '../../atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import { InlineEditableTitle } from '../InlineEditableTitle/InlineEditableTitle.jsx';
import { KebabMenu } from '../KebabMenu/KebabMenu.jsx';
import './IntroCard.css';

export function estimateIntroTokens(text = '') {
  const clean = String(text || '');
  if (!clean.trim()) return 0;
  return Math.max(1, Math.ceil(clean.length / 3.8));
}

export function stripIntroPreview(text = '') {
  if (!text) return '';
  return String(text)
    .replace(/<(?:think|thinking|reasoning)>[\s\S]*?<\/(?:think|thinking|reasoning)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`~#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function IntroCard({
  index = 0,
  kind = 'standard',
  title = '',
  text = '',
  portraitUrl = null,
  rawPortraitUrl = null,
  defaultPortraitUrl = null,
  fallbackInitials = 'CH',
  portraitGallery = [],
  selected = false,
  editing = false,
  draggable = true,
  isGhost = false,
  busyPortrait = false,
  canDelete = true,
  kebabExtraItems = [],
  onSelect,
  onRenameTitle,
  onEdit,
  onDuplicate,
  onStartChat,
  onSetAsFirst,
  onDelete,
  onSelectPortraitUrl,
  onUploadPortraitFile,
  className = '',
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fileOver, setFileOver] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, ready: false });
  const portraitBtnRef = useRef(null);
  const popoverRef = useRef(null);
  const fileInputRef = useRef(null);

  const isFirst = kind === 'standard' && index === 0;
  const defaultTitle =
    kind === 'group'
      ? `Group Greeting #${index + 1}`
      : isFirst
        ? 'First Message'
        : `Intro #${index + 1}`;

  const effectivePortrait = portraitUrl || defaultPortraitUrl || null;
  const hasCustomPortrait = Boolean(portraitUrl || rawPortraitUrl);
  const tokens = estimateIntroTokens(text);
  const previewText = stripIntroPreview(text);

  const updatePopoverPosition = useCallback(() => {
    const anchor = portraitBtnRef.current;
    const pop = popoverRef.current;
    if (!anchor || !pop) return;

    const rect = anchor.getBoundingClientRect();
    const pRect = pop.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + pRect.width > vw - 8) left = Math.max(8, vw - pRect.width - 8);
    if (left < 8) left = 8;
    if (top + pRect.height > vh - 8) top = Math.max(8, rect.top - pRect.height - 6);

    setCoords({ top: Math.round(top), left: Math.round(left), ready: true });
  }, []);

  useLayoutEffect(() => {
    if (!pickerOpen) {
      setCoords((prev) => (prev.ready ? { top: 0, left: 0, ready: false } : prev));
      return;
    }
    updatePopoverPosition();
  }, [pickerOpen, portraitGallery.length, updatePopoverPosition]);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onPointerDown = (e) => {
      if (
        portraitBtnRef.current &&
        !portraitBtnRef.current.contains(e.target) &&
        (!popoverRef.current || !popoverRef.current.contains(e.target))
      ) {
        setPickerOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    const onViewportChange = () => setPickerOpen(false);

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [pickerOpen]);

  const handlePortraitDrop = (e) => {
    const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (files.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      setFileOver(false);
      onUploadPortraitFile?.(files[0]);
    }
  };

  const kebabItems = [
    onEdit && {
      id: 'edit',
      label: 'Edit in Modal',
      icon: 'edit',
      onClick: onEdit,
    },
    onDuplicate && {
      id: 'duplicate',
      label: 'Duplicate Intro',
      icon: 'copy',
      onClick: onDuplicate,
    },
    kind === 'standard' &&
      !isFirst &&
      onSetAsFirst && {
        id: 'promote-first',
        label: 'Move to #1 (First Message)',
        icon: 'arrowUpDown',
        onClick: onSetAsFirst,
      },
    ...kebabExtraItems,
    onDelete && {
      id: 'delete',
      label: 'Delete Intro',
      icon: 'trash',
      danger: true,
      disabled: !canDelete,
      title: canDelete ? 'Delete this greeting' : 'At least one greeting is kept on the card',
      onClick: onDelete,
    },
  ].filter(Boolean);

  const badgeLabel =
    kind === 'group' ? `G#${index + 1}` : isFirst ? '#1 First' : `#${index + 1}`;

  return (
    <article
      className={[
        'bb-intro-card',
        selected ? 'is-selected' : '',
        editing ? 'is-editing' : '',
        isGhost ? 'is-ghost' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect?.()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadPortraitFile?.(f);
          e.target.value = '';
        }}
      />

      <div className="bb-intro-card__rail">
        <button
          type="button"
          className="bb-intro-card__grip"
          disabled={!draggable}
          tabIndex={-1}
          title={
            draggable
              ? 'Drag to reorder greetings (#1 becomes First Message)'
              : 'Single greeting'
          }
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="gripVertical" size={14} />
        </button>

        <button
          ref={portraitBtnRef}
          type="button"
          disabled={busyPortrait}
          className={[
            'bb-intro-card__portrait-btn',
            pickerOpen ? 'is-open' : '',
            fileOver ? 'is-file-over' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={
            hasCustomPortrait
              ? 'Custom intro portrait assigned — click to change or reset'
              : 'Using default card portrait — click or drop image to assign custom intro portrait'
          }
          onClick={(e) => {
            e.stopPropagation();
            if (onSelectPortraitUrl || onUploadPortraitFile) {
              setPickerOpen((v) => !v);
            }
          }}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
              e.preventDefault();
              e.stopPropagation();
              setFileOver(true);
            }
          }}
          onDragLeave={(e) => {
            if (fileOver) {
              e.stopPropagation();
              setFileOver(false);
            }
          }}
          onDrop={handlePortraitDrop}
        >
          <SafeImage
            src={effectivePortrait}
            alt={title || defaultTitle}
            className="bb-intro-card__portrait-img"
            draggable={false}
            fallback={<span className="bb-intro-card__portrait-fallback">{fallbackInitials}</span>}
          />
          {hasCustomPortrait && (
            <span
              className="bb-intro-card__portrait-custom-dot"
              title="Custom portrait assigned"
            />
          )}
          <span className="bb-intro-card__portrait-hover" aria-hidden="true">
            <Icon name="image" size={12} />
          </span>
        </button>
      </div>

      <div className="bb-intro-card__content">
        <header className="bb-intro-card__head">
          <span
            className={[
              'bb-intro-card__badge',
              isFirst ? 'bb-intro-card__badge--first' : '',
              kind === 'group' ? 'bb-intro-card__badge--group' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {badgeLabel}
          </span>

          <div className="bb-intro-card__title-wrap" onClick={(e) => e.stopPropagation()}>
            <InlineEditableTitle
              value={title}
              placeholder={defaultTitle}
              size="sm"
              allowEmpty
              editTooltip="Click to name this intro"
              onChange={(nextTitle) => onRenameTitle?.(nextTitle)}
            />
          </div>

          <span className="bb-intro-card__tokens" title="Estimated greeting tokens">
            ~{tokens} tok
          </span>
        </header>

        <button
          type="button"
          className={`bb-intro-card__preview ${!previewText ? 'is-empty' : ''}`}
          title="Click to open greeting editor"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
        >
          {previewText || 'Empty greeting — click Edit to write an opening scene...'}
        </button>

        <footer className="bb-intro-card__footer" onClick={(e) => e.stopPropagation()}>
          <div className="bb-intro-card__actions-left">
            {onStartChat && (
              <Button
                variant="b1"
                size="sm"
                icon="chatPlus"
                disabled={!previewText}
                title="Start a new chat beginning with this greeting"
                onClick={onStartChat}
              >
                Start Chat
              </Button>
            )}
            {onEdit && (
              <Button
                variant="b2"
                size="sm"
                icon="edit"
                title="Open greeting in editor modal"
                onClick={onEdit}
              >
                Edit
              </Button>
            )}
          </div>

          <div className="bb-intro-card__actions-right">
            <KebabMenu items={kebabItems} size="sm" title="Intro actions" />
          </div>
        </footer>
      </div>

      {pickerOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            className="bb-intro-portrait-popover"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              visibility: coords.ready ? 'visible' : 'hidden',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bb-intro-portrait-popover__title">
              <span>Intro Portrait</span>
              <span>{hasCustomPortrait ? 'Custom' : 'Card Default'}</span>
            </div>

            {portraitGallery.length > 0 ? (
              <OverlayScrollArea
                viewportClassName="bb-intro-portrait-popover__grid"
                variant="compact"
              >
                {portraitGallery.map((g, gIdx) => {
                  const gRaw = g.rawUrl || g.url;
                  const active =
                    hasCustomPortrait &&
                    (rawPortraitUrl === gRaw || portraitUrl === g.url);
                  return (
                    <button
                      key={g.id || gIdx}
                      type="button"
                      className={`bb-intro-portrait-popover__thumb ${active ? 'is-active' : ''}`}
                      title={g.label || `Portrait #${gIdx + 1}`}
                      onClick={() => {
                        onSelectPortraitUrl?.(gRaw, g.url);
                        setPickerOpen(false);
                      }}
                    >
                      <SafeImage
                        src={g.url}
                        alt={g.label || `Portrait ${gIdx + 1}`}
                        draggable={false}
                        fallback={<Icon name="image" size={14} />}
                      />
                      {active && (
                        <span className="bb-intro-portrait-popover__check">
                          <Icon name="check" size={10} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </OverlayScrollArea>
            ) : (
              <div className="bb-intro-portrait-popover__empty">
                No alternate scenario portraits uploaded yet.
              </div>
            )}

            <div className="bb-intro-portrait-popover__actions">
              {onUploadPortraitFile && (
                <Button
                  variant="b2"
                  size="sm"
                  icon="plus"
                  fullWidth
                  disabled={busyPortrait}
                  onClick={() => {
                    setPickerOpen(false);
                    fileInputRef.current?.click();
                  }}
                >
                  Upload Image for Intro...
                </Button>
              )}
              {hasCustomPortrait && onSelectPortraitUrl && (
                <Button
                  variant="b2"
                  size="sm"
                  icon="undo"
                  fullWidth
                  onClick={() => {
                    onSelectPortraitUrl(null, null);
                    setPickerOpen(false);
                  }}
                >
                  Reset to Main Card Portrait
                </Button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </article>
  );
}

