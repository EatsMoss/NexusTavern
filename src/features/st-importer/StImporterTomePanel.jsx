import React from 'react';
import { StImporterManager } from '@ui/index.js';

/**
 * StImporterTomePanel — Right Tome `Plugins` card backed by `useStImporter`.
 */
export function StImporterTomePanel({
  importer,
  collapsible = true,
  defaultOpen = false,
}) {
  if (!importer) return null;

  return (
    <StImporterManager
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      isLocalHost={importer.isLocalHost}
      canBrowseNative={importer.canBrowseNative}
      rootPath={importer.rootPath}
      onChangeRootPath={importer.handleChangeRootPath}
      onBrowseDirectory={importer.handleBrowseDirectory}
      onScanDirectory={importer.handleScanDirectory}
      onClearSavedState={importer.handleClearSavedState}
      browsing={importer.browsing}
      scanning={importer.scanning}
      scanSummary={importer.scanSummary}
      scanError={importer.scanError}
      selectedProfile={importer.selectedProfile}
      onSelectProfile={importer.handleSelectProfile}
      categories={importer.categories}
      onToggleCategory={importer.handleToggleCategory}
      onSetAllCategories={importer.handleSetAllCategories}
      conflictMode={importer.conflictMode}
      onChangeConflictMode={importer.setConflictMode}
      job={importer.job}
      onStartImport={importer.handleStartImport}
      onCancelImport={importer.handleCancelImport}
      lastReport={importer.lastReport}
      onDismissReport={importer.handleDismissReport}
    />
  );
}
