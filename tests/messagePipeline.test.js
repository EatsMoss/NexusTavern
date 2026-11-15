import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scopeCssStylesheet,
  sanitizeMessageHtml,
} from '../src/core/messages/messageHtml.js';
import {
  extractThinkingAndCleanBody,
  extractRecapAndCleanBody,
  replaceRecapBlockInRawText,
  decorateInlineText,
  tokenizeStreamingInline,
  stripNonHtmlXmlTags,
} from '../src/core/messages/messageDecorator.js';

describe('messageHtml & messageDecorator — CSS sandbox, sanitization & tag extraction', () => {
  it('strictly scopes :root, html, body, @media, and functional pseudos to .bb-decorator-body', () => {
    const rawCss = `
      @import url("https://evil.example.com/leak.css");
      :root { --card-accent: #ff5500; }
      html, body { background: #111; color: #eee; }
      html > body .status-panel { padding: 12px; }
      :is(body, .wrapper) > .badge { border-radius: 8px; }
      @keyframes pulseGlow {
        from { opacity: 0.4; }
        to { opacity: 1; }
      }
      @media (max-width: 600px) {
        body .status-panel { padding: 6px; }
      }
    `;

    const scoped = scopeCssStylesheet(rawCss, { allowExternalMedia: true });

    assert.equal(scoped.includes('@import'), false);
    assert.equal(scoped.includes(':root'), false);
    assert.match(scoped, /\.bb-decorator-body\s*\{\s*--card-accent:\s*#ff5500;\s*\}/);
    assert.match(scoped, /\.bb-decorator-body,\s*\.bb-decorator-body\s*\{\s*background:\s*#111;/);
    assert.match(scoped, /\.bb-decorator-body\s+\.status-panel\s*\{\s*padding:\s*12px;\s*\}/);
    assert.match(scoped, /:is\(\.bb-decorator-body,\s*\.wrapper\)\s*>\s*\.badge/);
    assert.match(scoped, /@keyframes pulseGlow\s*\{\s*from\s*\{\s*opacity:\s*0\.4;\s*\}/);
    assert.match(
      scoped,
      /@media\s*\(max-width:\s*600px\)\s*\{\s*\.bb-decorator-body\s+\.status-panel\s*\{\s*padding:\s*6px;\s*\}\s*\}/,
    );
  });

  it('blocks external url(...) in CSS when allowExternalMedia is disabled', () => {
    const css = `.card { color: #fff; background-image: url("https://tracker.example/pixel.png"); }`;
    const blocked = scopeCssStylesheet(css, { allowExternalMedia: false });
    assert.equal(blocked.includes('tracker.example'), false);
    assert.equal(blocked.includes('color: #fff'), true);
  });

  it('sanitizes scripts, event handlers, and javascript: URLs while preserving rich RP HTML & scoped <style>', () => {
    const dirty = [
      '<style>:root { --hp: 90%; } .bar { width: var(--hp); }</style>',
      '<div class="bar" onclick="alert(1)" data-secret="123">HP 90%</div>',
      '<details open><summary>Inventory</summary><p>Silver key</p></details>',
      '<a href="https://example.com/lore" target="_self">Lore</a>',
      '<a href="javascript:alert(2)">Bad Link</a>',
      '<script>window.pwned = true;</script>',
      '<iframe src="https://evil.example"></iframe>',
    ].join('\n');

    const clean = sanitizeMessageHtml(dirty);

    assert.equal(clean.includes('<script'), false);
    assert.equal(clean.includes('<iframe'), false);
    assert.equal(clean.includes('onclick'), false);
    assert.equal(clean.includes('data-secret'), false);
    assert.equal(clean.includes('javascript:'), false);
    assert.equal(clean.includes('<details open'), true);
    assert.match(clean, /<style>\.bb-decorator-body\{[^}]*--hp:\s*90%/);
    assert.match(clean, /target="_blank"/);
    assert.match(clean, /rel="noopener noreferrer"/);
  });

  it('extracts closed and live-streaming <think> and <recap> blocks cleanly', () => {
    const completedMsg =
      '<think>Step 1: Evaluate tone.</think>\n\n*She smiles.*\n\n<recap><details><summary>Recap</summary>Aria greeted the user warmly.</details></recap>';

    const thought = extractThinkingAndCleanBody(completedMsg, '');
    assert.equal(thought.reasoningText, 'Step 1: Evaluate tone.');

    const recap = extractRecapAndCleanBody(thought.cleanBody, { isStreaming: false });
    assert.equal(recap.recapText, 'Aria greeted the user warmly.');
    assert.equal(recap.cleanBody, '*She smiles.*');
    assert.equal(recap.isRecapStreaming, false);

    const streamThought = extractThinkingAndCleanBody('<thinking>Drafting line...', '', {
      isStreaming: true,
    });
    assert.equal(streamThought.reasoningText, 'Drafting line...');
    assert.equal(streamThought.cleanBody, '');

    const streamRecap = extractRecapAndCleanBody('Story.\n<recap>Entered the vault', {
      isStreaming: true,
    });
    assert.equal(streamRecap.isRecapStreaming, true);
    assert.equal(streamRecap.recapText, 'Entered the vault');
    assert.equal(streamRecap.cleanBody, 'Story.');

    const updatedRaw = replaceRecapBlockInRawText(
      '<story> Main scene. </story>\n\n<recap>Old summary</recap>',
      'Updated concise summary.',
    );
    assert.equal(
      updatedRaw,
      '<story> Main scene. </story>\n\n<recap>\nUpdated concise summary.\n</recap>',
    );
  });

  it('decorates inline RP tokens and strips transparent XML wrappers outside code spans', () => {
    const decorated = decorateInlineText('*quiet sigh* "Watch out!" **BANG** `0x2A`');
    assert.match(decorated, /<em class="bb-decorator-thought">quiet sigh<\/em>/);
    assert.match(decorated, /<span class="bb-decorator-quote">&quot;Watch out!&quot;<\/span>/);
    assert.match(decorated, /<strong class="bb-decorator-bold">BANG<\/strong>/);
    assert.match(decorated, /<code class="bb-decorator-inline-code">0x2A<\/code>/);

    const tokens = tokenizeStreamingInline('She whispered, "Never look back');
    assert.equal(tokens.length, 2);
    assert.equal(tokens[1].kind, 'quote');

    const xmlCleaned = stripNonHtmlXmlTags(
      '<story><div class="card">Hello</div> `<story>kept</story>`</story>',
    );
    assert.equal(xmlCleaned, '<div class="card">Hello</div> `<story>kept</story>`');
  });
});
