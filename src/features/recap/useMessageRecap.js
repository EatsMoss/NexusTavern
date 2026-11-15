import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchMessageRecapState,
  updateMessageRecapState,
  resetMessageRecapState,
} from '@core/recap/recapApi.js';
import { normalizeRecapConfig } from '@core/recap/recapEngine.js';

const SAVE_DEBOUNCE_MS = 350;

export function useMessageRecap({ onNotify } = {}) {
  const [config, setConfig] = useState(() => normalizeRecapConfig(null));
  const pendingPatchRef = useRef({});
  const debounceTimerRef = useRef(null);

  const syncRecapConfig = useCallback(async () => {
    try {
      const res = await fetchMessageRecapState();
      if (res?.ok && res.config) {
        setConfig(normalizeRecapConfig(res.config));
      }
    } catch {
      // background sync fallback
    }
  }, []);

  useEffect(() => {
    syncRecapConfig();
  }, [syncRecapConfig]);

  const flushPendingPatch = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (!patch || Object.keys(patch).length === 0) return;

    try {
      const res = await updateMessageRecapState(patch);
      if (res?.config) {
        setConfig(normalizeRecapConfig(res.config));
      }
    } catch (err) {
      onNotify?.(err?.message || 'Failed to save Message Recap settings', 'error');
      syncRecapConfig();
    }
  }, [onNotify, syncRecapConfig]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handlePatchConfig = useCallback(
    (patch = {}, { immediate = false } = {}) => {
      if (!patch || typeof patch !== 'object') return;
      setConfig((prev) => normalizeRecapConfig({ ...prev, ...patch }));
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };

      if (immediate) {
        flushPendingPatch();
        return;
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        flushPendingPatch();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushPendingPatch],
  );

  const handleResetDefaults = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingPatchRef.current = {};
    try {
      const res = await resetMessageRecapState();
      if (res?.config) {
        setConfig(normalizeRecapConfig(res.config));
        onNotify?.('Restored default Message Recap prompts & regex', 'info');
      }
    } catch (err) {
      onNotify?.(err?.message || 'Failed to reset Message Recap defaults', 'error');
      syncRecapConfig();
    }
  }, [onNotify, syncRecapConfig]);

  const handleImportConfig = useCallback(
    async (importedConfig) => {
      const normalized = normalizeRecapConfig(importedConfig);
      setConfig(normalized);
      pendingPatchRef.current = {};
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      try {
        const res = await updateMessageRecapState(normalized);
        if (res?.config) {
          setConfig(normalizeRecapConfig(res.config));
        }
        onNotify?.('Imported Message Recap configuration', 'info');
      } catch (err) {
        onNotify?.(err?.message || 'Failed to import Message Recap configuration', 'error');
        syncRecapConfig();
      }
    },
    [onNotify, syncRecapConfig],
  );

  return {
    config,
    handlePatchConfig,
    handleResetDefaults,
    handleImportConfig,
    syncRecapConfig,
  };
}
