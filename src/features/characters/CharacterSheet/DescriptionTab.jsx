import React, { useMemo } from 'react';
import {
  Button,
  Icon,
  MarkdownEditor,
} from '@ui/index.js';

export function DescriptionTab({
  description = '',
  spoilerBlur = false,
  onChangeDescription,
  onToggleSpoilerBlur,
}) {
  const approxDescTokens = useMemo(
    () => Math.max(0, Math.ceil(String(description || '').length / 3.8)),
    [description],
  );

  const isBlurredNow = Boolean(spoilerBlur);

  const spoilerActions = (
    <button
      type="button"
      className={`bb-cs-spoiler-chip ${spoilerBlur ? 'is-active' : ''}`}
      onClick={() => onToggleSpoilerBlur?.(!spoilerBlur)}
      title={
        spoilerBlur
          ? 'Spoiler Shield is ON for this scenario — click to disable'
          : 'Enable Spoiler Shield to blur description for blind roleplay'
      }
    >
      <Icon name={spoilerBlur ? 'eyeOff' : 'eye'} size={13} />
      <span>Spoiler Blur</span>
    </button>
  );

  return (
    <div className="bb-cs-fill-tab">
      <div className={`bb-cs-desc-stage ${isBlurredNow ? 'is-blurred' : ''}`}>
        <div className="bb-cs-desc-editor-holder">
          <MarkdownEditor
            label="Character Description"
            headerActions={spoilerActions}
            fillHeight
            value={description}
            onChange={onChangeDescription}
            placeholder="Write {{char}}'s core persona, appearance, lore, and behavioral traits..."
          />
        </div>

        {isBlurredNow && (
          <div className="bb-cs-spoiler-veil">
            <div className="bb-cs-spoiler-veil__card">
              <Icon name="eyeOff" size={20} />
              <div className="bb-cs-spoiler-veil__title">Spoiler Shield Active</div>
              <div className="bb-cs-spoiler-veil__sub">
                Description (~{approxDescTokens.toLocaleString()} tok) is blurred for blind roleplay.
              </div>
              <div className="bb-cs-spoiler-veil__actions">
                <Button
                  variant="b1"
                  size="sm"
                  emphasis="tonal"
                  icon="eye"
                  onClick={() => onToggleSpoilerBlur?.(false)}
                >
                  Disable Blur
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
