import React, { useState } from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import {
  resolveEntryCategoryMeta,
  formatConsoleTime,
  formatEntryForClipboard,
  copyConsoleText,
} from './consoleFormatters.js';

function formatSamplerValue(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function PromptDetailsView({ details }) {
  const [activeTab, setActiveTab] = useState('turns');
  const [expandedTurns, setExpandedTurns] = useState(() => new Set());
  const [expandAllTurns, setExpandAllTurns] = useState(false);

  const wireMessages = Array.isArray(details?.messages) ? details.messages : [];
  const compiledBlocks = Array.isArray(details?.compiledBlocks) ? details.compiledBlocks : [];
  const samplersObj =
    details?.wireSamplers && typeof details.wireSamplers === 'object'
      ? details.wireSamplers
      : {};
  const samplerPairs = Object.entries(samplersObj);

  const toggleTurn = (idx) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleToggleAllTurns = () => {
    if (expandAllTurns) {
      setExpandAllTurns(false);
      setExpandedTurns(new Set());
    } else {
      setExpandAllTurns(true);
      setExpandedTurns(new Set(wireMessages.map((m) => m.index)));
    }
  };

  return (
    <div className="bb-console-entry__body">
      <div className="bb-console-kv-grid">
        <div className="bb-console-kv">
          <span className="bb-console-kv__key">Endpoint</span>
          <span className="bb-console-kv__val bb-console-kv__val--mono">
            POST {details.endpoint || '(upstream)'} ({details.protocol || 'openai'})
          </span>
        </div>
        <div className="bb-console-kv">
          <span className="bb-console-kv__key">Context</span>
          <span className="bb-console-kv__val">
            <strong>{details.character || 'Character'}</strong> ↔{' '}
            <strong>{details.user || 'User'}</strong> • Preset:{' '}
            <span className="bb-console-inline-code">{details.presetName || 'Default'}</span>
          </span>
        </div>
      </div>

      {samplerPairs.length > 0 && (
        <div className="bb-console-samplers">
          {samplerPairs.map(([k, v]) => (
            <span key={k} className="bb-console-sampler-chip">
              <span className="bb-console-sampler-chip__k">{k}:</span>
              <span className="bb-console-sampler-chip__v">{formatSamplerValue(v)}</span>
            </span>
          ))}
        </div>
      )}

      <div className="bb-console-subtabs-bar">
        <div className="bb-console-subtabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'turns'}
            className={`bb-console-subtab ${activeTab === 'turns' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('turns')}
          >
            Wire Messages ({wireMessages.length})
          </button>
          {compiledBlocks.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'blocks'}
              className={`bb-console-subtab ${activeTab === 'blocks' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('blocks')}
            >
              Prompt Blocks ({compiledBlocks.length})
            </button>
          )}
          {details.rawPayload && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'raw'}
              className={`bb-console-subtab ${activeTab === 'raw' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('raw')}
            >
              Raw Payload JSON
            </button>
          )}
        </div>

        {activeTab === 'turns' && wireMessages.length > 0 && (
          <button
            type="button"
            className="bb-console-link-btn"
            onClick={handleToggleAllTurns}
          >
            {expandAllTurns ? 'Collapse all turns' : 'Expand all turns'}
          </button>
        )}
      </div>

      {activeTab === 'turns' && (
        <div className="bb-console-turns">
          {wireMessages.map((m) => {
            const roleKey = String(m.role || 'user').toLowerCase();
            const roleLabel = String(m.wireRole || m.role || 'user').toUpperCase();
            const isLong =
              (m.content || '').length > 340 || (m.content || '').includes('\n');
            const isExpanded = expandAllTurns || !isLong || expandedTurns.has(m.index);
            const previewText = !isExpanded
              ? `${String(m.content || '').replace(/\s+/g, ' ').slice(0, 220)}…`
              : m.content || '(empty)';

            return (
              <div
                key={m.index}
                className={`bb-console-turn bb-console-turn--${roleKey}`}
              >
                <button
                  type="button"
                  className="bb-console-turn__head"
                  onClick={() => isLong && toggleTurn(m.index)}
                >
                  <span className="bb-console-turn__head-left">
                    {isLong && (
                      <Icon
                        name={isExpanded ? 'chevronDown' : 'chevronRight'}
                        size={14}
                        className="bb-console-turn__chev"
                      />
                    )}
                    <span className="bb-console-turn__idx">#{m.index}</span>
                    <span className={`bb-console-role-pill bb-console-role-pill--${roleKey}`}>
                      {roleLabel}
                    </span>
                    {m.name && <span className="bb-console-turn__name">{m.name}</span>}
                  </span>
                  <span className="bb-console-turn__stats">
                    {m.images > 0 && <span>{m.images} img • </span>}
                    ~{m.tokens} tok • {m.chars} chars
                  </span>
                </button>
                <pre
                  className={`bb-console-pre ${!isExpanded ? 'bb-console-pre--preview' : ''}`}
                >
                  {previewText}
                </pre>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'blocks' && (
        <div className="bb-console-blocks-table">
          {compiledBlocks.map((b) => (
            <div key={b.index} className="bb-console-block-row">
              <span className="bb-console-turn__idx">#{b.index + 1}</span>
              <span
                className={`bb-console-role-pill bb-console-role-pill--${b.role || 'system'}`}
              >
                {String(b.role || 'system').toUpperCase()}
              </span>
              <span className="bb-console-block-row__label">{b.label}</span>
              <span className="bb-console-turn__stats">
                ~{b.tokens} tok • {b.chars} chars
              </span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'raw' && details.rawPayload && (
        <pre className="bb-console-pre bb-console-pre--json">
          {JSON.stringify(details.rawPayload, null, 2)}
        </pre>
      )}
    </div>
  );
}

function OutputDetailsView({ details }) {
  const [showThoughts, setShowThoughts] = useState(true);

  return (
    <div className="bb-console-entry__body">
      <div className="bb-console-samplers">
        <span className="bb-console-sampler-chip">
          <span className="bb-console-sampler-chip__k">Status:</span>
          <span className="bb-console-sampler-chip__v">{details.status || 'completed'}</span>
        </span>
        {details.ttftMs != null && (
          <span className="bb-console-sampler-chip">
            <span className="bb-console-sampler-chip__k">TTFT:</span>
            <span className="bb-console-sampler-chip__v">{details.ttftMs}ms</span>
          </span>
        )}
        <span className="bb-console-sampler-chip">
          <span className="bb-console-sampler-chip__k">Duration:</span>
          <span className="bb-console-sampler-chip__v">{details.durationMs ?? 0}ms</span>
        </span>
        <span className="bb-console-sampler-chip">
          <span className="bb-console-sampler-chip__k">Output:</span>
          <span className="bb-console-sampler-chip__v">~{details.outputTokens ?? 0} tok</span>
        </span>
        {details.tokensPerSec != null && (
          <span className="bb-console-sampler-chip">
            <span className="bb-console-sampler-chip__k">Speed:</span>
            <span className="bb-console-sampler-chip__v">{details.tokensPerSec} tok/s</span>
          </span>
        )}
        {details.savedFile && (
          <span className="bb-console-sampler-chip">
            <span className="bb-console-sampler-chip__k">Saved:</span>
            <span className="bb-console-sampler-chip__v">{details.savedFile}</span>
          </span>
        )}
      </div>

      {details.fallbackInfo && (
        <div className="bb-console-callout bb-console-callout--warn">
          <Icon name="warning" size={14} />
          <span>
            Refusal Catcher redirected from{' '}
            <strong>{details.fallbackInfo.fromModel || 'Primary'}</strong> →{' '}
            <strong>{details.modelName}</strong>
          </span>
        </div>
      )}

      {details.reasoning && (
        <div className="bb-console-turn bb-console-turn--reasoning">
          <button
            type="button"
            className="bb-console-turn__head"
            onClick={() => setShowThoughts((v) => !v)}
          >
            <span className="bb-console-turn__head-left">
              <Icon
                name={showThoughts ? 'chevronDown' : 'chevronRight'}
                size={14}
                className="bb-console-turn__chev"
              />
              <span className="bb-console-role-pill bb-console-role-pill--reasoning">
                CHAIN OF THOUGHT
              </span>
            </span>
            <span className="bb-console-turn__stats">
              ~{details.reasoningTokens || 0} tok
              {details.reasoningDurationMs ? ` • ${details.reasoningDurationMs}ms` : ''}
            </span>
          </button>
          {showThoughts && <pre className="bb-console-pre">{details.reasoning}</pre>}
        </div>
      )}

      <div className="bb-console-turn bb-console-turn--assistant">
        <div className="bb-console-turn__head is-static">
          <span className="bb-console-turn__head-left">
            <span className="bb-console-role-pill bb-console-role-pill--assistant">
              ASSISTANT RESPONSE
            </span>
          </span>
          <span className="bb-console-turn__stats">
            ~{details.responseTokens ?? details.outputTokens ?? 0} tok
          </span>
        </div>
        <pre className="bb-console-pre">{details.response || '(empty response)'}</pre>
      </div>
    </div>
  );
}

export const ConsoleEntryCard = React.memo(function ConsoleEntryCard({
  entry,
  defaultExpanded = null,
}) {
  const catMeta = resolveEntryCategoryMeta(entry);
  const hasRichDetails = Boolean(
    entry.category === 'prompt' ||
      entry.category === 'output' ||
      entry.details?.errorBody ||
      entry.details?.meta,
  );
  const initialOpen =
    defaultExpanded !== null
      ? defaultExpanded
      : entry.category === 'output' || entry.category === 'error';

  const [expanded, setExpanded] = useState(initialOpen);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    const ok = await copyConsoleText(formatEntryForClipboard(entry));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };

  return (
    <article
      className={`bb-console-entry bb-console-entry--${catMeta.key} ${
        expanded && hasRichDetails ? 'is-expanded' : ''
      }`.trim()}
    >
      <div
        className={`bb-console-entry__head ${hasRichDetails ? 'is-clickable' : ''}`}
        onClick={() => hasRichDetails && setExpanded((v) => !v)}
      >
        <div className="bb-console-entry__head-main">
          {hasRichDetails ? (
            <span className="bb-console-entry__chev" aria-hidden="true">
              <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={15} />
            </span>
          ) : (
            <span
              className="bb-console-entry__chev bb-console-entry__chev--dot"
              aria-hidden="true"
            />
          )}

          <span className="bb-console-entry__time">{formatConsoleTime(entry.timestamp)}</span>
          <span className={`bb-console-cat-badge bb-console-cat-badge--${catMeta.key}`}>
            {catMeta.badge}
          </span>
          {entry.scope && <span className="bb-console-entry__scope">{entry.scope}</span>}
          <span className="bb-console-entry__title">{entry.title}</span>
        </div>

        <div className="bb-console-entry__head-right">
          {Array.isArray(entry.badges) &&
            entry.badges.map((b, i) => (
              <span
                key={`${b.label}_${i}`}
                className={`bb-console-meta-pill bb-console-meta-pill--${b.tone || 'neutral'}`}
              >
                {b.label}
              </span>
            ))}

          <button
            type="button"
            className={`bb-console-entry__copy-btn ${copied ? 'is-copied' : ''}`}
            title={copied ? 'Copied!' : 'Copy structured entry'}
            aria-label="Copy console entry"
            onClick={handleCopy}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
          </button>
        </div>
      </div>

      {entry.summary && (
        <div className="bb-console-entry__summary">{entry.summary}</div>
      )}

      {expanded && entry.category === 'prompt' && entry.details && (
        <PromptDetailsView details={entry.details} />
      )}

      {expanded && entry.category === 'output' && entry.details && (
        <OutputDetailsView details={entry.details} />
      )}

      {expanded &&
        entry.category !== 'prompt' &&
        entry.category !== 'output' &&
        (entry.details?.errorBody || entry.details?.meta) && (
          <div className="bb-console-entry__body">
            <pre className="bb-console-pre bb-console-pre--json">
              {JSON.stringify(entry.details.errorBody || entry.details.meta, null, 2)}
            </pre>
          </div>
        )}
    </article>
  );
});

