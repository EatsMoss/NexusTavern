import React, { useMemo } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Input } from '../../atoms/Input/Input.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { Slider } from '../../molecules/Slider/Slider.jsx';
import { Dropdown } from '../../molecules/Dropdown/Dropdown.jsx';
import { FolderCard } from '../../molecules/FolderCard/FolderCard.jsx';
import { YamlCodeField } from '../../molecules/YamlCodeField/YamlCodeField.jsx';
import { resolveModelCapabilities } from '@core/models/modelCapabilities.js';
import {
  parseAdditionalBodyInclude,
  parseAdditionalBodyExclude,
  parseAdditionalHeadersInclude,
} from '@core/presets/additionalParameters.js';

const REASONING_EFFORT_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'min', label: 'Minimum' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Maximum' },
];

const VERBOSITY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const PROMPT_POST_PROCESSING_OPTIONS = [
  { value: '', label: 'None (Default)' },
  { value: 'merge', label: 'Merge consecutive roles (no tools)' },
  { value: 'semi', label: 'Semi-strict (alternating roles; no tools)' },
  { value: 'strict', label: 'Strict (user first, alternating roles; no tools)' },
  { value: 'single', label: 'Single user message (no tools)' },
  { value: 'merge_tools', label: 'Merge consecutive roles (with tools)' },
  { value: 'semi_tools', label: 'Semi-strict (alternating roles; with tools)' },
  { value: 'strict_tools', label: 'Strict (user first, alternating roles; with tools)' },
];

const NAMES_BEHAVIOR_OPTIONS = [
  { value: '-1', label: 'None — Never add character names' },
  { value: '0', label: 'Default — Groups & non-trivial names' },
  { value: '1', label: 'Completion — Message object name field' },
  { value: '2', label: 'Content — Prepend "Name: " to messages' },
];

const CONTINUE_POSTFIX_OPTIONS = [
  { value: '', label: 'None' },
  { value: ' ', label: 'Space' },
  { value: '\n', label: 'Newline' },
  { value: '\n\n', label: 'Double Newline' },
];

const INLINE_IMAGE_QUALITY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
];

function resolveNamesBehaviorValue(oaiData = {}) {
  if (oaiData.names_behavior !== undefined && oaiData.names_behavior !== null) {
    const num = Number(oaiData.names_behavior);
    if ([-1, 0, 1, 2].includes(num)) return String(num);
  }
  if (oaiData.names_in_completion) return '2';
  return '0';
}

function getReasoningEffortHint(caps) {
  if (caps.profileId === 'claude_45_plus' || caps.profileId === 'claude_legacy') {
    if (caps.isClaudeAdaptive) {
      return 'Adaptive thinking (Opus/Sonnet 4.6+): sets output effort level. Auto does not force thinking.';
    }
    return 'Claude Thinking budget: Min (1024 tok), Low (10%), Med (25%), High (50%), Max (95%). Auto omits forced thinking.';
  }
  if (caps.profileId === 'gemini') {
    return 'Gemini Thinking: sets dynamic thinking level (Gemini 3) or token budget (Gemini 2.5). Auto lets the model decide.';
  }
  return 'Constrains reasoning depth (low / medium / high; min & max map per provider). Auto omits explicit effort.';
}

export function PresetSamplersTab({
  isOpenai = true,
  oaiData = {},
  patchOaiField,
  tgData = {},
  patchTgField,
  activeModelMeta = null,
}) {
  const caps = useMemo(
    () =>
      resolveModelCapabilities({
        modelId: activeModelMeta?.modelId || '',
        protocol: activeModelMeta?.protocol || 'openai',
        routeId: activeModelMeta?.routeId || '',
        connectionType: activeModelMeta?.connectionType || '',
      }),
    [
      activeModelMeta?.modelId,
      activeModelMeta?.protocol,
      activeModelMeta?.routeId,
      activeModelMeta?.connectionType,
    ],
  );

  const additionalDiag = useMemo(() => {
    const inc = parseAdditionalBodyInclude(oaiData.custom_include_body);
    const exc = parseAdditionalBodyExclude(oaiData.custom_exclude_body);
    const hdr = parseAdditionalHeadersInclude(oaiData.custom_include_headers);
    const hasError = !inc.valid || !exc.valid || !hdr.valid;
    const activeFields =
      (inc.valid && inc.count > 0 ? 1 : 0) +
      (exc.valid && exc.count > 0 ? 1 : 0) +
      (hdr.valid && hdr.count > 0 ? 1 : 0);
    return { hasError, activeFields };
  }, [
    oaiData.custom_include_body,
    oaiData.custom_exclude_body,
    oaiData.custom_include_headers,
  ]);

  if (!isOpenai) {
    return (
      <FolderCard
        title="TextGen Samplers"
        subtitle="Local LLM generation parameters"
        icon="sliders"
        defaultOpen
      >
        <Slider
          label="Temperature"
          value={Number(tgData.temp ?? tgData.temperature ?? 0.7)}
          min={0.05}
          max={2}
          step={0.01}
          defaultValue={0.7}
          onChange={(val) => patchTgField?.({ temp: val })}
        />
        <Slider
          label="Top-P"
          value={Number(tgData.top_p ?? 0.9)}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.9}
          onChange={(val) => patchTgField?.({ top_p: val })}
        />
        <Slider
          label="Min-P"
          value={Number(tgData.min_p ?? 0)}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0}
          onChange={(val) => patchTgField?.({ min_p: val })}
        />
        <Slider
          label="Repetition Penalty"
          value={Number(tgData.rep_pen ?? 1.1)}
          min={1}
          max={2}
          step={0.01}
          defaultValue={1.1}
          onChange={(val) => patchTgField?.({ rep_pen: val })}
        />
      </FolderCard>
    );
  }

  const rawEffort = String(
    oaiData.reasoning_effort ?? oaiData.openai_reasoning_effort ?? 'auto',
  )
    .trim()
    .toLowerCase();
  const activeReasoningEffort = REASONING_EFFORT_OPTIONS.some((o) => o.value === rawEffort)
    ? rawEffort
    : 'auto';

  const rawVerbosity = String(oaiData.verbosity ?? 'auto')
    .trim()
    .toLowerCase();
  const activeVerbosity = VERBOSITY_OPTIONS.some((o) => o.value === rawVerbosity)
    ? rawVerbosity
    : 'auto';

  const mediaInliningEnabled = Boolean(
    oaiData.media_inlining ?? oaiData.image_inlining ?? true,
  );
  const activeImageQuality = INLINE_IMAGE_QUALITY_OPTIONS.some(
    (o) => o.value === String(oaiData.inline_image_quality || '').toLowerCase(),
  )
    ? String(oaiData.inline_image_quality).toLowerCase()
    : 'auto';

  const rawContinuePostfix =
    oaiData.continue_postfix !== undefined && oaiData.continue_postfix !== null
      ? String(oaiData.continue_postfix)
      : ' ';
  const activeContinuePostfix = CONTINUE_POSTFIX_OPTIONS.some(
    (o) => o.value === rawContinuePostfix,
  )
    ? rawContinuePostfix
    : ' ';

  return (
    <>
      <FolderCard
        title="Chat Settings (Context & Length)"
        subtitle="Context window budget, response length & streaming"
        icon="sliders"
        defaultOpen
      >
        {oaiData._nexus_has_proxy_password && (
          <div
            className="bb-caption-text"
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              background: 'var(--bb-m3-surface-container-highest, rgba(201, 151, 91, 0.12))',
              border: '1px solid var(--bb-m3-outline-variant, rgba(201, 151, 91, 0.3))',
            }}
          >
            Zero-Trust Protected: preset contains embedded <code>proxy_password</code> (
            <strong>{oaiData._nexus_proxy_password_masked}</strong>).
          </div>
        )}

        <Slider
          label="Context Size (Tokens)"
          value={Math.min(2000000, Number(oaiData.openai_max_context ?? 16384))}
          min={512}
          max={oaiData.max_context_unlocked ? 2000000 : 200000}
          inputMax={2000000}
          step={512}
          defaultValue={16384}
          unit="tok"
          onChange={(val) =>
            patchOaiField?.({
              openai_max_context: val,
              ...(val > 200000 && !oaiData.max_context_unlocked
                ? { max_context_unlocked: true }
                : {}),
            })
          }
        />
        <Slider
          label="Max Response Length (Tokens)"
          value={Math.min(256000, Number(oaiData.openai_max_tokens ?? 1000))}
          min={32}
          max={oaiData.max_context_unlocked ? 256000 : 131072}
          inputMax={256000}
          step={32}
          defaultValue={1024}
          unit="tok"
          onChange={(val) =>
            patchOaiField?.({
              openai_max_tokens: val,
              ...(val > 131072 && !oaiData.max_context_unlocked
                ? { max_context_unlocked: true }
                : {}),
            })
          }
        />
        <Switch
          checked={Boolean(oaiData.max_context_unlocked ?? false)}
          onChange={(val) => patchOaiField?.({ max_context_unlocked: val })}
          label="Unlocked Context Size"
          description="Expand context slider up to 2,000,000 tokens and max output up to 256,000 tokens"
        />
        <Switch
          checked={Boolean(oaiData.stream_openai ?? true)}
          onChange={(val) => patchOaiField?.({ stream_openai: val })}
          label="Streaming"
          description="Stream tokens incrementally as they are generated"
        />
      </FolderCard>
      <FolderCard
        title="Model Parameters (Samplers)"
        subtitle={
          activeModelMeta?.modelId
            ? `${caps.familyLabel} (${activeModelMeta.modelName || activeModelMeta.modelId}) — compatible parameters`
            : 'Temperature, nucleus sampling & repetition penalties'
        }
        icon="sliders"
        defaultOpen
      >
        {!caps.samplers.temperature &&
          !caps.samplers.top_p &&
          !caps.samplers.top_k &&
          !caps.samplers.frequency_penalty && (
            <div className="bb-caption-text" style={{ padding: '4px 2px' }}>
              <strong>{caps.familyLabel}</strong> manages sampling internally and does not accept
              manual temperature or penalty parameters.
            </div>
          )}

        {caps.samplers.temperature && (
          <Slider
            label="Temperature"
            value={Math.min(caps.maxTemperature, Number(oaiData.temperature ?? 1))}
            min={0}
            max={caps.maxTemperature}
            step={0.01}
            defaultValue={1.0}
            onChange={(val) => patchOaiField?.({ temperature: val })}
          />
        )}
        {caps.samplers.top_p && (
          <Slider
            label="Top P"
            value={Number(oaiData.top_p ?? 1)}
            min={0}
            max={1}
            step={0.01}
            defaultValue={1.0}
            onChange={(val) => patchOaiField?.({ top_p: val })}
          />
        )}
        {caps.samplers.top_k && (
          <Slider
            label="Top K"
            value={Number(oaiData.top_k ?? 0)}
            min={0}
            max={500}
            step={1}
            defaultValue={0}
            onChange={(val) => patchOaiField?.({ top_k: val })}
          />
        )}
        {caps.samplers.min_p && (
          <Slider
            label="Min P"
            value={Number(oaiData.min_p ?? 0)}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0}
            onChange={(val) => patchOaiField?.({ min_p: val })}
          />
        )}
        {caps.samplers.top_a && (
          <Slider
            label="Top A"
            value={Number(oaiData.top_a ?? 0)}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0}
            onChange={(val) => patchOaiField?.({ top_a: val })}
          />
        )}
        {caps.samplers.frequency_penalty && (
          <Slider
            label="Frequency Penalty"
            value={Number(oaiData.frequency_penalty ?? 0)}
            min={-2}
            max={2}
            step={0.05}
            defaultValue={0}
            onChange={(val) => patchOaiField?.({ frequency_penalty: val })}
          />
        )}
        {caps.samplers.presence_penalty && (
          <Slider
            label="Presence Penalty"
            value={Number(oaiData.presence_penalty ?? 0)}
            min={-2}
            max={2}
            step={0.05}
            defaultValue={0}
            onChange={(val) => patchOaiField?.({ presence_penalty: val })}
          />
        )}
        {caps.samplers.repetition_penalty && (
          <Slider
            label="Repetition Penalty"
            value={Number(oaiData.repetition_penalty ?? 1)}
            min={1}
            max={2}
            step={0.01}
            defaultValue={1.0}
            onChange={(val) => patchOaiField?.({ repetition_penalty: val })}
          />
        )}
        {caps.samplers.seed && (
          <Input
            label="Seed (-1 for random)"
            type="number"
            value={String(oaiData.seed ?? -1)}
            onChange={(e) => patchOaiField?.({ seed: Number(e.target.value) })}
          />
        )}
      </FolderCard>

      <FolderCard
        title="Reasoning & Effort"
        subtitle="Chain-of-Thought depth, thinking budget & output effort"
        icon="lightbulb"
        defaultOpen
      >
        {caps.samplers.reasoning_effort && (
          <Dropdown
            label="Reasoning Effort"
            hint={getReasoningEffortHint(caps)}
            options={REASONING_EFFORT_OPTIONS}
            value={activeReasoningEffort}
            searchable={false}
            allowStars={false}
            onChange={(val) =>
              patchOaiField?.({
                reasoning_effort: val,
                ...(oaiData.openai_reasoning_effort !== undefined
                  ? { openai_reasoning_effort: val }
                  : {}),
              })
            }
          />
        )}

        {caps.samplers.verbosity && (
          <Dropdown
            label="Verbosity / Output Effort"
            hint="Constrains response detail level (GPT-5 verbosity & Claude 4.5+ output effort; Auto omits override)."
            options={VERBOSITY_OPTIONS}
            value={activeVerbosity}
            searchable={false}
            allowStars={false}
            onChange={(val) => patchOaiField?.({ verbosity: val })}
          />
        )}

        <Switch
          checked={Boolean(oaiData.show_thoughts ?? true)}
          onChange={(val) => patchOaiField?.({ show_thoughts: val })}
          label="Request Model Reasoning / Thoughts"
          description="Include thinking process blocks when supported by the model"
        />
      </FolderCard>

      <FolderCard
        title="Prompt Processing & Behavior"
        subtitle="Role post-processing, character names, continue & inline media"
        icon="sparkles"
        defaultOpen
      >
        <Dropdown
          label="Prompt Post-Processing"
          options={PROMPT_POST_PROCESSING_OPTIONS}
          value={String(oaiData.custom_prompt_post_processing || '')}
          searchable={false}
          allowStars={false}
          onChange={(val) => patchOaiField?.({ custom_prompt_post_processing: val })}
        />

        <Dropdown
          label="Character Names Behavior"
          options={NAMES_BEHAVIOR_OPTIONS}
          value={resolveNamesBehaviorValue(oaiData)}
          searchable={false}
          allowStars={false}
          onChange={(val) => {
            const num = Number(val);
            patchOaiField?.({
              names_behavior: num,
              names_in_completion: num === 1 || num === 2,
            });
          }}
        />

        <Switch
          checked={Boolean(oaiData.squash_system_messages ?? false)}
          onChange={(val) => patchOaiField?.({ squash_system_messages: val })}
          label="Squash System Messages"
          description="Combine consecutive system prompts into a single block (excluding example dialogues)"
        />

        <Dropdown
          label="Continue Postfix"
          hint="Separator inserted before the next chunk when continuing an assistant message."
          options={CONTINUE_POSTFIX_OPTIONS}
          value={activeContinuePostfix}
          searchable={false}
          allowStars={false}
          onChange={(val) => patchOaiField?.({ continue_postfix: val })}
        />

        <Switch
          checked={Boolean(oaiData.continue_prefill ?? false)}
          onChange={(val) => patchOaiField?.({ continue_prefill: val })}
          label="Continue Prefill"
          description="Send the last message as an assistant turn instead of appending a system continue nudge"
        />

        <Switch
          checked={mediaInliningEnabled}
          onChange={(val) =>
            patchOaiField?.({ media_inlining: val, image_inlining: val })
          }
          label="Send Inline Media"
          description="Attach chat images directly in prompts when supported by the model"
        />

        {mediaInliningEnabled && (
          <Dropdown
            label="Inline Image Quality"
            options={INLINE_IMAGE_QUALITY_OPTIONS}
            value={activeImageQuality}
            searchable={false}
            allowStars={false}
            onChange={(val) => patchOaiField?.({ inline_image_quality: val })}
          />
        )}

        {caps.samplers.web_search && (
          <Switch
            checked={Boolean(oaiData.enable_web_search ?? false)}
            onChange={(val) => patchOaiField?.({ enable_web_search: val })}
            label="Enable Web Search"
            description="Allow backend web search grounding when supported by the provider"
          />
        )}
      </FolderCard>

      <FolderCard
        title="Additional Parameters"
        subtitle="Custom YAML / JSON request body overrides & headers"
        icon="fileCode"
        defaultOpen={false}
        actions={
          additionalDiag.hasError ? (
            <span className="bb-samplers-header-pill is-invalid">
              <Icon name="errorCircle" size={12} />
              <span>YAML Error</span>
            </span>
          ) : additionalDiag.activeFields > 0 ? (
            <span className="bb-samplers-header-pill is-active">
              <Icon name="check" size={12} />
              <span>{additionalDiag.activeFields} active</span>
            </span>
          ) : null
        }
      >
        <YamlCodeField
          id="bb-custom-include-body"
          label="Include Body Parameters"
          hint="Merged into request body; auto-maps standard keys & safetySettings across OpenAI, Claude & Gemini."
          mode="object"
          rows={4}
          placeholder={`stop: ["."]\nsafetySettings:\n  HATE_SPEECH: OFF`}
          value={String(oaiData.custom_include_body || '')}
          onChange={(val) => patchOaiField?.({ custom_include_body: val })}
        />

        <YamlCodeField
          id="bb-custom-exclude-body"
          label="Exclude Body Parameters"
          hint="Removed from the outgoing JSON body right before sending."
          mode="exclude-keys"
          rows={3}
          placeholder={`- frequency_penalty\n- presence_penalty`}
          value={String(oaiData.custom_exclude_body || '')}
          onChange={(val) => patchOaiField?.({ custom_exclude_body: val })}
        />

        <YamlCodeField
          id="bb-custom-include-headers"
          label="Include Request Headers"
          hint="Extra HTTP headers attached to generation requests."
          mode="headers"
          rows={3}
          placeholder={`anthropic-beta: output-128k-2025-02-19\nX-Custom-Header: value`}
          value={String(oaiData.custom_include_headers || '')}
          onChange={(val) => patchOaiField?.({ custom_include_headers: val })}
        />
      </FolderCard>
    </>
  );
}
