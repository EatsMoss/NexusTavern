import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Button } from '@ui/atoms/Button/Button.jsx';
import { SearchInput } from '@ui/atoms/Input/Input.jsx';
import { OverlayScrollArea } from '@ui/atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import { ChipScrollStrip } from '@ui/molecules/ChipScrollStrip/ChipScrollStrip.jsx';
import { ConsoleEntryCard } from './ConsoleEntryCard.jsx';
import {
  CONSOLE_FILTERS,
  matchesConsoleFilter,
  matchesConsoleQuery,
  formatEntryForClipboard,
  copyConsoleText,
} from './consoleFormatters.js';
import './ConsoleDrawer.css';

const HEIGHT_STORAGE_KEY = 'bb_console_drawer_height_v1';
const MIN_HEIGHT = 170;
const DEFAULT_HEIGHT = 300;

function readInitialHeight(defaultHeight) {
  if (typeof window === 'undefined') return defaultHeight;
  try {
    const saved = Number(window.localStorage.getItem(HEIGHT_STORAGE_KEY));
    if (Number.isFinite(saved) && saved >= MIN_HEIGHT && saved <= 900) {
      return saved;
    }
  } catch {
    // ignore storage restrictions
  }
  return defaultHeight;
}

/**
 * Clean borderless/backgroundless M3 Console Trigger Icon Button (matches 30px chip row height).
 */
export function ConsoleToggleButton({
  open = false,
  onClick,
  label = '',
  title = 'Toggle SillyTavern-parity live output console',
  className = '',
}) {
  const iconOnly = !label;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label || 'Toggle output console'}
      aria-expanded={open}
      className={[
        'bb-console-toggle-btn',
        iconOnly ? 'bb-console-toggle-btn--icon-only' : '',
        open ? 'is-active' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon name="terminal" size={17} />
      {label && <span>{label}</span>}
    </button>
  );
}

/**
 * M3 Docked Console Drawer Organism (Pure Material You Solid Sheet).
 * Renders separated, labeled LLM Prompt / Output / Workspace Change / System / Error blocks.
 */
export function ConsoleDrawer({
  open = false,
  entries = [],
  connected = true,
  embedded = false,
  resizable = true,
  defaultHeight = DEFAULT_HEIGHT,
  onClear,
  onClose,
  className = '',
}) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedAll, setCopiedAll] = useState(false);
  const [height, setHeight] = useState(() => readInitialHeight(defaultHeight));
  const [resizing, setResizing] = useState(false);

  const viewportRef = useRef(null);
  const dragStateRef = useRef(null);

  const countsByFilter = useMemo(() => {
    const counts = {
      all: entries.length,
      prompt: 0,
      output: 0,
      change: 0,
      system: 0,
      error: 0,
    };
    for (const item of entries) {
      if (!item) continue;
      if (item.category in counts && item.category !== 'error') {
        counts[item.category] += 1;
      }
      if (item.category === 'error' || item.level === 'error' || item.level === 'warn') {
        counts.error += 1;
      }
    }
    return counts;
  }, [entries]);

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (item) => matchesConsoleFilter(item, activeFilter) && matchesConsoleQuery(item, query),
      ),
    [entries, activeFilter, query],
  );

  useEffect(() => {
    if (!open || !autoScroll) return;
    const el = viewportRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, autoScroll, filteredEntries.length]);

  const handleViewportScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom > 48 && autoScroll) {
      setAutoScroll(false);
    } else if (distFromBottom <= 16 && !autoScroll) {
      setAutoScroll(true);
    }
  }, [autoScroll]);

  const handleResizePointerDown = useCallback(
    (e) => {
      if (!resizable) return;
      e.preventDefault();
      dragStateRef.current = {
        startY: e.clientY,
        startHeight: height,
      };
      setResizing(true);

      const handleMove = (moveEvt) => {
        if (!dragStateRef.current) return;
        const delta = dragStateRef.current.startY - moveEvt.clientY;
        const maxAllowed = Math.max(MIN_HEIGHT, Math.round(window.innerHeight * 0.62));
        const next = Math.min(
          maxAllowed,
          Math.max(MIN_HEIGHT, Math.round(dragStateRef.current.startHeight + delta)),
        );
        setHeight(next);
      };

      const handleUp = () => {
        setResizing(false);
        dragStateRef.current = null;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);
    },
    [resizable, height],
  );

  useEffect(() => {
    if (resizing || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(HEIGHT_STORAGE_KEY, String(height));
    } catch {
      // ignore
    }
  }, [height, resizing]);

  const handleCopyAll = async () => {
    if (filteredEntries.length === 0) return;
    const dump = filteredEntries.map(formatEntryForClipboard).join('\n\n');
    const ok = await copyConsoleText(dump);
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    }
  };

  if (!open) return null;

  return (
    <section
      aria-label="Live Output Console"
      style={{ '--bb-console-height': `${height}px` }}
      className={[
        'bb-console-drawer',
        embedded ? 'bb-console-drawer--embedded' : '',
        resizing ? 'is-resizing' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {resizable && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize console height"
          title="Drag to resize console height"
          className="bb-console-drawer__resizer"
          onPointerDown={handleResizePointerDown}
        >
          <span className="bb-console-drawer__grabber" />
        </div>
      )}

      <header className="bb-console-drawer__header">
        <div className="bb-console-drawer__top-bar">
          <div className="bb-console-drawer__brand">
            <Icon name="terminal" size={16} className="bb-console-drawer__brand-icon" />
            <span className="bb-console-drawer__title">Console</span>
            <span className="bb-console-drawer__count">{filteredEntries.length}</span>
            <span className="bb-console-drawer__live-pill">
              <span
                className={`bb-console-drawer__live-dot ${!connected ? 'is-offline' : ''}`}
              />
              <span>{connected ? 'Live' : 'Reconnecting'}</span>
            </span>
          </div>

          <div className="bb-console-drawer__toolbar-right">
            <SearchInput
              size="sm"
              value={query}
              onChange={setQuery}
              placeholder="Search prompts, outputs, logs..."
              className="bb-console-drawer__search"
            />
            <Button
              variant="b2"
              size="sm"
              active={autoScroll}
              icon="doubleChevronDown"
              title={
                autoScroll
                  ? 'Auto-scroll to latest output is ON'
                  : 'Click to resume auto-scroll to latest output'
              }
              aria-label="Toggle auto-scroll"
              onClick={() => {
                setAutoScroll((v) => !v);
                if (!autoScroll && viewportRef.current) {
                  viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
                }
              }}
            />
            <Button
              variant="b2"
              size="sm"
              active={copiedAll}
              disabled={filteredEntries.length === 0}
              icon={copiedAll ? 'check' : 'copy'}
              title={copiedAll ? 'Copied all visible outputs!' : 'Copy visible console outputs'}
              aria-label="Copy visible console outputs"
              onClick={handleCopyAll}
            />
            {onClear && (
              <Button
                variant="b2"
                size="sm"
                disabled={entries.length === 0}
                icon="trash"
                title="Clear console output"
                aria-label="Clear console output"
                onClick={onClear}
              />
            )}
            {onClose && (
              <Button
                variant="b2"
                size="sm"
                icon="close"
                title="Close console"
                aria-label="Close console"
                onClick={onClose}
              />
            )}
          </div>
        </div>

        <ChipScrollStrip
          fadeBg="var(--bb-sheet-header-bg, #18181e)"
          trackClassName="bb-console-drawer__chips"
          ariaLabel="Filter console outputs by category"
        >
          {CONSOLE_FILTERS.map((f) => {
            const isAct = activeFilter === f.id;
            const count = countsByFilter[f.id] ?? 0;
            return (
              <button
                key={f.id}
                type="button"
                className={`bb-console-chip ${isAct ? 'is-active' : ''}`}
                onClick={() => setActiveFilter(f.id)}
              >
                <span>{f.label}</span>
                <span className="bb-console-chip__num">{count}</span>
              </button>
            );
          })}
        </ChipScrollStrip>
      </header>

      <OverlayScrollArea
        ref={viewportRef}
        className="bb-console-drawer__well"
        viewportClassName="bb-console-drawer__viewport"
        watchValue={filteredEntries}
        onScroll={handleViewportScroll}
      >
        {filteredEntries.length === 0 ? (
          <div className="bb-console-drawer__empty">
            <Icon name="terminal" size={22} />
            <span>
              {entries.length === 0
                ? 'Console is ready. Send a prompt, switch models, or edit workspace settings to inspect structured output.'
                : 'No console outputs match the active filter or search query.'}
            </span>
          </div>
        ) : (
          <div className="bb-console-drawer__stream">
            {filteredEntries.map((entry) => (
              <ConsoleEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </OverlayScrollArea>
    </section>
  );
}
