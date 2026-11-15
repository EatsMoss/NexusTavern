import { useSyncExternalStore } from 'react';

/**
 * Lightweight reactive external store holding the currently active Regex stack
 * for client-side Display (`markdownOnly`) message & Chain-of-Thought rendering.
 *
 * Avoids prop-drilling through AppShell -> ChatViewport -> ChatMessageCard -> MessageDecorator
 * while re-rendering visible messages in a single frame whenever a rule is toggled or edited.
 */

let snapshot = {
  masterEnabled: true,
  globalScripts: [],
  presetScripts: [],
  cardScripts: [],
  combinedScripts: [],
  version: 0,
};

const listeners = new Set();

function emitChange() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

export function subscribeRegexDisplayStore(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRegexDisplaySnapshot() {
  return snapshot;
}

export function setRegexDisplayState(patch = {}) {
  const nextMaster =
    typeof patch.masterEnabled === 'boolean' ? patch.masterEnabled : snapshot.masterEnabled;
  const nextGlobal = Array.isArray(patch.globalScripts)
    ? patch.globalScripts
    : snapshot.globalScripts;
  const nextPreset = Array.isArray(patch.presetScripts)
    ? patch.presetScripts
    : snapshot.presetScripts;
  const nextCard = Array.isArray(patch.cardScripts) ? patch.cardScripts : snapshot.cardScripts;

  const combinedScripts = nextMaster
    ? [...nextGlobal, ...nextPreset, ...nextCard]
    : [];

  snapshot = {
    masterEnabled: nextMaster,
    globalScripts: nextGlobal,
    presetScripts: nextPreset,
    cardScripts: nextCard,
    combinedScripts,
    version: snapshot.version + 1,
  };
  emitChange();
}

export function useRegexDisplayStore() {
  return useSyncExternalStore(
    subscribeRegexDisplayStore,
    getRegexDisplaySnapshot,
    getRegexDisplaySnapshot,
  );
}
