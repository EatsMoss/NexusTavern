import React, { useState, useEffect } from 'react';
import { BrandLogo } from '../../atoms/BrandLogo/BrandLogo.jsx';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { Modal } from '../Modal/Modal.jsx';
import { StImporterManager } from '../StImporterManager/StImporterManager.jsx';
import './WelcomeModal.css';

/**
 * WelcomeModal — Pure M3 Solid Sheet quick-start dialog shown on a clean
 * NexusTavern launch (0 scenarios & 0 personas).
 */
export function WelcomeModal({
  open = false,
  onClose,
  onStartEmpty,
  onCreatePersona,
  importer = null,
}) {
  const [step, setStep] = useState('cards'); // 'cards' | 'import'

  useEffect(() => {
    if (!open) setStep('cards');
  }, [open]);

  const isImporting = Boolean(importer?.job?.running);
  const importCompleted = Boolean(
    importer?.lastReport &&
      !importer.lastReport.canceled &&
      Number(importer.lastReport.totals?.imported) > 0,
  );

  const handleOpenImportStep = () => {
    importer?.handleSetAllCategories?.(true);
    setStep('import');
  };

  const handleDismiss = () => {
    if (isImporting) return;
    if (onStartEmpty) onStartEmpty();
    else onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={handleDismiss}
      title={step === 'import' ? 'Import from SillyTavern' : 'Welcome to NexusTavern'}
      subtitle={
        step === 'import'
          ? 'Select your SillyTavern folder to migrate backgrounds, characters, personas, regex & chats'
          : 'Your library is clean — bring your SillyTavern collection or create a new persona'
      }
      icon={step === 'import' ? 'download' : 'sparkles'}
      width={step === 'import' ? 580 : 540}
      scrollWatchValue={step}
      footer={
        step === 'import' ? (
          <div className="bb-welcome-modal__footer-row">
            <Button
              variant="b1"
              emphasis="outlined"
              size="sm"
              pill
              icon="arrowLeft"
              disabled={isImporting}
              onClick={() => setStep('cards')}
            >
              Back
            </Button>
            <Button
              variant="b1"
              emphasis={importCompleted ? 'filled' : 'tonal'}
              size="sm"
              pill
              icon={importCompleted ? 'check' : undefined}
              disabled={isImporting}
              onClick={handleDismiss}
            >
              {importCompleted ? 'Finish Setup' : 'Close'}
            </Button>
          </div>
        ) : (
          <div className="bb-welcome-modal__footer-row bb-welcome-modal__footer-row--end">
            <Button variant="b1" emphasis="outlined" size="sm" pill onClick={handleDismiss}>
              Start Empty
            </Button>
          </div>
        )
      }
    >
      {step === 'cards' ? (
        <div className="bb-welcome-modal">
          <div className="bb-welcome-modal__hero">
            <BrandLogo size={44} badge />
            <div className="bb-welcome-modal__hero-copy">
              <div className="bb-welcome-modal__hero-title">Quick Setup</div>
              <p className="bb-welcome-modal__hero-sub">
                Choose how to initialize your workspace. Both tools remain accessible anytime from the composer and Extensions tome.
              </p>
            </div>
          </div>

          <div className="bb-welcome-modal__cards" role="list">
            <button
              type="button"
              role="listitem"
              className="bb-welcome-card"
              onClick={handleOpenImportStep}
            >
              <span className="bb-welcome-card__icon-box bb-welcome-card__icon-box--primary" aria-hidden="true">
                <Icon name="download" size={22} />
              </span>
              <div className="bb-welcome-card__body">
                <div className="bb-welcome-card__title-row">
                  <span className="bb-welcome-card__title">Full Import from SillyTavern</span>
                  <span className="bb-welcome-card__pill">Recommended</span>
                </div>
                <span className="bb-welcome-card__desc">
                  Import your characters, tags &amp; groups, personas, chat histories, backgrounds, and global regex rules in one pass.
                </span>
              </div>
              <span className="bb-welcome-card__arrow" aria-hidden="true">
                <Icon name="chevronRight" size={18} />
              </span>
            </button>

            <button
              type="button"
              role="listitem"
              className="bb-welcome-card"
              onClick={() => onCreatePersona?.()}
            >
              <span className="bb-welcome-card__icon-box bb-welcome-card__icon-box--secondary" aria-hidden="true">
                <Icon name="user" size={22} />
              </span>
              <div className="bb-welcome-card__body">
                <div className="bb-welcome-card__title-row">
                  <span className="bb-welcome-card__title">Create Your Persona</span>
                  <span className="bb-welcome-card__pill bb-welcome-card__pill--muted">For New Users</span>
                </div>
                <span className="bb-welcome-card__desc">
                  Starting fresh? Set up a new player name, portrait, and character description for roleplay sessions.
                </span>
              </div>
              <span className="bb-welcome-card__arrow" aria-hidden="true">
                <Icon name="chevronRight" size={18} />
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bb-welcome-modal__importer-wrap">
          {importer ? (
            <StImporterManager
              collapsible={false}
              defaultOpen
              isLocalHost={importer.isLocalHost}
              canBrowseNative={importer.canBrowseNative}
              rootPath={importer.rootPath}
              onChangeRootPath={importer.handleChangeRootPath}
              onBrowseDirectory={importer.handleBrowseDirectory}
              onScanDirectory={() =>
                importer.handleScanDirectory(importer.rootPath, importer.selectedProfile)
              }
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
              lastReport={importer.lastReport}
              onStartImport={importer.handleStartImport}
              onCancelImport={importer.handleCancelImport}
              onDismissReport={importer.handleDismissReport}
            />
          ) : (
            <div className="bb-caption-text">SillyTavern Importer is initializing...</div>
          )}
        </div>
      )}
    </Modal>
  );
}
