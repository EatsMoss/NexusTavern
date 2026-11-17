import React, { useCallback } from 'react';
import { isDemoCardId } from '@core/cards/cardsApi.js';
import { BottomSheet } from '@ui/index.js';
import { ChatsTomePanel } from '@features/chat/ChatsTomePanel.jsx';

/**
 * MobileChatBranchesSheet — Quick M3 Modal Bottom Sheet triggered by tapping
 * the character / branch identity pill inside `MobileTopAppBar`.
 * Reuses `ChatsTomePanel` (`TimelineBranchList`) with zero logic duplication.
 */
export function MobileChatBranchesSheet({
  open = false,
  onClose,
  scenario,
  personasWs,
  chat,
  timelinesOpen = false,
}) {
  const { selectedCardId, hasActiveScenario, activeCharacter } = scenario;
  const resolvedPersonaName = personasWs.activePersonaObj?.name || personasWs.personaName;

  const chatFilesForSheet =
    chat.committedChatCardId === selectedCardId || !chat.loadingCardAndChats
      ? chat.timelineChats.length > 0
        ? chat.timelineChats
        : chat.chatFiles
      : [];

  const handleSelectChatAndClose = useCallback(
    async (fileName) => {
      await chat.handleSelectChatFromList?.(fileName);
      onClose?.();
    },
    [chat, onClose],
  );

  const handleBranchChatAndClose = useCallback(
    async (fileName) => {
      await chat.handleBranchChatFromList?.(fileName);
      onClose?.();
    },
    [chat, onClose],
  );

  const handleCreateChatAndClose = useCallback(
    async (introPayload) => {
      await chat.handleCreateNewChat?.(introPayload);
      onClose?.();
    },
    [chat, onClose],
  );

  const handleToggleTimelinesFromSheet = useCallback(() => {
    onClose?.();
    chat.handleToggleTimelines?.();
  }, [chat, onClose]);

  const handleFocusNodeFromSheet = useCallback(
    (fileName, opts) => {
      onClose?.();
      chat.handleFocusNodeOnTree?.(fileName, opts);
    },
    [chat, onClose],
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Chats & Branches"
      subtitle={
        hasActiveScenario
          ? `${activeCharacter.name} · ${chatFilesForSheet.length} ${
              chatFilesForSheet.length === 1 ? 'chat' : 'chats'
            }`
          : 'Select a scenario first'
      }
      icon="comments"
      bodyScrollable={false}
      maxWidth={600}
      bodyClassName="bb-mobile-branches-sheet__body"
    >
      <div className="bb-mobile-branches-sheet__stage">
        <ChatsTomePanel
          isDemoCard={!hasActiveScenario || isDemoCardId(selectedCardId)}
          chatFiles={chatFilesForSheet}
          timelineForest={
            chat.committedChatCardId === selectedCardId || !chat.loadingCardAndChats
              ? chat.timelineForest
              : null
          }
          activeChatFile={
            chat.committedChatCardId === selectedCardId ? chat.activeChatFile : ''
          }
          focusedTreeFile={chat.focusedTimelineNodeFile}
          characterName={activeCharacter.name}
          characterAvatarUrl={chat.activeScenarioAvatarUrl}
          characterInitials={activeCharacter.initials || 'CH'}
          personaName={resolvedPersonaName}
          personaAvatarUrl={personasWs.activePersonaAvatarUrl}
          loadingChat={chat.loadingChat}
          loadingList={chat.loadingCardAndChats}
          timelinesOpen={timelinesOpen}
          onToggleTimelines={handleToggleTimelinesFromSheet}
          onFocusNodeOnTree={handleFocusNodeFromSheet}
          onCreateNewChat={handleCreateChatAndClose}
          onSelectChatFile={handleSelectChatAndClose}
          onBranchChatFile={handleBranchChatAndClose}
          onDeleteChatFiles={chat.handleDeleteChatsFromList}
          onImportChats={chat.handleImportCharacterChats}
          onExportAllChats={chat.handleExportAllCharacterChats}
          onDeleteAllChats={chat.handleDeleteAllCharacterChats}
          busyBulkAction={chat.chatBulkBusy}
        />
      </div>
    </BottomSheet>
  );
}
