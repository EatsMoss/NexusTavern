import React from 'react';
import { OverlayScrollArea } from '../../atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import { BookmarkRibbons } from '../../molecules/BookmarkRibbons/BookmarkRibbons.jsx';
import { TomeResizeCurtain } from '../../molecules/TomeResizeCurtain/TomeResizeCurtain.jsx';
import './WorkspaceLayout.css';

/**
 * Pure M3 Adaptive Workspace Layout (UI-Kit Layout Primitive).
 * Supports 4 canonical M3 Window Size Classes (`expanded-dual`, `expanded-single`,
 * `medium` Modal Drawer with Scrim, and `compact`) with zero `@features/*` or `@core/*` imports.
 */
export function WorkspaceLayout({
  layoutMode = 'expanded-dual',
  idleFade = false,
  allowResize = true,
  minTomeWidth = 380,
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
  onCloseDrawers,
  overlays = null,
  children,
}) {
  const isModalDrawer = layoutMode === 'medium';
  const showIdleFade = Boolean(idleFade && !isModalDrawer && layoutMode === 'expanded-dual');
  const showResizeCurtain = Boolean(allowResize && !isModalDrawer && layoutMode !== 'compact');
  const showDrawerScrim = Boolean(isModalDrawer && (leftOpen || rightOpen));

  return (
    <div
      className={`bb-app-shell bb-app-shell--${layoutMode}`}
      data-shell-mode={layoutMode}
    >
      {showDrawerScrim && (
        <div
          className="bb-tome-scrim"
          aria-hidden="true"
          onClick={onCloseDrawers}
        />
      )}

      {leftOpen && (
        <aside
          id="left-nav-panel"
          aria-label="Left workspace navigation tome"
          className={[
            'bb-tome',
            'bb-tome--left',
            isModalDrawer ? 'bb-tome--modal-drawer' : '',
            showIdleFade ? 'bb-tome--idle-fade' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={isModalDrawer ? undefined : { width: leftWidth }}
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

          {showResizeCurtain && (
            <TomeResizeCurtain
              side="left"
              width={leftWidth}
              minWidth={minTomeWidth}
              maxWidth={maxTomeWidth}
              defaultWidth={defaultTomeWidth}
              onChangeWidth={onChangeLeftWidth}
            />
          )}
        </aside>
      )}

      <main className="bb-center-column">{children}</main>

      {rightOpen && (
        <aside
          id="right-nav-panel"
          aria-label="Right scenario and prompts tome"
          className={[
            'bb-tome',
            'bb-tome--right',
            isModalDrawer ? 'bb-tome--modal-drawer' : '',
            showIdleFade ? 'bb-tome--idle-fade' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={isModalDrawer ? undefined : { width: rightWidth }}
        >
          {showResizeCurtain && (
            <TomeResizeCurtain
              side="right"
              width={rightWidth}
              minWidth={minTomeWidth}
              maxWidth={maxTomeWidth}
              defaultWidth={defaultTomeWidth}
              onChangeWidth={onChangeRightWidth}
            />
          )}

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

