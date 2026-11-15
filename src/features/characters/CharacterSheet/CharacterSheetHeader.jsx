import React, { useMemo, useRef, useState } from 'react';
import {
  Button,
  Icon,
  InlineEditableTitle,
  KebabMenu,
  ProgressIndicator,
  SafeImage,
} from '@ui/index.js';

function approxTokens(text) {
  const s = String(text || '');
  return s ? Math.ceil(s.length / 3.8) : 0;
}

export function computeCardTokenStats(card) {
  if (!card) return { permanent: 0, total: 0, hasAdvanced: false };

  const depthPromptText = card.extensions?.depth_prompt?.prompt || '';
  const permanentText = [
    card.name,
    card.description,
    card.personality,
    card.scenario,
    card.system_prompt,
    card.post_history_instructions,
    depthPromptText,
  ]
    .filter(Boolean)
    .join('\n');

  const transientText = [card.first_mes, card.mes_example]
    .filter(Boolean)
    .join('\n');

  const permanent = approxTokens(permanentText);
  const total = permanent + approxTokens(transientText);

  const hasAdvanced = Boolean(
    String(card.personality || '').trim() ||
      String(card.scenario || '').trim() ||
      String(card.mes_example || '').trim() ||
      String(card.system_prompt || '').trim() ||
      String(card.post_history_instructions || '').trim() ||
      String(depthPromptText || '').trim(),
  );

  return { permanent, total, hasAdvanced };
}

export function CharacterSheetHeader({
  card,
  isExpanded = false,
  busyPortrait = false,
  onChangeName,
  onChangeSubtitle,
  onTogglePin,
  onOpenAdvanced,
  onToggleExpand,
  onStartNewChat,
  onPickMainPortraitFile,
  onPickReplaceCardFile,
  onExportCard,
  onDuplicateCard,
  onConvertToPersona,
  onRefreshChatPortraits,
  onDeleteCard,
}) {
  const portraitInputRef = useRef(null);
  const replaceCardInputRef = useRef(null);
  const [dragOverPortrait, setDragOverPortrait] = useState(false);

  const tokenStats = useMemo(() => computeCardTokenStats(card), [card]);
  const isPinned = Boolean(card?.fav || card?.pinned);
  const isHighPermanent = tokenStats.permanent >= 2000;
  const specBadge = card?.spec === 'chara_card_v3' || card?.hasCcv3Chunk ? 'CCv3' : 'V2';
  const chatsCount = card?.chatStats?.chatsCount ?? card?.chatsCount ?? 0;
  const portraitSrc = card?.avatarUrl || card?.thumbnailUrl || null;

  const exportMenuItems = useMemo(
    () => [
      {
        id: 'export-png',
        label: 'Export PNG Card',
        icon: 'image',
        disabled: String(card?.avatar || '').toLowerCase().endsWith('.json'),
        onClick: () => onExportCard?.('png'),
      },
      {
        id: 'export-json',
        label: 'Export JSON Metadata',
        icon: 'download',
        onClick: () => onExportCard?.('json'),
      },
    ],
    [card?.avatar, onExportCard],
  );

  const moreMenuItems = useMemo(
    () => [
      {
        id: 'replace-file',
        label: 'Replace / Update from File...',
        icon: 'upload',
        onClick: () => replaceCardInputRef.current?.click(),
      },
      {
        id: 'duplicate',
        label: 'Duplicate Scenario',
        icon: 'copy',
        onClick: () => onDuplicateCard?.(),
      },
      {
        id: 'convert-persona',
        label: 'Convert to User Persona',
        icon: 'userPlus',
        onClick: () => onConvertToPersona?.(),
      },
      {
        id: 'refresh-portraits',
        label: 'Refresh Chat Portraits',
        icon: 'refresh',
        onClick: () => onRefreshChatPortraits?.(),
      },
      {
        id: 'delete',
        label: 'Delete Scenario...',
        icon: 'trash',
        danger: true,
        onClick: () => onDeleteCard?.(),
      },
    ],
    [onDuplicateCard, onConvertToPersona, onRefreshChatPortraits, onDeleteCard],
  );

  const handleDropOnPortrait = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPortrait(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) onPickMainPortraitFile?.(file);
  };

  return (
    <header className="bb-cs-header">
      <input
        ref={portraitInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onPickMainPortraitFile?.(f);
        }}
      />
      <input
        ref={replaceCardInputRef}
        type="file"
        accept=".png,.json,image/png,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onPickReplaceCardFile?.(f);
        }}
      />

      <button
        type="button"
        className={`bb-cs-portrait ${dragOverPortrait ? 'is-drag-over' : ''} ${busyPortrait ? 'is-busy' : ''}`.trim()}
        title="Click or drop image to replace main portrait (original is backed up automatically)"
        onClick={() => portraitInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!dragOverPortrait) setDragOverPortrait(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOverPortrait(false);
        }}
        onDrop={handleDropOnPortrait}
      >
        <SafeImage
          src={portraitSrc}
          alt={card?.name || 'Portrait'}
          className="bb-cs-portrait__img"
          draggable={false}
          fallback={
            <div className="bb-cs-portrait__fallback">
              <span>{card?.initials || 'CH'}</span>
            </div>
          }
        />
        <span className="bb-cs-portrait__overlay" aria-hidden="true">
          {busyPortrait ? (
            <ProgressIndicator variant="circular" size="xs" tone="on-surface" />
          ) : (
            <Icon name="image" size={16} />
          )}
          <span>{busyPortrait ? 'Saving...' : 'Portrait'}</span>
        </span>
      </button>

      <div className="bb-cs-controls">
        <div className="bb-cs-controls__top">
          <InlineEditableTitle
            value={card?.name || ''}
            onChange={onChangeName}
            placeholder="Unnamed Scenario"
            size="lg"
            editTooltip="Click to rename scenario"
            trailing={
              onToggleExpand ? (
                <Button
                  variant="b2"
                  size="sm"
                  icon={isExpanded ? 'collapse' : 'expand'}
                  active={isExpanded}
                  title={isExpanded ? 'Collapse sheet back to chat' : 'Expand sheet into full chat width'}
                  onClick={onToggleExpand}
                />
              ) : null
            }
          />

          <InlineEditableTitle
            value={card?.scenarioMeta?.subtitle ?? card?.subtitle ?? ''}
            onChange={onChangeSubtitle}
            placeholder="+ Add subtitle..."
            size="sm"
            variant="badge"
            maxLength={80}
            allowEmpty
            clearable
            editTooltip="Click to set scenario subtitle / tag (UI only, not sent to prompt)"
            className="bb-cs-subtitle"
          />

          <div className="bb-cs-telemetry">
            <span className="bb-cs-telemetry__item" title="Total card tokens">
              Total <strong>{tokenStats.total.toLocaleString()}</strong>
            </span>
            <span className="bb-cs-telemetry__dot">·</span>
            <span
              className={`bb-cs-telemetry__item ${isHighPermanent ? 'is-warning' : ''}`}
              title={isHighPermanent ? 'High permanent token count (>2,000 tok)' : 'Permanent prompt tokens'}
            >
              {isHighPermanent && <Icon name="warning" size={12} />}
              Perm <strong>{tokenStats.permanent.toLocaleString()}</strong>
            </span>
            <span className="bb-cs-badge">{specBadge}</span>
            <span className="bb-cs-badge bb-cs-badge--subtle">
              {chatsCount} {chatsCount === 1 ? 'chat' : 'chats'}
            </span>
          </div>
        </div>

        <div className="bb-cs-toolbar">
          <div className="bb-cs-toolbar__left">
            <Button
              variant="b2"
              size="sm"
              icon={isPinned ? 'starFilled' : 'star'}
              active={isPinned}
              className={isPinned ? 'bb-cs-pin-btn--active' : ''}
              title={isPinned ? 'Pinned in Favorites (click to unpin)' : 'Pin scenario to Favorites'}
              onClick={onTogglePin}
            />
            <button
              type="button"
              className={`bb-cs-adv-btn ${tokenStats.hasAdvanced ? 'has-content' : ''} ${isExpanded ? 'is-active' : ''}`.trim()}
              title={
                isExpanded
                  ? 'Focus Advanced Definitions in Right Tome'
                  : 'Expand Scenario & open Advanced Definitions in Right Tome'
              }
              onClick={onOpenAdvanced}
            >
              <Icon name="sliders" size={14} />
              <span>Advanced</span>
              {tokenStats.hasAdvanced && <span className="bb-cs-adv-btn__dot" aria-hidden="true" />}
            </button>
          </div>

          <div className="bb-cs-toolbar__right">
            <Button variant="b2" size="sm" icon="chatPlus" title="Start New Chat" onClick={onStartNewChat} />
            <KebabMenu icon="download" size="sm" align="right" title="Export card" items={exportMenuItems} />
            <KebabMenu icon="moreVert" size="sm" align="right" title="More scenario actions" items={moreMenuItems} />
          </div>
        </div>
      </div>
    </header>
  );
}
