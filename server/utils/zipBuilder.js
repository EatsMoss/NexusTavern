import zlib from 'node:zlib';

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  if (typeof zlib.crc32 === 'function') {
    return zlib.crc32(buf) >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Builds a standard PKZIP archive Buffer from an array of `{ fileName, buffer, compress }`.
 * PNG files are already deflate-compressed, so `compress: false` (STORE, method 0) packs
 * them in sub-millisecond time; JSON files use raw DEFLATE (method 8).
 */
export function buildZipBuffer(entries = []) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = toDosDateTime(new Date());
  const usedNames = new Set();

  for (const item of entries) {
    if (!item || !item.buffer) continue;
    let safeName = String(item.fileName || 'card.bin').replace(/[\\/]+/g, '_');
    if (usedNames.has(safeName)) {
      const dotIdx = safeName.lastIndexOf('.');
      const stem = dotIdx > 0 ? safeName.slice(0, dotIdx) : safeName;
      const ext = dotIdx > 0 ? safeName.slice(dotIdx) : '';
      let counter = 2;
      while (usedNames.has(`${stem} (${counter})${ext}`)) counter += 1;
      safeName = `${stem} (${counter})${ext}`;
    }
    usedNames.add(safeName);

    const nameBuf = Buffer.from(safeName, 'utf8');
    const rawBuf = Buffer.isBuffer(item.buffer) ? item.buffer : Buffer.from(item.buffer);
    const crc = crc32(rawBuf);

    const useDeflate = Boolean(item.compress) && rawBuf.length > 64;
    const dataBuf = useDeflate ? zlib.deflateRawSync(rawBuf) : rawBuf;
    const method = useDeflate ? 8 : 0;
    // Bit 11 (0x0800) = UTF-8 filename flag
    const flags = 0x0800;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // Extra field length

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralDirBuffer = Buffer.concat(centralParts);
  const entryCount = centralParts.length / 2;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(entryCount, 8);
  eocd.writeUInt16LE(entryCount, 10);
  eocd.writeUInt32LE(centralDirBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localParts, centralDirBuffer, eocd]);
}

const MAX_EXTRACTED_ZIP_BYTES = 120 * 1024 * 1024;
const MAX_EXTRACTED_ZIP_FILES = 2000;

/**
 * Extracts files from a standard PKZIP archive Buffer (supports STORE=0 and DEFLATE=8).
 * Returns `Array<{ fileName: string, entryPath: string, buffer: Buffer }>`.
 */
export function extractZipEntries(zipBuffer) {
  const buf = Buffer.isBuffer(zipBuffer) ? zipBuffer : Buffer.from(zipBuffer || []);
  if (buf.length < 22) {
    throw new Error('Invalid or empty ZIP archive');
  }

  // Locate End of Central Directory (0x06054b50), scanning backwards up to 64 KB comment window
  let eocdOffset = -1;
  const minSearchOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minSearchOffset; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Corrupted ZIP archive (central directory not found)');
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buf.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  if (totalEntries > MAX_EXTRACTED_ZIP_FILES) {
    throw new Error(`ZIP archive contains too many files (max ${MAX_EXTRACTED_ZIP_FILES})`);
  }
  if (centralDirOffset + centralDirSize > buf.length) {
    throw new Error('Corrupted ZIP archive (truncated central directory)');
  }

  const entries = [];
  let ptr = centralDirOffset;
  let totalUnpackedBytes = 0;

  for (let idx = 0; idx < totalEntries; idx += 1) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== 0x02014b50) {
      break;
    }

    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const uncompressedSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);

    const rawEntryPath = buf
      .subarray(ptr + 46, ptr + 46 + nameLen)
      .toString('utf8')
      .replace(/\\/g, '/');

    ptr += 46 + nameLen + extraLen + commentLen;

    // Skip directories and macOS resource forks
    if (
      !rawEntryPath ||
      rawEntryPath.endsWith('/') ||
      rawEntryPath.startsWith('__MACOSX/') ||
      rawEntryPath.includes('/._')
    ) {
      continue;
    }

    const baseName = rawEntryPath.split('/').pop() || '';
    if (!baseName || baseName.startsWith('._')) continue;

    if (localHeaderOffset + 30 > buf.length || buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Corrupted local header in ZIP for "${baseName}"`);
    }

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > buf.length) {
      throw new Error(`Truncated compressed stream in ZIP for "${baseName}"`);
    }

    if (totalUnpackedBytes + uncompressedSize > MAX_EXTRACTED_ZIP_BYTES) {
      throw new Error('ZIP archive exceeds maximum unpacked size limit (120 MB)');
    }

    const slice = buf.subarray(dataStart, dataEnd);
    let fileBuffer;
    if (method === 0) {
      fileBuffer = Buffer.from(slice);
    } else if (method === 8) {
      fileBuffer = zlib.inflateRawSync(slice, {
        maxOutputLength: MAX_EXTRACTED_ZIP_BYTES - totalUnpackedBytes,
      });
    } else {
      throw new Error(`Unsupported ZIP compression method (${method}) for "${baseName}"`);
    }

    totalUnpackedBytes += fileBuffer.length;
    entries.push({
      fileName: baseName,
      entryPath: rawEntryPath,
      buffer: fileBuffer,
    });
  }

  return entries;
}
