import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPromptCachingBreakpoints,
  buildGeminiPayload,
  buildHeadersForProtocol,
} from '../server/services/llmProviderAdapters.js';
import { resolveModelCapabilities } from '../server/services/modelCapabilities.js';

test('promptCaching — Anthropic & OpenRouter Claude ephemeral breakpoint injection', async (t) => {
  const defaultCacheCfg = {
    enabled: true,
    cacheSystemPrompt: true,
    cacheHistoryAtDepth: true,
    historyDepth: 2,
    ttl: '5m',
    enableOnProxies: true,
  };

  await t.test('injects system & history breakpoints + 1h beta header on Anthropic protocol', () => {
    const payload = {
      model: 'claude-sonnet-4-20250514',
      system: 'You are Elowen.',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Greetings.' },
        { role: 'user', content: 'Tell me more.' },
      ],
    };
    applyPromptCachingBreakpoints(
      payload,
      { protocol: 'anthropic', upstreamModelId: 'claude-sonnet-4-20250514' },
      { ...defaultCacheCfg, ttl: '1h' },
    );

    assert.deepEqual(payload.system, [
      { type: 'text', text: 'You are Elowen.', cache_control: { type: 'ephemeral', ttl: '1h' } },
    ]);
    assert.deepEqual(payload.messages[0].content, [
      { type: 'text', text: 'Hello', cache_control: { type: 'ephemeral', ttl: '1h' } },
    ]);
    assert.equal(payload.messages[2].content, 'Tell me more.');
    assert.ok(payload._anthropicBetas.includes('extended-cache-ttl-2025-04-11'));
  });

  await t.test('injects cache_control for Claude on OpenRouter while leaving non-Claude OpenAI models untouched', () => {
    const claudeOrPayload = {
      model: 'anthropic/claude-3.7-sonnet',
      messages: [
        { role: 'system', content: 'System rules' },
        { role: 'user', content: 'Turn 1' },
        { role: 'assistant', content: 'Turn 2' },
        { role: 'user', content: 'Turn 3' },
      ],
    };
    applyPromptCachingBreakpoints(
      claudeOrPayload,
      {
        protocol: 'openai',
        endpointUrl: 'https://openrouter.ai/api/v1/chat/completions',
        upstreamModelId: 'anthropic/claude-3.7-sonnet',
      },
      defaultCacheCfg,
    );
    assert.ok(Array.isArray(claudeOrPayload.messages[0].content));
    assert.deepEqual(claudeOrPayload.messages[0].content[0].cache_control, { type: 'ephemeral' });
    assert.ok(Array.isArray(claudeOrPayload.messages[1].content));

    const deepseekPayload = {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'System rules' },
        { role: 'user', content: 'Turn 1' },
      ],
    };
    applyPromptCachingBreakpoints(
      deepseekPayload,
      {
        protocol: 'openai',
        endpointUrl: 'https://api.deepseek.com/v1/chat/completions',
        upstreamModelId: 'deepseek-chat',
      },
      defaultCacheCfg,
    );
    assert.equal(deepseekPayload.messages[0].content, 'System rules');
  });

  await t.test('injects service_tier: "flex" and X-Server-Timeout: 600 on Gemini 2.5/3/4 models when Flex is selected', () => {
    const caps = resolveModelCapabilities({
      modelId: 'gemini-2.5-pro',
      protocol: 'gemini',
      routeId: 'google-ai',
      connectionType: 'official_api',
    });
    assert.equal(caps.samplers.service_tier, true);

    const target = {
      protocol: 'gemini',
      upstreamModelId: 'gemini-2.5-pro',
      supportsReasoning: true,
    };
    const compiledFlex = {
      charName: 'Elowen',
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hello there' },
      ],
      samplers: {
        max_tokens: 1024,
        temperature: 1.0,
        top_p: 0.95,
        top_k: 40,
        seed: -1,
        use_makersuite_sysprompt: true,
        reasoning_effort: 'medium',
        show_thoughts: true,
        enable_web_search: false,
        gemini_service_tier: 'flex',
      },
    };

    const flexPayload = buildGeminiPayload(target, compiledFlex, caps, false);
    assert.equal(flexPayload.service_tier, 'flex');

    const flexHeaders = buildHeadersForProtocol(target, 'test-key', flexPayload, '');
    assert.equal(flexHeaders['X-Server-Timeout'], '600');

    const stdPayload = buildGeminiPayload(
      target,
      {
        ...compiledFlex,
        samplers: { ...compiledFlex.samplers, gemini_service_tier: 'standard' },
      },
      caps,
      false,
    );
    assert.equal(stdPayload.service_tier, undefined);

    const legacyCaps = resolveModelCapabilities({
      modelId: 'gemini-2.0-flash',
      protocol: 'gemini',
      routeId: 'google-ai',
      connectionType: 'official_api',
    });
    assert.equal(legacyCaps.samplers.service_tier, false);
  });
});
