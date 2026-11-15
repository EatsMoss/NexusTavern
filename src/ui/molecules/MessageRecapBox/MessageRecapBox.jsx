import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { Textarea } from '../../atoms/Input/Input.jsx';
import { Tooltip } from '../../atoms/Tooltip/Tooltip.jsx';
import { OverlayScrollArea } from '../../atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import { estimateTextTokens } from '@core/presets/tokenEstimator.js';
import './MessageRecapBox.css';

/**
 * MessageRecapBox — Native M3 Scene Recap molecule rendered on AI message cards.
 * Displays token footprint, live context-compression state (`Compressed`),
 * collapsible recap body, and quick surgical inline recap editing.
 */
export function MessageRecapBox({
  recapText = '',
  isStreaming = false,
  isCompressed = false,
  compressedTooltip = 'Full <story> block is stripped at this depth — only this recap is sent in prompt context.',
  defaultOpen = false,
  tokenContext = null,
  onSaveRecap,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isEditing, setIsEditing] = useState(false);
  const [draftRecap, setDraftRecap] = useState(recapText);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraftRecap(recapText);
    }
  }, [recapText, isEditing]);

  const recapTokens = useMemo(
    () => estimateTextTokens(recapText, tokenContext),
    [recapText, tokenContext],
  );

  const canEdit = Boolean(onSaveRecap) && !isStreaming;
  const effectiveOpen = isOpen || isEditing;

  const handleStartEdit = (e) => {
    e.stopPropagation();
    if (!canEdit) return;
    setDraftRecap(recapText);
    setIsEditing(true);
    setIsOpen(true);
  };

  const handleCancelEdit = () => {
    setDraftRecap(recapText);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!onSaveRecap || saving) return;
    setSaving(true);
    try {
      const ok = await onSaveRecap(draftRecap);
      if (ok !== false) {
        setIsEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!recapText && !isStreaming) return null;

  const toggleOpen = () => {
    if (isEditing) {
      handleCancelEdit();
    }
    setIsOpen((prev) => !prev);
  };

  const barTooltipContent = useMemo(
    () => (
      <div className="bb-m3-tooltip-detail">
        <div className="bb-m3-tooltip-detail__head">
          <Icon name="scissors" size={11} />
          <span>Scene Recap • Context Saver</span>
        </div>
        <div className="bb-m3-tooltip-detail__row">
          <span className="bb-m3-tooltip-detail__label">Purpose</span>
          <span className="bb-m3-tooltip-detail__value">
            Concise English summary of this turn used to save context tokens in long roleplay chats.
          </span>
        </div>
        <div className="bb-m3-tooltip-detail__row">
          <span className="bb-m3-tooltip-detail__label">Status</span>
          <span className="bb-m3-tooltip-detail__value">
            {isStreaming
              ? 'Generating English recap for this reply…'
              : isCompressed
                ? compressedTooltip
                : 'Recent turn — full <story> prose is still active; once deeper in history, only this recap will be sent.'}
          </span>
        </div>
      </div>
    ),
    [isStreaming, isCompressed, compressedTooltip],
  );

  return (
    <div
      className={[
        'bb-recap-box',
        effectiveOpen ? 'bb-recap-box--open' : '',
        isStreaming ? 'bb-recap-box--streaming' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="bb-recap-box__bar"
        role="button"
        tabIndex={0}
        aria-expanded={effectiveOpen}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleOpen();
          }
        }}
      >
        <span className="bb-recap-box__toggle">
          <Icon name="scissors" size={13} className="bb-recap-box__icon" />
          <span className="bb-recap-box__label">
            {isStreaming ? 'Writing recap…' : 'Scene Recap'}
          </span>
          {recapTokens > 0 && (
            <span className="bb-recap-box__chip">~{recapTokens} tok</span>
          )}
          {isCompressed && !isStreaming && (
            <span className="bb-recap-box__chip bb-recap-box__chip--compressed">
              Compressed
            </span>
          )}
          <Tooltip content={barTooltipContent} rich placement="top" delayMs={80}>
            <span
              className="bb-recap-box__help"
              aria-label="What is Scene Recap?"
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="helpCircle" size={14} />
            </span>
          </Tooltip>
        </span>

        <div className="bb-recap-box__actions">
          {effectiveOpen && canEdit && !isEditing && (
            <Tooltip content="Quick-edit scene recap" placement="top" delayMs={80}>
              <button
                type="button"
                className="bb-recap-box__icon-btn"
                aria-label="Quick-edit scene recap"
                onClick={handleStartEdit}
              >
                <Icon name="edit" size={13} />
              </button>
            </Tooltip>
          )}
          <span
            className={`bb-recap-box__chevron-wrap ${effectiveOpen ? 'is-open' : ''}`}
            aria-hidden="true"
          >
            <Icon name="chevronDown" size={15} />
          </span>
        </div>
      </div>

      {effectiveOpen &&
        (isEditing ? (
          <div className="bb-recap-box__editor">
            <Textarea
              rows={4}
              value={draftRecap}
              onChange={(e) => setDraftRecap(e.target.value)}
              placeholder="Concise past-tense English recap..."
              disabled={saving}
            />
            <div className="bb-recap-box__editor-actions">
              <Button
                variant="b1"
                emphasis="outlined"
                size="sm"
                disabled={saving}
                onClick={handleCancelEdit}
              >
                Cancel
              </Button>
              <Button
                variant="b1"
                emphasis="filled"
                size="sm"
                icon="check"
                disabled={saving}
                onClick={handleSaveEdit}
              >
                Save Recap
              </Button>
            </div>
          </div>
        ) : (
          <OverlayScrollArea
            viewportClassName="bb-recap-box__body"
            variant="compact"
            watchValue={recapText}
          >
            {recapText || 'Writing English recap…'}
          </OverlayScrollArea>
        ))}
    </div>
  );
}
