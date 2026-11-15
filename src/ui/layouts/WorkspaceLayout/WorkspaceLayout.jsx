import React from 'react';
import { OverlayScrollArea } from '../../atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import { BookmarkRibbons } from '../../molecules/BookmarkRibbons/BookmarkRibbons.jsx';
import { TomeResizeCurtain } from '../../molecules/TomeResizeCurtain/TomeResizeCurtain.jsx';
import './WorkspaceLayout.css';

/**
 * Pure M3 Three-Column Workspace Layout (UI-Kit Layout Primitive).
 * Zero dependencies on `@features/*` or `@core/*`: renders Left Tome, Center Stage,
 * Right Tome, and modal/overlay portals via declarative slots.
 */
export function WorkspaceLayout({
  idleFade = false,
  minTomeWidth = 360,
  maxTomeWidth = 760,
  defaultTomeWidth = 550,
  leftOpen = false,
  leftWidth = 550,
  onChangeLeftWidth,
  leftTabs = [],
  leftTab = '',
  onChangeLeftTab,
  leftScrollDisabled = false,
  leftContent = null,
  rightOpen = false,
  rightWidth = 550,
  onChangeRightWidth,
  rightTabs = [],
  rightTab = '',
  onChangeRightTab,
  rightScrollDisabled = false,
  rightContent = null,
  overlays = null,
  children,
}) {
  return (
    <div className="bb-app-shell">
      {leftOpen && (
        <aside
          id="left-nav-panel"
          className={`bb-tome bb-tome--left ${idleFade ? 'bb-tome--idle-fade' : ''}`.trim()}
          style={{ width: leftWidth }}
        >
          <BookmarkRibbons
            tabs={leftTabs}
            activeId={leftTab}
            onChange={onChangeLeftTab}
          />

          <OverlayScrollArea
            className="bb-tome__body-wrap"
            viewportClassName="bb-tome__body"
            disabled={leftScrollDisabled}
          >
            {leftContent}
          </OverlayScrollArea>

          <TomeResizeCurtain
            side="left"
            width={leftWidth}
            minWidth={minTomeWidth}
            maxWidth={maxTomeWidth}
            defaultWidth={defaultTomeWidth}
            onChangeWidth={onChangeLeftWidth}
          />
        </aside>
      )}

      <main className="bb-center-column">{children}</main>

      {rightOpen && (
        <aside
          id="right-nav-panel"
          className={`bb-tome bb-tome--right ${idleFade ? 'bb-tome--idle-fade' : ''}`.trim()}
          style={{ width: rightWidth }}
        >
          <TomeResizeCurtain
            side="right"
            width={rightWidth}
            minWidth={minTomeWidth}
            maxWidth={maxTomeWidth}
            defaultWidth={defaultTomeWidth}
            onChangeWidth={onChangeRightWidth}
          />

          <BookmarkRibbons
            tabs={rightTabs}
            activeId={rightTab}
            onChange={onChangeRightTab}
          />

          <OverlayScrollArea
            className="bb-tome__body-wrap"
            viewportClassName="bb-tome__body"
            disabled={rightScrollDisabled}
          >
            {rightContent}
          </OverlayScrollArea>
        </aside>
      )}

      {overlays}
    </div>
  );
}
