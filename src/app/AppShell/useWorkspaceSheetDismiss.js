/* ==========================================================================
   Workspace Unsaved Guard & Outside-Click Dismiss Helpers
   ========================================================================== */

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
