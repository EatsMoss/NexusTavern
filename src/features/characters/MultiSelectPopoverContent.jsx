import React from 'react';
import { Icon, OverlayScrollArea } from '@ui/index.js';

/**
 * Renders the M3 sub-popover body (`folder` | `tags` | `export`) inside `CharacterTome`'s
 * `MultiSelectBar` when multi-select mode is active.
 */
export function MultiSelectPopoverContent({
  subpopover,
  selectedCount,
  userFolders,
  folderInput,
  onChangeFolderInput,
  onMoveToFolder,
  tagInput,
  onChangeTagInput,
  tags,
  selectedCharacterCards,
  onCreateAndAssignTag,
  onToggleTagOnSelected,
  onBulkExport,
  onClose,
}) {
  if (!subpopover || selectedCount === 0) {
    return null;
  }

  if (subpopover === 'folder') {
    return (
      <>
        <div className="bb-m3-ms-pop__header">
          <span className="bb-m3-ms-pop__title">
            <Icon name="folderPlus" size={14} />
            <span>Move to folder · {selectedCount} selected</span>
          </span>
          <button
            type="button"
            className="bb-m3-ms-pop__close"
            title="Close"
            onClick={onClose}
          >
            <Icon name="close" size={13} />
          </button>
        </div>

        <div className="bb-m3-ms-pop__input-row">
          <input
            type="text"
            className="bb-m3-ms-pop__input"
            value={folderInput}
            placeholder="New folder name..."
            maxLength={40}
            onChange={(e) => onChangeFolderInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onMoveToFolder(null, folderInput);
              }
            }}
          />
          <button
            type="button"
            className="bb-m3-ms-pop__btn"
            disabled={!folderInput.trim()}
            title={
              selectedCount < 2
                ? 'Select at least 2 cards to form a new folder (1 card will be pinned)'
                : 'Create new folder in Pinned with selected cards'
            }
            onClick={() => onMoveToFolder(null, folderInput)}
          >
            <Icon name="plus" size={13} />
            <span>Create</span>
          </button>
        </div>

        {userFolders.length > 0 ? (
          <OverlayScrollArea viewportClassName="bb-m3-ms-pop__chips" variant="compact">
            {userFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className="bb-m3-ms-pop__chip"
                title={`Move selected cards into "${folder.name}"`}
                onClick={() => onMoveToFolder(folder.id)}
              >
                <Icon name="folder" size={12} />
                <span>{folder.name}</span>
                <span className="bb-m3-ms-pop__chip-meta">
                  {(folder.items || []).length}
                </span>
              </button>
            ))}
          </OverlayScrollArea>
        ) : (
          <div className="bb-m3-ms-pop__empty">
            No existing folders in Pinned yet — enter a name above to create one.
          </div>
        )}
      </>
    );
  }

  if (subpopover === 'tags') {
    const charCount = selectedCharacterCards.length;
    const q = tagInput.trim().toLowerCase();
    const filteredTags = q
      ? tags.filter((t) => String(t.name || '').toLowerCase().includes(q))
      : tags;

    return (
      <>
        <div className="bb-m3-ms-pop__header">
          <span className="bb-m3-ms-pop__title">
            <Icon name="tags" size={14} />
            <span>Manage tags · {charCount} selected</span>
          </span>
          <button
            type="button"
            className="bb-m3-ms-pop__close"
            title="Close"
            onClick={onClose}
          >
            <Icon name="close" size={13} />
          </button>
        </div>

        {charCount === 0 ? (
          <div className="bb-m3-ms-pop__empty">
            Select at least one scenario card to manage tags.
          </div>
        ) : (
          <>
            <div className="bb-m3-ms-pop__input-row">
              <input
                type="text"
                className="bb-m3-ms-pop__input"
                value={tagInput}
                placeholder="Filter or create new tag..."
                maxLength={40}
                onChange={(e) => onChangeTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    e.preventDefault();
                    onCreateAndAssignTag(tagInput);
                  }
                }}
              />
              <button
                type="button"
                className="bb-m3-ms-pop__btn"
                disabled={!tagInput.trim()}
                onClick={() => onCreateAndAssignTag(tagInput)}
              >
                <Icon name="plus" size={13} />
                <span>Add</span>
              </button>
            </div>

            {filteredTags.length > 0 ? (
              <OverlayScrollArea viewportClassName="bb-m3-ms-pop__chips" variant="compact">
                {filteredTags.map((tag) => {
                  const tid = String(tag.id);
                  const assignedCount = selectedCharacterCards.filter((c) =>
                    (c.tagIds || c.tags || []).map(String).includes(tid),
                  ).length;
                  const state =
                    assignedCount === 0
                      ? 'none'
                      : assignedCount === charCount
                        ? 'all'
                        : 'partial';
                  return (
                    <button
                      key={tid}
                      type="button"
                      className={[
                        'bb-m3-ms-pop__chip',
                        state === 'all' ? 'is-all' : '',
                        state === 'partial' ? 'is-partial' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={
                        state === 'all'
                          ? `Assigned to all ${charCount} selected — click to remove from all`
                          : state === 'partial'
                            ? `Assigned to ${assignedCount} of ${charCount} selected — click to add to all`
                            : `Click to add "${tag.name}" to all ${charCount} selected`
                      }
                      onClick={() => onToggleTagOnSelected(tid)}
                    >
                      {state === 'all' ? (
                        <Icon name="check" size={12} />
                      ) : (
                        <Icon name="tags" size={11} />
                      )}
                      <span>{tag.name}</span>
                      {state === 'partial' && (
                        <span className="bb-m3-ms-pop__chip-meta">
                          {assignedCount}/{charCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </OverlayScrollArea>
            ) : (
              <div className="bb-m3-ms-pop__empty">
                No matching tags — press Add to create &ldquo;{tagInput.trim()}&rdquo;.
              </div>
            )}
          </>
        )}
      </>
    );
  }

  if (subpopover === 'export') {
    const charCount = selectedCharacterCards.length;
    return (
      <>
        <div className="bb-m3-ms-pop__header">
          <span className="bb-m3-ms-pop__title">
            <Icon name="download" size={14} />
            <span>Export ZIP archive · {charCount} selected</span>
          </span>
          <button
            type="button"
            className="bb-m3-ms-pop__close"
            title="Close"
            onClick={onClose}
          >
            <Icon name="close" size={13} />
          </button>
        </div>

        <div className="bb-m3-ms-pop__grid-2">
          <button
            type="button"
            className="bb-m3-ms-pop__tile-btn"
            disabled={charCount === 0}
            title="Download selected scenarios packed as a PNG .zip archive"
            onClick={() => onBulkExport('png')}
          >
            <Icon name="image" size={15} />
            <span>PNG Archive (.zip)</span>
          </button>
          <button
            type="button"
            className="bb-m3-ms-pop__tile-btn"
            disabled={charCount === 0}
            title="Download selected scenarios packed as a JSON .zip archive"
            onClick={() => onBulkExport('json')}
          >
            <Icon name="download" size={15} />
            <span>JSON Archive (.zip)</span>
          </button>
        </div>
      </>
    );
  }

  return null;
}
