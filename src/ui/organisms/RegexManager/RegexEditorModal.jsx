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
import { UnsavedChangesModal } from '../UnsavedChangesModal/UnsavedChangesModal.jsx';
import {
  REGEX_PLACEMENT,
  SUBSTITUTE_FIND_REGEX,
  normalizeRegexScript,
  debugRegexScript,
} from '@core/regex/regexEngine.js';

const APPLY_TO_OPTIONS = [
  {
    value: REGEX_PLACEMENT.AI_OUTPUT,
    label: 'AI Replies',
    shortLabel: 'AI',
    meta: 'Assistant',
  },
  {
    value: REGEX_PLACEMENT.USER_INPUT,
    label: 'User Messages',
    shortLabel: 'User',
    meta: 'You',
  },
  {
    value: REGEX_PLACEMENT.REASONING,
    label: 'Reasoning',
    shortLabel: 'Thoughts',
    meta: 'Thoughts',
  },
  {
    value: REGEX_PLACEMENT.WORLD_INFO,
    label: 'World Info',
    shortLabel: 'Lore',
    meta: 'Lorebook',
  },
  {
    value: REGEX_PLACEMENT.SLASH_COMMAND,
    label: 'Slash Commands',
    shortLabel: 'Slash',
    meta: 'Commands',
  },
];

const MODE_OPTIONS = [
  {
    value: 'display',
    label: 'Visual Only',
    shortLabel: 'Visual',
    meta: 'Chat view',
  },
  {
    value: 'prompt',
    label: 'Prompt Only',
    shortLabel: 'Prompt',
    meta: 'Sent to AI',
  },
  {
    value: 'permanent',
    label: 'Save to Chat',
    shortLabel: 'Saved',
    meta: 'Permanent',
  },
  {
    value: 'runOnEdit',
    label: 'Run on Edit',
    shortLabel: 'On Edit',
    meta: 'When edited',
  },
];

const SUBSTITUTE_OPTIONS = [
  { value: SUBSTITUTE_FIND_REGEX.NONE, label: 'Off', meta: 'Literal' },
  { value: SUBSTITUTE_FIND_REGEX.ESCAPED, label: 'Escaped {{char}} / {{user}}', meta: 'Safe' },
  { value: SUBSTITUTE_FIND_REGEX.RAW, label: 'Raw {{char}} / {{user}}', meta: 'Regex' },
];

function resolveSelectedModes(draft) {
  const md = Boolean(draft?.markdownOnly);
  const pr = Boolean(draft?.promptOnly);
  const modes = [];
  if (md) modes.push('display');
  if (pr) modes.push('prompt');
  if (!md && !pr) modes.push('permanent');
  if (draft?.runOnEdit) modes.push('runOnEdit');
  return modes;
}

function serializeRegexDraftSnapshot(draft, trimText = '') {
  if (!draft) return '';
  const norm = normalizeRegexScript({
    ...draft,
    scriptName: String(draft.scriptName || '').trim(),
    trimStrings: String(trimText || '')
      .split(/\r?\n/)
      .filter((line) => line.length > 0),
  });
  return JSON.stringify({
    scriptName: norm.scriptName,
    findRegex: norm.findRegex,
    replaceString: norm.replaceString,
    trimStrings: norm.trimStrings,
    placement: [...(norm.placement || [])].sort((a, b) => a - b),
    disabled: Boolean(norm.disabled),
    markdownOnly: Boolean(norm.markdownOnly),
    promptOnly: Boolean(norm.promptOnly),
    runOnEdit: Boolean(norm.runOnEdit),
    substituteRegex: Number(norm.substituteRegex || 0),
    minDepth: norm.minDepth ?? null,
    maxDepth: norm.maxDepth ?? null,
  });
}

export function RegexEditorModal({
  open = false,
  script = null,
  isNew = false,
  scopeLabel = 'Global',
  charName = 'Character',
  userName = 'User',
  sampleSeedText = '',
  onClose,
  onSave,
}) {
  const [draft, setDraft] = useState(() => normalizeRegexScript({}));
  const [trimDraftText, setTrimDraftText] = useState('');
  const [baselineSnapshot, setBaselineSnapshot] = useState('');
  const [unsavedPromptOpen, setUnsavedPromptOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [rawPreview, setRawPreview] = useState(false);

  useEffect(() => {
    if (!open || !script) {
      setUnsavedPromptOpen(false);
      return;
    }
    const norm = normalizeRegexScript(script);
    const initialTrim = (norm.trimStrings || []).join('\n');
    setDraft(norm);
    setTrimDraftText(initialTrim);
    setBaselineSnapshot(serializeRegexDraftSnapshot(norm, initialTrim));
    setUnsavedPromptOpen(false);
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

  const currentSnapshot = useMemo(
    () => (open && script ? serializeRegexDraftSnapshot(draft, trimDraftText) : ''),
    [open, script, draft, trimDraftText],
  );

  const isDirty = Boolean(
    open && baselineSnapshot && currentSnapshot && currentSnapshot !== baselineSnapshot,
  );
  const isRegexValid = !(debugResult && !debugResult.valid);

  if (!open || !script) return null;

  const selectedPlacements = Array.isArray(draft.placement) && draft.placement.length > 0
    ? draft.placement
    : [REGEX_PLACEMENT.AI_OUTPUT];
  const selectedModes = resolveSelectedModes(draft);

  const handleRequestClose = () => {
    if (isDirty) {
      setUnsavedPromptOpen(true);
      return;
    }
    onClose?.();
  };

  const handleChangeApplyTo = (nextPlacements) => {
    const clean = Array.isArray(nextPlacements)
      ? nextPlacements.map((n) => Number(n)).filter((n) => Number.isInteger(n))
      : [];
    if (clean.length === 0) return;
    setDraft((prev) => ({ ...prev, placement: clean }));
  };

  const handleChangeModes = (nextModes) => {
    const nextList = Array.isArray(nextModes) ? nextModes : [];
    setDraft((prev) => {
      const prevModes = resolveSelectedModes(prev);
      const added = nextList.filter((m) => !prevModes.includes(m));
      const removed = prevModes.filter((m) => !nextList.includes(m));

      const nextRunOnEdit = nextList.includes('runOnEdit');
      let md = Boolean(prev.markdownOnly);
      let pr = Boolean(prev.promptOnly);

      if (added.includes('permanent')) {
        md = false;
        pr = false;
      } else {
        if (added.includes('display')) md = true;
        if (added.includes('prompt')) pr = true;
        if (removed.includes('display')) md = false;
        if (removed.includes('prompt')) pr = false;
        if (removed.includes('permanent') && !md && !pr) {
          md = true;
        }
      }

      return {
        ...prev,
        markdownOnly: md,
        promptOnly: pr,
        runOnEdit: nextRunOnEdit,
      };
    });
  };

  const handleSaveClick = () => {
    if (!isRegexValid) return;
    const cleanScript = normalizeRegexScript({
      ...draft,
      scriptName: String(draft.scriptName || '').trim() || 'Untitled Rule',
      trimStrings: trimDraftText
        .split(/\r?\n/)
        .filter((line) => line.length > 0),
    });
    setUnsavedPromptOpen(false);
    onSave?.(cleanScript);
    onClose?.();
  };

  const hasAdvancedConfigured =
    draft.minDepth !== null ||
    draft.maxDepth !== null ||
    draft.substituteRegex !== SUBSTITUTE_FIND_REGEX.NONE ||
    trimDraftText.trim().length > 0;

  return (
    <>
    <Modal
      open={open}
      onClose={handleRequestClose}
      title={draft.scriptName ? draft.scriptName : 'Regex Rule'}
      subtitle={scopeLabel}
      icon="regex"
      width={500}
      height={540}
      className="bb-rx-editor-modal"
      scrollWatchValue={`${testOpen}-${moreOpen}-${rawPreview}-${draft.findRegex?.length || 0}`}
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
            <Button variant="b1" emphasis="outlined" onClick={handleRequestClose}>
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="check"
              disabled={!isRegexValid}
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
          key={draft.id || 'rx-pattern'}
          label="Find Pattern"
          allowExpertToggle
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
            multiple
            minSelected={1}
            options={APPLY_TO_OPTIONS}
            value={selectedPlacements}
            onChange={handleChangeApplyTo}
            searchable={false}
            allowStars={false}
            renderMultipleLabel={(opts) =>
              opts.length === 1
                ? opts[0].label
                : opts.map((o) => o.shortLabel || o.label).join(' + ')
            }
          />
          <Dropdown
            label="Mode"
            multiple
            minSelected={1}
            options={MODE_OPTIONS}
            value={selectedModes}
            onChange={handleChangeModes}
            searchable={false}
            allowStars={false}
            renderMultipleLabel={(opts) =>
              opts.length === 1
                ? opts[0].label
                : opts.map((o) => o.shortLabel || o.label).join(' + ')
            }
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
            </div>
          )}
        </div>
      </div>
    </Modal>

    <UnsavedChangesModal
      open={unsavedPromptOpen}
      subtitle={`Regex Rule · ${scopeLabel}`}
      itemName={String(draft.scriptName || '').trim() || (isNew ? 'New Regex Rule' : 'Untitled Rule')}
      saveLabel="Save & Close"
      canSave={isRegexValid}
      cannotSaveReason={
        !isRegexValid
          ? 'Fix the regular expression syntax error before saving, or discard changes.'
          : ''
      }
      onCancel={() => setUnsavedPromptOpen(false)}
      onDiscard={() => {
        setUnsavedPromptOpen(false);
        onClose?.();
      }}
      onSave={handleSaveClick}
    />
    </>
  );
}

