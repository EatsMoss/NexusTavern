import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  BookmarkRibbons,
  Button,
  Icon,
  MarkdownEditor,
  ScrollIndicator,
  SkeletonCharacterSheet,
} from '@ui/index.js';
import { CharacterSheetHeader } from './CharacterSheetHeader.jsx';
import { AvatarGalleryStrip } from './AvatarGalleryStrip.jsx';
import { DescriptionTab } from './DescriptionTab.jsx';
import { IntrosTab } from './IntrosTab.jsx';
import { LinksBindingsTab } from './LinksBindingsTab.jsx';
import './CharacterSheet.css';

export function serializeCardEditableSnapshot(card) {
  if (!card) return '';
  return JSON.stringify({
    name: card.name || '',
    description: card.description || '',
    creator_notes: card.creator_notes || '',
    first_mes: card.first_mes || '',
    alternate_greetings: card.alternate_greetings || [],
    group_only_greetings: card.group_only_greetings || [],
    personality: card.personality || '',
    scenario: card.scenario || '',
    mes_example: card.mes_example || '',
    system_prompt: card.system_prompt || '',
    post_history_instructions: card.post_history_instructions || '',
    creator: card.creator || '',
    character_version: card.character_version || '',
    nickname: card.nickname || '',
    talkativeness: String(card.talkativeness ?? '0.5'),
    embeddedTags: Array.isArray(card.embeddedTags) ? card.embeddedTags : [],
    extensions: card.extensions || {},
  });
}

export function CharacterSheet({
  card,
  cleanSnapshot = '',
  activeIntroIdx = 0,
  onChangeIntroIdx,
  editingIntroTarget = null,
  onOpenIntroEditor,
  activeTab: controlledTab,
  onChangeTab,
  isExpanded = false,
  loading = false,
  saving = false,
  busyPortrait = false,
  statusMsg = '',
  onChangeCardField,
  onPersistCardPatch,
  onSaveCard,
  onDiscardChanges,
  onToggleSpoilerBlur,
  onTogglePin,
  onOpenAdvanced,
  onToggleExpand,
  onStartNewChat,
  onPickMainPortraitFile,
  onUploadGalleryPortraits,
  onSelectGalleryPortrait,
  onDeleteGalleryPortrait,
  onPickReplaceCardFile,
  onExportCard,
  onDuplicateCard,
  onConvertToPersona,
  onRefreshChatPortraits,
  onDeleteCard,
  onUploadIntroPortrait,
  linksProps = {},
}) {
  const [uncontrolledTab, setUncontrolledTab] = useState('description');
  const sheetTab = controlledTab ?? uncontrolledTab;
  const setSheetTab = onChangeTab ?? setUncontrolledTab;
  const bodyScrollRef = useRef(null);

  const currentSnapshot = useMemo(() => serializeCardEditableSnapshot(card), [card]);
  const isDirty = Boolean(
    card && cleanSnapshot && currentSnapshot && currentSnapshot !== cleanSnapshot,
  );

  useEffect(() => {
    if (!card || editingIntroTarget) return undefined;
    const onKeyDown = (e) => {
      if (e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyS' || e.key?.toLowerCase() === 's')) {
        e.preventDefault();
        if (isDirty && !saving) onSaveCard?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [card, editingIntroTarget, isDirty, saving, onSaveCard]);

  if (!card) {
    if (loading) {
      return <SkeletonCharacterSheet isExpanded={isExpanded} />;
    }
    return (
      <div className="bb-cs-empty">
        <Icon name="addressCard" size={28} />
        <div className="bb-cs-empty__title">No Scenario Selected</div>
        <div className="bb-cs-empty__sub">
          Pick any character or scenario card from All Scenarios to inspect and edit its sheet.
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'description', label: 'Description' },
    { id: 'intros', label: 'Intros' },
    { id: 'notes', label: 'Notes' },
    { id: 'links', label: 'Links' },
  ];

  const isFillTab = sheetTab === 'description' || sheetTab === 'notes';

  return (
    <div
      className={`bb-character-sheet ${isExpanded ? 'bb-character-sheet--expanded' : ''} ${
        isDirty ? 'has-dirty-bar' : ''
      }`.trim()}
    >
      <div className="bb-cs-top">
        <CharacterSheetHeader
          card={card}
          isExpanded={isExpanded}
          busyPortrait={busyPortrait}
          onChangeName={(nextName) => onChangeCardField?.({ name: nextName })}
          onChangeSubtitle={(nextSub) =>
            linksProps?.onUpdateScenarioMeta?.({ subtitle: nextSub })
          }
          onTogglePin={onTogglePin}
          onOpenAdvanced={onOpenAdvanced}
          onToggleExpand={onToggleExpand}
          onStartNewChat={onStartNewChat}
          onPickMainPortraitFile={onPickMainPortraitFile}
          onPickReplaceCardFile={onPickReplaceCardFile}
          onExportCard={onExportCard}
          onDuplicateCard={onDuplicateCard}
          onConvertToPersona={onConvertToPersona}
          onRefreshChatPortraits={onRefreshChatPortraits}
          onDeleteCard={onDeleteCard}
        />

        <AvatarGalleryStrip
          gallery={card.scenarioMeta?.avatarGallery || []}
          activePortraitId={card.scenarioMeta?.activePortraitId || null}
          busy={busyPortrait}
          onSelectPortrait={onSelectGalleryPortrait}
          onUploadPortraits={onUploadGalleryPortraits}
          onDeletePortrait={onDeleteGalleryPortrait}
        />

        {statusMsg && !isDirty && (
          <div className="bb-cs-status-pill" role="status">
            <Icon name="check" size={12} />
            <span>{statusMsg}</span>
          </div>
        )}

        <BookmarkRibbons
          variant="secondary"
          tabs={tabs}
          activeId={sheetTab}
          onChange={setSheetTab}
          className="bb-cs-tabs"
        />
      </div>

      <div className="bb-cs-body-wrap">
        <div
          className={`bb-cs-body bb-scrollbar--hidden ${isFillTab ? 'is-fill-mode' : ''}`}
          ref={bodyScrollRef}
        >
          {sheetTab === 'description' && (
            <DescriptionTab
              description={card.description || ''}
              spoilerBlur={Boolean(card.scenarioMeta?.spoilerBlur)}
              onChangeDescription={(val) => onChangeCardField?.({ description: val })}
              onToggleSpoilerBlur={onToggleSpoilerBlur}
            />
          )}

          {sheetTab === 'notes' && (
            <div className="bb-cs-fill-tab">
              <MarkdownEditor
                label="Creator's Notes"
                headerActions={
                  <span className="bb-caption-text">Not sent to AI prompt</span>
                }
                fillHeight
                value={card.creator_notes || ''}
                onChange={(val) => onChangeCardField?.({ creator_notes: val })}
                placeholder="Author commentary, recommended presets, lorebook triggers, or scenario usage notes (never sent to the AI prompt)..."
              />
            </div>
          )}

          {sheetTab === 'intros' && (
            <IntrosTab
              card={card}
              activeIntroIdx={activeIntroIdx}
              busyPortrait={busyPortrait}
              editingIntroTarget={editingIntroTarget}
              onOpenIntroEditor={onOpenIntroEditor}
              onChangeIntroIdx={onChangeIntroIdx}
              onChangeCardField={onChangeCardField}
              onPersistCardPatch={onPersistCardPatch}
              onUpdateScenarioMeta={linksProps?.onUpdateScenarioMeta}
              onUploadIntroPortrait={onUploadIntroPortrait}
              onStartChatWithIntro={(introPayload) => onStartNewChat?.(introPayload)}
            />
          )}

          {sheetTab === 'links' && (
            <LinksBindingsTab card={card} {...linksProps} />
          )}
        </div>
        {!isFillTab && (
          <ScrollIndicator scrollRef={bodyScrollRef} className="bb-scroll-indicator--panel" />
        )}
      </div>

      {(isDirty || saving) && (
        <div className="bb-cs-dirty-bar" role="region" aria-label="Unsaved changes">
          <div className="bb-cs-dirty-bar__info">
            <span className="bb-cs-dirty-bar__dot" aria-hidden="true" />
            <span>{saving ? 'Saving...' : 'Unsaved changes'}</span>
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
