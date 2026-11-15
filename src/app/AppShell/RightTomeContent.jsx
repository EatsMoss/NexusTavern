import React, { lazy, Suspense } from 'react';
import { FolderCard, ProgressIndicator } from '@ui/index.js';
import { CharacterSheet } from '@features/characters/CharacterSheet/CharacterSheet.jsx';

const LazyAdvancedDefinitionsPanel = lazy(() =>
  import('@features/characters/CharacterSheet/AdvancedDefinitionsPanel.jsx').then((m) => ({
    default: m.AdvancedDefinitionsPanel,
  })),
);
const LazyPresetVaultInspector = lazy(() =>
  import('@ui/organisms/PresetVaultInspector/PresetVaultInspector.jsx').then((m) => ({
    default: m.PresetVaultInspector,
  })),
);
const LazyStImporterTomePanel = lazy(() =>
  import('@features/st-importer/StImporterTomePanel.jsx').then((m) => ({
    default: m.StImporterTomePanel,
  })),
);
const LazyRecapTomePanel = lazy(() =>
  import('@features/recap/RecapTomePanel.jsx').then((m) => ({ default: m.RecapTomePanel })),
);
const LazyRefusalCatcherManager = lazy(() =>
  import('@ui/organisms/RefusalCatcherManager/RefusalCatcherManager.jsx').then((m) => ({
    default: m.RefusalCatcherManager,
  })),
);
const LazyRegexTomePanel = lazy(() =>
  import('@features/regex/RegexTomePanel.jsx').then((m) => ({ default: m.RegexTomePanel })),
);

/**
 * Right Tome tab router (`selected` | `aiconfig` | `media` | `extensions`).
 */
export function RightTomeContent({
  rightTab,
  sheetExpanded,
  scenario,
  personasWs,
  apiHub,
  presets,
  chat,
  characterSheetSharedProps,
  aiSubTab,
  setAiSubTab,
  promptTokenContext,
  savedChatTokens,
  stImporter,
  messageRecap,
  refusalCatcher,
  regexWorkspace,
  onNotifyToast,
}) {
  const {
    matchedActiveCardFull,
    isActiveCardDirty,
    cardSaving,
    handleSaveCardToPng: onSaveCardToPng,
    handleDiscardCardChanges: onDiscardCardChanges,
    cards,
    activeCharacter,
    hasActiveScenario,
    handleSelectCard: onSelectCard,
  } = scenario;
  const {
    mainApi,
    openaiPresets,
    activePresets,
    starredPresets,
    presetCategoryMeta,
    handleSelectPreset: onSelectPreset,
    handlePresetMetaPatch: onPresetMetaPatch,
    handleSaveAsPreset: onSaveAsPreset,
    handleRenamePreset: onRenamePreset,
    handleDuplicatePreset: onDuplicatePreset,
    handleDeletePreset: onDeletePreset,
    handleBulkDeletePresets: onBulkDeletePresets,
    handleExportPreset: onExportPreset,
    handleImportPresetFiles: onImportPresetFiles,
    isCurrentPresetDirty,
    activeOpenaiDoc,
    setActiveOpenaiDoc,
    activeTextgenDoc,
    setActiveTextgenDoc,
    handleSavePresetDoc: onSavePresetDoc,
    presetStatusMsg,
    savingPreset,
    loadingPreset,
    editingPromptSelection,
    handleChangeEditingPromptSelection: onChangeEditingPromptSelection,
    handleBindPresetToCharacter: onBindPresetToCharacter,
    handleUnbindAllCharactersFromPreset: onUnbindAllCharactersFromPreset,
  } = presets;
  const {
    apiHubState,
    activeModelMeta,
    handleUpdateHubProvider: onUpdateHubProvider,
    handleFetchHubModels: onFetchHubModels,
    handleDeleteCustomHubConn: onDeleteCustomHubConn,
    handleRevealHubKey: onRevealHubKey,
    handlePingHubConnections: onPingHubConnections,
    handleFetchHubTelemetry: onFetchHubTelemetry,
    handleAddHubCustomFamily: onAddHubCustomFamily,
    handleDeleteHubCustomFamily: onDeleteHubCustomFamily,
    setApiModalOpen,
  } = apiHub;
  const onOpenAddConnection = () => setApiModalOpen(true);
  const personaName = personasWs.activePersonaObj?.name || personasWs.personaName || 'User';
  const latestMessageText =
    chat.messages.length > 0
      ? String(chat.messages[chat.messages.length - 1]?.text || '')
      : '';
  const activeCat = mainApi === 'openai' ? 'openai' : 'textgen';

  return (
    <>
      {rightTab === 'selected' &&
        (sheetExpanded ? (
          <Suspense
            fallback={
              <ProgressIndicator
                variant="linear"
                size="sm"
                overlay="top"
                ariaLabel="Loading advanced definitions"
              />
            }
          >
            <LazyAdvancedDefinitionsPanel
              card={matchedActiveCardFull}
              isDirty={isActiveCardDirty}
              saving={cardSaving}
              onChangeCardField={characterSheetSharedProps.onChangeCardField}
              onSaveCard={onSaveCardToPng}
              onDiscardChanges={onDiscardCardChanges}
              onCollapseExpand={characterSheetSharedProps.onToggleExpand}
            />
          </Suspense>
        ) : (
          <CharacterSheet {...characterSheetSharedProps} isExpanded={false} />
        ))}

      {rightTab === 'aiconfig' && (
        <Suspense
          fallback={
            <ProgressIndicator
              variant="linear"
              size="sm"
              overlay="top"
              ariaLabel="Loading prompt inspector"
            />
          }
        >
          <LazyPresetVaultInspector
            mode="aiconfig"
            openaiPresets={openaiPresets}
            activePresets={activePresets}
            onSelectPreset={onSelectPreset}
            starredPresets={
              mainApi === 'openai'
                ? presetCategoryMeta.openai?.starred || starredPresets
                : presetCategoryMeta.textgen?.starred || []
            }
            onToggleStarPreset={(val, cat = 'openai') =>
              onPresetMetaPatch(cat, { toggleStar: val })
            }
            presetFolders={
              mainApi === 'openai'
                ? presetCategoryMeta.openai?.folders || []
                : presetCategoryMeta.textgen?.folders || []
            }
            onCreatePresetFolder={(cat, name, names) =>
              onPresetMetaPatch(cat, { createFolder: { name, names } })
            }
            onRenamePresetFolder={(cat, folderId, name) =>
              onPresetMetaPatch(cat, { renameFolder: { folderId, name } })
            }
            onDeletePresetFolder={(cat, folderId) =>
              onPresetMetaPatch(cat, { deleteFolder: { folderId } })
            }
            onAssignPresetFolder={(cat, names, folderId) =>
              onPresetMetaPatch(cat, { assignFolder: { names, folderId } })
            }
            onSaveAsPreset={onSaveAsPreset}
            onRenamePreset={onRenamePreset}
            onDuplicatePreset={onDuplicatePreset}
            onDeletePreset={onDeletePreset}
            onBulkDeletePresets={onBulkDeletePresets}
            onExportPreset={onExportPreset}
            onImportPresetFiles={onImportPresetFiles}
            onRevertPreset={onSelectPreset}
            isPresetDirty={isCurrentPresetDirty}
            activeOpenaiDoc={activeOpenaiDoc}
            onChangeOpenaiDoc={setActiveOpenaiDoc}
            onSaveOpenaiDoc={() => onSavePresetDoc('openai', activeOpenaiDoc)}
            activeTextgenDoc={activeTextgenDoc}
            onChangeTextgenDoc={setActiveTextgenDoc}
            onSaveTextgenDoc={() => onSavePresetDoc('textgen', activeTextgenDoc)}
            aiSubTab={aiSubTab}
            onChangeAiSubTab={setAiSubTab}
            presetStatusMsg={presetStatusMsg}
            savingPreset={savingPreset}
            loadingPreset={loadingPreset}
            promptTokenContext={promptTokenContext}
            activeModelMeta={activeModelMeta}
            editingPromptSelection={editingPromptSelection}
            onChangeEditingPromptSelection={onChangeEditingPromptSelection}
            cards={cards}
            activeCharacter={activeCharacter}
            hasActiveScenario={hasActiveScenario}
            characterBindings={presetCategoryMeta[activeCat]?.characterBindings || {}}
            onBindCharacterPreset={(avatar, presetName) =>
              onBindPresetToCharacter(avatar, presetName, activeCat)
            }
            onUnbindAllCharactersFromPreset={(presetName) =>
              onUnbindAllCharactersFromPreset(presetName, activeCat)
            }
            onSelectCharacter={onSelectCard}
          />
        </Suspense>
      )}

      {rightTab === 'media' && (
        <FolderCard
          title="Media & Backgrounds"
          subtitle="Scenario backgrounds & gallery"
          icon="images"
        >
          <div className="bb-caption-text">
            Backgrounds &amp; Gallery module will be connected in Stage 4.
          </div>
        </FolderCard>
      )}

      {rightTab === 'extensions' && (
        <Suspense
          fallback={
            <ProgressIndicator
              variant="linear"
              size="sm"
              overlay="top"
              ariaLabel="Loading extensions"
            />
          }
        >
          <div className="bb-rc-plugins-stack">
            <LazyStImporterTomePanel
              collapsible
              defaultOpen={false}
              importer={stImporter}
            />
            <LazyRecapTomePanel
              collapsible
              defaultOpen={false}
              recap={messageRecap}
              tokenContext={promptTokenContext}
              savedChatTokens={savedChatTokens}
            />
            <LazyRefusalCatcherManager
              collapsible
              defaultOpen={false}
              enabled={refusalCatcher.enabled}
              delayMs={refusalCatcher.delayMs}
              bannedPhrases={refusalCatcher.bannedPhrases}
              onToggleEnabled={refusalCatcher.handleToggleEnabled}
              onAddPhrase={refusalCatcher.handleAddPhrase}
              onRemovePhrase={refusalCatcher.handleRemovePhrase}
              onReplacePhrases={refusalCatcher.handleReplacePhrases}
              fallbackEnabled={refusalCatcher.fallbackEnabled}
              fallbackConnectionId={refusalCatcher.fallbackConnectionId}
              fallbackModelId={refusalCatcher.fallbackModelId}
              onToggleFallbackEnabled={refusalCatcher.handleToggleFallbackEnabled}
              onSelectFallbackTarget={refusalCatcher.handleSelectFallbackTarget}
              connections={apiHubState?.connections || []}
              customFamilies={apiHubState?.customFamilies || []}
              onUpdateConnection={onUpdateHubProvider}
              onFetchConnectionModels={onFetchHubModels}
              onDeleteConnection={onDeleteCustomHubConn}
              onRevealConnectionKey={onRevealHubKey}
              onPingConnections={onPingHubConnections}
              onFetchTelemetry={onFetchHubTelemetry}
              onAddCustomFamily={onAddHubCustomFamily}
              onDeleteCustomFamily={onDeleteHubCustomFamily}
              onOpenAddConnection={onOpenAddConnection}
            />
            <LazyRegexTomePanel
              collapsible
              defaultOpen={false}
              workspace={regexWorkspace}
              hasActiveScenario={hasActiveScenario}
              activeCharacterName={activeCharacter?.name || ''}
              activePresetName={activePresets?.openai || 'Default'}
              personaName={personaName}
              latestMessageText={latestMessageText}
              onNotify={onNotifyToast}
            />
          </div>
        </Suspense>
      )}
    </>
  );
}
