import React, { useState, useMemo } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button, SegmentedGroup } from '../../atoms/Button/Button.jsx';
import { Checkbox } from '../../atoms/Checkbox/Checkbox.jsx';
import { ProgressIndicator } from '../../atoms/ProgressIndicator/ProgressIndicator.jsx';
import { Dropdown } from '../../molecules/Dropdown/Dropdown.jsx';
import { KebabMenu } from '../../molecules/KebabMenu/KebabMenu.jsx';
import './StImporterManager.css';

const EMPTY_ARRAY = Object.freeze([]);

export const ST_IMPORT_CATEGORIES = [
  {
    id: 'backgrounds',
    label: 'Backgrounds',
    icon: 'images',
    defaultHint: 'Scene wallpapers & animated loops (backgrounds/)',
  },
  {
    id: 'characters',
    label: 'Characters',
    icon: 'addressCard',
    defaultHint: 'Character cards, tags, tag bindings & groups',
  },
  {
    id: 'personas',
    label: 'Personas',
    icon: 'user',
    defaultHint: 'User avatars, descriptions & character bindings',
  },
  {
    id: 'regex',
    label: 'Regex',
    icon: 'regex',
    defaultHint: 'Global regex rules (card rules import with cards)',
  },
  {
    id: 'chats',
    label: 'Chats',
    icon: 'comments',
    defaultHint: '1-on-1 & group .jsonl chats + media attachments',
  },
];

const CONFLICT_MODE_OPTIONS = [
  { value: 'skip', label: 'Skip Existing' },
  { value: 'overwrite', label: 'Overwrite' },
];

function formatNum(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toLocaleString('en-US') : '0';
}

function buildCategorySubtitle(catId, counts, defaultHint) {
  if (!counts) return defaultHint;
  const entry = counts[catId];
  if (!entry) return defaultHint;

  if (catId === 'backgrounds') {
    return `${formatNum(entry.total)} background file${entry.total === 1 ? '' : 's'} ready`;
  }
  if (catId === 'characters') {
    const parts = [`${formatNum(entry.cards ?? entry.total)} cards`];
    if (entry.tags > 0) parts.push(`${formatNum(entry.tags)} tags`);
    if (entry.groups > 0) parts.push(`${formatNum(entry.groups)} groups`);
    return parts.join(' · ');
  }
  if (catId === 'personas') {
    return `${formatNum(entry.total)} personas (${formatNum(entry.avatars)} image avatars)`;
  }
  if (catId === 'regex') {
    return `${formatNum(entry.total)} global script${entry.total === 1 ? '' : 's'} in settings.json`;
  }
  if (catId === 'chats') {
    const parts = [`${formatNum(entry.characterChats ?? entry.total)} chats`];
    if (entry.groupChats > 0) parts.push(`${formatNum(entry.groupChats)} group`);
    if (entry.attachments > 0) parts.push(`${formatNum(entry.attachments)} attachments`);
    return parts.join(' · ');
  }
  return defaultHint;
}


/**
 * StImporterManager — Pure M3 Solid Sheet plugin card for importing
 * Backgrounds, Characters (+ tags/groups), Personas, Regex, and Chats (+ attachments)
 * directly from a SillyTavern root directory.
 */
export function StImporterManager({
  isLocalHost = true,
  canBrowseNative = true,
  rootPath = '',
  onChangeRootPath,
  onBrowseDirectory,
  onScanDirectory,
  onClearSavedState,
  browsing = false,
  scanning = false,
  scanSummary = null,
  scanError = '',
  selectedProfile = 'default-user',
  onSelectProfile,
  categories = {
    backgrounds: true,
    characters: true,
    personas: true,
    regex: true,
    chats: true,
  },
  onToggleCategory,
  onSetAllCategories,
  conflictMode = 'skip',
  onChangeConflictMode,
  job = null,
  onStartImport,
  onCancelImport,
  lastReport = null,
  onDismissReport,
  collapsible = false,
  defaultOpen = true,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isRunning = Boolean(job?.running);
  const busy = browsing || scanning || isRunning;

  const counts = scanSummary?.counts || null;
  const profiles = Array.isArray(scanSummary?.profiles) ? scanSummary.profiles : EMPTY_ARRAY;

  const profileOptions = useMemo(
    () => profiles.map((p) => ({ value: p.id, label: p.label || p.id })),
    [profiles],
  );

  const selectedCount = useMemo(
    () => ST_IMPORT_CATEGORIES.filter((c) => Boolean(categories?.[c.id])).length,
    [categories],
  );

  const totalDiscoveredItems = useMemo(() => {
    if (!counts) return null;
    return ST_IMPORT_CATEGORIES.reduce(
      (sum, cat) => sum + Number(counts?.[cat.id]?.total || 0),
      0,
    );
  }, [counts]);

  const selectedDiscoveredItems = useMemo(() => {
    if (!counts) return null;
    return ST_IMPORT_CATEGORIES.reduce((sum, cat) => {
      if (!categories?.[cat.id]) return sum;
      return sum + Number(counts?.[cat.id]?.total || 0);
    }, 0);
  }, [counts, categories]);

  const allSelected = selectedCount === ST_IMPORT_CATEGORIES.length;
  const canSubmitImport =
    isLocalHost &&
    !busy &&
    Boolean(String(rootPath || '').trim()) &&
    selectedCount > 0;

  const handleHeaderClick = () => {
    if (!collapsible) return;
    setIsOpen((prev) => !prev);
  };

  const handleScanSubmit = (e) => {
    if (e) e.preventDefault();
    if (!isLocalHost || busy || !String(rootPath || '').trim()) return;
    onScanDirectory?.(rootPath, selectedProfile);
  };

  const menuItems = [
    {
      label: 'Rescan Directory',
      icon: 'refresh',
      disabled: !isLocalHost || busy || !String(rootPath || '').trim(),
      onClick: () => onScanDirectory?.(rootPath, selectedProfile),
    },
    {
      label: allSelected ? 'Deselect All Categories' : 'Select All Categories',
      icon: 'selectAll',
      disabled: !isLocalHost || isRunning,
      onClick: () => onSetAllCategories?.(!allSelected),
    },
    ...(rootPath || scanSummary || lastReport
      ? [
          {
            label: 'Clear Saved Directory',
            icon: 'trash',
            danger: true,
            disabled: !isLocalHost || isRunning,
            onClick: () => onClearSavedState?.(),
          },
        ]
      : []),
  ];

  const showBody = !collapsible || isOpen;
  const headerBadgeText = isRunning
    ? `${Math.round(job?.percent || 0)}%`
    : totalDiscoveredItems !== null
      ? formatNum(totalDiscoveredItems)
      : `${selectedCount}/${ST_IMPORT_CATEGORIES.length}`;

  return (
    <section
      className={[
        'bb-sti-sheet',
        collapsible ? 'bb-sti-sheet--collapsible' : '',
        !showBody ? 'is-collapsed' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="bb-sti-sheet__header" onClick={handleHeaderClick}>
        <div className="bb-sti-sheet__title-group">
          <Icon name="download" size={17} className="bb-sti-sheet__title-icon" />
          <span>SillyTavern Importer</span>
          <span
            className={`bb-sti-sheet__badge ${
              isRunning || totalDiscoveredItems !== null
                ? 'bb-sti-sheet__badge--active'
                : ''
            }`.trim()}
            title={
              totalDiscoveredItems !== null
                ? `${formatNum(totalDiscoveredItems)} items discovered in SillyTavern`
                : `${selectedCount} categories selected`
            }
          >
            {headerBadgeText}
          </span>
        </div>

        <div
          className="bb-sti-sheet__header-actions"
          onClick={(e) => e.stopPropagation()}
        >
          <KebabMenu items={menuItems} size="sm" title="SillyTavern Importer options" />
          {collapsible && (
            <button
              type="button"
              className={`bb-sti-sheet__chevron ${showBody ? 'is-open' : ''}`.trim()}
              onClick={handleHeaderClick}
              title={showBody ? 'Collapse SillyTavern Importer' : 'Expand SillyTavern Importer'}
              aria-expanded={showBody}
            >
              <Icon name="chevronDown" size={17} />
            </button>
          )}
        </div>
      </div>

      {showBody && (
        <div className="bb-sti-sheet__body">
          {!isLocalHost ? (
            <div className="bb-sti-alert bb-sti-alert--info">
              <Icon name="info" size={16} />
              <span>
                Local directory import is available directly on the host PC where
                NexusTavern Server is running.
              </span>
            </div>
          ) : (
            <>
              <form className="bb-sti-path-group" onSubmit={handleScanSubmit}>
                <div className="bb-sti-section-label">
                  <span>SillyTavern Root Directory</span>
                  {scanSummary?.activeProfile && profiles.length <= 1 && (
                    <span>Profile: {scanSummary.activeProfile}</span>
                  )}
                </div>

                <div className="bb-sti-path-row">
                  <div className="bb-sti-path-input-wrap">
                    <Icon name="folder" size={15} className="bb-sti-path-icon" />
                    <input
                      type="text"
                      className="bb-sti-path-input"
                      placeholder="C:\SillyTavern"
                      value={rootPath}
                      disabled={isRunning}
                      onChange={(e) => onChangeRootPath?.(e.target.value)}
                      aria-label="SillyTavern Root Directory"
                    />
                    {rootPath && !busy && (
                      <button
                        type="button"
                        className="bb-sti-path-clear"
                        title="Clear path"
                        onClick={() => onChangeRootPath?.('')}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    )}
                  </div>

                  {canBrowseNative && (
                    <Button
                      variant="b1"
                      emphasis="outlined"
                      size="sm"
                      pill
                      icon={browsing ? <ProgressIndicator size="xs" /> : 'folder'}
                      disabled={busy}
                      title="Browse folder on this PC"
                      onClick={() => onBrowseDirectory?.()}
                    >
                      Browse
                    </Button>
                  )}

                  <Button
                    type="submit"
                    variant="b1"
                    emphasis="tonal"
                    size="sm"
                    pill
                    icon={scanning ? <ProgressIndicator size="xs" /> : 'search'}
                    disabled={busy || !String(rootPath || '').trim()}
                    title="Scan SillyTavern directory"
                  >
                    Scan
                  </Button>
                </div>
              </form>

              {profiles.length > 1 && (
                <Dropdown
                  label="SillyTavern User Profile"
                  options={profileOptions}
                  value={selectedProfile}
                  disabled={busy}
                  onChange={(val) => onSelectProfile?.(val)}
                />
              )}

              {scanError && (
                <div className="bb-sti-alert" role="alert">
                  <Icon name="errorCircle" size={16} />
                  <span>{scanError}</span>
                </div>
              )}

              {scanSummary && !scanError && (
                <div className="bb-sti-scan-status">
                  <span className="bb-sti-scan-status__main" title={scanSummary.profilePath}>
                    <span className="bb-sti-scan-status__dot" />
                    <span>{scanSummary.resolvedRoot}</span>
                  </span>
                  <span>{formatNum(totalDiscoveredItems)} items</span>
                </div>
              )}

              <div className="bb-sti-section-label">
                <span>
                  Categories ({selectedCount} / {ST_IMPORT_CATEGORIES.length})
                </span>
                <button
                  type="button"
                  className="bb-sti-link-btn"
                  disabled={isRunning}
                  onClick={() => onSetAllCategories?.(!allSelected)}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div className="bb-sti-well" role="group" aria-label="Import categories">
                {ST_IMPORT_CATEGORIES.map((cat) => {
                  const checked = Boolean(categories?.[cat.id]);
                  const catCount = counts ? Number(counts?.[cat.id]?.total ?? 0) : null;
                  const subtitle = buildCategorySubtitle(cat.id, counts, cat.defaultHint);

                  return (
                    <div
                      key={cat.id}
                      role="checkbox"
                      aria-checked={checked}
                      aria-disabled={isRunning || undefined}
                      tabIndex={isRunning ? -1 : 0}
                      className={[
                        'bb-sti-cat-row',
                        checked ? 'is-selected' : '',
                        isRunning ? 'is-disabled' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        if (!isRunning) onToggleCategory?.(cat.id, !checked);
                      }}
                      onKeyDown={(e) => {
                        if (isRunning) return;
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          onToggleCategory?.(cat.id, !checked);
                        }
                      }}
                    >
                      <Checkbox checked={checked} disabled={isRunning} interactive={false} />
                      <span className="bb-sti-cat-icon" aria-hidden="true">
                        <Icon name={cat.icon} size={16} />
                      </span>
                      <div className="bb-sti-cat-text">
                        <span className="bb-sti-cat-title">{cat.label}</span>
                        <span className="bb-sti-cat-sub" title={subtitle}>
                          {subtitle}
                        </span>
                      </div>
                      <span
                        className={`bb-sti-cat-count ${
                          catCount === null || catCount === 0
                            ? 'bb-sti-cat-count--muted'
                            : ''
                        }`.trim()}
                      >
                        {catCount !== null ? formatNum(catCount) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="bb-sti-policy-row">
                <div className="bb-sti-policy-label">
                  <span className="bb-sti-policy-title">Duplicate Handling</span>
                  <span className="bb-sti-policy-hint">
                    {conflictMode === 'overwrite'
                      ? 'Replaces matching files, tags & rules'
                      : 'Safely keeps existing NexusTavern items'}
                  </span>
                </div>
                <SegmentedGroup
                  options={CONFLICT_MODE_OPTIONS.map((opt) => ({
                    ...opt,
                    disabled: isRunning,
                  }))}
                  value={conflictMode}
                  onChange={(mode) => onChangeConflictMode?.(mode)}
                />
              </div>

              {isRunning ? (
                <div className="bb-sti-progress-card">
                  <ProgressIndicator
                    variant="linear"
                    size="md"
                    value={typeof job?.percent === 'number' ? job.percent : null}
                    label={job?.label || 'Importing SillyTavern data...'}
                    showValue
                  />
                  <div className="bb-sti-progress-foot">
                    <span>
                      {formatNum(job?.processed)} / {formatNum(job?.total)} operations
                    </span>
                    <Button
                      variant="b4"
                      size="sm"
                      pill
                      icon="close"
                      onClick={() => onCancelImport?.()}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="b1"
                  emphasis="filled"
                  size="md"
                  pill
                  fullWidth
                  icon="download"
                  disabled={!canSubmitImport}
                  onClick={() => onStartImport?.()}
                >
                  {selectedDiscoveredItems !== null
                    ? `Import Selected (${formatNum(selectedDiscoveredItems)})`
                    : 'Import Selected from SillyTavern'}
                </Button>
              )}

              {!isRunning && job?.error && (
                <div className="bb-sti-alert" role="alert">
                  <Icon name="errorCircle" size={16} />
                  <span>{job.error}</span>
                </div>
              )}

              {!isRunning && lastReport && (
                <div className="bb-sti-report">
                  <div className="bb-sti-report__head">
                    <span className="bb-sti-report__title">
                      <Icon
                        name={lastReport.canceled ? 'warning' : 'check'}
                        size={15}
                      />
                      <span>
                        {lastReport.canceled ? 'Import Canceled' : 'Last Import Summary'}
                      </span>
                    </span>
                    {onDismissReport && (
                      <Button
                        variant="b2"
                        size="sm"
                        icon="close"
                        title="Hide summary"
                        onClick={() => onDismissReport?.()}
                      />
                    )}
                  </div>

                  <div className="bb-sti-report__metrics">
                    <span className="bb-sti-metric-pill bb-sti-metric-pill--accent">
                      Imported: {formatNum(lastReport.totals?.imported)}
                    </span>
                    <span className="bb-sti-metric-pill">
                      Skipped: {formatNum(lastReport.totals?.skipped)}
                    </span>
                    {Number(lastReport.totals?.errors) > 0 && (
                      <span className="bb-sti-metric-pill bb-sti-metric-pill--error">
                        Errors: {formatNum(lastReport.totals?.errors)}
                      </span>
                    )}
                  </div>

                  <div className="bb-sti-report__breakdown">
                    {ST_IMPORT_CATEGORIES.map((cat) => {
                      const b = lastReport.categories?.[cat.id];
                      if (!b || (b.imported === 0 && b.skipped === 0 && b.errors === 0)) {
                        return null;
                      }
                      return (
                        <span key={cat.id}>
                          {cat.label}: +{formatNum(b.imported)}
                          {b.skipped > 0 ? ` (${formatNum(b.skipped)} skipped)` : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

