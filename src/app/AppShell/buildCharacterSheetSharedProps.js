import { resolveCharacterBoundPreset } from '@core/presets/presetsApi.js';
import { M3_PRESET_SEEDS } from '@ui/tokens/themeTokens.js';

/**
 * Builds the shared prop bundle passed to `CharacterSheet` in both Right Tome
 * (`isExpanded={false}`) and Central Stage (`isExpanded`) modes.
 */
export function buildCharacterSheetSharedProps({
  isMobile,
  isCompact = false,
  onNavigateMobileTab = null,
  scenario,
  personasWs,
  presets,
  chat,
  activeSheetTab,
  setActiveSheetTab,
  sheetExpanded,
  setSheetExpanded,
  setRightOpen,
  setRightTab,
  setTimelinesOpen,
  activeWorkspaceSheetKind,
  runWithWorkspaceUnsavedGuard,
  scrollToChatBottom,
}) {
  const { activeCardFull, selectedCardId } = scenario;

  return {
    card: scenario.matchedActiveCardFull,
    compactMode: isCompact,
    loading: Boolean(scenario.hasActiveScenario && !scenario.matchedActiveCardFull),
    cleanSnapshot: scenario.cleanCardSnapshot,
    activeIntroIdx: scenario.activeIntroIdx,
    onChangeIntroIdx: scenario.setActiveIntroIdx,
    editingIntroTarget: scenario.editingIntroTarget,
    onOpenIntroEditor: scenario.handleOpenIntroEditor,
    activeTab: activeSheetTab,
    onChangeTab: setActiveSheetTab,
    saving: scenario.cardSaving,
    busyPortrait: scenario.busyPortrait,
    statusMsg: scenario.cardSaveStatus,
    onChangeCardField: (patch) =>
      scenario.setActiveCardFull((prev) => (prev ? { ...prev, ...patch } : prev)),
    onPersistCardPatch: scenario.handlePersistCardPatch,
    onSaveCard: scenario.handleSaveCardToPng,
    onDiscardChanges: scenario.handleDiscardCardChanges,
    onToggleSpoilerBlur: scenario.handleToggleSpoilerBlur,
    onTogglePin: scenario.handleToggleActiveCardPin,
    onOpenAdvanced: () => {
      if (isCompact) {
        setActiveSheetTab((prev) => (prev === 'advanced' ? 'description' : 'advanced'));
        return;
      }
      const guardKind =
        activeWorkspaceSheetKind && activeWorkspaceSheetKind !== 'expandedCharacter'
          ? activeWorkspaceSheetKind
          : null;
      runWithWorkspaceUnsavedGuard(
        () => {
          setTimelinesOpen(false);
          presets.setEditingPromptSelection(null);
          scenario.setEditingIntroTarget(null);
          scenario.setCreateScenarioModalOpen(false);
          personasWs.setPersonaModalOpen(false);
          setSheetExpanded(true);
          setRightOpen(true);
          setRightTab('selected');
        },
        { targetKind: guardKind },
      );
    },
    onToggleExpand: isCompact
      ? null
      : () => {
          if (sheetExpanded) {
            runWithWorkspaceUnsavedGuard(
              () => {
                setSheetExpanded(false);
                setRightTab('selected');
                scrollToChatBottom();
              },
              { targetKind: 'expandedCharacter' },
            );
            return;
          }
          const guardKind =
            activeWorkspaceSheetKind && activeWorkspaceSheetKind !== 'expandedCharacter'
              ? activeWorkspaceSheetKind
              : null;
          runWithWorkspaceUnsavedGuard(
            () => {
              setTimelinesOpen(false);
              presets.setEditingPromptSelection(null);
              scenario.setEditingIntroTarget(null);
              scenario.setCreateScenarioModalOpen(false);
              personasWs.setPersonaModalOpen(false);
              if (!isMobile) {
                setRightOpen(true);
              }
              setRightTab('selected');
              setSheetExpanded(true);
            },
            { targetKind: guardKind },
          );
        },
    onStartNewChat: async (introPayload) => {
      await chat.handleCreateNewChat?.(introPayload);
      if (isCompact) {
        onNavigateMobileTab?.('chat');
      }
    },
    onPickMainPortraitFile: scenario.handlePickMainPortraitFile,
    onUploadGalleryPortraits: scenario.handleUploadGalleryPortraits,
    onSelectGalleryPortrait: scenario.handleSelectGalleryPortrait,
    onDeleteGalleryPortrait: scenario.handleDeleteGalleryPortrait,
    onUploadIntroPortrait: scenario.handleUploadIntroPortrait,
    onPickReplaceCardFile: scenario.handlePickReplaceCardFile,
    onExportCard: (fmt) =>
      scenario.handleExportCard(activeCardFull?.avatar || selectedCardId, fmt),
    onDuplicateCard: () =>
      scenario.handleDuplicateCard(activeCardFull?.avatar || selectedCardId),
    onConvertToPersona: scenario.handleConvertActiveCardToPersona,
    onRefreshChatPortraits: scenario.handleRefreshChatPortraits,
    onDeleteCard: () => {
      if (!activeCardFull) return;
      scenario.setDeleteDialog({
        kind: 'card',
        id: activeCardFull.avatar || activeCardFull.id,
        name: activeCardFull.name || activeCardFull.avatar,
        deleteChats: true,
      });
    },
    linksProps: {
      allTags: scenario.tags,
      personas: personasWs.personas,
      worlds: scenario.worlds,
      themePresets: M3_PRESET_SEEDS,
      activeChatFile: chat.activeChatFile,
      activeChatWorld: chat.activeChatWorld,
      busyAction: scenario.busyLinksAction,
      onAssignTag: scenario.handleAssignTagOnActiveCard,
      onRemoveTag: scenario.handleRemoveTagOnActiveCard,
      onCreateAndAssignTag: scenario.handleCreateAndAssignTagOnActiveCard,
      onImportEmbeddedTags: scenario.handleImportEmbeddedTagsOnActiveCard,
      onBindPersona: personasWs.handleBindPersonaToActiveCard,
      onUnbindPersona: personasWs.handleUnbindPersonaFromActiveCard,
      onUnbindAllPersonas: personasWs.handleUnbindAllPersonasFromActiveCard,
      onSelectActivePersona: personasWs.handleSelectPersona,
      openaiPresets: presets.openaiPresets,
      starredPresets:
        presets.presetCategoryMeta.openai?.starred || presets.starredPresets,
      onToggleStarPreset: (val) =>
        presets.handlePresetMetaPatch('openai', { toggleStar: val }),
      activePresetName: presets.activePresets?.openai || '',
      boundPresetName: resolveCharacterBoundPreset(
        presets.presetCategoryMeta.openai?.characterBindings,
        activeCardFull?.avatar || selectedCardId,
      ),
      onBindPreset: (presetName) =>
        presets.handleBindPresetToCharacter(
          activeCardFull?.avatar || selectedCardId,
          presetName,
          'openai',
        ),
      onUnbindPreset: () =>
        presets.handleBindPresetToCharacter(
          activeCardFull?.avatar || selectedCardId,
          null,
          'openai',
        ),
      onActivatePreset: (presetName) => presets.handleSelectPreset('openai', presetName),
      onOpenPresetInspector: () => {
        if (isCompact) {
          onNavigateMobileTab?.('prompts');
          return;
        }
        setRightOpen(true);
        setRightTab('aiconfig');
      },
      onChangePrimaryWorld: scenario.handleChangePrimaryWorld,
      onAddAuxWorld: (wName) => {
        const cur = Array.isArray(activeCardFull?.auxWorlds)
          ? activeCardFull.auxWorlds
          : [];
        if (!cur.includes(wName)) scenario.handleUpdateAuxWorlds([...cur, wName]);
      },
      onRemoveAuxWorld: (wName) => {
        const cur = Array.isArray(activeCardFull?.auxWorlds)
          ? activeCardFull.auxWorlds
          : [];
        scenario.handleUpdateAuxWorlds(cur.filter((x) => x !== wName));
      },
      onImportEmbeddedLore: scenario.handleImportEmbeddedLoreOnActiveCard,
      onChangeChatWorld: chat.handleChangeActiveChatWorld,
      onUpdateScenarioMeta: scenario.handleUpdateActiveScenarioMeta,
    },
  };
}
