import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeVirtualRowWindow } from '../src/core/hooks/useVirtualWindow.js';
import { computeTimelineVirtualSlice } from '../src/ui/organisms/TimelineBranchList/timelineBranchWindow.js';

describe('computeVirtualRowWindow — exact row windowing for 800+ card libraries', () => {
  it('bounds mounted DOM items to ~40-60 cards across top, middle, and bottom of 800 cards', () => {
    const totalItems = 823;
    const cols = 5;
    const rowHeight = 132;
    const rowGap = 8;
    const viewportHeight = 520;
    const overscanRows = 2;

    const totalRows = Math.ceil(totalItems / cols);
    const expectedTotalHeight = totalRows * rowHeight + (totalRows - 1) * rowGap;

    for (const scrollTop of [0, 1200, 9800, 22400, 999999]) {
      const win = computeVirtualRowWindow({
        totalItems,
        cols,
        rowHeight,
        rowGap,
        scrollTop,
        viewportHeight,
        overscanRows,
      });

      const renderedCount = win.endIndex - win.startIndex;
      assert.ok(renderedCount > 0 && renderedCount <= 55, `renderedCount=${renderedCount}`);

      const renderedRows = win.endRow - win.startRow + 1;
      const renderedBlockHeight =
        renderedRows * rowHeight + Math.max(0, renderedRows - 1) * rowGap;
      const totalReconstructedHeight =
        win.topSpacerPx + renderedBlockHeight + win.bottomSpacerPx;

      assert.equal(totalReconstructedHeight, expectedTotalHeight);
    }
  });

  it('preserves exact scroll height in 1-column list mode and handles empty lists', () => {
    const empty = computeVirtualRowWindow({ totalItems: 0, cols: 1 });
    assert.equal(empty.startIndex, 0);
    assert.equal(empty.endIndex, 0);
    assert.equal(empty.topSpacerPx, 0);
    assert.equal(empty.bottomSpacerPx, 0);

    const totalItems = 800;
    const rowHeight = 78;
    const rowGap = 6;
    const expectedTotal = totalItems * rowHeight + (totalItems - 1) * rowGap;

    const mid = computeVirtualRowWindow({
      totalItems,
      cols: 1,
      rowHeight,
      rowGap,
      scrollTop: 31000,
      viewportHeight: 540,
      overscanRows: 5,
    });

    const renderedRows = mid.endRow - mid.startRow + 1;
    assert.ok(renderedRows <= 20, `list renderedRows=${renderedRows}`);
    const actualTotal =
      mid.topSpacerPx + renderedRows * rowHeight + (renderedRows - 1) * rowGap + mid.bottomSpacerPx;
    assert.equal(actualTotal, expectedTotal);
  });

  it('windows both many timeline groups and single 3,000-branch timelines', () => {
    const manyGroups = Array.from({ length: 600 }, (_, i) => ({
      rootFile: `root-${i}.jsonl`,
      visibleRows: [{ fileName: `root-${i}.jsonl` }, { fileName: `branch-${i}.jsonl` }],
    }));

    const sliceMany = computeTimelineVirtualSlice({
      groups: manyGroups,
      scrollTop: 18000,
      viewportHeight: 560,
    });
    const renderedGroups = sliceMany.endGroupIndex - sliceMany.startGroupIndex + 1;
    assert.ok(renderedGroups > 0 && renderedGroups <= 12, `renderedGroups=${renderedGroups}`);

    const giantBranches = Array.from({ length: 3000 }, (_, i) => ({
      fileName: `b-${i}.jsonl`,
    }));
    const sliceGiant = computeTimelineVirtualSlice({
      groups: [{ rootFile: 'root.jsonl', visibleRows: giantBranches }],
      scrollTop: 85000,
      viewportHeight: 560,
    });
    assert.equal(sliceGiant.startGroupIndex, 0);
    assert.equal(sliceGiant.endGroupIndex, 0);
    const branchRange = sliceGiant.branchRanges[0];
    const renderedBranches = branchRange.endIndex - branchRange.startIndex;
    assert.ok(
      renderedBranches > 0 && renderedBranches <= 22,
      `renderedBranches=${renderedBranches}`,
    );
  });
});
