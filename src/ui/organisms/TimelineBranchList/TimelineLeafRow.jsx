import React, { memo, useMemo, useCallback } from 'react';
import { cleanChatPreview, formatShortChatDate } from '@core/chats/timelineForest.js';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Checkbox } from '../../atoms/Checkbox/Checkbox.jsx';
import { AvatarStack } from '../../molecules/AvatarStack/AvatarStack.jsx';
import { KebabMenu } from '../../molecules/KebabMenu/KebabMenu.jsx';

function TimelineLeafRowInner({
  branch,
  totalChatsInGroup = 1,
  isActive = false,
  isFocusedOnTree = false,
  multiSelectActive = false,
  isSelected = false,
  timelinesOpen = false,
  characterName = 'Character',
  characterAvatarUrl = null,
  characterInitials = 'CH',
  personaName = 'User',
  personaAvatarUrl = null,
  onPrimaryClick,
  onRowDoubleClick,
  onRowEnterKey,
  onBranchChat,
  onStartSelectBranch,
  onRequestDeleteBranch,
}) {
  const dateLabel = useMemo(() => formatShortChatDate(branch), [branch]);
  const preview = useMemo(() => cleanChatPreview(branch.lastPreview), [branch.lastPreview]);

  const cardScenarioAvatar = branch.characterAvatarUrl || characterAvatarUrl;
  const cardPersonaAvatar = branch.personaAvatarMissing
    ? null
    : branch.personaAvatarUrl || personaAvatarUrl;
  const cardPersonaName = branch.personaName || personaName || 'User';
  const cardPersonaInitials = String(cardPersonaName).slice(0, 2).toUpperCase();

  const avatarItems = useMemo(
    () => [
      {
        id: `char-${branch.fileName}`,
        name: characterName || 'Scenario',
        avatarUrl: cardScenarioAvatar,
        initials: characterInitials || 'CH',
        title: `Scenario: ${characterName}`,
      },
      {
        id: `persona-${branch.fileName}`,
        name: cardPersonaName,
        avatarUrl: cardPersonaAvatar,
        initials: cardPersonaInitials,
        title: `Persona: ${cardPersonaName}`,
      },
    ],
    [
      branch.fileName,
      characterName,
      cardScenarioAvatar,
      characterInitials,
      cardPersonaName,
      cardPersonaAvatar,
      cardPersonaInitials,
    ],
  );

  const displayBranchTitle = !branch.isLeaf
    ? `${branch.branchLabel || 'Root'} (Current Fork)`
    : branch.branchLabel
      ? branch.branchLabel
      : totalChatsInGroup === 1
        ? 'Main Storyline'
        : 'Main Line (Root)';

  const getRowKebabItems = useCallback(
    () => [
      {
        id: 'branch',
        label: 'Create Branch',
        icon: 'codeBranch',
        onClick: () => onBranchChat?.(branch.fileName),
      },
      {
        id: 'select',
        label: 'Select',
        icon: 'check',
        onClick: () => onStartSelectBranch?.(branch.fileName),
      },
      {
        id: 'delete',
        label: 'Delete Branch',
        icon: 'trash',
        danger: true,
        onClick: () => onRequestDeleteBranch?.(branch.fileName),
      },
    ],
    [branch.fileName, onBranchChat, onStartSelectBranch, onRequestDeleteBranch],
  );

  const handleClick = useCallback(
    (e) => {
      if (e.target.closest('.bb-tl-leaf-item__actions, .bb-kebab-menu')) {
        return;
      }
      onPrimaryClick?.(branch.fileName, e);
    },
    [branch.fileName, onPrimaryClick],
  );

  const handleDoubleClick = useCallback(
    (e) => {
      if (e.target.closest('.bb-tl-leaf-item__actions, .bb-kebab-menu')) {
        return;
      }
      onRowDoubleClick?.(branch.fileName, e);
    },
    [branch.fileName, onRowDoubleClick],
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onRowEnterKey?.(branch.fileName);
      } else if (e.key === ' ') {
        e.preventDefault();
        onPrimaryClick?.(branch.fileName, e);
      }
    },
    [branch.fileName, onRowEnterKey, onPrimaryClick],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        'bb-tl-leaf-item',
        isActive ? 'is-active' : '',
        isFocusedOnTree ? 'is-focused-on-tree' : '',
        isSelected ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={
        timelinesOpen
          ? `${branch.fileName}\nClick: Focus on tree • Double-click: Open chat`
          : branch.fileName
      }
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    >
      <AvatarStack
        size={32}
        overlap={0.35}
        cutoutGapPx={1.75}
        className="bb-tl-leaf-item__avatar-stack"
        items={avatarItems}
      />

      <div className="bb-tl-leaf-item__body">
        <div className="bb-tl-leaf-item__top">
          <div className="bb-tl-leaf-item__name-row">
            <Icon name={branch.depth > 0 ? 'codeBranch' : 'comments'} size={12} />
            <span className="bb-tl-leaf-item__name">{displayBranchTitle}</span>
          </div>

          {multiSelectActive ? (
            <Checkbox variant="overlay" checked={isSelected} interactive={false} />
          ) : (
            <div className="bb-tl-leaf-item__actions">
              <KebabMenu size="sm" title="Branch actions" getItems={getRowKebabItems} />
            </div>
          )}
        </div>

        <div className="bb-tl-leaf-item__badges">
          {!branch.isLeaf && (
            <span className="bb-tl-leaf-item__pill bb-tl-leaf-item__pill--fork">
              Fork Node
            </span>
          )}
          {branch.depth > 1 && (
            <span
              className="bb-tl-leaf-item__pill bb-tl-leaf-item__pill--depth"
              title={`Fork depth ${branch.depth} from timeline root`}
            >
              Step {branch.depth + 1}
            </span>
          )}
          {isActive && (
            <span className="bb-tl-leaf-item__pill bb-tl-leaf-item__pill--active">
              Active
            </span>
          )}
          {branch.messageCount != null && (
            <span className="bb-tl-leaf-item__meta">{branch.messageCount} msgs</span>
          )}
          <span className="bb-tl-leaf-item__meta">{dateLabel}</span>
        </div>

        {preview && <div className="bb-tl-leaf-item__preview">{preview}</div>}
      </div>
    </div>
  );
}

export const TimelineLeafRow = memo(TimelineLeafRowInner);
