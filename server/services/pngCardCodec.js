import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Precomputed IEEE 802.3 CRC32 lookup table for PNG chunk verification and generation.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * Computes CRC32 over chunk type + chunk data buffers.
 */
export function crc32(typeBuffer, dataBuffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < typeBuffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ typeBuffer[i]) & 0xff] ^ (crc >>> 8);
  }
  for (let i = 0; i < dataBuffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ dataBuffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Validates whether a buffer starts with the standard 8-byte PNG signature.
 */
export function isPngBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  return buffer.subarray(0, 8).equals(PNG_SIGNATURE);
}

/**
 * Parses a PNG buffer into an array of chunks: { type, data, crc }.
 */
export function extractPngChunks(buffer) {
  if (!isPngBuffer(buffer)) {
    throw new Error('Invalid PNG signature');
  }

  const chunks = [];
  let offset = 8;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd + 4 > buffer.length) {
      break;
    }

    const data = buffer.subarray(dataStart, dataEnd);
    const crc = buffer.readUInt32BE(dataEnd);

    chunks.push({ type, data, crc });
    offset = dataEnd + 4;

    if (type === 'IEND') {
      break;
    }
  }

  return chunks;
}

/**
 * Encodes an array of PNG chunks ({ type, data }) back into a valid PNG Buffer with fresh CRC32.
 */
export function encodePngChunks(chunks) {
  let totalSize = 8;
  for (const chunk of chunks) {
    totalSize += 12 + chunk.data.length;
  }

  const out = Buffer.allocUnsafe(totalSize);
  PNG_SIGNATURE.copy(out, 0);
  let offset = 8;

  for (const chunk of chunks) {
    const typeBuf = Buffer.from(chunk.type, 'ascii');
    const dataBuf = Buffer.isBuffer(chunk.data)
      ? chunk.data
      : Buffer.from(chunk.data);

    out.writeUInt32BE(dataBuf.length, offset);
    typeBuf.copy(out, offset + 4);
    dataBuf.copy(out, offset + 8);

    const chunkCrc = crc32(typeBuf, dataBuf);
    out.writeUInt32BE(chunkCrc, offset + 8 + dataBuf.length);

    offset += 12 + dataBuf.length;
  }

  return out;
}

/**
 * Decodes a tEXt, zTXt, or iTXt PNG chunk into { keyword, text }.
 */
export function decodeTextChunk(chunk) {
  const { type, data } = chunk;

  if (type === 'tEXt') {
    const nulIndex = data.indexOf(0);
    if (nulIndex === -1) return null;
    const keyword = data.toString('latin1', 0, nulIndex);
    const text = data.toString('latin1', nulIndex + 1);
    return { keyword, text };
  }

  if (type === 'zTXt') {
    const nulIndex = data.indexOf(0);
    if (nulIndex === -1 || nulIndex + 2 > data.length) return null;
    const keyword = data.toString('latin1', 0, nulIndex);
    const compressionMethod = data[nulIndex + 1];
    if (compressionMethod !== 0) return null;
    try {
      const inflated = zlib.inflateSync(data.subarray(nulIndex + 2));
      return { keyword, text: inflated.toString('utf8') };
    } catch {
      return null;
    }
  }

  if (type === 'iTXt') {
    const nulIndex = data.indexOf(0);
    if (nulIndex === -1 || nulIndex + 3 > data.length) return null;
    const keyword = data.toString('utf8', 0, nulIndex);
    const compressionFlag = data[nulIndex + 1];
    const compressionMethod = data[nulIndex + 2];

    let cursor = nulIndex + 3;
    const langEnd = data.indexOf(0, cursor);
    if (langEnd === -1) return null;
    cursor = langEnd + 1;

    const transEnd = data.indexOf(0, cursor);
    if (transEnd === -1) return null;
    cursor = transEnd + 1;

    const payload = data.subarray(cursor);
    if (compressionFlag === 1 && compressionMethod === 0) {
      try {
        const inflated = zlib.inflateSync(payload);
        return { keyword, text: inflated.toString('utf8') };
      } catch {
        return null;
      }
    }
    return { keyword, text: payload.toString('utf8') };
  }

  return null;
}

/**
 * Creates a tEXt chunk object { type: 'tEXt', data } for a keyword and string payload.
 */
export function createTextChunk(keyword, text) {
  const keyBuf = Buffer.from(keyword, 'latin1');
  const valBuf = Buffer.from(text, 'latin1');
  const data = Buffer.concat([keyBuf, Buffer.from([0]), valBuf]);
  return { type: 'tEXt', data };
}


function decodeBase64Json(base64Str) {
  try {
    const clean = String(base64Str || '').trim();
    const jsonText = Buffer.from(clean, 'base64').toString('utf8');
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

/**
 * Normalizes a V1 / V2 / V3 raw character object into a unified structure
 * while preserving 100% of fields and extensions.
 */
export function normalizeCardData(rawCard, filename = '') {
  const root = rawCard && typeof rawCard === 'object' ? rawCard : {};
  const data =
    root.data && typeof root.data === 'object' ? root.data : root;

  const isV3 =
    root.spec === 'chara_card_v3' ||
    String(root.spec_version || '').startsWith('3');

  const fallbackName = filename.replace(/\.(png|json)$/i, '');

  const name =
    String(data.name ?? root.name ?? fallbackName).trim() || fallbackName;
  const description = String(data.description ?? root.description ?? '');
  const personality = String(data.personality ?? root.personality ?? '');
  const scenario = String(data.scenario ?? root.scenario ?? '');
  const firstMes = String(data.first_mes ?? root.first_mes ?? '');
  const mesExample = String(data.mes_example ?? root.mes_example ?? '');

  const creatorNotes = String(
    data.creator_notes ??
      root.creatorcomment ??
      root.creator_notes ??
      data.creatorcomment ??
      '',
  );

  const systemPrompt = String(data.system_prompt ?? root.system_prompt ?? '');
  const postHistoryInstructions = String(
    data.post_history_instructions ?? root.post_history_instructions ?? '',
  );

  const alternateGreetings = Array.isArray(data.alternate_greetings)
    ? data.alternate_greetings.map((g) => String(g ?? ''))
    : Array.isArray(root.alternate_greetings)
      ? root.alternate_greetings.map((g) => String(g ?? ''))
      : [];

  const tags = Array.isArray(data.tags)
    ? data.tags.map((t) => String(t).trim()).filter(Boolean)
    : Array.isArray(root.tags)
      ? root.tags.map((t) => String(t).trim()).filter(Boolean)
      : [];

  const characterBook = data.character_book ?? root.character_book ?? null;

  const creator = String(data.creator ?? root.creator ?? '');
  const characterVersion = String(
    data.character_version ?? root.character_version ?? '1.0',
  );

  const extensions = {
    ...(typeof root.extensions === 'object' && root.extensions
      ? root.extensions
      : {}),
    ...(typeof data.extensions === 'object' && data.extensions
      ? data.extensions
      : {}),
  };

  const fav = Boolean(root.fav ?? data.fav ?? extensions.fav ?? false);
  if (fav) {
    extensions.fav = true;
  }

  const talkativeness =
    root.talkativeness ??
    data.talkativeness ??
    extensions.talkativeness ??
    '0.5';

  const chat = String(
    root.chat ?? data.chat ?? `${name} - ${new Date().toISOString()}`,
  );

  const createDate = String(
    root.create_date ?? data.create_date ?? new Date().toISOString(),
  );

  return {
    avatar: filename,
    name,
    description,
    personality,
    scenario,
    first_mes: firstMes,
    mes_example: mesExample,
    creatorcomment: creatorNotes,
    creator_notes: creatorNotes,
    system_prompt: systemPrompt,
    post_history_instructions: postHistoryInstructions,
    alternate_greetings: alternateGreetings,
    character_book: characterBook,
    tags,
    creator,
    character_version: characterVersion,
    extensions,
    fav,
    talkativeness: String(talkativeness),
    chat,
    create_date: createDate,
    spec: isV3 ? 'chara_card_v3' : 'chara_card_v2',
    spec_version: isV3 ? '3.0' : '2.0',
    group_only_greetings: Array.isArray(data.group_only_greetings)
      ? data.group_only_greetings.map((g) => String(g ?? ''))
      : Array.isArray(root.group_only_greetings)
        ? root.group_only_greetings.map((g) => String(g ?? ''))
        : [],
    nickname: String(data.nickname ?? root.nickname ?? ''),
  };
}

/**
 * Builds a SillyTavern-compatible Spec V2 / V3 payload object ready to be encoded into PNG chunks.
 */
export function serializeCardPayload(card, targetSpec = 'v2') {
  const normalized = normalizeCardData(card, card.avatar || '');
  const isV3 = targetSpec === 'v3';

  const dataBlock = {
    name: normalized.name,
    description: normalized.description,
    personality: normalized.personality,
    scenario: normalized.scenario,
    first_mes: normalized.first_mes,
    mes_example: normalized.mes_example,
    creator_notes: normalized.creator_notes,
    system_prompt: normalized.system_prompt,
    post_history_instructions: normalized.post_history_instructions,
    alternate_greetings: normalized.alternate_greetings,
    character_book: normalized.character_book,
    tags: normalized.tags,
    creator: normalized.creator,
    character_version: normalized.character_version,
    extensions: {
      ...normalized.extensions,
      fav: Boolean(normalized.fav),
      talkativeness: normalized.talkativeness,
    },
  };

  if (isV3) {
    dataBlock.group_only_greetings = normalized.group_only_greetings || [];
    if (normalized.nickname) {
      dataBlock.nickname = normalized.nickname;
    }
  }

  return {
    name: normalized.name,
    description: normalized.description,
    personality: normalized.personality,
    scenario: normalized.scenario,
    first_mes: normalized.first_mes,
    mes_example: normalized.mes_example,
    creatorcomment: normalized.creator_notes,
    avatar: 'none',
    chat: normalized.chat,
    talkativeness: normalized.talkativeness,
    fav: Boolean(normalized.fav),
    tags: normalized.tags,
    spec: isV3 ? 'chara_card_v3' : 'chara_card_v2',
    spec_version: isV3 ? '3.0' : '2.0',
    data: dataBlock,
    create_date: normalized.create_date,
  };
}

/**
 * Reads character metadata from a PNG buffer (`ccv3` preferred, fallback to `chara`).
 */
export function readCardFromPngBuffer(pngBuffer, filename = '') {
  const chunks = extractPngChunks(pngBuffer);
  let charaPayload = null;
  let ccv3Payload = null;

  for (const chunk of chunks) {
    if (chunk.type === 'tEXt' || chunk.type === 'zTXt' || chunk.type === 'iTXt') {
      const decoded = decodeTextChunk(chunk);
      if (!decoded) continue;
      const key = decoded.keyword.toLowerCase();
      if (key === 'ccv3') {
        ccv3Payload = decodeBase64Json(decoded.text);
      } else if (key === 'chara') {
        charaPayload = decodeBase64Json(decoded.text);
      }
    }
  }

  const chosen = ccv3Payload || charaPayload;
  if (!chosen) {
    return normalizeCardData({ name: filename.replace(/\.png$/i, '') }, filename);
  }

  const normalized = normalizeCardData(chosen, filename);
  if (ccv3Payload && charaPayload) {
    const v2Normalized = normalizeCardData(charaPayload, filename);
    if (
      normalized.alternate_greetings.length === 0 &&
      v2Normalized.alternate_greetings.length > 0
    ) {
      normalized.alternate_greetings = v2Normalized.alternate_greetings;
    }
    if (!normalized.first_mes && v2Normalized.first_mes) {
      normalized.first_mes = v2Normalized.first_mes;
    }
  }
  normalized.hasCcv3Chunk = Boolean(ccv3Payload);
  normalized.hasCharaChunk = Boolean(charaPayload);
  if (ccv3Payload) {
    normalized.spec = 'chara_card_v3';
    normalized.spec_version = '3.0';
  }
  return normalized;
}

/**
 * Writes character card metadata into a PNG buffer.
 * Writes `chara` (Spec v2) for universal compatibility and `ccv3` (Spec v3) when card uses v3 or writeV3 is true.
 */
export function writeCardToPngBuffer(pngBuffer, cardData, options = {}) {
  const chunks = extractPngChunks(pngBuffer);
  const filteredChunks = chunks.filter((chunk) => {
    if (chunk.type !== 'tEXt' && chunk.type !== 'zTXt' && chunk.type !== 'iTXt') {
      return true;
    }
    const decoded = decodeTextChunk(chunk);
    if (!decoded) return true;
    const key = decoded.keyword.toLowerCase();
    return key !== 'chara' && key !== 'ccv3';
  });

  const v2Payload = serializeCardPayload(cardData, 'v2');
  const v2Base64 = Buffer.from(JSON.stringify(v2Payload), 'utf8').toString('base64');
  const newTextChunks = [createTextChunk('chara', v2Base64)];

  const shouldWriteV3 =
    options.writeV3 ||
    cardData.spec === 'chara_card_v3' ||
    cardData.hasCcv3Chunk;

  if (shouldWriteV3) {
    const v3Payload = serializeCardPayload(cardData, 'v3');
    const v3Base64 = Buffer.from(JSON.stringify(v3Payload), 'utf8').toString('base64');
    newTextChunks.push(createTextChunk('ccv3', v3Base64));
  }

  const iendIndex = filteredChunks.findIndex((c) => c.type === 'IEND');
  if (iendIndex === -1) {
    filteredChunks.push(...newTextChunks, { type: 'IEND', data: Buffer.alloc(0) });
  } else {
    filteredChunks.splice(iendIndex, 0, ...newTextChunks);
  }

  return encodePngChunks(filteredChunks);
}

/**
 * Strips all metadata chunks (`tEXt`, `zTXt`, `iTXt`, `eXIf`, `tIME`) from a PNG buffer.
 */
export function stripPngMetadataChunks(pngBuffer) {
  const chunks = extractPngChunks(pngBuffer);
  const cleanChunks = chunks.filter(
    (c) =>
      c.type !== 'tEXt' &&
      c.type !== 'zTXt' &&
      c.type !== 'iTXt' &&
      c.type !== 'eXIf' &&
      c.type !== 'tIME',
  );
  return encodePngChunks(cleanChunks);
}

