import { useState, useEffect, useCallback } from 'react';
import {
  fetchRefusalCatcherState,
  updateRefusalCatcherState,
  addRefusalBannedPhrase,
  removeRefusalBannedPhrase,
} from '@core/refusal/refusalApi.js';
import {
  normalizeRefusalConfig,
  normalizeForRefusalMatch,
} from '@core/refusal/refusalEngine.js';

export function useRefusalCatcher({
  connections = [],
  activeConnectionId = '',
  activeModelId = '',
  onNotify,
} = {}) {
  const [config, setConfig] = useState(() => normalizeRefusalConfig(null));

  const syncRefusalConfig = useCallback(async () => {
    try {
      const res = await fetchRefusalCatcherState();
      if (res?.ok && res.config) {
        setConfig(normalizeRefusalConfig(res.config));
      }
    } catch {
      // background sync fallback
    }
  }, []);

  useEffect(() => {
    syncRefusalConfig();
  }, [syncRefusalConfig]);

  const handleToggleEnabled = useCallback(
    async (enabled) => {
      const nextVal = Boolean(enabled);
      setConfig((prev) => ({ ...prev, enabled: nextVal }));
      try {
        const res = await updateRefusalCatcherState({ enabled: nextVal });
        if (res?.config) setConfig(normalizeRefusalConfig(res.config));
      } catch (err) {
        onNotify?.(err?.message || 'Failed to toggle Refusal Catcher', 'error');
        syncRefusalConfig();
      }
    },
    [onNotify, syncRefusalConfig],
  );

  const handleAddPhrase = useCallback(
    async (phrase) => {
      const clean = String(phrase || '').replace(/\s+/g, ' ').trim();
      if (!clean) return;
      const key = normalizeForRefusalMatch(clean);

      setConfig((prev) => {
        if (prev.bannedPhrases.some((p) => normalizeForRefusalMatch(p) === key)) {
          return prev;
        }
        return { ...prev, bannedPhrases: [clean, ...prev.bannedPhrases] };
      });

      try {
        const res = await addRefusalBannedPhrase(clean);
        if (res?.config) setConfig(normalizeRefusalConfig(res.config));
      } catch (err) {
        onNotify?.(err?.message || 'Failed to add banned phrase', 'error');
        syncRefusalConfig();
      }
    },
    [onNotify, syncRefusalConfig],
  );

  const handleRemovePhrase = useCallback(
    async (phrase) => {
      const key = normalizeForRefusalMatch(phrase);
      if (!key) return;

      setConfig((prev) => ({
        ...prev,
        bannedPhrases: prev.bannedPhrases.filter(
          (p) => normalizeForRefusalMatch(p) !== key,
        ),
      }));

      try {
        const res = await removeRefusalBannedPhrase(phrase);
        if (res?.config) setConfig(normalizeRefusalConfig(res.config));
      } catch (err) {
        onNotify?.(err?.message || 'Failed to remove banned phrase', 'error');
        syncRefusalConfig();
      }
    },
    [onNotify, syncRefusalConfig],
  );

  const handleReplacePhrases = useCallback(
    async (nextPhrases = []) => {
      const normalizedNext = Array.isArray(nextPhrases) ? nextPhrases : [];
      setConfig((prev) =>
        normalizeRefusalConfig({ ...prev, bannedPhrases: normalizedNext }),
      );
      try {
        const res = await updateRefusalCatcherState({
          bannedPhrases: normalizedNext,
        });
        if (res?.config) setConfig(normalizeRefusalConfig(res.config));
      } catch (err) {
        onNotify?.(err?.message || 'Failed to update banned phrases', 'error');
        syncRefusalConfig();
      }
    },
    [onNotify, syncRefusalConfig],
  );

  const handleToggleFallbackEnabled = useCallback(
    async (nextEnabled) => {
      const flag = Boolean(nextEnabled);
      let nextConnId = config.fallbackConnectionId;
      let nextModelId = config.fallbackModelId;

      if (flag && Array.isArray(connections) && connections.length > 0) {
        const existingConn = connections.find((c) => c.id === nextConnId);
        const pickedConn =
          existingConn ||
          connections.find((c) => c.id === activeConnectionId) ||
          connections[0];
        if (pickedConn) {
          nextConnId = pickedConn.id;
          const models = Array.isArray(pickedConn.models) ? pickedConn.models : [];
          const validModel =
            models.find((m) => m.id === nextModelId) ||
            models.find((m) => m.id === pickedConn.lastUsedModelId) ||
            models.find((m) => m.id === activeModelId) ||
            models[0] ||
            null;
          nextModelId = validModel?.id || nextModelId || activeModelId || '';
        }
      }

      const patch = {
        fallbackEnabled: flag,
        fallbackConnectionId: nextConnId,
        fallbackModelId: nextModelId,
      };
      setConfig((prev) => ({ ...prev, ...patch }));
      try {
        const res = await updateRefusalCatcherState(patch);
        if (res?.config) setConfig(normalizeRefusalConfig(res.config));
      } catch (err) {
        onNotify?.(err?.message || 'Failed to toggle fallback model', 'error');
        syncRefusalConfig();
      }
    },
    [
      config.fallbackConnectionId,
      config.fallbackModelId,
      connections,
      activeConnectionId,
      activeModelId,
      onNotify,
      syncRefusalConfig,
    ],
  );

  const handleSelectFallbackTarget = useCallback(
    async (connId, modelId = null) => {
      const targetConnId = String(connId || '').trim();
      if (!targetConnId) return;

      let resolvedModelId = modelId ? String(modelId).trim() : '';
      if (!resolvedModelId && Array.isArray(connections)) {
        const conn = connections.find((c) => c.id === targetConnId);
        const models = Array.isArray(conn?.models) ? conn.models : [];
        const keepCurrent =
          config.fallbackModelId &&
          models.find((m) => m.id === config.fallbackModelId);
        const fromLastUsed =
          conn?.lastUsedModelId &&
          models.find((m) => m.id === conn.lastUsedModelId);
        resolvedModelId =
          keepCurrent?.id || fromLastUsed?.id || models[0]?.id || '';
      }

      const patch = {
        fallbackConnectionId: targetConnId,
        fallbackModelId: resolvedModelId,
      };
      setConfig((prev) => ({ ...prev, ...patch }));
      try {
        const res = await updateRefusalCatcherState(patch);
        if (res?.config) setConfig(normalizeRefusalConfig(res.config));
      } catch (err) {
        onNotify?.(err?.message || 'Failed to save fallback model', 'error');
        syncRefusalConfig();
      }
    },
    [connections, config.fallbackModelId, onNotify, syncRefusalConfig],
  );

  return {
    enabled: config.enabled,
    delayMs: config.delayMs,
    bannedPhrases: config.bannedPhrases,
    fallbackEnabled: config.fallbackEnabled,
    fallbackConnectionId: config.fallbackConnectionId,
    fallbackModelId: config.fallbackModelId,
    handleToggleEnabled,
    handleAddPhrase,
    handleRemovePhrase,
    handleReplacePhrases,
    handleToggleFallbackEnabled,
    handleSelectFallbackTarget,
    syncRefusalConfig,
  };
}
