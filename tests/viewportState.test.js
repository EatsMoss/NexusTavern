import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDualTomeMinWidth,
  resolveLayoutMode,
  computeViewportSnapshot,
} from '../src/core/hooks/viewportMath.js';
import {
  computeAdaptiveTomeGeometry,
  resolveModeTransitionPanes,
} from '../src/core/hooks/adaptivePanesMath.js';
import {
  formatMobileChatSubtitle,
  shouldHideMobileNavBar,
  resolveMobileBackAction,
} from '../src/core/hooks/mobileShellMath.js';

describe('viewportMath — M3 Window Size Classes & visualViewport keyboard detection', () => {
  it('classifies compact, medium, expanded-single, and expanded-dual accurately', () => {
    assert.equal(resolveLayoutMode(360), 'compact');
    assert.equal(resolveLayoutMode(767), 'compact');
    assert.equal(resolveLayoutMode(768), 'medium');
    assert.equal(resolveLayoutMode(1179), 'medium');
    assert.equal(resolveLayoutMode(1180), 'expanded-single');
    assert.equal(resolveLayoutMode(1536), 'expanded-single');
    assert.equal(resolveLayoutMode(1680), 'expanded-dual');
    assert.equal(resolveLayoutMode(1920), 'expanded-dual');
  });

  it('expands dual-tome threshold dynamically when chatColumnMaxWidth is widened', () => {
    // 1100px chat column + 2 * 448px tome clearance = 1996px
    assert.equal(computeDualTomeMinWidth(1100), 1996);
    assert.equal(resolveLayoutMode(1920, 1100), 'expanded-single');
    assert.equal(resolveLayoutMode(2048, 1100), 'expanded-dual');
  });

  it('detects virtual keyboard opening while ignoring minor mobile browser URL bar chrome shifts', () => {
    const urlBarShift = computeViewportSnapshot({
      width: 390,
      height: 844,
      visualHeight: 784, // 60px browser bar delta -> NOT keyboard
      isCoarsePointer: true,
      editableFocused: true,
    });
    assert.equal(urlBarShift.isKeyboardOpen, false);
    assert.equal(urlBarShift.keyboardInset, 0);
    assert.equal(urlBarShift.isMobile, true);

    const keyboardOpen = computeViewportSnapshot({
      width: 390,
      height: 844,
      visualHeight: 510, // 334px soft keyboard
      isCoarsePointer: true,
      editableFocused: true,
    });
    assert.equal(keyboardOpen.isKeyboardOpen, true);
    assert.equal(keyboardOpen.keyboardInset, 334);
    // Portrait phone with open keyboard should NOT falsely trigger landscape short-viewport mode
    assert.equal(keyboardOpen.isShortViewport, false);
  });

  it('flags landscape short viewports cleanly', () => {
    const landscapePhone = computeViewportSnapshot({
      width: 844,
      height: 390,
      visualHeight: 390,
      isCoarsePointer: true,
    });
    assert.equal(landscapePhone.layoutMode, 'medium');
    assert.equal(landscapePhone.isTablet, true);
    assert.equal(landscapePhone.isShortViewport, true);
  });

  it('transitions panes cleanly across expanded-dual, expanded-single, and medium modes', () => {
    const desktopPanes = { leftOpen: true, rightOpen: true };

    // Dual -> Single keeps only the last active side open (0 overlap)
    const single = resolveModeTransitionPanes({
      prevMode: 'expanded-dual',
      nextMode: 'expanded-single',
      leftOpen: true,
      rightOpen: true,
      desktopPanes,
      lastActiveSide: 'right',
    });
    assert.deepEqual(single, { leftOpen: false, rightOpen: true });

    // Single -> Medium collapses drawers automatically so scrim doesn't cover chat on resize
    const medium = resolveModeTransitionPanes({
      prevMode: 'expanded-single',
      nextMode: 'medium',
      leftOpen: false,
      rightOpen: true,
      desktopPanes,
      lastActiveSide: 'right',
    });
    assert.deepEqual(medium, { leftOpen: false, rightOpen: false });

    // Medium -> Dual restores full two-tome desktop state
    const restoredDual = resolveModeTransitionPanes({
      prevMode: 'medium',
      nextMode: 'expanded-dual',
      leftOpen: false,
      rightOpen: false,
      desktopPanes,
      lastActiveSide: 'right',
    });
    assert.deepEqual(restoredDual, { leftOpen: true, rightOpen: true });
  });

  it('computes non-overlapping tome geometry in expanded-single and medium modes', () => {
    const singleGeo = computeAdaptiveTomeGeometry({
      layoutMode: 'expanded-single',
      viewportWidth: 1366,
      chatColumnMaxWidth: 784,
      leftOpen: true,
      rightOpen: false,
      leftWidth: 550,
      rightWidth: 550,
    });
    assert.equal(singleGeo.allowResize, true);
    assert.equal(singleGeo.isOverlayDrawer, false);
    assert.equal(singleGeo.leftTomeInset, 0);
    assert.equal(singleGeo.rightTomeInset, 0);
    assert.ok(singleGeo.effectiveLeftWidth >= 380 && singleGeo.effectiveLeftWidth <= 640);

    const mediumGeo = computeAdaptiveTomeGeometry({
      layoutMode: 'medium',
      viewportWidth: 960,
      leftOpen: true,
      rightOpen: false,
    });
    assert.equal(mediumGeo.allowResize, false);
    assert.equal(mediumGeo.isOverlayDrawer, true);
    assert.equal(mediumGeo.effectiveLeftWidth, 420);
  });

  it('formats SillyTavern mobile branch subtitles and hides BottomNavBar when editors or chat keyboard open', () => {
    assert.equal(
      formatMobileChatSubtitle({
        activeChatFile: '2026-11-17@14h20m - Branch #3.jsonl',
        hasActiveScenario: true,
      }),
      'Branch #3 · 2026-11-17@14h20m',
    );
    assert.equal(
      formatMobileChatSubtitle({
        activeChatFile: 'Branch #2 - Lantern Parapet.jsonl',
        hasActiveScenario: true,
      }),
      'Branch #2 · Lantern Parapet',
    );
    assert.equal(
      shouldHideMobileNavBar({ hasActiveFullScreenEditor: false, mobileTab: 'chat', isKeyboardOpen: true }),
      true,
    );
    assert.equal(
      shouldHideMobileNavBar({ hasActiveFullScreenEditor: false, mobileTab: 'scenarios', isKeyboardOpen: true }),
      false,
    );
    assert.equal(
      shouldHideMobileNavBar({ hasActiveFullScreenEditor: true, mobileTab: 'prompts', isKeyboardOpen: false }),
      true,
    );
  });

  it('resolves compact Back navigation priority step-by-step', () => {
    assert.equal(
      resolveMobileBackAction({ chatBranchesOpen: true, mobileTab: 'chat' }),
      'close-chat-branches',
    );
    assert.equal(
      resolveMobileBackAction({ activeWorkspaceSheetKind: 'prompt', mobileTab: 'prompts' }),
      'close-workspace-sheet',
    );
    assert.equal(
      resolveMobileBackAction({ mobileTab: 'chat', timelinesOpen: true }),
      'close-timelines',
    );
    assert.equal(
      resolveMobileBackAction({ mobileTab: 'card', activeSheetTab: 'advanced' }),
      'exit-card-advanced',
    );
    assert.equal(
      resolveMobileBackAction({ mobileTab: 'workspace', workspaceSubScreen: 'regex' }),
      'exit-workspace-subscreen',
    );
    assert.equal(resolveMobileBackAction({ mobileTab: 'scenarios' }), 'return-to-chat');
    assert.equal(resolveMobileBackAction({ mobileTab: 'chat' }), null);
  });
});
