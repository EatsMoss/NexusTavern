import React from 'react';
import { MessageRecapManager } from '@ui/index.js';

/**
 * RecapTomePanel — Right Tome `Extensions` tab panel backed by `useMessageRecap`.
 */
export function RecapTomePanel({
  recap,
  tokenContext = null,
  savedChatTokens = 0,
  collapsible = true,
  defaultOpen = false,
}) {
  if (!recap) return null;

  return (
    <MessageRecapManager
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
