import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { Input, Textarea } from '../../atoms/Input/Input.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { OverlayScrollArea } from '../../atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import { Dropdown } from '../../molecules/Dropdown/Dropdown.jsx';
import { RegexPatternInput } from '../../molecules/RegexPatternInput/RegexPatternInput.jsx';
import { MessageDecorator } from '../../molecules/MessageDecorator/MessageDecorator.jsx';
import { Modal } from '../Modal/Modal.jsx';
import {
  REGEX_PLACEMENT,
  SUBSTITUTE_FIND_REGEX,
  normalizeRegexScript,
  debugRegexScript,
} from '@core/regex/regexEngine.js';

const APPLY_TO_PRESETS = [
  {
    value: 'ai',
    label: 'AI Replies',
    meta: 'Assistant',
    placement: [REGEX_PLACEMENT.AI_OUTPUT],
  },
  {
    value: 'user',
    label: 'User Messages',
    meta: 'You',
    placement: [REGEX_PLACEMENT.USER_INPUT],
  },
  {
    value: 'ai_user',
    label: 'AI & User',
    meta: 'Messages',
    placement: [REGEX_PLACEMENT.AI_OUTPUT, REGEX_PLACEMENT.USER_INPUT],
  },
  {
    value: 'reasoning',
    label: 'Reasoning',
    meta: 'Thoughts',
    placement: [REGEX_PLACEMENT.REASONING],
  },
  {
    value: 'worldinfo',
    label: 'World Info',
    meta: 'Lorebook',
    placement: [REGEX_PLACEMENT.WORLD_INFO],
  },
  {
    value: 'all',
    label: 'All Streams',
    meta: 'Everywhere',
    placement: [
      REGEX_PLACEMENT.AI_OUTPUT,
      REGEX_PLACEMENT.USER_INPUT,
      REGEX_PLACEMENT.REASONING,
      REGEX_PLACEMENT.WORLD_INFO,
    ],
  },
];

const SUBSTITUTE_OPTIONS = [
  { value: SUBSTITUTE_FIND_REGEX.NONE, label: 'Off', meta: 'Literal' },
  { value: SUBSTITUTE_FIND_REGEX.ESCAPED, label: 'Escaped {{char}} / {{user}}', meta: 'Safe' },
  { value: SUBSTITUTE_FIND_REGEX.RAW, label: 'Raw {{char}} / {{user}}', meta: 'Regex' },
];

function sameNumberSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  if (setA.size !== b.length) return false;
  return b.every((item) => setA.has(item));
}

function resolvePlacementPresetValue(placement = []) {
  const clean = Array.isArray(placement) ? placement : [REGEX_PLACEMENT.AI_OUTPUT];
  for (const preset of APPLY_TO_PRESETS) {
    if (sameNumberSet(clean, preset.placement)) {
      return preset.value;
    }
  }
  return 'custom';
}

function formatCustomPlacementLabel(placement = []) {
  const names = [];
  if (placement.includes(REGEX_PLACEMENT.AI_OUTPUT)) names.push('AI');
  if (placement.includes(REGEX_PLACEMENT.USER_INPUT)) names.push('User');
  if (placement.includes(REGEX_PLACEMENT.REASONING)) names.push('Thoughts');
  if (placement.includes(REGEX_PLACEMENT.WORLD_INFO)) names.push('Lore');
  if (placement.includes(REGEX_PLACEMENT.SLASH_COMMAND)) names.push('Slash');
  return names.length > 0 ? names.join(' + ') : 'Custom';
}

function resolveExecutionMode(draft) {
  const md = Boolean(draft?.markdownOnly);
  const pr = Boolean(draft?.promptOnly);
  if (md && pr) return 'both';
  if (md) return 'display';
  if (pr) return 'prompt';
  return 'permanent';
}

export function RegexEditorModal({
  open = false,
  script = null,
  scopeLabel = 'Global',
  charName = 'Character',
  userName = 'User',
  sampleSeedText = '',
  onClose,
  onSave,
}) {
  const [draft, setDraft] = useState(() => normalizeRegexScript({}));
  const [trimDraftText, setTrimDraftText] = useState('');
  const [testOpen, setTestOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [rawPreview, setRawPreview] = useState(false);

  useEffect(() => {
    if (!open || !script) return;
    const norm = normalizeRegexScript(script);
    setDraft(norm);
    setTrimDraftText((norm.trimStrings || []).join('\n'));
    setTestOpen(false);
    setMoreOpen(
      norm.minDepth !== null ||
        norm.maxDepth !== null ||
        norm.substituteRegex !== SUBSTITUTE_FIND_REGEX.NONE ||
        (norm.trimStrings && norm.trimStrings.length > 0),
    );
    setRawPreview(false);
    setTestInput((prev) =>
      prev.trim()
        ? prev
        : sampleSeedText ||
          `"*Careful around the ruins,*" {{char}} murmured to {{user}}.\n<status>HP: 94/100 | Location: Atrium</status>`,
    );
  }, [open, script, sampleSeedText]);

  const debugResult = useMemo(
    () =>
      open
        ? debugRegexScript(
            {
              ...draft,
              trimStrings: trimDraftText
                .split(/\r?\n/)
                .filter((line) => line.length > 0),
            },
            testInput,
            { charName, userName },
          )
        : null,
    [open, draft, trimDraftText, testInput, charName, userName],
  );

  if (!open || !script) return null;

  const execMode = resolveExecutionMode(draft);
  const placementValue = resolvePlacementPresetValue(draft.placement);

  const applyToOptions =
    placementValue === 'custom'
      ? [
          {
            value: 'custom',
            label: formatCustomPlacementLabel(draft.placement),
            meta: 'Custom',
          },
          ...APPLY_TO_PRESETS.map(({ value, label, meta }) => ({ value, label, meta })),
        ]
      : APPLY_TO_PRESETS.map(({ value, label, meta }) => ({ value, label, meta }));

  const modeOptions = [
    { value: 'display', label: 'Visual Only', meta: 'Chat view' },
    { value: 'prompt', label: 'Prompt Only', meta: 'Sent to AI' },
    { value: 'permanent', label: 'Save to Chat', meta: 'Permanent' },
    ...(execMode === 'both'
      ? [{ value: 'both', label: 'Visual + Prompt', meta: 'Both' }]
      : []),
  ];

  const handleChangeApplyTo = (nextVal) => {
    const found = APPLY_TO_PRESETS.find((item) => item.value === nextVal);
    if (!found) return;
    setDraft((prev) => ({ ...prev, placement: [...found.placement] }));
  };

  const handleSetExecMode = (modeVal) => {
    setDraft((prev) => {
      if (modeVal === 'display') return { ...prev, markdownOnly: true, promptOnly: false };
      if (modeVal === 'prompt') return { ...prev, markdownOnly: false, promptOnly: true };
      if (modeVal === 'both') return { ...prev, markdownOnly: true, promptOnly: true };
      return { ...prev, markdownOnly: false, promptOnly: false };
    });
  };

  const handleSaveClick = () => {
    const cleanScript = normalizeRegexScript({
      ...draft,
      scriptName: String(draft.scriptName || '').trim() || 'Untitled Rule',
      trimStrings: trimDraftText
        .split(/\r?\n/)
        .filter((line) => line.length > 0),
    });
    onSave?.(cleanScript);
    onClose?.();
  };

  const hasAdvancedConfigured =
    draft.minDepth !== null ||
    draft.maxDepth !== null ||
    draft.substituteRegex !== SUBSTITUTE_FIND_REGEX.NONE ||
    trimDraftText.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={draft.scriptName ? draft.scriptName : 'Regex Rule'}
      subtitle={scopeLabel}
      icon="regex"
      width={500}
      footer={
        <div className="bb-rx-modal-footer">
          <Switch
            bare
            size="sm"
            checked={!draft.disabled}
            onChange={(checked) => setDraft((prev) => ({ ...prev, disabled: !checked }))}
            inlineLabel="Enabled"
          />
          <div className="bb-rx-modal-footer__actions">
            <Button variant="b1" emphasis="outlined" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="check"
              disabled={debugResult && !debugResult.valid}
              onClick={handleSaveClick}
            >
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="bb-rx-editor">
        <Input
          label="Rule Name"
          value={draft.scriptName || ''}
          onChange={(e) => setDraft((prev) => ({ ...prev, scriptName: e.target.value }))}
          placeholder="e.g. Hide status block"
        />

        <RegexPatternInput
          label="Find Pattern"
          value={draft.findRegex || ''}
          onChange={(nextVal) => setDraft((prev) => ({ ...prev, findRegex: nextVal }))}
          placeholder="e.g. <status>([\\s\\S]*?)<\\/status>"
        />

        <div className="bb-rx-field-group">
          <label className="bb-rx-field-group__label">Replace With</label>
          <Textarea
            rows={3}
            spellCheck={false}
            className="bb-rx-mono-textarea"
            value={draft.replaceString ?? ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, replaceString: e.target.value }))}
            placeholder="Replacement text or HTML (leave empty to remove matched text)"
          />
        </div>

        <div className="bb-rx-select-grid">
          <Dropdown
            label="Apply To"
            options={applyToOptions}
            value={placementValue}
            onChange={handleChangeApplyTo}
            searchable={false}
            allowStars={false}
          />
          <Dropdown
            label="Mode"
            options={modeOptions}
            value={execMode}
            onChange={handleSetExecMode}
            searchable={false}
            allowStars={false}
          />
        </div>

        {/* Collapsible Quick Test */}
        <div className={`bb-rx-disclosure ${testOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className="bb-rx-disclosure__head"
            aria-expanded={testOpen}
            onClick={() => setTestOpen((v) => !v)}
          >
            <span className="bb-rx-disclosure__title">
              <span>Test Rule</span>
              {Boolean(draft.findRegex?.trim()) && debugResult?.valid && (
                <span
                  className={`bb-rx-disclosure__pill ${
                    debugResult.matchCount > 0 ? 'is-matched' : ''
                  }`}
                >
                  {debugResult.matchCount > 0
                    ? `${debugResult.matchCount} match${debugResult.matchCount === 1 ? '' : 'es'}`
                    : 'No match'}
                </span>
              )}
            </span>
            <Icon
              name="chevronDown"
              size={16}
              className={`bb-rx-disclosure__caret ${testOpen ? 'is-open' : ''}`}
            />
          </button>

          {testOpen && (
            <div className="bb-rx-disclosure__body">
              <div className="bb-rx-field-group">
                <div className="bb-rx-field-group__head">
                  <label className="bb-rx-field-group__label">Sample Input</label>
                  {sampleSeedText && (
                    <button
                      type="button"
                      className="bb-rx-inline-btn"
                      onClick={() => setTestInput(sampleSeedText)}
                    >
                      Use Last Message
                    </button>
                  )}
                </div>
                <Textarea
                  rows={3}
                  spellCheck={false}
                  className="bb-rx-mono-textarea"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder="Paste sample message text to test..."
                />
              </div>

              <div className="bb-rx-field-group">
                <div className="bb-rx-field-group__head">
                  <label className="bb-rx-field-group__label">Result</label>
                  <button
                    type="button"
                    className="bb-rx-inline-btn"
                    onClick={() => setRawPreview((v) => !v)}
                  >
                    {rawPreview ? 'Card View' : 'Raw Text'}
                  </button>
                </div>

                {rawPreview ? (
                  <OverlayScrollArea
                    viewportAs="pre"
                    viewportClassName="bb-rx-debug-raw-out"
                    variant="compact"
                    watchValue={debugResult?.outputText}
                  >
                    {debugResult?.outputText || '(Empty output)'}
                  </OverlayScrollArea>
                ) : (
                  <OverlayScrollArea
                    viewportClassName="bb-rx-debug-card-preview"
                    variant="compact"
                    watchValue={debugResult?.outputText}
                  >
                    <MessageDecorator
                      text={debugResult?.outputText || ''}
                      userName={userName}
                      charName={charName}
                      overrideRegexScripts={[]}
                    />
                  </OverlayScrollArea>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Advanced Options */}
        <div className={`bb-rx-disclosure ${moreOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className="bb-rx-disclosure__head"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <span className="bb-rx-disclosure__title">
              <span>More Options</span>
              {hasAdvancedConfigured && (
                <span className="bb-rx-disclosure__pill is-matched">Active</span>
              )}
            </span>
            <Icon
              name="chevronDown"
              size={16}
              className={`bb-rx-disclosure__caret ${moreOpen ? 'is-open' : ''}`}
            />
          </button>

          {moreOpen && (
            <div className="bb-rx-disclosure__body">
              <div className="bb-rx-select-grid">
                <Input
                  label="Min Depth"
                  type="number"
                  min={0}
                  value={draft.minDepth ?? ''}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      minDepth: e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                    }))
                  }
                  placeholder="0 (latest)"
                />
                <Input
                  label="Max Depth"
                  type="number"
                  min={0}
                  value={draft.maxDepth ?? ''}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      maxDepth: e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                    }))
                  }
                  placeholder="Unlimited"
                />
              </div>

              <Dropdown
                label="Macros in Pattern"
                options={SUBSTITUTE_OPTIONS}
                value={draft.substituteRegex}
                onChange={(val) =>
                  setDraft((prev) => ({ ...prev, substituteRegex: Number(val) }))
                }
                searchable={false}
                allowStars={false}
              />

              <Textarea
                label="Trim from Match (one per line)"
                rows={2}
                value={trimDraftText}
                onChange={(e) => setTrimDraftText(e.target.value)}
                placeholder="Optional substrings stripped from match before replacement"
              />

              {execMode === 'permanent' && (
                <Switch
                  size="sm"
                  checked={Boolean(draft.runOnEdit)}
                  onChange={(checked) => setDraft((prev) => ({ ...prev, runOnEdit: checked }))}
                  label="Re-apply when editing messages"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

