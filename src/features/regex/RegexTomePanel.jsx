import React from 'react';
import { RegexManager } from '@ui/organisms/RegexManager/RegexManager.jsx';

/**
 * RegexTomePanel — Right Tome `Plugins` tab panel backed by `useRegexWorkspace`.
 */
export function RegexTomePanel({
  workspace,
  hasActiveScenario = false,
  activeCharacterName = '',
  activePresetName = '',
  personaName = 'User',
  latestMessageText = '',
  onNotify,
  collapsible = false,
  defaultOpen = false,
}) {
  if (!workspace) return null;

  return (
    <RegexManager
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      masterEnabled={workspace.masterEnabled}
      onToggleMaster={workspace.handleToggleMaster}
      activeScope={workspace.activeScope}
      onChangeScope={workspace.setActiveScope}
      globalScripts={workspace.globalScripts}
      cardScripts={workspace.cardScripts}
      presetScripts={workspace.presetScripts}
      hasActiveScenario={hasActiveScenario}
      scenarioName={activeCharacterName}
      presetName={activePresetName}
      userName={personaName}
      sampleSeedText={latestMessageText}
      scopeFolders={workspace.scopeFolders}
      scopeAssignments={workspace.scopeAssignments}
      onSaveScripts={workspace.handleSaveScripts}
      onSaveFolders={workspace.handleSaveFolders}
      onTransferScript={workspace.handleTransferScript}
      onNotify={onNotify}
    />
  );
}

