import React, { useMemo } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { SafeImage } from '../../atoms/SafeImage/SafeImage.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { Dropdown } from '../Dropdown/Dropdown.jsx';
import './ScenarioBindingBar.css';

function toInitials(name, fallback = 'SC') {
  const clean = String(name || '').trim();
  if (!clean) return fallback;
  return clean.slice(0, 2).toUpperCase();
}

/**
 * ScenarioLinkActionButton — M3 circular row-tail binding button (modeled after `PersonaPicker`).
 */
export function ScenarioLinkActionButton({
  targetLabel = 'preset',
  linkedScenarios = [],
  activeScenario = null,
  activeScenarioBoundOther = '',
  onToggleActiveScenario,
  disabled = false,
  className = '',
}) {
  const activeAvatar = activeScenario?.avatar || activeScenario?.id || '';
  const hasRealActive = Boolean(activeAvatar);
  const isLinkedToActive = Boolean(
    hasRealActive &&
      linkedScenarios.some((s) => (s.avatar || s.id) === activeAvatar),
  );

  const leadItem = useMemo(() => {
    if (isLinkedToActive && activeScenario) {
      return {
        name: activeScenario.name || 'Scenario',
        avatarUrl: activeScenario.thumbnailUrl || activeScenario.avatarUrl || null,
        initials: activeScenario.initials || toInitials(activeScenario.name),
      };
    }
    const first = linkedScenarios[0];
    if (!first) return null;
    return {
      name: first.name || first.avatar || 'Scenario',
      avatarUrl: first.thumbnailUrl || first.avatarUrl || null,
      initials: first.initials || toInitials(first.name || first.avatar),
    };
  }, [isLinkedToActive, activeScenario, linkedScenarios]);

  const extraCount = Math.max(0, linkedScenarios.length - 1);

  if (!hasRealActive && !leadItem) {
    return null;
  }

  const activeName = activeScenario?.name || 'current scenario';
  let tooltip = '';
  if (!hasRealActive && leadItem) {
    tooltip = `Bound to ${leadItem.name}${extraCount > 0 ? ` (+${extraCount} more)` : ''}`;
  } else if (isLinkedToActive) {
    tooltip = `Bound to ${activeName}${
      extraCount > 0 ? ` (+${extraCount} more)` : ''
    } — click to unbind`;
  } else if (leadItem) {
    tooltip = `Bound to ${leadItem.name}${
      extraCount > 0 ? ` (+${extraCount} more)` : ''
    } — click to also bind ${activeName}${
      activeScenarioBoundOther ? ` (replaces "${activeScenarioBoundOther}")` : ''
    }`;
  } else {
    tooltip = `Bind "${targetLabel}" to ${activeName}${
      activeScenarioBoundOther ? ` (replaces "${activeScenarioBoundOther}")` : ''
    }`;
  }

  const isInteractive = hasRealActive && Boolean(onToggleActiveScenario) && !disabled;

  return (
    <button
      type="button"
      disabled={!isInteractive}
      title={tooltip}
      aria-label={tooltip}
      className={`bb-scenario-link-btn ${
        leadItem ? 'has-linked-avatar' : 'is-empty-link'
      } ${isLinkedToActive ? 'is-linked-current' : ''} ${className}`.trim()}
      onClick={(e) => {
        e.stopPropagation();
        if (isInteractive) {
          onToggleActiveScenario(!isLinkedToActive);
        }
      }}
    >
      {leadItem ? (
        <span className="bb-scenario-link-btn__badge">
          <SafeImage
            src={leadItem.avatarUrl}
            alt=""
            draggable={false}
            className="bb-scenario-link-btn__img"
            fallback={
              <span className="bb-scenario-link-btn__initials">{leadItem.initials}</span>
            }
          />
          {extraCount > 0 && (
            <span className="bb-scenario-link-btn__more">+{extraCount}</span>
          )}
        </span>
      ) : (
        <Icon name="link" size={15} />
      )}
    </button>
  );
}

/**
 * ScenarioBindingBar — M3 tonal binding strip displaying scenarios bound to an entity (e.g. Preset),
 * with 1-click active scenario bind/unbind, bound scenario avatar chips, and scenario picker.
 */
export function ScenarioBindingBar({
  entityName = '',
  linkedScenarios = [],
  availableScenarios = [],
  activeScenario = null,
  activeScenarioBoundOther = '',
  onBindScenario,
  onUnbindScenario,
  onUnbindAll,
  onSelectScenario,
  disabled = false,
  className = '',
}) {
  const activeAvatar = activeScenario?.avatar || activeScenario?.id || '';
  const hasRealActive = Boolean(activeAvatar);
  const isActiveLinkedHere = Boolean(
    hasRealActive &&
      linkedScenarios.some((s) => (s.avatar || s.id) === activeAvatar),
  );

  const pickerOptions = useMemo(() => {
    const linkedSet = new Set(linkedScenarios.map((s) => s.avatar || s.id));
    return availableScenarios
      .filter((c) => {
        const av = c.avatar || c.id;
        return av && !linkedSet.has(av);
      })
      .map((c) => ({
        value: c.avatar || c.id,
        label: c.name || c.avatar || c.id,
        meta: c.boundPresetName ? `→ ${c.boundPresetName}` : '',
      }));
  }, [availableScenarios, linkedScenarios]);

  const activeName = activeScenario?.name || 'Current Scenario';
  const activeThumb = activeScenario?.thumbnailUrl || activeScenario?.avatarUrl || null;

  return (
    <div className={`bb-scenario-bind-bar ${className}`.trim()}>
      <div className="bb-scenario-bind-bar__head">
        <div className="bb-scenario-bind-bar__title-group">
          <Icon name="link" size={14} className="bb-scenario-bind-bar__icon" />
          <span className="bb-scenario-bind-bar__title">Bound Scenarios</span>
          <span className="bb-scenario-bind-bar__count">
            {linkedScenarios.length}
          </span>
        </div>

        <div className="bb-scenario-bind-bar__actions">
          {hasRealActive && (
            <button
              type="button"
              disabled={disabled}
              className={`bb-scenario-bind-bar__quick-btn ${
                isActiveLinkedHere ? 'is-bound' : ''
              }`}
              title={
                isActiveLinkedHere
                  ? `Unbind "${entityName}" from ${activeName}`
                  : `Bind "${entityName}" to ${activeName}${
                      activeScenarioBoundOther
                        ? ` (replaces "${activeScenarioBoundOther}")`
                        : ''
                    }`
              }
              onClick={() => {
                if (isActiveLinkedHere) {
                  onUnbindScenario?.(activeAvatar);
                } else {
                  onBindScenario?.(activeAvatar);
                }
              }}
            >
              <span className="bb-scenario-bind-bar__quick-avatar">
                <SafeImage
                  src={activeThumb}
                  alt=""
                  draggable={false}
                  className="bb-scenario-bind-bar__quick-img"
                  fallback={
                    <span className="bb-scenario-bind-bar__quick-initials">
                      {toInitials(activeName)}
                    </span>
                  }
                />
              </span>
              <Icon name={isActiveLinkedHere ? 'unlink' : 'link'} size={12} />
              <span className="bb-scenario-bind-bar__quick-label">
                {isActiveLinkedHere ? 'Unbind Current' : `Bind ${activeName}`}
              </span>
            </button>
          )}
          {linkedScenarios.length > 1 && onUnbindAll && (
            <Button
              variant="b2"
              size="sm"
              icon="unlink"
              disabled={disabled}
              title={`Unbind all scenarios from "${entityName}"`}
              onClick={onUnbindAll}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {linkedScenarios.length > 0 ? (
        <div className="bb-scenario-bind-bar__chips" role="list">
          {linkedScenarios.map((sc) => {
            const av = sc.avatar || sc.id;
            const name = sc.name || av;
            const thumb = sc.thumbnailUrl || sc.avatarUrl || null;
            const isCurrent = Boolean(activeAvatar && av === activeAvatar);

            return (
              <div
                key={av}
                role="listitem"
                className={`bb-scenario-bind-chip ${isCurrent ? 'is-current' : ''}`}
              >
                <button
                  type="button"
                  className="bb-scenario-bind-chip__main"
                  title={
                    isCurrent
                      ? `${name} (currently open scenario)`
                      : `Switch to scenario "${name}"`
                  }
                  onClick={() => {
                    if (!isCurrent) onSelectScenario?.(av);
                  }}
                >
                  <span className="bb-scenario-bind-chip__avatar">
                    <SafeImage
                      src={thumb}
                      alt=""
                      draggable={false}
                      className="bb-scenario-bind-chip__img"
                      fallback={
                        <span className="bb-scenario-bind-chip__initials">
                          {sc.initials || toInitials(name)}
                        </span>
                      }
                    />
                  </span>
                  <span className="bb-scenario-bind-chip__name">{name}</span>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  className="bb-scenario-bind-chip__rm"
                  title={`Unbind "${name}" from "${entityName}"`}
                  aria-label={`Unbind ${name}`}
                  onClick={() => onUnbindScenario?.(av)}
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bb-scenario-bind-bar__empty">
          Not bound to any scenario yet — auto-loads when a bound scenario is opened.
        </div>
      )}

      {pickerOptions.length > 0 && (
        <Dropdown
          options={pickerOptions}
          value=""
          onChange={(selectedAvatar) => {
            if (selectedAvatar) onBindScenario?.(selectedAvatar);
          }}
          allowStars={false}
          disabled={disabled}
          placeholder="+ Bind another scenario..."
          searchPlaceholder="Search scenarios..."
          className="bb-scenario-bind-bar__picker"
        />
      )}
    </div>
  );
}
