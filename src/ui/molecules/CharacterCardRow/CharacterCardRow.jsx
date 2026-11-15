import React, { memo, useCallback } from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Checkbox } from '@ui/atoms/Checkbox/Checkbox.jsx';
import { SafeImage } from '@ui/atoms/SafeImage/SafeImage.jsx';
import { KebabMenu } from '@ui/molecules/KebabMenu/KebabMenu.jsx';
import './CharacterCardRow.css';

function cleanSnippetText(rawText, charName = 'Character', userName = 'User') {
  if (!rawText) return '';
  return String(rawText)
    .replace(/<(?:think|thinking|reasoning|thought)>[\s\S]*?<\/(?:think|thinking|reasoning|thought)>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{\s*char\s*\}\}/gi, charName || 'Character')
    .replace(/\{\{\s*user\s*\}\}/gi, userName || 'User')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveCharacterRowSnippet(item, { userName = 'User' } = {}) {
  if (!item) return { text: '', isIntro: false };
  const charName = item.name || 'Character';
  const chatsCount = Number(item.chatsCount ?? item.chatStats?.chatsCount ?? 0);

  if (chatsCount > 0 && item.latestChatPreview) {
    const text = cleanSnippetText(item.latestChatPreview, charName, userName);
    if (text) return { text, isIntro: false };
  }

  const introText = cleanSnippetText(
    item.firstMesPreview || item.first_mes || '',
    charName,
    userName,
  );
  if (introText) return { text: introText, isIntro: true };

  if (item.isGroup) {
    const membersCount = Number(item.memberCount ?? item.members?.length ?? 0);
    return {
      text: membersCount > 0 ? `Group scenario • ${membersCount} members` : 'Group scenario',
      isIntro: false,
    };
  }

  return {
    text: cleanSnippetText(item.descriptionPreview || '', charName, userName),
    isIntro: false,
  };
}

function CharacterCardRowInner({
  item,
  selected = false,
  showPinBadge = true,
  multiSelectActive = false,
  multiSelected = false,
  userName = 'User',
  onSelect,
  onOpen,
  onToggleMultiSelect,
  kebabItems = [],
  kebabItemsFor = null,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isDragging = false,
  className = '',
}) {
  const resolveLazyKebab = useCallback(
    () => (kebabItemsFor && item ? kebabItemsFor(item) : []),
    [kebabItemsFor, item],
  );

  if (!item) return null;

  const initials =
    item.initials || String(item.name || 'CH').trim().slice(0, 2).toUpperCase() || 'CH';
  const avatarSrc = item.thumbnailUrl || item.avatarUrl || null;
  const subtitle = String(item.subtitle || item.scenarioMeta?.subtitle || '').trim();
  const chatsCount = Math.max(0, Number(item.chatsCount ?? item.chatStats?.chatsCount ?? 0));
  const { text: snippetText, isIntro } = resolveCharacterRowSnippet(item, { userName });
  const hasKebab = typeof kebabItemsFor === 'function' || kebabItems.length > 0;

  const handleClick = (e) => {
    const isQuickMultiTrigger = e?.ctrlKey || e?.metaKey || e?.shiftKey;
    if (multiSelectActive || isQuickMultiTrigger) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      onToggleMultiSelect?.(item.id, e);
      return;
    }
    onSelect?.(item.id);
  };

  return (
    <div
      className={[
        'bb-char-row',
        selected ? 'is-selected' : '',
        multiSelectActive ? 'is-multi-select-mode' : '',
        multiSelected ? 'is-multi-selected' : '',
        isDragging ? 'is-dragging' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={handleClick}
      onDoubleClick={() => {
        if (multiSelectActive) return;
        onSelect?.(item.id);
        onOpen?.(item.id);
      }}
    >
      <div className="bb-char-row__portrait">
        <SafeImage
          src={avatarSrc}
          alt={item.name}
          loading="lazy"
          draggable={false}
          className="bb-char-row__img"
          fallback={<span className="bb-char-row__initials">{initials}</span>}
        />

        {showPinBadge && item.pinned && (
          <span className="bb-char-row__pin" title="Pinned">
            <Icon name="starFilled" size={10} />
          </span>
        )}
      </div>

      <div className="bb-char-row__body">
        <div className="bb-char-row__top">
          <div className="bb-char-row__identity">
            <span className="bb-char-row__name" title={item.name}>
              {item.name}
            </span>
            {subtitle && (
              <span className="bb-char-row__subtitle" title={subtitle}>
                {subtitle}
              </span>
            )}
            {!subtitle && item.isGroup && (
              <span className="bb-char-row__subtitle">Group</span>
            )}
          </div>

          <div className="bb-char-row__tail">
            <span
              className={`bb-char-row__chats-pill ${chatsCount === 0 ? 'is-zero' : ''}`}
              title={
                chatsCount === 0
                  ? 'No chats yet — showing greeting preview'
                  : `${chatsCount} ${chatsCount === 1 ? 'chat' : 'chats'}`
              }
            >
              <Icon name="comments" size={11} />
              <span>{chatsCount}</span>
            </span>

            {multiSelectActive ? (
              <Checkbox
                variant="overlay"
                checked={multiSelected}
                interactive={false}
                className="bb-char-row__check"
              />
            ) : (
              hasKebab && (
                <div
                  className="bb-char-row__actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <KebabMenu
                    size="sm"
                    align="right"
                    items={kebabItems}
                    getItems={typeof kebabItemsFor === 'function' ? resolveLazyKebab : null}
                  />
                </div>
              )
            )}
          </div>
        </div>

        <div className="bb-char-row__snippet">
          {snippetText ? (
            <>
              {isIntro && <span className="bb-char-row__intro-tag">Intro:</span>}
              <span>{snippetText}</span>
            </>
          ) : (
            <span className="bb-char-row__snippet-empty">No greeting or chat history yet.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function areRowItemsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.initials === b.initials &&
    a.thumbnailUrl === b.thumbnailUrl &&
    a.avatarUrl === b.avatarUrl &&
    Boolean(a.pinned) === Boolean(b.pinned) &&
    Boolean(a.isGroup) === Boolean(b.isGroup) &&
    (a.subtitle || a.scenarioMeta?.subtitle || '') ===
      (b.subtitle || b.scenarioMeta?.subtitle || '') &&
    (a.chatsCount ?? a.chatStats?.chatsCount ?? 0) ===
      (b.chatsCount ?? b.chatStats?.chatsCount ?? 0) &&
    a.latestChatPreview === b.latestChatPreview &&
    a.firstMesPreview === b.firstMesPreview &&
    a.first_mes === b.first_mes &&
    a.descriptionPreview === b.descriptionPreview &&
    (a.memberCount ?? a.members?.length ?? 0) ===
      (b.memberCount ?? b.members?.length ?? 0)
  );
}

function areCardRowPropsEqual(prev, next) {
  return (
    areRowItemsEqual(prev.item, next.item) &&
    prev.selected === next.selected &&
    prev.showPinBadge === next.showPinBadge &&
    prev.multiSelectActive === next.multiSelectActive &&
    prev.multiSelected === next.multiSelected &&
    prev.userName === next.userName &&
    prev.draggable === next.draggable &&
    prev.isDragging === next.isDragging &&
    prev.className === next.className &&
    prev.onSelect === next.onSelect &&
    prev.onOpen === next.onOpen &&
    prev.onToggleMultiSelect === next.onToggleMultiSelect &&
    prev.kebabItemsFor === next.kebabItemsFor &&
    (prev.kebabItemsFor ? true : prev.kebabItems === next.kebabItems) &&
    prev.onDragStart === next.onDragStart &&
    prev.onDragEnd === next.onDragEnd &&
    prev.onDragOver === next.onDragOver &&
    prev.onDrop === next.onDrop
  );
}

export const CharacterCardRow = memo(CharacterCardRowInner, areCardRowPropsEqual);
