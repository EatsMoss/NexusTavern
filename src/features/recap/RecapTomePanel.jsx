import React from 'react';
import { MessageRecapManager } from '@ui/organisms/MessageRecapManager/MessageRecapManager.jsx';

/**
 * RecapTomePanel — Right Tome `Extensions` tab panel backed by `useMessageRecap`.
 */
export function RecapTomePanel({
  recap,
  tokenContext = null,
  savedChatTokens = 0,
  onBack = null,
  collapsible = false,
  defaultOpen = true,
}) {
  if (!recap) return null;

  return (
    <MessageRecapManager
      onBack={onBack}
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      config={recap.config}
      tokenContext={tokenContext}
      savedChatTokens={savedChatTokens}
      onPatchConfig={recap.handlePatchConfig}
      onResetDefaults={recap.handleResetDefaults}
      onImportConfig={recap.handleImportConfig}
    />
  );
}
