import React, { useMemo } from 'react';
import { BottomNavBar, OverlayScrollArea, ToastStack } from '@ui/index.js';
import { LeftTomeContent } from './LeftTomeContent.jsx';
import { RightTomeContent } from './RightTomeContent.jsx';
import { CenterWorkspaceSheets } from './CenterWorkspaceSheets.jsx';
import { MobileCompactTopBar } from './MobileCompactTopBar.jsx';
import { MobileWorkspaceHub } from './MobileWorkspaceHub.jsx';
import { MobileChatBranchesSheet } from './MobileChatBranchesSheet.jsx';
import './MobileCompactStage.css';

export function useMobileCompactChrome({
  mobileNav,
  isShortViewport = false,
  viewMode,
  setViewMode,
  timelinesOpen,
  leftTomeSharedProps,
  rightTomeSharedProps,
  centerSheetsSharedProps,
  scenario,
  personasWs,
  apiHub,
  presets,
  chat,
  stImporter,
  toasts,
  dismissToast,
  serverStatus,
  onOpenQrModal,
}) {
  const {
    mobileTab,
    navigateMobileTab,
    workspaceSubScreen,
    setWorkspaceSubScreen,
    chatBranchesOpen,
    openChatBranchesSheet,
    closeChatBranchesSheet,
    hasActiveFullScreenEditor,
    hideMobileNav,
  } = mobileNav;

  const mobileTopBarNode = (
    <MobileCompactTopBar
      mobileTab={mobileTab}
      workspaceSubScreen={workspaceSubScreen}
      hasActiveFullScreenEditor={hasActiveFullScreenEditor}
      timelinesOpen={timelinesOpen}
      chatBranchesOpen={chatBranchesOpen}
      onOpenChatBranches={openChatBranchesSheet}
      onNavigateMobileTab={navigateMobileTab}
      scenario={scenario}
      personasWs={personasWs}
      chat={chat}
      onOpenQrModal={onOpenQrModal}
    />
  );

  const hasTopBar = Boolean(
    !hasActiveFullScreenEditor &&
      (mobileTab === 'chat' || (mobileTab === 'workspace' && !workspaceSubScreen)),
  );

  const navItems = useMemo(
    () => [
      {
        id: 'chat',
        label: 'Chat',
        icon: 'comments',
        dot: Boolean(chat.isGenerating),
        dotTone: 'live',
      },
      {
        id: 'scenarios',
        label: 'Scenarios',
        icon: 'addressCard',
      },
      {
        id: 'card',
        label: 'Card',
        icon: 'bookOpen',
        dot: Boolean(scenario.isActiveCardDirty),
        dotTone: 'warning',
      },
      {
        id: 'prompts',
        label: 'Prompts',
        icon: 'sliders',
        dot: Boolean(presets.isCurrentPresetDirty),
        dotTone: 'warning',
      },
      {
        id: 'workspace',
        label: 'Workspace',
        icon: 'puzzle',
        dot: Boolean(stImporter?.job?.running || serverStatus?.tunnel?.active),
        dotTone: stImporter?.job?.running ? 'live' : 'primary',
      },
    ],
    [
      chat.isGenerating,
      scenario.isActiveCardDirty,
      presets.isCurrentPresetDirty,
      stImporter?.job?.running,
      serverStatus?.tunnel?.active,
    ],
  );

  const mobileNavNode = (
    <BottomNavBar
      items={navItems}
      activeId={mobileTab}
      onChange={navigateMobileTab}
      orientation={isShortViewport ? 'rail' : 'horizontal'}
      hidden={hideMobileNav}
      ariaLabel="NexusTavern workspace navigation"
    />
  );

  let activeScreenNode = null;

  if (hasActiveFullScreenEditor || mobileTab === 'chat') {
    activeScreenNode = (
      <CenterWorkspaceSheets
        {...centerSheetsSharedProps}
        leftTomeInset={0}
        rightTomeInset={0}
        chatListOpen={false}
        sheetExpanded={false}
      />
    );
  } else if (mobileTab === 'scenarios') {
    activeScreenNode = (
      <div className="bb-mobile-pane">
        <LeftTomeContent {...leftTomeSharedProps} leftTab="characters" />
      </div>
    );
  } else if (mobileTab === 'card') {
    activeScreenNode = (
      <div className="bb-mobile-pane">
        <RightTomeContent {...rightTomeSharedProps} rightTab="selected" sheetExpanded={false} />
      </div>
    );
  } else if (mobileTab === 'prompts') {
    activeScreenNode = (
      <OverlayScrollArea
        className="bb-mobile-scroll-wrap"
        viewportClassName="bb-mobile-scroll"
      >
        <RightTomeContent {...rightTomeSharedProps} rightTab="aiconfig" sheetExpanded={false} />
      </OverlayScrollArea>
    );
  } else if (mobileTab === 'workspace') {
    activeScreenNode = (
      <MobileWorkspaceHub
        subScreen={workspaceSubScreen}
        onChangeSubScreen={setWorkspaceSubScreen}
        leftTomeSharedProps={leftTomeSharedProps}
        rightTomeSharedProps={rightTomeSharedProps}
        personasWs={personasWs}
        apiHub={apiHub}
        serverStatus={serverStatus}
        onOpenQrModal={onOpenQrModal}
        onOpenSandbox={() => setViewMode('sandbox')}
      />
    );
  }

  const mobileStageNode = (
    <>
      {viewMode !== 'sandbox' && <ToastStack toasts={toasts} onDismiss={dismissToast} />}
      {activeScreenNode}
      <MobileChatBranchesSheet
        open={chatBranchesOpen}
        onClose={closeChatBranchesSheet}
        scenario={scenario}
        personasWs={personasWs}
        chat={chat}
        timelinesOpen={timelinesOpen}
      />
    </>
  );

  return {
    mobileTopBarNode: hasTopBar ? mobileTopBarNode : null,
    mobileNavNode,
    mobileNavRail: Boolean(isShortViewport && !hideMobileNav),
    mobileStageNode,
  };
}
