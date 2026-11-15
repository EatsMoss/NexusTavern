/**
 * Pure data model for organizing flat `.jsonl` chat summaries into
 * SillyTavern-compatible Timeline families, ancestor/descendant chains,
 * leaf branches (active story endpoints), and directional graph neighbors.
 */

export const TIMELINE_FAMILY_HUES = [38, 165, 205, 285, 340, 95, 20, 185, 315, 55];

export function familyColorFor(familyIndex = 0) {
  const hue =
    TIMELINE_FAMILY_HUES[
      Math.abs(Number(familyIndex) || 0) % TIMELINE_FAMILY_HUES.length
    ];
  return `hsl(${hue} 52% 62%)`;
}

export function parseEmbeddedChatTimestamp(fileName = '') {
  const m = String(fileName).match(
    /(\d{4})-(\d{1,2})-(\d{1,2})\s*@\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s(?:\s*(\d{1,3})ms)?/,
  );
  if (!m) return 0;
  const ts = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
    Number(m[7] || 0),
  ).getTime();
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}

export function isSubstantiveChatSummary(chat) {
  if (!chat || typeof chat !== 'object') return false;
  return Number(chat.messageCount ?? 0) > 1 || Boolean(chat.hasUserMessages);
}

/**
 * Picks the best `.jsonl` chat file to open for a character:
 *  1) `rememberedFile` (explicit NexusTavern per-character pointer) — strictly honored,
 *     even when it points to a manually created 1-message greeting chat.
 *  2) When no remembered pointer exists:
 *     - The freshest substantive chat (`messageCount > 1 || hasUserMessages`), since
 *       embedded `card.chat` inside PNG metadata is only updated on card edits and is
 *       often months older than active timelines;
 *     - Otherwise `cardChat` (`card.chat`) if it exists on disk;
 *     - Otherwise the freshest non-empty chat, falling back to `chats[0]`.
 */
export function resolvePreferredCharacterChatFile(
  chats = [],
  { rememberedFile = '', cardChat = '' } = {},
) {
  if (!Array.isArray(chats) || chats.length === 0) return '';

  const normalizeName = (raw) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.jsonl') ? trimmed : `${trimmed}.jsonl`;
  };

  const findByName = (raw) => {
    const clean = normalizeName(raw);
    if (!clean) return null;
    const lower = clean.toLowerCase();
    return (
      chats.find((c) => c?.fileName === clean) ||
      chats.find((c) => String(c?.fileName || '').toLowerCase() === lower) ||
      null
    );
  };

  const rememberedMatch = findByName(rememberedFile);
  if (rememberedMatch) {
    return rememberedMatch.fileName;
  }

  const firstSubstantive = chats.find(isSubstantiveChatSummary) || null;
  if (firstSubstantive) {
    return firstSubstantive.fileName;
  }

  const cardChatMatch = findByName(cardChat);
  if (cardChatMatch) {
    return cardChatMatch.fileName;
  }

  const firstNonEmpty = chats.find((c) => Number(c?.messageCount ?? 0) > 0) || chats[0];
  return firstNonEmpty?.fileName || '';
}

export function resolveChatTimestampMs(chat) {
  if (!chat) return 0;
  if (typeof chat.sortTimestampMs === 'number' && chat.sortTimestampMs > 0) {
    return chat.sortTimestampMs;
  }
  const embedded = parseEmbeddedChatTimestamp(chat.fileName);
  if (embedded > 0) return embedded;
  if (typeof chat.lastModifiedMs === 'number' && chat.lastModifiedMs > 0) {
    return chat.lastModifiedMs;
  }
  return 0;
}

export function formatShortChatDate(chat) {
  const ts = resolveChatTimestampMs(chat);
  if (!ts) return chat?.lastSendDate || 'Saved';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return chat?.lastSendDate || 'Saved';
  }
}

export function cleanChatPreview(raw = '') {
  if (!raw) return '';
  return String(raw)
    .replace(/<(?:think|thinking|reasoning)>[\s\S]*?<\/(?:think|thinking|reasoning)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseChatTitleAndBranch(fileName = '') {
  const stem = String(fileName || '').replace(/\.jsonl$/i, '').trim();
  if (!stem) {
    return { baseTitle: 'Chat', branchNumber: null, branchLabel: null };
  }

  const suffixMatch = stem.match(/^(.+?)\s*-\s*Branch\s*#(\d+)$/i);
  if (suffixMatch) {
    const num = Number(suffixMatch[2]);
    return {
      baseTitle: suffixMatch[1].trim(),
      branchNumber: num,
      branchLabel: `Branch #${suffixMatch[2]}`,
    };
  }

  const prefixMatch = stem.match(/^Branch\s*#(\d+)\s*-\s*(.+)$/i);
  if (prefixMatch) {
    const num = Number(prefixMatch[1]);
    return {
      baseTitle: prefixMatch[2].trim(),
      branchNumber: num,
      branchLabel: `Branch #${prefixMatch[1]}`,
    };
  }

  return {
    baseTitle: stem,
    branchNumber: null,
    branchLabel: null,
  };
}
/**
 * Builds the complete forest of timelines from a character's chat summaries.
 */
export function buildTimelineForest(chats = []) {
  if (!Array.isArray(chats) || chats.length === 0) {
    return { records: [], roots: [], byFile: new Map(), groups: [] };
  }

  const byFile = new Map();
  const byLowerFile = new Map();

  const records = chats.map((c) => {
    const parsed = parseChatTitleAndBranch(c.fileName);
    const rec = {
      ...c,
      baseTitle: parsed.baseTitle,
      branchNumber: parsed.branchNumber,
      branchLabel: parsed.branchLabel,
      timestampMs: resolveChatTimestampMs(c),
      children: [],
      parentFile: null,
      orphan: false,
      depth: 0,
      familyIndex: 0,
      familyColor: familyColorFor(0),
      rootFile: c.fileName,
      isLeaf: true,
    };
    byFile.set(rec.fileName, rec);
    byLowerFile.set(rec.fileName.toLowerCase(), rec);
    return rec;
  });

  for (const rec of records) {
    let parentRec = null;
    if (rec.parentChat) {
      parentRec =
        byFile.get(rec.parentChat) ||
        byLowerFile.get(String(rec.parentChat).toLowerCase()) ||
        null;
      if (!parentRec) rec.orphan = true;
    }
    if (!parentRec && rec.branchNumber !== null && rec.baseTitle) {
      const candidateRootName = `${rec.baseTitle}.jsonl`.toLowerCase();
      const candidate = byLowerFile.get(candidateRootName);
      if (candidate && candidate.fileName !== rec.fileName) {
        parentRec = candidate;
        rec.orphan = false;
      } else if (rec.branchNumber > 1) {
        for (let prevNum = rec.branchNumber - 1; prevNum >= 1; prevNum -= 1) {
          const prevSuffix = `${rec.baseTitle} - branch #${prevNum}.jsonl`.toLowerCase();
          const prevPrefix = `branch #${prevNum} - ${rec.baseTitle}.jsonl`.toLowerCase();
          const prevMatch =
            byLowerFile.get(prevSuffix) || byLowerFile.get(prevPrefix) || null;
          if (prevMatch && prevMatch.fileName !== rec.fileName) {
            parentRec = prevMatch;
            rec.orphan = false;
            break;
          }
        }
      }
    }
    if (parentRec && parentRec.fileName !== rec.fileName) {
      rec.parentFile = parentRec.fileName;
    }
  }

  for (const rec of records) {
    if (!rec.parentFile) continue;
    let cur = byFile.get(rec.parentFile);
    const visited = new Set([rec.fileName]);
    let hasCycle = false;
    while (cur) {
      if (visited.has(cur.fileName)) {
        hasCycle = true;
        break;
      }
      visited.add(cur.fileName);
      cur = cur.parentFile ? byFile.get(cur.parentFile) : null;
    }
    if (hasCycle) {
      rec.parentFile = null;
    } else {
      const parent = byFile.get(rec.parentFile);
      if (parent) parent.children.push(rec);
    }
  }

  const sortChildrenAsc = (a, b) => {
    if (
      a.branchNumber !== null &&
      b.branchNumber !== null &&
      a.branchNumber !== b.branchNumber
    ) {
      return a.branchNumber - b.branchNumber;
    }
    return (a.timestampMs || 0) - (b.timestampMs || 0);
  };

  const roots = records.filter((r) => !r.parentFile);

  const rawGroups = roots.map((root) => {
    const allNodes = [];
    const leafNodes = [];
    let latestTimestampMs = root.timestampMs || 0;
    let totalMessages = 0;

    const walk = (node, depth) => {
      node.depth = depth;
      node.rootFile = root.fileName;
      node.children.sort(sortChildrenAsc);
      node.isLeaf = node.children.length === 0;
      allNodes.push(node);

      if ((node.timestampMs || 0) > latestTimestampMs) {
        latestTimestampMs = node.timestampMs || 0;
      }
      if (typeof node.messageCount === 'number' && node.messageCount > 0) {
        totalMessages += node.messageCount;
      }

      if (node.isLeaf) {
        leafNodes.push(node);
      } else {
        for (const child of node.children) {
          walk(child, depth + 1);
        }
      }
    };

    walk(root, 0);

    const sortedLeaves = [...leafNodes].sort((a, b) => {
      const diff = (b.timestampMs || 0) - (a.timestampMs || 0);
      return diff !== 0 ? diff : (b.fileSize || 0) - (a.fileSize || 0);
    });

    return {
      rootFile: root.fileName,
      rootNode: root,
      title: root.baseTitle || root.fileName.replace(/\.jsonl$/i, ''),
      allNodes,
      leafNodes: sortedLeaves,
      latestTimestampMs,
      totalChats: allNodes.length,
      totalLeafBranches: sortedLeaves.length,
      totalMessages,
    };
  });

  rawGroups.sort((a, b) => (b.latestTimestampMs || 0) - (a.latestTimestampMs || 0));

  const groups = rawGroups.map((grp, familyIndex) => {
    const familyColor = familyColorFor(familyIndex);
    for (const node of grp.allNodes) {
      node.familyIndex = familyIndex;
      node.familyColor = familyColor;
    }
    return { ...grp, familyIndex, familyColor };
  });

  return {
    records,
    roots: groups.map((g) => g.rootNode),
    byFile,
    groups,
  };
}

function subtreeContainsFile(node, targetFile) {
  if (!node || !targetFile) return false;
  if (node.fileName === targetFile) return true;
  return Array.isArray(node.children)
    ? node.children.some((c) => subtreeContainsFile(c, targetFile))
    : false;
}

/**
 * Computes the 4 directional targets (`left`, `right`, `up`, `down`) from `anchorNode`
 * on a horizontally laid-out timeline forest (`x` = depth, `y` = vertical lane).
 */
export function getTimelineNodeNeighbors(
  anchorNode,
  layout,
  { activeChatFile = '', lastVisitedChildMap = null } = {},
) {
  if (!anchorNode || !layout?.byFile) {
    return { left: null, right: null, up: null, down: null };
  }

  // 1. LEFT: parent fork node
  const left = anchorNode.parentFile
    ? layout.byFile.get(anchorNode.parentFile) || null
    : null;

  // 2. RIGHT: preferred child branch
  let right = null;
  if (Array.isArray(anchorNode.children) && anchorNode.children.length > 0) {
    const rememberedName = lastVisitedChildMap?.get?.(anchorNode.fileName);
    const remembered = rememberedName
      ? anchorNode.children.find((c) => c.fileName === rememberedName)
      : null;
    const onActivePath = activeChatFile
      ? anchorNode.children.find((c) => subtreeContainsFile(c, activeChatFile))
      : null;
    if (remembered) {
      right = remembered;
    } else if (onActivePath) {
      right = onActivePath;
    } else {
      right = [...anchorNode.children].sort(
        (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0),
      )[0];
    }
  }

  // 3. UP / DOWN: direct siblings first, then closest visual lane above/below
  const siblings = left ? left.children : layout.roots || [];
  const sibIdx = siblings.findIndex((s) => s.fileName === anchorNode.fileName);

  let up = sibIdx > 0 ? siblings[sibIdx - 1] : null;
  let down =
    sibIdx >= 0 && sibIdx < siblings.length - 1 ? siblings[sibIdx + 1] : null;

  if (!up || !down) {
    const allNodes = layout.nodes || [];
    if (!up) {
      const above = allNodes
        .filter((n) => n.fileName !== anchorNode.fileName && n.y < anchorNode.y - 4)
        .sort((a, b) => {
          const dyDiff = (anchorNode.y - a.y) - (anchorNode.y - b.y);
          if (Math.abs(dyDiff) > 6) return dyDiff;
          return Math.abs(a.depth - anchorNode.depth) - Math.abs(b.depth - anchorNode.depth);
        });
      up = above[0] || null;
    }
    if (!down) {
      const below = allNodes
        .filter((n) => n.fileName !== anchorNode.fileName && n.y > anchorNode.y + 4)
        .sort((a, b) => {
          const dyDiff = (a.y - anchorNode.y) - (b.y - anchorNode.y);
          if (Math.abs(dyDiff) > 6) return dyDiff;
          return Math.abs(a.depth - anchorNode.depth) - Math.abs(b.depth - anchorNode.depth);
        });
      down = below[0] || null;
    }
  }

  return { left, right, up, down };
}
