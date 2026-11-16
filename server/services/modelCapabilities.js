/**
 * Server-side model capability matrix for sampler filtering, temperature clamping,
 * role-alternation normalization, and trailing-assistant protection.
 */
export function resolveModelCapabilities({
  modelId = '',
  protocol = 'openai',
  routeId = '',
  connectionType = '',
} = {}) {
  const id = String(modelId || '').toLowerCase();
  const route = String(routeId || '').toLowerCase();
  const proto = String(protocol || 'openai').toLowerCase();

  const isClaude =
    proto === 'anthropic' ||
    route.includes('claude') ||
    route === 'anthropic' ||
    id.includes('claude');

  const isClaudeThinkingCapable =
    isClaude &&
    (/(?:claude[-_a-z]*[-_](?:3[-_.]?7|4|5|6)|(?:sonnet|opus|haiku|fable)[-_]?(?:3[-_.]?7|4|5|6))/i.test(
      id,
    ) ||
      id.includes('thinking'));

  const isClaude45Plus =
    isClaude &&
    (/(?:claude[-_a-z]*[-_](?:4[-_.]?[56789]|5|6)|(?:sonnet|opus|haiku|fable)[-_]?(?:4[-_.]?[56789]|5|6))/i.test(
      id,
    ) ||
      id.includes('thinking'));

  const isClaudeAdaptive =
    isClaude &&
    /(?:claude[-_a-z]*[-_](?:4[-_.]?[6789]|5|6)|(?:sonnet|opus)[-_]?(?:4[-_.]?[6789]|5|6))/i.test(
      id,
    );

  const isGemini =
    proto === 'gemini' ||
    route.includes('google') ||
    route.includes('gemini') ||
    route.includes('vertex') ||
    id.includes('gemini') ||
    id.includes('gemma') ||
    id.includes('learnlm');

  const isOpenAiReasoning =
    /^(?:o1|o3|o4)(?:[-_]|$)/i.test(id) ||
    id.includes('/o1') ||
    id.includes('/o3') ||
    id.includes('/o4');

  const isGpt5 = /^gpt-5(?:[-_.]|$)/i.test(id) || id.includes('/gpt-5');

  const isDeepSeekReasoner =
    id.includes('deepseek-reasoner') ||
    id.includes('deepseek-r1') ||
    /(?:^|\/|-)r1(?:[-_]|$)/i.test(id);

  const isGrok = route === 'xai' || id.includes('grok');
  const isMistral =
    route.includes('mistral') ||
    id.includes('mistral') ||
    id.includes('ministral') ||
    id.includes('pixtral') ||
    id.includes('codestral');

  if (isClaude45Plus) {
    const isThinkingVariant = id.includes('thinking');
    return {
      profileId: 'claude_45_plus',
      familyLabel: isClaudeAdaptive
        ? 'Claude 4.6+ (Adaptive)'
        : isThinkingVariant
          ? 'Claude 4.5+ (Thinking)'
          : 'Claude 4.5+ / 5',
      maxTemperature: 1.0,
      isClaudeAdaptive,
      isClaudeThinkingCapable: true,
      samplers: {
        temperature: !isThinkingVariant,
        top_p: false,
        top_k: proto === 'anthropic' && !isThinkingVariant,
        min_p: false,
        top_a: false,
        frequency_penalty: false,
        presence_penalty: false,
        repetition_penalty: false,
        seed: false,
        reasoning_effort: true,
        verbosity: true,
        web_search: true,
      },
      strictAlternation: true,
      allowTrailingAssistant: false,
    };
  }

  if (isClaude) {
    return {
      profileId: 'claude_legacy',
      familyLabel: isClaudeThinkingCapable ? 'Claude 3.7 / 4' : 'Claude 3.x',
      maxTemperature: 1.0,
      isClaudeAdaptive: false,
      isClaudeThinkingCapable,
      samplers: {
        temperature: true,
        top_p: false,
        top_k: proto === 'anthropic',
        min_p: false,
        top_a: false,
        frequency_penalty: false,
        presence_penalty: false,
        repetition_penalty: false,
        seed: false,
        reasoning_effort: isClaudeThinkingCapable,
        verbosity: false,
        web_search: isClaudeThinkingCapable || id.includes('3-5') || id.includes('3.5'),
      },
      strictAlternation: true,
      allowTrailingAssistant: proto === 'anthropic' && !id.includes('thinking'),
    };
  }

  if (isGemini) {
    const isGemmaOrLearn = id.includes('gemma') || id.includes('learnlm');
    const isModernGemini25Plus =
      !isGemmaOrLearn &&
      (id.includes('2.5') ||
        id.includes('3.') ||
        id.includes('gemini-3') ||
        id.includes('gemini-4') ||
        /(?:^|\/|-)4(?:[-_.]|$)/.test(id) ||
        !id);
    const supportsGeminiThinking = isModernGemini25Plus || (!isGemmaOrLearn && id.includes('thinking'));
    const supportsGeminiFlex = proto === 'gemini' && isModernGemini25Plus;
    return {
      profileId: 'gemini',
      familyLabel: 'Google Gemini',
      maxTemperature: 2.0,
      samplers: {
        temperature: true,
        top_p: true,
        top_k: proto === 'gemini',
        min_p: false,
        top_a: false,
        frequency_penalty: false,
        presence_penalty: false,
        repetition_penalty: false,
        seed: true,
        reasoning_effort: supportsGeminiThinking,
        verbosity: false,
        web_search: !isGemmaOrLearn,
        service_tier: supportsGeminiFlex,
      },
      strictAlternation: true,
      allowTrailingAssistant: false,
    };
  }

  if (isOpenAiReasoning) {
    return {
      profileId: 'openai_reasoning',
      familyLabel: 'OpenAI Reasoning (o-series)',
      maxTemperature: 1.0,
      samplers: {
        temperature: false,
        top_p: false,
        top_k: false,
        min_p: false,
        top_a: false,
        frequency_penalty: false,
        presence_penalty: false,
        repetition_penalty: false,
        seed: true,
        reasoning_effort: true,
        verbosity: false,
        web_search: true,
      },
      strictAlternation: false,
      allowTrailingAssistant: false,
    };
  }

  if (isDeepSeekReasoner) {
    const allowProxyReasoning =
      connectionType !== 'official_api' || route.includes('openrouter');
    return {
      profileId: 'deepseek_reasoner',
      familyLabel: 'DeepSeek Reasoner (R1)',
      maxTemperature: 2.0,
      samplers: {
        temperature: false,
        top_p: false,
        top_k: false,
        min_p: false,
        top_a: false,
        frequency_penalty: false,
        presence_penalty: false,
        repetition_penalty: false,
        seed: false,
        reasoning_effort: allowProxyReasoning,
        verbosity: false,
        web_search: route.includes('openrouter'),
      },
      strictAlternation: true,
      allowTrailingAssistant: false,
    };
  }

  if (isGrok) {
    return {
      profileId: 'grok',
      familyLabel: 'xAI Grok',
      maxTemperature: 2.0,
      samplers: {
        temperature: true,
        top_p: true,
        top_k: false,
        min_p: false,
        top_a: false,
        frequency_penalty: false,
        presence_penalty: false,
        repetition_penalty: false,
        seed: true,
        reasoning_effort: true,
        verbosity: false,
        web_search: true,
      },
      strictAlternation: false,
      allowTrailingAssistant: false,
    };
  }

  if (isMistral) {
    return {
      profileId: 'mistral',
      familyLabel: 'Mistral AI',
      maxTemperature: 1.5,
      samplers: {
        temperature: true,
        top_p: true,
        top_k: false,
        min_p: false,
        top_a: false,
        frequency_penalty: true,
        presence_penalty: true,
        repetition_penalty: false,
        seed: true,
        reasoning_effort: id.includes('magistral') || route.includes('openrouter'),
        verbosity: false,
        web_search: route.includes('openrouter'),
      },
      strictAlternation: true,
      allowTrailingAssistant: false,
    };
  }

  const isOpenRouter = route.includes('openrouter');
  const allowExtendedSamplers =
    isOpenRouter ||
    (connectionType !== 'official_api' && !route.includes('azure') && !id.startsWith('gpt-'));

  return {
    profileId: isGpt5 ? 'openai_gpt5' : 'openai_standard',
    familyLabel: isGpt5 ? 'OpenAI GPT-5' : 'OpenAI-Compatible',
    maxTemperature: 2.0,
    samplers: {
      temperature: true,
      top_p: true,
      top_k: allowExtendedSamplers,
      min_p: allowExtendedSamplers,
      top_a: allowExtendedSamplers,
      frequency_penalty: !isGpt5,
      presence_penalty: !isGpt5,
      repetition_penalty: allowExtendedSamplers,
      seed: true,
      reasoning_effort: isGpt5 || isOpenRouter || connectionType !== 'official_api' || !id,
      verbosity: isGpt5 || isOpenRouter || connectionType !== 'official_api' || !id,
      web_search: isGpt5 || isOpenRouter || connectionType !== 'official_api',
    },
    strictAlternation: false,
    allowTrailingAssistant: false,
  };
}
