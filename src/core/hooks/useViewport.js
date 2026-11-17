import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  COMPACT_MAX_WIDTH,
  MEDIUM_MAX_WIDTH,
  EXPANDED_SINGLE_MIN_WIDTH,
  DEFAULT_EXPANDED_DUAL_MIN_WIDTH,
  SHORT_VIEWPORT_MAX_HEIGHT,
  KEYBOARD_OPEN_THRESHOLD_PX,
  computeDualTomeMinWidth,
  resolveLayoutMode,
  computeViewportSnapshot,
  snapshotsEqual,
} from './viewportMath.js';

export {
  COMPACT_MAX_WIDTH,
  MEDIUM_MAX_WIDTH,
  EXPANDED_SINGLE_MIN_WIDTH,
  DEFAULT_EXPANDED_DUAL_MIN_WIDTH,
  SHORT_VIEWPORT_MAX_HEIGHT,
  KEYBOARD_OPEN_THRESHOLD_PX,
  computeDualTomeMinWidth,
  resolveLayoutMode,
  computeViewportSnapshot,
};

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'radio',
  'range',
  'submit',
  'reset',
  'file',
  'color',
]);

function isEditableElementFocused(doc) {
  const el = doc?.activeElement;
  if (!el) return false;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    return !NON_TEXT_INPUT_TYPES.has(String(el.type || 'text').toLowerCase());
  }
  return Boolean(el.isContentEditable);
}

const SERVER_SNAPSHOT = Object.freeze(computeViewportSnapshot());

let cachedSnapshot = null;
const listeners = new Set();
let teardownGlobalListeners = null;

function readBrowserSnapshot() {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;
  const vv = window.visualViewport;
  const coarseMql =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse), (hover: none)')
      : null;

  return computeViewportSnapshot({
    width: window.innerWidth,
    height: window.innerHeight,
    visualHeight: vv ? vv.height : window.innerHeight,
    visualOffsetTop: vv ? vv.offsetTop : 0,
    isCoarsePointer: Boolean(coarseMql?.matches),
    editableFocused: typeof document !== 'undefined' ? isEditableElementFocused(document) : false,
  });
}

function syncRootViewportAttributes(snap) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  root.setAttribute('data-layout-mode', snap.layoutMode);
  if (snap.isShortViewport) root.setAttribute('data-short-viewport', 'true');
  else root.removeAttribute('data-short-viewport');

  if (snap.isKeyboardOpen) root.setAttribute('data-keyboard-open', 'true');
  else root.removeAttribute('data-keyboard-open');

  if (snap.isCoarsePointer) root.setAttribute('data-coarse-pointer', 'true');
  else root.removeAttribute('data-coarse-pointer');

  root.style.setProperty('--bb-visual-viewport-height', `${snap.visualHeight}px`);
  root.style.setProperty('--bb-keyboard-inset', `${snap.keyboardInset}px`);
}

function ensureGlobalViewportStore() {
  if (typeof window === 'undefined') return;
  if (cachedSnapshot === null) {
    cachedSnapshot = readBrowserSnapshot();
    syncRootViewportAttributes(cachedSnapshot);
  }
  if (teardownGlobalListeners) return;

  let rafId = null;
  const scheduleUpdate = () => {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      const next = readBrowserSnapshot();
      if (!snapshotsEqual(cachedSnapshot, next)) {
        cachedSnapshot = next;
        syncRootViewportAttributes(next);
        listeners.forEach((fn) => fn());
      }
    });
  };

  const vv = window.visualViewport;
  const coarseMql =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse), (hover: none)')
      : null;

  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', scheduleUpdate, { passive: true });
  document.addEventListener('focusin', scheduleUpdate, true);
  document.addEventListener('focusout', scheduleUpdate, true);
  vv?.addEventListener('resize', scheduleUpdate, { passive: true });
  vv?.addEventListener('scroll', scheduleUpdate, { passive: true });
  coarseMql?.addEventListener?.('change', scheduleUpdate);

  teardownGlobalListeners = () => {
    window.removeEventListener('resize', scheduleUpdate);
    window.removeEventListener('orientationchange', scheduleUpdate);
    document.removeEventListener('focusin', scheduleUpdate, true);
    document.removeEventListener('focusout', scheduleUpdate, true);
    vv?.removeEventListener('resize', scheduleUpdate);
    vv?.removeEventListener('scroll', scheduleUpdate);
    coarseMql?.removeEventListener?.('change', scheduleUpdate);
    if (rafId !== null) window.cancelAnimationFrame(rafId);
    teardownGlobalListeners = null;
  };
}

function subscribeViewport(listener) {
  ensureGlobalViewportStore();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && teardownGlobalListeners) {
      teardownGlobalListeners();
    }
  };
}

function getViewportSnapshot() {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;
  if (cachedSnapshot === null) {
    cachedSnapshot = readBrowserSnapshot();
    syncRootViewportAttributes(cachedSnapshot);
  }
  return cachedSnapshot;
}

export function useViewport(options = undefined) {
  const base = useSyncExternalStore(
    subscribeViewport,
    getViewportSnapshot,
    () => SERVER_SNAPSHOT,
  );

  const customChatWidth = options?.chatColumnMaxWidth;
  const resolvedLayoutMode = useMemo(() => {
    if (customChatWidth === undefined || customChatWidth === null) {
      return base.layoutMode;
    }
    return resolveLayoutMode(base.width, customChatWidth);
  }, [base.layoutMode, base.width, customChatWidth]);

  useEffect(() => {
    if (customChatWidth === undefined || customChatWidth === null) return;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-layout-mode', resolvedLayoutMode);
    }
  }, [customChatWidth, resolvedLayoutMode]);

  return resolvedLayoutMode === base.layoutMode
    ? base
    : { ...base, layoutMode: resolvedLayoutMode };
}

