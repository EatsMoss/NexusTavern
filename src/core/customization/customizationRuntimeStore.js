/**
 * Lightweight external store for runtime customization flags read by leaf UI
 * molecules (such as `MessageDecorator`) and hooks without prop-drilling through
 * memoized chat lists.
 */

import { DEFAULT_CUSTOMIZATION_CONFIG } from './customizationDefaults.js';

let currentSnapshot = DEFAULT_CUSTOMIZATION_CONFIG;
const listeners = new Set();

export function publishCustomizationRuntime(nextConfig) {
  if (!nextConfig || nextConfig === currentSnapshot) return;
  currentSnapshot = nextConfig;
  listeners.forEach((fn) => fn());
}

export function getCustomizationRuntimeSnapshot() {
  return currentSnapshot;
}

export function subscribeCustomizationRuntime(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Plays a gentle two-note harmonic chime using the Web Audio API (zero external
 * audio asset files). Respects `soundOnlyWhenUnfocused`.
 */
export function maybePlayCompletionChime(chatAndAi) {
  if (!chatAndAi?.playCompletionSound || typeof window === 'undefined') return;
  if (
    chatAndAi.soundOnlyWhenUnfocused &&
    typeof document !== 'undefined' &&
    document.hasFocus?.() &&
    document.visibilityState === 'visible'
  ) {
    return;
  }

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playNote = (freq, startOffset, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.075, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    playNote(587.33, 0, 0.22); // D5
    playNote(880.0, 0.11, 0.34); // A5
    setTimeout(() => {
      ctx.close?.().catch(() => {});
    }, 650);
  } catch {
    // Ignore autoplay restriction errors
  }
}
