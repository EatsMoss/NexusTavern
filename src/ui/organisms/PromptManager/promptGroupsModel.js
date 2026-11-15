import { estimateTextTokens } from '@core/presets/tokenEstimator.js';

export { estimateTextTokens };

/**
 * SillyTavern + BookboundUI 100% Compatible XML Prompt Groups & Tree Model.
 *
 * Level 1 group markers:
 *   Open prompt name:  "▼ [grp_0001] <xml_name>" (or with optional label before <xml_name>)
 *   Close prompt name: "[▲ grp_0001] </xml_name>"
 * Level 2 nested group markers:
 *   Open prompt name:  "▽ [grp_0002] <xml_name>"
 *   Close prompt name: "[△ grp_0002] </xml_name>"
 */

const OPEN_GROUP_NAME_RE =
  /^\s*([▼▽])\s*\[(grp_[a-zA-Z0-9_-]+)\]\s*(?:(.*?)\s+)?<([a-zA-Z0-9_.:{}-]+)>\s*$/;
const CLOSE_GROUP_NAME_RE =
  /^\s*(?:\[\s*([▲△])\s*(grp_[a-zA-Z0-9_-]+)\s*\]|([▲△])\s*\[\s*(grp_[a-zA-Z0-9_-]+)\s*\])\s*<\/([a-zA-Z0-9_.:{}-]+)>\s*$/;

const VOID_HTML_TAGS = new Set([
  'br',
  'hr',
  'img',
  'input',
  'meta',
  'link',
  'area',
  'base',
  'col',
  'embed',
  'source',
  'track',
  'wbr',
]);

export const NON_GROUPABLE_PROMPT_IDS = new Set(['chatHistory']);

const TRIM_LEADING_WS_AND_BRAILLE_RE = /^[\s\u2800\u200B\uFEFF]+/u;
const LEADING_PROMPT_EMOJI_RE =
  /^(?:[\u{1F1E6}-\u{1F1FF}]{2}|[0-9#*]\uFE0F?\u20E3|(?:(?![\u25BC\u25BD\u25B2\u25B3])(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u2600-\u27BF\u2139\u24C2]|\u{1F170}-\u{1F251}))(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u2600-\u27BF])(?:\uFE0F|\p{Emoji_Modifier})?)*)/u;

/**
 * Trims leading standard spaces and Braille blank characters (`\u2800`) from a prompt/group title.
 * If the resulting title starts with an emoji grapheme, extracts that emoji into `bb_icon`
 * and strips it (plus any trailing spaces/Braille blanks) from the title.
 */
export function normalizePromptNameAndEmoji(rawName = '', existingEmoji = '') {
  const rawStr = String(rawName ?? '');
  if (OPEN_GROUP_NAME_RE.test(rawStr) || CLOSE_GROUP_NAME_RE.test(rawStr)) {
    return { name: rawStr, bb_icon: existingEmoji || '' };
  }

  let cleaned = rawStr.replace(TRIM_LEADING_WS_AND_BRAILLE_RE, '');
  let extractedEmoji = '';

  const match = cleaned.match(LEADING_PROMPT_EMOJI_RE);
  if (match && match[0]) {
    const rest = cleaned.slice(match[0].length).replace(TRIM_LEADING_WS_AND_BRAILLE_RE, '');
    extractedEmoji = match[0];
    cleaned = rest;
  }

  return {
    name: cleaned,
    bb_icon: extractedEmoji || existingEmoji || '',
  };
}

export const UNDELETABLE_SYSTEM_PROMPT_IDS = new Set([
  'main',
  'nsfw',
  'jailbreak',
  'dialogueExamples',
  'chatHistory',
  'worldInfoBefore',
  'worldInfoAfter',
  'charDescription',
  'charPersonality',
  'scenario',
  'personaDescription',
  'enhanceDefinitions',
]);

export function sanitizeXmlTagName(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^<+|\/?>+$/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.:{}-]/g, '');
  if (!cleaned) return 'prompt_group';
  if (/^[0-9.-]/.test(cleaned)) return `grp_${cleaned}`;
  return cleaned;
}

function escapeRegExpLiteral(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countTagOccurrences(content, tag, isClosing) {
  const esc = escapeRegExpLiteral(tag);
  const re = new RegExp(`<${isClosing ? '\\/' : ''}${esc}>`, 'g');
  const matches = String(content || '').match(re);
  return matches ? matches.length : 0;
}

/**
 * Detects an implicit opening group prompt whose content ends with an unclosed `<tag>`
 * (with optional prefix/preamble text before `<tag>`).
 */
export function detectImplicitOpenGroupPrompt(prompt) {
  if (!prompt || prompt.marker || prompt.identifier === 'chatHistory') return null;
  if (OPEN_GROUP_NAME_RE.test(String(prompt.name || ''))) return null;
  if (CLOSE_GROUP_NAME_RE.test(String(prompt.name || ''))) return null;

  const raw = String(prompt.content || '');
  const strippedTail = raw.replace(/(?:\s|\{\{(?:trim|noop)\}\}|\{\{\/\/[\s\S]*?\}\})+$/gi, '');
  const m = strippedTail.match(/<([a-zA-Z{][a-zA-Z0-9_.:{}-]*)>$/);
  if (!m) return null;

  const xmlTag = m[1];
  if (VOID_HTML_TAGS.has(xmlTag.toLowerCase())) return null;

  const opens = countTagOccurrences(strippedTail, xmlTag, false);
  const closes = countTagOccurrences(strippedTail, xmlTag, true);
  if (opens <= closes) return null;

  return { xmlTag };
}

/**
 * Detects an implicit closing group prompt whose content starts with an unmatched `</tag>`
 * (with optional postfix/postamble text after `</tag>`).
 */
export function detectImplicitCloseGroupPrompt(prompt) {
  if (!prompt || prompt.marker || prompt.identifier === 'chatHistory') return null;
  if (OPEN_GROUP_NAME_RE.test(String(prompt.name || ''))) return null;
  if (CLOSE_GROUP_NAME_RE.test(String(prompt.name || ''))) return null;

  const raw = String(prompt.content || '');
  const strippedLead = raw.replace(/^(?:\s|\{\{(?:trim|noop)\}\}|\{\{\/\/[\s\S]*?\}\})+/gi, '');
  const m = strippedLead.match(/^<\/([a-zA-Z{][a-zA-Z0-9_.:{}-]*)>/);
  if (!m) return null;

  const xmlTag = m[1];
  if (VOID_HTML_TAGS.has(xmlTag.toLowerCase())) return null;

  const opens = countTagOccurrences(strippedLead, xmlTag, false);
  const closes = countTagOccurrences(strippedLead, xmlTag, true);
  if (closes <= opens) return null;

  return { xmlTag };
}

export function parseOpenGroupPrompt(prompt) {
  if (!prompt || prompt.marker) return null;
  const m = String(prompt.name || '').match(OPEN_GROUP_NAME_RE);
  if (!m) return null;
  const symbol = m[1];
  const groupId = m[2];
  const customTitle = (m[3] || '').trim();
  const xmlTag = m[4];
  const normGroup = normalizePromptNameAndEmoji(customTitle || xmlTag, prompt.bb_icon || '');
  return {
    level: symbol === '▽' ? 2 : 1,
    groupId,
    xmlTag,
    groupName: normGroup.name || xmlTag,
    extractedIcon: normGroup.bb_icon || '',
    isExplicit: true,
  };
}

export function parseCloseGroupPrompt(prompt) {
  if (!prompt || prompt.marker) return null;
  const m = String(prompt.name || '').match(CLOSE_GROUP_NAME_RE);
  if (!m) return null;
  const symbol = m[1] || m[3];
  const groupId = m[2] || m[4];
  const xmlTag = m[5];
  return {
    level: symbol === '△' ? 2 : 1,
    groupId,
    xmlTag,
  };
}

export function extractPreambleFromOpenContent(content, xmlTag) {
  const raw = String(content || '');
  const openTag = `<${xmlTag}>`;
  const idx = raw.lastIndexOf(openTag);
  if (idx === -1) return raw;
  return raw.slice(0, idx).replace(/\r?\n$/, '');
}

export function buildOpenPromptContent(preamble, xmlTag) {
  const cleanTag = sanitizeXmlTagName(xmlTag);
  const pre = String(preamble || '').trim();
  return pre ? `${pre}\n<${cleanTag}>` : `<${cleanTag}>`;
}

export function extractPostambleFromCloseContent(content, xmlTag) {
  const raw = String(content || '');
  const closeTag = `</${xmlTag}>`;
  const idx = raw.indexOf(closeTag);
  if (idx === -1) return raw;
  return raw.slice(idx + closeTag.length).replace(/^\r?\n/, '');
}

export function buildClosePromptContent(postamble, xmlTag) {
  const cleanTag = sanitizeXmlTagName(xmlTag);
  const post = String(postamble || '').trim();
  return post ? `</${cleanTag}>\n${post}` : `</${cleanTag}>`;
}

export function formatOpenGroupMarkerName(groupId, xmlTag, level = 1, groupName = '') {
  const sym = level >= 2 ? '▽' : '▼';
  const cleanTag = sanitizeXmlTagName(xmlTag);
  const cleanTitle = String(groupName || '').trim();
  if (cleanTitle && cleanTitle !== cleanTag) {
    return `${sym} [${groupId}] ${cleanTitle} <${cleanTag}>`;
  }
  return `${sym} [${groupId}] <${cleanTag}>`;
}

export function formatCloseGroupMarkerName(groupId, xmlTag, level = 1) {
  const sym = level >= 2 ? '△' : '▲';
  const cleanTag = sanitizeXmlTagName(xmlTag);
  return `[${sym} ${groupId}] </${cleanTag}>`;
}

export function estimatePromptTokens(prompt, tokenContext = null) {
  if (!prompt) return 0;
  if (prompt.marker) {
    if (!tokenContext) return 0;
    switch (prompt.identifier) {
      case 'chatHistory':
        return Math.max(0, Number(tokenContext.chatHistoryTokens) || 0);
      case 'charDescription':
        return estimateTextTokens(tokenContext.charDescription, tokenContext);
      case 'charPersonality':
        return estimateTextTokens(tokenContext.charPersonality, tokenContext);
      case 'scenario':
        return estimateTextTokens(tokenContext.scenario, tokenContext);
      case 'personaDescription':
        return estimateTextTokens(tokenContext.personaDescription, tokenContext);
      case 'dialogueExamples':
        return estimateTextTokens(tokenContext.mesExample, tokenContext);
      default:
        return 0;
    }
  }
  return estimateTextTokens(prompt.content, tokenContext);
}

export function formatCompactTokens(tokens) {
  const n = Number(tokens) || 0;
  if (n <= 0) return '0';
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}
export function buildPromptTree(orderedPrompts = [], tokenContext = null) {
  const n = orderedPrompts.length;
  const matchedPairByOpenIdx = new Map();
  const openStack = [];

  for (let i = 0; i < n; i += 1) {
    const p = orderedPrompts[i];
    if (!p) continue;

    if (p.identifier === 'chatHistory') {
      openStack.length = 0;
      continue;
    }

    const explicitClose = parseCloseGroupPrompt(p);
    if (explicitClose) {
      let matchStackPos = -1;
      for (let s = openStack.length - 1; s >= 0; s -= 1) {
        if (openStack[s].isExplicit && openStack[s].groupId === explicitClose.groupId) {
          matchStackPos = s;
          break;
        }
      }
      if (matchStackPos !== -1) {
        const opened = openStack[matchStackPos];
        openStack.length = matchStackPos;
        matchedPairByOpenIdx.set(opened.idx, {
          closeIdx: i,
          groupId: opened.groupId,
          xmlTag: opened.xmlTag,
          groupName: opened.groupName,
          extractedIcon: opened.extractedIcon,
          isExplicit: true,
        });
        continue;
      }
    }

    const explicitOpen = parseOpenGroupPrompt(p);
    if (explicitOpen) {
      openStack.push({
        idx: i,
        ...explicitOpen,
      });
      continue;
    }

    const implicitClose = detectImplicitCloseGroupPrompt(p);
    if (implicitClose) {
      let matchStackPos = -1;
      for (let s = openStack.length - 1; s >= 0; s -= 1) {
        if (!openStack[s].isExplicit && openStack[s].xmlTag === implicitClose.xmlTag) {
          matchStackPos = s;
          break;
        }
      }
      if (matchStackPos !== -1) {
        const opened = openStack[matchStackPos];
        openStack.length = matchStackPos;
        matchedPairByOpenIdx.set(opened.idx, {
          closeIdx: i,
          groupId: `auto_${opened.identifier || opened.idx}`,
          xmlTag: opened.xmlTag,
          groupName: opened.xmlTag,
          extractedIcon: opened.extractedIcon || '',
          isExplicit: false,
        });
        continue;
      }
    }

    const implicitOpen = detectImplicitOpenGroupPrompt(p);
    if (implicitOpen) {
      const normOpen = normalizePromptNameAndEmoji(p.name, p.bb_icon);
      openStack.push({
        idx: i,
        identifier: p.identifier,
        xmlTag: implicitOpen.xmlTag,
        groupName: implicitOpen.xmlTag,
        extractedIcon: p.bb_icon || normOpen.bb_icon || '',
        isExplicit: false,
      });
    }
  }

  function parseRange(startIdx, endIdx, currentDepth) {
    const nodes = [];
    let i = startIdx;

    while (i < endIdx) {
      const p = orderedPrompts[i];
      if (!p) {
        i += 1;
        continue;
      }

      const pair = matchedPairByOpenIdx.get(i);
      if (pair && pair.closeIdx > i && pair.closeIdx < endIdx && currentDepth < 2) {
        const closePrompt = orderedPrompts[pair.closeIdx];
        const children = parseRange(i + 1, pair.closeIdx, currentDepth + 1);
        const hasSubgroups = children.some((c) => c.type === 'group');
        const groupEnabled = Boolean(p.enabled) && Boolean(closePrompt.enabled);
        const activeChildSum = children.reduce((acc, ch) => {
          const isChildEnabled = ch.type === 'group' ? ch.enabled : Boolean(ch.prompt?.enabled);
          return isChildEnabled ? acc + (ch.tokens || 0) : acc;
        }, 0);
        const groupTokens =
          estimatePromptTokens(p, tokenContext) +
          estimatePromptTokens(closePrompt, tokenContext) +
          activeChildSum;
        const enabledChildrenCount = children.filter((ch) =>
          ch.type === 'group' ? ch.enabled : ch.prompt?.enabled,
        ).length;

        nodes.push({
          type: 'group',
          id: pair.groupId,
          groupId: pair.groupId,
          xmlTag: pair.xmlTag,
          groupName: pair.groupName || pair.xmlTag,
          level: currentDepth + 1,
          openPrompt: p,
          closePrompt,
          preamble: extractPreambleFromOpenContent(p.content, pair.xmlTag),
          postamble: extractPostambleFromCloseContent(closePrompt.content, pair.xmlTag),
          role: p.role || 'system',
          injection_position: p.injection_position ?? 0,
          injection_depth: p.injection_depth ?? 4,
          injection_order: p.injection_order ?? 100,
          bb_icon: pair.extractedIcon || p.bb_icon || '',
          enabled: groupEnabled,
          children,
          hasSubgroups,
          tokens: groupTokens,
          enabledChildrenCount,
        });
        i = pair.closeIdx + 1;
        continue;
      }

      const normPrompt = normalizePromptNameAndEmoji(p.name, p.bb_icon);
      const normalizedPromptObj =
        normPrompt.name !== p.name || normPrompt.bb_icon !== (p.bb_icon || '')
          ? {
              ...p,
              name: normPrompt.name || p.defaultName || p.identifier,
              bb_icon: normPrompt.bb_icon,
            }
          : p;

      nodes.push({
        type: 'prompt',
        id: normalizedPromptObj.identifier,
        prompt: normalizedPromptObj,
        tokens: estimatePromptTokens(normalizedPromptObj, tokenContext),
      });
      i += 1;
    }

    return nodes;
  }

  return parseRange(0, n, 0);
}

export function computeTotalEnabledTreeTokens(treeNodes = []) {
  let sum = 0;
  for (const node of treeNodes) {
    if (!node) continue;
    if (node.type === 'group') {
      if (node.enabled) sum += node.tokens || 0;
    } else if (
      node.type === 'prompt' &&
      (node.prompt?.enabled || node.prompt?.identifier === 'chatHistory')
    ) {
      sum += node.tokens || 0;
    }
  }
  return sum;
}
export function flattenPromptTree(
  treeNodes = [],
  level = 1,
  parentGroupConfig = null,
  allocatedGroupNums = null,
) {
  const usedNums = allocatedGroupNums || new Set();
  if (!allocatedGroupNums) {
    const collectExistingNums = (list) => {
      for (const item of list) {
        if (item?.type === 'group') {
          const m = String(item.groupId || '').match(/^grp_(\d+)$/);
          if (m) usedNums.add(Number(m[1]));
          collectExistingNums(item.children || []);
        }
      }
    };
    collectExistingNums(treeNodes);
  }

  const nextGrpId = (rawGroupId) => {
    if (/^grp_[a-zA-Z0-9_-]+$/.test(String(rawGroupId || ''))) {
      return rawGroupId;
    }
    let num = 1;
    while (usedNums.has(num)) num += 1;
    usedNums.add(num);
    return `grp_${String(num).padStart(4, '0')}`;
  };

  const flat = [];

  for (const node of treeNodes) {
    if (!node) continue;

    if (node.type === 'group') {
      const cleanTag = sanitizeXmlTagName(node.xmlTag);
      const persistedGroupId = nextGrpId(node.groupId);
      const role = parentGroupConfig ? parentGroupConfig.role : node.role || 'system';
      const injection_position = parentGroupConfig
        ? parentGroupConfig.injection_position
        : Number(node.injection_position ?? 0);
      const injection_depth = parentGroupConfig
        ? parentGroupConfig.injection_depth
        : Number(node.injection_depth ?? 4);
      const injection_order = parentGroupConfig
        ? parentGroupConfig.injection_order
        : Number(node.injection_order ?? 100);

      const openPrompt = {
        ...node.openPrompt,
        name: formatOpenGroupMarkerName(persistedGroupId, cleanTag, level, node.groupName),
        role,
        content: buildOpenPromptContent(node.preamble, cleanTag),
        injection_position,
        injection_depth,
        injection_order,
        bb_icon: node.bb_icon || '',
        enabled: Boolean(node.enabled),
        marker: false,
        system_prompt: Boolean(node.openPrompt?.system_prompt ?? false),
      };

      const closePrompt = {
        ...node.closePrompt,
        name: formatCloseGroupMarkerName(persistedGroupId, cleanTag, level),
        role,
        content: buildClosePromptContent(node.postamble, cleanTag),
        injection_position,
        injection_depth,
        injection_order,
        enabled: Boolean(node.enabled),
        marker: false,
        system_prompt: Boolean(node.closePrompt?.system_prompt ?? false),
      };

      flat.push(openPrompt);
      const childFlat = flattenPromptTree(
        node.children || [],
        Math.min(2, level + 1),
        {
          role,
          injection_position,
          injection_depth,
          injection_order,
        },
        usedNums,
      );
      flat.push(...childFlat);
      flat.push(closePrompt);
    } else if (node.type === 'prompt' && node.prompt) {
      const p = { ...node.prompt };
      if (parentGroupConfig && !p.marker) {
        p.role = parentGroupConfig.role;
        p.injection_position = parentGroupConfig.injection_position;
        p.injection_depth = parentGroupConfig.injection_depth;
        p.injection_order = parentGroupConfig.injection_order;
      }
      if (p.identifier === 'chatHistory') {
        p.enabled = true;
      }
      const norm = normalizePromptNameAndEmoji(p.name, p.bb_icon);
      p.name = norm.name || p.defaultName || p.identifier;
      p.bb_icon = norm.bb_icon;
      flat.push(p);
    }
  }

  return flat;
}

export function generateUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createNewPromptEntry(overrides = {}) {
  return {
    identifier: generateUuid(),
    name: 'New Prompt',
    defaultName: null,
    role: 'system',
    content: '',
    marker: false,
    system_prompt: false,
    injection_position: 0,
    injection_depth: 4,
    injection_order: 100,
    forbid_overrides: false,
    injection_trigger: [],
    bb_icon: '',
    enabled: true,
    ...overrides,
  };
}

export function createNewXmlGroupPair(existingPrompts = [], xmlTagRaw = 'prompt_group') {
  const usedNums = new Set();
  for (const p of existingPrompts) {
    const open = parseOpenGroupPrompt(p);
    if (open) {
      const numMatch = open.groupId.match(/^grp_(\d+)$/);
      if (numMatch) usedNums.add(Number(numMatch[1]));
    }
  }
  let nextNum = 1;
  while (usedNums.has(nextNum)) nextNum += 1;
  const groupId = `grp_${String(nextNum).padStart(4, '0')}`;
  const xmlTag = sanitizeXmlTagName(xmlTagRaw);

  const openPrompt = createNewPromptEntry({
    identifier: generateUuid(),
    name: formatOpenGroupMarkerName(groupId, xmlTag, 1, xmlTag),
    content: buildOpenPromptContent('', xmlTag),
    role: 'system',
    enabled: true,
  });

  const closePrompt = createNewPromptEntry({
    identifier: generateUuid(),
    name: formatCloseGroupMarkerName(groupId, xmlTag, 1),
    content: buildClosePromptContent('', xmlTag),
    role: 'system',
    enabled: true,
  });

  return { groupId, xmlTag, openPrompt, closePrompt };
}

/**
 * Resolves a lightweight selection descriptor (`{ mode: 'prompt' | 'group', id }`)
 * against the live `orderedPrompts` array, returning `{ mode, id, target, isInherited }`
 * or `null` if the prompt/group no longer exists in the active order.
 */
export function resolvePromptEditorTarget(
  orderedPrompts = [],
  selection = null,
  tokenContext = null,
) {
  if (!selection || !selection.id) return null;
  const tree = buildPromptTree(orderedPrompts, tokenContext);

  const searchNodes = (nodes, scopeId) => {
    for (const node of nodes) {
      if (selection.mode === 'group' && node.type === 'group') {
        if (node.groupId === selection.id) {
          return {
            mode: 'group',
            id: node.groupId,
            target: node,
            isInherited: node.level >= 2,
          };
        }
      } else if (selection.mode === 'prompt' && node.type === 'prompt') {
        if (node.prompt?.identifier === selection.id) {
          return {
            mode: 'prompt',
            id: node.prompt.identifier,
            target: node.prompt,
            isInherited: scopeId !== 'root',
          };
        }
      }

      if (node.type === 'group' && Array.isArray(node.children) && node.children.length > 0) {
        const nested = searchNodes(node.children, node.groupId);
        if (nested) return nested;
      }
    }
    return null;
  };

  return searchNodes(tree, 'root');
}

export function applyEditedPromptToOrdered(orderedPrompts = [], updatedPrompt = null) {
  if (!updatedPrompt || !updatedPrompt.identifier) return orderedPrompts;
  return orderedPrompts.map((p) =>
    p.identifier === updatedPrompt.identifier ? { ...p, ...updatedPrompt } : p,
  );
}

export function applyEditedGroupToOrdered(
  orderedPrompts = [],
  updatedGroup = null,
  tokenContext = null,
) {
  if (!updatedGroup || !updatedGroup.groupId) return orderedPrompts;
  const tree = buildPromptTree(orderedPrompts, tokenContext);
  const updateInTree = (nodes) =>
    nodes.map((n) => {
      if (n.type !== 'group') return n;
      if (n.groupId === updatedGroup.groupId) {
        return {
          ...n,
          groupName: updatedGroup.groupName,
          xmlTag: updatedGroup.xmlTag,
          role: updatedGroup.role,
          injection_position: updatedGroup.injection_position,
          injection_depth: updatedGroup.injection_depth,
          injection_order: updatedGroup.injection_order,
          preamble: updatedGroup.preamble,
          postamble: updatedGroup.postamble,
          bb_icon: updatedGroup.bb_icon,
        };
      }
      return { ...n, children: updateInTree(n.children || []) };
    });
  return flattenPromptTree(updateInTree(tree), 1, null);
}
