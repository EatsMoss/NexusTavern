import React, { useState, useMemo, useRef } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { BookmarkRibbons } from '../../molecules/BookmarkRibbons/BookmarkRibbons.jsx';
import { KebabMenu } from '../../molecules/KebabMenu/KebabMenu.jsx';
import { estimateTextTokens } from '@core/presets/tokenEstimator.js';
import { normalizeRecapConfig } from '@core/recap/recapEngine.js';
import { RecapCompressionCard, RecapPromptCard } from './MessageRecapSections.jsx';
import './MessageRecapManager.css';

const RECAP_SUB_TABS = [
  { id: 'compression', label: 'Compression' },
  { id: 'opening', label: 'Opening Rules' },
  { id: 'closing', label: 'Closing Nudge' },
];

export function MessageRecapManager({
  config = null,
  tokenContext = null,
  savedChatTokens = 0,
  onPatchConfig,
  onResetDefaults,
  onImportConfig,
  collapsible = false,
  defaultOpen = true,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeTab, setActiveTab] = useState('compression');
  const fileInputRef = useRef(null);

  const resolved = useMemo(() => normalizeRecapConfig(config), [config]);

  const openingTokens = useMemo(
    () => estimateTextTokens(resolved.openingPrompt, tokenContext),
    [resolved.openingPrompt, tokenContext],
  );
  const closingTokens = useMemo(
    () => estimateTextTokens(resolved.closingPrompt, tokenContext),
    [resolved.closingPrompt, tokenContext],
  );

  const handleHeaderToggle = () => {
    if (!collapsible) return;
    setIsOpen((prev) => !prev);
  };

  const handleExportJson = () => {
    const payload = JSON.stringify(resolved, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nexustavern-message-recap.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const nextCfg = normalizeRecapConfig({
          ...parsed,
          enabled:
            typeof parsed?.enabled === 'boolean' ? parsed.enabled : resolved.enabled,
        });
        onImportConfig?.(nextCfg);
      } catch {
        // Invalid JSON ignored safely
      }
    };
    reader.readAsText(file);
  };

  const menuItems = [
    {
      id: 'restore-defaults',
      label: 'Restore Default Prompts & Regex',
      icon: 'refresh',
      onClick: () => onResetDefaults?.(),
    },
    {
      id: 'export-config',
      label: 'Export Config (.json)',
      icon: 'download',
      onClick: handleExportJson,
    },
    {
      id: 'import-config',
      label: 'Import Config (.json)',
      icon: 'upload',
      onClick: () => fileInputRef.current?.click(),
    },
  ];

  const savedNumber = Math.max(0, Math.round(Number(savedChatTokens) || 0));

  return (
    <section
      className={`bb-mr-sheet ${collapsible ? 'bb-mr-sheet--collapsible' : ''} ${
        !isOpen ? 'is-collapsed' : ''
      } ${!resolved.enabled ? 'is-disabled' : ''} ${className}`.trim()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="bb-mr-hidden-file"
        onChange={handleFileImport}
      />

      <div
        className="bb-mr-sheet__header"
        onClick={handleHeaderToggle}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        aria-expanded={collapsible ? isOpen : undefined}
        onKeyDown={
          collapsible
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleHeaderToggle();
                }
              }
            : undefined
        }
      >
        <div className="bb-mr-sheet__title-group">
          <Icon name="scissors" size={16} className="bb-mr-sheet__title-icon" />
          <span>Message Recap</span>
          {resolved.enabled && savedNumber > 0 ? (
            <span
              className="bb-mr-sheet__pill is-saved"
              title={`Saving ~${savedNumber.toLocaleString('en-US')} tokens in the active chat`}
            >
              -{savedNumber >= 1000 ? `${(savedNumber / 1000).toFixed(1)}k` : savedNumber} tok
            </span>
          ) : (
            <span className="bb-mr-sheet__pill">
              {resolved.stripEnabled ? `Depth ≥ ${resolved.keepFullDepth}` : 'Prompts only'}
            </span>
          )}
        </div>

        <div
          className="bb-mr-sheet__header-actions"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Switch
            size="sm"
            checked={resolved.enabled}
            onChange={(val) => onPatchConfig?.({ enabled: val }, { immediate: true })}
            title={resolved.enabled ? 'Message Recap enabled' : 'Message Recap paused'}
          />
          <KebabMenu items={menuItems} size="sm" title="Message Recap actions" />
          {collapsible && (
            <button
              type="button"
              className={`bb-mr-sheet__chevron ${isOpen ? 'is-open' : ''}`}
              aria-label={isOpen ? 'Collapse Message Recap' : 'Expand Message Recap'}
              title={isOpen ? 'Collapse' : 'Expand'}
              onClick={handleHeaderToggle}
            >
              <Icon name="chevronDown" size={17} />
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="bb-mr-sheet__body">
          <div className="bb-mr-status-bar">
            <span
              className={`bb-mr-status-dot ${resolved.enabled ? 'is-active' : ''}`}
              aria-hidden="true"
            />
            <span>
              {resolved.enabled
                ? resolved.stripEnabled
                  ? `Active — keeps last ${resolved.keepFullDepth} full turns and strips older AI <story> blocks to English recaps.`
                  : 'Active — injects recap prompts without stripping older AI message blocks.'
                : 'Paused — recap prompts and depth-based context compression are inactive.'}
            </span>
          </div>

          <BookmarkRibbons
            variant="secondary"
            tabs={RECAP_SUB_TABS}
            activeId={activeTab}
            onChange={setActiveTab}
          />

          {activeTab === 'compression' && (
            <RecapCompressionCard resolved={resolved} onPatchConfig={onPatchConfig} />
          )}

          {activeTab === 'opening' && (
            <RecapPromptCard
              variant="opening"
              resolved={resolved}
              tokens={openingTokens}
              onPatchConfig={onPatchConfig}
            />
          )}

          {activeTab === 'closing' && (
            <RecapPromptCard
              variant="closing"
              resolved={resolved}
              tokens={closingTokens}
              onPatchConfig={onPatchConfig}
            />
          )}
        </div>
      )}
    </section>
  );
}

