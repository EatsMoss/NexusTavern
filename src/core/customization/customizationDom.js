/**
 * Applies the active Customization configuration to the DOM (`:root`, `<head>` font
 * links, `@font-face` rules, and scoped `<style id="bb-user-custom-css">`).
 * Also provides `bootCachedCustomizationEarly()` for zero-flash startup in `main.jsx`.
 */

import {
  BUILTIN_THEME_PRESETS,
  CURATED_FONT_OPTIONS,
  DEFAULT_CUSTOMIZATION_CONFIG,
  normalizeCustomizationConfig,
} from './customizationDefaults.js';
import {
  buildDerivedTavernPalette,
  resolveEffectiveChatTextColors,
  hexToRgba,
} from './paletteEngine.js';
import { buildJrpgPatternDataUri } from './jrpgPatterns.js';
import { readCachedCustomization } from './customizationApi.js';
import { publishCustomizationRuntime } from './customizationRuntimeStore.js';

function guessFontFormat(url = '') {
  const lower = String(url).toLowerCase();
  if (lower.includes('.woff2') || lower.includes('font/woff2')) return 'woff2';
  if (lower.includes('.woff') || lower.includes('font/woff')) return 'woff';
  if (lower.includes('.otf') || lower.includes('opentype')) return 'opentype';
  if (lower.includes('.ttf') || lower.includes('truetype')) return 'truetype';
  return 'woff2';
}

function syncDocumentFonts(cfg) {
  if (typeof document === 'undefined') return;

  const curatedUrls = new Set();
  for (const group of Object.values(CURATED_FONT_OPTIONS)) {
    for (const item of group) {
      if (
        item.googleUrl &&
        (item.value === cfg.fontHeading ||
          item.value === cfg.fontBody ||
          item.value === cfg.fontMono)
      ) {
        curatedUrls.add(item.googleUrl);
      }
    }
  }
  for (const g of cfg.googleFonts || []) {
    if (g.url) curatedUrls.add(g.url);
  }

  const existingLinks = Array.from(document.head.querySelectorAll('link[data-bb-font-link]'));
  for (const link of existingLinks) {
    if (!curatedUrls.has(link.getAttribute('href'))) {
      link.remove();
    }
  }
  const presentHrefs = new Set(
    Array.from(document.head.querySelectorAll('link[data-bb-font-link]')).map((el) =>
      el.getAttribute('href'),
    ),
  );
  for (const url of curatedUrls) {
    if (presentHrefs.has(url)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.setAttribute('data-bb-font-link', 'true');
    document.head.appendChild(link);
  }

  let fontFaceStyle = document.getElementById('bb-imported-fonts-style');
  if (!fontFaceStyle) {
    fontFaceStyle = document.createElement('style');
    fontFaceStyle.id = 'bb-imported-fonts-style';
    document.head.appendChild(fontFaceStyle);
  }
  const imported = cfg.importedFonts || [];
  fontFaceStyle.textContent = imported
    .map(
      (f) =>
        `@font-face { font-family: "${f.family}"; src: url("${f.fileUrl}") format("${guessFontFormat(f.fileUrl)}"); font-display: swap; }`,
    )
    .join('\n');
}

function syncUserCustomCss(cfg) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('bb-user-custom-css');
  const activeCss = cfg.customCssEnabled && cfg.customCss ? String(cfg.customCss).trim() : '';
  if (!activeCss) {
    if (el) el.textContent = '';
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = 'bb-user-custom-css';
    document.head.appendChild(el);
  }
  if (el.textContent !== activeCss) {
    el.textContent = activeCss;
  }
}

export function applyCustomizationToDom(rawConfig, options = {}) {
  if (typeof document === 'undefined') return null;
  const cfg = normalizeCustomizationConfig(rawConfig || DEFAULT_CUSTOMIZATION_CONFIG);
  const { scenarioThemePresetId = null, customPresets = [] } = options;

  let activeThemeCfg = cfg;
  if (scenarioThemePresetId) {
    const allPresets = [...BUILTIN_THEME_PRESETS, ...(customPresets || [])];
    const matched = allPresets.find((p) => p.id === scenarioThemePresetId);
    if (matched) {
      activeThemeCfg = {
        ...cfg,
        themeMode: matched.themeMode,
        colorScheme: matched.colorScheme,
        primaryColor: matched.primaryColor,
        accentColor: matched.accentColor,
        paletteOverrides: matched.paletteOverrides || null,
        chatText: matched.chatText || cfg.chatText,
        chatTextAuto: matched.chatTextAuto || cfg.chatTextAuto,
      };
    }
  }

  const root = document.documentElement;
  const lowGpu = Boolean(cfg.system?.lowGpu);
  const derived = buildDerivedTavernPalette(activeThemeCfg);
  const chatColors = resolveEffectiveChatTextColors(activeThemeCfg, derived);

  root.setAttribute('data-theme', derived.themeMode);
  root.setAttribute('data-bb-theme-mode', derived.themeMode);
  root.setAttribute('data-gpu-mode', lowGpu ? 'low' : 'high');
  root.setAttribute('data-reduced-motion', cfg.reducedMotion ? 'true' : 'false');
  root.setAttribute('data-hide-edge-fade', cfg.chatEdgeFade ? 'false' : 'true');

  // Message card badge & interaction flags (zero-rerender CSS & DOM attributes)
  const ai = cfg.chatAndAi;
  root.setAttribute('data-hide-msg-timer', ai.showMessageTimer ? 'false' : 'true');
  root.setAttribute('data-hide-msg-timestamps', ai.showMessageTimestamps ? 'false' : 'true');
  root.setAttribute('data-hide-model-icons', ai.showModelIcons ? 'false' : 'true');
  root.setAttribute('data-hide-msg-ids', ai.showMessageIds ? 'false' : 'true');
  root.setAttribute('data-hide-msg-tokens', ai.showMessageTokens ? 'false' : 'true');
  root.setAttribute('data-hide-chat-avatars', ai.hideChatAvatars ? 'true' : 'false');
  root.setAttribute('data-always-expand-actions', ai.alwaysExpandActions ? 'true' : 'false');
  root.setAttribute('data-mobile-swipe-gestures', ai.mobileSwipeGestures ? 'true' : 'false');
  root.setAttribute('data-click-to-edit', ai.clickMessageToEdit || 'off');

  publishCustomizationRuntime(cfg);

  // 1. Core M3 & NexusTavern Palette Vars
  Object.entries(derived.vars).forEach(([k, v]) => root.style.setProperty(k, v));

  // Optional custom shader tint override
  if (!cfg.shaderTintAuto && cfg.shaderTintColor) {
    root.style.setProperty('--bb-shader-pearl-a', cfg.shaderTintColor);
  }

  // 2. Typography & Reading Column Scale
  const scaleFloat = Number((cfg.fontScale / 100).toFixed(3));
  root.style.setProperty('--bb-font-scale', String(scaleFloat));
  root.style.setProperty('--bb-font-heading', `"${cfg.fontHeading}", Georgia, 'Times New Roman', serif`);
  root.style.setProperty('--bb-font-body', `"${cfg.fontBody}", Inter, system-ui, sans-serif`);
  root.style.setProperty('--bb-font-mono', `"${cfg.fontMono}", 'JetBrains Mono', Consolas, monospace`);
  root.style.setProperty('--bb-chat-column-max', `${cfg.chatColumnMaxWidth}px`);

  // 3. Message Card & Side Tome Surface Opacity / Blur
  const mesAlpha = Number((cfg.mesBgOpacity / 100).toFixed(3));
  root.style.setProperty('--bb-mes-card-bg', hexToRgba(derived.slots.bgCardHex, mesAlpha));
  root.style.setProperty('--bb-mes-backdrop-blur', lowGpu ? '0px' : `${cfg.mesBackdropBlur}px`);
  root.style.setProperty('--bb-tome-idle-opacity', String(Number((cfg.tomeIdleOpacity / 100).toFixed(2))));
  root.style.setProperty('--bb-tome-surface-bg', hexToRgba(derived.slots.bgDeepHex, cfg.tomeSurfaceOpacity / 100));
  root.style.setProperty('--bb-tome-backdrop-blur', lowGpu ? '0px' : `${cfg.tomeBackdropBlur}px`);

  // 4. Stage Backdrop / JRPG Pattern
  if (cfg.backdropMode === 'jrpg-pattern') {
    const { dataUri, baseWidth, baseHeight } = buildJrpgPatternDataUri(
      cfg.bgPatternId,
      derived.slots.borderBaseHex,
      derived.slots.accentHex,
    );
    const scaledW = Math.round(baseWidth * (cfg.bgPatternScale / 100));
    const scaledH = Math.round(baseHeight * (cfg.bgPatternScale / 100));
    root.style.setProperty('--bb-stage-pattern-image', dataUri);
    root.style.setProperty('--bb-stage-pattern-size', `${scaledW}px ${scaledH}px`);
    root.style.setProperty('--bb-stage-pattern-opacity', String(Number((cfg.bgPatternOpacity / 100).toFixed(2))));
  } else {
    root.style.setProperty('--bb-stage-pattern-image', 'none');
    root.style.setProperty('--bb-stage-pattern-opacity', '0');
  }
  root.style.setProperty('--bb-screen-dim-opacity', String(Number((cfg.screenDimOpacity / 100).toFixed(2))));

  // 5. RP Chat Typography Tokens (8 slots, zero underline)
  root.style.setProperty('--bb-chat-text-color', chatColors.text);
  root.style.setProperty('--bb-chat-quote-color', chatColors.quote);
  root.style.setProperty('--bb-quote-color', chatColors.quote);
  root.style.setProperty('--bb-chat-apostrophe-color', chatColors.apostrophe);
  root.style.setProperty('--bb-chat-italic-color', chatColors.italic);
  root.style.setProperty('--bb-thought-color', chatColors.italic);
  root.style.setProperty('--bb-chat-bold-color', chatColors.bold);
  root.style.setProperty('--bb-chat-code-text', chatColors.code.text);
  root.style.setProperty('--bb-chat-code-bg', hexToRgba(chatColors.code.bg, chatColors.code.bgAlpha));
  root.style.setProperty('--bb-chat-codeblock-text', chatColors.codeBlock.text);
  root.style.setProperty('--bb-chat-codeblock-bg', hexToRgba(chatColors.codeBlock.bg, chatColors.codeBlock.bgAlpha));
  root.style.setProperty('--bb-chat-details-text', chatColors.details.text);
  root.style.setProperty('--bb-chat-details-bg', hexToRgba(chatColors.details.bg, chatColors.details.bgAlpha));

  syncDocumentFonts(cfg);
  syncUserCustomCss(cfg);

  return { derived, chatColors };
}

export function bootCachedCustomizationEarly() {
  if (typeof document === 'undefined') return;
  const cached = readCachedCustomization();
  if (cached) {
    applyCustomizationToDom(cached);
  } else {
    applyCustomizationToDom(DEFAULT_CUSTOMIZATION_CONFIG);
  }
}

