import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Button } from '@ui/atoms/Button/Button.jsx';
import { Input } from '@ui/atoms/Input/Input.jsx';
import { OverlayScrollArea } from '@ui/atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import { ChipScrollStrip } from '@ui/molecules/ChipScrollStrip/ChipScrollStrip.jsx';
import './ConnectionModelPicker.css';

function formatTokensShort(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1000000) return `${Number((n / 1000000).toFixed(1))}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

/**
 * Formats proxy-locked context badge (`LOCKED/MAX`, e.g. `200K/1M` or `128K`).
 * Returns `null` when the proxy does not report a locked context limit.
 */
export function formatContextBadge(lockedContextLength, maxContextLength = null) {
  const lockedStr = formatTokensShort(lockedContextLength);
  if (!lockedStr) return null;
  const lockedNum = Number(lockedContextLength);
  const maxNum = Number(maxContextLength);
  if (Number.isFinite(maxNum) && maxNum > lockedNum) {
    const maxStr = formatTokensShort(maxNum);
    if (maxStr && maxStr !== lockedStr) {
      return `${lockedStr}/${maxStr}`;
    }
  }
  return lockedStr;
}

const FAMILY_LABELS = {
  claude: 'Claude',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  gpt: 'GPT',
  grok: 'Grok',
  mistral: 'Mistral',
  llama: 'Llama',
  qwen: 'Qwen',
};

function formatConnTypeLabel(type) {
  if (type === 'rp_proxy') return 'RP Proxy';
  if (type === 'oai_proxy') return 'OAI-Comp';
  if (type === 'official_api') return 'Official API';
  return 'Connection';
}

function getConnDotState(conn) {
  if (!conn) return 'is-warn';
  if (conn.health?.state === 'offline') return 'is-dead';
  if (conn.hasKey && conn.aliveKeysCount === 0) return 'is-dead';
  if (conn.health?.state === 'degraded') return 'is-warn';
  if (conn.health?.state === 'online' || conn.isConfigured) return 'is-ok';
  return 'is-warn';
}

async function copyTextToClipboard(text) {
  const val = String(text || '');
  if (!val) return false;
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(val);
      return true;
    } catch {
      // Fallback below for non-HTTPS LAN mobile contexts
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = val;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function ConnectionModelPicker({
  connections = [],
  customFamilies = [],
  activeConnectionId = '',
  activeModelId = '',
  activeModelName = '',
  placement = 'top',
  fullWidth = false,
  showConnectionName = false,
  onSelectConnection,
  onUpdateConnection,
  onFetchConnectionModels,
  onDeleteConnection,
  onRevealConnectionKey,
  onPingConnections,
  onFetchTelemetry,
  onAddCustomFamily,
  onDeleteCustomFamily,
  onOpenAddConnection,
  className = '',
}) {
  // 'provider' | 'model' | null
  const [openPane, setOpenPane] = useState(null);
  const [modelQuery, setModelQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all'); // 'all' | 'starred' | family | custom.id
  const [addingFamily, setAddingFamily] = useState(false);
  const [newFamilyDraft, setNewFamilyDraft] = useState('');
  const [localFamilies, setLocalFamilies] = useState([]);

  // Inline provider / keychain state (no modal needed!)
  const [expandedKeysConnId, setExpandedKeysConnId] = useState(null);
  const [newBackupKeyDraft, setNewBackupKeyDraft] = useState('');
  const [replacingKeyId, setReplacingKeyId] = useState(null);
  const [replaceKeyDraft, setReplaceKeyDraft] = useState('');
  const [confirmDeleteConnId, setConfirmDeleteConnId] = useState(null);

  // Inline custom model adder in Model Popover
  const [addingCustomModel, setAddingCustomModel] = useState(false);
  const [customModelDraft, setCustomModelDraft] = useState('');

  // Busy & inline feedback
  const [busyConnId, setBusyConnId] = useState(null);
  const [pinging, setPinging] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'ok' | 'error', text: string }
  const [copiedToken, setCopiedToken] = useState('');

  const flashCopied = (token) => {
    setCopiedToken(token);
    setTimeout(() => {
      setCopiedToken((prev) => (prev === token ? '' : prev));
    }, 1600);
  };

  const handleCopyUrl = async (conn) => {
    if (!conn?.baseUrl) return;
    const ok = await copyTextToClipboard(conn.baseUrl);
    if (ok) flashCopied(`url:${conn.id}`);
  };

  const handleCopyKey = async (connId, keyId = '') => {
    const token = keyId ? `key:${keyId}` : `activekey:${connId}`;
    try {
      if (onRevealConnectionKey) {
        const rawKey = await onRevealConnectionKey(connId, keyId);
        if (rawKey) {
          const ok = await copyTextToClipboard(rawKey);
          if (ok) flashCopied(token);
        }
      } else {
        // UI-Kit demo fallback
        const conn = connections.find((c) => c.id === connId);
        const k = keyId ? conn?.keys?.find((x) => x.id === keyId) : conn?.keys?.[0];
        if (k?.masked) {
          await copyTextToClipboard(k.masked);
          flashCopied(token);
        }
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Could not copy key' });
    }
  };

  const wrapRef = useRef(null);
  const sheetRef = useRef(null);
  const searchRef = useRef(null);
  const [popoverPos, setPopoverPos] = useState({
    left: 12,
    bottom: 64,
    top: null,
    maxHeight: null,
    width: 420,
  });

  const updatePosition = useCallback(() => {
    if (!wrapRef.current || typeof window === 'undefined') return;
    if (window.innerWidth <= 640) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 24);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) {
      left = window.innerWidth - width - 12;
    }
    if (left < 12) left = 12;

    if (placement === 'bottom') {
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      if (spaceBelow >= 240) {
        setPopoverPos({
          left: Math.round(left),
          top: Math.round(rect.bottom + 8),
          bottom: null,
          maxHeight: Math.min(500, Math.round(spaceBelow)),
          width,
        });
        return;
      }
    }

    const bottom = Math.max(12, window.innerHeight - rect.top + 10);
    setPopoverPos({
      left: Math.round(left),
      bottom: Math.round(bottom),
      top: null,
      maxHeight: null,
      width,
    });
  }, [placement]);

  const activeConn = useMemo(
    () => connections.find((c) => c.id === activeConnectionId) || connections[0] || null,
    [connections, activeConnectionId],
  );

  const activeModelObj = useMemo(() => {
    if (!activeConn) return null;
    return (activeConn.models || []).find((m) => m.id === activeModelId) || null;
  }, [activeConn, activeModelId]);

  useEffect(() => {
    if (!openPane) {
      setModelQuery('');
      setFamilyFilter('all');
      setConfirmDeleteConnId(null);
      setReplacingKeyId(null);
      setReplaceKeyDraft('');
      setNewBackupKeyDraft('');
      setAddingCustomModel(false);
      setCustomModelDraft('');
      setAddingFamily(false);
      setNewFamilyDraft('');
      setFeedback(null);
      return undefined;
    }

    updatePosition();

    const onPointerDown = (e) => {
      const t = e.target;
      if (wrapRef.current?.contains(t)) return;
      if (sheetRef.current?.contains(t)) return;
      setOpenPane(null);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpenPane(null);
      }
    };
    window.addEventListener('resize', updatePosition);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);

    if (openPane === 'provider' && onPingConnections) {
      setPinging(true);
      Promise.resolve(onPingConnections())
        .catch(() => null)
        .finally(() => setPinging(false));
    } else if (openPane === 'model' && activeConn?.id) {
      if (typeof window !== 'undefined' && window.innerWidth > 640) {
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (onFetchTelemetry) {
        Promise.resolve(onFetchTelemetry(activeConn.id)).catch(() => null);
      }
    } else if (openPane === 'model' && typeof window !== 'undefined' && window.innerWidth > 640) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [openPane, updatePosition]);


  const mergedCustomFamilies = useMemo(
    () => (onAddCustomFamily ? customFamilies : [...customFamilies, ...localFamilies]),
    [customFamilies, localFamilies, onAddCustomFamily],
  );

  const availableFamilies = useMemo(() => {
    const set = new Set();
    for (const m of activeConn?.models || []) {
      if (m.family && FAMILY_LABELS[m.family]) {
        set.add(m.family);
      }
    }
    return Object.keys(FAMILY_LABELS).filter((f) => set.has(f));
  }, [activeConn]);

  const { starredActiveModels, regularActiveModels, otherProviderMatches } = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    const activeCustomFam = mergedCustomFamilies.find((cf) => cf.id === familyFilter) || null;

    const matchesModel = (m) => {
      if (familyFilter === 'starred' && !m.starred) return false;
      if (activeCustomFam) {
        const needle = String(activeCustomFam.match || activeCustomFam.label || '').toLowerCase();
        const hay = `${m.id || ''} ${m.name || ''} ${m.routeId || ''}`.toLowerCase();
        if (needle && !hay.includes(needle)) return false;
      } else if (familyFilter !== 'all' && familyFilter !== 'starred' && m.family !== familyFilter) {
        return false;
      }
      if (!q) return true;
      return (
        String(m.name || '').toLowerCase().includes(q) ||
        String(m.id || '').toLowerCase().includes(q) ||
        String(m.routeId || '').toLowerCase().includes(q)
      );
    };

    const currentList = (activeConn?.models || []).filter(matchesModel);
    const starred = currentList.filter((m) => m.starred);
    const regular = currentList.filter((m) => !m.starred);

    const others = [];
    if (q || familyFilter === 'starred' || activeCustomFam) {
      for (const conn of connections) {
        if (conn.id === activeConn?.id) continue;
        const matched = (conn.models || []).filter(matchesModel);
        if (matched.length > 0) {
          others.push({ conn, models: matched.slice(0, 15) });
        }
      }
    }

    return {
      starredActiveModels: starred,
      regularActiveModels: regular,
      otherProviderMatches: others,
    };
  }, [activeConn, connections, modelQuery, familyFilter, mergedCustomFamilies]);

  const runConnAction = async (connId, fn) => {
    setBusyConnId(connId);
    setFeedback(null);
    try {
      await fn();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Action failed' });
    } finally {
      setBusyConnId(null);
    }
  };

  if (connections.length === 0) {
    return (
      <div className={`bb-conn-picker ${className}`.trim()} ref={wrapRef}>
        <button
          type="button"
          className="bb-conn-picker__empty-pill"
          onClick={() => onOpenAddConnection?.()}
          title="Add an RP Proxy, OpenAI-Compatible endpoint, or API key"
        >
          <Icon name="plus" size={14} />
          <span>Connect Proxy / API</span>
        </button>
      </div>
    );
  }

  const dotClass = getConnDotState(activeConn);
  const showStatusDot = dotClass !== 'is-ok';
  const isProxyOrOai =
    activeConn?.type === 'rp_proxy' || activeConn?.type === 'oai_proxy';
  const maskedProviderLabel = activeConn
    ? showConnectionName && activeConn.name
      ? activeConn.name
      : isProxyOrOai
        ? 'Proxy'
        : 'API'
    : 'Provider';
  const canRevealProviderName = Boolean(
    activeConn && !showConnectionName && !isProxyOrOai && activeConn.name,
  );
  const realProviderLabel = canRevealProviderName ? activeConn.name : maskedProviderLabel;
  const displayModelLabel =
    activeModelObj?.name || activeModelName || activeModelId || 'Select Model';

  const popoverVars = {
    '--bb-cp-left': `${popoverPos.left}px`,
    '--bb-cp-width': `${popoverPos.width}px`,
    ...(popoverPos.top !== null
      ? {
          '--bb-cp-top': `${popoverPos.top}px`,
          '--bb-cp-max-h': `${popoverPos.maxHeight || 480}px`,
        }
      : {
          '--bb-cp-bottom': `${popoverPos.bottom ?? 64}px`,
        }),
  };

  return (
    <div
      className={`bb-conn-picker ${fullWidth ? 'bb-conn-picker--full' : ''} ${className}`.trim()}
      ref={wrapRef}
    >
      <div className={`bb-conn-picker__capsule ${openPane ? 'is-open' : ''}`}>
        <button
          type="button"
          className={[
            'bb-conn-picker__seg',
            'bb-conn-picker__seg--provider',
            canRevealProviderName ? 'can-reveal-name' : '',
            openPane === 'provider' ? 'is-active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Switch provider or manage keys"
          aria-expanded={openPane === 'provider'}
          onClick={() => setOpenPane((prev) => (prev === 'provider' ? null : 'provider'))}
        >
          {showStatusDot && <span className={`bb-conn-picker__dot ${dotClass}`} />}
          <span className="bb-conn-picker__seg-text bb-conn-picker__seg-text--masked">
            {maskedProviderLabel}
          </span>
          {canRevealProviderName && (
            <span className="bb-conn-picker__seg-text bb-conn-picker__seg-text--real">
              {realProviderLabel}
            </span>
          )}
          {activeConn?.deadKeysCount > 0 && (
            <span
              className="bb-conn-picker__dead-pill"
              title={`${activeConn.deadKeysCount} dead key(s) in keychain`}
            >
              {activeConn.aliveKeysCount === 0 ? 'DEAD' : `!${activeConn.deadKeysCount}`}
            </span>
          )}
          <Icon name="chevronDown" size={13} className="bb-conn-picker__chevron" />
        </button>

        <button
          type="button"
          className={`bb-conn-picker__seg bb-conn-picker__seg--model ${
            openPane === 'model' ? 'is-active' : ''
          }`}
          title="Switch model or pin favorites"
          aria-expanded={openPane === 'model'}
          onClick={() => setOpenPane((prev) => (prev === 'model' ? null : 'model'))}
        >
          <span className="bb-conn-picker__seg-text">{displayModelLabel}</span>
          <Icon name="chevronDown" size={13} className="bb-conn-picker__chevron" />
        </button>
      </div>

      {openPane === 'provider' &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="bb-conn-picker__overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpenPane(null);
            }}
          >
            <div
              ref={sheetRef}
              className={`bb-conn-picker__popover ${
                popoverPos.top !== null ? 'is-bottom' : ''
              }`.trim()}
              role="dialog"
              aria-label="Connections & Keychains"
              style={popoverVars}
            >
              <div className="bb-conn-picker__grabber" aria-hidden="true" />

              <div className="bb-conn-picker__header">
                <div className="bb-conn-picker__header-title-row">
                  <div className="bb-conn-picker__title-group">
                    <Icon name="plug" size={16} />
                    <span className="bb-conn-picker__header-title">Connections</span>
                    <span className="bb-conn-picker__count">{connections.length}</span>
                  </div>

                  <div className="bb-conn-picker__header-actions">
                    <button
                      type="button"
                      className="bb-conn-picker__hdr-btn is-primary"
                      onClick={() => {
                        setOpenPane(null);
                        onOpenAddConnection?.();
                      }}
                    >
                      <Icon name="plus" size={14} />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
                {feedback && (
                  <div
                    className={`bb-conn-picker__feedback ${
                      feedback.type === 'error' ? 'is-error' : ''
                    }`}
                  >
                    {feedback.text}
                  </div>
                )}
              </div>

              <OverlayScrollArea
                className="bb-conn-picker__scroll-wrap"
                viewportClassName="bb-conn-picker__scroll"
                variant="compact"
              >
                {connections.map((conn) => {
                  const isSelected = conn.id === activeConn?.id;
                  const isKeysOpen = expandedKeysConnId === conn.id;
                  const isConfirmDelete = confirmDeleteConnId === conn.id;
                  const isBusy = busyConnId === conn.id;
                  const connDot = getConnDotState(conn);

                  return (
                    <div
                      key={conn.id}
                      className={`bb-conn-picker__prov-card ${isSelected ? 'is-selected' : ''} ${
                        isKeysOpen ? 'is-expanded' : ''
                      }`}
                    >
                      <div className="bb-conn-picker__prov-row">
                        <button
                          type="button"
                          className="bb-conn-picker__prov-main"
                          onClick={() => {
                            onSelectConnection?.(conn.id, null);
                            setOpenPane(null);
                          }}
                        >
                          <span className="bb-conn-picker__prov-icon">
                            <Icon
                              name={conn.type === 'official_api' ? 'sparkles' : 'globe'}
                              size={18}
                            />
                            <span className={`bb-conn-picker__prov-dot ${connDot}`} />
                          </span>

                          <span className="bb-conn-picker__prov-info">
                            <span className="bb-conn-picker__prov-title">
                              <span className="bb-conn-picker__seg-text">{conn.name}</span>
                              {conn.deadKeysCount > 0 && (
                                <span className="bb-conn-picker__dead-pill">
                                  {conn.aliveKeysCount === 0
                                    ? 'DEAD'
                                    : `${conn.deadKeysCount} DEAD`}
                                </span>
                              )}
                            </span>
                            <span className="bb-conn-picker__prov-sub">
                              <span>{formatConnTypeLabel(conn.type)}</span>
                              {conn.health?.state === 'online' ? (
                                <span className="bb-conn-picker__health-online">
                                  &bull; Online
                                  {conn.health.latencyMs ? ` ${conn.health.latencyMs}ms` : ''}
                                </span>
                              ) : conn.health?.state === 'offline' ? (
                                <span className="bb-conn-picker__health-offline">
                                  &bull; Offline
                                </span>
                              ) : !isSelected && conn.sameModelMatchId ? (
                                <span className="bb-conn-picker__same-model-tag">
                                  &bull; Same model
                                </span>
                              ) : (
                                <span>&bull; {(conn.models || []).length} models</span>
                              )}
                            </span>
                          </span>
                        </button>


                        <div className="bb-conn-picker__prov-actions">
                          {conn.hasKey && (
                            <button
                              type="button"
                              className="bb-conn-picker__action-btn"
                              title="Copy active API / Proxy key"
                              onClick={() => handleCopyKey(conn.id, '')}
                            >
                              <Icon
                                name={copiedToken === `activekey:${conn.id}` ? 'check' : 'copy'}
                                size={15}
                              />
                            </button>
                          )}
                          <button
                            type="button"
                            className={`bb-conn-picker__action-btn ${isKeysOpen ? 'is-active' : ''}`}
                            title="Keys & connection options"
                            onClick={() => {
                              setExpandedKeysConnId(isKeysOpen ? null : conn.id);
                              setConfirmDeleteConnId(null);
                              setReplacingKeyId(null);
                              setReplaceKeyDraft('');
                            }}
                          >
                            <Icon name="sliders" size={15} />
                          </button>
                        </div>
                      </div>

                      {isKeysOpen && (
                        <div className="bb-conn-picker__keychain">
                          <div className="bb-conn-picker__keychain-tools">
                            {conn.baseUrl && conn.type !== 'official_api' && (
                              <button
                                type="button"
                                className="bb-conn-picker__tool-pill"
                                title={conn.baseUrl}
                                onClick={() => handleCopyUrl(conn)}
                              >
                                <Icon
                                  name={copiedToken === `url:${conn.id}` ? 'check' : 'link'}
                                  size={13}
                                />
                                <span>{copiedToken === `url:${conn.id}` ? 'Copied' : 'Copy URL'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              className="bb-conn-picker__tool-pill"
                              disabled={isBusy}
                              onClick={() =>
                                runConnAction(conn.id, async () => {
                                  const res = await onFetchConnectionModels?.(conn.id);
                                  if (res?.fetchedCount !== undefined) {
                                    setFeedback({
                                      type: 'ok',
                                      text: `Loaded ${res.fetchedCount} models from ${conn.name}`,
                                    });
                                  }
                                })
                              }
                            >
                              <Icon name="refresh" size={13} />
                              <span>Sync Models</span>
                            </button>

                            {isConfirmDelete ? (
                              <>
                                <button
                                  type="button"
                                  className="bb-conn-picker__tool-pill is-danger"
                                  disabled={isBusy}
                                  onClick={() =>
                                    runConnAction(conn.id, async () => {
                                      await onDeleteConnection?.(conn.id);
                                      setConfirmDeleteConnId(null);
                                    })
                                  }
                                >
                                  <span>Confirm Delete</span>
                                </button>
                                <button
                                  type="button"
                                  className="bb-conn-picker__tool-pill"
                                  onClick={() => setConfirmDeleteConnId(null)}
                                >
                                  <span>Cancel</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="bb-conn-picker__tool-pill is-danger"
                                onClick={() => setConfirmDeleteConnId(conn.id)}
                              >
                                <Icon name="trash" size={13} />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>

                      {(conn.keys || []).map((k) => {
                        const isDead = k.status === 'dead';
                        const isReplacing = replacingKeyId === k.id;
                        return (
                          <div
                            key={k.id}
                            className={`bb-conn-picker__key-item ${
                              k.isPreferred && !isDead ? 'is-preferred' : ''
                            } ${isDead ? 'is-dead' : ''}`}
                          >
                            <div className="bb-conn-picker__key-top">
                              <button
                                type="button"
                                className="bb-conn-picker__key-pick"
                                title={
                                  isDead
                                    ? 'Click to retry / unmark dead key'
                                    : 'Set as preferred key'
                                }
                                onClick={() =>
                                  runConnAction(conn.id, () =>
                                    onUpdateConnection?.(conn.id, {
                                      selectKeyId: k.id,
                                      reviveKey: true,
                                    }),
                                  )
                                }
                              >
                                {k.isPreferred && !isDead && <Icon name="check" size={12} />}
                                <span style={{ fontWeight: 600 }}>{k.label}</span>
                                <span className="bb-conn-picker__key-masked">{k.masked}</span>
                                {isDead && <span className="bb-conn-picker__dead-pill">DEAD</span>}
                                {k.status === 'cooldown' && (
                                  <span className="bb-conn-picker__badge">429</span>
                                )}
                              </button>

                              <div className="bb-conn-picker__prov-actions">
                                <button
                                  type="button"
                                  className="bb-conn-picker__icon-btn"
                                  title="Copy this key to clipboard"
                                  onClick={() => handleCopyKey(conn.id, k.id)}
                                >
                                  <Icon
                                    name={copiedToken === `key:${k.id}` ? 'check' : 'copy'}
                                    size={11}
                                  />
                                </button>
                                <button
                                  type="button"
                                  className="bb-conn-picker__icon-btn"
                                  title="Replace key"
                                  onClick={() => {
                                    setReplacingKeyId(isReplacing ? null : k.id);
                                    setReplaceKeyDraft('');
                                  }}
                                >
                                  <Icon name="edit" size={11} />
                                </button>
                                <button
                                  type="button"
                                  className="bb-conn-picker__icon-btn is-danger"
                                  title="Remove key"
                                  onClick={() =>
                                    runConnAction(conn.id, () =>
                                      onUpdateConnection?.(conn.id, { deleteKeyId: k.id }),
                                    )
                                  }
                                >
                                  <Icon name="trash" size={11} />
                                </button>
                              </div>
                            </div>

                            {isDead && k.statusReason && (
                              <div className="bb-conn-picker__key-reason">{k.statusReason}</div>
                            )}


                            {isReplacing && (
                              <div className="bb-conn-picker__inline-form">
                                <div style={{ flex: 1 }}>
                                  <Input
                                    type="password"
                                    placeholder="Paste replacement key..."
                                    value={replaceKeyDraft}
                                    onChange={(e) => setReplaceKeyDraft(e.target.value)}
                                  />
                                </div>
                                <Button
                                  variant="b1"
                                  size="sm"
                                  emphasis="filled"
                                  disabled={!replaceKeyDraft.trim() || isBusy}
                                  onClick={() =>
                                    runConnAction(conn.id, async () => {
                                      await onUpdateConnection?.(conn.id, {
                                        replaceKey: { keyId: k.id, apiKey: replaceKeyDraft.trim() },
                                      });
                                      setReplacingKeyId(null);
                                      setReplaceKeyDraft('');
                                    })
                                  }
                                >
                                  Save
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="bb-conn-picker__inline-form">
                        <div style={{ flex: 1 }}>
                          <Input
                            type="password"
                            placeholder="Add backup key..."
                            value={newBackupKeyDraft}
                            onChange={(e) => setNewBackupKeyDraft(e.target.value)}
                          />
                        </div>
                        <Button
                          variant="b2"
                          size="sm"
                          icon="plus"
                          disabled={!newBackupKeyDraft.trim() || isBusy}
                          onClick={() =>
                            runConnAction(conn.id, async () => {
                              await onUpdateConnection?.(conn.id, {
                                addKeys: newBackupKeyDraft.trim(),
                                makePreferred:
                                  (conn.keys || []).length === 0 || conn.aliveKeysCount === 0,
                              });
                              setNewBackupKeyDraft('');
                            })
                          }
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </OverlayScrollArea>
            </div>
          </div>,
          document.body,
        )}

      {openPane === 'model' &&
        activeConn &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="bb-conn-picker__overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpenPane(null);
            }}
          >
            <div
              ref={sheetRef}
              className={`bb-conn-picker__popover ${
                popoverPos.top !== null ? 'is-bottom' : ''
              }`.trim()}
              role="dialog"
              aria-label="Model Switcher"
              style={popoverVars}
            >
              <div className="bb-conn-picker__grabber" aria-hidden="true" />

              <div className="bb-conn-picker__header">
                <div className="bb-conn-picker__header-title-row">
                  <div className="bb-conn-picker__title-group">
                    <Icon name="sparkles" size={16} />
                    <span className="bb-conn-picker__header-title">Models</span>
                    <span className="bb-conn-picker__count">
                      {(activeConn.models || []).length}
                    </span>
                  </div>

                  <div className="bb-conn-picker__header-actions">
                    <button
                      type="button"
                      className="bb-conn-picker__hdr-btn"
                      disabled={busyConnId === activeConn.id}
                      title={`Refresh models from ${activeConn.name}`}
                      onClick={() =>
                        runConnAction(activeConn.id, async () => {
                          const res = await onFetchConnectionModels?.(activeConn.id);
                          if (res?.fetchedCount !== undefined) {
                            setFeedback({
                              type: 'ok',
                              text: `Loaded ${res.fetchedCount} models`,
                            });
                          }
                        })
                      }
                    >
                      <Icon name="refresh" size={13} />
                      <span>Sync</span>
                    </button>
                    <button
                      type="button"
                      className={`bb-conn-picker__hdr-btn ${addingCustomModel ? 'is-primary' : ''}`}
                      title="Add custom model ID"
                      onClick={() => setAddingCustomModel((v) => !v)}
                    >
                      <Icon name="plus" size={14} />
                      <span>ID</span>
                    </button>
                  </div>
                </div>

                {addingCustomModel && (
                  <div className="bb-conn-picker__inline-form">
                    <div style={{ flex: 1 }}>
                      <Input
                        placeholder="model-id or Name, model-id"
                        value={customModelDraft}
                        onChange={(e) => setCustomModelDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customModelDraft.trim()) {
                            e.preventDefault();
                            runConnAction(activeConn.id, async () => {
                              await onUpdateConnection?.(activeConn.id, {
                                addCustomModel: customModelDraft.trim(),
                              });
                              setCustomModelDraft('');
                              setAddingCustomModel(false);
                              setOpenPane(null);
                            });
                          }
                        }}
                      />
                    </div>
                    <Button
                      variant="b1"
                      size="sm"
                      emphasis="filled"
                      disabled={!customModelDraft.trim() || busyConnId === activeConn.id}
                      onClick={() =>
                        runConnAction(activeConn.id, async () => {
                          await onUpdateConnection?.(activeConn.id, {
                            addCustomModel: customModelDraft.trim(),
                          });
                          setCustomModelDraft('');
                          setAddingCustomModel(false);
                          setOpenPane(null);
                        })
                      }
                    >
                      Add
                    </Button>
                  </div>
                )}
              </div>

              <div className="bb-conn-picker__controls">
                <div className="bb-conn-picker__search-wrap">
                  <Icon name="search" size={16} className="bb-conn-picker__search-icon" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={modelQuery}
                    onChange={(e) => setModelQuery(e.target.value)}
                    placeholder={`Search models on ${activeConn.name}...`}
                    className="bb-conn-picker__search-input"
                  />
                  {modelQuery && (
                    <button
                      type="button"
                      className="bb-conn-picker__search-clear"
                      onClick={() => setModelQuery('')}
                      aria-label="Clear search"
                    >
                      <Icon name="close" size={15} />
                    </button>
                  )}
                </div>

                <ChipScrollStrip
                  trackClassName="bb-conn-picker__chips"
                  ariaLabel="Filter models by provider or family"
                >
                  <button
                    type="button"
                className={`bb-conn-picker__chip ${familyFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setFamilyFilter('all')}
              >
                All ({(activeConn.models || []).length})
              </button>
              <button
                type="button"
                className={`bb-conn-picker__chip ${familyFilter === 'starred' ? 'is-active' : ''}`}
                onClick={() => setFamilyFilter((f) => (f === 'starred' ? 'all' : 'starred'))}
              >
                <Icon name="starFilled" size={11} className="bb-conn-picker__star-icon" />
                <span>Pinned</span>
              </button>
              {availableFamilies.map((fam) => (
                <button
                  key={fam}
                  type="button"
                  className={`bb-conn-picker__chip ${familyFilter === fam ? 'is-active' : ''}`}
                  onClick={() => setFamilyFilter((f) => (f === fam ? 'all' : fam))}
                >
                  {FAMILY_LABELS[fam]}
                </button>
              ))}
              {mergedCustomFamilies.map((cf) => {
                const isAct = familyFilter === cf.id;
                return (
                  <button
                    key={cf.id}
                    type="button"
                    className={`bb-conn-picker__chip ${isAct ? 'is-active' : ''}`}
                    onClick={() => setFamilyFilter((f) => (f === cf.id ? 'all' : cf.id))}
                    title={`Filter by "${cf.match}"`}
                  >
                    <span>{cf.label}</span>
                    {isAct && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="bb-conn-picker__chip-del"
                        title={`Remove ${cf.label} filter`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFamilyFilter('all');
                          if (onDeleteCustomFamily) {
                            onDeleteCustomFamily(cf.id);
                          } else {
                            setLocalFamilies((prev) => prev.filter((x) => x.id !== cf.id));
                          }
                        }}
                      >
                        <Icon name="close" size={10} />
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                className={`bb-conn-picker__chip bb-conn-picker__chip--add ${
                  addingFamily ? 'is-active' : ''
                }`}
                title="Add new company / model family chip"
                onClick={() => setAddingFamily((v) => !v)}
              >
                <Icon name="plus" size={11} />
              </button>
                </ChipScrollStrip>

            {addingFamily && (
              <div className="bb-conn-picker__inline-form">
                <div style={{ flex: 1 }}>
                  <Input
                    placeholder="New company (e.g. Cohere, Kimi, StepFun)..."
                    value={newFamilyDraft}
                    onChange={(e) => setNewFamilyDraft(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && newFamilyDraft.trim()) {
                        e.preventDefault();
                        const label = newFamilyDraft.trim();
                        const id = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
                        if (onAddCustomFamily) {
                          await onAddCustomFamily({ label, match: label.toLowerCase() });
                        } else {
                          setLocalFamilies((prev) => [
                            ...prev.filter((x) => x.id !== id),
                            { id, label, match: label.toLowerCase() },
                          ]);
                        }
                        setFamilyFilter(id);
                        setNewFamilyDraft('');
                        setAddingFamily(false);
                      }
                    }}
                  />
                </div>
                <Button
                  variant="b1"
                  size="sm"
                  emphasis="filled"
                  disabled={!newFamilyDraft.trim()}
                  onClick={async () => {
                    const label = newFamilyDraft.trim();
                    const id = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
                    if (onAddCustomFamily) {
                      await onAddCustomFamily({ label, match: label.toLowerCase() });
                    } else {
                      setLocalFamilies((prev) => [
                        ...prev.filter((x) => x.id !== id),
                        { id, label, match: label.toLowerCase() },
                      ]);
                    }
                    setFamilyFilter(id);
                    setNewFamilyDraft('');
                    setAddingFamily(false);
                  }}
                >
                  Add
                </Button>
              </div>
            )}

            {feedback && (
              <div
                className={`bb-conn-picker__feedback ${
                  feedback.type === 'error' ? 'is-error' : ''
                }`}
              >
                {feedback.text}
              </div>
            )}
          </div>


          <OverlayScrollArea
            className="bb-conn-picker__scroll-wrap"
            viewportClassName="bb-conn-picker__scroll"
            variant="compact"
          >
            {starredActiveModels.length === 0 &&
            regularActiveModels.length === 0 &&
            otherProviderMatches.length === 0 ? (
              <div
                className="bb-caption-text"
                style={{ padding: '16px 10px', textAlign: 'center' }}
              >
                {(activeConn.models || []).length === 0
                  ? 'No models loaded yet. Refresh or add a custom model ID below.'
                  : 'No models match your filter.'}
              </div>
            ) : (
              <>
                {starredActiveModels.length > 0 && (
                  <>
                    <div className="bb-conn-picker__sec-label">
                      <span>★ Pinned on {activeConn.name}</span>
                    </div>
                    {starredActiveModels.map((m) => {
                      const isSel = m.id === activeModelId;
                      const isDown = m.availability === 'down';
                      const ctx = formatContextBadge(m.lockedContextLength, m.maxContextLength);
                      return (
                        <div
                          key={`star:${m.id}`}
                          className={`bb-conn-picker__model-row ${isSel ? 'is-selected' : ''} ${
                            isDown ? 'is-down' : ''
                          }`}
                        >
                          <button
                            type="button"
                            className="bb-conn-picker__model-btn"
                            title={m.id}
                            onClick={() => {
                              onSelectConnection?.(activeConn.id, m.id);
                              setOpenPane(null);
                            }}
                          >
                            {m.availability === 'down' && (
                              <span
                                className="bb-conn-picker__dot is-dead"
                                title="0 active keys in proxy pool"
                              />
                            )}
                            {m.availability === 'up' && (
                              <span
                                className="bb-conn-picker__dot is-ok"
                                title={
                                  typeof m.poolActiveKeys === 'number'
                                    ? `${m.poolActiveKeys} active keys in proxy pool`
                                    : 'Active on proxy'
                                }
                              />
                            )}
                            {isSel && <Icon name="check" size={13} />}
                            <span className="bb-conn-picker__model-name">{m.name || m.id}</span>
                          </button>

                          <div className="bb-conn-picker__model-meta">
                            {isDown && (
                              <span className="bb-conn-picker__dead-pill" title="0 active keys on proxy">
                                0 keys
                              </span>
                            )}
                            {ctx && (
                              <span
                                className="bb-conn-picker__badge"
                                title="Proxy locked / max context"
                              >
                                {ctx}
                              </span>
                            )}
                            {m.isManual && (
                              <button
                                type="button"
                                className="bb-conn-picker__action-btn is-danger"
                                title="Remove custom model"
                                onClick={() =>
                                  runConnAction(activeConn.id, () =>
                                    onUpdateConnection?.(activeConn.id, { removeCustomModel: m.id }),
                                  )
                                }
                              >
                                <Icon name="trash" size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="bb-conn-picker__star-btn is-starred"
                              title="Unpin from favorites"
                              onClick={() =>
                                onUpdateConnection?.(activeConn.id, { toggleStarModel: m.id })
                              }
                            >
                              <Icon name="starFilled" size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {starredActiveModels.length > 0 && regularActiveModels.length > 0 && (
                  <div className="bb-conn-picker__divider" />
                )}


                {regularActiveModels.map((m) => {
                  const isSel = m.id === activeModelId;
                  const isDown = m.availability === 'down';
                  const ctx = formatContextBadge(m.lockedContextLength, m.maxContextLength);
                  return (
                    <div
                      key={m.id}
                      className={`bb-conn-picker__model-row ${isSel ? 'is-selected' : ''} ${
                        isDown ? 'is-down' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="bb-conn-picker__model-btn"
                        title={m.id}
                        onClick={() => {
                          onSelectConnection?.(activeConn.id, m.id);
                          setOpenPane(null);
                        }}
                      >
                        {m.availability === 'down' && (
                          <span
                            className="bb-conn-picker__dot is-dead"
                            title="0 active keys in proxy pool"
                          />
                        )}
                        {m.availability === 'up' && (
                          <span
                            className="bb-conn-picker__dot is-ok"
                            title={
                              typeof m.poolActiveKeys === 'number'
                                ? `${m.poolActiveKeys} active keys in proxy pool`
                                : 'Active on proxy'
                            }
                          />
                        )}
                        {isSel && <Icon name="check" size={13} />}
                        <span className="bb-conn-picker__model-name">{m.name || m.id}</span>
                      </button>

                      <div className="bb-conn-picker__model-meta">
                        {isDown && (
                          <span className="bb-conn-picker__dead-pill" title="0 active keys on proxy">
                            0 keys
                          </span>
                        )}
                        {ctx && (
                          <span
                            className="bb-conn-picker__badge"
                            title="Proxy locked / max context"
                          >
                            {ctx}
                          </span>
                        )}
                        {m.isManual && (
                          <button
                            type="button"
                            className="bb-conn-picker__action-btn is-danger"
                            title="Remove custom model"
                            onClick={() =>
                              runConnAction(activeConn.id, () =>
                                onUpdateConnection?.(activeConn.id, { removeCustomModel: m.id }),
                              )
                            }
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="bb-conn-picker__star-btn"
                          title="Pin to favorites"
                          onClick={() =>
                            onUpdateConnection?.(activeConn.id, { toggleStarModel: m.id })
                          }
                        >
                          <Icon name="starOutline" size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {otherProviderMatches.map(({ conn, models }) => (
                  <React.Fragment key={`other:${conn.id}`}>
                    <div className="bb-conn-picker__divider" />
                    <div className="bb-conn-picker__sec-label">
                      <span>On {conn.name}</span>
                      <span>Switch provider + model</span>
                    </div>
                    {models.map((m) => (
                      <div key={`${conn.id}:${m.id}`} className="bb-conn-picker__model-row">
                        <button
                          type="button"
                          className="bb-conn-picker__model-btn"
                          title={`${conn.name} — ${m.id}`}
                          onClick={() => {
                            onSelectConnection?.(conn.id, m.id);
                            setOpenPane(null);
                          }}
                        >
                          <span className="bb-conn-picker__model-name">{m.name || m.id}</span>
                        </button>
                        <div className="bb-conn-picker__model-meta">
                          {m.starred && (
                            <Icon
                              name="starFilled"
                              size={12}
                              className="bb-conn-picker__star-icon"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </>
            )}
          </OverlayScrollArea>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

