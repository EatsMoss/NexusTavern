import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import './TagChip.css';

/**
 * Filter states a tag chip can carry, mirroring the SillyTavern + BookboundUI
 * search-tag semantics: include-with-OR, require-with-AND, exclude-with-NOT.
 */
export const TAG_FILTER_STATES = ['or', 'and', 'not'];

const STATE_PREFIX = { or: '+', and: '', not: '\u2212' };
const STATE_TITLE = {
  or: 'Include: any of the selected tags (OR). Click to switch to AND.',
  and: 'Require: cards must carry every AND tag. Click to switch to NOT.',
  not: 'Exclude: cards carrying this tag are hidden. Click to switch to OR.',
};

/**
 * M3 tag chip for the character gallery filter row.
 *
 * The filter state is signalled by a colour bar on the leading edge plus a
 * textual prefix rather than a filled background, so the chip stays readable in
 * both themes and never turns the filter row into a traffic light.
 */
export function TagChip({
  label,
  state = 'or',
  count,
  onCycle,
  onRemove,
  title,
  className = '',
}) {
  const safeState = TAG_FILTER_STATES.includes(state) ? state : 'or';

  return (
    <span className={`bb-tag-chip bb-tag-chip--${safeState} ${className}`.trim()}>
      <button
        type="button"
        className="bb-tag-chip__body"
        title={title || STATE_TITLE[safeState]}
        onClick={() => onCycle?.(safeState)}
      >
        <span className="bb-tag-chip__bar" aria-hidden="true" />
        <span className="bb-tag-chip__prefix" aria-hidden="true">
          {STATE_PREFIX[safeState]}
        </span>
        <span className="bb-tag-chip__label">{label}</span>
        {count !== undefined && count !== null && (
          <span className="bb-tag-chip__count">{count}</span>
        )}
      </button>

      {onRemove && (
        <button
          type="button"
          className="bb-tag-chip__remove"
          aria-label={`Remove ${label} filter`}
          title="Remove filter"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  );
}
