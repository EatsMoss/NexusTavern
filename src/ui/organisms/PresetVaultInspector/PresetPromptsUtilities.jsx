import React from 'react';
import { Input, Textarea } from '../../atoms/Input/Input.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { FolderCard } from '../../molecules/FolderCard/FolderCard.jsx';

export function PresetPromptsUtilities({ oaiData = {}, patchOaiField }) {
  return (
    <>
      <FolderCard
        title="Prompt Utilities & Formats"
        subtitle="World Info, Scenario, Personality, Group & Continue Nudges"
        icon="paragraph"
        defaultOpen={false}
      >
        <Input
          label="World Info Format ({0})"
          value={oaiData.wi_format || ''}
          onChange={(e) => patchOaiField?.({ wi_format: e.target.value })}
        />
        <Input
          label="Scenario Format ({{scenario}})"
          value={oaiData.scenario_format || ''}
          onChange={(e) => patchOaiField?.({ scenario_format: e.target.value })}
        />
        <Input
          label="Personality Format ({{personality}})"
          value={oaiData.personality_format || ''}
          onChange={(e) => patchOaiField?.({ personality_format: e.target.value })}
        />
        <div className="bb-samplers-grid-2col">
          <Input
            label="New Chat Prompt"
            value={oaiData.new_chat_prompt || ''}
            onChange={(e) => patchOaiField?.({ new_chat_prompt: e.target.value })}
          />
          <Input
            label="New Example Chat"
            value={oaiData.new_example_chat_prompt || ''}
            onChange={(e) => patchOaiField?.({ new_example_chat_prompt: e.target.value })}
          />
        </div>
        <Input
          label="New Group Chat Prompt"
          value={oaiData.new_group_chat_prompt || ''}
          onChange={(e) => patchOaiField?.({ new_group_chat_prompt: e.target.value })}
        />
        <Input
          label="Group Nudge Prompt"
          value={oaiData.group_nudge_prompt || ''}
          onChange={(e) => patchOaiField?.({ group_nudge_prompt: e.target.value })}
        />
        <Textarea
          label="Continue Nudge Prompt"
          rows={2}
          value={oaiData.continue_nudge_prompt || ''}
          onChange={(e) => patchOaiField?.({ continue_nudge_prompt: e.target.value })}
        />
      </FolderCard>

      <FolderCard
        title="Prefill & System Settings"
        subtitle="Assistant prefill & system prompt flags"
        icon="sparkles"
        defaultOpen={false}
      >
        <Textarea
          label="Claude / Assistant Prefill"
          rows={2}
          placeholder="Optional assistant response starter..."
          value={oaiData.claude_assistant_prefill || ''}
          onChange={(e) => patchOaiField?.({ claude_assistant_prefill: e.target.value })}
        />
        <Switch
          checked={Boolean(oaiData.claude_use_sysprompt ?? true)}
          onChange={(val) => patchOaiField?.({ claude_use_sysprompt: val })}
          label="Use System Prompt (Claude)"
        />
        <Switch
          checked={Boolean(oaiData.use_makersuite_sysprompt ?? true)}
          onChange={(val) => patchOaiField?.({ use_makersuite_sysprompt: val })}
          label="Use System Prompt (Gemini / AI Studio)"
        />
      </FolderCard>
    </>
  );
}
