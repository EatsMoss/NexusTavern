import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { Input } from '../../atoms/Input/Input.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { Dropdown } from '../../molecules/Dropdown/Dropdown.jsx';
import { EmojiPicker } from '../../molecules/EmojiPicker/EmojiPicker.jsx';
import { InlineEditableTitle } from '../../molecules/InlineEditableTitle/InlineEditableTitle.jsx';
import { MarkdownEditor } from '../MarkdownEditor/MarkdownEditor.jsx';
import {
  sanitizeXmlTagName,
  estimatePromptTokens,
  normalizePromptNameAndEmoji,
} from './promptGroupsModel.js';
import './PromptManager.css';

const GENERATION_TRIGGERS = [
  { id: 'normal', label: 'Normal' },
  { id: 'continue', label: 'Continue' },
  { id: 'impersonate', label: 'Impersonate' },
  { id: 'swipe', label: 'Swipe' },
  { id: 'quiet', label: 'Quiet' },
];

function buildNormalizedDraft(mode, target) {
  if (!target) return null;

  if (mode === 'group') {
    const normG = normalizePromptNameAndEmoji(
      target.groupName || target.xmlTag || 'prompt_group',
      target.bb_icon || '',
    );
    const cleanTag = sanitizeXmlTagName(target.xmlTag || normG.name || 'prompt_group');
    return {
      groupId: target.groupId,
      groupName: normG.name || cleanTag || 'prompt_group',
      xmlTag: target.xmlTag || cleanTag || 'prompt_group',
      role: target.role || 'system',
      injection_position: Number(target.injection_position ?? 0),
      injection_depth: Math.max(0, Number(target.injection_depth ?? 4) || 0),
      injection_order: Number(target.injection_order ?? 100),
      preamble: target.preamble ?? '',
      postamble: target.postamble ?? '',
      bb_icon: normG.bb_icon || '',
    };
  }

  const normP = normalizePromptNameAndEmoji(target.name || '', target.bb_icon || '');
  const sortedTriggers = Array.isArray(target.injection_trigger)
    ? [...target.injection_trigger]
    : [];

  return {
    ...target,
    name: normP.name,
    role: target.role || 'system',
    content: target.content ?? '',
    injection_position: Number(target.injection_position ?? 0),
    injection_depth: Math.max(0, Number(target.injection_depth ?? 4) || 0),
    injection_order: Number(target.injection_order ?? 100),
    forbid_overrides: Boolean(target.forbid_overrides ?? false),
    injection_trigger: sortedTriggers,
    bb_icon: normP.bb_icon || '',
  };
}

function serializePromptDraftSnapshot(mode, draft) {
  if (!draft) return '';
  if (mode === 'group') {
    const cleanTag = sanitizeXmlTagName(draft.xmlTag || draft.groupName);
    const normG = normalizePromptNameAndEmoji(draft.groupName, draft.bb_icon);
    return JSON.stringify({
      mode: 'group',
      groupId: draft.groupId || '',
      groupName: normG.name.trim() || cleanTag,
      xmlTag: cleanTag,
      role: draft.role || 'system',
      injection_position: Number(draft.injection_position ?? 0),
      injection_depth: Math.max(0, Number(draft.injection_depth ?? 4) || 0),
      injection_order: Number(draft.injection_order ?? 100),
      preamble: String(draft.preamble ?? ''),
      postamble: String(draft.postamble ?? ''),
      bb_icon: normG.bb_icon || '',
    });
  }

  const normP = normalizePromptNameAndEmoji(draft.name, draft.bb_icon);
  const triggers = Array.isArray(draft.injection_trigger)
    ? [...draft.injection_trigger].sort()
    : [];

  return JSON.stringify({
    mode: 'prompt',
    identifier: draft.identifier || '',
    name: normP.name.trim() || draft.identifier || '',
    role: draft.role || 'system',
    content: String(draft.content ?? ''),
    injection_position: Number(draft.injection_position ?? 0),
    injection_depth: Math.max(0, Number(draft.injection_depth ?? 4) || 0),
    injection_order: Number(draft.injection_order ?? 100),
    forbid_overrides: Boolean(draft.forbid_overrides ?? false),
    injection_trigger: triggers,
    bb_icon: normP.bb_icon || '',
  });
}

/**
 * PromptEditorSheet — Full-height M3 Sheet organism for editing a prompt block
 * or an XML prompt group in the central workspace column (matching Selected Scenario Expand).
 */
export const PromptEditorSheet = forwardRef(function PromptEditorSheet(
  {
    mode = 'prompt', // 'prompt' | 'group'
    target = null,
    isInherited = false,
    onClose,
    onSavePrompt,
    onSaveGroup,
    onDirtyChange,
    className = '',
  },
  ref,
) {
  const [draft, setDraft] = useState(() => buildNormalizedDraft(mode, target));
  const [baselineSnapshot, setBaselineSnapshot] = useState(() =>
    serializePromptDraftSnapshot(mode, buildNormalizedDraft(mode, target)),
  );
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const emojiTriggerRef = useRef(null);

  const targetIdentityKey =
    mode === 'group'
      ? `group:${target?.groupId || ''}`
      : `prompt:${target?.identifier || ''}`;
  const prevIdentityRef = useRef(targetIdentityKey);

  useEffect(() => {
    if (!target) {
      setDraft(null);
      setBaselineSnapshot('');
      prevIdentityRef.current = '';
      return;
    }

    const normalized = buildNormalizedDraft(mode, target);
    const nextSnap = serializePromptDraftSnapshot(mode, normalized);

    if (prevIdentityRef.current !== targetIdentityKey) {
      prevIdentityRef.current = targetIdentityKey;
      setEmojiPickerOpen(false);
      setDraft(normalized);
      setBaselineSnapshot(nextSnap);
      return;
    }

    setDraft((prevDraft) => {
      const prevSnap = serializePromptDraftSnapshot(mode, prevDraft);
      if (!prevDraft || prevSnap === baselineSnapshot) {
        setBaselineSnapshot(nextSnap);
        return normalized;
      }
      return prevDraft;
    });
  }, [mode, target, targetIdentityKey, baselineSnapshot]);

  const currentSnapshot = useMemo(
    () => serializePromptDraftSnapshot(mode, draft),
    [mode, draft],
  );

  const isDirty = Boolean(
    draft && baselineSnapshot && currentSnapshot && currentSnapshot !== baselineSnapshot,
  );

  const handleApply = useCallback(() => {
    if (!draft) return;
    if (mode === 'group') {
      const cleanTag = sanitizeXmlTagName(draft.xmlTag || draft.groupName);
      const normG = normalizePromptNameAndEmoji(draft.groupName, draft.bb_icon);
      const savedGroup = {
        ...draft,
        xmlTag: cleanTag,
        groupName: normG.name.trim() || cleanTag,
        bb_icon: normG.bb_icon || '',
      };
      setDraft(savedGroup);
      setBaselineSnapshot(serializePromptDraftSnapshot('group', savedGroup));
      onSaveGroup?.(savedGroup);
    } else {
      const normP = normalizePromptNameAndEmoji(draft.name, draft.bb_icon);
      const savedPrompt = {
        ...draft,
        name: normP.name.trim() || draft.identifier,
        bb_icon: normP.bb_icon || '',
      };
      setDraft(savedPrompt);
      setBaselineSnapshot(serializePromptDraftSnapshot('prompt', savedPrompt));
      onSavePrompt?.(savedPrompt);
    }
  }, [draft, mode, onSaveGroup, onSavePrompt]);

  const handleDiscard = useCallback(() => {
    if (!target) return;
    const restored = buildNormalizedDraft(mode, target);
    setDraft(restored);
    setBaselineSnapshot(serializePromptDraftSnapshot(mode, restored));
  }, [mode, target]);

  useEffect(() => {
    const label = draft
      ? mode === 'group'
        ? String(draft.groupName || draft.xmlTag || 'Prompt Group').trim()
        : String(draft.name || draft.identifier || 'Prompt').trim()
      : '';
    onDirtyChange?.({
      isDirty,
      canSave: Boolean(draft),
      cannotSaveReason: '',
      itemName: label,
      subtitle: mode === 'group' ? 'XML Prompt Group' : 'Prompt Editor',
    });
  }, [isDirty, draft, mode, onDirtyChange]);

  useImperativeHandle(
    ref,
    () => ({
      isDirty,
      canSave: Boolean(draft),
      save: async () => {
        if (!draft) return false;
        handleApply();
        return true;
      },
      discard: () => {
        handleDiscard();
      },
    }),
    [isDirty, draft, handleApply, handleDiscard],
  );

  useEffect(() => {
    if (!draft) return undefined;
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyS' || e.key?.toLowerCase() === 's')) {
        e.preventDefault();
        if (isDirty) {
          e.stopPropagation();
          handleApply();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [draft, isDirty, handleApply]);

  if (!target || !draft) {
    return (
      <div className="bb-pm-sheet__empty">
        <Icon name="edit" size={28} />
        <div className="bb-pm-sheet__empty-title">No Prompt Selected</div>
        <div className="bb-pm-sheet__empty-sub">
          Click any prompt or XML group in Prompt Manager to inspect and edit it here.
        </div>
      </div>
    );
  }

  const isMarker = mode === 'prompt' && Boolean(draft.marker);
  const canResetName =
    mode === 'prompt' &&
    Boolean(draft.defaultName) &&
    draft.name !== draft.defaultName;

  const handleTitleChange = (rawTitle) => {
    const fieldKey = mode === 'group' ? 'groupName' : 'name';
    setDraft((prev) => {
      const norm = normalizePromptNameAndEmoji(rawTitle, prev.bb_icon);
      return {
        ...prev,
        [fieldKey]: norm.name,
        bb_icon: norm.bb_icon,
      };
    });
  };

  const handleToggleTrigger = (trigId) => {
    setDraft((prev) => {
      const list = Array.isArray(prev.injection_trigger) ? prev.injection_trigger : [];
      const next = list.includes(trigId)
        ? list.filter((x) => x !== trigId)
        : [...list, trigId];
      return { ...prev, injection_trigger: next };
    });
  };

  const tokenCount = mode === 'prompt' && !isMarker ? estimatePromptTokens(draft) : 0;
  const cleanXmlTag = mode === 'group' ? sanitizeXmlTagName(draft.xmlTag || draft.groupName) : '';
  const roleLabel =
    String(draft.role || 'system').charAt(0).toUpperCase() +
    String(draft.role || 'system').slice(1);
  const isDepthInjection = Number(draft.injection_position) === 1;

  return (
    <div
      className={[
        'bb-pm-sheet',
        isDirty ? 'has-dirty-bar' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* 1. M3 HEADER */}
      <header className="bb-pm-sheet__header">
        <div className="bb-pm-sheet__icon-slot">
          <button
            ref={emojiTriggerRef}
            type="button"
            className="bb-pm-sheet__emoji-btn"
            title="Choose emoji icon"
            aria-label="Choose emoji icon"
            onClick={() => {
              if (!emojiPickerOpen && typeof document !== 'undefined') {
                document.activeElement?.blur?.();
              }
              setEmojiPickerOpen((v) => !v);
            }}
          >
            {draft.bb_icon ? (
              <span className="bb-pm-sheet__emoji-glyph">{draft.bb_icon}</span>
            ) : (
              <Icon
                name={mode === 'group' ? 'folder' : isMarker ? 'pin' : 'smile'}
                size={20}
              />
            )}
          </button>
          <EmojiPicker
            open={emojiPickerOpen}
            onOpenChange={setEmojiPickerOpen}
            anchorRef={emojiTriggerRef}
            placement="bottom-start"
            selectedEmoji={draft.bb_icon || ''}
            allowClear={Boolean(draft.bb_icon)}
            closeOnSelect
            onClear={() => setDraft((prev) => ({ ...prev, bb_icon: '' }))}
            onSelect={(em) => setDraft((prev) => ({ ...prev, bb_icon: em }))}
          />
        </div>

        <div className="bb-pm-sheet__head-main">
          <InlineEditableTitle
            value={mode === 'group' ? draft.groupName || '' : draft.name || ''}
            onChange={handleTitleChange}
            placeholder={mode === 'group' ? 'Unnamed XML Group' : 'Unnamed Prompt'}
            size="lg"
            editTooltip={
              mode === 'group' ? 'Click to rename XML group' : 'Click to rename prompt'
            }
            trailing={
              <div className="bb-pm-sheet__head-actions">
                {canResetName && (
                  <Button
                    variant="b2"
                    size="sm"
                    icon="refresh"
                    title={`Restore default name: "${draft.defaultName}"`}
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, name: prev.defaultName }))
                    }
                  >
                    Reset
                  </Button>
                )}
                {onClose && (
                  <Button
                    variant="b2"
                    size="sm"
                    icon="collapse"
                    active
                    title="Close prompt editor and return to chat"
                    onClick={onClose}
                  />
                )}
              </div>
            }
          />

          <div className="bb-pm-sheet__telemetry">
            {mode === 'group' ? (
              <>
                <span className="bb-pm-group-xml-badge">&lt;{cleanXmlTag}&gt;</span>
                <span className="bb-pm-sheet__telemetry-dot">·</span>
                <span className="bb-pm-sheet__telemetry-item">
                  Role <strong>{roleLabel}</strong>
                </span>
                <span className="bb-pm-sheet__telemetry-dot">·</span>
                <span className="bb-pm-sheet__telemetry-item">
                  {isDepthInjection ? (
                    <>
                      In-Chat <strong>@D{draft.injection_depth ?? 4}</strong>
                    </>
                  ) : (
                    <span>Propagates Role &amp; Position to children</span>
                  )}
                </span>
              </>
            ) : isMarker ? (
              <>
                <span className="bb-pm-sheet__pill">System Marker</span>
                <span className="bb-pm-sheet__telemetry-dot">·</span>
                <span className="bb-pm-sheet__mono-id">ID: {draft.identifier}</span>
              </>
            ) : (
              <>
                <span className="bb-pm-sheet__telemetry-item" title="Estimated prompt tokens">
                  Tokens <strong>~{tokenCount.toLocaleString()}</strong>
                </span>
                <span className="bb-pm-sheet__telemetry-dot">·</span>
                <span className="bb-pm-sheet__pill">{roleLabel}</span>
                <span className="bb-pm-sheet__pill bb-pm-sheet__pill--subtle">
                  {isDepthInjection ? `@D${draft.injection_depth ?? 4}` : 'Relative'}
                </span>
                <span className="bb-pm-sheet__mono-id" title={`Identifier: ${draft.identifier}`}>
                  {draft.identifier}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 2. COMPACT TOP SETTINGS STRIP */}
      {!isMarker && (
        <section
          className={`bb-pm-sheet__settings ${isInherited ? 'is-inherited' : ''}`}
          aria-label="Prompt delivery settings"
        >
          {isInherited && (
            <div className="bb-pm-sheet__inherited-banner">
              <Icon name="folder" size={13} />
              <span>Role &amp; Position are inherited from the parent XML Group.</span>
            </div>
          )}

          <div
            className={`bb-pm-sheet__delivery-grid ${
              mode === 'group'
                ? isDepthInjection
                  ? 'bb-pm-sheet__delivery-grid--group-depth'
                  : 'bb-pm-sheet__delivery-grid--group'
                : isDepthInjection
                  ? 'bb-pm-sheet__delivery-grid--depth'
                  : 'bb-pm-sheet__delivery-grid--compact'
            }`}
          >
            {mode === 'group' && (
              <Input
                size="sm"
                label="XML Tag (<tag>)"
                value={draft.xmlTag || ''}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, xmlTag: e.target.value }))
                }
              />
            )}

            <Dropdown
              size="sm"
              label="Role"
              disabled={isInherited}
              searchable={false}
              allowStars={false}
              value={draft.role || 'system'}
              onChange={(val) =>
                !isInherited && setDraft((prev) => ({ ...prev, role: val }))
              }
              options={[
                { value: 'system', label: 'System' },
                { value: 'user', label: 'User' },
                { value: 'assistant', label: 'Assistant' },
              ]}
            />

            <Dropdown
              size="sm"
              label="Position"
              disabled={isInherited}
              searchable={false}
              allowStars={false}
              value={String(draft.injection_position ?? 0)}
              onChange={(val) =>
                !isInherited &&
                setDraft((prev) => ({ ...prev, injection_position: Number(val) }))
              }
              options={[
                { value: '0', label: 'Relative (In Order)' },
                { value: '1', label: 'In-Chat @ Depth' },
              ]}
            />

            {isDepthInjection && (
              <>
                <Input
                  size="sm"
                  label="Depth"
                  type="number"
                  disabled={isInherited}
                  title="0 = right after the latest chat message"
                  value={String(draft.injection_depth ?? 4)}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      injection_depth: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
                <Input
                  size="sm"
                  label="Order"
                  type="number"
                  disabled={isInherited}
                  title="Higher order is injected later at the same depth"
                  value={String(draft.injection_order ?? 100)}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      injection_order: Number(e.target.value) || 100,
                    }))
                  }
                />
              </>
            )}
          </div>

          {mode === 'prompt' && (
            <div className="bb-pm-sheet__rules-bar">
              <div className="bb-pm-sheet__triggers">
                <span
                  className="bb-pm-sheet__micro-label"
                  title="Leave all unselected to fire on every generation type"
                >
                  Triggers:
                </span>
                <div className="bb-pm-filter-pills">
                  {GENERATION_TRIGGERS.map((t) => {
                    const active = (draft.injection_trigger || []).includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`bb-pm-filter-pill ${active ? 'is-active' : ''}`}
                        onClick={() => handleToggleTrigger(t.id)}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Switch
                size="sm"
                inlineLabel="Lock Override"
                title="Forbid character cards from overriding this prompt block"
                checked={Boolean(draft.forbid_overrides)}
                onChange={(val) =>
                  setDraft((prev) => ({ ...prev, forbid_overrides: val }))
                }
              />
            </div>
          )}
        </section>
      )}

      {/* 3. FULL-HEIGHT EDITOR WORKSPACE */}
      <div className="bb-pm-sheet__stage">
        {mode === 'group' ? (
          <div className="bb-pm-sheet__group-editors">
            <div className="bb-pm-sheet__group-editor-slot">
              <MarkdownEditor
                label={`Preamble (Before <${cleanXmlTag}>)`}
                fillHeight
                value={draft.preamble || ''}
                onChange={(val) => setDraft((prev) => ({ ...prev, preamble: val }))}
                placeholder={`Optional instructions injected immediately before <${cleanXmlTag}>...`}
              />
            </div>
            <div className="bb-pm-sheet__group-editor-slot">
              <MarkdownEditor
                label={`Postamble (After </${cleanXmlTag}>)`}
                fillHeight
                value={draft.postamble || ''}
                onChange={(val) => setDraft((prev) => ({ ...prev, postamble: val }))}
                placeholder={`Optional instructions injected immediately after </${cleanXmlTag}>...`}
              />
            </div>
          </div>
        ) : isMarker ? (
          <div className="bb-pm-sheet__marker-card">
            <div className="bb-pm-sheet__marker-icon">
              <Icon name="pin" size={22} />
            </div>
            <div className="bb-pm-sheet__marker-title">Dynamic System Marker</div>
            <div className="bb-pm-sheet__marker-desc">
              This block is a positional placeholder (<code>{draft.identifier}</code>) whose
              content is dynamically populated from your active scenario, persona, world info,
              or chat history at generation time. You can customize its display title and icon
              above, or drag it in Prompt Manager to control where it appears in the context.
            </div>
          </div>
        ) : (
          <div className="bb-pm-sheet__editor-fill">
            <MarkdownEditor
              label="Prompt Content"
              headerActions={
                <span className="bb-caption-text">
                  Supports <code>{'{{char}}'}</code>, <code>{'{{user}}'}</code> &amp; Markdown
                </span>
              }
              fillHeight
              value={draft.content || ''}
              onChange={(val) => setDraft((prev) => ({ ...prev, content: val }))}
              placeholder="Write system instructions, style guidelines, or in-chat prompt content..."
            />
          </div>
        )}
      </div>

      {/* 4. M3 FLOATING APPLY / DISCARD BAR */}
      {isDirty && (
        <div
          className="bb-pm-sheet__dirty-bar"
          role="region"
          aria-label="Unsaved prompt changes"
        >
          <div className="bb-pm-sheet__dirty-info">
            <span className="bb-pm-sheet__dirty-dot" aria-hidden="true" />
            <span>Unsaved changes</span>
            <kbd className="bb-pm-sheet__dirty-kbd">Ctrl+S</kbd>
          </div>
          <div className="bb-pm-sheet__dirty-actions">
            <Button
              variant="b2"
              size="sm"
              icon="undo"
              onClick={handleDiscard}
            >
              Discard
            </Button>
            <Button
              variant="b1"
              size="sm"
              emphasis="filled"
              icon="check"
              onClick={handleApply}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

