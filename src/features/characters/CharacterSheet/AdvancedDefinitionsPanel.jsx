import React, { useState, useRef, useMemo } from 'react';
import {
  BookmarkRibbons,
  Button,
  Dropdown,
  FolderCard,
  Icon,
  Input,
  MarkdownEditor,
  PanelScreenHeader,
  ScrollIndicator,
  Slider,
} from '@ui/index.js';
import { computeCardTokenStats } from './CharacterSheetHeader.jsx';

function approxFieldTokens(text) {
  const s = String(text || '');
  return s ? Math.ceil(s.length / 3.8) : 0;
}

const DEPTH_ROLE_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'user', label: 'User' },
  { value: 'assistant', label: 'Assistant' },
];

const ADV_TABS = [
  { id: 'personality', label: 'Personality' },
  { id: 'examples', label: 'Examples' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'metadata', label: 'Metadata' },
];

export function AdvancedDefinitionsPanel({
  card = null,
  isDirty = false,
  saving = false,
  onChangeCardField,
  onSaveCard,
  onDiscardChanges,
  onCollapseExpand,
}) {
  const [activeTab, setActiveTab] = useState('personality');
  const [embeddedTagDraft, setEmbeddedTagDraft] = useState('');
  const scrollRef = useRef(null);

  const tokenStats = useMemo(() => computeCardTokenStats(card), [card]);

  if (!card) {
    return (
      <div className="bb-cs-empty">
        <Icon name="sliders" size={26} />
        <div className="bb-cs-empty__title">No Scenario Selected</div>
        <div className="bb-cs-empty__sub">
          Select a scenario to inspect and edit its advanced prompt definitions.
        </div>
      </div>
    );
  }

  const personality = String(card.personality ?? '');
  const scenario = String(card.scenario ?? '');
  const talkativenessNum = (() => {
    const parsed = Number.parseFloat(
      card.talkativeness ?? card.extensions?.talkativeness ?? '0.5',
    );
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1, Number(parsed.toFixed(2)))) : 0.5;
  })();

  const mesExample = String(card.mes_example ?? '');
  const systemPrompt = String(card.system_prompt ?? '');
  const postHistory = String(card.post_history_instructions ?? '');

  const rawDepthPrompt = card.extensions?.depth_prompt || {};
  const depthPromptText = String(rawDepthPrompt.prompt ?? '');
  const depthValue =
    rawDepthPrompt.depth !== undefined && rawDepthPrompt.depth !== null
      ? Number(rawDepthPrompt.depth)
      : 4;
  const depthRole = ['system', 'user', 'assistant'].includes(rawDepthPrompt.role)
    ? rawDepthPrompt.role
    : 'system';

  const creator = String(card.creator ?? '');
  const charVersion = String(card.character_version ?? '');
  const nickname = String(card.nickname ?? '');
  const embeddedTags = Array.isArray(card.embeddedTags) ? card.embeddedTags : [];
  const galleryTags = Array.isArray(card.tags) ? card.tags : [];

  const updateDepthPrompt = (patch) => {
    const nextDepthObj = {
      prompt: depthPromptText,
      depth: Number.isFinite(depthValue) ? depthValue : 4,
      role: depthRole,
      ...patch,
    };
    onChangeCardField?.({
      extensions: {
        ...(card.extensions || {}),
        depth_prompt: nextDepthObj,
      },
    });
  };

  const handleChangeTalkativeness = (val) => {
    const formatted = String(Number(Number(val).toFixed(2)));
    onChangeCardField?.({
      talkativeness: formatted,
      extensions: {
        ...(card.extensions || {}),
        talkativeness: formatted,
      },
    });
  };

  const handleInsertExampleBlock = () => {
    const trimmed = mesExample.trimEnd();
    const snippet = trimmed
      ? `${trimmed}\n<START>\n{{user}}: \n{{char}}: `
      : `<START>\n{{user}}: \n{{char}}: `;
    onChangeCardField?.({ mes_example: snippet });
  };

  const appendOriginalMacro = (field, currentVal) => {
    if (String(currentVal).includes('{{original}}')) return;
    const trimmed = String(currentVal || '').trim();
    const next = trimmed ? `{{original}}\n\n${trimmed}` : '{{original}}\n';
    onChangeCardField?.({ [field]: next });
  };

  const handleAddEmbeddedTag = () => {
    const clean = embeddedTagDraft.trim();
    if (!clean) return;
    const exists = embeddedTags.some((t) => t.toLowerCase() === clean.toLowerCase());
    if (!exists) {
      onChangeCardField?.({ embeddedTags: [...embeddedTags, clean] });
    }
    setEmbeddedTagDraft('');
  };

  const handleRemoveEmbeddedTag = (targetTag) => {
    onChangeCardField?.({
      embeddedTags: embeddedTags.filter((t) => t !== targetTag),
    });
  };

  const handleSyncGalleryTagsToEmbedded = () => {
    const mergedSet = new Map();
    for (const t of [...embeddedTags, ...galleryTags]) {
      const clean = String(t || '').trim();
      if (clean && !mergedSet.has(clean.toLowerCase())) {
        mergedSet.set(clean.toLowerCase(), clean);
      }
    }
    onChangeCardField?.({ embeddedTags: Array.from(mergedSet.values()) });
  };

  const unembeddedGalleryCount = galleryTags.filter(
    (gt) => !embeddedTags.some((et) => et.toLowerCase() === String(gt).toLowerCase()),
  ).length;

  const isFillExamples = activeTab === 'examples';
  return (
    <div
      className={`bb-adv-panel ${isDirty || saving ? 'has-dirty-bar' : ''}`.trim()}
    >
      <div className="bb-adv-panel__top">
        <PanelScreenHeader
          title="Advanced Definitions"
          icon="sliders"
          subtitle={`Perm ${tokenStats.permanent.toLocaleString()} · Total ${tokenStats.total.toLocaleString()} tok`}
          backLabel="Back to Scenario Sheet"
          onBack={onCollapseExpand}
        />

        <BookmarkRibbons
          variant="secondary"
          tabs={ADV_TABS}
          activeId={activeTab}
          onChange={setActiveTab}
          className="bb-cs-tabs"
        />
      </div>

      <div className="bb-cs-body-wrap">
        <div
          ref={scrollRef}
          className={`bb-cs-body bb-scrollbar--hidden ${isFillExamples ? 'is-fill-mode' : ''}`.trim()}
        >
          {activeTab === 'personality' && (
            <div className="bb-adv-modal__stack">
              <div className="bb-adv-modal__editor-med">
                <MarkdownEditor
                  label="Personality Summary"
                  headerActions={
                    <span className="bb-caption-text">
                      Permanent · ~{approxFieldTokens(personality)} tok
                    </span>
                  }
                  value={personality}
                  onChange={(val) => onChangeCardField?.({ personality: val })}
                  placeholder="Concise summary of character traits, temperament, mannerisms, and core drives..."
                />
              </div>

              <div className="bb-adv-modal__editor-med">
                <MarkdownEditor
                  label="Scenario & Circumstances"
                  headerActions={
                    <span className="bb-caption-text">
                      Permanent · ~{approxFieldTokens(scenario)} tok
                    </span>
                  }
                  value={scenario}
                  onChange={(val) => onChangeCardField?.({ scenario: val })}
                  placeholder="Current setting, relationship context, and immediate narrative premise..."
                />
              </div>

              <FolderCard
                title="Group Chat Behavior"
                subtitle="Controls how eagerly this character speaks during natural group chat turns"
                icon="users"
                defaultOpen
              >
                <Slider
                  label="Talkativeness"
                  hint={
                    talkativenessNum <= 0.25
                      ? 'Shy / reserved in groups'
                      : talkativenessNum >= 0.75
                        ? 'Chatterbox / dominant speaker'
                        : 'Balanced participation'
                  }
                  min={0}
                  max={1}
                  step={0.05}
                  defaultValue={0.5}
                  value={talkativenessNum}
                  onChange={handleChangeTalkativeness}
                />
              </FolderCard>
            </div>
          )}

          {activeTab === 'examples' && (
            <div className="bb-cs-fill-tab" style={{ gap: 8 }}>
              <div className="bb-adv-modal__hint-banner">
                <div className="bb-adv-modal__hint-text">
                  <Icon name="comments" size={15} />
                  <span>
                    Separate dialogue blocks with <code>&lt;START&gt;</code>.
                  </span>
                </div>
                <Button variant="b2" size="sm" icon="plus" onClick={handleInsertExampleBlock}>
                  Insert &lt;START&gt;
                </Button>
              </div>

              <MarkdownEditor
                label="Example Dialogue (mes_example)"
                headerActions={
                  <span className="bb-caption-text">
                    Transient · ~{approxFieldTokens(mesExample)} tok
                  </span>
                }
                fillHeight
                value={mesExample}
                onChange={(val) => onChangeCardField?.({ mes_example: val })}
                placeholder={'<START>\n{{user}}: Tell me what you see.\n{{char}}: *She leans over the parapet, eyes narrowing against the sleet.* "Torchlight in the lower ward."'}
              />
            </div>
          )}
          {activeTab === 'prompts' && (
            <div className="bb-adv-modal__stack">
              <FolderCard
                title="Character's Note (Depth Prompt)"
                subtitle={`Injected @ Depth ${Number.isFinite(depthValue) ? depthValue : 4} as ${depthRole.toUpperCase()}`}
                icon="pin"
                defaultOpen
              >
                <div className="bb-adv-modal__depth-controls">
                  <div className="bb-adv-modal__depth-num">
                    <Input
                      label="Injection @ Depth"
                      hint="0 = bottom of chat"
                      type="number"
                      min={0}
                      max={999}
                      step={1}
                      value={Number.isFinite(depthValue) ? depthValue : 4}
                      onChange={(e) => {
                        const raw = Number.parseInt(e.target.value, 10);
                        const clamped = Number.isNaN(raw) ? 0 : Math.max(0, Math.min(999, raw));
                        updateDepthPrompt({ depth: clamped });
                      }}
                    />
                  </div>

                  <div className="bb-adv-modal__depth-role">
                    <Dropdown
                      label="Injection Role"
                      searchable={false}
                      allowStars={false}
                      options={DEPTH_ROLE_OPTIONS}
                      value={depthRole}
                      onChange={(nextRole) => updateDepthPrompt({ role: nextRole })}
                    />
                  </div>
                </div>

                <div className="bb-adv-modal__editor-sm">
                  <MarkdownEditor
                    label="Character's Note Prompt"
                    headerActions={
                      <span className="bb-caption-text">
                        Permanent · ~{approxFieldTokens(depthPromptText)} tok
                      </span>
                    }
                    value={depthPromptText}
                    onChange={(val) => updateDepthPrompt({ prompt: val })}
                    placeholder="Persistent instructions anchored near the latest messages..."
                  />
                </div>
              </FolderCard>

              <FolderCard
                title="Main System Prompt Override"
                subtitle={
                  systemPrompt.includes('{{original}}')
                    ? 'Extends global system prompt'
                    : systemPrompt.trim()
                      ? 'Replaces global system prompt'
                      : 'Uses global preset system prompt'
                }
                icon="sparkles"
                defaultOpen
              >
                <div className="bb-adv-modal__editor-sm">
                  <MarkdownEditor
                    label="System Prompt"
                    headerActions={
                      <div className="bb-adv-modal__inline-actions">
                        <span className="bb-caption-text">
                          Permanent · ~{approxFieldTokens(systemPrompt)} tok
                        </span>
                        <Button
                          variant="b2"
                          size="sm"
                          icon="plus"
                          disabled={systemPrompt.includes('{{original}}')}
                          title="Insert {{original}} macro to include the global System Prompt"
                          onClick={() => appendOriginalMacro('system_prompt', systemPrompt)}
                        >
                          {'{{original}}'}
                        </Button>
                      </div>
                    }
                    value={systemPrompt}
                    onChange={(val) => onChangeCardField?.({ system_prompt: val })}
                    placeholder="Optional character-specific system prompt. Include {{original}} to keep your preset's main prompt..."
                  />
                </div>
              </FolderCard>

              <FolderCard
                title="Post-History Instructions (UJB / Jailbreak)"
                subtitle={
                  postHistory.includes('{{original}}')
                    ? 'Extends global post-history instructions'
                    : postHistory.trim()
                      ? 'Replaces global post-history instructions'
                      : 'Uses global preset post-history instructions'
                }
                icon="doubleChevronDown"
                defaultOpen
              >
                <div className="bb-adv-modal__editor-sm">
                  <MarkdownEditor
                    label="Post-History Prompt"
                    headerActions={
                      <div className="bb-adv-modal__inline-actions">
                        <span className="bb-caption-text">
                          Permanent · ~{approxFieldTokens(postHistory)} tok
                        </span>
                        <Button
                          variant="b2"
                          size="sm"
                          icon="plus"
                          disabled={postHistory.includes('{{original}}')}
                          title="Insert {{original}} macro to include the global Post-History Instructions"
                          onClick={() => appendOriginalMacro('post_history_instructions', postHistory)}
                        >
                          {'{{original}}'}
                        </Button>
                      </div>
                    }
                    value={postHistory}
                    onChange={(val) => onChangeCardField?.({ post_history_instructions: val })}
                    placeholder="Instructions placed after chat history. Include {{original}} to preserve preset PHI..."
                  />
                </div>
              </FolderCard>
            </div>
          )}

          {activeTab === 'metadata' && (
            <div className="bb-adv-modal__stack">
              <FolderCard
                title="Card Attribution & Spec V3 Identity"
                subtitle={
                  card.spec === 'chara_card_v3' || card.hasCcv3Chunk || nickname
                    ? 'Character Card Spec V3'
                    : 'Character Card Spec V2'
                }
                icon="addressCard"
                defaultOpen
              >
                <div className="bb-adv-panel__meta-fields">
                  <Input
                    size="sm"
                    label="Creator"
                    value={creator}
                    onChange={(e) => onChangeCardField?.({ creator: e.target.value })}
                    placeholder="Author handle or name..."
                  />
                  <Input
                    size="sm"
                    label="Character Version"
                    value={charVersion}
                    onChange={(e) => onChangeCardField?.({ character_version: e.target.value })}
                    placeholder="1.0"
                  />
                  <Input
                    size="sm"
                    label="Nickname (CCv3 {{char}})"
                    hint="Replaces {{char}} macro in prompts when set"
                    value={nickname}
                    onChange={(e) => onChangeCardField?.({ nickname: e.target.value })}
                    placeholder="Optional short name..."
                  />
                </div>
              </FolderCard>
              <FolderCard
                title="Embedded Card Tags"
                subtitle={`${embeddedTags.length} tag${embeddedTags.length === 1 ? '' : 's'} baked into PNG/JSON file`}
                icon="tags"
                defaultOpen
                actions={
                  unembeddedGalleryCount > 0 ? (
                    <Button
                      variant="b2"
                      size="sm"
                      icon="copy"
                      title="Copy assigned gallery tags into the card's embedded PNG/JSON tags"
                      onClick={handleSyncGalleryTagsToEmbedded}
                    >
                      Embed (+{unembeddedGalleryCount})
                    </Button>
                  ) : null
                }
              >
                <div className="bb-adv-modal__tags-wrap">
                  {embeddedTags.length > 0 ? (
                    <div className="bb-cs-tag-cloud">
                      {embeddedTags.map((tag) => (
                        <span key={tag} className="bb-cs-tag-pill">
                          <span>{tag}</span>
                          <button
                            type="button"
                            className="bb-cs-tag-pill__rm"
                            aria-label={`Remove embedded tag ${tag}`}
                            onClick={() => handleRemoveEmbeddedTag(tag)}
                          >
                            <Icon name="close" size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="bb-caption-text">
                      No tags are currently baked into this card file. Embedded tags travel with the PNG/JSON when exported.
                    </div>
                  )}

                  <div className="bb-cs-inline-row">
                    <div className="bb-cs-inline-row__grow">
                      <Input
                        size="sm"
                        value={embeddedTagDraft}
                        onChange={(e) => setEmbeddedTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddEmbeddedTag();
                          }
                        }}
                        placeholder="Add embedded tag and press Enter..."
                      />
                    </div>
                    <Button
                      variant="b2"
                      size="sm"
                      icon="plus"
                      disabled={!embeddedTagDraft.trim()}
                      onClick={handleAddEmbeddedTag}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </FolderCard>
            </div>
          )}
        </div>

        {!isFillExamples && (
          <ScrollIndicator scrollRef={scrollRef} className="bb-scroll-indicator--panel" />
        )}
      </div>

      {(isDirty || saving) && (
        <div className="bb-cs-dirty-bar" role="region" aria-label="Unsaved changes">
          <div className="bb-cs-dirty-bar__info">
            <span className="bb-cs-dirty-bar__dot" aria-hidden="true" />
            <span>{saving ? 'Saving...' : 'Unsaved'}</span>
            <kbd className="bb-cs-dirty-bar__kbd">Ctrl+S</kbd>
          </div>
          <div className="bb-cs-dirty-bar__actions">
            <Button variant="b2" size="sm" icon="undo" disabled={saving} onClick={onDiscardChanges}>
              Discard
            </Button>
            <Button variant="b1" size="sm" emphasis="filled" icon="check" disabled={saving} onClick={onSaveCard}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
