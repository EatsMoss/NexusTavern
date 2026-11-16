/**
 * Isomorphic Customization & Settings Schema, Built-in Theme Presets,
 * Curated Fonts, and Normalization Rules for NexusTavern.
 */

export const DEFAULT_THEME_PRESET_ID = 'indigo-slate';

export const PALETTE_OVERRIDE_SLOTS = [
  { key: 'bgDeepHex', shortLabel: 'Bg', label: 'Deep Background', hint: 'Main workspace & deepest surfaces' },
  { key: 'bgMidHex', shortLabel: 'Panel', label: 'Tome Surfaces', hint: 'Side tomes, headers & sheets' },
  { key: 'bgCardHex', shortLabel: 'Card', label: 'Card & Message Surfaces', hint: 'Cards, chat messages & wells' },
  { key: 'borderBaseHex', shortLabel: 'Border', label: 'Borders & Muted Ink', hint: 'Outlines, dividers & secondary captions' },
  { key: 'accentHex', shortLabel: 'Accent', label: 'Primary Accent', hint: 'Active controls, highlights & links' },
  { key: 'accentBorderHex', shortLabel: 'Accent 2', label: 'Secondary Accent', hint: 'Active borders & hover rings' },
  { key: 'inkMainHex', shortLabel: 'Text', label: 'Interface Ink', hint: 'Primary UI labels & headings base' },
];

export const CHAT_TEXT_CARDS = [
  {
    key: 'text',
    type: 'text',
    label: 'Normal Prose',
    hint: 'Plain narrative message body',
    sample: 'The rain-slicked lantern hummed softly above the stone parapet.',
  },
  {
    key: 'quote',
    type: 'text',
    label: 'Spoken Quotes',
    hint: 'Dialogue inside "...", «...» or “...”',
    sample: '"Stay close — the mist carries old echoes tonight."',
  },
  {
    key: 'apostrophe',
    type: 'text',
    label: 'Apostrophes',
    hint: "Inner thoughts or murmured lines wrapped in '...' (no underline)",
    sample: "'...If they knew the truth, they would never turn back.'",
  },
  {
    key: 'italic',
    type: 'text',
    label: 'Italic Actions',
    hint: 'Emphasized actions & narrative thoughts (*...*)',
    sample: '*She lowered her gaze, fingers tracing the brass seal.*',
  },
  {
    key: 'bold',
    type: 'text',
    label: 'Bold Emphasis',
    hint: 'Strong accents (**...**)',
    sample: '**The ward shattered in a single heartbeat.**',
  },
  {
    key: 'code',
    type: 'pair',
    label: 'Inline Code',
    hint: 'Text, background & opacity of `inline` spans',
    sample: '`seal_integrity: 94%`',
  },
  {
    key: 'codeBlock',
    type: 'pair',
    label: 'Code Block',
    hint: 'Text & background of fenced ```code``` blocks',
    sample: 'status: active\nlocation: Spire IV',
  },
  {
    key: 'details',
    type: 'pair',
    label: 'Details & Spoilers',
    hint: 'Text & background of collapsible <details> cards',
    sample: 'Hidden Character Status',
  },
];

export const CURATED_FONT_OPTIONS = {
  heading: [
    { value: 'PT Serif', label: 'PT Serif (Default)' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Cormorant Garamond', label: 'Cormorant Garamond', googleUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&display=swap' },
    { value: 'Lora', label: 'Lora', googleUrl: 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;0,700;1,400&display=swap' },
    { value: 'Playfair Display', label: 'Playfair Display', googleUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap' },
    { value: 'Merriweather', label: 'Merriweather', googleUrl: 'https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap' },
    { value: 'Inter', label: 'Inter (Clean Sans)' },
  ],
  body: [
    { value: 'Inter', label: 'Inter (Default)' },
    { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', googleUrl: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap' },
    { value: 'Source Serif 4', label: 'Source Serif 4 (Bookish)', googleUrl: 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap' },
    { value: 'Literata', label: 'Literata (E-Reader)', googleUrl: 'https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&display=swap' },
    { value: 'PT Serif', label: 'PT Serif' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Segoe UI', label: 'System UI / Segoe' },
  ],
  mono: [
    { value: 'LXGW WenKai Mono TC', label: 'LXGW WenKai Mono (Default)' },
    { value: 'JetBrains Mono', label: 'JetBrains Mono', googleUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap' },
    { value: 'Fira Code', label: 'Fira Code', googleUrl: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&display=swap' },
    { value: 'Consolas', label: 'Consolas' },
  ],
};

export const BUILTIN_THEME_PRESETS = [
  {
    id: 'indigo-slate',
    name: 'Indigo Slate',
    builtin: true,
    isDefault: true,
    themeMode: 'dark',
    colorScheme: 'two-color',
    primaryColor: '#6D6D83',
    accentColor: '#6575B3',
    bgPatternId: 'astral-stars',
    chatText: {
      text: '#C6C6D4',
      quote: '#DCE2FF',
      apostrophe: '#8A8A9E',
      italic: '#B6BCE0',
      bold: '#ECECF4',
      code: { text: '#8294C4', bg: '#121216', bgAlpha: 0.75 },
      codeBlock: { text: '#ECECF4', bg: '#121216', bgAlpha: 1 },
      details: { text: '#C6C6D4', bg: '#121216', bgAlpha: 0.85 },
    },
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
  },
  {
    id: 'bronze-tome',
    name: 'Bronze Tome',
    builtin: true,
    themeMode: 'dark',
    colorScheme: 'monochrome',
    primaryColor: '#7D7162',
    accentColor: '#C9975B',
    bgPatternId: 'astral-stars',
    chatText: {
      text: '#C0B2A0',
      quote: '#F3EADD',
      apostrophe: '#7A6F60',
      italic: '#C0B2A0',
      bold: '#EAE4DC',
      code: { text: '#DA8662', bg: '#6D6155', bgAlpha: 0 },
      codeBlock: { text: '#C0B2A0', bg: '#0C0A09', bgAlpha: 1 },
      details: { text: '#DAD2C8', bg: '#11100D', bgAlpha: 1 },
    },
    chatTextAuto: {
      text: true,
      quote: false,
      apostrophe: false,
      italic: true,
      bold: true,
      code: false,
      codeBlock: true,
      details: false,
    },
  },
  {
    id: 'astral-azure',
    name: 'Astral Azure',
    builtin: true,
    themeMode: 'dark',
    colorScheme: 'two-color',
    primaryColor: '#4A5B78',
    accentColor: '#4BA3E3',
    bgPatternId: 'arcane-hex',
    chatText: {
      text: '#A8B8D0',
      quote: '#DCEEFF',
      apostrophe: '#6B7E9E',
      italic: '#9BC4E8',
      bold: '#E6F0FA',
      code: { text: '#63B8F2', bg: '#0A0E17', bgAlpha: 0 },
      codeBlock: { text: '#A8B8D0', bg: '#070A10', bgAlpha: 1 },
      details: { text: '#C8D6EA', bg: '#0B0F17', bgAlpha: 1 },
    },
    chatTextAuto: {
      text: true,
      quote: false,
      apostrophe: false,
      italic: true,
      bold: true,
      code: false,
      codeBlock: true,
      details: false,
    },
  },
  {
    id: 'crimson-eclipse',
    name: 'Crimson Eclipse',
    builtin: true,
    themeMode: 'dark',
    colorScheme: 'two-color',
    primaryColor: '#664B4B',
    accentColor: '#D64545',
    bgPatternId: 'royal-crest',
    chatText: {
      text: '#C8AEAE',
      quote: '#FADEDE',
      apostrophe: '#8D6767',
      italic: '#E29898',
      bold: '#F5E6E6',
      code: { text: '#EB6565', bg: '#140A0A', bgAlpha: 0 },
      codeBlock: { text: '#C8AEAE', bg: '#0D0606', bgAlpha: 1 },
      details: { text: '#E2CECE', bg: '#140B0B', bgAlpha: 1 },
    },
    chatTextAuto: {
      text: true,
      quote: false,
      apostrophe: false,
      italic: true,
      bold: true,
      code: false,
      codeBlock: true,
      details: false,
    },
  },
  {
    id: 'abyssal-void',
    name: 'Abyssal Void',
    builtin: true,
    themeMode: 'dark',
    colorScheme: 'monochrome',
    primaryColor: '#3D3D42',
    accentColor: '#8E8E99',
    bgPatternId: 'dungeon-tiles',
    chatText: {
      text: '#B0B0B8',
      quote: '#E2E2EA',
      apostrophe: '#767682',
      italic: '#B0B0B8',
      bold: '#EBEBF2',
      code: { text: '#9A9AB5', bg: '#08080A', bgAlpha: 0 },
      codeBlock: { text: '#B0B0B8', bg: '#040405', bgAlpha: 1 },
      details: { text: '#CFCFD6', bg: '#08080A', bgAlpha: 1 },
    },
    chatTextAuto: {
      text: true,
      quote: false,
      apostrophe: false,
      italic: true,
      bold: true,
      code: false,
      codeBlock: true,
      details: false,
    },
  },
  {
    id: 'ivory-grimoire',
    name: 'Ivory Grimoire',
    builtin: true,
    themeMode: 'light',
    colorScheme: 'two-color',
    primaryColor: '#EDE3D2',
    accentColor: '#B08248',
    bgPatternId: 'diamond-lattice',
    chatText: {
      text: '#33291F',
      quote: '#7A5429',
      apostrophe: '#786856',
      italic: '#544332',
      bold: '#1F1710',
      code: { text: '#945B27', bg: '#F2E9DA', bgAlpha: 0 },
      codeBlock: { text: '#33291F', bg: '#F0E6D6', bgAlpha: 1 },
      details: { text: '#33291F', bg: '#F6EFE2', bgAlpha: 1 },
    },
    chatTextAuto: {
      text: true,
      quote: false,
      apostrophe: false,
      italic: true,
      bold: true,
      code: false,
      codeBlock: true,
      details: false,
    },
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    builtin: true,
    themeMode: 'light',
    colorScheme: 'two-color',
    primaryColor: '#F2DCE4',
    accentColor: '#E06C96',
    bgPatternId: 'charmed-diamonds',
    chatText: {
      text: '#4A2B36',
      quote: '#B83B6A',
      apostrophe: '#8F5B6E',
      italic: '#7D3B54',
      bold: '#2E151E',
      code: { text: '#C43C6E', bg: '#FCECF2', bgAlpha: 0 },
      codeBlock: { text: '#4A2B36', bg: '#F9E8EE', bgAlpha: 1 },
      details: { text: '#4A2B36', bg: '#FDF2F6', bgAlpha: 1 },
    },
    chatTextAuto: {
      text: true,
      quote: false,
      apostrophe: false,
      italic: true,
      bold: true,
      code: false,
      codeBlock: true,
      details: false,
    },
  },
];

const DEFAULT_INDIGO_PRESET = BUILTIN_THEME_PRESETS[0];

export const DEFAULT_CUSTOMIZATION_CONFIG = {
  version: 1,
  activePresetId: DEFAULT_THEME_PRESET_ID,
  themeMode: 'dark', // 'dark' | 'light'
  colorScheme: 'two-color', // 'two-color' | 'monochrome'
  primaryColor: DEFAULT_INDIGO_PRESET.primaryColor,
  accentColor: DEFAULT_INDIGO_PRESET.accentColor,
  paletteOverrides: null,
  portraitPalette: null, // { enabled, sourceUrl, variant, swatches }

  // RP Chat Text Colors (no underline on quotes or apostrophes)
  chatText: structuredClone(DEFAULT_INDIGO_PRESET.chatText),
  chatTextAuto: { ...DEFAULT_INDIGO_PRESET.chatTextAuto },

  // Chat Reading Column & Message Surface Feel
  chatColumnMaxWidth: 784, // 620..1240 px
  mesBgOpacity: 84, // 0..100 %
  mesBackdropBlur: 0, // 0..32 px
  chatEdgeFade: true,

  // Last Message Pearlescent Shader
  shaderStyle: 'nacre', // 'nacre' | 'caustics' | 'off'
  shaderIntensity: 38, // 15..100 %
  shaderTintAuto: true,
  shaderTintColor: '#6575B3',

  // Side Tomes & Stage Backdrop
  idleFade: false,
  tomeIdleOpacity: 55, // 20..100 %
  tomeSurfaceOpacity: 92, // 45..100 %
  tomeBackdropBlur: 0, // 0..32 px
  backdropMode: 'solid', // 'solid' | 'jrpg-pattern' | 'scenario-image'
  bgPatternId: 'astral-stars',
  bgPatternOpacity: 36, // 0..100 %
  bgPatternScale: 150, // 50..300 %
  screenDimOpacity: 0, // 0..85 %
  stageBackdropBlur: 0, // 0..32 px

  // Typography & Scale
  fontScale: 100, // 75..135 %
  fontHeading: 'PT Serif',
  fontBody: 'Inter',
  fontMono: 'LXGW WenKai Mono TC',
  googleFonts: [], // [{ id, family, url }]
  importedFonts: [], // [{ id, family, fileUrl }]
  reducedMotion: false,

  // User Custom CSS
  customCssEnabled: true,
  customCss: '',

  // II. Chat, Formatting & AI Context Settings
  chatAndAi: {
    enterToSend: 'enter', // 'enter' | 'ctrl-enter' | 'button-only'
    sendEmptyToContinue: true,
    restoreUnsavedDraft: true,
    confirmMessageDelete: true,
    clickMessageToEdit: 'off', // 'off' | 'double-click'
    tailLoadCount: 20, // 15 | 20 | 30 | 50
    autoLoadLastChat: true,
    autoScrollOnStream: true,
    smoothStreaming: true,
    bypassSmoothingInThinking: true,

    // Message Card Badges & Visibility
    showMessageTimer: true,
    showMessageTimestamps: true,
    showModelIcons: true,
    showMessageIds: true,
    showMessageTokens: true,
    hideChatAvatars: false,
    alwaysExpandActions: false,
    mobileSwipeGestures: true,
    forbidExternalMedia: false,

    // Text Hygiene & Auto-Formatting (enabled by default from ST Formatting)
    trimSpaces: true,
    collapseNewlines: true,
    autoFixMarkdown: true,
    trimIncompleteSentences: false,

    // Reasoning / Chain-of-Thought Handling
    reasoningAutoParse: true,
    reasoningAutoExpand: false,
    reasoningIncludeInPrompts: false,
    reasoningMaxAdditions: 2,

    // Card Context Overrides
    exampleMessagesBehavior: 'normal', // 'normal' | 'keep' | 'strip'
    preferCharacterPrompt: true,
    preferCharacterJailbreak: true,

    // LLM Prompt Caching (Token Saver)
    promptCaching: {
      enabled: true,
      cacheSystemPrompt: true,
      cacheHistoryAtDepth: true,
      historyDepth: 2, // 1..10 messages from tail
      ttl: '5m', // '5m' | '1h'
      enableOnProxies: true,
    },

    // Audio Notification
    playCompletionSound: false,
    soundOnlyWhenUnfocused: true,
  },

  // III. System & Diagnostics
  system: {
    lowGpu: false,
    autoOpenBrowser: true,
    labMode: false,
    verbosePromptLogging: false,
  },
};

const clampNum = (v, min, max) => Math.max(min, Math.min(max, v));

function toFinite(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function cleanHex(raw, fallback) {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed.split('').map((c) => c + c).join('').toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }
  return fallback;
}

export function normalizePaletteOverrides(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  let count = 0;
  for (const slot of PALETTE_OVERRIDE_SLOTS) {
    const val = raw[slot.key];
    if (typeof val === 'string' && /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(val.trim())) {
      out[slot.key] = cleanHex(val, '');
      if (out[slot.key]) count += 1;
    }
  }
  return count > 0 ? out : null;
}

function sanitizeFontName(value, fallback) {
  const cleaned = String(value || '')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

export function parseGoogleFontUrl(url) {
  const cleaned = String(url || '').trim();
  if (!/^https:\/\/fonts\.googleapis\.com\//i.test(cleaned)) return null;
  const families = [];
  try {
    const parsed = new URL(cleaned);
    parsed.searchParams.forEach((value, key) => {
      if (key !== 'family') return;
      const decoded = decodeURIComponent(value).split(':')[0].trim().replace(/['"]/g, '');
      if (decoded && !families.includes(decoded)) families.push(decoded);
    });
  } catch {
    return null;
  }
  return families.length > 0 ? { url: cleaned, families } : null;
}

function normalizeFontList(list, kind) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '').trim().slice(0, 80);
    const family = sanitizeFontName(item.family, '');
    if (!id || !family || seen.has(id)) continue;
    seen.add(id);
    if (kind === 'google') {
      const url = String(item.url || '').trim();
      if (/^https:\/\/fonts\.googleapis\.com\//i.test(url)) {
        out.push({ id, family, url });
      }
    } else {
      const fileUrl = String(item.fileUrl || '').trim();
      if (fileUrl.startsWith('/user-data/.nexustavern/fonts/') || fileUrl.startsWith('data:')) {
        out.push({ id, family, fileUrl });
      }
    }
  }
  return out;
}

export function normalizeThemePreset(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().slice(0, 60);
  if (!name) return null;
  const builtinMatch = BUILTIN_THEME_PRESETS.find((b) => b.id === raw.id);
  const id = String(
    raw.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  );
  return {
    id,
    name,
    builtin: Boolean(builtinMatch || raw.builtin),
    isDefault: id === DEFAULT_THEME_PRESET_ID,
    themeMode: raw.themeMode === 'light' ? 'light' : 'dark',
    colorScheme: raw.colorScheme === 'monochrome' || raw.scheme === 'monochrome' ? 'monochrome' : 'two-color',
    primaryColor: cleanHex(raw.primaryColor || raw.primary, DEFAULT_INDIGO_PRESET.primaryColor),
    accentColor: cleanHex(raw.accentColor || raw.accent, DEFAULT_INDIGO_PRESET.accentColor),
    paletteOverrides: normalizePaletteOverrides(raw.paletteOverrides),
    bgPatternId: String(raw.bgPatternId || 'astral-stars'),
    chatText: raw.chatText && typeof raw.chatText === 'object' ? raw.chatText : null,
    chatTextAuto: raw.chatTextAuto && typeof raw.chatTextAuto === 'object' ? raw.chatTextAuto : null,
  };
}

function normalizeChatAndAiBlock(rawAi = {}, defAi) {
  const rawCache = rawAi.promptCaching && typeof rawAi.promptCaching === 'object'
    ? rawAi.promptCaching
    : {};
  const defCache = defAi.promptCaching;
  const pickBool = (key) => (typeof rawAi[key] === 'boolean' ? rawAi[key] : defAi[key]);

  return {
    enterToSend: ['enter', 'ctrl-enter', 'button-only'].includes(rawAi.enterToSend)
      ? rawAi.enterToSend
      : defAi.enterToSend,
    sendEmptyToContinue: pickBool('sendEmptyToContinue'),
    restoreUnsavedDraft: pickBool('restoreUnsavedDraft'),
    confirmMessageDelete: pickBool('confirmMessageDelete'),
    clickMessageToEdit: ['off', 'double-click'].includes(rawAi.clickMessageToEdit)
      ? rawAi.clickMessageToEdit
      : defAi.clickMessageToEdit,
    tailLoadCount: [15, 20, 30, 50].includes(Number(rawAi.tailLoadCount))
      ? Number(rawAi.tailLoadCount)
      : defAi.tailLoadCount,
    autoLoadLastChat: pickBool('autoLoadLastChat'),
    autoScrollOnStream: pickBool('autoScrollOnStream'),
    smoothStreaming: pickBool('smoothStreaming'),
    bypassSmoothingInThinking: pickBool('bypassSmoothingInThinking'),

    showMessageTimer: pickBool('showMessageTimer'),
    showMessageTimestamps: pickBool('showMessageTimestamps'),
    showModelIcons: pickBool('showModelIcons'),
    showMessageIds: pickBool('showMessageIds'),
    showMessageTokens: pickBool('showMessageTokens'),
    hideChatAvatars: pickBool('hideChatAvatars'),
    alwaysExpandActions: pickBool('alwaysExpandActions'),
    mobileSwipeGestures: pickBool('mobileSwipeGestures'),
    forbidExternalMedia: pickBool('forbidExternalMedia'),

    trimSpaces: pickBool('trimSpaces'),
    collapseNewlines: pickBool('collapseNewlines'),
    autoFixMarkdown: pickBool('autoFixMarkdown'),
    trimIncompleteSentences: pickBool('trimIncompleteSentences'),

    reasoningAutoParse: pickBool('reasoningAutoParse'),
    reasoningAutoExpand: pickBool('reasoningAutoExpand'),
    reasoningIncludeInPrompts: pickBool('reasoningIncludeInPrompts'),
    reasoningMaxAdditions: clampNum(Math.round(toFinite(rawAi.reasoningMaxAdditions, defAi.reasoningMaxAdditions)), 0, 50),

    exampleMessagesBehavior: ['normal', 'keep', 'strip'].includes(rawAi.exampleMessagesBehavior)
      ? rawAi.exampleMessagesBehavior
      : defAi.exampleMessagesBehavior,
    preferCharacterPrompt: pickBool('preferCharacterPrompt'),
    preferCharacterJailbreak: pickBool('preferCharacterJailbreak'),

    promptCaching: {
      enabled: typeof rawCache.enabled === 'boolean' ? rawCache.enabled : defCache.enabled,
      cacheSystemPrompt: typeof rawCache.cacheSystemPrompt === 'boolean' ? rawCache.cacheSystemPrompt : defCache.cacheSystemPrompt,
      cacheHistoryAtDepth: typeof rawCache.cacheHistoryAtDepth === 'boolean' ? rawCache.cacheHistoryAtDepth : defCache.cacheHistoryAtDepth,
      historyDepth: clampNum(Math.round(toFinite(rawCache.historyDepth, defCache.historyDepth)), 1, 12),
      ttl: rawCache.ttl === '1h' ? '1h' : '5m',
      enableOnProxies: typeof rawCache.enableOnProxies === 'boolean' ? rawCache.enableOnProxies : defCache.enableOnProxies,
    },

    playCompletionSound: pickBool('playCompletionSound'),
    soundOnlyWhenUnfocused: pickBool('soundOnlyWhenUnfocused'),
  };
}

export function normalizeCustomizationConfig(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const def = DEFAULT_CUSTOMIZATION_CONFIG;

  const themeMode = src.themeMode === 'light' ? 'light' : 'dark';
  const colorScheme = src.colorScheme === 'monochrome' ? 'monochrome' : 'two-color';
  const primaryColor = cleanHex(src.primaryColor, def.primaryColor);
  const accentColor = cleanHex(src.accentColor, def.accentColor);

  const rawChatText = src.chatText && typeof src.chatText === 'object' ? src.chatText : {};
  const rawChatAuto = src.chatTextAuto && typeof src.chatTextAuto === 'object' ? src.chatTextAuto : {};
  const chatText = {};
  const chatTextAuto = {};

  for (const card of CHAT_TEXT_CARDS) {
    chatTextAuto[card.key] =
      typeof rawChatAuto[card.key] === 'boolean' ? rawChatAuto[card.key] : def.chatTextAuto[card.key];
    if (card.type === 'pair') {
      const defPair = def.chatText[card.key];
      const inPair =
        rawChatText[card.key] && typeof rawChatText[card.key] === 'object' ? rawChatText[card.key] : {};
      chatText[card.key] = {
        text: cleanHex(inPair.text, defPair.text),
        bg: cleanHex(inPair.bg, defPair.bg),
        bgAlpha: clampNum(toFinite(inPair.bgAlpha, defPair.bgAlpha), 0, 1),
      };
    } else {
      chatText[card.key] = cleanHex(rawChatText[card.key], def.chatText[card.key]);
    }
  }

  const rawSys = src.system && typeof src.system === 'object' ? src.system : {};
  const defSys = def.system;

  return {
    version: 1,
    activePresetId: String(src.activePresetId || def.activePresetId),
    themeMode,
    colorScheme,
    primaryColor,
    accentColor,
    paletteOverrides: normalizePaletteOverrides(src.paletteOverrides),
    portraitPalette:
      src.portraitPalette && typeof src.portraitPalette === 'object' && src.portraitPalette.enabled
        ? {
            enabled: true,
            sourceUrl: String(src.portraitPalette.sourceUrl || ''),
            variant: Math.max(0, Math.round(toFinite(src.portraitPalette.variant, 0))),
            swatches: Array.isArray(src.portraitPalette.swatches)
              ? src.portraitPalette.swatches.map((s) => cleanHex(s, '')).filter(Boolean).slice(0, 8)
              : [],
          }
        : null,
    chatText,
    chatTextAuto,

    chatColumnMaxWidth: clampNum(Math.round(toFinite(src.chatColumnMaxWidth, def.chatColumnMaxWidth)), 620, 1280),
    mesBgOpacity: clampNum(Math.round(toFinite(src.mesBgOpacity, def.mesBgOpacity)), 0, 100),
    mesBackdropBlur: clampNum(Math.round(toFinite(src.mesBackdropBlur, def.mesBackdropBlur)), 0, 32),
    chatEdgeFade: typeof src.chatEdgeFade === 'boolean' ? src.chatEdgeFade : def.chatEdgeFade,

    shaderStyle: ['nacre', 'caustics', 'off'].includes(src.shaderStyle) ? src.shaderStyle : def.shaderStyle,
    shaderIntensity: clampNum(Math.round(toFinite(src.shaderIntensity, def.shaderIntensity)), 15, 100),
    shaderTintAuto: typeof src.shaderTintAuto === 'boolean' ? src.shaderTintAuto : def.shaderTintAuto,
    shaderTintColor: cleanHex(src.shaderTintColor, def.shaderTintColor),

    idleFade: typeof src.idleFade === 'boolean' ? src.idleFade : def.idleFade,
    tomeIdleOpacity: clampNum(Math.round(toFinite(src.tomeIdleOpacity, def.tomeIdleOpacity)), 20, 100),
    tomeSurfaceOpacity: clampNum(Math.round(toFinite(src.tomeSurfaceOpacity, def.tomeSurfaceOpacity)), 45, 100),
    tomeBackdropBlur: clampNum(Math.round(toFinite(src.tomeBackdropBlur, def.tomeBackdropBlur)), 0, 32),
    backdropMode: ['solid', 'jrpg-pattern', 'scenario-image'].includes(src.backdropMode)
      ? src.backdropMode
      : def.backdropMode,
    bgPatternId: String(src.bgPatternId || def.bgPatternId),
    bgPatternOpacity: clampNum(Math.round(toFinite(src.bgPatternOpacity, def.bgPatternOpacity)), 0, 100),
    bgPatternScale: clampNum(Math.round(toFinite(src.bgPatternScale, def.bgPatternScale)), 50, 300),
    screenDimOpacity: clampNum(Math.round(toFinite(src.screenDimOpacity, def.screenDimOpacity)), 0, 85),
    stageBackdropBlur: clampNum(Math.round(toFinite(src.stageBackdropBlur, def.stageBackdropBlur)), 0, 32),

    fontScale: clampNum(Math.round(toFinite(src.fontScale, def.fontScale)), 75, 135),
    fontHeading: sanitizeFontName(src.fontHeading, def.fontHeading),
    fontBody: sanitizeFontName(src.fontBody, def.fontBody),
    fontMono: sanitizeFontName(src.fontMono, def.fontMono),
    googleFonts: normalizeFontList(src.googleFonts, 'google'),
    importedFonts: normalizeFontList(src.importedFonts, 'imported'),
    reducedMotion: typeof src.reducedMotion === 'boolean' ? src.reducedMotion : def.reducedMotion,

    customCssEnabled: typeof src.customCssEnabled === 'boolean' ? src.customCssEnabled : def.customCssEnabled,
    customCss: typeof src.customCss === 'string' ? src.customCss.slice(0, 60_000) : '',

    chatAndAi: normalizeChatAndAiBlock(
      src.chatAndAi && typeof src.chatAndAi === 'object' ? src.chatAndAi : {},
      def.chatAndAi,
    ),

    system: {
      lowGpu: typeof rawSys.lowGpu === 'boolean' ? rawSys.lowGpu : defSys.lowGpu,
      autoOpenBrowser: typeof rawSys.autoOpenBrowser === 'boolean' ? rawSys.autoOpenBrowser : defSys.autoOpenBrowser,
      labMode: typeof rawSys.labMode === 'boolean' ? rawSys.labMode : defSys.labMode,
      verbosePromptLogging: typeof rawSys.verbosePromptLogging === 'boolean' ? rawSys.verbosePromptLogging : defSys.verbosePromptLogging,
    },
  };
}


