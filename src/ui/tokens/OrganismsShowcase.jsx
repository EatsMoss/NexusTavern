import React, { useState } from 'react';
import {
  Button,
  Input,
  FolderCard,
  Dropdown,
  MarkdownEditor,
  PinnedLayout,
  Modal,
  ImageCropModal,
  UnsavedChangesModal,
  TopBar,
  ChatMessageCard,
  ConsoleToggleButton,
} from '@ui/index.js';
import { WelcomeModal } from '../organisms/WelcomeModal/WelcomeModal.jsx';
import { PromptEditorSheet } from '../organisms/PromptManager/PromptEditorSheet.jsx';
import { RefusalCatcherManager } from '../organisms/RefusalCatcherManager/RefusalCatcherManager.jsx';
import { MessageRecapManager } from '../organisms/MessageRecapManager/MessageRecapManager.jsx';
import { StImporterManager } from '../organisms/StImporterManager/StImporterManager.jsx';
import { ConsoleDrawer } from '../organisms/ConsoleDrawer/ConsoleDrawer.jsx';
import { AdaptiveShellShowcase } from './AdaptiveShellShowcase.jsx';
import { DEFAULT_BANNED_PHRASES } from '@core/refusal/refusalEngine.js';
import { normalizeRecapConfig } from '@core/recap/recapEngine.js';

const MODEL_OPTIONS = [
  { value: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet (Extended Thinking)', meta: '200k' },
  { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet (20241022)', meta: '200k' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro Experimental', meta: '1M' },
  { value: 'gpt-4o-latest', label: 'ChatGPT-4o Latest', meta: '128k' },
  { value: 'deepseek-r1', label: 'DeepSeek R1 (Reasoning)', meta: '64k' },
  { value: 'mistral-large', label: 'Mistral Large 2411', meta: '128k' },
];

const PRESET_OPTIONS = [
  {
    value: 'nexustavern-prose-v3',
    label: 'NexusTavern Literary Prose v3',
    timestamp: 'Nov 14 · 18:39',
    updatedAtMs: 1794670740000,
    meta: '24 prompts',
  },
  {
    value: 'dark-fantasy-grimoire',
    label: 'Dark Fantasy Grimoire',
    timestamp: 'Nov 12 · 00:03',
    updatedAtMs: 1794441780000,
    meta: '19 prompts',
  },
  {
    value: 'celestial-Slowburn',
    label: 'Celestial Slowburn Narrative',
    timestamp: 'Oct 28 · 21:15',
    updatedAtMs: 1793222100000,
    meta: '31 prompts',
  },
  {
    value: 'concise-dialogue',
    label: 'Crisp Dialogue & Subtext',
    timestamp: 'Sep 09 · 14:20',
    updatedAtMs: 1788963600000,
    meta: '14 prompts',
  },
];

const INITIAL_FOLDERS = [
  { id: 'folder-fantasy', name: 'Arcane & Fantasy' },
  { id: 'folder-scifi', name: 'Astral Sci-Fi' },
];

const INITIAL_CARDS = [
  { id: 'c1', name: 'Elowen Vane', initials: 'EV', pinned: true, folderId: null, badge: 'v3', tags: ['fantasy'] },
  { id: 'c2', name: 'Seraphina', initials: 'SR', pinned: true, folderId: null, badge: 'v2', tags: ['fantasy'] },
  { id: 'c3', name: 'Kaelen Thorne', initials: 'KT', pinned: true, folderId: 'folder-fantasy', badge: 'v3', tags: ['fantasy'] },
  { id: 'c4', name: 'Lyra Noctis', initials: 'LN', pinned: true, folderId: 'folder-fantasy', badge: 'v2', tags: ['fantasy'] },
  { id: 'c5', name: 'Vespera IX', initials: 'VX', pinned: true, folderId: 'folder-scifi', badge: 'v3', tags: ['sci-fi'] },
  { id: 'c6', name: 'Orion Vance', initials: 'OV', pinned: false, folderId: null, badge: 'v2', tags: ['sci-fi'] },
  { id: 'c7', name: 'Morgause', initials: 'MG', pinned: false, folderId: null, badge: 'v3', tags: ['fantasy'] },
  { id: 'c8', name: 'Cassian', initials: 'CS', pinned: false, folderId: null, badge: 'v2', tags: ['modern'] },
];

export function OrganismsShowcase() {
  const [selectedModel, setSelectedModel] = useState('claude-3-7-sonnet');
  const [starredModels, setStarredModels] = useState(['claude-3-7-sonnet', 'gemini-2.5-pro']);
  const [selectedPreset, setSelectedPreset] = useState('nexustavern-prose-v3');
  const [starredPresets, setStarredPresets] = useState(['nexustavern-prose-v3']);
  const [selectedStreams, setSelectedStreams] = useState(['ai', 'thoughts']);
  const [cards, setCards] = useState(INITIAL_CARDS);
  const [selectedCardId, setSelectedCardId] = useState('c1');
  const [modalOpen, setModalOpen] = useState(false);
  const [cropDemoOpen, setCropDemoOpen] = useState(false);
  const [welcomeDemoOpen, setWelcomeDemoOpen] = useState(false);
  const [unsavedDemoOpen, setUnsavedDemoOpen] = useState(false);
  const [demoChatListOpen, setDemoChatListOpen] = useState(false);
  const [demoSwipeId, setDemoSwipeId] = useState(1);
  const [demoSwipeCount, setDemoSwipeCount] = useState(3);
  const [demoRefusalEnabled, setDemoRefusalEnabled] = useState(true);
  const [demoFallbackEnabled, setDemoFallbackEnabled] = useState(true);
  const [demoFallbackTarget, setDemoFallbackTarget] = useState({
    connId: 'rp-club',
    modelId: 'deepseek-r1',
  });
  const [demoBannedPhrases, setDemoBannedPhrases] = useState(() => [
    ...DEFAULT_BANNED_PHRASES,
  ]);
  const [demoRecapConfig, setDemoRecapConfig] = useState(() =>
    normalizeRecapConfig({ enabled: true, keepFullDepth: 4 }),
  );
  const [demoStRootPath, setDemoStRootPath] = useState('C:\\SillyTavern');
  const [demoStConflictMode, setDemoStConflictMode] = useState('skip');
  const [demoStCategories, setDemoStCategories] = useState({
    backgrounds: true,
    characters: true,
    personas: true,
    regex: true,
    chats: true,
  });
  const [demoPromptTarget, setDemoPromptTarget] = useState({
    identifier: 'main',
    defaultName: 'Main Prompt',
    name: 'Literary Prose Directives',
    bb_icon: '✒️',
    role: 'system',
    injection_position: 0,
    injection_depth: 4,
    injection_order: 100,
    forbid_overrides: false,
    injection_trigger: ['normal', 'swipe'],
    content:
      'Write immersive third-person prose as {{char}} interacting with {{user}}. Prioritize subtext, sensory grounding, and natural pacing.',
  });
  const [mdText, setMdText] = useState(
    `### Archive Entry: {{char}}
*The rain tapped against the stained glass as **{{char}}** looked up from the open ledger.*
"You are late, {{user}}. Did you bring the \`cipher_key\` or only excuses?"

<details>
<summary>Pokédex — Field Notes</summary>
<table>
<tr><th>Entry</th><th>Type</th><th>Status</th></tr>
<tr><td>#001 Bulbasaur</td><td>Grass</td><td>Calm</td></tr>
<tr><td>#007 Squirtle</td><td>Water</td><td>Alert</td></tr>
</table>
<p>Access code: <input type="text" placeholder="Enter passphrase" /></p>
</details>`,
  );

  const toggleStar = (list, setList, val) => {
    setList(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  };

  const handleTogglePin = (id, forcePin) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, pinned: forcePin !== undefined ? forcePin : !c.pinned, folderId: null }
          : c,
      ),
    );
  };

  const handleMoveToFolder = (id, folderId) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: true, folderId } : c)),
    );
  };

  return (
    <section className="bb-sandbox-section">
      <div className="bb-sandbox-section-head">
        <div>
          <h2 className="bb-t1-heading">Organisms</h2>
          <p className="bb-caption-text">
            Starred searchable dropdowns, the pinned gallery layout, popup modals and the live-syntax Markdown editor.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button variant="b1" emphasis="tonal" icon="crop" onClick={() => setCropDemoOpen(true)}>
            Preview M3 ImageCropModal
          </Button>
          <Button variant="b1" emphasis="tonal" icon="sparkles" onClick={() => setWelcomeDemoOpen(true)}>
            Preview First-Run Welcome Modal
          </Button>
          <Button variant="b1" emphasis="filled" icon="expand" onClick={() => setModalOpen(true)}>
            Open Popup Window (Modal)
          </Button>
        </div>
      </div>

      <div className="bb-grid">
        {/* Left column: TopBar + Starred Dropdowns + Live Markdown Editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FolderCard
            title="TopBar (Participant AvatarStack 35% + 36-char Chat Title)"
            subtitle="Scenario (front) + Persona (35% deeper right) + 36-char chat title; opens Chat History"
            icon="sliders"
          >
            <TopBar
              chatTitle="Elowen Vane - 2026-11-12@14h30m12s - Branch #2.jsonl"
              participants={[
                {
                  id: 'sc',
                  name: 'Elowen Vane',
                  initials: 'EV',
                  avatarUrl:
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="%2336426e"/><circle cx="40" cy="38" r="16" fill="%23e5e9ff"/><path d="M16 98c4-22 14-34 24-34s20 12 24 34" fill="%23e5e9ff"/></svg>',
                },
                {
                  id: 'pe',
                  name: 'Alden Thorne',
                  initials: 'AT',
                  avatarUrl:
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="%237a5240"/><circle cx="40" cy="38" r="16" fill="%23ffe7d6"/><path d="M16 98c4-22 14-34 24-34s20 12 24 34" fill="%23ffe7d6"/></svg>',
                },
              ]}
              chatListOpen={demoChatListOpen}
              onToggleChatList={() => setDemoChatListOpen((v) => !v)}
              onBackToChat={() => setDemoChatListOpen(false)}
              onToggleLeft={() => {}}
              onToggleRight={() => {}}
              onToggleTimelines={() => {}}
              onCreateNewChat={() => {}}
              style={{ margin: 0, width: '100%' }}
            />
          </FolderCard>

          <FolderCard
            title="Custom Starred Dropdowns"
            subtitle="Searchable portal with Favorites (★) section"
            icon="star"
          >
            <Dropdown
              label="Active LLM Model"
              options={MODEL_OPTIONS}
              value={selectedModel}
              onChange={setSelectedModel}
              starredValues={starredModels}
              onToggleStar={(val) => toggleStar(starredModels, setStarredModels, val)}
            />
            <Dropdown
              label="Chat Completion Preset"
              options={PRESET_OPTIONS}
              value={selectedPreset}
              onChange={setSelectedPreset}
              starredValues={starredPresets}
              sortable
              onToggleStar={(val) => toggleStar(starredPresets, setStarredPresets, val)}
            />
            <Dropdown
              label="Multi-Select Checkbox Dropdown"
              multiple
              minSelected={1}
              searchable={false}
              allowStars={false}
              options={[
                { value: 'ai', label: 'AI Replies', shortLabel: 'AI', meta: 'Assistant' },
                { value: 'user', label: 'User Messages', shortLabel: 'User', meta: 'You' },
                { value: 'thoughts', label: 'Reasoning', shortLabel: 'Thoughts', meta: 'CoT' },
                { value: 'lore', label: 'World Info', shortLabel: 'Lore', meta: 'Lorebook' },
              ]}
              value={selectedStreams}
              onChange={setSelectedStreams}
            />
          </FolderCard>

          <FolderCard
            title="Live-Markdown Editor"
            subtitle="Formatting toolbar, {{char}}/{{user}} macro pills & syntax view"
            icon="edit"
          >
            <MarkdownEditor
              label="First Message / Opening Greeting"
              value={mdText}
              onChange={setMdText}
            />
          </FolderCard>

          <FolderCard
            title="PromptEditorSheet (Central M3 Workspace Sheet)"
            subtitle="Single-screen compact delivery controls + full-height MarkdownEditor + Apply/Discard bar"
            icon="edit"
          >
            <div style={{ height: 520, display: 'flex', flexDirection: 'column' }}>
              <PromptEditorSheet
                mode="prompt"
                target={demoPromptTarget}
                onSavePrompt={setDemoPromptTarget}
                onClose={() => {}}
              />
            </div>
          </FolderCard>

          <FolderCard
            title="ChatMessageCard & MessageDecorator"
            subtitle="Quotes, italic thoughts, collapsible Chain-of-Thought, timer & Lazy Swipes"
            icon="sparkles"
          >
            <ChatMessageCard
              userName="Alden"
              charName="Elowen Vane"
              charInitials="EV"
              isLast
              message={{
                index: 11,
                sender: 'Elowen Vane',
                isUser: false,
                time: '21:42',
                tokens: 184,
                durationMs: 3800,
                reasoningDurationMs: 2100,
                api: 'claude',
                model: 'claude-3-7-sonnet',
                fallbackInfo: {
                  fromApi: 'Google AI',
                  fromModel: 'gemini-2.5-pro',
                  toApi: 'Anthropic Proxy',
                  toModel: 'claude-3-7-sonnet',
                  triggerType: 'safety_filter',
                  reason: 'Safety filter block (prohibited_content)',
                  error: 'Google AI (400): Request blocked due to PROHIBITED_CONTENT',
                },
                swipeId: demoSwipeId,
                swipeCount: demoSwipeCount,
                reasoning:
                  'Analyzing {{user}}\'s question about the Astral Seal. Elowen should remain guarded while hinting at the cipher inside the archive.',
                text: mdText,
              }}
              onSwipe={(_, nextIdx) => setDemoSwipeId(nextIdx)}
              onGenerateSwipe={() => {
                setDemoSwipeCount((c) => {
                  const next = c + 1;
                  setDemoSwipeId(next - 1);
                  return next;
                });
              }}
              onContinue={() => {}}
              onDeleteSwipe={() => {
                if (demoSwipeCount > 1) {
                  setDemoSwipeCount((c) => c - 1);
                  setDemoSwipeId((idx) => Math.max(0, idx - 1));
                }
              }}
              onCreateBranch={() => {}}
              onReturnToParentChat={() => {}}
              parentChatLabel="Root Chat"
              onSaveEdit={(_, nextText) => setMdText(nextText)}
            />
          </FolderCard>

          <MessageRecapManager
            collapsible
            defaultOpen
            config={demoRecapConfig}
            savedChatTokens={4580}
            tokenContext={{ charName: 'Elowen Vane', userName: 'Aki' }}
            onPatchConfig={(patch) =>
              setDemoRecapConfig((prev) => normalizeRecapConfig({ ...prev, ...patch }))
            }
            onResetDefaults={() =>
              setDemoRecapConfig((prev) =>
                normalizeRecapConfig({ enabled: prev.enabled }),
              )
            }
            onImportConfig={setDemoRecapConfig}
          />

          <RefusalCatcherManager
            collapsible
            defaultOpen
            enabled={demoRefusalEnabled}
            bannedPhrases={demoBannedPhrases}
            onToggleEnabled={setDemoRefusalEnabled}
            onAddPhrase={(phrase) =>
              setDemoBannedPhrases((prev) => [phrase, ...prev])
            }
            onRemovePhrase={(phrase) =>
              setDemoBannedPhrases((prev) => prev.filter((item) => item !== phrase))
            }
            onReplacePhrases={setDemoBannedPhrases}
            fallbackEnabled={demoFallbackEnabled}
            fallbackConnectionId={demoFallbackTarget.connId}
            fallbackModelId={demoFallbackTarget.modelId}
            onToggleFallbackEnabled={setDemoFallbackEnabled}
            onSelectFallbackTarget={(connId, modId) =>
              setDemoFallbackTarget((prev) => ({
                connId,
                modelId: modId || prev.modelId,
              }))
            }
            connections={[
              {
                id: 'rp-club',
                type: 'rp_proxy',
                name: 'RP Proxy',
                isConfigured: true,
                hasKey: true,
                aliveKeysCount: 1,
                deadKeysCount: 0,
                health: { state: 'online', latencyMs: 112 },
                models: [
                  { id: 'deepseek-r1', name: 'DeepSeek R1 (Uncensored)', family: 'deepseek' },
                  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', family: 'claude' },
                ],
              },
            ]}
          />

          <StImporterManager
            collapsible
            defaultOpen
            rootPath={demoStRootPath}
            onChangeRootPath={setDemoStRootPath}
            categories={demoStCategories}
            onToggleCategory={(id, nextVal) =>
              setDemoStCategories((prev) => ({ ...prev, [id]: nextVal }))
            }
            onSetAllCategories={(val) =>
              setDemoStCategories({
                backgrounds: val,
                characters: val,
                personas: val,
                regex: val,
                chats: val,
              })
            }
            conflictMode={demoStConflictMode}
            onChangeConflictMode={setDemoStConflictMode}
            scanSummary={{
              resolvedRoot: demoStRootPath || 'C:\\SillyTavern',
              activeProfile: 'default-user',
              profilePath: 'C:\\SillyTavern\\data\\default-user',
              profiles: [{ id: 'default-user', label: 'default-user (Primary)' }],
              counts: {
                backgrounds: { total: 34 },
                characters: { total: 118, cards: 118, tags: 6, groups: 2 },
                personas: { total: 8, avatars: 8 },
                regex: { total: 17 },
                chats: { total: 420, characterChats: 412, groupChats: 8, attachments: 96 },
              },
            }}
          />

          <FolderCard
            title="ConsoleDrawer & ConsoleToggleButton (SillyTavern-Parity Output Console)"
            subtitle="M3 Solid Sheet docked console with separated Prompt / Output / Change / System cards"
            icon="terminal"
            actions={<ConsoleToggleButton open label="Console" onClick={() => {}} />}
          >
            <ConsoleDrawer
              open
              embedded
              resizable={false}
              defaultHeight={280}
              entries={[
                {
                  id: 'demo_1',
                  seq: 1,
                  timestamp: '2026-11-15T12:00:01.120Z',
                  category: 'change',
                  level: 'info',
                  scope: 'Model Picker',
                  title: 'Switched active target to RP Proxy → Claude 3.7 Sonnet',
                  badges: [{ label: 'Claude 3.7 Sonnet', tone: 'accent' }],
                },
                {
                  id: 'demo_2',
                  seq: 2,
                  timestamp: '2026-11-15T12:00:04.450Z',
                  category: 'prompt',
                  level: 'info',
                  scope: 'LLM Request',
                  title: 'Generating REPLY via RP Proxy → Claude 3.7 Sonnet',
                  summary: '2 wire turns (~612 tok) • Preset "NexusTavern Literary Prose v3"',
                  badges: [
                    { label: 'REPLY', tone: 'accent' },
                    { label: 'ANTHROPIC', tone: 'neutral' },
                    { label: '~612 tok', tone: 'neutral' },
                  ],
                  details: {
                    endpoint: 'https://proxy.example/anthropic/v1/messages',
                    protocol: 'anthropic',
                    character: 'Elowen Vane',
                    user: 'Alden Thorne',
                    presetName: 'NexusTavern Literary Prose v3',
                    totalTokens: 612,
                    wireSamplers: { temperature: 0.95, max_tokens: 2048 },
                    messages: [
                      {
                        index: 0,
                        role: 'system',
                        content: 'Write atmospheric third-person prose as Elowen Vane.',
                        tokens: 14,
                        chars: 52,
                        images: 0,
                      },
                      {
                        index: 1,
                        role: 'user',
                        content: 'Alden stepped across the rain-slick threshold.',
                        tokens: 12,
                        chars: 46,
                        images: 0,
                      },
                    ],
                  },
                },
                {
                  id: 'demo_3',
                  seq: 3,
                  timestamp: '2026-11-15T12:00:08.910Z',
                  category: 'output',
                  level: 'success',
                  scope: 'LLM Output',
                  title: 'Completed REPLY from RP Proxy → Claude 3.7 Sonnet',
                  summary: '~94 tok in 4.46s (21.1 tok/s) • Saved to "Elowen Vane - Branch #2.jsonl"',
                  badges: [
                    { label: 'OK', tone: 'ok' },
                    { label: '~94 tok', tone: 'neutral' },
                    { label: '21.1 t/s', tone: 'accent' },
                  ],
                  details: {
                    status: 'completed',
                    modelName: 'Claude 3.7 Sonnet',
                    ttftMs: 620,
                    durationMs: 4460,
                    outputTokens: 94,
                    responseTokens: 94,
                    tokensPerSec: 21.1,
                    response:
                      '*Elowen lowered the brass lantern, watching rain drip from the hem of his cloak.*\n"You brought the ledger, then."',
                    savedFile: 'Elowen Vane - Branch #2.jsonl',
                  },
                },
              ]}
            />
          </FolderCard>
        </div>

        {/* Right column: PinnedLayout with 2x2 Folders, Splitter & Drag-and-Drop */}
        <FolderCard
          title="PinnedLayout (2:3 Cards + Tag Folders + Drag & Drop)"
          subtitle="Click a folder to expand, drag cards to pin/folder, or use ⋮ menu"
          icon="folder"
          actions={
            <div style={{ display: 'inline-flex', gap: 6 }}>
              <Button
                variant="b1"
                size="sm"
                emphasis="tonal"
                icon="warning"
                title="Preview M3 UnsavedChangesModal"
                onClick={() => setUnsavedDemoOpen(true)}
              >
                Unsaved Guard
              </Button>
              <Button
                variant="b2"
                size="sm"
                icon="expand"
                title="Open selected card in popup window"
                onClick={() => setModalOpen(true)}
              />
            </div>
          }
        >
          <PinnedLayout
            items={cards}
            folders={INITIAL_FOLDERS}
            selectedId={selectedCardId}
            onSelect={setSelectedCardId}
            onTogglePin={handleTogglePin}
            onMoveToFolder={handleMoveToFolder}
          />
        </FolderCard>
      </div>

      <div style={{ marginTop: 18 }}>
        <AdaptiveShellShowcase />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Character & Scenario Sheet — Elowen Vane"
        subtitle="NexusTavern Popup Window (.bb-expand-frame style)"
        icon="book"
        width={680}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" icon="close" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="b1" emphasis="filled" icon="check" onClick={() => setModalOpen(false)}>
              Save Changes
            </Button>
          </>
        }
      >
        <div className="bb-grid">
          <Input
            label="Character Name"
            defaultValue="Elowen Vane"
            hint="Character Card Spec v2 / v3"
          />
          <Dropdown
            label="Assigned Model Override"
            options={MODEL_OPTIONS}
            value={selectedModel}
            onChange={setSelectedModel}
            starredValues={starredModels}
            onToggleStar={(val) => toggleStar(starredModels, setStarredModels, val)}
          />
        </div>
        <MarkdownEditor
          label="Character Description & Lore"
          value={mdText}
          onChange={setMdText}
        />
      </Modal>

      <ImageCropModal
        open={cropDemoOpen}
        imageSrc="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%232b3354'/><stop offset='100%' stop-color='%236575b3'/></linearGradient></defs><rect width='900' height='900' fill='url(%23g)'/><circle cx='450' cy='360' r='130' fill='%23ececf4' opacity='0.9'/><path d='M230 820c35-170 130-260 220-260s185 90 220 260' fill='%23ececf4' opacity='0.85'/></svg>"
        fileName="demo-square-artwork.png"
        title="Crop Portrait (2:3 M3 Preview)"
        onCancel={() => setCropDemoOpen(false)}
        onConfirm={() => setCropDemoOpen(false)}
      />

      <WelcomeModal
        open={welcomeDemoOpen}
        onClose={() => setWelcomeDemoOpen(false)}
        onStartEmpty={() => setWelcomeDemoOpen(false)}
        onCreatePersona={() => setWelcomeDemoOpen(false)}
        importer={{
          isLocalHost: true,
          canBrowseNative: true,
          rootPath: demoStRootPath,
          handleChangeRootPath: setDemoStRootPath,
          handleBrowseDirectory: () => {},
          handleScanDirectory: () => {},
          handleClearSavedState: () => setDemoStRootPath(''),
          browsing: false,
          scanning: false,
          scanSummary: null,
          scanError: '',
          selectedProfile: 'default-user',
          handleSelectProfile: () => {},
          categories: demoStCategories,
          handleToggleCategory: (id, nextVal) =>
            setDemoStCategories((prev) => ({ ...prev, [id]: nextVal })),
          handleSetAllCategories: (val) =>
            setDemoStCategories({
              backgrounds: val,
              characters: val,
              personas: val,
              regex: val,
              chats: val,
            }),
          conflictMode: demoStConflictMode,
          setConflictMode: setDemoStConflictMode,
          job: null,
          lastReport: null,
          handleStartImport: () => {},
          handleCancelImport: () => {},
          handleDismissReport: () => {},
        }}
      />

      <UnsavedChangesModal
        open={unsavedDemoOpen}
        subtitle='Scenario: "Elowen Vane"'
        itemName="Elowen Vane"
        onCancel={() => setUnsavedDemoOpen(false)}
        onDiscard={() => setUnsavedDemoOpen(false)}
        onSave={() => setUnsavedDemoOpen(false)}
      />
    </section>
  );
}
