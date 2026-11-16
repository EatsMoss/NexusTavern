import React from 'react';
import { TimelineBranchList } from '@ui/index.js';

/**
 * ChatsTomePanel — Feature wrapper in Left Tome connecting character chat state
 * to the reusable `TimelineBranchList` UI-Kit organism.
 */
export function ChatsTomePanel({
  isDemoCard = false,
  chatFiles = [],
  timelineForest = null,
  activeChatFile = '',
  focusedTreeFile = '',
  characterName = 'Character',
  characterAvatarUrl = null,
  characterInitials = 'CH',
  personaName = 'User',
  personaAvatarUrl = null,
  loadingChat = false,
  loadingList = false,
  timelinesOpen = false,
  onToggleTimelines,
  onFocusNodeOnTree,
  onCreateNewChat,
  onSelectChatFile,
  onBranchChatFile,
  onDeleteChatFiles,
  onImportChats,
  onExportAllChats,
  onDeleteAllChats,
  busyBulkAction = false,
}) {
  return (
    <TimelineBranchList
      isDemoCard={isDemoCard}
      chats={chatFiles}
      forest={timelineForest}
      activeChatFile={activeChatFile}
      focusedTreeFile={focusedTreeFile}
      characterName={characterName}
      characterAvatarUrl={characterAvatarUrl}
      characterInitials={characterInitials}
      personaName={personaName}
      personaAvatarUrl={personaAvatarUrl}
      loadingChat={loadingChat}
      loadingList={loadingList}
      timelinesOpen={timelinesOpen}
      onToggleTimelines={onToggleTimelines}
      onFocusNodeOnTree={onFocusNodeOnTree}
      onCreateNewChat={onCreateNewChat}
      onSelectChatFile={onSelectChatFile}
      onBranchChatFile={onBranchChatFile}
      onDeleteChatFiles={onDeleteChatFiles}
      onImportChats={onImportChats}
      onExportAllChats={onExportAllChats}
      onDeleteAllChats={onDeleteAllChats}
      busyBulkAction={busyBulkAction}
    />
  );
}
