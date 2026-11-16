import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BUILTIN_THEME_PRESETS,
  DEFAULT_CUSTOMIZATION_CONFIG,
  normalizeCustomizationConfig,
  normalizeThemePreset,
} from '@core/customization/customizationDefaults.js';
import {
  buildDerivedTavernPalette,
  resolveEffectiveChatTextColors,
} from '@core/customization/paletteEngine.js';
import { extractPaletteFromImageUrl } from '@core/customization/portraitPalette.js';
import { applyCustomizationToDom } from '@core/customization/customizationDom.js';
import {
  readCachedCustomization,
  writeCachedCustomization,
  readCachedCustomPresets,
  writeCachedCustomPresets,
  fetchCustomizationBundle,
  saveCustomizationConfig,
  saveUserThemePreset,
  deleteUserThemePreset,
  uploadCustomFontFile,
  deleteCustomFontFile,
  importCustomizationBackup,
} from '@core/customization/customizationApi.js';

export function useCustomizationWorkspace({
  scenarioThemePresetId = null,
  activePortraitUrl = null,
  onNotify,
} = {}) {
  const [config, setConfig] = useState(
    () => readCachedCustomization() || DEFAULT_CUSTOMIZATION_CONFIG,
  );
  const [customPresets, setCustomPresets] = useState(() => readCachedCustomPresets());
  const [hydrated, setHydrated] = useState(false);

  const saveTimerRef = useRef(null);
  const latestConfigRef = useRef(config);
  latestConfigRef.current = config;

  useEffect(() => {
    let cancelled = false;
    fetchCustomizationBundle()
      .then((res) => {
        if (cancelled || !res?.ok) return;
        const normalized = normalizeCustomizationConfig(res.config);
        const presets = Array.isArray(res.customPresets) ? res.customPresets : [];
        setConfig(normalized);
        setCustomPresets(presets);
        writeCachedCustomization(normalized);
        writeCachedCustomPresets(presets);
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyCustomizationToDom(config, {
      scenarioThemePresetId,
      customPresets,
    });
  }, [config, scenarioThemePresetId, customPresets]);

  const schedulePersist = useCallback((nextCfg) => {
    writeCachedCustomization(nextCfg);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveCustomizationConfig(nextCfg).catch(() => {});
    }, 260);
  }, []);

  const updateConfig = useCallback(
    (patchOrUpdater) => {
      setConfig((prev) => {
        const rawPatch =
          typeof patchOrUpdater === 'function' ? patchOrUpdater(prev) : patchOrUpdater;
        const merged = normalizeCustomizationConfig({
          ...prev,
          ...rawPatch,
          chatText: rawPatch?.chatText ? { ...prev.chatText, ...rawPatch.chatText } : prev.chatText,
          chatTextAuto: rawPatch?.chatTextAuto
            ? { ...prev.chatTextAuto, ...rawPatch.chatTextAuto }
            : prev.chatTextAuto,
          chatAndAi: rawPatch?.chatAndAi
            ? {
                ...prev.chatAndAi,
                ...rawPatch.chatAndAi,
                promptCaching: rawPatch.chatAndAi.promptCaching
                  ? { ...prev.chatAndAi.promptCaching, ...rawPatch.chatAndAi.promptCaching }
                  : prev.chatAndAi.promptCaching,
              }
            : prev.chatAndAi,
          system: rawPatch?.system ? { ...prev.system, ...rawPatch.system } : prev.system,
        });
        schedulePersist(merged);
        return merged;
      });
    },
    [schedulePersist],
  );

  const allPresets = useMemo(
    () => [...BUILTIN_THEME_PRESETS, ...customPresets],
    [customPresets],
  );

  const derivedPalette = useMemo(() => buildDerivedTavernPalette(config), [config]);
  const effectiveChatText = useMemo(
    () => resolveEffectiveChatTextColors(config, derivedPalette),
    [config, derivedPalette],
  );

  const applyPreset = useCallback(
    (preset) => {
      if (!preset) return;
      updateConfig((prev) => ({
        activePresetId: preset.id,
        themeMode: preset.themeMode,
        colorScheme: preset.colorScheme,
        primaryColor: preset.primaryColor,
        accentColor: preset.accentColor,
        paletteOverrides: preset.paletteOverrides || null,
        portraitPalette: null,
        bgPatternId: preset.bgPatternId || prev.bgPatternId,
        chatText: preset.chatText ? structuredClone(preset.chatText) : prev.chatText,
        chatTextAuto: preset.chatTextAuto ? { ...preset.chatTextAuto } : prev.chatTextAuto,
      }));
    },
    [updateConfig],
  );

  const handleExtractFromPortrait = useCallback(async () => {
    try {
      const patch = await extractPaletteFromImageUrl(
        activePortraitUrl,
        latestConfigRef.current.themeMode,
      );
      updateConfig({
        ...patch,
        activePresetId: 'portrait-auto',
        chatTextAuto: {
          text: true,
          quote: true,
          apostrophe: true,
          italic: true,
          bold: true,
          code: true,
          codeBlock: true,
          details: true,
        },
      });
      onNotify?.('Palette automatically derived from character portrait', 'success');
    } catch (err) {
      onNotify?.(err.message || 'Could not sample portrait colors', 'error');
    }
  }, [activePortraitUrl, updateConfig, onNotify]);

  const handleSavePreset = useCallback(
    async (name, existingId = null) => {
      const cur = latestConfigRef.current;
      const candidate = normalizeThemePreset({
        id: existingId || undefined,
        name,
        builtin: false,
        themeMode: cur.themeMode,
        colorScheme: cur.colorScheme,
        primaryColor: cur.primaryColor,
        accentColor: cur.accentColor,
        paletteOverrides: cur.paletteOverrides,
        bgPatternId: cur.bgPatternId,
        chatText: cur.chatText,
        chatTextAuto: cur.chatTextAuto,
      });
      if (!candidate) return null;
      const res = await saveUserThemePreset(candidate);
      if (res?.ok && res.preset) {
        const list = res.customPresets || [];
        setCustomPresets(list);
        writeCachedCustomPresets(list);
        updateConfig({ activePresetId: res.preset.id });
        onNotify?.(`Saved theme preset "${res.preset.name}"`, 'success');
        return res.preset;
      }
      return null;
    },
    [updateConfig, onNotify],
  );

  const handleDeletePreset = useCallback(
    async (presetId) => {
      const res = await deleteUserThemePreset(presetId);
      if (res?.ok) {
        const list = res.customPresets || [];
        setCustomPresets(list);
        writeCachedCustomPresets(list);
        if (latestConfigRef.current.activePresetId === presetId) {
          applyPreset(BUILTIN_THEME_PRESETS[0]);
        }
        onNotify?.('Deleted custom theme preset', 'info');
      }
    },
    [applyPreset, onNotify],
  );

  const handleUploadFont = useCallback(
    async ({ fileName, dataUrl, family }) => {
      const res = await uploadCustomFontFile({ fileName, dataUrl, family });
      if (res?.ok && res.font) {
        updateConfig((prev) => ({
          importedFonts: [...(prev.importedFonts || []), res.font],
        }));
        onNotify?.(`Imported font "${res.font.family}"`, 'success');
        return res.font;
      }
      return null;
    },
    [updateConfig, onNotify],
  );

  const handleRemoveFont = useCallback(
    async (fontId) => {
      await deleteCustomFontFile(fontId);
      updateConfig((prev) => ({
        importedFonts: (prev.importedFonts || []).filter((f) => f.id !== fontId),
      }));
    },
    [updateConfig],
  );

  const resetAppearanceToDefault = useCallback(() => {
    const def = DEFAULT_CUSTOMIZATION_CONFIG;
    updateConfig((prev) => ({
      ...def,
      chatAndAi: prev.chatAndAi,
      system: prev.system,
    }));
    onNotify?.('Appearance reset to default Indigo Slate theme', 'info');
  }, [updateConfig, onNotify]);

  const resetAllSettingsToDefault = useCallback(() => {
    const fresh = normalizeCustomizationConfig(DEFAULT_CUSTOMIZATION_CONFIG);
    setConfig(fresh);
    schedulePersist(fresh);
    onNotify?.('All workspace settings reset to defaults', 'info');
  }, [schedulePersist, onNotify]);

  const handleImportBackup = useCallback(
    async (rawPayload) => {
      if (!rawPayload || typeof rawPayload !== 'object') {
        throw new Error('Invalid backup JSON file.');
      }
      const configCandidate =
        rawPayload.config && typeof rawPayload.config === 'object'
          ? rawPayload.config
          : rawPayload;
      const presetsCandidate = Array.isArray(rawPayload.customPresets)
        ? rawPayload.customPresets
        : [];

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const res = await importCustomizationBackup({
        config: configCandidate,
        customPresets: presetsCandidate,
      });
      if (!res?.ok || !res.config) {
        throw new Error(res?.error || 'Failed to restore workspace backup.');
      }

      const normalized = normalizeCustomizationConfig(res.config);
      const nextPresets = Array.isArray(res.customPresets) ? res.customPresets : [];
      setConfig(normalized);
      setCustomPresets(nextPresets);
      writeCachedCustomization(normalized);
      writeCachedCustomPresets(nextPresets);
      onNotify?.(
        res.importedPresetCount > 0
          ? `Workspace settings & ${res.importedPresetCount} custom theme${
              res.importedPresetCount === 1 ? '' : 's'
            } restored`
          : 'Workspace settings restored from backup',
        'success',
      );
      return res;
    },
    [onNotify],
  );

  return {
    config,
    hydrated,
    allPresets,
    customPresets,
    derivedPalette,
    effectiveChatText,
    updateConfig,
    applyPreset,
    handleExtractFromPortrait,
    handleSavePreset,
    handleDeletePreset,
    handleUploadFont,
    handleRemoveFont,
    resetAppearanceToDefault,
    resetAllSettingsToDefault,
    handleImportBackup,
  };
}

