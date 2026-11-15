import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGEX_PLACEMENT,
  SUBSTITUTE_FIND_REGEX,
  parseFindRegexString,
  sanitizeRegexFlags,
  normalizeRegexScript,
  analyzeRegexSafety,
  runRegexScript,
  applyRegexPipeline,
  debugRegexScript,
} from '../src/core/regex/regexEngine.js';

describe('regexEngine — SillyTavern RegexScriptData compatibility & safety', () => {
  it('parses `/pattern/flags` and plain patterns while sanitizing flags', () => {
    const slash = parseFindRegexString('/<status>[\\s\\S]*?<\\/status>/gim');
    assert.equal(slash.isSlashNotation, true);
    assert.equal(slash.pattern, '<status>[\\s\\S]*?<\\/status>');
    assert.equal(slash.flags, 'gim');

    const plain = parseFindRegexString('foo+bar');
    assert.equal(plain.isSlashNotation, false);
    assert.equal(plain.pattern, 'foo+bar');
    assert.equal(plain.flags, 'g');

    assert.equal(sanitizeRegexFlags('ggimuvz'), 'gimu');
  });

  it('supports $0, {{match}}, $&, $$, $1..$99, $<group>, and trimStrings', () => {
    const namedScript = normalizeRegexScript({
      findRegex: '/\\[(?<speaker>[A-Za-z]+):\\s*(?<line>[^\\]]+)\\]/g',
      replaceString: '**$<speaker>** said: "$2" (raw=$0, macro={{match}}, price=$$5)',
      trimStrings: ['*'],
      placement: [REGEX_PLACEMENT.AI_OUTPUT],
      markdownOnly: true,
    });

    const out = runRegexScript(namedScript, '[Aria: *Hello there!*]');
    assert.equal(
      out,
      '**Aria** said: "Hello there!" (raw=[Aria: Hello there!], macro=[Aria: Hello there!], price=$5)',
    );
  });

  it('expands {{char}} and {{user}} macros in RAW and ESCAPED findRegex modes', () => {
    const escapedScript = normalizeRegexScript({
      findRegex: '/^({{char}}|{{user}}):\\s*/gm',
      replaceString: '[$1] ',
      substituteRegex: SUBSTITUTE_FIND_REGEX.ESCAPED,
      placement: [REGEX_PLACEMENT.AI_OUTPUT],
    });

    const text = 'A.I. (v2): Systems online.\nAlex+1: Copy that.';
    const transformed = runRegexScript(escapedScript, text, {
      charName: 'A.I. (v2)',
      userName: 'Alex+1',
    });
    assert.equal(transformed, '[A.I. (v2)] Systems online.\n[Alex+1] Copy that.');

    const rawScript = normalizeRegexScript({
      findRegex: '/{{char}}/g',
      replaceString: '{{user}}',
      substituteRegex: SUBSTITUTE_FIND_REGEX.RAW,
      placement: [REGEX_PLACEMENT.AI_OUTPUT],
    });
    assert.equal(
      runRegexScript(rawScript, 'Aria or Alina', {
        charName: 'A(?:ria|lina)',
        userName: 'Traveler',
      }),
      'Traveler or Traveler',
    );
  });

  it('enforces minDepth, maxDepth, markdownOnly, promptOnly, streaming, and runOnEdit', () => {
    const scripts = [
      normalizeRegexScript({
        id: 'display-only',
        findRegex: '/<hud>/g',
        replaceString: '[HUD]',
        placement: [REGEX_PLACEMENT.AI_OUTPUT],
        markdownOnly: true,
        promptOnly: false,
      }),
      normalizeRegexScript({
        id: 'prompt-strip-deep',
        findRegex: '/<story>[\\s\\S]*?<\\/story>/g',
        replaceString: '',
        placement: [REGEX_PLACEMENT.AI_OUTPUT],
        markdownOnly: false,
        promptOnly: true,
        minDepth: 2,
        maxDepth: 5,
      }),
      normalizeRegexScript({
        id: 'permanent-rule',
        findRegex: '/\\bteh\\b/g',
        replaceString: 'the',
        placement: [REGEX_PLACEMENT.AI_OUTPUT],
        markdownOnly: false,
        promptOnly: false,
        runOnEdit: false,
      }),
    ];

    const sample = '<hud> <story>teh long prose</story> Summary.';

    assert.equal(
      applyRegexPipeline(sample, scripts, {
        placement: REGEX_PLACEMENT.AI_OUTPUT,
        isMarkdown: true,
        depth: 3,
      }),
      '[HUD] <story>teh long prose</story> Summary.',
    );

    assert.equal(
      applyRegexPipeline(sample, scripts, {
        placement: REGEX_PLACEMENT.AI_OUTPUT,
        isMarkdown: true,
        isStreaming: true,
        depth: 0,
      }),
      '[HUD] <story>the long prose</story> Summary.',
    );

    assert.equal(
      applyRegexPipeline(sample, scripts, {
        placement: REGEX_PLACEMENT.AI_OUTPUT,
        isPrompt: true,
        depth: 1,
      }),
      sample,
    );

    assert.equal(
      applyRegexPipeline(sample, scripts, {
        placement: REGEX_PLACEMENT.AI_OUTPUT,
        isPrompt: true,
        depth: 3,
      }),
      '<hud>  Summary.',
    );

    assert.equal(
      applyRegexPipeline(sample, scripts, {
        placement: REGEX_PLACEMENT.AI_OUTPUT,
        isPermanent: true,
        isEdit: true,
      }),
      sample,
    );
  });

  it('detects catastrophic backtracking (ReDoS) and inspects matches via debugRegexScript', () => {
    const redos = analyzeRegexSafety('/(a+)+$/g');
    assert.equal(redos.valid, true);
    assert.equal(redos.risk, 'danger');

    const invalid = analyzeRegexSafety('/([unclosed/g');
    assert.equal(invalid.valid, false);
    assert.equal(invalid.risk, 'invalid');

    const dangerousScript = normalizeRegexScript({
      findRegex: '/(a+)+b/g',
      replaceString: 'X',
      placement: [REGEX_PLACEMENT.AI_OUTPUT],
    });
    const oversized = 'a'.repeat(100);
    assert.equal(
      runRegexScript(dangerousScript, oversized, { maxInputCharsForDanger: 32 }),
      oversized,
    );

    const dbg = debugRegexScript(
      { findRegex: '/(\\w+)=(\\d+)/g', replaceString: '$1:$2' },
      'hp=100 mp=45',
    );
    assert.equal(dbg.valid, true);
    assert.equal(dbg.matchCount, 2);
    assert.equal(dbg.outputText, 'hp:100 mp:45');
    assert.deepEqual(dbg.matches[0].groups, ['hp', '100']);
  });
});
