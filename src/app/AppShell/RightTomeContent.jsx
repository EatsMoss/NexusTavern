import React, { lazy, Suspense, useState, useMemo } from 'react';
import { FolderCard, ModuleNavCard, ProgressIndicator } from '@ui/index.js';
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
 * Right Tome tab router (`selected` | `aiconfig` | `extensions`).
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
  activeExtensionId: controlledExtensionId,
  onChangeExtensionId,
}) {
  const [uncontrolledExtensionId, setUncontrolledExtensionId] = useState(null);
  const activeExtensionId =
    controlledExtensionId !== undefined ? controlledExtensionId : uncontrolledExtensionId;
  const setActiveExtensionId = onChangeExtensionId || setUncontrolledExtensionId;
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

  const activeRegexCount = useMemo(() => {
    if (!regexWorkspace?.masterEnabled) return 0;
    const g = (regexWorkspace.globalScripts || []).filter((s) => !s.disabled).length;
    const p = (regexWorkspace.presetScripts || []).filter((s) => !s.disabled).length;
    const c = hasActiveScenario
      ? (regexWorkspace.cardScripts || []).filter((s) => !s.disabled).length
      : 0;
    return g + p + c;
  }, [
    regexWorkspace?.masterEnabled,
    regexWorkspace?.globalScripts,
    regexWorkspace?.presetScripts,
    regexWorkspace?.cardScripts,
    hasActiveScenario,
  ]);

  const recapEnabled = Boolean(messageRecap?.config?.enabled);
  const savedNum = Math.max(0, Math.round(Number(savedChatTokens) || 0));

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
          {activeExtensionId === 'st-importer' ? (
            <LazyStImporterTomePanel
              onBack={() => setActiveExtensionId(null)}
              importer={stImporter}
            />
          ) : activeExtensionId === 'recap' ? (
            <LazyRecapTomePanel
              onBack={() => setActiveExtensionId(null)}
              recap={messageRecap}
              tokenContext={promptTokenContext}
              savedChatTokens={savedChatTokens}
            />
          ) : activeExtensionId === 'refusal' ? (
            <LazyRefusalCatcherManager
              onBack={() => setActiveExtensionId(null)}
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
          ) : activeExtensionId === 'regex' ? (
            <LazyRegexTomePanel
              onBack={() => setActiveExtensionId(null)}
              workspace={regexWorkspace}
              hasActiveScenario={hasActiveScenario}
              activeCharacterName={activeCharacter?.name || ''}
              activePresetName={activePresets?.openai || 'Default'}
              personaName={personaName}
              latestMessageText={latestMessageText}
              onNotify={onNotifyToast}
            />
          ) : (
            <div className="bb-rc-plugins-stack">
              <ModuleNavCard
                icon="regex"
                title="Regex Studio"
                badge={
                  regexWorkspace?.masterEnabled
                    ? `${activeRegexCount} active`
                    : 'Paused'
                }
                badgeTone={regexWorkspace?.masterEnabled ? 'active' : 'neutral'}
                subtitle="Global, scenario & preset regex rules with live debugger"
                toggleChecked={Boolean(regexWorkspace?.masterEnabled)}
                onToggleChange={regexWorkspace?.handleToggleMaster}
                onClick={() => setActiveExtensionId('regex')}
              />

              <ModuleNavCard
                icon="scissors"
                title="Message Recap"
                badge={
                  recapEnabled && savedNum > 0
                    ? `-${savedNum >= 1000 ? `${(savedNum / 1000).toFixed(1)}k` : savedNum} tok`
                    : recapEnabled
                      ? 'On'
                      : 'Off'
                }
                badgeTone={
                  recapEnabled && savedNum > 0
                    ? 'saved'
                    : recapEnabled
                      ? 'active'
                      : 'neutral'
                }
                subtitle={
                  recapEnabled
                    ? messageRecap?.config?.stripEnabled
                      ? `Compressing older history at Depth ≥ ${messageRecap.config.keepFullDepth ?? 4}`
                      : 'Recap prompts active (history stripping off)'
                    : 'Automatic context compression for long roleplay chats'
                }
                toggleChecked={recapEnabled}
                onToggleChange={(val) =>
                  messageRecap?.handlePatchConfig?.({ enabled: val }, { immediate: true })
                }
                onClick={() => setActiveExtensionId('recap')}
              />

              <ModuleNavCard
                icon="shieldAlert"
                title="Refusal Catcher"
                badge={
                  refusalCatcher?.enabled
                    ? `${refusalCatcher.bannedPhrases?.length || 0} phrases`
                    : 'Off'
                }
                badgeTone={refusalCatcher?.enabled ? 'active' : 'neutral'}
                subtitle={
                  refusalCatcher?.enabled && refusalCatcher?.fallbackEnabled
                    ? 'Intercepts refusals & auto-routes to fallback model'
                    : 'Detects canned AI refusals and retries or redirects'
                }
                toggleChecked={Boolean(refusalCatcher?.enabled)}
                onToggleChange={refusalCatcher?.handleToggleEnabled}
                onClick={() => setActiveExtensionId('refusal')}
              />

              <ModuleNavCard
                icon="download"
                title="SillyTavern Importer"
                badge={
                  stImporter?.job?.running
                    ? `${Math.round(stImporter.job.percent || 0)}%`
                    : null
                }
                badgeTone="active"
                subtitle="One-click import of cards, chats, personas, backgrounds & regex"
                onClick={() => setActiveExtensionId('st-importer')}
              />
            </div>
          )}
        </Suspense>
      )}
    </>
  );
}
