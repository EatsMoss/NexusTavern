import fs from 'node:fs';
import path from 'node:path';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import { DEFAULT_USER_DIR } from '../utils/paths.js';
import {
  loadCharacterCardByFilename,
  saveCharacterCard,
  readUserSettings,
  writeUserSettings,
  withUserSettingsLock,
} from './cardStore.js';

export const WORLDS_DIR = path.join(DEFAULT_USER_DIR, 'worlds');

export function listAvailableWorlds() {
  if (!fs.existsSync(WORLDS_DIR)) return [];
  const entries = fs
    .readdirSync(WORLDS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'));

  const worlds = [];
  for (const entry of entries) {
    const fullPath = path.join(WORLDS_DIR, entry.name);
    let entriesCount = 0;
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (parsed?.entries && typeof parsed.entries === 'object') {
        entriesCount = Array.isArray(parsed.entries)
          ? parsed.entries.length
          : Object.keys(parsed.entries).length;
      }
    } catch {
      // ignore unreadable world file
    }
    const name = entry.name.replace(/\.json$/i, '');
    worlds.push({ name, fileName: entry.name, entriesCount });
  }

  worlds.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return worlds;
}

export function resolveCharacterAuxWorlds(avatarFilename, charName = '', settingsObj = null) {
  const settings = settingsObj || readUserSettings();
  const charLore = Array.isArray(settings?.world_info?.charLore)
    ? settings.world_info.charLore
    : [];
  const safeAvatar = path.basename(String(avatarFilename || ''));
  const stem = safeAvatar.replace(/\.(png|json)$/i, '');

  const match = charLore.find(
    (item) =>
      item &&
      (item.name === safeAvatar || item.name === stem || (charName && item.name === charName)),
  );
  return Array.isArray(match?.extraBooks)
    ? match.extraBooks.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
}

export async function updateCharacterAuxWorlds(avatarFilename, extraBooks = []) {
  const safeAvatar = path.basename(String(avatarFilename || ''));
  if (!safeAvatar) throw new Error('Character avatar filename is required');

  const cleanBooks = Array.from(
    new Set(
      (Array.isArray(extraBooks) ? extraBooks : [])
        .map((w) => String(w || '').trim())
        .filter(Boolean),
    ),
  );

  return withUserSettingsLock(async () => {
    const settings = readUserSettings();
    if (!settings.world_info || typeof settings.world_info !== 'object') {
      settings.world_info = {};
    }
    if (!Array.isArray(settings.world_info.charLore)) {
      settings.world_info.charLore = [];
    }

    const stem = safeAvatar.replace(/\.(png|json)$/i, '');
    settings.world_info.charLore = settings.world_info.charLore.filter(
      (item) => item && item.name !== safeAvatar && item.name !== stem,
    );

    if (cleanBooks.length > 0) {
      settings.world_info.charLore.push({ name: safeAvatar, extraBooks: cleanBooks });
    }

    await writeUserSettings(settings);
    return cleanBooks;
  });
}

export async function extractEmbeddedLorebookToWorld(avatarFilename) {
  const safeAvatar = path.basename(String(avatarFilename || ''));
  const card = loadCharacterCardByFilename(safeAvatar);
  if (!card) throw new Error(`Character card not found: ${safeAvatar}`);

  const rawBook = card.character_book;
  const rawEntries = Array.isArray(rawBook?.entries)
    ? rawBook.entries
    : rawBook?.entries && typeof rawBook.entries === 'object'
      ? Object.values(rawBook.entries)
      : [];

  if (rawEntries.length === 0) {
    throw new Error('This card has no embedded character_book entries to extract');
  }

  fs.mkdirSync(WORLDS_DIR, { recursive: true });
  const baseBookName =
    String(rawBook?.name || `${card.name || safeAvatar.replace(/\.(png|json)$/i, '')} Lore`)
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .trim() || 'Character_Lore';

  let worldName = baseBookName;
  let suffix = 1;
  while (fs.existsSync(path.join(WORLDS_DIR, `${worldName}.json`))) {
    worldName = `${baseBookName}_${suffix}`;
    suffix += 1;
  }

  const entriesDict = {};
  rawEntries.forEach((entry, idx) => {
    entriesDict[String(idx)] = {
      uid: Number.isInteger(entry?.id) ? entry.id : idx,
      key: Array.isArray(entry?.keys) ? entry.keys : Array.isArray(entry?.key) ? entry.key : [],
      keysecondary: Array.isArray(entry?.secondary_keys)
        ? entry.secondary_keys
        : Array.isArray(entry?.keysecondary)
          ? entry.keysecondary
          : [],
      comment: String(entry?.comment || entry?.name || ''),
      content: String(entry?.content || ''),
      constant: Boolean(entry?.constant),
      selective: entry?.selective !== undefined ? Boolean(entry.selective) : true,
      order: Number(entry?.insertion_order ?? entry?.order ?? 100),
      position: Number(entry?.extensions?.position ?? 0),
      disable: entry?.enabled === false || Boolean(entry?.disable),
      depth: Number(entry?.extensions?.depth ?? 4),
      probability: Number(entry?.extensions?.probability ?? 100),
      useProbability: entry?.extensions?.useProbability !== false,
    };
  });

  await writeFileAtomic(
    path.join(WORLDS_DIR, `${worldName}.json`),
    JSON.stringify({ entries: entriesDict }, null, 2),
    'utf8',
  );

  const updatedCard = await saveCharacterCard(safeAvatar, {
    extensions: { ...(card.extensions || {}), world: worldName },
  });

  return {
    worldName,
    entriesCount: rawEntries.length,
    card: updatedCard,
    worlds: listAvailableWorlds(),
  };
}
