import React from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { OverlayScrollArea } from '../../atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import './MultiSelectBar.css';

/**
 * NexusTavern M3 Contextual Multi-Select Floating Action Bar (`MultiSelectBar`).
 *
 * Reusable across Scenarios, Personas, and Backgrounds galleries.
 * Floats at the bottom of a tome/container with Material You elevation-3 surface
 * styling, a status & quick-selection header row, an optional floating popover
 * slot right above the bar, and an icon+label action dock row.
 */
export function MultiSelectBar({
  open = false,
  count = 0,
  totalSelectable = 0,
  allSelected = false,
  onSelectAll,
  onClear,
  onClose,
  actions = [],
  activeActionId = null,
  popover = null,
  className = '',
}) {
  if (!open) return null;

  return (
    <div
      className={`bb-m3-multiselect-bar ${className}`.trim()}
      role="region"
      aria-label="Multi-select actions"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {popover && (
        <OverlayScrollArea
          className="bb-m3-multiselect-bar__popover-wrap"
          viewportClassName="bb-m3-multiselect-bar__popover"
          variant="compact"
          data-bb-pop=""
        >
          {popover}
        </OverlayScrollArea>
      )}

      <div className="bb-m3-multiselect-bar__surface">
        {/* Top Row: Selection Counter + Quick Selection Pills */}
        <div className="bb-m3-multiselect-bar__header">
          <div className="bb-m3-multiselect-bar__status">
            <span className="bb-m3-multiselect-bar__badge">{count}</span>
            <span className="bb-m3-multiselect-bar__label">Selected</span>
          </div>

          <div className="bb-m3-multiselect-bar__quick">
            {onSelectAll && (
              <button
                type="button"
                className={`bb-m3-multiselect-bar__pill ${allSelected && count > 0 ? 'is-active' : ''}`.trim()}
                title={
                  allSelected
                    ? 'Deselect all cards in the current view'
                    : `Select all cards in the current view (${totalSelectable})`
                }
                onClick={onSelectAll}
              >
                All results
              </button>
            )}
            {onClear && (
              <button
                type="button"
                className="bb-m3-multiselect-bar__pill"
                disabled={count === 0}
                title="Deselect all cards"
                onClick={onClear}
              >
                Clear
              </button>
            )}
            {onClose && (
              <button
                type="button"
                className="bb-m3-multiselect-bar__pill bb-m3-multiselect-bar__pill--done"
                title="Exit selection mode (Esc)"
                onClick={onClose}
              >
                Done
              </button>
            )}
          </div>
        </div>

        {/* Bottom Row: Batch Action Buttons */}
        {actions.length > 0 && (
          <div
            className="bb-m3-multiselect-bar__actions"
            style={{
              gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))`,
            }}
          >
            {actions.map((act) => {
              const isDisabled = Boolean(act.disabled) || count === 0;
              const isActive = activeActionId === act.id;
              return (
                <button
                  key={act.id}
                  type="button"
                  disabled={isDisabled}
                  title={act.title || act.label}
                  className={[
                    'bb-m3-multiselect-bar__action',
                    act.danger ? 'is-danger' : '',
                    isActive ? 'is-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => act.onClick?.()}
                >
                  {act.icon && <Icon name={act.icon} size={15} />}
                  <span className="bb-m3-multiselect-bar__action-label">{act.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
