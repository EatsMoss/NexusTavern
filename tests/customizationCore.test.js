import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_THEME_PRESETS,
  DEFAULT_CUSTOMIZATION_CONFIG,
  normalizeCustomizationConfig,
  parseGoogleFontUrl,
} from '@core/customization/customizationDefaults.js';
import {
  buildDerivedTavernPalette,
  resolveEffectiveChatTextColors,
} from '@core/customization/paletteEngine.js';
import { extractColorClustersFromRgbSamples } from '@core/customization/portraitPalette.js';
import {
  decorateInlineText,
  tokenizeStreamingInline,
  applyTextFormattingRules,
  decoratorStyles,
} from '@core/messages/messageDecorator.js';

test('customizationCore — Indigo Slate default, automatic palette engine & RP apostrophes/formatting', async (t) => {
  await t.test('keeps Indigo Slate as default and enables ST Formatting hygiene rules by default', () => {
    const cfg = normalizeCustomizationConfig({});
    assert.equal(cfg.activePresetId, 'indigo-slate');
    assert.equal(cfg.primaryColor, '#6D6D83');
    assert.equal(cfg.accentColor, '#6575B3');
    assert.equal(cfg.chatAndAi.trimSpaces, true);
    assert.equal(cfg.chatAndAi.collapseNewlines, true);
    assert.equal(cfg.chatAndAi.autoFixMarkdown, true);
    assert.equal(BUILTIN_THEME_PRESETS[0].id, 'indigo-slate');
    assert.ok(BUILTIN_THEME_PRESETS.some((p) => p.id === 'bronze-tome'));
    assert.ok(BUILTIN_THEME_PRESETS.some((p) => p.id === 'crimson-eclipse'));
    assert.ok(BUILTIN_THEME_PRESETS.some((p) => p.id === 'abyssal-void'));
  });

  await t.test('derives full Dark & Light M3 + 8-slot RP chat typography palettes automatically', () => {
    const darkPal = buildDerivedTavernPalette(DEFAULT_CUSTOMIZATION_CONFIG);
    assert.equal(darkPal.themeMode, 'dark');
    assert.ok(darkPal.vars['--bb-sheet-bg']);
    const chatColors = resolveEffectiveChatTextColors(DEFAULT_CUSTOMIZATION_CONFIG, darkPal);
    assert.match(chatColors.apostrophe, /^#[0-9A-F]{6}$/);
    assert.match(chatColors.quote, /^#[0-9A-F]{6}$/);

    const lightPal = buildDerivedTavernPalette({
      themeMode: 'light',
      colorScheme: 'two-color',
      primaryColor: '#EDE3D2',
      accentColor: '#B08248',
    });
    assert.equal(lightPal.themeMode, 'light');
    assert.ok(lightPal.chatTextPalette.apostrophe);
  });

  await t.test('decorates single-quoted RP apostrophes without underline while preserving English contractions', () => {
    const sample = `She didn't look back. 'I'm still waiting for Elowen's signal,' she thought, whispering "Don't move."`;
    const html = decorateInlineText(sample);
    assert.ok(html.includes('didn&#39;t look back.'));
    assert.ok(
      html.includes(
        `<span class="bb-decorator-apostrophe">&#39;I&#39;m still waiting for Elowen&#39;s signal,&#39;</span>`,
      ),
    );
    assert.ok(html.includes(`<span class="bb-decorator-quote">&quot;Don&#39;t move.&quot;</span>`));
    assert.ok(decoratorStyles().includes('.bb-decorator-apostrophe'));
    assert.ok(decoratorStyles().includes('text-decoration: none'));

    const streamSegs = tokenizeStreamingInline(`He paused. 'Maybe it's not too late`);
    assert.equal(streamSegs[streamSegs.length - 1].kind, 'apostrophe');
  });

  await t.test('applies ST Formatting hygiene rules (trimSpaces, collapseNewlines, autoFixMarkdown)', () => {
    const messy = '  Hello there!   \n\n\n\n* softly sighs *  \n\n"Wait for me   ';
    const cleaned = applyTextFormattingRules(messy);
    assert.equal(cleaned, 'Hello there!\n\n*softly sighs*\n\n"Wait for me"');
  });

  await t.test('parses Google Fonts URLs and clusters RGB portrait samples cleanly', () => {
    const parsed = parseGoogleFontUrl(
      'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;700&display=swap',
    );
    assert.deepEqual(parsed?.families, ['Cormorant Garamond']);

    const samples = [
      ...Array.from({ length: 40 }, () => ({ r: 30, g: 34, b: 48 })),
      ...Array.from({ length: 25 }, () => ({ r: 196, g: 138, b: 84 })),
    ];
    const clusters = extractColorClustersFromRgbSamples(samples, 2);
    assert.equal(clusters.length, 2);
  });

  await t.test('normalizes clean system block without legacy ST rudiments', () => {
    const cfg = normalizeCustomizationConfig({
      system: {
        lowGpu: true,
        autoOpenBrowser: false,
        labMode: true,
        verbosePromptLogging: true,
      },
    });
    assert.deepEqual(cfg.system, {
      lowGpu: true,
      autoOpenBrowser: false,
    });
  });
});
