import React, { useState } from 'react';
import { useViewport } from '@core/hooks/useViewport.js';
import {
  Badge,
  Button,
  FolderCard,
  KebabMenu,
  PopoverSheet,
  TagPicker,
  ToggleGroup,
  Slider,
  Switch,
  BottomSheet,
  BottomNavBar,
  MobileTopAppBar,
} from '@ui/index.js';

const DEMO_NAV_ITEMS = [
  { id: 'chat', label: 'Chat', icon: 'comments', dot: true, dotTone: 'live' },
  { id: 'scenarios', label: 'Scenarios', icon: 'addressCard', badge: 12 },
  { id: 'card', label: 'Card', icon: 'bookOpen', dot: true, dotTone: 'warning' },
  { id: 'prompts', label: 'Prompts', icon: 'sliders' },
  { id: 'workspace', label: 'Workspace', icon: 'puzzle' },
];

const DEMO_BRANCHES = [
  { id: 'b1', name: 'Root Chat — Lantern Parapet', meta: '42 messages · 2m ago' },
  { id: 'b2', name: 'Branch #2 — The Archive Cipher', meta: '19 messages · Yesterday' },
  { id: 'b3', name: 'Branch #3 — Astral Negotiation', meta: '8 messages · Nov 14' },
];

export function AdaptiveShellShowcase() {
  const vp = useViewport();
  const [navTab, setNavTab] = useState('chat');
  const [navOrientation, setNavOrientation] = useState('auto');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeBranchId, setActiveBranchId] = useState('b1');
  const [viewLayout, setViewLayout] = useState('portrait');
  const [cardSize, setCardSize] = useState(144);
  const [splitPinned, setSplitPinned] = useState(false);
  const [demoTagState, setDemoTagState] = useState({ t1: 'and', t3: 'not' });

  const activeBranch = DEMO_BRANCHES.find((b) => b.id === activeBranchId) || DEMO_BRANCHES[0];

  return (
    <FolderCard
      title="Step A1 — Adaptive Viewport, M3 BottomSheet, BottomNavBar & MobileTopAppBar"
      subtitle="Live Window Size Classes, visualViewport keyboard sensor, drag-to-dismiss BottomSheet, portrait Bar / landscape Rail & adaptive KebabMenu/PopoverSheet"
      icon="window"
      defaultOpen
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <Badge variant="tonal" mono>{`mode: ${vp.layoutMode}`}</Badge>
          <Badge variant="neutral" mono>{`${vp.width}×${vp.height}`}</Badge>
          <Badge variant="neutral" mono>{`visualH: ${vp.visualHeight}`}</Badge>
          <Badge variant={vp.isMobile ? 'tonal' : 'outlined'} mono>{`mobile: ${vp.isMobile}`}</Badge>
          <Badge variant={vp.isTablet ? 'tonal' : 'outlined'} mono>{`tablet: ${vp.isTablet}`}</Badge>
          <Badge variant={vp.isShortViewport ? 'tonal' : 'outlined'} mono>{`shortH: ${vp.isShortViewport}`}</Badge>
          <Badge variant={vp.isKeyboardOpen ? 'tonal' : 'outlined'} mono>{`kbd: ${vp.isKeyboardOpen}`}</Badge>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Button variant="b1" size="sm" emphasis="filled" icon="window" onClick={() => setSheetOpen(true)}>
            Open BottomSheet
          </Button>

          <PopoverSheet icon="sliders" size="sm" label="View & Sort" title="View & Sort" activeIndicator={splitPinned}>
            <div className="bb-popover-sheet__section">
              <div className="bb-popover-sheet__label"><span>Layout</span></div>
              <ToggleGroup
                size="sm"
                value={viewLayout}
                onChange={setViewLayout}
                options={[
                  { value: 'portrait', icon: 'aspectPortrait', label: '2:3' },
                  { value: 'square', icon: 'aspectSquare', label: '1:1' },
                  { value: 'list', icon: 'bars', label: 'List' },
                ]}
              />
            </div>
            <div className="bb-popover-sheet__section">
              <div className="bb-popover-sheet__label"><span>Card Size</span><span>{cardSize}px</span></div>
              <Slider min={96} max={220} step={4} value={cardSize} onChange={setCardSize} />
            </div>
            <div className="bb-popover-sheet__section">
              <Switch size="sm" checked={splitPinned} onChange={setSplitPinned} label="Split Pinned / All" />
            </div>
          </PopoverSheet>

          <TagPicker
            compact
            tags={[
              { id: 't1', name: 'Fantasy', count: 42 },
              { id: 't2', name: 'Sci-Fi', count: 18 },
              { id: 't3', name: 'Spoiler', count: 7 },
            ]}
            chipState={demoTagState}
            onSelectMode={(id, mode) =>
              setDemoTagState((prev) => {
                const next = { ...prev };
                if (!mode) delete next[id];
                else next[id] = mode;
                return next;
              })
            }
            onClearAll={() => setDemoTagState({})}
          />

          <KebabMenu
            title="Scenario Actions"
            items={[
              { id: 'new', label: 'Start New Chat', icon: 'chatPlus', onClick: () => {} },
              { id: 'split', label: 'Split Pinned / All', icon: 'starFilled', active: splitPinned, onClick: () => setSplitPinned((v) => !v) },
              { divider: true },
              { id: 'export', label: 'Export PNG', icon: 'download', onClick: () => {} },
              { divider: true },
              { id: 'delete', label: 'Delete Scenario', icon: 'trash', danger: true, onClick: () => {} },
            ]}
          />

          <ToggleGroup
            size="sm"
            value={navOrientation}
            onChange={setNavOrientation}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'horizontal', label: 'Bar' },
              { value: 'rail', label: 'Rail' },
            ]}
          />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: navOrientation === 'rail' ? 'row' : 'column',
            width: '100%',
            maxWidth: navOrientation === 'rail' ? 540 : 412,
            minHeight: navOrientation === 'rail' ? 280 : undefined,
            borderRadius: 'var(--md-sys-shape-corner-md, 16px)',
            border: '1px solid var(--bb-page-border-mid)',
            background: 'var(--md-sys-color-background)',
            overflow: 'hidden',
          }}
        >
          {navOrientation === 'rail' && (
            <BottomNavBar
              items={DEMO_NAV_ITEMS}
              activeId={navTab}
              onChange={setNavTab}
              orientation="rail"
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0 }}>
            <MobileTopAppBar
              avatarInitials="EV"
              title="Elowen Vane"
              subtitle={activeBranch.name}
              titleExpanded={sheetOpen}
              onTitleClick={() => setSheetOpen(true)}
              actions={
                <>
                  <Button variant="b2" size="sm" icon="timeline" title="Timelines" />
                  <Button variant="b2" size="sm" icon="plus" title="New Chat" />
                </>
              }
            />
            <div style={{ padding: '14px 16px', flex: '1 1 auto', fontSize: 12, color: 'var(--bb-ink-muted)' }}>
              Active tab: <strong style={{ color: 'var(--bb-ink-heading)' }}>{navTab}</strong> — tap header to open
              branch BottomSheet, or resize window (&le; 767px) to test KebabMenu &amp; PopoverSheet sheet mode.
            </div>
            {navOrientation !== 'rail' && (
              <BottomNavBar
                items={DEMO_NAV_ITEMS}
                activeId={navTab}
                onChange={setNavTab}
                orientation={navOrientation}
              />
            )}
          </div>
        </div>
      </div>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Chats & Branches"
        subtitle="Drag handle downward or tap scrim to dismiss"
        icon="comments"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {DEMO_BRANCHES.map((branch) => {
            const selected = branch.id === activeBranchId;
            return (
              <button
                key={branch.id}
                type="button"
                onClick={() => {
                  setActiveBranchId(branch.id);
                  setSheetOpen(false);
                }}
                style={{
                  appearance: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  padding: '10px 14px',
                  minHeight: 50,
                  borderRadius: 'var(--bb-control-radius, 8px)',
                  border: `1px solid ${selected ? 'var(--bb-accent-border)' : 'var(--bb-page-border)'}`,
                  background: selected ? 'var(--bb-sheet-item-selected)' : 'var(--bb-sheet-well-bg)',
                  color: 'var(--bb-ink-heading)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>{branch.name}</span>
                <span style={{ fontSize: 12, color: 'var(--bb-ink-muted)' }}>{branch.meta}</span>
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </FolderCard>
  );
}
