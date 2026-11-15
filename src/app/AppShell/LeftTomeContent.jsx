import React from 'react';
import { isDemoCardId } from '@core/cards/cardsApi.js';
import { M3_PRESET_SEEDS } from '@ui/tokens/themeTokens.js';
import {
  Button,
  SegmentedGroup,
  Switch,
  Slider,
  FolderCard,
} from '@ui/index.js';
import { CharacterTome } from '@features/characters/CharacterTome.jsx';
import { ChatsTomePanel } from '@features/chat/ChatsTomePanel.jsx';

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
  themeMode,
  setThemeMode,
  activeSeed,
  setActiveSeed,
  shaderStyle,
  setShaderStyle,
  shaderIntensity,
  setShaderIntensity,
  lowGpu,
  setLowGpu,
  idleFade,
  setIdleFade,
}) {
  const {
    pinnedLayout,
    cards,
    groups,
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

      {leftTab === 'usersettings' && (
        <>
          <FolderCard
            title="Color Theme & Mode"
            subtitle="NexusTavern palette engine"
            icon="palette"
          >
            <SegmentedGroup
              fullWidth
              value={themeMode}
              onChange={setThemeMode}
              options={[
                { value: 'dark', label: 'Dark Mode' },
                { value: 'light', label: 'Light Mode' },
              ]}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {M3_PRESET_SEEDS.map((seed) => (
                <Button
                  key={seed.id}
                  variant="b1"
                  size="sm"
                  emphasis={activeSeed.id === seed.id ? 'filled' : 'outlined'}
                  onClick={() => setActiveSeed(seed)}
                >
                  {seed.name.split(' (')[0]}
                </Button>
              ))}
            </div>
          </FolderCard>

          <FolderCard
            title="Last Message Shader"
            subtitle="Both shader variants available"
            icon="sparkles"
            defaultOpen={false}
          >
            <SegmentedGroup
              fullWidth
              value={shaderStyle}
              onChange={setShaderStyle}
              options={[
                { value: 'caustics', label: 'Chaotic Flow' },
                { value: 'nacre', label: 'Pearl Nacre' },
              ]}
            />
            <Slider
              label="Shader Intensity"
              value={Math.round(shaderIntensity * 100)}
              min={15}
              max={100}
              step={5}
              defaultValue={38}
              unit="%"
              onChange={(v) => setShaderIntensity(v / 100)}
            />
            <Switch
              checked={lowGpu}
              onChange={setLowGpu}
              label="Low-GPU Mode"
              description="Replace WebGL shader with static gradient"
            />
            <Switch
              checked={idleFade}
              onChange={setIdleFade}
              label="Tome Idle Translucency"
              description="Dim side tomes when cursor is in chat"
            />
          </FolderCard>
        </>
      )}
    </>
  );
}
