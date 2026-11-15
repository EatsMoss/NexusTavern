import React, { useState, useRef } from 'react';
import {
  Badge,
  Button,
  SegmentedGroup,
  Input,
  SearchInput,
  Textarea,
  Switch,
  Checkbox,
  Slider,
  BookmarkRibbons,
  FolderCard,
  OverlayScrollArea,
  TagChip,
  ToggleGroup,
  ChipScrollStrip,
  TagPicker,
  CharacterCardTile,
  CharacterCardRow,
  InlineEditableTitle,
  IntroCard,
  SortableStack,
  ConnectionModelPicker,
  PersonaChip,
  AvatarStack,
  ScenarioLinkActionButton,
  ScenarioBindingBar,
  Tooltip,
  ModelIcon,
  ToastStack,
  useToastQueue,
  BrandLogo,
  ProgressIndicator,
  TypingDots,
  Skeleton,
  SkeletonMessage,
  SkeletonListRow,
  SkeletonTimelineGroup,
  SplashScreen,
  RegexPatternInput,
  YamlCodeField,
  EmojiPicker,
  AttachmentTray,
  createAttachmentDraft,
  FloatingPalette,
  FloatingPaletteButton,
  FloatingPaletteDivider,
  FloatingPaletteReadout,
  MessageRecapBox,
} from '@ui/index.js';

const LEFT_TOME_TABS = [
  { id: 'characters', label: 'Characters', icon: 'addressCard' },
  { id: 'chats', label: 'Chats', icon: 'comments' },
  { id: 'worldinfo', label: 'Journal', icon: 'bookAtlas' },
  { id: 'usersettings', label: 'Settings', icon: 'settings' },
];

const RIGHT_TOME_TABS = [
  { id: 'selected', label: 'Selected', icon: 'bookOpen' },
  { id: 'aiconfig', label: 'Prompts', icon: 'sliders' },
  { id: 'media', label: 'Media', icon: 'images' },
  { id: 'extensions', label: 'Plugins', icon: 'puzzle' },
];

const PANEL_SUB_TABS = [
  { id: 'prompts', label: 'Prompts' },
  { id: 'samplers', label: 'Samplers' },
];

export function AtomsMoleculesShowcase() {
  const [leftTab, setLeftTab] = useState('chats');
  const [rightTab, setRightTab] = useState('selected');
  const [panelSubTab, setPanelSubTab] = useState('prompts');
  const [viewMode, setViewMode] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [charName, setCharName] = useState('Elowen Vane');
  const [scenarioPrompt, setScenarioPrompt] = useState(
    'An ancient observatory suspended above a sea of resonant clouds.',
  );
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [promptCacheEnabled, setPromptCacheEnabled] = useState(true);
  const [temperature, setTemperature] = useState(1.05);
  const [minP, setMinP] = useState(0.08);
  const [contextTokens, setContextTokens] = useState(16384);
  const [favPinned, setFavPinned] = useState(true);
  const scrollDemoRef = useRef(null);

  // Step 4.2.2 — character gallery kit demo state
  const [chipStates, setChipStates] = useState({
    yaoi: 'or',
    hide: 'not',
    fantasy: 'and',
  });
  const [activeTagIds, setActiveTagIds] = useState(['t1']);
  const [galleryCols, setGalleryCols] = useState('4');
  const [demoCardSize, setDemoCardSize] = useState(120);
  const [galleryAspect, setGalleryAspect] = useState('portrait');
  const [entityFilter, setEntityFilter] = useState('scenarios');
  const [gallerySort, setGallerySort] = useState('recent');
  const [multiSelectActive, setMultiSelectActive] = useState(true);
  const [tileChecked, setTileChecked] = useState(true);
  const [demoRegexPattern, setDemoRegexPattern] = useState('/<status>([\\s\\S]*?)<\\/status>/gi');
  const [demoRecapText, setDemoRecapText] = useState(
    'Elowen met Aki in the rain-streaked observatory, lowered her lantern, and asked: "Did you bring the cipher_key or only excuses?"',
  );
  const [demoYamlInclude, setDemoYamlInclude] = useState(
    'top_k: 40\nprovider:\n  allow_fallbacks: false',
  );
  const [multiSelectedIds, setMultiSelectedIds] = useState(['demo-2']);
  const [pickedTileId, setPickedTileId] = useState('demo-1');
  const [demoModelSel, setDemoModelSel] = useState({
    providerId: 'openrouter',
    modelId: 'anthropic/claude-3.7-sonnet',
  });
  const [selectedDemoIntroIdx, setSelectedDemoIntroIdx] = useState(0);
  const [demoProgress, setDemoProgress] = useState(64);
  const [splashOverlayPreview, setSplashOverlayPreview] = useState(false);
  const [sandboxEmoji, setSandboxEmoji] = useState('✨');
  const [sandboxEmojiPopoverOpen, setSandboxEmojiPopoverOpen] = useState(false);
  const sandboxEmojiBtnRef = useRef(null);
  const sandboxFileInputRef = useRef(null);
  const INITIAL_DEMO_ATTACHMENTS = [
    {
      id: 'demo-att-img',
      name: 'Observatory_Concept_Art.svg',
      size: 48200,
      ext: 'svg',
      kind: 'image',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="380"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23232946"/><stop offset="100%" stop-color="%23533a71"/></linearGradient></defs><rect width="100%" height="100%" fill="url(%23g)"/><circle cx="490" cy="96" r="46" fill="%23eebbc3" opacity="0.85"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="%23fffffe" font-family="Georgia" font-size="26">Observatory Above the Clouds</text></svg>',
      previewUrl:
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="380"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23232946"/><stop offset="100%" stop-color="%23533a71"/></linearGradient></defs><rect width="100%" height="100%" fill="url(%23g)"/><circle cx="490" cy="96" r="46" fill="%23eebbc3" opacity="0.85"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="%23fffffe" font-family="Georgia" font-size="26">Observatory Above the Clouds</text></svg>',
    },
    {
      id: 'demo-att-md',
      name: 'lore_notes_chapter_1.md',
      size: 2840,
      ext: 'md',
      kind: 'text',
      url: '',
      textContent:
        '# Chapter I — The Resonant Spire\n\n- Altitude: 4,200 meters above the cloud sea\n- Keeper: Elowen Vane\n- Active wards: Astral Compass, Brass Astrolabe\n',
    },
  ];
  const [sandboxAttachments, setSandboxAttachments] = useState(INITIAL_DEMO_ATTACHMENTS);
  const demoBindScenarios = [
    {
      avatar: 'elowen.png',
      name: 'Elowen Vane',
      initials: 'EV',
      avatarUrl:
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="%2336426e"/><circle cx="40" cy="38" r="16" fill="%23e5e9ff"/><path d="M16 98c4-22 14-34 24-34s20 12 24 34" fill="%23e5e9ff"/></svg>',
    },
    {
      avatar: 'seraphina.png',
      name: 'Seraphina',
      initials: 'SR',
      avatarUrl:
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="%236a3c58"/><circle cx="40" cy="38" r="16" fill="%23ffe4f2"/><path d="M16 98c4-22 14-34 24-34s20 12 24 34" fill="%23ffe4f2"/></svg>',
    },
    {
      avatar: 'alden.png',
      name: 'Alden Thorne',
      initials: 'AT',
      avatarUrl:
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="%237a5240"/><circle cx="40" cy="38" r="16" fill="%23ffe7d6"/><path d="M16 98c4-22 14-34 24-34s20 12 24 34" fill="%23ffe7d6"/></svg>',
    },
  ];
  const [demoBoundAvatars, setDemoBoundAvatars] = useState(['elowen.png', 'seraphina.png']);
  const {
    toasts: sandboxToasts,
    pushToast: pushSandboxToast,
    dismissToast: dismissSandboxToast,
  } = useToastQueue();
  const [demoIntros, setDemoIntros] = useState([
    {
      id: 'i1',
      title: 'Rain over the Observatory',
      text: 'The brass astrolabe hums softly as rain streaks down the domed glass. Elowen glances over her shoulder, lowering her lantern. "You actually made the climb before midnight."',
      portraitUrl: null,
    },
    {
      id: 'i2',
      title: 'Lower Archive Ambush',
      text: 'Dust motes scatter in the beam of a cracked rune-lamp while distant footsteps echo along the iron catwalk. "Quiet," she whispers, drawing thebolt back.',
      portraitUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="100%" height="100%" fill="%232b3354"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="%23dce2ff" font-family="Georgia" font-size="22">EV</text></svg>',
    },
  ]);

  const demoTags = [
    { id: 't1', name: 'Yaoi', count: 2 },
    { id: 't2', name: 'hide', count: 0 },
    { id: 't3', name: 'fantasy', count: 7 },
    { id: 't4', name: 'sci-fi', count: 3 },
  ];

  const demoTiles = [
    {
      id: 'demo-1',
      name: 'Elowen Vane',
      subtitle: 'Archivist',
      chatsCount: 12,
      latestChatPreview: 'Elowen lowers her quill, her gaze lingering on the engraved rings of the astrolabe. "You actually found it in the sunken observatory?"',
      initials: 'EV',
      pinned: true,
      tags: ['fantasy'],
    },
    {
      id: 'demo-2',
      name: 'Seraphina',
      subtitle: 'High Cleric',
      chatsCount: 3,
      latestChatPreview: 'Silver incense curls beneath the vaulted ribs of the cathedral as she turns toward {{user}}.',
      initials: 'SR',
      tags: ['fantasy', 'yaoi'],
    },
    {
      id: 'demo-3',
      name: 'Vespera IX',
      subtitle: 'Ship AI',
      chatsCount: 0,
      firstMesPreview: 'Orbital telemetry stabilized. Hull integrity at 98%. Good morning, {{user}} — awaiting your coordinates.',
      initials: 'VX',
      tags: ['sci-fi'],
    },
    {
      id: 'demo-4',
      name: 'Cassian',
      subtitle: '',
      chatsCount: 1,
      latestChatPreview: 'Neon reflections ripple across the wet asphalt outside the late-night diner.',
      initials: 'CS',
      tags: ['modern'],
    },
  ];

  const cycleChip = (key) => {
    setChipStates((prev) => {
      const order = ['or', 'and', 'not'];
      const next = order[(order.indexOf(prev[key]) + 1) % order.length];
      return { ...prev, [key]: next };
    });
  };

  return (
    <section className="bb-sandbox-section">
      <div className="bb-sandbox-section-head">
        <div>
          <h2 className="bb-t1-heading">
            Atoms &amp; Molecules
          </h2>
          <p className="bb-caption-text">
            Tome tabs, buttons B1–B4, inputs, search, switches, checkboxes, sliders, tag chips and collapsible folder cards.
          </p>
        </div>
      </div>

      <div className="bb-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bb-space-2)' }}>
          <span className="bb-t3-heading">Left Tome Navigation (M3 Bottom Underline Tabs)</span>
          <BookmarkRibbons tabs={LEFT_TOME_TABS} activeId={leftTab} onChange={setLeftTab} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bb-space-2)' }}>
          <span className="bb-t3-heading">Right Tome Navigation (M3 Bottom Underline Tabs)</span>
          <BookmarkRibbons tabs={RIGHT_TOME_TABS} activeId={rightTab} onChange={setRightTab} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bb-space-2)' }}>
          <span className="bb-t3-heading">Secondary Sheet / Preset Sub-Tabs</span>
          <BookmarkRibbons
            variant="secondary"
            tabs={PANEL_SUB_TABS}
            activeId={panelSubTab}
            onChange={setPanelSubTab}
          />
        </div>
      </div>
      <div className="bb-grid">
        <FolderCard
          title="Buttons (B1–B4) & Segmented Controls"
          subtitle="M3 state layers (8% hover / 12% press), no label wrapping"
          icon="sparkles"
          actions={
            <Button
              variant="b2"
              size="sm"
              icon="star"
              active={favPinned}
              title="Toggle favorite state"
              onClick={() => setFavPinned((v) => !v)}
            />
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bb-space-3)' }}>
            <div>
              <div className="bb-caption-text" style={{ marginBottom: 6 }}>
                B1 — Primary &amp; Tonal Action Buttons:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--bb-space-2)' }}>
                <Button variant="b1" emphasis="filled" icon="plus">
                  New Character
                </Button>
                <Button variant="b1" emphasis="tonal" icon="edit">
                  Edit Sheet
                </Button>
                <Button variant="b1" emphasis="outlined" icon="folder">
                  Import PNG
                </Button>
                <Button variant="b1" emphasis="tonal" size="sm" pill icon="sparkles">
                  Compact Pill
                </Button>
              </div>
            </div>

            <div>
              <div className="bb-caption-text" style={{ marginBottom: 6 }}>
                B2 (Ghost Icon) &amp; B4 (Danger Tonal):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--bb-space-2)' }}>
                <Button variant="b2" icon="search" title="Search" />
                <Button variant="b2" icon="sliders" active title="Active Filter" />
                <Button variant="b2" icon="expand" title="Expand Panel" />
                <Button variant="b2" icon="refresh" title="Reset" />
                <Button variant="b2" size="lg" borderless icon="send" title="Large Borderless Send Icon (38x38)" />
                <Button variant="b4" icon="trash">
                  Delete Card
                </Button>
                <Button variant="b4" size="sm" icon="trash">
                  Purge
                </Button>
              </div>
            </div>

            <div>
              <div className="bb-caption-text" style={{ marginBottom: 6 }}>
                B3 — Segmented View Switcher:
              </div>
              <SegmentedGroup
                fullWidth
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: 'all', label: 'All Cards (42)', icon: 'users' },
                  { value: 'pinned', label: 'Pinned Favorites (8)', icon: 'star' },
                  { value: 'folders', label: 'Tag Folders (5)', icon: 'folder' },
                ]}
              />
            </div>
            <div>
              <div className="bb-caption-text" style={{ marginBottom: 6 }}>
                OverlayScrollArea &amp; ScrollIndicator (no layout shift, hover or scroll):
              </div>
              <OverlayScrollArea
                ref={scrollDemoRef}
                variant="compact"
                style={{
                  borderRadius: 7,
                  border: '1px solid var(--bb-page-border-mid)',
                  background: 'var(--bb-page-input-bg)',
                }}
                viewportStyle={{
                  maxHeight: 132,
                  padding: '8px 10px',
                  fontFamily: 'var(--bb-font-mono)',
                  fontSize: 11.5,
                  lineHeight: 1.7,
                  color: 'var(--bb-ink-muted)',
                }}
              >
                {[
                  'Chat line 01 — archive restored',
                  'Chat line 02 — swipe variants loaded',
                  'Chat line 03 — reasoning collapsed',
                  'Chat line 04 — branch truncated',
                  'Chat line 05 — model telemetry synced',
                  'Chat line 06 — lorebook injected',
                  'Chat line 07 — persona binding applied',
                  'Chat line 08 — token budget balanced',
                  'Chat line 09 — end of demo stream',
                ].map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </OverlayScrollArea>
            </div>
          </div>
        </FolderCard>

        <FolderCard
          title="M3 Sliders & Toggles (Sampler Controls)"
          subtitle="Live numeric input + reset to default button"
          icon="sliders"
        >
          <Slider
            label="Temperature"
            hint="Controls randomness of token sampling"
            value={temperature}
            min={0}
            max={2}
            step={0.01}
            defaultValue={1.0}
            onChange={setTemperature}
          />
          <Slider
            label="Min-P Sampling"
            hint="Minimum probability threshold relative to top token"
            value={minP}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.05}
            onChange={setMinP}
          />
          <Slider
            label="Context Window"
            hint="Maximum tokens sent from Tail-First JSONL history"
            value={contextTokens}
            min={2048}
            max={65536}
            step={512}
            defaultValue={16384}
            unit="tok"
            onChange={setContextTokens}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="bb-caption-text">Inline Toolbar Slider:</span>
            <div style={{ flex: '1 1 auto', maxWidth: 260, display: 'flex' }}>
              <Slider
                variant="inline"
                icon="gridView"
                min={72}
                max={200}
                step={2}
                value={demoCardSize}
                defaultValue={120}
                unit="px"
                ariaLabel="Card size preview"
                title="Compact inline toolbar slider (double-click to reset)"
                onChange={setDemoCardSize}
                className="bb-char-gallery__size-control"
              />
            </div>
          </div>
        </FolderCard>
      </div>

      <FolderCard
        title="Selection Indicators (Checkbox)"
        subtitle="One indicator for bulk-select lists, card tiles and chat history rows"
        icon="check"
      >
        <div className="bb-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bb-space-3)' }}>
            <span className="bb-t3-heading">Plain — inline lists and menus</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--bb-space-4)' }}>
              <Checkbox checked onChange={() => {}} size="sm" label="Small 16px" />
              <Checkbox checked onChange={() => {}} size="md" label="Medium 20px" />
              <Checkbox checked={false} onChange={() => {}} label="Unchecked" />
              <Checkbox checked disabled onChange={() => {}} label="Disabled" />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bb-space-3)' }}>
            <span className="bb-t3-heading">Overlay — raised badge over imagery</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--bb-space-4)' }}>
              <Checkbox variant="overlay" checked={tileChecked} onChange={setTileChecked} />
              <Checkbox variant="overlay" checked={false} onChange={() => {}} />
              <span className="bb-caption-text">
                Used by CharacterCardTile and the chat history list, where the row
                underneath owns the click.
              </span>
            </div>
          </div>
        </div>
      </FolderCard>

      <FolderCard
        title="Inputs, Pill Search & M3 Switches"
        subtitle="Recessed M3 lowest-container fields with Indigo focus ring"
        icon="book"
      >
        <div className="bb-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bb-space-3)' }}>
            <div>
              <div className="bb-caption-text" style={{ marginBottom: 4 }}>
                InlineEditableTitle — click-to-edit M3 heading:
              </div>
              <InlineEditableTitle
                value={charName}
                onChange={setCharName}
                placeholder="Untitled Scenario"
                size="lg"
                editTooltip="Click to rename scenario"
              />
            </div>
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search characters, tags, or lorebooks..."
            />
            <Input
              id="demo-char-name"
              label="Character Name (T3 Label)"
              hint="Synced with Character Card v2/v3 metadata"
              value={charName}
              onChange={(e) => setCharName(e.target.value)}
            />
            <Textarea
              id="demo-scenario"
              label="Scenario / Opening Context"
              value={scenarioPrompt}
              onChange={(e) => setScenarioPrompt(e.target.value)}
            />
            <RegexPatternInput
              label="RegexPatternInput (M3 Flag Chips + Expert Mode + ReDoS Guard)"
              allowExpertToggle
              value={demoRegexPattern}
              onChange={setDemoRegexPattern}
            />
            <YamlCodeField
              label="YamlCodeField (Live YAML / JSON Validator)"
              mode="object"
              rows={3}
              value={demoYamlInclude}
              onChange={setDemoYamlInclude}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'var(--bb-space-2)' }}>
            <Switch
              checked={streamingEnabled}
              onChange={setStreamingEnabled}
              label="SSE Token Streaming"
              description="Stream AI responses token-by-token with zero layout shift"
            />
            <Switch
              checked={promptCacheEnabled}
              onChange={setPromptCacheEnabled}
              label="Server-Side Prompt Caching"
              description="Keep character cards & lorebooks warm in memory for instant generation"
            />
            <Switch
              checked={false}
              disabled
              label="Legacy jQuery Compatibility (Disabled)"
              description="Pure React + M3 architecture requires zero legacy scripts"
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 4 }}>
              <Switch
                bare
                size="sm"
                inlineLabel="All"
                checked={streamingEnabled}
                onChange={setStreamingEnabled}
              />
              <Switch
                bare
                size="sm"
                checked={promptCacheEnabled}
                onChange={setPromptCacheEnabled}
              />
            </div>
          </div>
        </div>
      </FolderCard>

      <FolderCard
        title="Character Gallery Kit"
        subtitle="Tag chips with OR/AND/NOT filters, compact segmented switchers, tag picker and gallery tiles"
        icon="addressCard"
        defaultOpen
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bb-space-3)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bb-space-2)' }}>
            <span className="bb-t3-heading">TagChip — click a chip to cycle OR → AND → NOT</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <TagChip
                label="Yaoi"
                state={chipStates.yaoi}
                count={2}
                onCycle={() => cycleChip('yaoi')}
                onRemove={() => setChipStates((p) => ({ ...p, yaoi: 'or' }))}
              />
              <TagChip
                label="hide"
                state={chipStates.hide}
                onCycle={() => cycleChip('hide')}
                onRemove={() => setChipStates((p) => ({ ...p, hide: 'or' }))}
              />
              <TagChip
                label="fantasy"
                state={chipStates.fantasy}
                count={7}
                onCycle={() => cycleChip('fantasy')}
                onRemove={() => setChipStates((p) => ({ ...p, fantasy: 'or' }))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--bb-space-2)', alignItems: 'center' }}>
            <span className="bb-t3-heading">ToggleGroup</span>
            <ToggleGroup
              value={galleryCols}
              onChange={setGalleryCols}
              title="Columns"
              options={[
                { value: '4', label: '4' },
                { value: '5', label: '5' },
                { value: '6', label: '6' },
              ]}
            />
            <ToggleGroup
              value={galleryAspect}
              onChange={setGalleryAspect}
              title="Card aspect ratio"
              options={[
                { value: 'square', icon: 'aspectSquare', title: 'Square 1:1' },
                { value: 'portrait', icon: 'aspectPortrait', title: 'Portrait 2:3' },
              ]}
            />
            <ToggleGroup
              size="sm"
              value={entityFilter}
              onChange={setEntityFilter}
              title="Entity type"
              options={[
                { value: 'scenarios', icon: 'addressCard', title: 'Scenarios' },
                { value: 'groups', icon: 'users', title: 'Groups' },
                { value: 'tags', icon: 'tags', title: 'Tags' },
              ]}
            />
            <ToggleGroup
              size="sm"
              value={gallerySort}
              onChange={setGallerySort}
              title="Sort order"
              options={[
                { value: 'recent', label: 'Recent', title: 'Sort by recent activity' },
                { value: 'az', label: 'A-Z', title: 'Sort alphabetically (A–Z)' },
              ]}
            />
          </div>

          <div style={{ maxWidth: 340 }}>
            <TagPicker
              tags={demoTags}
              selectedIds={activeTagIds}
              onToggleTag={(id) =>
                setActiveTagIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                )
              }
              onCreateTag={(name) => {
                setActiveTagIds((prev) => [...prev, name]);
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bb-space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="bb-t3-heading">CharacterCardTile</span>
              <Switch
                checked={multiSelectActive}
                onChange={setMultiSelectActive}
                label="Multi-select mode"
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 8,
                maxWidth: 420,
                '--bb-char-aspect': galleryAspect === 'square' ? '1 / 1' : '2 / 3',
              }}
            >
              {demoTiles.map((tile) => (
                <CharacterCardTile
                  key={tile.id}
                  item={tile}
                  selected={pickedTileId === tile.id}
                  multiSelectActive={multiSelectActive}
                  multiSelected={multiSelectedIds.includes(tile.id)}
                  onSelect={setPickedTileId}
                  onToggleMultiSelect={(id) =>
                    setMultiSelectedIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                    )
                  }
                  kebabItems={[
                    { id: 'open', label: 'Open sheet', icon: 'bookOpen' },
                    { id: 'dupe', label: 'Duplicate', icon: 'copy' },
                    { id: 'del', label: 'Delete', icon: 'trash', danger: true },
                  ]}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bb-space-2)' }}>
            <span className="bb-t3-heading">CharacterCardRow (M3 Horizontal List Card)</span>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxWidth: 460,
                padding: 8,
                borderRadius: 'var(--bb-control-radius, 8px)',
                background: 'var(--bb-sheet-bg, var(--bb-page-card-bg))',
                border: '1px solid var(--bb-page-border)',
              }}
            >
              {demoTiles.map((tile) => (
                <CharacterCardRow
                  key={tile.id}
                  item={tile}
                  userName="Wanderer"
                  selected={pickedTileId === tile.id}
                  multiSelectActive={multiSelectActive}
                  multiSelected={multiSelectedIds.includes(tile.id)}
                  onSelect={setPickedTileId}
                  onToggleMultiSelect={(id) =>
                    setMultiSelectedIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                    )
                  }
                  kebabItems={[
                    { id: 'open', label: 'Open sheet', icon: 'bookOpen' },
                    { id: 'dupe', label: 'Duplicate', icon: 'copy' },
                    { id: 'del', label: 'Delete', icon: 'trash', danger: true },
                  ]}
                />
              ))}
            </div>
          </div>
        </div>
      </FolderCard>

      <FolderCard
        title="Scenario Intro Cards (IntroCard + SortableStack)"
        subtitle="Smooth pointer-driven M3 greeting cards with slot displacement, floating ghost, 2:3 portrait picker & inline title"
        icon="bookOpen"
        defaultOpen
      >
        <div style={{ maxWidth: 460 }}>
          <SortableStack
            items={demoIntros}
            getKey={(intro) => intro.id}
            onReorder={(fromIdx, toIdx) =>
              setDemoIntros((prev) => {
                const next = [...prev];
                const [moved] = next.splice(fromIdx, 1);
                next.splice(toIdx, 0, moved);
                return next;
              })
            }
            renderItem={(intro, idx, { isGhost }) => (
              <IntroCard
                index={idx}
                title={intro.title}
                text={intro.text}
                portraitUrl={intro.portraitUrl}
                fallbackInitials="EV"
                selected={selectedDemoIntroIdx === idx}
                draggable={demoIntros.length > 1}
                isGhost={isGhost}
                canDelete={demoIntros.length > 1}
                portraitGallery={[
                  {
                    id: 'g1',
                    label: 'Indigo Coat',
                    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="100%" height="100%" fill="%232b3354"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="%23dce2ff" font-family="Georgia" font-size="22">EV</text></svg>',
                  },
                  {
                    id: 'g2',
                    label: 'Crimson Lantern',
                    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="100%" height="100%" fill="%235c2b38"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="%23ffd9e2" font-family="Georgia" font-size="22">EV</text></svg>',
                  },
                ]}
                onSelect={() => setSelectedDemoIntroIdx(idx)}
                onRenameTitle={(nextTitle) =>
                  setDemoIntros((prev) =>
                    prev.map((it, i) => (i === idx ? { ...it, title: nextTitle } : it)),
                  )
                }
                onSelectPortraitUrl={(_raw, nextUrl) =>
                  setDemoIntros((prev) =>
                    prev.map((it, i) => (i === idx ? { ...it, portraitUrl: nextUrl } : it)),
                  )
                }
                onEdit={() => setSelectedDemoIntroIdx(idx)}
                onStartChat={() => setSelectedDemoIntroIdx(idx)}
                onDuplicate={() =>
                  setDemoIntros((prev) => [
                    ...prev.slice(0, idx + 1),
                    { ...intro, id: `i_${Date.now()}`, title: `${intro.title} (Copy)` },
                    ...prev.slice(idx + 1),
                  ])
                }
                onSetAsFirst={() =>
                  setDemoIntros((prev) => {
                    const next = [...prev];
                    const [moved] = next.splice(idx, 1);
                    next.unshift(moved);
                    return next;
                  })
                }
                onDelete={() =>
                  setDemoIntros((prev) =>
                    prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev,
                  )
                }
              />
            )}
          />
        </div>
      </FolderCard>

      <FolderCard
        title="MessageRecapBox (M3 Scene Memory & Context Recap Molecule)"
        subtitle="Paired visually with Chain of Thought — displays recap token footprint, Compressed depth state & surgical inline recap editor"
        icon="scissors"
        defaultOpen
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
          <MessageRecapBox
            recapText={demoRecapText}
            isCompressed
            defaultOpen
            tokenContext={{ charName: 'Elowen Vane', userName: 'Aki' }}
            onSaveRecap={(next) => setDemoRecapText(next)}
          />
          <MessageRecapBox
            recapText="Streaming draft recap in progress..."
            isStreaming
          />
        </div>
      </FolderCard>

      <FolderCard
        title="Model & Provider Icons (SillyTavern SVGs) & M3 Plain Tooltip"
        subtitle="Original SillyTavern SVG emblems colored via currentColor — hover any badge to inspect its raw model ID"
        icon="sparkles"
        defaultOpen
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', paddingTop: 6 }}>
          {[
            { id: 'claude-3-7-sonnet-20250219', api: 'claude', label: 'Claude' },
            { id: 'gemini-2.5-pro-preview', api: 'makersuite', label: 'MakerSuite / Gemini' },
            { id: 'gemini-2.5-flash', icon: 'vertexai', label: 'Vertex AI' },
            { id: 'gpt-4.1-2025-04-14', api: 'openai', label: 'OpenAI' },
            { id: 'deepseek-r1-0528', api: 'deepseek', label: 'DeepSeek' },
            { id: 'grok-3-beta', api: 'xai', label: 'xAI' },
            { id: 'mistral-large-latest', api: 'mistralai', label: 'Mistral' },
            { id: 'kimi-k2-instruct', api: 'moonshot', label: 'Moonshot' },
            { id: 'glm-4.5', api: 'zai', label: 'Z.ai / GLM' },
            { id: 'command-a-03-2025', api: 'cohere', label: 'Cohere' },
            { id: 'sonar-reasoning-pro', api: 'perplexity', label: 'Perplexity' },
            { id: 'qwen/qwen3-235b-a22b', api: 'openrouter', label: 'OpenRouter' },
            { id: 'qwen-qwq-32b', api: 'groq', label: 'Groq' },
            { id: 'gemma3:27b', icon: 'ollama', label: 'Ollama' },
            { id: 'meta-llama/llama-3.3-70b-instruct', api: 'llamacpp', label: 'Llama.cpp' },
            { id: 'fimbulvetr-11b-v2', api: 'koboldcpp', label: 'KoboldCpp' },
            { id: 'kayra-v1', api: 'novel', label: 'NovelAI' },
            { id: 'deepseek-ai/DeepSeek-V3', icon: 'chutes', label: 'Chutes' },
            { id: 'eva-qwen-2.5-72b', api: 'featherless', label: 'Featherless' },
            { id: 'qwen2.5-72b-instruct', api: 'togetherai', label: 'TogetherAI' },
            { id: 'yi-lightning', api: '01ai', label: '01.AI' },
            { id: 'custom-rp-finetune', api: 'generic', label: 'Generic' },
          ].map((item) => (
            <Tooltip key={item.label} content={item.id} mono>
              <span
                tabIndex={0}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--bb-page-border-mid)',
                  background: 'var(--bb-page-input-bg)',
                  color: 'var(--bb-ink-heading)',
                  fontSize: 12,
                  cursor: 'default',
                }}
              >
                <ModelIcon model={item.id} api={item.api} icon={item.icon} size={15} />
                <span>{item.label}</span>
              </span>
            </Tooltip>
          ))}
        </div>
      </FolderCard>

      <FolderCard
        title="2-Segment Connection & Model Picker (M3 Split-Chip)"
        subtitle="Switch proxy keeping same model, manage failover keychains & dead keys, pin ★ models & delete proxies inline without modals"
        icon="plug"
        defaultOpen
      >
        <div style={{ paddingTop: 8 }}>
          <ConnectionModelPicker
            placement="bottom"
            activeConnectionId={demoModelSel.providerId}
            activeModelId={demoModelSel.modelId}
            activeModelName={demoModelSel.modelId}
            connections={[
              {
                id: 'openrouter',
                type: 'rp_proxy',
                name: 'Club RP Proxy',
                baseUrl: 'https://club-rp.example',
                isConfigured: true,
                hasKey: true,
                aliveKeysCount: 1,
                deadKeysCount: 1,
                activeKeyMasked: 'sk-gd••••0002',
                sameModelMatchId: 'anthropic/claude-3.7-sonnet',
                health: { state: 'online', latencyMs: 118, error: '' },
                keys: [
                  {
                    id: 'k1',
                    label: 'Key #1',
                    masked: 'sk-dd••••0001',
                    status: 'dead',
                    statusReason: 'Quota / balance exhausted',
                    isPreferred: false,
                  },
                  {
                    id: 'k2',
                    label: 'Key #2',
                    masked: 'sk-gd••••0002',
                    status: 'active',
                    statusReason: '',
                    isPreferred: true,
                  },
                ],
                models: [
                  {
                    id: 'anthropic/claude-3.7-sonnet',
                    name: 'Claude 3.7 Sonnet',
                    lockedContextLength: 120000,
                    maxContextLength: 200000,
                    availability: 'up',
                    poolActiveKeys: 12,
                    routeId: 'gcp/claude',
                    family: 'claude',
                    starred: true,
                  },
                  {
                    id: 'aws/claude::anthropic/claude-3.7-sonnet',
                    name: 'Claude 3.7 Sonnet',
                    lockedContextLength: 120000,
                    maxContextLength: 200000,
                    availability: 'down',
                    poolActiveKeys: 0,
                    routeId: 'aws/claude',
                    family: 'claude',
                    starred: false,
                  },
                  {
                    id: 'google/gemini-2.5-pro-preview',
                    name: 'Gemini 2.5 Pro',
                    lockedContextLength: 200000,
                    maxContextLength: 1048576,
                    availability: 'up',
                    poolActiveKeys: 24,
                    routeId: 'google-ai',
                    family: 'gemini',
                    starred: false,
                  },
                ],
              },
              {
                id: 'deepseek',
                type: 'oai_proxy',
                name: 'Backup OAI Proxy',
                isConfigured: true,
                hasKey: true,
                aliveKeysCount: 1,
                deadKeysCount: 0,
                activeKeyMasked: 'sk-bk••••8812',
                sameModelMatchId: 'anthropic/claude-3.7-sonnet',
                keys: [
                  {
                    id: 'k3',
                    label: 'Key #1',
                    masked: 'sk-bk••••8812',
                    status: 'active',
                    statusReason: '',
                    isPreferred: true,
                  },
                ],
                models: [
                  {
                    id: 'anthropic/claude-3.7-sonnet',
                    name: 'Claude 3.7 Sonnet',
                    contextLength: 200000,
                    reasoning: true,
                    family: 'claude',
                    starred: true,
                  },
                  {
                    id: 'deepseek-reasoner',
                    name: 'DeepSeek R1',
                    contextLength: 65536,
                    reasoning: true,
                    family: 'deepseek',
                    starred: false,
                  },
                ],
              },
            ]}
            onSelectConnection={(connId, modelId) =>
              setDemoModelSel((prev) => ({
                providerId: connId,
                modelId: modelId || prev.modelId,
              }))
            }
          />
        </div>
      </FolderCard>

      <FolderCard
        title="PersonaChip (M3 Stretched-Edge Blur & 2/3 Portrait Capsule)"
        subtitle="Composer persona selector: intact upper-2/3 portrait on the right + stretched & blurred left edge fade"
        icon="users"
        defaultOpen
      >
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingTop: 8 }}>
          <PersonaChip
            name="Alden Thorne"
            avatarUrl={'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%234e5f9e"/><stop offset="55%" stop-color="%238565a4"/><stop offset="100%" stop-color="%23d2966e"/></linearGradient></defs><rect width="80" height="120" fill="url(%23g)"/><circle cx="40" cy="40" r="16" fill="rgba(255,255,255,0.88)"/><path d="M16 96c4-22 14-34 24-34s20 12 24 34" fill="rgba(255,255,255,0.88)"/></svg>'}
          />
          <PersonaChip name="Wanderer (No Portrait)" />
        </div>
      </FolderCard>

      <FolderCard
        title="AvatarStack (35% Left-Front Overlapping Participant Circles)"
        subtitle="First avatar (Scenario) in front; subsequent avatars (Persona / Group) sit 35% deeper to the right with transparent crescent cutout"
        icon="users"
        defaultOpen
      >
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 18, paddingTop: 8 }}>
          <AvatarStack
            size={24}
            overlap={0.35}
            items={[
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
          />
          <AvatarStack
            size={28}
            overlap={0.35}
            items={[
              { id: 'g1', name: 'Elowen', initials: 'EV' },
              { id: 'g2', name: 'Seraphina', initials: 'SR' },
              { id: 'g3', name: 'Alden', initials: 'AT' },
            ]}
          />
        </div>
      </FolderCard>

      <FolderCard
        title="ScenarioBindingBar & ScenarioLinkActionButton (Preset ↔ Scenario Bindings)"
        subtitle="M3 circular row-tail link button (with +N badge) and tonal bound-scenarios chip strip"
        icon="link"
        defaultOpen
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="bb-caption-text">Row-tail badges:</span>
            <ScenarioLinkActionButton
              targetLabel="Prose Engine v3"
              linkedScenarios={demoBindScenarios.filter((s) =>
                demoBoundAvatars.includes(s.avatar),
              )}
              activeScenario={demoBindScenarios[0]}
              onToggleActiveScenario={(next) =>
                setDemoBoundAvatars((prev) =>
                  next
                    ? Array.from(new Set([...prev, 'elowen.png']))
                    : prev.filter((x) => x !== 'elowen.png'),
                )
              }
            />
            <ScenarioLinkActionButton
              targetLabel="Unbound Preset"
              linkedScenarios={[]}
              activeScenario={demoBindScenarios[0]}
              onToggleActiveScenario={() =>
                pushSandboxToast({
                  variant: 'info',
                  message: 'Toggled scenario link from row action button',
                })
              }
            />
          </div>

          <ScenarioBindingBar
            entityName="NexusTavern Prose v3"
            linkedScenarios={demoBindScenarios.filter((s) =>
              demoBoundAvatars.includes(s.avatar),
            )}
            availableScenarios={demoBindScenarios}
            activeScenario={demoBindScenarios[0]}
            onBindScenario={(av) =>
              setDemoBoundAvatars((prev) => Array.from(new Set([...prev, av])))
            }
            onUnbindScenario={(av) =>
              setDemoBoundAvatars((prev) => prev.filter((x) => x !== av))
            }
            onUnbindAll={() => setDemoBoundAvatars([])}
            onSelectScenario={(av) =>
              pushSandboxToast({
                variant: 'info',
                message: `Selected bound scenario: ${av}`,
              })
            }
          />
        </div>
      </FolderCard>

      <FolderCard
        title="Smart Notification Toasts (TopBar & Composer Overlay M3 Solid Sheet)"
        subtitle="Supports placement='top' and placement='composer' (floating directly above send-form); hover to pause & refill timer"
        icon="info"
        defaultOpen
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button
              variant="b1"
              size="sm"
              icon="errorCircle"
              onClick={() =>
                pushSandboxToast({
                  variant: 'error',
                  message:
                    'pestcore.org: Proxy is unavailable, please try again later.',
                  actionLabel: 'Retry',
                  actionIcon: 'refresh',
                  onAction: () => pushSandboxToast({ variant: 'info', message: 'Retrying request...' }),
                })
              }
            >
              Trigger Proxy Offline
            </Button>
            <Button
              variant="b1"
              size="sm"
              icon="errorCircle"
              onClick={() =>
                pushSandboxToast({
                  variant: 'error',
                  message:
                    'pestcore.org (429): Rate limit reached on upstream worker pool. Wait a few seconds before retrying.',
                  actionLabel: 'Retry',
                  actionIcon: 'refresh',
                  onAction: () => pushSandboxToast({ variant: 'info', message: 'Retrying request...' }),
                })
              }
            >
              Trigger 429 Error
            </Button>
            <Button
              variant="b1"
              size="sm"
              icon="codeBranch"
              onClick={() =>
                pushSandboxToast({
                  variant: 'success',
                  icon: 'codeBranch',
                  message: 'Branch #12 created',
                })
              }
            >
              Trigger Branch Event
            </Button>
            <Button
              variant="b1"
              size="sm"
              icon="check"
              onClick={() =>
                pushSandboxToast({
                  variant: 'success',
                  message: 'Saved scenario card "Elowen Vane"',
                })
              }
            >
              Trigger Save Toast
            </Button>
          </div>
          <ToastStack toasts={sandboxToasts} onDismiss={dismissSandboxToast} inline />
        </div>
      </FolderCard>

      <FolderCard
        title="Brand Logo, M3 Progress Indicators, Tonal Skeletons & Atmospheric Splash"
        subtitle="Reusable loading & boot primitives across splash screen, chat stream, scenario sheets, and lists"
        icon="refresh"
        defaultOpen
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <BrandLogo size={28} />
            <BrandLogo size={38} tone="primary" />
            <BrandLogo size={42} badge pulse />
            <div style={{ width: 1, height: 32, background: 'var(--md-sys-color-outline-variant)' }} />
            <ProgressIndicator variant="circular" size="xs" />
            <ProgressIndicator variant="circular" size="sm" />
            <ProgressIndicator variant="circular" size="md" />
            <ProgressIndicator variant="circular" size="lg" value={demoProgress} />
            <Button
              variant="b1"
              size="sm"
              emphasis="filled"
              onClick={() => setSplashOverlayPreview(true)}
            >
              Preview Fullscreen Splash
            </Button>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 18,
              padding: '10px 14px',
              borderRadius: 'var(--bb-control-radius, 8px)',
              background: 'var(--md-sys-color-surface-container)',
              border: '1px solid var(--bb-page-border, var(--md-sys-color-outline-variant))',
            }}
          >
            <TypingDots label="Waiting for response…" />
            <div style={{ width: 1, height: 22, background: 'var(--md-sys-color-outline-variant)' }} />
            <TypingDots size="sm" tone="muted" label="Compact muted" />
            <div style={{ width: 1, height: 22, background: 'var(--md-sys-color-outline-variant)' }} />
            <span
              style={{
                fontFamily: 'var(--bb-font-body)',
                fontSize: 'var(--bb-body-size, 14px)',
                color: 'var(--md-sys-color-on-surface)',
                lineHeight: 1.45,
              }}
            >
              *The lantern flickered just before she spoke—*
              <TypingDots inline ariaLabel="Stream paused, waiting for next tokens" />
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <ProgressIndicator
              variant="linear"
              size="md"
              label="Indeterminate M3 Linear Progress"
            />
            <ProgressIndicator
              variant="linear"
              size="lg"
              value={demoProgress}
              label="Determinate Boot Stage"
              showValue
            />
          </div>

          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              padding: '12px 14px',
              borderRadius: 'var(--bb-control-radius, 8px)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              background: 'var(--md-sys-color-surface-container-low)',
              fontSize: 'var(--bb-caption-size)',
              color: 'var(--md-sys-color-on-surface-variant)',
            }}
          >
            <ProgressIndicator variant="linear" size="sm" overlay="top" ariaLabel="Overlay loading preview" />
            Zero-layout-shift M3 overlay progress bar (`overlay=&quot;top&quot;`) — floats over container edge without pushing content.
          </div>

          <Slider
            label="Determinate Progress Preview"
            min={0}
            max={100}
            step={1}
            value={demoProgress}
            onChange={setDemoProgress}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 'var(--bb-chat-column-max, 784px)' }}>
            <SkeletonMessage isUser={false} dimmed lines={3} />
            <SkeletonMessage isUser={true} lines={2} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SkeletonListRow avatarVariant="portrait" />
              <SkeletonListRow avatarVariant="portrait" />
            </div>
            <SkeletonTimelineGroup branches={2} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10, maxWidth: 440 }}>
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Badge variant="tonal" mono>0.5.0-beta.1</Badge>
            <Badge variant="neutral">Neutral Pill</Badge>
            <Badge variant="outlined" icon="tags">Outlined</Badge>
            <Badge variant="tonal" size="md" icon="sparkles">M3 Badge MD</Badge>
          </div>

          <SplashScreen
            inline
            stepLabel="Stage 2 / 3 · Loading scenarios & personas"
          />
        </div>
      </FolderCard>

      <FolderCard
        title="M3 Emoji Picker (Full Unicode 15.1 Catalog, Search & Mobile Keyboard Dock)"
        subtitle="1,898 emojis across standard categories with instant search, recent history & Discord-style mobile tray"
        badge={sandboxEmoji || 'None'}
        defaultOpen
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>
          <EmojiPicker
            inline
            selectedEmoji={sandboxEmoji}
            allowClear={Boolean(sandboxEmoji)}
            onClear={() => setSandboxEmoji('')}
            onSelect={(em) => setSandboxEmoji(em)}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button
                ref={sandboxEmojiBtnRef}
                variant="b1"
                emphasis="tonal"
                icon="smile"
                active={sandboxEmojiPopoverOpen}
                onClick={() => setSandboxEmojiPopoverOpen((v) => !v)}
              >
                {`Open Popover (${sandboxEmoji || 'None'})`}
              </Button>
              <EmojiPicker
                open={sandboxEmojiPopoverOpen}
                onOpenChange={setSandboxEmojiPopoverOpen}
                anchorRef={sandboxEmojiBtnRef}
                selectedEmoji={sandboxEmoji}
                allowClear={Boolean(sandboxEmoji)}
                closeOnSelect
                onClear={() => setSandboxEmoji('')}
                onSelect={(em) => setSandboxEmoji(em)}
              />
            </div>
            <span className="bb-caption-text" style={{ maxWidth: 280 }}>
              Desktop opens a Pure M3 Solid Sheet popover; on mobile viewports (&le;768px) it docks at the bottom in place of the OS keyboard.
            </span>
          </div>
        </div>
      </FolderCard>

      <FolderCard
        title="M3 Attachment Tray & Lightbox (Hover Remove & Click-to-Expand)"
        subtitle="Image thumbnails & file cards with hover cross button and full M3 image/text preview lightbox"
        badge={`${sandboxAttachments.length} attached`}
        defaultOpen
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            ref={sandboxFileInputRef}
            type="file"
            multiple
            hidden
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (files.length === 0) return;
              const drafts = (await Promise.all(files.map((f) => createAttachmentDraft(f)))).filter(
                Boolean,
              );
              setSandboxAttachments((prev) => [...prev, ...drafts]);
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Button
              variant="b1"
              size="sm"
              emphasis="tonal"
              icon="paperclip"
              onClick={() => sandboxFileInputRef.current?.click()}
            >
              Attach Files
            </Button>
            <Button
              variant="b2"
              size="sm"
              icon="refresh"
              onClick={() => setSandboxAttachments(INITIAL_DEMO_ATTACHMENTS)}
            >
              Reset Demo Attachments
            </Button>
            <span className="bb-caption-text">
              Hover any card to reveal the &times; button, or click a card to open the M3 Lightbox.
            </span>
          </div>
          {sandboxAttachments.length > 0 ? (
            <AttachmentTray
              standalone
              items={sandboxAttachments}
              onRemove={(id) =>
                setSandboxAttachments((prev) => prev.filter((item) => item.id !== id))
              }
            />
          ) : (
            <span className="bb-caption-text">
              All demo attachments removed — click &ldquo;Attach Files&rdquo; or &ldquo;Reset Demo Attachments&rdquo;.
            </span>
          )}
        </div>
      </FolderCard>

      <FolderCard
        title="M3 Floating Capsule Palettes (FloatingPalette)"
        subtitle="Reusable capsule toolbars & steppers with 1:1 circular icon buttons and capsule text pills"
        icon="timeline"
        defaultOpen
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingTop: 4 }}>
          <FloatingPalette ariaLabel="Demo Canvas Palette">
            <FloatingPaletteButton icon="zoomOut" title="Zoom out" ariaLabel="Zoom out" />
            <FloatingPaletteButton mono title="Reset zoom">100%</FloatingPaletteButton>
            <FloatingPaletteButton icon="zoomIn" title="Zoom in" ariaLabel="Zoom in" />
            <FloatingPaletteDivider />
            <FloatingPaletteButton icon="expand" title="Fit all" ariaLabel="Fit all" />
            <FloatingPaletteButton icon="grid" active title="Grid enabled" ariaLabel="Toggle grid" />
            <FloatingPaletteButton icon="crosshairs" title="Focus current" ariaLabel="Focus current" />
          </FloatingPalette>

          <FloatingPalette role="navigation" ariaLabel="Demo Stepper Palette">
            <FloatingPaletteButton icon="chevronLeft" title="Previous">Prev</FloatingPaletteButton>
            <FloatingPaletteReadout>2 / 5</FloatingPaletteReadout>
            <FloatingPaletteButton iconRight="chevronRight" title="Next">Next</FloatingPaletteButton>
          </FloatingPalette>
        </div>
      </FolderCard>

      <FolderCard
        title="M3 Horizontal Chip Scroll Strip (ChipScrollStrip)"
        subtitle="Auto-detects horizontal overflow and reveals floating circular M3 chevron controls with soft surface fade"
        icon="sliders"
        defaultOpen
      >
        <div style={{ maxWidth: 380, paddingTop: 4 }}>
          <ChipScrollStrip fadeBg="var(--bb-page-card-bg)" ariaLabel="Demo overflowing filter chips">
            {[
              'All (48)',
              'Pinned ★',
              'Claude',
              'Gemini',
              'DeepSeek',
              'GPT',
              'Grok',
              'Mistral',
              'Llama',
              'Qwen',
            ].map((label, idx) => (
              <TagChip key={label} label={label} state={idx === 0 ? 'include' : 'neutral'} />
            ))}
          </ChipScrollStrip>
        </div>
      </FolderCard>

      <SplashScreen
        open={splashOverlayPreview}
        stepLabel="Click anywhere or press Close Preview"
        onBackdropClick={() => setSplashOverlayPreview(false)}
        actions={
          <Button
            variant="b1"
            emphasis="filled"
            icon="close"
            onClick={() => setSplashOverlayPreview(false)}
          >
            Close Preview
          </Button>
        }
      />
    </section>
  );
}

