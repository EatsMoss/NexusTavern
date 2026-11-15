import React, { useState, useMemo } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { OverlayScrollArea } from '../../atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import { KebabMenu } from '../../molecules/KebabMenu/KebabMenu.jsx';
import { ConnectionModelPicker } from '../../molecules/ConnectionModelPicker/ConnectionModelPicker.jsx';
import {
  DEFAULT_BANNED_PHRASES,
  DEFAULT_REFUSAL_DELAY_MS,
  normalizeForRefusalMatch,
} from '@core/refusal/refusalEngine.js';
import './RefusalCatcherManager.css';

export function RefusalCatcherManager({
  enabled = true,
  delayMs = DEFAULT_REFUSAL_DELAY_MS,
  bannedPhrases = DEFAULT_BANNED_PHRASES,
  onToggleEnabled,
  onAddPhrase,
  onRemovePhrase,
  onReplacePhrases,
  fallbackEnabled = false,
  fallbackConnectionId = '',
  fallbackModelId = '',
  onToggleFallbackEnabled,
  onSelectFallbackTarget,
  connections = [],
  customFamilies = [],
  onUpdateConnection,
  onFetchConnectionModels,
  onDeleteConnection,
  onRevealConnectionKey,
  onPingConnections,
  onFetchTelemetry,
  onAddCustomFamily,
  onDeleteCustomFamily,
  onOpenAddConnection,
  collapsible = false,
  defaultOpen = true,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [draftPhrase, setDraftPhrase] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  const safePhrases = Array.isArray(bannedPhrases) ? bannedPhrases : [];
  const trimmedDraft = draftPhrase.replace(/\s+/g, ' ').trim();

  const isDuplicateDraft = useMemo(() => {
    if (!trimmedDraft) return false;
    const draftKey = normalizeForRefusalMatch(trimmedDraft);
    return safePhrases.some((item) => normalizeForRefusalMatch(item) === draftKey);
  }, [trimmedDraft, safePhrases]);

  const filteredPhrases = useMemo(() => {
    const q = normalizeForRefusalMatch(filterQuery);
    if (!q) return safePhrases;
    return safePhrases.filter((phrase) =>
      normalizeForRefusalMatch(phrase).includes(q),
    );
  }, [safePhrases, filterQuery]);

  const resolvedFallbackConn = useMemo(() => {
    if (!Array.isArray(connections) || connections.length === 0) return null;
    return (
      connections.find((c) => c.id === fallbackConnectionId) ||
      connections[0] ||
      null
    );
  }, [connections, fallbackConnectionId]);

  const resolvedFallbackModel = useMemo(() => {
    if (!resolvedFallbackConn) return null;
    const models = Array.isArray(resolvedFallbackConn.models)
      ? resolvedFallbackConn.models
      : [];
    if (fallbackModelId) {
      const exact = models.find((m) => m.id === fallbackModelId);
      if (exact) return exact;
      return { id: fallbackModelId, name: fallbackModelId };
    }
    return models[0] || null;
  }, [resolvedFallbackConn, fallbackModelId]);

  const handleSubmitAdd = (e) => {
    if (e) e.preventDefault();
    if (!trimmedDraft || isDuplicateDraft) return;
    onAddPhrase?.(trimmedDraft);
    setDraftPhrase('');
    if (collapsible && !isOpen) setIsOpen(true);
  };

  const handleHeaderToggle = () => {
    if (!collapsible) return;
    setIsOpen((prev) => !prev);
  };

  const delaySecondsLabel = (Math.max(0, Number(delayMs) || 0) / 1000)
    .toFixed(1)
    .replace(/\.0$/, '');

  const menuItems = [
    {
      label: 'Restore Defaults',
      icon: 'refresh',
      onClick: () => {
        onReplacePhrases?.([...DEFAULT_BANNED_PHRASES]);
        if (collapsible && !isOpen) setIsOpen(true);
      },
    },
    ...(safePhrases.length > 0
      ? [
          {
            label: 'Clear All Phrases',
            icon: 'trash',
            danger: true,
            onClick: () => onReplacePhrases?.([]),
          },
        ]
      : []),
  ];

  const showBody = !collapsible || isOpen;

  return (
    <section
      className={[
        'bb-rc-sheet',
        collapsible ? 'bb-rc-sheet--collapsible' : '',
        !showBody ? 'is-collapsed' : '',
        !enabled ? 'is-disabled' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="bb-rc-sheet__header" onClick={handleHeaderToggle}>
        <div className="bb-rc-sheet__title-group">
          <Icon name="shieldAlert" size={17} className="bb-rc-sheet__title-icon" />
          <span>Refusal Catcher</span>
          <span
            className="bb-rc-sheet__count"
            title={`${safePhrases.length} banned refusal phrases`}
          >
            {safePhrases.length}
          </span>
        </div>

        <div
          className="bb-rc-sheet__header-actions"
          onClick={(e) => e.stopPropagation()}
        >
          <Switch
            size="sm"
            checked={enabled}
            onChange={(val) => onToggleEnabled?.(val)}
            title={enabled ? 'Refusal Catcher enabled' : 'Refusal Catcher paused'}
          />
          <KebabMenu items={menuItems} size="sm" title="Refusal Catcher options" />
          {collapsible && (
            <button
              type="button"
              className={`bb-rc-sheet__chevron ${showBody ? 'is-open' : ''}`.trim()}
              aria-label={showBody ? 'Collapse Refusal Catcher' : 'Expand Refusal Catcher'}
              title={showBody ? 'Collapse' : 'Expand'}
              onClick={handleHeaderToggle}
            >
              <Icon name="chevronDown" size={17} />
            </button>
          )}
        </div>
      </div>

      {showBody && (
        <div className="bb-rc-sheet__body">
          <div className="bb-rc-status-bar">
            <Icon name="history" size={14} className="bb-rc-status-bar__icon" />
            <span>
              {delaySecondsLabel}s stream hold · Skips &ldquo; &lsquo; * RP starts
            </span>
          </div>

          <div
            className={`bb-rc-fallback-box ${
              fallbackEnabled ? 'is-active' : ''
            }`.trim()}
          >
            <div className="bb-rc-fallback-head">
              <div className="bb-rc-fallback-meta">
                <span className="bb-rc-fallback-title">
                  <Icon
                    name="refresh"
                    size={14}
                    className="bb-rc-fallback-title-icon"
                  />
                  <span>Auto-Switch Model</span>
                </span>
                <span className="bb-rc-fallback-sub">
                  Retry once with backup model on refusal
                </span>
              </div>
              <Switch
                size="sm"
                checked={fallbackEnabled}
                onChange={(val) => onToggleFallbackEnabled?.(val)}
                title={
                  fallbackEnabled
                    ? 'Auto-retry with backup model enabled'
                    : 'Enable auto-retry with backup model'
                }
              />
            </div>

            {fallbackEnabled && (
              <div className="bb-rc-fallback-picker">
                <ConnectionModelPicker
                  fullWidth
                  showConnectionName
                  placement="bottom"
                  connections={connections}
                  customFamilies={customFamilies}
                  activeConnectionId={resolvedFallbackConn?.id || ''}
                  activeModelId={resolvedFallbackModel?.id || ''}
                  activeModelName={
                    resolvedFallbackModel?.name ||
                    resolvedFallbackModel?.id ||
                    'Select Backup Model'
                  }
                  onSelectConnection={(connId, modId) =>
                    onSelectFallbackTarget?.(connId, modId)
                  }
                  onUpdateConnection={onUpdateConnection}
                  onFetchConnectionModels={onFetchConnectionModels}
                  onDeleteConnection={onDeleteConnection}
                  onRevealConnectionKey={onRevealConnectionKey}
                  onPingConnections={onPingConnections}
                  onFetchTelemetry={onFetchTelemetry}
                  onAddCustomFamily={onAddCustomFamily}
                  onDeleteCustomFamily={onDeleteCustomFamily}
                  onOpenAddConnection={onOpenAddConnection}
                />
              </div>
            )}
          </div>

          <form className="bb-rc-add-row" onSubmit={handleSubmitAdd}>
            <div className="bb-rc-pill-input-wrap">
              <input
                type="text"
                className="bb-rc-pill-input"
                value={draftPhrase}
                onChange={(e) => setDraftPhrase(e.target.value)}
                placeholder="Add banned word or phrase..."
                aria-label="Add banned word or phrase"
              />
            </div>
            <button
              type="submit"
              className="bb-rc-add-btn"
              disabled={!trimmedDraft || isDuplicateDraft}
              title={
                isDuplicateDraft
                  ? 'Phrase is already in the banned list'
                  : 'Add banned phrase'
              }
            >
              <Icon name="plus" size={15} />
              <span>Add</span>
            </button>
          </form>

          {(safePhrases.length >= 6 || Boolean(filterQuery)) && (
            <div className="bb-rc-pill-input-wrap">
              <Icon name="search" size={15} className="bb-rc-pill-input-icon" />
              <input
                type="text"
                className="bb-rc-pill-input bb-rc-pill-input--with-icon"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Search banned list..."
                aria-label="Search banned list"
              />
              {filterQuery && (
                <button
                  type="button"
                  className="bb-rc-pill-clear"
                  aria-label="Clear search"
                  onClick={() => setFilterQuery('')}
                >
                  <Icon name="close" size={13} />
                </button>
              )}
            </div>
          )}

          <div className="bb-rc-well">
            {filteredPhrases.length === 0 ? (
              <div className="bb-rc-empty">
                {safePhrases.length === 0 ? (
                  <>
                    <span>No banned phrases configured.</span>
                    <Button
                      variant="b1"
                      size="sm"
                      emphasis="tonal"
                      icon="refresh"
                      onClick={() =>
                        onReplacePhrases?.([...DEFAULT_BANNED_PHRASES])
                      }
                    >
                      Restore Defaults
                    </Button>
                  </>
                ) : (
                  <span>
                    No phrases matching &ldquo;{filterQuery.trim()}&rdquo;
                  </span>
                )}
              </div>
            ) : (
              <OverlayScrollArea className="bb-rc-scroll">
                <div
                  className="bb-rc-list"
                  role="list"
                  aria-label="Banned refusal phrases"
                >
                  {filteredPhrases.map((phrase) => (
                    <div key={phrase} className="bb-rc-item" role="listitem">
                      <span className="bb-rc-item__phrase">
                        <span className="bb-rc-item__quote">&ldquo;</span>
                        {phrase}
                        <span className="bb-rc-item__quote">&rdquo;</span>
                      </span>
                      <button
                        type="button"
                        className="bb-rc-item__remove"
                        title={`Remove "${phrase}"`}
                        aria-label={`Remove "${phrase}"`}
                        onClick={() => onRemovePhrase?.(phrase)}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </OverlayScrollArea>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
