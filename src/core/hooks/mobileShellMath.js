export const MOBILE_NAV_TAB_IDS = Object.freeze([
  'chat',
  'scenarios',
  'card',
  'prompts',
  'workspace',
]);

/**
 * Formats a concise, human-readable active branch/chat subtitle for `MobileTopAppBar`.
 * Normalizes both SillyTavern branch filename conventions:
 * - `<base> - Branch #<N>.jsonl`
 * - `Branch #<N> - <base>.jsonl`
 */
export function formatMobileChatSubtitle({
  activeChatFile = '',
  hasActiveScenario = false,
  isSwitchingScenario = false,
} = {}) {
  if (!hasActiveScenario) {
    return 'Tap Scenarios below to pick a card';
  }
  if (isSwitchingScenario) {
    return 'Loading chat...';
  }
  const stem = String(activeChatFile || '')
    .replace(/\.jsonl$/i, '')
    .trim();
  if (!stem) {
    return 'Greeting preview · Tap to view chats';
  }

  const suffixMatch = stem.match(/^(.+?)\s*-\s*Branch\s*#(\d+)$/i);
  if (suffixMatch) {
    return `Branch #${suffixMatch[2]} · ${suffixMatch[1].trim()}`;
  }

  const prefixMatch = stem.match(/^Branch\s*#(\d+)\s*-\s*(.+)$/i);
  if (prefixMatch) {
    return `Branch #${prefixMatch[1]} · ${prefixMatch[2].trim()}`;
  }

  return stem;
}

/**
 * Determines when the mobile `BottomNavBar` / `NavigationRail` must hide to give 100%
 * screen height to full-screen editors or the soft-keyboard chat viewport.
 */
export function shouldHideMobileNavBar({
  hasActiveFullScreenEditor = false,
  mobileTab = 'chat',
  isKeyboardOpen = false,
} = {}) {
  if (hasActiveFullScreenEditor) return true;
  if (mobileTab === 'chat' && isKeyboardOpen) return true;
  return false;
}

/**
 * Resolves the highest-priority dismissal / navigation step when the user triggers
 * the mobile OS Back button / gesture (`popstate`) in `compact` mode.
 *
 * Returns `null` when already at the root `Chat` surface with nothing open.
 */
export function resolveMobileBackAction({
  chatBranchesOpen = false,
  viewMode = 'tavern',
  activeWorkspaceSheetKind = null,
  mobileTab = 'chat',
  timelinesOpen = false,
  activeSheetTab = 'description',
  workspaceSubScreen = null,
} = {}) {
  if (chatBranchesOpen) {
    return 'close-chat-branches';
  }
  if (viewMode === 'sandbox') {
    return 'exit-sandbox';
  }
  if (activeWorkspaceSheetKind && activeWorkspaceSheetKind !== 'expandedCharacter') {
    return 'close-workspace-sheet';
  }
  if (mobileTab === 'chat' && timelinesOpen) {
    return 'close-timelines';
  }
  if (mobileTab === 'card' && activeSheetTab === 'advanced') {
    return 'exit-card-advanced';
  }
  if (mobileTab === 'workspace' && workspaceSubScreen) {
    return 'exit-workspace-subscreen';
  }
  if (mobileTab !== 'chat') {
    return 'return-to-chat';
  }
  return null;
}
