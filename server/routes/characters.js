import { Router } from 'express';
import {
  listCharacterCards,
  getFullCharacterCard,
  saveCharacterCard,
  createCharacterCard,
  importCharacterCards,
  backupOriginalCardPortraitIfNeeded,
  replaceCharacterCardAvatar,
  applyGalleryPortraitAsMainAvatar,
  convertCharacterCardToPersona,
  replaceCharacterCardFromFile,
  importEmbeddedTagsForCard,
  duplicateCharacterCard,
  deleteCharacterCards,
  exportCharacterCard,
  exportCharacterCardsZip,
} from '../services/cardStore.js';
import {
  readScenarioMeta,
  saveScenarioMeta,
  addScenarioGalleryPortrait,
  removeScenarioGalleryPortrait,
} from '../services/scenarioMetaStore.js';
import {
  listTags,
  createTag,
  renameTag,
  deleteTag,
  setCardTags,
  bulkSetCardTags,
} from '../services/tagStore.js';
import {
  listGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroups,
} from '../services/groupStore.js';
import {
  listAvailableWorlds,
  updateCharacterAuxWorlds,
  extractEmbeddedLorebookToWorld,
} from '../services/worldBindingsStore.js';
import { ensureThumbnailFile } from '../services/thumbnails.js';
import { invalidateChatStoreCaches } from '../services/chatStore.js';
import { readSession, saveSession } from '../services/sessionStore.js';
import {
  duplicateCharacterPresetBindings,
  removeCharacterPresetBindings,
} from '../services/presetStore.js';

export const charactersRouter = Router();

/**
 * GET /api/characters
 * Returns lightweight summaries of all character/scenario cards + chat counts + thumbnail URLs.
 */
charactersRouter.get('/', async (_req, res) => {
  try {
    const startMs = performance.now();
    const characters = await listCharacterCards();
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    res.json({
      ok: true,
      count: characters.length,
      elapsedMs,
      characters,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters
 * Creates a new character/scenario card (`{ fields, avatarBase64, scenarioMeta, asJson }`).
 */
charactersRouter.post('/', async (req, res) => {
  try {
    const card = await createCharacterCard(req.body || {});
    const tagData = listTags();
    res.json({ ok: true, card, ...tagData });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/import
 * Imports one or more `.png` (v2/v3) or `.json` cards (`{ items, importEmbeddedTags }`).
 */
charactersRouter.post('/import', async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const importEmbeddedTags = req.body?.importEmbeddedTags !== false;
    const imported = await importCharacterCards(items, { importEmbeddedTags });
    const tagData = listTags();
    res.json({
      ok: true,
      count: imported.length,
      imported,
      ...tagData,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/characters/tags
 * Lists `settings.json -> tags` plus the raw avatar -> tag-id assignments.
 */
charactersRouter.get('/tags', (_req, res) => {
  try {
    const data = listTags();
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/characters/worlds/list
 * Lists available SillyTavern World Info / Lorebook files in `data/default-user/worlds/*.json`.
 */
charactersRouter.get('/worlds/list', (_req, res) => {
  try {
    const worlds = listAvailableWorlds();
    res.json({ ok: true, count: worlds.length, worlds });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/tags
 * Creates a new tag (`{ name, folderType }`).
 */
charactersRouter.post('/tags', async (req, res) => {
  try {
    const data = await createTag(req.body || {});
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * PATCH /api/characters/tags/:tagId
 * Renames a tag (`{ name }`).
 */
charactersRouter.patch('/tags/:tagId', async (req, res) => {
  try {
    const data = await renameTag(req.params.tagId, req.body?.name);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/characters/tags/:tagId
 * Deletes a tag and detaches it from every card.
 */
charactersRouter.delete('/tags/:tagId', async (req, res) => {
  try {
    const data = await deleteTag(req.params.tagId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/tags/bulk
 * Applies one tag operation to many cards (`{ avatars, tagId, mode }`).
 */
charactersRouter.post('/tags/bulk', async (req, res) => {
  try {
    const { avatars = [], tagId, mode = 'add' } = req.body || {};
    const data = await bulkSetCardTags(avatars, tagId, mode);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/characters/groups
 * Lists group definitions from `data/default-user/groups`.
 */
charactersRouter.get('/groups', (_req, res) => {
  try {
    const groups = listGroups();
    res.json({ ok: true, count: groups.length, groups });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/groups
 * Creates a new group chat definition (`{ name, members, fav }`).
 */
charactersRouter.post('/groups', async (req, res) => {
  try {
    const group = await createGroup(req.body || {});
    const groups = listGroups();
    res.json({ ok: true, group, groups });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/characters/groups/:groupId
 * Returns one group definition.
 */
charactersRouter.get('/groups/:groupId', (req, res) => {
  try {
    const group = getGroupById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }
    res.json({ ok: true, group });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PATCH /api/characters/groups/:groupId
 * Updates a group's roster, disabled members, name, or reply/generation settings.
 */
charactersRouter.patch('/groups/:groupId', async (req, res) => {
  try {
    const group = await updateGroup(req.params.groupId, req.body || {});
    const groups = listGroups();
    res.json({ ok: true, group, groups });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/bulk/delete
 * Deletes many cards and/or groups at once (`{ avatars, groupIds, deleteChats }`).
 */
charactersRouter.post('/bulk/delete', async (req, res) => {
  try {
    const avatars = Array.isArray(req.body?.avatars) ? req.body.avatars : [];
    const groupIds = Array.isArray(req.body?.groupIds) ? req.body.groupIds : [];
    const deleteChats = req.body?.deleteChats !== false;

    const cardResult = await deleteCharacterCards(avatars, { deleteChats });
    const groupResult = deleteGroups(groupIds, { deleteChats });
    if (deleteChats) {
      invalidateChatStoreCaches();
    }
    if (cardResult.deleted.length > 0) {
      await removeCharacterPresetBindings(cardResult.deleted).catch(() => {});
      const clearMap = {};
      for (const av of cardResult.deleted) clearMap[av] = null;
      const curSession = readSession();
      const shouldClearGlobal =
        curSession?.lastChat?.avatar && cardResult.deleted.includes(curSession.lastChat.avatar);
      await saveSession({
        lastChats: clearMap,
        ...(shouldClearGlobal ? { lastChat: null } : {}),
      }).catch(() => {});
    }

    res.json({
      ok: true,
      deleted: cardResult.deleted,
      deletedGroups: groupResult.deleted,
      count: cardResult.count + groupResult.count,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/bulk/export-zip
 * Packs selected cards (`{ avatars, format: 'png' | 'json' }`) into a single `.zip` archive.
 */
charactersRouter.post('/bulk/export-zip', (req, res) => {
  try {
    const avatars = Array.isArray(req.body?.avatars) ? req.body.avatars : [];
    const format = req.body?.format === 'json' ? 'json' : 'png';
    const zip = exportCharacterCardsZip(avatars, format);
    if (zip.count === 0) {
      return res.status(404).json({ ok: false, error: 'No matching character files found to export' });
    }
    res.json({
      ok: true,
      fileName: zip.fileName,
      count: zip.count,
      zipBase64: zip.buffer.toString('base64'),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/characters/:avatar
 * Returns full V2/V3 metadata (greetings, character_book, prompts, chatStats) for one card.
 */
charactersRouter.get('/:avatar', (req, res) => {
  try {
    const card = getFullCharacterCard(req.params.avatar);
    if (!card) {
      return res.status(404).json({ ok: false, error: 'Character card not found' });
    }
    res.json({ ok: true, card });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/characters/:avatar
 * Atomically updates a character card's PNG chunks (`chara` / `ccv3`) or JSON file.
 */
charactersRouter.put('/:avatar', async (req, res) => {
  try {
    const updatedCard = await saveCharacterCard(req.params.avatar, req.body || {});
    res.json({ ok: true, card: updatedCard });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/characters/:avatar/export?format=png|json
 * Streams the raw PNG card or the serialized SillyTavern JSON payload.
 */
charactersRouter.get('/:avatar/export', (req, res) => {
  try {
    const format = req.query?.format === 'json' ? 'json' : 'png';
    const file = exportCharacterCard(req.params.avatar, format);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    res.send(file.buffer);
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/:avatar/duplicate
 * Duplicates a card file together with its tag assignments.
 */
charactersRouter.post('/:avatar/duplicate', async (req, res) => {
  try {
    const card = await duplicateCharacterCard(req.params.avatar);
    if (card?.avatar) {
      await duplicateCharacterPresetBindings(req.params.avatar, card.avatar).catch(() => {});
    }
    res.json({ ok: true, card });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/characters/:avatar/tags
 * Replaces the tag-id list assigned to a single card (`{ tagIds }`).
 */
charactersRouter.put('/:avatar/tags', async (req, res) => {
  try {
    const data = await setCardTags(req.params.avatar, req.body?.tagIds || []);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/:avatar/tags/import-embedded
 * Imports the card's embedded `data.tags` into `settings.json -> tags` and `tag_map`.
 */
charactersRouter.post('/:avatar/tags/import-embedded', async (req, res) => {
  try {
    const card = await importEmbeddedTagsForCard(req.params.avatar);
    const tagData = listTags();
    res.json({ ok: true, card, ...tagData });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/:avatar/avatar
 * Replaces the main PNG portrait of a card while preserving `chara` / `ccv3` metadata.
 */
charactersRouter.post('/:avatar/avatar', async (req, res) => {
  try {
    const card = await replaceCharacterCardAvatar(
      req.params.avatar,
      req.body?.imageBase64,
    );
    res.json({ ok: true, card });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/:avatar/replace
 * Replaces/updates an existing character card from a newly uploaded `.png` or `.json` file.
 */
charactersRouter.post('/:avatar/replace', async (req, res) => {
  try {
    const card = await replaceCharacterCardFromFile(
      req.params.avatar,
      req.body || {},
    );
    res.json({ ok: true, card });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/characters/:avatar/meta
 * Returns `.nexustavern/characters/<avatar>.json` metadata for this scenario.
 */
charactersRouter.get('/:avatar/meta', (req, res) => {
  try {
    const scenarioMeta = readScenarioMeta(req.params.avatar);
    res.json({ ok: true, scenarioMeta });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/characters/:avatar/meta
 * Updates `.nexustavern/characters/<avatar>.json` metadata for this scenario.
 */
charactersRouter.put('/:avatar/meta', async (req, res) => {
  try {
    const scenarioMeta = await saveScenarioMeta(req.params.avatar, req.body || {});
    res.json({ ok: true, scenarioMeta });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/:avatar/portraits
 * Uploads a portrait into the scenario's gallery (`{ imageBase64, fileName, label }`).
 * Automatically backs up the card's original PNG portrait into the gallery on first upload.
 */
charactersRouter.post('/:avatar/portraits', async (req, res) => {
  try {
    await backupOriginalCardPortraitIfNeeded(req.params.avatar);
    const result = await addScenarioGalleryPortrait(
      req.params.avatar,
      req.body || {},
    );
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/:avatar/portraits/:portraitId/apply
 * Switches the card's main PNG portrait to the selected gallery item in 1 click.
 */
charactersRouter.post('/:avatar/portraits/:portraitId/apply', async (req, res) => {
  try {
    const card = await applyGalleryPortraitAsMainAvatar(
      req.params.avatar,
      req.params.portraitId,
    );
    res.json({ ok: true, card });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/:avatar/convert-to-persona
 * Copies the card's portrait and description into `User Avatars/` + `settings.json -> personas`.
 */
charactersRouter.post('/:avatar/convert-to-persona', async (req, res) => {
  try {
    const data = await convertCharacterCardToPersona(req.params.avatar);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/characters/:avatar/lore-bindings
 * Updates `extensions.world` (Primary World) and/or `settings.json -> world_info.charLore` (Auxiliary Worlds).
 */
charactersRouter.put('/:avatar/lore-bindings', async (req, res) => {
  try {
    const { primaryWorld, extraBooks } = req.body || {};
    if (Array.isArray(extraBooks)) {
      await updateCharacterAuxWorlds(req.params.avatar, extraBooks);
    }
    let card = null;
    if (primaryWorld !== undefined) {
      const existing = getFullCharacterCard(req.params.avatar);
      if (!existing) {
        return res.status(404).json({ ok: false, error: 'Character card not found' });
      }
      const nextExtensions = { ...(existing.extensions || {}) };
      const cleanPrimary = String(primaryWorld || '').trim();
      if (cleanPrimary) {
        nextExtensions.world = cleanPrimary;
      } else {
        delete nextExtensions.world;
      }
      card = await saveCharacterCard(req.params.avatar, { extensions: nextExtensions });
    } else {
      card = getFullCharacterCard(req.params.avatar);
    }
    res.json({ ok: true, card });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/characters/:avatar/import-embedded-lore
 * Extracts `character_book` into `worlds/<Name>.json` and binds it as `extensions.world`.
 */
charactersRouter.post('/:avatar/import-embedded-lore', async (req, res) => {
  try {
    const data = await extractEmbeddedLorebookToWorld(req.params.avatar);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/characters/:avatar/portraits/:portraitId
 * Removes a portrait from the scenario's gallery.
 */
charactersRouter.delete('/:avatar/portraits/:portraitId', async (req, res) => {
  try {
    const scenarioMeta = await removeScenarioGalleryPortrait(
      req.params.avatar,
      req.params.portraitId,
    );
    res.json({ ok: true, scenarioMeta });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/characters/:avatar
 * Removes a single card file together with its thumbnail, tags and (optionally) chat folder.
 */
charactersRouter.delete('/:avatar', async (req, res) => {
  try {
    const rawDeleteChats = req.query.deleteChats ?? req.body?.deleteChats;
    const deleteChats =
      rawDeleteChats === undefined
        ? true
        : rawDeleteChats !== 'false' && rawDeleteChats !== false;

    const result = await deleteCharacterCards([req.params.avatar], { deleteChats });
    if (result.count === 0) {
      return res.status(404).json({ ok: false, error: 'Character card not found' });
    }
    if (deleteChats) {
      invalidateChatStoreCaches();
    }
    await removeCharacterPresetBindings(result.deleted).catch(() => {});
    const clearMap = {};
    for (const av of result.deleted) clearMap[av] = null;
    const curSession = readSession();
    const shouldClearGlobal =
      curSession?.lastChat?.avatar && result.deleted.includes(curSession.lastChat.avatar);
    await saveSession({
      lastChats: clearMap,
      ...(shouldClearGlobal ? { lastChat: null } : {}),
    }).catch(() => {});

    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Thumbnail router mounted at /api/thumbnails/:type/:filename
 */
export const thumbnailsRouter = Router();

thumbnailsRouter.get('/:type/:filename', async (req, res) => {
  try {
    const type = req.params.type === 'persona' ? 'persona' : 'avatar';
    const thumbPath = await ensureThumbnailFile(type, req.params.filename);
    if (!thumbPath) {
      return res.status(404).json({ ok: false, error: 'Thumbnail source not found' });
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(thumbPath);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
