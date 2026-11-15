import React from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { Textarea } from '../../atoms/Input/Input.jsx';
import { SegmentedGroup } from '../../atoms/Button/Button.jsx';
import { Slider } from '../../molecules/Slider/Slider.jsx';
import { RegexPatternInput } from '../../molecules/RegexPatternInput/RegexPatternInput.jsx';
import {
  DEFAULT_OPENING_PROMPT,
  DEFAULT_CLOSING_PROMPT,
  DEFAULT_STRIP_FIND_REGEX,
  DEFAULT_KEEP_FULL_DEPTH,
} from '@core/recap/recapEngine.js';

const ROLE_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'user', label: 'User' },
];

const OPENING_POS_OPTIONS = [
  { value: 'before_history', label: 'Start of Chat' },
  { value: 'depth', label: '@Depth' },
];

const CLOSING_POS_OPTIONS = [
  { value: 'after_all', label: 'Last Prompt' },
  { value: 'depth', label: '@Depth' },
];

export function RecapCompressionCard({ resolved, onPatchConfig }) {
  const isRegexCustom = resolved.stripFindRegex !== DEFAULT_STRIP_FIND_REGEX;

  return (
    <div className={`bb-mr-card ${!resolved.stripEnabled ? 'is-muted' : ''}`}>
      <div className="bb-mr-card__top">
        <div className="bb-mr-card__title-wrap">
          <div className="bb-mr-card__title-row">
            <span className="bb-mr-card__title">Strip Full Story Blocks</span>
          </div>
          <span className="bb-mr-card__sub">
            Prompt-only AI output compression — chat messages stay untouched on screen
          </span>
        </div>
        <div className="bb-mr-card__top-right">
          {isRegexCustom && (
            <button
              type="button"
              className="bb-mr-reset-link"
              onClick={() =>
                onPatchConfig?.(
                  { stripFindRegex: DEFAULT_STRIP_FIND_REGEX },
                  { immediate: true },
                )
              }
              title="Restore default <story> strip regex"
            >
              <Icon name="refresh" size={11} />
              <span>Reset Regex</span>
            </button>
          )}
          <Switch
            bare
            checked={resolved.stripEnabled}
            onChange={(val) => onPatchConfig?.({ stripEnabled: val }, { immediate: true })}
            aria-label="Toggle depth-based story block stripping"
          />
        </div>
      </div>

      <Slider
        label="Keep Full Messages (Recent Depth)"
        value={resolved.keepFullDepth}
        min={0}
        max={30}
        inputMax={200}
        step={1}
        defaultValue={DEFAULT_KEEP_FULL_DEPTH}
        unit="msgs"
        onChange={(val) => onPatchConfig?.({ keepFullDepth: val })}
      />

      <RegexPatternInput
        label="Full-Text Block Regex (AI Output)"
        allowExpertToggle
        value={resolved.stripFindRegex}
        onChange={(val) => onPatchConfig?.({ stripFindRegex: val })}
        placeholder="(`{3})?\\s*<story>[\\s\\S]*?<\\/story>\\s?(`{3})?\\s*"
      />
    </div>
  );
}

export function RecapPromptCard({
  variant = 'opening',
  resolved,
  tokens = 0,
  onPatchConfig,
}) {
  const isOpening = variant === 'opening';
  const enabled = isOpening ? resolved.openingEnabled : resolved.closingEnabled;
  const role = isOpening ? resolved.openingRole : resolved.closingRole;
  const position = isOpening ? resolved.openingPosition : resolved.closingPosition;
  const depth = isOpening ? resolved.openingDepth : resolved.closingDepth;
  const promptText = isOpening ? resolved.openingPrompt : resolved.closingPrompt;
  const defaultPrompt = isOpening ? DEFAULT_OPENING_PROMPT : DEFAULT_CLOSING_PROMPT;
  const isCustom = promptText !== defaultPrompt;

  return (
    <div className={`bb-mr-card ${!enabled ? 'is-muted' : ''}`}>
      <div className="bb-mr-card__top">
        <div className="bb-mr-card__title-wrap">
          <div className="bb-mr-card__title-row">
            <span className="bb-mr-card__title">
              {isOpening ? 'Opening Rules Prompt' : 'Closing Reminder Prompt'}
            </span>
            <span className="bb-mr-tok-chip">~{tokens} tok</span>
          </div>
          <span className="bb-mr-card__sub">
            {isOpening
              ? 'Instructs the model to write <story> + English <recap>'
              : 'Final low-token nudge appended at the end of context'}
          </span>
        </div>
        <div className="bb-mr-card__top-right">
          {isCustom && (
            <button
              type="button"
              className="bb-mr-reset-link"
              onClick={() =>
                onPatchConfig?.(
                  isOpening
                    ? { openingPrompt: DEFAULT_OPENING_PROMPT }
                    : { closingPrompt: DEFAULT_CLOSING_PROMPT },
                  { immediate: true },
                )
              }
              title="Restore default prompt text"
            >
              <Icon name="refresh" size={11} />
              <span>Reset</span>
            </button>
          )}
          <Switch
            bare
            checked={enabled}
            onChange={(val) =>
              onPatchConfig?.(
                isOpening ? { openingEnabled: val } : { closingEnabled: val },
                { immediate: true },
              )
            }
            aria-label={
              isOpening ? 'Toggle Opening Rules prompt' : 'Toggle Closing Reminder prompt'
            }
          />
        </div>
      </div>

      <div className="bb-mr-grid-2">
        <div className="bb-mr-field-group">
          <span className="bb-mr-field-label">Role</span>
          <SegmentedGroup
            fullWidth
            options={ROLE_OPTIONS}
            value={role}
            onChange={(val) =>
              onPatchConfig?.(
                isOpening ? { openingRole: val } : { closingRole: val },
                { immediate: true },
              )
            }
          />
        </div>
        <div className="bb-mr-field-group">
          <span className="bb-mr-field-label">Placement</span>
          <SegmentedGroup
            fullWidth
            options={isOpening ? OPENING_POS_OPTIONS : CLOSING_POS_OPTIONS}
            value={position}
            onChange={(val) =>
              onPatchConfig?.(
                isOpening ? { openingPosition: val } : { closingPosition: val },
                { immediate: true },
              )
            }
          />
        </div>
      </div>

      {position === 'depth' && (
        <Slider
          label={isOpening ? 'Opening Injection @Depth' : 'Closing Injection @Depth'}
          value={depth}
          min={0}
          max={30}
          inputMax={200}
          step={1}
          defaultValue={isOpening ? 4 : 0}
          unit="msgs"
          onChange={(val) =>
            onPatchConfig?.(isOpening ? { openingDepth: val } : { closingDepth: val })
          }
        />
      )}

      <Textarea
        rows={isOpening ? 7 : 4}
        label={isOpening ? 'Prompt Content' : 'Reminder Content'}
        hint="Supports {{user}} and {{char}} macros."
        value={promptText}
        onChange={(e) =>
          onPatchConfig?.(
            isOpening
              ? { openingPrompt: e.target.value }
              : { closingPrompt: e.target.value },
          )
        }
        placeholder={isOpening ? 'Enter opening recap rules...' : 'Enter closing reminder...'}
      />
    </div>
  );
}

