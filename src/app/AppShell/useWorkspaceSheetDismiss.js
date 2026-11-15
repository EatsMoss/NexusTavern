/* ==========================================================================
   Workspace Unsaved Guard & Outside-Click Dismiss Helpers
   ========================================================================== */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const WORKSPACE_OUTSIDE_EXEMPT_SELECTOR = [
  '.bb-modal-overlay',
  '.bb-starred-dropdown-overlay',
  '.bb-starred-dropdown-popover',
  '.bb-kebab-menu__popover',
  '.bb-emoji-picker',
  '.bb-md-heading-popover',
  '.bb-tag-picker__popover',
  '.bb-intro-portrait-popover',
  '.bb-pinned-folder-popover',
  '.bb-conn-picker__overlay',
  '.bb-persona-picker__overlay',
  '.bb-attach-lightbox',
  '.bb-toast-stack',
  '.bb-tome-curtain',
  '.bb-panel-resize-editor',
  '.bb-panel-resize-tooltip',
  '.bb-topbar__drawer-slot',
  '.bb-topbar__back-slot',
  '.bb-topbar__chat-actions',
  '.bb-topbar__qr-slot',
  '[role="dialog"]',
  '[role="listbox"]',
  '[role="menu"]',
].join(', ');

const WORKSPACE_TOP_LAYER_OPEN_SELECTOR = [
  '.bb-modal-overlay',
  '.bb-starred-dropdown-overlay',
  '.bb-kebab-menu__popover',
  '.bb-emoji-picker',
  '.bb-conn-picker__overlay',
  '.bb-persona-picker__overlay',
  '.bb-attach-lightbox',
].join(', ');

export function isWorkspaceSheetExemptClickTarget(target, sheetSurfaceEl, activeKind) {
  if (!(target instanceof Element)) return true;
  if (sheetSurfaceEl && sheetSurfaceEl.contains(target)) return true;
  if (target.closest(WORKSPACE_OUTSIDE_EXEMPT_SELECTOR)) return true;

  // Companion panel in Right Tome belongs to Expanded Selected Scenario
  if (activeKind === 'expandedCharacter' && target.closest('.bb-adv-panel')) {
    return true;
  }

  // Selecting another prompt/group in PromptManager or saving the preset header
  // runs its own guarded switcher/action rather than closing the prompt editor
  if (
    activeKind === 'prompt' &&
    target.closest(
      '.bb-pm-row, .bb-pm-group-header, .bb-pm-header, .bb-pm-toolbar, .bb-preset-action-row',
    )
  ) {
    return true;
  }
  if (activeKind === 'intro' && target.closest('.bb-intro-card')) {
    return true;
  }

  // Selecting another scenario card in CharacterTome runs its own guarded switcher
  if (target.closest('.bb-char-tile, .bb-char-row')) {
    return true;
  }

  return false;
}

export function hasOpenTopLayerOverlay() {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector(WORKSPACE_TOP_LAYER_OPEN_SELECTOR));
}

/**
 * Coordinates the central workspace sheet stack (`createScenario` | `persona` |
 * `prompt` | `intro` | `expandedCharacter`), dirty state descriptors, outside-click
 * & `Escape` dismissal, and `UnsavedChangesModal` guard execution.
 */
export function useWorkspaceSheetDismiss({
  viewMode,
  createScenarioModalOpen,
  setCreateScenarioModalOpen,
  personaModalOpen,
  setPersonaModalOpen,
  resolvedEditingPrompt,
  setEditingPromptSelection,
  resolvedEditingIntro,
  setEditingIntroTarget,
  sheetExpanded,
  setSheetExpanded,
  setRightTab,
  matchedActiveCardFull,
  hasActiveScenario,
  isActiveCardDirty,
  activeCardFull,
  activeCharacterName,
  cardSaving,
  handleSaveCardToPng,
  handleDiscardCardChanges,
  createScenarioSheetRef,
  personaSheetRef,
  promptEditorSheetRef,
  introEditorSheetRef,
  centerSheetSurfaceRef,
  workspaceGuardBridgeRef,
  scrollToChatBottom,
}) {
  const [sheetDirtyMeta, setSheetDirtyMeta] = useState({
    createScenario: {
      isDirty: false,
      canSave: false,
      cannotSaveReason: '',
      itemName: '',
      subtitle: '',
      saveLabel: 'Create & Close',
      busy: false,
    },
    persona: {
      isDirty: false,
      canSave: false,
      cannotSaveReason: '',
      itemName: '',
      subtitle: '',
      saveLabel: 'Save & Close',
      busy: false,
    },
    prompt: {
      isDirty: false,
      canSave: true,
      cannotSaveReason: '',
      itemName: '',
      subtitle: '',
      saveLabel: 'Save & Close',
      busy: false,
    },
    intro: {
      isDirty: false,
      canSave: true,
      cannotSaveReason: '',
      itemName: '',
      subtitle: '',
      saveLabel: 'Save & Close',
      busy: false,
    },
  });
  const [workspaceUnsavedGuard, setWorkspaceUnsavedGuard] = useState(null);
  const workspaceGuardActionRef = useRef(null);

  const handleCreateScenarioDirtyChange = useCallback((meta) => {
    setSheetDirtyMeta((prev) => ({
      ...prev,
      createScenario: { ...prev.createScenario, ...meta },
    }));
  }, []);

  const handlePersonaDirtyChange = useCallback((meta) => {
    setSheetDirtyMeta((prev) => ({
      ...prev,
      persona: { ...prev.persona, ...meta },
    }));
  }, []);

  const handlePromptDirtyChange = useCallback((meta) => {
    setSheetDirtyMeta((prev) => ({
      ...prev,
      prompt: { ...prev.prompt, ...meta },
    }));
  }, []);

  const handleIntroDirtyChange = useCallback((meta) => {
    setSheetDirtyMeta((prev) => ({
      ...prev,
      intro: { ...prev.intro, ...meta },
    }));
  }, []);

  const activeWorkspaceSheetKind = useMemo(() => {
    if (viewMode === 'sandbox') return null;
    if (createScenarioModalOpen) return 'createScenario';
    if (personaModalOpen) return 'persona';
    if (resolvedEditingPrompt) return 'prompt';
    if (resolvedEditingIntro && matchedActiveCardFull) return 'intro';
    if (sheetExpanded && (matchedActiveCardFull || hasActiveScenario)) return 'expandedCharacter';
    return null;
  }, [
    viewMode,
    createScenarioModalOpen,
    personaModalOpen,
    resolvedEditingPrompt,
    resolvedEditingIntro,
    matchedActiveCardFull,
    sheetExpanded,
    hasActiveScenario,
  ]);

  const getWorkspaceDirtyDescriptor = useCallback(
    (targetKind = activeWorkspaceSheetKind) => {
      if (!targetKind) return null;
      if (targetKind === 'createScenario') {
        const m = sheetDirtyMeta.createScenario;
        if (!m.isDirty) return null;
        return {
          kind: 'createScenario',
          subtitle: m.subtitle || 'Create New Scenario',
          itemName: m.itemName || 'New Scenario',
          saveLabel: m.saveLabel || 'Create & Close',
          canSave: Boolean(m.canSave),
          cannotSaveReason: m.cannotSaveReason || '',
          save: async () => (await createScenarioSheetRef.current?.save?.()) !== false,
          discard: () => createScenarioSheetRef.current?.discard?.(),
        };
      }
      if (targetKind === 'persona') {
        const m = sheetDirtyMeta.persona;
        if (!m.isDirty) return null;
        return {
          kind: 'persona',
          subtitle: m.subtitle || 'Persona Workspace',
          itemName: m.itemName || 'Persona',
          saveLabel: m.saveLabel || 'Save & Close',
          canSave: Boolean(m.canSave),
          cannotSaveReason: m.cannotSaveReason || '',
          save: async () => (await personaSheetRef.current?.save?.()) !== false,
          discard: () => personaSheetRef.current?.discard?.(),
        };
      }
      if (targetKind === 'prompt') {
        const m = sheetDirtyMeta.prompt;
        if (!m.isDirty) return null;
        return {
          kind: 'prompt',
          subtitle: m.subtitle || 'Prompt Editor',
          itemName: m.itemName || 'Prompt',
          saveLabel: 'Save & Close',
          canSave: Boolean(m.canSave),
          cannotSaveReason: m.cannotSaveReason || '',
          save: async () => (await promptEditorSheetRef.current?.save?.()) !== false,
          discard: () => promptEditorSheetRef.current?.discard?.(),
        };
      }
      if (targetKind === 'intro') {
        const m = sheetDirtyMeta.intro;
        if (!m.isDirty) return null;
        return {
          kind: 'intro',
          subtitle: m.subtitle || 'Greeting Editor',
          itemName: m.itemName || 'Greeting',
          saveLabel: 'Save & Close',
          canSave: Boolean(m.canSave),
          cannotSaveReason: m.cannotSaveReason || '',
          save: async () => (await introEditorSheetRef.current?.save?.()) !== false,
          discard: () => introEditorSheetRef.current?.discard?.(),
        };
      }
      if (targetKind === 'expandedCharacter') {
        if (!isActiveCardDirty) return null;
        const canSaveCard = Boolean(
          activeCardFull && String(activeCardFull.name || '').trim() && !cardSaving,
        );
        return {
          kind: 'expandedCharacter',
          subtitle: 'Selected Scenario Workspace',
          itemName: String(activeCardFull?.name || activeCharacterName || 'Scenario').trim(),
          saveLabel: 'Save & Close',
          canSave: canSaveCard,
          cannotSaveReason: !String(activeCardFull?.name || '').trim()
            ? 'Scenario name cannot be empty.'
            : '',
          save: async () => (await handleSaveCardToPng()) !== false,
          discard: () => handleDiscardCardChanges(),
        };
      }
      return null;
    },
    [
      activeWorkspaceSheetKind,
      sheetDirtyMeta,
      isActiveCardDirty,
      activeCardFull,
      activeCharacterName,
      cardSaving,
      handleSaveCardToPng,
      handleDiscardCardChanges,
      createScenarioSheetRef,
      personaSheetRef,
      promptEditorSheetRef,
      introEditorSheetRef,
    ],
  );

  workspaceGuardBridgeRef.current = {
    activeKind: activeWorkspaceSheetKind,
    isCardDirty: isActiveCardDirty,
    runGuard: (proceedAction, { skipGuard = false, targetKind } = {}) => {
      if (skipGuard) {
        proceedAction?.();
        return;
      }
      const dirtyDesc = getWorkspaceDirtyDescriptor(
        targetKind !== undefined ? targetKind : activeWorkspaceSheetKind,
      );
      if (!dirtyDesc) {
        proceedAction?.();
        return;
      }
      workspaceGuardActionRef.current = {
        descriptor: dirtyDesc,
        proceed: proceedAction,
      };
      setWorkspaceUnsavedGuard({
        kind: dirtyDesc.kind,
        subtitle: dirtyDesc.subtitle,
        itemName: dirtyDesc.itemName,
        saveLabel: dirtyDesc.saveLabel,
        canSave: dirtyDesc.canSave,
        cannotSaveReason: dirtyDesc.cannotSaveReason,
        busy: false,
      });
    },
  };

  const performCloseActiveWorkspaceSheet = useCallback(() => {
    if (createScenarioModalOpen) {
      setCreateScenarioModalOpen(false);
      scrollToChatBottom();
      return;
    }
    if (personaModalOpen) {
      setPersonaModalOpen(false);
      scrollToChatBottom();
      return;
    }
    if (resolvedEditingPrompt) {
      setEditingPromptSelection(null);
      scrollToChatBottom();
      return;
    }
    if (resolvedEditingIntro) {
      setEditingIntroTarget(null);
      if (!sheetExpanded) {
        scrollToChatBottom();
      }
      return;
    }
    if (sheetExpanded) {
      setSheetExpanded(false);
      setRightTab('selected');
      scrollToChatBottom();
    }
  }, [
    createScenarioModalOpen,
    setCreateScenarioModalOpen,
    personaModalOpen,
    setPersonaModalOpen,
    resolvedEditingPrompt,
    setEditingPromptSelection,
    resolvedEditingIntro,
    setEditingIntroTarget,
    sheetExpanded,
    setSheetExpanded,
    setRightTab,
    scrollToChatBottom,
  ]);

  const requestCloseActiveWorkspaceSheet = useCallback(
    (opts) => {
      const skip = Boolean(opts && typeof opts === 'object' && opts.skipGuard);
      workspaceGuardBridgeRef.current.runGuard(performCloseActiveWorkspaceSheet, {
        skipGuard: skip,
      });
    },
    [workspaceGuardBridgeRef, performCloseActiveWorkspaceSheet],
  );

  useEffect(() => {
    if (!activeWorkspaceSheetKind || workspaceUnsavedGuard) return undefined;

    let pressOutside = false;

    const handleDocPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) {
        pressOutside = false;
        return;
      }
      pressOutside = !isWorkspaceSheetExemptClickTarget(
        e.target,
        centerSheetSurfaceRef.current,
        activeWorkspaceSheetKind,
      );
    };

    const handleDocClick = (e) => {
      if (!pressOutside) return;
      pressOutside = false;
      if (
        isWorkspaceSheetExemptClickTarget(
          e.target,
          centerSheetSurfaceRef.current,
          activeWorkspaceSheetKind,
        )
      ) {
        return;
      }
      requestCloseActiveWorkspaceSheet();
    };

    const handleDocKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (hasOpenTopLayerOverlay()) return;
      e.stopPropagation();
      requestCloseActiveWorkspaceSheet();
    };

    document.addEventListener('pointerdown', handleDocPointerDown, true);
    document.addEventListener('click', handleDocClick, true);
    window.addEventListener('keydown', handleDocKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleDocPointerDown, true);
      document.removeEventListener('click', handleDocClick, true);
      window.removeEventListener('keydown', handleDocKeyDown);
    };
  }, [
    activeWorkspaceSheetKind,
    workspaceUnsavedGuard,
    centerSheetSurfaceRef,
    requestCloseActiveWorkspaceSheet,
  ]);

  const handleCancelWorkspaceGuard = useCallback(() => {
    workspaceGuardActionRef.current = null;
    setWorkspaceUnsavedGuard(null);
  }, []);

  const handleDiscardWorkspaceGuard = useCallback(() => {
    const pending = workspaceGuardActionRef.current;
    workspaceGuardActionRef.current = null;
    setWorkspaceUnsavedGuard(null);
    pending?.descriptor?.discard?.();
    pending?.proceed?.();
  }, []);

  const handleConfirmSaveWorkspaceGuard = useCallback(async () => {
    const pending = workspaceGuardActionRef.current;
    if (!pending) {
      setWorkspaceUnsavedGuard(null);
      return;
    }
    setWorkspaceUnsavedGuard((prev) => (prev ? { ...prev, busy: true } : null));
    const ok = await pending.descriptor?.save?.();
    if (ok !== false) {
      workspaceGuardActionRef.current = null;
      setWorkspaceUnsavedGuard(null);
      pending.proceed?.();
    } else {
      setWorkspaceUnsavedGuard((prev) => (prev ? { ...prev, busy: false } : null));
    }
  }, []);

  return {
    activeWorkspaceSheetKind,
    workspaceUnsavedGuard,
    handleCreateScenarioDirtyChange,
    handlePersonaDirtyChange,
    handlePromptDirtyChange,
    handleIntroDirtyChange,
    requestCloseActiveWorkspaceSheet,
    handleCancelWorkspaceGuard,
    handleDiscardWorkspaceGuard,
    handleConfirmSaveWorkspaceGuard,
  };
}
