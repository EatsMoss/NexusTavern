import React from 'react';
import { maybePlayCompletionChime } from '@core/customization/customizationRuntimeStore.js';
import {
  Button,
  SegmentedGroup,
  Switch,
  Slider,
  Dropdown,
  FolderCard,
} from '@ui/index.js';

const ENTER_SEND_OPTIONS = [
  { value: 'enter', label: 'Enter to Send (Shift+Enter = New Line)' },
  { value: 'ctrl-enter', label: 'Ctrl+Enter to Send (Enter = New Line)' },
  { value: 'button-only', label: 'Send Button Only' },
];

const TAIL_WINDOW_OPTIONS = [
  { value: 15, label: '15 Messages (Fastest)' },
  { value: 20, label: '20 Messages (Default)' },
  { value: 30, label: '30 Messages' },
  { value: 50, label: '50 Messages' },
];

const EXAMPLE_BEHAVIOR_OPTIONS = [
  { value: 'normal', label: 'Gradual Push-Out (Default)' },
  { value: 'keep', label: 'Always Keep in Context' },
  { value: 'strip', label: 'Never Include (Strip)' },
];

export function ChatAndAiSection({
  customization,
  forceOpen = false,
  visibleKeys = null,
}) {
  const { config, updateConfig } = customization;
  const ai = config.chatAndAi;
  const cache = ai.promptCaching;

  const patchAi = (patch) => updateConfig({ chatAndAi: patch });
  const patchCache = (patch) =>
    updateConfig({ chatAndAi: { promptCaching: patch } });
  const show = (key) => !visibleKeys || visibleKeys.has(key);

  return (
    <>
      {show('chatai-input') && (
        <FolderCard
          title="Composer, Window & Streaming"
          subtitle="Keyboard shortcuts, tail-first load & token pacing"
          icon="keyboard"
          forceOpen={forceOpen}
        >
          <Dropdown
            label="Enter Key Behavior"
            searchable={false}
            allowStars={false}
            options={ENTER_SEND_OPTIONS}
            value={ai.enterToSend}
            onChange={(enterToSend) => patchAi({ enterToSend })}
          />
          <Switch
            checked={ai.sendEmptyToContinue}
            onChange={(sendEmptyToContinue) => patchAi({ sendEmptyToContinue })}
            label="Send Empty Input to Continue"
            description="Submitting an empty composer continues the last AI reply"
          />
          <Switch
            checked={ai.restoreUnsavedDraft}
            onChange={(restoreUnsavedDraft) => patchAi({ restoreUnsavedDraft })}
            label="Restore Unsaved Composer Draft"
            description="Keep typed message text across page reloads"
          />
          <Switch
            checked={ai.confirmMessageDelete}
            onChange={(confirmMessageDelete) => patchAi({ confirmMessageDelete })}
            label="Confirm Message Deletion"
            description="Ask before deleting messages from the timeline"
          />
          <Switch
            checked={ai.clickMessageToEdit === 'double-click'}
            onChange={(on) =>
              patchAi({ clickMessageToEdit: on ? 'double-click' : 'off' })
            }
            label="Double-Click Message to Edit"
            description="Open Delta Editor by double-clicking message prose"
          />

          <Dropdown
            label="Initial Messages Window (Tail-First)"
            hint="Number of latest messages fetched upfront; AI prompt compiler always reads full .jsonl on disk"
            searchable={false}
            allowStars={false}
            options={TAIL_WINDOW_OPTIONS}
            value={ai.tailLoadCount}
            onChange={(tailLoadCount) => patchAi({ tailLoadCount: Number(tailLoadCount) })}
          />
          <Switch
            checked={ai.autoLoadLastChat}
            onChange={(autoLoadLastChat) => patchAi({ autoLoadLastChat })}
            label="Auto-Load Last Chat on Startup"
            description="Automatically reopen your most recent scenario and branch"
          />
          <Switch
            checked={ai.autoScrollOnStream}
            onChange={(autoScrollOnStream) => patchAi({ autoScrollOnStream })}
            label="Auto-Scroll During Streaming"
            description="Follow live tokens while pinned to the bottom of the chat"
          />
          <Switch
            checked={ai.smoothStreaming}
            onChange={(smoothStreaming) => patchAi({ smoothStreaming })}
            label="Smooth Word-Paced Streaming"
            description="Silky word-boundary reveal during live generation"
          />
          {ai.smoothStreaming && (
            <Switch
              checked={ai.bypassSmoothingInThinking}
              onChange={(bypassSmoothingInThinking) =>
                patchAi({ bypassSmoothingInThinking })
              }
              label="Bypass Smoothing in Thinking Blocks"
              description="Render Chain-of-Thought deltas immediately without pacing"
            />
          )}
        </FolderCard>
      )}

      {show('chatai-badges') && (
        <FolderCard
          title="Message Card Badges & Visibility"
          subtitle="Instant zero-rerender telemetry, portraits & touch gestures"
          icon="eye"
          defaultOpen={false}
          forceOpen={forceOpen}
        >
          <Switch
            checked={ai.showMessageTimer}
            onChange={(showMessageTimer) => patchAi({ showMessageTimer })}
            label="Generation Timer & Speed"
            description="Show duration and tokens/sec badge in message header"
          />
          <Switch
            checked={ai.showMessageTimestamps}
            onChange={(showMessageTimestamps) => patchAi({ showMessageTimestamps })}
            label="Message Timestamps"
            description="Show send date and time on each card"
          />
          <Switch
            checked={ai.showModelIcons}
            onChange={(showModelIcons) => patchAi({ showModelIcons })}
            label="Provider & Model Icons"
            description="Show model family emblem next to speaker name"
          />
          <Switch
            checked={ai.showMessageIds}
            onChange={(showMessageIds) => patchAi({ showMessageIds })}
            label="Sequential Message #IDs"
            description="Display #1, #2, #3 index tag on message portraits"
          />
          <Switch
            checked={ai.showMessageTokens}
            onChange={(showMessageTokens) => patchAi({ showMessageTokens })}
            label="Message Token Count"
            description="Display estimated token badge on every card"
          />
          <Switch
            checked={ai.hideChatAvatars}
            onChange={(hideChatAvatars) => patchAi({ hideChatAvatars })}
            label="Hide Chat Portraits"
            description="Pure prose novel mode without side portraits in chat"
          />
          <Switch
            checked={ai.mobileSwipeGestures}
            onChange={(mobileSwipeGestures) => patchAi({ mobileSwipeGestures })}
            label="Mobile Horizontal Swipe Gestures"
            description="Swipe left/right on touchscreens to switch or generate replies"
          />
          <Switch
            checked={ai.forbidExternalMedia}
            onChange={(forbidExternalMedia) => patchAi({ forbidExternalMedia })}
            label="Block External Remote Media"
            description="Prevent cards from loading external https:// images or CSS URLs"
          />
        </FolderCard>
      )}

      {show('chatai-formatting') && (
        <FolderCard
          title="Text Hygiene, Formatting & Reasoning"
          subtitle="Auto-clean rules (enabled by default) & Chain-of-Thought"
          icon="paragraph"
          defaultOpen={false}
          forceOpen={forceOpen}
        >
          <Switch
            checked={ai.trimSpaces}
            onChange={(trimSpaces) => patchAi({ trimSpaces })}
            label="Trim Trailing & Edge Spaces"
            description="Strip stray whitespace from prompt history and AI replies (recommended ON)"
          />
          <Switch
            checked={ai.collapseNewlines}
            onChange={(collapseNewlines) => patchAi({ collapseNewlines })}
            label="Collapse Consecutive Newlines"
            description="Normalize 3+ blank lines into clean paragraph breaks (recommended ON)"
          />
          <Switch
            checked={ai.autoFixMarkdown}
            onChange={(autoFixMarkdown) => patchAi({ autoFixMarkdown })}
            label="Auto-Fix Generated Markdown"
            description="Repair spaced * italics * and unclosed straight dialogue quotes"
          />
          <Switch
            checked={ai.trimIncompleteSentences}
            onChange={(trimIncompleteSentences) => patchAi({ trimIncompleteSentences })}
            label="Trim Incomplete Trailing Sentences"
            description="Cut unfinished final clauses when generation hits max_tokens"
          />
          <div className="bb-cust-subcard">
            <span className="bb-cust-subcard__title">Chain-of-Thought / Reasoning</span>
            <Switch
              checked={ai.reasoningAutoParse}
              onChange={(reasoningAutoParse) => patchAi({ reasoningAutoParse })}
              label="Auto-Parse <think> Blocks"
              description="Extract inline <think> / <reasoning> tags into collapsible pill"
            />
            <Switch
              checked={ai.reasoningAutoExpand}
              onChange={(reasoningAutoExpand) => patchAi({ reasoningAutoExpand })}
              label="Auto-Expand Reasoning Pill"
              description="Open Chain-of-Thought traces by default"
            />
            <Switch
              checked={ai.reasoningIncludeInPrompts}
              onChange={(reasoningIncludeInPrompts) => patchAi({ reasoningIncludeInPrompts })}
              label="Include Previous Reasoning in Prompts"
              description="Re-send recent <think> blocks into the model context"
            />
            {ai.reasoningIncludeInPrompts && (
              <Slider
                label="Max Reasoning Blocks Sent"
                hint="Counted from the end of the chat"
                value={ai.reasoningMaxAdditions}
                min={1}
                max={16}
                step={1}
                defaultValue={2}
                onChange={(reasoningMaxAdditions) => patchAi({ reasoningMaxAdditions })}
              />
            )}
          </div>

          <div className="bb-cust-subcard">
            <div className="bb-cust-subcard__head">
              <span className="bb-cust-subcard__title">Completion Sound</span>
              <Button
                variant="b2"
                size="sm"
                icon="bullhorn"
                onClick={() =>
                  maybePlayCompletionChime({
                    playCompletionSound: true,
                    soundOnlyWhenUnfocused: false,
                  })
                }
              >
                Preview
              </Button>
            </div>
            <Switch
              checked={ai.playCompletionSound}
              onChange={(playCompletionSound) => patchAi({ playCompletionSound })}
              label="Play Chime When Generation Finishes"
              description="Soft two-note Web Audio chime on reply completion"
            />
            {ai.playCompletionSound && (
              <Switch
                checked={ai.soundOnlyWhenUnfocused}
                onChange={(soundOnlyWhenUnfocused) => patchAi({ soundOnlyWhenUnfocused })}
                label="Background Tab Only"
                description="Play chime only when the browser window is unfocused"
              />
            )}
          </div>
        </FolderCard>
      )}

      {show('chatai-caching') && (
        <FolderCard
          title="Card Context & LLM Prompt Caching"
          subtitle="Card overrides & Anthropic / OpenRouter ephemeral Token Saver"
          icon="sliders"
          defaultOpen={false}
          forceOpen={forceOpen}
        >
          <Dropdown
            label="Example Dialogues Behavior"
            hint="Synced with settings.json -> example_messages_behavior"
            searchable={false}
            allowStars={false}
            options={EXAMPLE_BEHAVIOR_OPTIONS}
            value={ai.exampleMessagesBehavior}
            onChange={(exampleMessagesBehavior) => patchAi({ exampleMessagesBehavior })}
          />
          <Switch
            checked={ai.preferCharacterPrompt}
            onChange={(preferCharacterPrompt) => patchAi({ preferCharacterPrompt })}
            label="Prefer Card System Prompt"
            description="Allow character card System Prompt override when present"
          />
          <Switch
            checked={ai.preferCharacterJailbreak}
            onChange={(preferCharacterJailbreak) => patchAi({ preferCharacterJailbreak })}
            label="Prefer Card Post-History Instructions"
            description="Allow character card Post-History override when present"
          />

          <div className="bb-cust-subcard">
            <span className="bb-cust-subcard__title">
              LLM Prompt Caching (Claude &amp; OpenRouter Token Saver)
            </span>
            <Switch
              checked={cache.enabled}
              onChange={(enabled) => patchCache({ enabled })}
              label="Enable Ephemeral Prompt Caching"
              description="Saves up to 90% input cost on Anthropic & Claude via OpenRouter"
            />
            {cache.enabled && (
              <>
                <Switch
                  checked={cache.cacheSystemPrompt}
                  onChange={(cacheSystemPrompt) => patchCache({ cacheSystemPrompt })}
                  label="Cache System & Character Prefix"
                  description="Place cache breakpoint on the assembled system prompt"
                />
                <Switch
                  checked={cache.cacheHistoryAtDepth}
                  onChange={(cacheHistoryAtDepth) => patchCache({ cacheHistoryAtDepth })}
                  label="Cache Conversation History"
                  description="Place rolling cache breakpoint near the tail of chat history"
                />
                {cache.cacheHistoryAtDepth && (
                  <Slider
                    label="History Breakpoint Depth"
                    hint="Messages from the end of the conversation"
                    value={cache.historyDepth}
                    min={1}
                    max={10}
                    step={1}
                    defaultValue={2}
                    onChange={(historyDepth) => patchCache({ historyDepth })}
                  />
                )}
                <SegmentedGroup
                  fullWidth
                  value={cache.ttl}
                  onChange={(ttl) => patchCache({ ttl })}
                  options={[
                    { value: '5m', label: 'Standard 5m TTL' },
                    { value: '1h', label: 'Extended 1h TTL (Claude)' },
                  ]}
                />
                <Switch
                  checked={cache.enableOnProxies}
                  onChange={(enableOnProxies) => patchCache({ enableOnProxies })}
                  label="Enable on Custom Claude Proxies"
                  description="Forward cache_control blocks to custom/RP proxies running Claude"
                />
              </>
            )}
          </div>
        </FolderCard>
      )}
    </>
  );
}


