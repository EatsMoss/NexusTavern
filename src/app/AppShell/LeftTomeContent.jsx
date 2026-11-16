import React, { lazy, Suspense } from 'react';
import { isDemoCardId } from '@core/cards/cardsApi.js';
import { FolderCard, ProgressIndicator } from '@ui/index.js';
import { CharacterTome } from '@features/characters/CharacterTome.jsx';
import { ChatsTomePanel } from '@features/chat/ChatsTomePanel.jsx';

const LazySettingsTomePanel = lazy(() =>
  import('@features/customization/SettingsTomePanel.jsx').then((m) => ({
    default: m.SettingsTomePanel,
  })),
);

/**
 * Left Tome tab router (`characters` | `chats` | `worldinfo` | `usersettings`).
 */
export function LeftTomeContent({
  leftTab,
  scenario,
  personasWs,
  chat,
  charSplitRatio,
  setCharSplitRatio,
  timelinesOpen,
  customization,
  onNotifyToast,
  serverStatus = null,
  tunnelBusy = false,
  onToggleTunnelWithToast,
  onRefreshStatus,
  onOpenQrModal,
  onOpenWelcomeGuide,
}) {
  const {
    pinnedLayout,
    cards,
    groups,
    visibleCards,
    visibleGroups,
    tags,
    gallery,
    selectedCardId,
    hiddenTagIds,
    multiSelectActive,
    multiSelectedIds,
    stableHandleToggleMultiSelectCard: onToggleMultiSelect,
    handleToggleMultiSelectMode: onToggleMultiSelectMode,
    handleSelectAllResults: onSelectAllResults,
    handleClearMultiSelect: onClearMultiSelect,
    handleExitMultiSelect: onExitMultiSelect,
    visibleSelectableIds,
    allResultsSelected,
    multiSelectActions,
    multiSelectSubpopover,
    multiSelectPopover,
    stableHandleSelectCard: onSelectCard,
    stableHandleGalleryOpenCard: onOpenCard,
    stableHandleGalleryTogglePin: onTogglePinCard,
    handleToggleTagHidden: onToggleTagHidden,
    handleCreateTag: onCreateTag,
    handleOpenCreateScenarioModal: onOpenCreateScenarioModal,
    stableHandleDropImportGalleryFiles: onDropImportGalleryFiles,
    stableKebabItemsForCard: kebabItemsForCard,
    kebabItemsForPinnedFolder,
    kebabItemsForTagFolder,
    loadingCards,
    creatingScenario,
    hasActiveScenario,
    activeCharacter,
  } = scenario;
  const totalSelectableCount = visibleSelectableIds.length;
  const loadingCardsOrCreating = loadingCards || creatingScenario;
  const { personaName, activePersonaObj, activePersonaAvatarUrl } = personasWs;
  const resolvedPersonaName = activePersonaObj?.name || personaName;
  const {
    committedChatCardId,
    loadingCardAndChats,
    timelineChats,
    timelineForest,
    chatFiles,
    activeChatFile,
    focusedTimelineNodeFile,
    activeScenarioAvatarUrl,
    loadingChat,
    handleToggleTimelines: onToggleTimelines,
    handleFocusNodeOnTree: onFocusNodeOnTree,
    handleCreateNewChat: onCreateNewChat,
    handleSelectChatFromList: onSelectChatFromList,
    handleBranchChatFromList: onBranchChatFromList,
    handleDeleteChatsFromList: onDeleteChatsFromList,
    handleImportCharacterChats: onImportCharacterChats,
    handleExportAllCharacterChats: onExportAllCharacterChats,
    handleDeleteAllCharacterChats: onDeleteAllCharacterChats,
    chatBulkBusy,
  } = chat;
  return (
    <>
      {leftTab === 'characters' && (
        <CharacterTome
          pinnedLayout={pinnedLayout}
          cards={cards}
          groups={groups}
          visibleCards={visibleCards}
          visibleGroups={visibleGroups}
          tags={tags}
          gallery={gallery}
          selectedCardId={selectedCardId}
          hiddenTagIds={hiddenTagIds}
          multiSelectActive={multiSelectActive}
          multiSelectedIds={multiSelectedIds}
          onToggleMultiSelect={onToggleMultiSelect}
          onToggleMultiSelectMode={onToggleMultiSelectMode}
          onSelectAllResults={onSelectAllResults}
          onClearMultiSelect={onClearMultiSelect}
          onExitMultiSelect={onExitMultiSelect}
          totalSelectableCount={totalSelectableCount}
          allResultsSelected={allResultsSelected}
          multiSelectActions={multiSelectActions}
          multiSelectActiveActionId={multiSelectSubpopover}
          multiSelectPopover={multiSelectPopover}
          onSelect={onSelectCard}
          onOpen={onOpenCard}
          onTogglePin={onTogglePinCard}
          onToggleTagHidden={onToggleTagHidden}
          onCreateTag={onCreateTag}
          onOpenCreateModal={onOpenCreateScenarioModal}
          onDropImportFiles={onDropImportGalleryFiles}
          kebabItemsFor={kebabItemsForCard}
          kebabItemsForFolder={kebabItemsForPinnedFolder}
          kebabItemsForTagFolder={kebabItemsForTagFolder}
          userName={personaName}
          loading={loadingCardsOrCreating}
          splitRatio={charSplitRatio}
          onSplitRatioChange={setCharSplitRatio}
        />
      )}

      {leftTab === 'chats' && (
        <ChatsTomePanel
          isDemoCard={!hasActiveScenario || isDemoCardId(selectedCardId)}
          chatFiles={
            committedChatCardId === selectedCardId || !loadingCardAndChats
              ? timelineChats.length > 0
                ? timelineChats
                : chatFiles
              : []
          }
          timelineForest={
            committedChatCardId === selectedCardId || !loadingCardAndChats
              ? timelineForest
              : null
          }
          activeChatFile={committedChatCardId === selectedCardId ? activeChatFile : ''}
          focusedTreeFile={focusedTimelineNodeFile}
          characterName={activeCharacter.name}
          characterAvatarUrl={activeScenarioAvatarUrl}
          characterInitials={activeCharacter.initials || 'CH'}
          personaName={resolvedPersonaName}
          personaAvatarUrl={activePersonaAvatarUrl}
          loadingChat={loadingChat}
          loadingList={loadingCardAndChats}
          timelinesOpen={timelinesOpen}
          onToggleTimelines={onToggleTimelines}
          onFocusNodeOnTree={onFocusNodeOnTree}
          onCreateNewChat={onCreateNewChat}
          onSelectChatFile={onSelectChatFromList}
          onBranchChatFile={onBranchChatFromList}
          onDeleteChatFiles={onDeleteChatsFromList}
          onImportChats={onImportCharacterChats}
          onExportAllChats={onExportAllCharacterChats}
          onDeleteAllChats={onDeleteAllCharacterChats}
          busyBulkAction={chatBulkBusy}
        />
      )}

      {leftTab === 'worldinfo' && (
        <FolderCard
          title="Journal & Lorebooks"
          subtitle="World Info & Author's Notes"
          icon="bookAtlas"
        >
          <div className="bb-caption-text">
            World Info &amp; Lorebooks module will be connected in Stage 4.
          </div>
        </FolderCard>
      )}

      {leftTab === 'usersettings' && customization && (
        <Suspense
          fallback={
            <ProgressIndicator
              variant="linear"
              size="sm"
              overlay="top"
              ariaLabel="Loading settings"
            />
          }
        >
          <LazySettingsTomePanel
            customization={customization}
            onNotify={onNotifyToast}
            serverStatus={serverStatus}
            tunnelBusy={tunnelBusy}
            onToggleTunnelWithToast={onToggleTunnelWithToast}
            onRefreshStatus={onRefreshStatus}
            onOpenQrModal={onOpenQrModal}
            onOpenWelcomeGuide={onOpenWelcomeGuide}
          />
        </Suspense>
      )}
    </>
  );
}
