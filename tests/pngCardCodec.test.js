import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  crc32,
  isPngBuffer,
  extractPngChunks,
  encodePngChunks,
  createTextChunk,
  readCardFromPngBuffer,
  writeCardToPngBuffer,
  stripPngMetadataChunks,
} from '../server/services/pngCardCodec.js';

function createMinimalPngBuffer(extraTextChunks = []) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(Buffer.from([0, 255, 128, 64, 255]));

  return encodePngChunks([
    { type: 'IHDR', data: ihdr },
    ...extraTextChunks,
    { type: 'IDAT', data: idat },
    { type: 'IEND', data: Buffer.alloc(0) },
  ]);
}

describe('pngCardCodec — SillyTavern Character Card Spec v2 & v3 round-trip', () => {
  it('validates PNG signatures and preserves chunk CRC32 integrity', () => {
    const png = createMinimalPngBuffer();
    assert.equal(isPngBuffer(png), true);
    assert.equal(isPngBuffer(Buffer.from('not-a-png')), false);

    const chunks = extractPngChunks(png);
    assert.deepEqual(
      chunks.map((c) => c.type),
      ['IHDR', 'IDAT', 'IEND'],
    );
    for (const chunk of chunks) {
      const expectedCrc = crc32(Buffer.from(chunk.type, 'ascii'), chunk.data);
      assert.equal(chunk.crc, expectedCrc);
    }
  });

  it('performs lossless Spec v2 (`chara`) PNG round-trip with lorebook & extensions', () => {
    const basePng = createMinimalPngBuffer();
    const inputCard = {
      name: 'Aria Nocturne',
      description: '{{char}} is an archivist of forgotten star-charts.',
      personality: 'Calm, observant',
      scenario: '{{user}} enters the observatory.',
      first_mes: '*She looks up.* "You are late, {{user}}."',
      mes_example: '<START>\n{{user}}: Hi\n{{char}}: "Greetings."',
      creator_notes: 'Temp 0.9.',
      system_prompt: 'Write atmospheric prose.',
      post_history_instructions: 'Stay in character.',
      alternate_greetings: ['Alt intro #1', 'Alt intro #2'],
      tags: ['sci-fi', 'mystery'],
      creator: 'NexusAuthor',
      character_version: '2.4.1',
      fav: true,
      talkativeness: '0.75',
      character_book: {
        name: 'Observatory Lore',
        entries: [{ uid: 1, keys: ['astrolabe'], content: 'Ancient relic.', enabled: true }],
      },
      extensions: {
        world: 'ObservatoryLore',
        depth_prompt: { prompt: 'Keep details grounded.', depth: 4, role: 'system' },
        regex_scripts: [
          { id: 'rx-1', scriptName: 'OOC', findRegex: '/\\[OOC\\]/gi', replaceString: '', placement: [2] },
        ],
        custom_vendor_flag: { nested: [1, 2, 3] },
      },
    };

    const writtenPng = writeCardToPngBuffer(basePng, inputCard, { writeV3: false });
    const restored = readCardFromPngBuffer(writtenPng, 'Aria_Nocturne.png');

    assert.equal(restored.spec, 'chara_card_v2');
    assert.equal(restored.hasCharaChunk, true);
    assert.equal(restored.hasCcv3Chunk, false);
    assert.equal(restored.name, inputCard.name);
    assert.equal(restored.first_mes, inputCard.first_mes);
    assert.deepEqual(restored.alternate_greetings, inputCard.alternate_greetings);
    assert.deepEqual(restored.tags, inputCard.tags);
    assert.equal(restored.fav, true);
    assert.equal(restored.talkativeness, '0.75');
    assert.deepEqual(restored.character_book, inputCard.character_book);
    assert.equal(restored.extensions.world, 'ObservatoryLore');
    assert.deepEqual(restored.extensions.depth_prompt, inputCard.extensions.depth_prompt);
    assert.deepEqual(restored.extensions.regex_scripts, inputCard.extensions.regex_scripts);
    assert.deepEqual(restored.extensions.custom_vendor_flag, { nested: [1, 2, 3] });
  });

  it('performs lossless Spec v3 (`ccv3` + `chara`) round-trip with Unicode & v3 fields', () => {
    const basePng = createMinimalPngBuffer();
    const v3Card = {
      spec: 'chara_card_v3',
      name: 'Кира / 綺羅 ✨',
      description: 'Multilingual character card payload check.',
      first_mes: '«Привет, {{user}}!» — улыбнулась Кира.',
      alternate_greetings: ['Second greeting 🌟'],
      group_only_greetings: ['Group greeting!'],
      nickname: 'Kira',
      extensions: { world: 'Cyberpunk_Neo' },
    };

    const encodedPng = writeCardToPngBuffer(basePng, v3Card);
    const parsed = readCardFromPngBuffer(encodedPng, 'kira.png');

    assert.equal(parsed.spec, 'chara_card_v3');
    assert.equal(parsed.spec_version, '3.0');
    assert.equal(parsed.hasCharaChunk, true);
    assert.equal(parsed.hasCcv3Chunk, true);
    assert.equal(parsed.name, 'Кира / 綺羅 ✨');
    assert.equal(parsed.first_mes, '«Привет, {{user}}!» — улыбнулась Кира.');
    assert.deepEqual(parsed.alternate_greetings, ['Second greeting 🌟']);
    assert.deepEqual(parsed.group_only_greetings, ['Group greeting!']);
    assert.equal(parsed.nickname, 'Kira');
    assert.equal(parsed.extensions.world, 'Cyberpunk_Neo');
  });

  it('decodes compressed zTXt chunks and strips metadata cleanly', () => {
    const payloadJson = JSON.stringify({
      spec: 'chara_card_v2',
      data: { name: 'Compressed Card', first_mes: 'Loaded from zTXt!' },
    });
    const compressed = zlib.deflateSync(
      Buffer.from(Buffer.from(payloadJson, 'utf8').toString('base64'), 'utf8'),
    );
    const ztxtData = Buffer.concat([Buffer.from('chara', 'latin1'), Buffer.from([0, 0]), compressed]);

    const pngWithZtxt = createMinimalPngBuffer([
      { type: 'zTXt', data: ztxtData },
      createTextChunk('Software', 'SillyTavern'),
    ]);

    const card = readCardFromPngBuffer(pngWithZtxt, 'compressed.png');
    assert.equal(card.name, 'Compressed Card');
    assert.equal(card.first_mes, 'Loaded from zTXt!');

    const stripped = stripPngMetadataChunks(pngWithZtxt);
    assert.deepEqual(
      extractPngChunks(stripped).map((c) => c.type),
      ['IHDR', 'IDAT', 'IEND'],
    );
  });
});
