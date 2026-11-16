import { apiFetchJson } from '@core/api/apiClient.js';
import { normalizeCustomizationConfig } from './customizationDefaults.js';

const CUSTOMIZATION_CACHE_KEY = 'nexustavern_customization_v1';
const CUSTOM_PRESETS_CACHE_KEY = 'nexustavern_custom_theme_presets_v1';

export function readCachedCustomization() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CUSTOMIZATION_CACHE_KEY);
    if (!raw) return null;
    return normalizeCustomizationConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeCachedCustomization(config) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CUSTOMIZATION_CACHE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

export function readCachedCustomPresets() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCachedCustomPresets(presets = []) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_PRESETS_CACHE_KEY, JSON.stringify(presets));
  } catch {
    // Ignore storage quota errors
  }
}

export async function fetchCustomizationBundle() {
  return apiFetchJson('/api/customization');
}

export async function saveCustomizationConfig(config) {
  return apiFetchJson('/api/customization', {
    method: 'PUT',
    body: { config },
  });
}

export async function saveUserThemePreset(preset) {
  return apiFetchJson('/api/customization/presets', {
    method: 'POST',
    body: { preset },
  });
}

export async function deleteUserThemePreset(presetId) {
  return apiFetchJson(`/api/customization/presets/${encodeURIComponent(presetId)}`, {
    method: 'DELETE',
  });
}

export async function uploadCustomFontFile({ fileName, dataUrl, family }) {
  return apiFetchJson('/api/customization/fonts', {
    method: 'POST',
    body: { fileName, dataUrl, family },
  });
}

export async function deleteCustomFontFile(fontId) {
  return apiFetchJson(`/api/customization/fonts/${encodeURIComponent(fontId)}`, {
    method: 'DELETE',
  });
}
