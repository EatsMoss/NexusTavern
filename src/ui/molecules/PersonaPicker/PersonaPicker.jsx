import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Button } from '@ui/atoms/Button/Button.jsx';
import { SafeImage } from '@ui/atoms/SafeImage/SafeImage.jsx';
import { OverlayScrollArea } from '@ui/atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import { PersonaChip } from '@ui/molecules/PersonaChip/PersonaChip.jsx';
import './PersonaPicker.css';

function buildSnippet(text = '') {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  return clean.length > 76 ? `${clean.slice(0, 76)}…` : clean;
}

function resolveLinkedStackItems(persona, cardsByAvatar, groupsById) {
  const conns = Array.isArray(persona?.connections) ? persona.connections : [];
  if (conns.length === 0) return [];
  const items = [];
  const seen = new Set();

  for (const conn of conns) {
    if (!conn || !conn.id) continue;
    if (conn.type === 'group') {
      const gid = String(conn.id);
      if (seen.has(`g:${gid}`)) continue;
      const grp = groupsById.get(gid);
      if (grp) {
        seen.add(`g:${gid}`);
        items.push({
          id: `g:${gid}`,
          name: grp.name || 'Group',
          avatarUrl: grp.avatarUrl || null,
          title: `Linked group: ${grp.name || 'Group'}`,
        });
      }
    } else {
      const rawId = String(conn.id);
      const card =
        cardsByAvatar.get(rawId) ||
        cardsByAvatar.get(`${rawId}.png`) ||
        cardsByAvatar.get(`${rawId}.json`);
      if (card) {
        const key = `c:${card.avatar || card.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          id: key,
          name: card.name || rawId,
          avatarUrl: card.thumbnailUrl || card.avatarUrl || null,
          title: `Linked character: ${card.name || rawId}`,
        });
      }
    }
  }

  return items;
}

export function PersonaPicker({
  personas = [],
  activePersonaAvatar = '',
  personaName = 'User',
  personaAvatarUrl = null,
  cards = [],
  groups = [],
  activeCharacter = null,
  hasUserMessages = false,
  userMessageCount = 0,
  disabled = false,
  onSelectPersona,
  onConfirmReplacePersonaInChat,
  onToggleBindActiveCharacter,
  onOpenManageModal,
  onOpenCreateModal,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingTarget, setPendingTarget] = useState(null);
  const [busyConfirm, setBusyConfirm] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ left: 0, bottom: 0, width: 420 });

  const wrapRef = useRef(null);
  const popoverRef = useRef(null);
  const searchInputRef = useRef(null);

  const cardsByAvatar = useMemo(() => {
    const map = new Map();
    for (const c of cards || []) {
      if (!c) continue;
      if (c.avatar) map.set(c.avatar, c);
      if (c.id) map.set(c.id, c);
      if (c.avatar) {
        map.set(c.avatar.replace(/\.(png|json)$/i, ''), c);
      }
    }
    return map;
  }, [cards]);

  const groupsById = useMemo(() => {
    const map = new Map();
    for (const g of groups || []) {
      if (g && g.id !== undefined && g.id !== null) {
        map.set(String(g.id), g);
      }
    }
    return map;
  }, [groups]);

  const activeCharAvatar = activeCharacter?.avatar || activeCharacter?.id || '';
  const isRealChar = Boolean(
    activeCharAvatar && !/^(?:c\d+|c_\d+)$/.test(String(activeCharAvatar)),
  );
  const activeCharStem = isRealChar
    ? String(activeCharAvatar).replace(/\.(png|json)$/i, '')
    : '';
  const activeCharImg =
    activeCharacter?.thumbnailUrl || activeCharacter?.avatarUrl || null;

  const filteredPersonas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return personas;
    return personas.filter((p) => {
      const hay = `${p.name || ''} ${p.title || ''} ${p.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [personas, query]);

  const updatePosition = useCallback(() => {
    if (!wrapRef.current || typeof window === 'undefined') return;
    if (window.innerWidth <= 640) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 24);
    let left = rect.right - width;
    if (left < 12) left = 12;
    if (left + width > window.innerWidth - 12) {
      left = window.innerWidth - width - 12;
    }
    const bottom = Math.max(12, window.innerHeight - rect.top + 10);
    setPopoverPos({ left: Math.round(left), bottom: Math.round(bottom), width });
  }, []);

  const closePicker = useCallback(() => {
    setOpen(false);
    setPendingTarget(null);
    setQuery('');
  }, []);

  const handleToggleOpen = () => {
    if (disabled) return;
    if (open) {
      closePicker();
      return;
    }
    updatePosition();
    setPendingTarget(null);
    setQuery('');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();

    const onPointerDown = (e) => {
      const target = e.target;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      closePicker();
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (pendingTarget) {
          setPendingTarget(null);
        } else {
          closePicker();
        }
      }
    };

    window.addEventListener('resize', updatePosition);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, pendingTarget, updatePosition, closePicker]);

  useEffect(() => {
    if (
      open &&
      !pendingTarget &&
      personas.length >= 6 &&
      typeof window !== 'undefined' &&
      window.innerWidth > 600
    ) {
      const id = requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [open, pendingTarget, personas.length]);

  const handlePickRow = async (persona) => {
    if (!persona) return;
    if (persona.avatar === activePersonaAvatar) {
      closePicker();
      return;
    }
    if (hasUserMessages && userMessageCount > 0) {
      setPendingTarget(persona);
      return;
    }
    await onSelectPersona?.(persona.avatar);
    closePicker();
  };

  const handleConfirmReplace = async () => {
    if (!pendingTarget || busyConfirm) return;
    setBusyConfirm(true);
    try {
      await onConfirmReplacePersonaInChat?.(pendingTarget);
      closePicker();
    } finally {
      setBusyConfirm(false);
    }
  };

  const renderPopoverContent = () => (
    <div
      className="bb-persona-picker__overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) closePicker();
      }}
    >
      <div
        ref={popoverRef}
        className="bb-persona-picker__sheet"
        role="dialog"
        aria-label="Switch Persona"
        style={{
          '--bb-pp-left': `${popoverPos.left}px`,
          '--bb-pp-bottom': `${popoverPos.bottom}px`,
          '--bb-pp-width': `${popoverPos.width}px`,
        }}
      >
        <div className="bb-persona-picker__grabber" aria-hidden="true" />

        <div className="bb-persona-picker__header">
          <div className="bb-persona-picker__title-group">
            <Icon name="user" size={15} />
            <span className="bb-persona-picker__title">Personas</span>
            <span className="bb-persona-picker__count">{personas.length}</span>
          </div>

          <div className="bb-persona-picker__header-actions">
            <button
              type="button"
              className="bb-persona-picker__hdr-btn is-primary"
              title="Create new persona"
              onClick={() => {
                closePicker();
                onOpenCreateModal?.();
              }}
            >
              <Icon name="plus" size={14} />
              <span>New</span>
            </button>
          </div>
        </div>

        {pendingTarget ? (
          <div className="bb-persona-picker__confirm">
            <div className="bb-persona-picker__confirm-swap">
              <div className="bb-persona-picker__swap-pill">
                <SafeImage
                  src={personaAvatarUrl}
                  alt=""
                  className="bb-persona-picker__swap-img"
                  fallback={
                    <span className="bb-persona-picker__swap-fallback">
                      {String(personaName || 'ME').slice(0, 2).toUpperCase()}
                    </span>
                  }
                />
                <span className="bb-persona-picker__swap-name">{personaName}</span>
              </div>

              <Icon name="arrowRight" size={15} className="bb-persona-picker__swap-arrow" />

              <div className="bb-persona-picker__swap-pill is-target">
                <SafeImage
                  src={pendingTarget.thumbnailUrl || pendingTarget.avatarUrl}
                  alt=""
                  className="bb-persona-picker__swap-img"
                  fallback={
                    <span className="bb-persona-picker__swap-fallback">
                      {String(pendingTarget.name || 'ME').slice(0, 2).toUpperCase()}
                    </span>
                  }
                />
                <span className="bb-persona-picker__swap-name">{pendingTarget.name}</span>
              </div>
            </div>

            <div className="bb-persona-picker__confirm-text">
              <strong>Replace persona in this chat?</strong>
              <span>
                Updates active persona and sender across{' '}
                <strong>
                  {userMessageCount} user message{userMessageCount === 1 ? '' : 's'}
                </strong>{' '}
                to <strong>{pendingTarget.name}</strong>.
              </span>
            </div>

            <div className="bb-persona-picker__confirm-actions">
              <Button
                variant="b2"
                size="sm"
                disabled={busyConfirm}
                onClick={() => setPendingTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="b1"
                emphasis="filled"
                size="sm"
                icon="check"
                disabled={busyConfirm}
                onClick={handleConfirmReplace}
              >
                {busyConfirm ? 'Updating...' : 'Replace in Chat'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {(personas.length >= 3 || query.length > 0) && (
              <div className="bb-persona-picker__search-wrap">
                <Icon name="search" size={16} className="bb-persona-picker__search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search personas..."
                  className="bb-persona-picker__search-input"
                />
                {query && (
                  <button
                    type="button"
                    className="bb-persona-picker__search-clear"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                  >
                    <Icon name="close" size={15} />
                  </button>
                )}
              </div>
            )}

            <OverlayScrollArea
              className="bb-persona-picker__list-wrap"
              viewportClassName="bb-persona-picker__list"
              variant="compact"
              role="listbox"
            >
              {filteredPersonas.length === 0 ? (
                <div className="bb-persona-picker__empty">No matching personas found.</div>
              ) : (
                filteredPersonas.map((p) => {
                  const isSelected = p.avatar === activePersonaAvatar;
                  const avatarSrc = p.thumbnailUrl || p.avatarUrl || null;
                  const initials = String(p.name || 'ME').trim().slice(0, 2).toUpperCase() || 'ME';
                  const snippet = buildSnippet(p.description);
                  const linkedStack = resolveLinkedStackItems(p, cardsByAvatar, groupsById);
                  const isRowLinkedToActive = Boolean(
                    isRealChar &&
                      (p.connections || []).some(
                        (c) =>
                          c &&
                          c.type === 'character' &&
                          (c.id === activeCharAvatar || c.id === activeCharStem),
                      ),
                  );
                  const leadLinkedItem = isRowLinkedToActive
                    ? {
                        name: activeCharacter?.name || 'Scenario',
                        avatarUrl: activeCharImg,
                      }
                    : linkedStack[0] || null;
                  const extraLinksCount = Math.max(0, linkedStack.length - 1);

                  return (
                    <div
                      key={p.avatar}
                      className={`bb-persona-picker__row ${isSelected ? 'is-selected' : ''}`}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className="bb-persona-picker__row-main"
                        onClick={() => handlePickRow(p)}
                      >
                        <span className="bb-persona-picker__avatar">
                          <SafeImage
                            src={avatarSrc}
                            alt=""
                            loading="lazy"
                            draggable={false}
                            className="bb-persona-picker__avatar-img"
                            fallback={
                              <span className="bb-persona-picker__avatar-initials">{initials}</span>
                            }
                          />
                          {isSelected && (
                            <span className="bb-persona-picker__avatar-check" aria-hidden="true">
                              <Icon name="check" size={11} />
                            </span>
                          )}
                        </span>

                        <span className="bb-persona-picker__info">
                          <span className="bb-persona-picker__name-line">
                            <span className="bb-persona-picker__name">{p.name}</span>
                            {p.title && (
                              <span className="bb-persona-picker__role-badge">{p.title}</span>
                            )}
                          </span>
                          {snippet && (
                            <span className="bb-persona-picker__snippet">{snippet}</span>
                          )}
                        </span>
                      </button>

                      <div className="bb-persona-picker__row-tail">
                        {(isRealChar || leadLinkedItem) && (
                          <button
                            type="button"
                            disabled={!isRealChar || !onToggleBindActiveCharacter}
                            className={[
                              'bb-persona-picker__action-btn',
                              'bb-persona-picker__link-btn',
                              leadLinkedItem ? 'has-linked-avatar' : '',
                              isRowLinkedToActive ? 'is-linked-current' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            title={
                              isRowLinkedToActive
                                ? `Linked to ${activeCharacter?.name || 'current scenario'} (click to unlink)`
                                : leadLinkedItem
                                  ? `Linked to ${linkedStack.map((i) => i.name).join(', ')}${
                                      isRealChar
                                        ? ` — click to also link ${activeCharacter?.name || 'current scenario'}`
                                        : ''
                                    }`
                                  : `Link ${p.name} to ${activeCharacter?.name || 'current scenario'}`
                            }
                            aria-label={
                              isRowLinkedToActive
                                ? `Unlink ${p.name} from ${activeCharacter?.name || 'scenario'}`
                                : `Link ${p.name} to ${activeCharacter?.name || 'scenario'}`
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isRealChar && onToggleBindActiveCharacter) {
                                onToggleBindActiveCharacter(p.avatar, !isRowLinkedToActive);
                              }
                            }}
                          >
                            {leadLinkedItem ? (
                              <span className="bb-persona-picker__linked-badge">
                                <SafeImage
                                  src={leadLinkedItem.avatarUrl}
                                  alt=""
                                  draggable={false}
                                  className="bb-persona-picker__linked-img"
                                  fallback={
                                    <span className="bb-persona-picker__linked-initials">
                                      {String(leadLinkedItem.name || 'CH')
                                        .slice(0, 2)
                                        .toUpperCase()}
                                    </span>
                                  }
                                />
                                {extraLinksCount > 0 && (
                                  <span className="bb-persona-picker__linked-more">
                                    +{extraLinksCount}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <Icon name="link" size={16} />
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          className="bb-persona-picker__action-btn bb-persona-picker__edit-btn"
                          title={`Edit ${p.name}`}
                          aria-label={`Edit ${p.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            closePicker();
                            onOpenManageModal?.(p.avatar);
                          }}
                        >
                          <Icon name="edit" size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </OverlayScrollArea>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} className={`bb-persona-picker ${open ? 'is-open' : ''}`}>
      <PersonaChip
        name={personaName}
        avatarUrl={personaAvatarUrl}
        title="Switch or manage personas"
        disabled={disabled}
        onClick={handleToggleOpen}
      />
      {open && typeof document !== 'undefined'
        ? createPortal(renderPopoverContent(), document.body)
        : null}
    </div>
  );
}

