import React, { useMemo } from 'react';
import { isDemoCardId } from '@core/cards/cardsApi.js';
import { formatMobileChatSubtitle } from '@core/hooks/mobileShellMath.js';
import { Button, KebabMenu, MobileTopAppBar } from '@ui/index.js';

/**
 * Single-Bar M3 MobileTopAppBar resolver (Option 1):
 * Renders on `Chat` (when no full-screen editor is active) and on the root `Workspace` hub.
 * Returns `null` on `Scenarios`, `Card`, `Prompts`, full-screen editors, and `Workspace`
 * sub-screens so there are never stacked double headers.
 */
export function MobileCompactTopBar({
  mobileTab = 'chat',
  workspaceSubScreen = null,
  hasActiveFullScreenEditor = false,
  timelinesOpen = false,
  chatBranchesOpen = false,
  onOpenChatBranches,
  onNavigateMobileTab,
  scenario,
  personasWs,
  chat,
  onOpenQrModal,
}) {
  const isDemo = !scenario.hasActiveScenario || isDemoCardId(scenario.selectedCardId);
  const activeChatFile =
    chat.committedChatCardId === scenario.selectedCardId ? chat.activeChatFile : '';

  const chatSubtitle = formatMobileChatSubtitle({
    activeChatFile,
    hasActiveScenario: scenario.hasActiveScenario,
    isSwitchingScenario: chat.isSwitchingScenario,
  });

  const chatMenuItems = useMemo(
    () => [
      {
        id: 'branches',
        label: 'Chats & Branches...',
        icon: 'comments',
        disabled: isDemo,
        onClick: onOpenChatBranches,
      },
      {
        id: 'open-card',
        label: 'Scenario Sheet (Card)',
        icon: 'bookOpen',
        disabled: !scenario.hasActiveScenario,
        onClick: () => onNavigateMobileTab('card'),
      },
      {
        id: 'open-prompts',
        label: 'AI Presets & Prompts',
        icon: 'sliders',
        onClick: () => onNavigateMobileTab('prompts'),
      },
      { divider: true },
      {
        id: 'personas',
        label: 'User Personas...',
        icon: 'user',
        onClick: () => personasWs.handleOpenManagePersonaModal?.(),
      },
      {
        id: 'remote-qr',
        label: 'Remote Access & QR...',
        icon: 'qr',
        onClick: onOpenQrModal,
      },
    ],
    [
      isDemo,
      onOpenChatBranches,
      scenario.hasActiveScenario,
      onNavigateMobileTab,
      personasWs,
      onOpenQrModal,
    ],
  );

  if (hasActiveFullScreenEditor) return null;

  if (mobileTab === 'chat') {
    return (
      <MobileTopAppBar
        leading={
          timelinesOpen ? (
            <Button
              variant="b2"
              size="sm"
              icon="arrowLeft"
              title="Back to Chat"
              aria-label="Back to Chat"
              onClick={chat.handleBackToChat}
            />
          ) : null
        }
        avatarUrl={scenario.hasActiveScenario ? chat.activeScenarioAvatarUrl : ''}
        avatarInitials={
          scenario.hasActiveScenario ? scenario.activeCharacter.initials || 'CH' : 'NT'
        }
        title={scenario.hasActiveScenario ? scenario.activeCharacter.name : 'NexusTavern'}
        subtitle={timelinesOpen ? 'Timeline Graph · Tap a branch node' : chatSubtitle}
        titleExpanded={chatBranchesOpen}
        titleButtonLabel={
          scenario.hasActiveScenario && !isDemo
            ? `Switch chat or branch for ${scenario.activeCharacter.name}`
            : ''
        }
        onTitleClick={
          scenario.hasActiveScenario && !isDemo
            ? onOpenChatBranches
            : () => onNavigateMobileTab('scenarios')
        }
        actions={
          <>
            <Button
              variant={timelinesOpen ? 'b1' : 'b2'}
              size="sm"
              emphasis={timelinesOpen ? 'filled' : 'flat'}
              icon="timeline"
              active={timelinesOpen}
              disabled={isDemo}
              title={timelinesOpen ? 'Close Timeline Graph' : 'Open Timeline Graph'}
              aria-label="Timelines"
              onClick={chat.handleToggleTimelines}
            />
            <Button
              variant="b2"
              size="sm"
              icon="plus"
              disabled={isDemo || chat.loadingChat}
              title="Start New Chat"
              aria-label="New Chat"
              onClick={() => chat.handleCreateNewChat?.()}
            />
            <KebabMenu
              icon="moreVert"
              size="sm"
              align="right"
              title="Chat actions"
              items={chatMenuItems}
            />
          </>
        }
      />
    );
  }

  if (mobileTab === 'workspace' && !workspaceSubScreen) {
    return (
      <MobileTopAppBar
        icon="puzzle"
        title="Workspace"
        subtitle="Settings, Personas, API Vault & Plugins"
        actions={
          <Button
            variant="b2"
            size="sm"
            icon="qr"
            title="Remote Access & QR Pairing"
            aria-label="Remote Access & QR Pairing"
            onClick={onOpenQrModal}
          />
        }
      />
    );
  }

  return null;
}
