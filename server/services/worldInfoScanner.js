import fs from 'node:fs';
import path from 'node:path';
import { WORLDS_DIR, resolveCharacterAuxWorlds } from './worldBindingsStore.js';
import { resolveMacros } from './macroResolver.js';

function normalizeRawWorldEntries(rawBook, sourceName) {
  if (!rawBook || typeof rawBook !== 'object') return [];
  const rawList = Array.isArray(rawBook.entries)
    ? rawBook.entries
    : rawBook.entries && typeof rawBook.entries === 'object'
      ? Object.values(rawBook.entries)
      : [];

  return rawList
    .map((e, idx) => {
      if (!e || typeof e !== 'object') return null;
      if (Boolean(e.disable) || e.enabled === false) return null;

      const keys = Array.isArray(e.key) ? e.key : Array.isArray(e.keys) ? e.keys : [];
      const secondaryKeys = Array.isArray(e.keysecondary)
        ? e.keysecondary
        : Array.isArray(e.secondary_keys)
          ? e.secondary_keys
          : [];

      const position = Number(e.position ?? e.extensions?.position ?? 0);
      const depth = Number(e.depth ?? e.extensions?.depth ?? 4);
      const roleNum = Number(e.role ?? e.extensions?.role ?? 0);
      const role = roleNum === 1 ? 'user' : roleNum === 2 ? 'assistant' : 'system';

      return {
        uid: `${sourceName}:${e.uid ?? e.id ?? idx}`,
        comment: String(e.comment || e.name || `Lore #${idx + 1}`).trim(),
        content: String(e.content || '').trim(),
        constant: Boolean(e.constant),
        selective: e.selective !== undefined ? Boolean(e.selective) : secondaryKeys.length > 0,
        keys: keys.map((k) => String(k || '').trim()).filter(Boolean),
        secondaryKeys: secondaryKeys.map((k) => String(k || '').trim()).filter(Boolean),
        order: Number(e.order ?? e.insertion_order ?? 100),
        position,
        depth: Number.isFinite(depth) ? depth : 4,
        role,
      };
    })
    .filter((item) => item && item.content.length > 0);
}

function loadWorldFileByName(worldName) {
  const clean = String(worldName || '').trim().replace(/\.json$/i, '');
  if (!clean) return [];
  const filePath = path.join(WORLDS_DIR, `${path.basename(clean)}.json`);
  if (!fs.existsSync(filePath)) return [];
  try {
    return normalizeRawWorldEntries(JSON.parse(fs.readFileSync(filePath, 'utf8')), clean);
  } catch {
    return [];
  }
}

function matchesKeyword(haystackLower, rawKey) {
  const k = String(rawKey || '').trim();
  if (!k) return false;
  const rxMatch = k.match(/^\/(.+)\/([gimsuy]*)$/);
  if (rxMatch) {
    try {
      return new RegExp(rxMatch[1], rxMatch[2] || 'i').test(haystackLower);
    } catch {
      return false;
    }
  }
  return haystackLower.includes(k.toLowerCase());
}

export function scanWorldInfoForPrompt({
  card,
  settings,
  chatMetadata = {},
  recentMessagesText = '',
  wiFormat = '{0}',
  macroCtx = {},
}) {
  const collected = [];
  const primaryWorld = String(card?.extensions?.world || '').trim();
  if (card?.character_book && !primaryWorld) {
    collected.push(...normalizeRawWorldEntries(card.character_book, 'Embedded Lore'));
  }

  const worldNames = new Set();
  if (primaryWorld) worldNames.add(primaryWorld);
  for (const aux of resolveCharacterAuxWorlds(card?.avatar, card?.name, settings)) {
    worldNames.add(aux);
  }
  if (chatMetadata?.world) worldNames.add(String(chatMetadata.world).trim());
  if (Array.isArray(settings?.world_info?.globalSelect)) {
    for (const gw of settings.world_info.globalSelect) {
      if (gw) worldNames.add(String(gw).trim());
    }
  }
  for (const wName of worldNames) {
    collected.push(...loadWorldFileByName(wName));
  }

  if (collected.length === 0) {
    return { beforeText: '', afterText: '', depthEntries: [], activatedCount: 0 };
  }

  const haystack = String(recentMessagesText || '').toLowerCase();
  const activated = collected.filter((entry) => {
    if (entry.constant) return true;
    if (entry.keys.length === 0) return false;
    const hit = entry.keys.some((k) => matchesKeyword(haystack, k));
    if (!hit) return false;
    if (entry.selective && entry.secondaryKeys.length > 0) {
      return entry.secondaryKeys.some((sk) => matchesKeyword(haystack, sk));
    }
    return true;
  });

  activated.sort((a, b) => a.order - b.order);

  const beforeParts = [];
  const afterParts = [];
  const depthEntries = [];

  for (const item of activated) {
    const resolvedContent = resolveMacros(item.content, macroCtx).trim();
    if (!resolvedContent) continue;
    const formatted =
      wiFormat && wiFormat.includes('{0}')
        ? resolveMacros(wiFormat.replace(/\{0\}/g, resolvedContent), macroCtx)
        : resolvedContent;

    if (item.position === 4) {
      depthEntries.push({
        identifier: `wi_${item.uid}`,
        name: `World Info: ${item.comment}`,
        role: item.role,
        content: formatted,
        injection_depth: item.depth,
        injection_order: item.order,
        source: 'worldInfoDepth',
      });
    } else if (item.position === 0) {
      beforeParts.push(formatted);
    } else {
      afterParts.push(formatted);
    }
  }

  return {
    beforeText: beforeParts.join('\n\n'),
    afterText: afterParts.join('\n\n'),
    depthEntries,
    activatedCount: activated.length,
  };
}
