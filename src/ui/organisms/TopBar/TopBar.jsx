import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Button } from '@ui/atoms/Button/Button.jsx';
import { AvatarStack } from '@ui/molecules/AvatarStack/AvatarStack.jsx';
import './TopBar.css';

export const TOPBAR_CHAT_TITLE_MAX_CHARS = 36;

/**
 * Formats a `.jsonl` chat filename or raw title for the TopBar back/history trigger:
 * strips `.jsonl` extension and truncates at 36 characters with `...`.
 */
export function formatTopBarChatTitle(rawTitle = '', maxChars = TOPBAR_CHAT_TITLE_MAX_CHARS) {
  const clean = String(rawTitle || '')
    .replace(/\.jsonl$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) {
    return { fullTitle: '', displayTitle: '' };
  }
  const chars = Array.from(clean);
  if (chars.length <= maxChars) {
    return { fullTitle: clean, displayTitle: clean };
  }
  return {
    fullTitle: clean,
    displayTitle: `${chars.slice(0, maxChars).join('').trimEnd()}...`,
  };
}

/**
 * TopBar — NexusTavern Top Bar (#top-settings-holder)
 * Spans the full width of the center column:
 * - Left & Right Tome toggle buttons sit outside the chat width right against the inner edges
 *   of the Left & Right Tomes (or viewport edges when a tome is closed).
 * - The inner header track aligns strictly with the chat column width (784px), placing
 *   Open Chats (`AvatarStack` + chat title / `Back to Chat`) flush with the left chat edge
 *   and `Timelines` + `New Chat` flush with the right chat edge.
 */
export function TopBar({
  leftOpen = false,
  onToggleLeft,
  rightOpen = false,
  onToggleRight,
  leftTomeInset = 0,
  rightTomeInset = 0,
  chatTitle = '',
  participants = [],
  chatListOpen = false,
  onToggleChatList,
  timelinesOpen = false,
  onToggleTimelines,
  sheetExpanded = false,
  promptEditorOpen = false,
  workspaceSheetOpen = false,
  onBackToChat,
  qrModalOpen = false,
  tunnelActive = false,
  onClickQrButton,
  showQrButton = false,
  isDemoCard = false,
  loadingChat = false,
  onCreateNewChat,
  className = '',
  style,
}) {
  const isAlternateViewOpen =
    chatListOpen ||
    timelinesOpen ||
    sheetExpanded ||
    promptEditorOpen ||
    workspaceSheetOpen;
  const { fullTitle, displayTitle } = formatTopBarChatTitle(chatTitle);
  const resolvedParticipants =
    Array.isArray(participants) && participants.length > 0
      ? participants
      : [
          { id: 'scenario-fallback', name: fullTitle || 'Scenario', initials: 'SC' },
          { id: 'persona-fallback', name: 'Persona', initials: 'ME' },
        ];
  const backButtonTooltip = fullTitle
    ? `Open chats & branches in Left Tome — ${fullTitle}`
    : 'Open chats & branches in Left Tome';

  const resolvedLeftInset = Math.max(0, Math.round(Number(leftTomeInset) || 0));
  const resolvedRightInset = Math.max(0, Math.round(Number(rightTomeInset) || 0));
  const mergedStyle = {
    '--bb-topbar-left-inset': `${resolvedLeftInset}px`,
    '--bb-topbar-right-inset': `${resolvedRightInset}px`,
    ...style,
  };

  return (
    <header
      id="top-settings-holder"
      className={`bb-topbar ${timelinesOpen ? 'is-timelines-open' : ''} ${className}`.trim()}
      style={mergedStyle}
      role="banner"
    >
      {/* Left Tome Toggle — positioned outside chat width right at the Left Tome edge */}
      <div className="bb-topbar__drawer-slot bb-topbar__drawer-slot--left">
        <button
          type="button"
          className={`bb-topbar__book-toggle ${leftOpen ? 'is-open' : ''}`}
          title="Characters, Chats, Journal & Settings Tome"
          aria-label="Toggle Left Characters & Chats Tome"
          aria-expanded={leftOpen}
          onClick={onToggleLeft}
        >
          <Icon name="addressCard" size={21} className="bb-topbar__book-icon" />
        </button>
      </div>

      {/* Chat-Width Aligned Inner Bar: Open Chats flush left, Timelines + New Chat flush right */}
      <div className="bb-topbar__center">
      {(onToggleChatList || onBackToChat) && (
        <div className="bb-topbar__back-slot">
          {isAlternateViewOpen ? (
            <Button
              variant="b1"
              size="sm"
              emphasis="filled"
              icon="arrowLeft"
              onClick={onBackToChat || onToggleChatList}
              title="Return to the currently selected chat"
            >
              Back to Chat
            </Button>
          ) : (
            <button
              type="button"
              className={`bb-top-back-btn ${displayTitle ? 'has-title' : ''}`.trim()}
              title={backButtonTooltip}
              aria-label={backButtonTooltip}
              aria-expanded={false}
              onClick={onToggleChatList}
            >
              <AvatarStack
                items={resolvedParticipants}
                size={24}
                overlap={0.35}
                className="bb-top-back-avatars"
              />
              {displayTitle && (
                <span className="bb-top-back-title">{displayTitle}</span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Hidden QR button kept for future re-enable */}
      {showQrButton && onClickQrButton && (
        <div className="bb-topbar__qr-slot">
          <button
            type="button"
            id="bb-top-qr-button"
            className={`bb-top-qr-btn ${qrModalOpen ? 'is-open' : ''} ${
              tunnelActive ? 'is-tunnel-active' : ''
            }`.trim()}
            title={
              tunnelActive
                ? 'Mobile Access QR & Encrypted Tunnel (Active)'
                : 'Mobile Access QR & Server Status'
            }
            aria-label="Open Mobile Access QR Code"
            aria-expanded={qrModalOpen}
            onClick={onClickQrButton}
          >
            <Icon name="qr" size={15} className="bb-top-qr-icon" />
          </button>
        </div>
      )}

      {/* Right Edge of Chat Width: Chat Actions (Timelines + New Chat) */}
      {!isDemoCard && (
        <div className="bb-topbar__chat-actions">
          <Button
            variant="b1"
            size="sm"
            emphasis={timelinesOpen ? 'filled' : 'outlined'}
            icon="timeline"
            className="bb-topbar__action-btn"
            title={
              timelinesOpen
                ? 'Close Timelines and return to chat'
                : 'Open horizontal timeline branch tree'
            }
            aria-label="Timelines"
            aria-pressed={timelinesOpen}
            onClick={onToggleTimelines}
          >
            Timelines
          </Button>
          <Button
            variant="b1"
            size="sm"
            icon="plus"
            className="bb-topbar__action-btn"
            disabled={loadingChat}
            title="Create a new .jsonl chat from current greeting"
            aria-label="New Chat"
            onClick={onCreateNewChat}
          >
            New Chat
          </Button>
        </div>
      )}
      </div>

      {/* Right Tome Toggle — positioned outside chat width right at the Right Tome edge */}
      <div className="bb-topbar__drawer-slot bb-topbar__drawer-slot--right">
        <button
          type="button"
          className={`bb-topbar__book-toggle ${rightOpen ? 'is-open' : ''}`}
          title="Selected Scenario, Prompts, Media & Plugins Tome"
          aria-label="Toggle Right Scenario & Prompts Tome"
          aria-expanded={rightOpen}
          onClick={onToggleRight}
        >
          <Icon name="sliders" size={21} className="bb-topbar__book-icon" />
        </button>
      </div>
    </header>
  );
}

