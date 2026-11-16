import React, { useState, useMemo } from 'react';
import {
  Icon,
  Button,
  SearchInput,
  BookmarkRibbons,
  OverlayScrollArea,
} from '@ui/index.js';
import { ThemePresetsSection } from './sections/ThemePresetsSection.jsx';
import { ColorSchemeSection } from './sections/ColorSchemeSection.jsx';
import { ChatTextColorsSection } from './sections/ChatTextColorsSection.jsx';
import { LayoutAndSurfacesSection } from './sections/LayoutAndSurfacesSection.jsx';
import { TypographyAndCssSection } from './sections/TypographyAndCssSection.jsx';
import { ChatAndAiSection } from './sections/ChatAndAiSection.jsx';
import { SystemSection } from './sections/SystemSection.jsx';
import './SettingsTomePanel.css';

const SETTINGS_TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'chat-ai', label: 'Chat & AI' },
  { id: 'system', label: 'System' },
];

const SEARCH_INDEX = [
  {
    key: 'appearance-presets',
    tab: 'appearance',
    keywords:
      'theme presets indigo slate bronze tome astral azure crimson eclipse abyssal void ivory grimoire rose quartz save import export reset appearance',
  },
  {
    key: 'appearance-scheme',
    tab: 'appearance',
    keywords:
      'color scheme dark mode light mode two-color monochrome primary accent seed auto portrait palette surface slots override',
  },
  {
    key: 'appearance-chat-text',
    tab: 'appearance',
    keywords:
      'rp chat text colors normal prose spoken quotes apostrophes single quotes italic actions bold emphasis inline code block details spoilers',
  },
  {
    key: 'appearance-column',
    tab: 'appearance',
    keywords:
      'chat reading column width message card opacity translucency backdrop blur edge soft fade',
  },
  {
    key: 'appearance-shader',
    tab: 'appearance',
    keywords:
      'last message pearlescent shader pearl nacre chaotic flow intensity iridescent tint',
  },
  {
    key: 'appearance-tomes-backdrop',
    tab: 'appearance',
    keywords:
      'side tomes idle translucency surface opacity blur stage backdrop jrpg geometric pattern diamond lattice astral stars global screen dimming',
  },
  {
    key: 'appearance-typography',
    tab: 'appearance',
    keywords:
      'scale typography font size heading body monospace google fonts upload local woff2 ttf otf reduced motion animations',
  },
  {
    key: 'appearance-custom-css',
    tab: 'appearance',
    keywords: 'custom css stylesheet user style override enable',
  },
  {
    key: 'chatai-input',
    tab: 'chat-ai',
    keywords:
      'composer enter key to send empty continue restore unsaved draft confirm message deletion double click edit initial messages window tail-first auto-load last chat startup auto-scroll streaming smooth word-paced',
  },
  {
    key: 'chatai-badges',
    tab: 'chat-ai',
    keywords:
      'message card badges visibility generation timer speed timestamps provider model icons sequential ids token count hide chat portraits avatars mobile swipe gestures block forbid external media',
  },
  {
    key: 'chatai-formatting',
    tab: 'chat-ai',
    keywords:
      'text hygiene formatting trim spaces collapse consecutive newlines auto-fix markdown incomplete sentences chain of thought reasoning think auto-parse auto-expand include in prompts completion sound chime',
  },
  {
    key: 'chatai-caching',
    tab: 'chat-ai',
    keywords:
      'card context example dialogues behavior gradual push-out prefer character system prompt post-history instructions llm prompt caching claude anthropic openrouter ephemeral token saver ttl depth proxies',
  },
  {
    key: 'system-network',
    tab: 'system',
    keywords:
      'lan network wi-fi address ssh tunnel remote mobile qr pairing e2ee encryption auto-open browser startup server status',
  },
  {
    key: 'system-performance',
    tab: 'system',
    keywords:
      'low gpu mode performance hardware battery frame rate disable shader blur compositing',
  },
  {
    key: 'system-backup',
    tab: 'system',
    keywords:
      'workspace backup restore export import settings json custom themes welcome guide onboarding reset all defaults storage',
  },
];

const ACTIVE_SUBTAB_STORAGE_KEY = 'nexustavern_settings_subtab_v1';

export function SettingsTomePanel({
  customization,
  onNotify,
  serverStatus = null,
  tunnelBusy = false,
  onToggleTunnelWithToast,
  onRefreshStatus,
  onOpenQrModal,
  onOpenWelcomeGuide,
}) {
  const [subTab, setSubTab] = useState(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_SUBTAB_STORAGE_KEY);
      return SETTINGS_TABS.some((t) => t.id === saved) ? saved : 'appearance';
    } catch {
      return 'appearance';
    }
  });
  const [query, setQuery] = useState('');

  const handleSelectTab = (nextId) => {
    setSubTab(nextId);
    try {
      localStorage.setItem(ACTIVE_SUBTAB_STORAGE_KEY, nextId);
    } catch {
      // Ignore storage errors
    }
  };

  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  const matchedKeys = useMemo(() => {
    if (!isSearching) return null;
    const tokens = trimmedQuery.split(/\s+/).filter(Boolean);
    const set = new Set();
    for (const item of SEARCH_INDEX) {
      if (tokens.every((tok) => item.keywords.includes(tok))) {
        set.add(item.key);
      }
    }
    return set;
  }, [isSearching, trimmedQuery]);

  const showSection = (key, tabId) => {
    if (isSearching) return matchedKeys.has(key);
    return subTab === tabId;
  };

  return (
    <div className="bb-settings-tome">
      <div className="bb-settings-tome__top">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search settings, colors, fonts, formatting..."
        />
        {!isSearching && (
          <BookmarkRibbons
            variant="secondary"
            tabs={SETTINGS_TABS}
            activeId={subTab}
            onChange={handleSelectTab}
          />
        )}
        {isSearching && (
          <div className="bb-settings-tome__search-banner">
            <span>
              Showing <strong>{matchedKeys.size}</strong> matching section
              {matchedKeys.size === 1 ? '' : 's'} across all categories
            </span>
            <Button variant="b2" size="sm" onClick={() => setQuery('')}>
              Clear
            </Button>
          </div>
        )}
      </div>

      <OverlayScrollArea
        className="bb-settings-tome__scroll-wrap"
        viewportClassName="bb-settings-tome__scroll"
        watchValue={`${subTab}:${trimmedQuery}`}
      >
        {isSearching && matchedKeys.size === 0 && (
          <div className="bb-settings-tome__empty">
            <Icon name="search" size={22} />
            <span>No settings match &ldquo;{query.trim()}&rdquo;</span>
          </div>
        )}

        {showSection('appearance-presets', 'appearance') && (
          <ThemePresetsSection
            customization={customization}
            forceOpen={isSearching}
            onNotify={onNotify}
          />
        )}

        {showSection('appearance-scheme', 'appearance') && (
          <ColorSchemeSection customization={customization} forceOpen={isSearching} />
        )}

        {showSection('appearance-chat-text', 'appearance') && (
          <ChatTextColorsSection customization={customization} forceOpen={isSearching} />
        )}

        {(showSection('appearance-column', 'appearance') ||
          showSection('appearance-shader', 'appearance') ||
          showSection('appearance-tomes-backdrop', 'appearance')) && (
          <LayoutAndSurfacesSection
            customization={customization}
            forceOpen={isSearching}
            visibleKeys={matchedKeys}
          />
        )}

        {(showSection('appearance-typography', 'appearance') ||
          showSection('appearance-custom-css', 'appearance')) && (
          <TypographyAndCssSection
            customization={customization}
            forceOpen={isSearching}
            visibleKeys={matchedKeys}
            onNotify={onNotify}
          />
        )}

        {(showSection('chatai-input', 'chat-ai') ||
          showSection('chatai-badges', 'chat-ai') ||
          showSection('chatai-formatting', 'chat-ai') ||
          showSection('chatai-caching', 'chat-ai')) && (
          <ChatAndAiSection
            customization={customization}
            forceOpen={isSearching}
            visibleKeys={matchedKeys}
          />
        )}

        {(showSection('system-network', 'system') ||
          showSection('system-performance', 'system') ||
          showSection('system-backup', 'system')) && (
          <SystemSection
            customization={customization}
            forceOpen={isSearching}
            visibleKeys={matchedKeys}
            onNotify={onNotify}
            serverStatus={serverStatus}
            tunnelBusy={tunnelBusy}
            onToggleTunnelWithToast={onToggleTunnelWithToast}
            onRefreshStatus={onRefreshStatus}
            onOpenQrModal={onOpenQrModal}
            onOpenWelcomeGuide={onOpenWelcomeGuide}
          />
        )}
      </OverlayScrollArea>
    </div>
  );
}

