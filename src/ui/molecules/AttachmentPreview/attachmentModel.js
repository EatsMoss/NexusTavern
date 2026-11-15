/**
 * Pure utilities for normalizing file/image attachments, generating previews,
 * reading text snippets, and formatting human-readable file metadata.
 */

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'yaml', 'yml', 'xml', 'csv', 'tsv',
  'log', 'ini', 'cfg', 'conf', 'env', 'toml', 'sql', 'sh', 'bash', 'bat', 'ps1',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'php', 'java', 'c', 'cpp',
  'h', 'hpp', 'cs', 'go', 'rs', 'lua', 'swift', 'kt', 'css', 'scss', 'html', 'htm',
  'svg',
]);

const CODE_EXTENSIONS = new Set([
  'json', 'jsonl', 'yaml', 'yml', 'xml', 'toml', 'sql', 'sh', 'bash', 'bat', 'ps1',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'php', 'java', 'c', 'cpp',
  'h', 'hpp', 'cs', 'go', 'rs', 'lua', 'swift', 'kt', 'css', 'scss', 'html', 'htm',
]);

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg',
]);

const MAX_TEXT_PREVIEW_BYTES = 512 * 1024; // 512 KB safe in-memory text preview cap

export function getFileExtension(name = '') {
  const clean = String(name || '').split('?')[0].split('#')[0].trim();
  const dotIdx = clean.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === clean.length - 1) return '';
  return clean.slice(dotIdx + 1).toLowerCase();
}

export function formatFileSize(bytes) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num < 0) return '';
  if (num < 1024) return `${Math.round(num)} B`;
  const kb = num / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
}

export function isTextReadableFile(name = '', mimeType = '') {
  const mime = String(mimeType || '').toLowerCase();
  const ext = getFileExtension(name);
  if (mime === 'image/svg+xml' || ext === 'svg') return false;
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/ld+json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/x-yaml'
  ) {
    return true;
  }
  return TEXT_EXTENSIONS.has(ext);
}

export function inferAttachmentKind({ name = '', mimeType = '', type = '' } = {}) {
  const explicit = String(type || '').toLowerCase();
  if (explicit === 'image') return 'image';
  const mime = String(mimeType || '').toLowerCase();
  const ext = getFileExtension(name);

  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (isTextReadableFile(name, mime)) return 'text';
  return 'file';
}

export function resolveAttachmentIcon(kind = 'file') {
  if (kind === 'image') return 'image';
  if (kind === 'code') return 'fileCode';
  return 'file';
}

function normalizePastedFileName(file) {
  const rawName = String(file?.name || '').trim();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  if (!rawName || /^image\.(png|jpe?g|webp|gif)$/i.test(rawName)) {
    const ext = getFileExtension(rawName) || (file?.type?.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '');
    return `Pasted_Image_${stamp}.${ext || 'png'}`;
  }
  return rawName;
}

function readTextPreviewSafe(file) {
  return new Promise((resolve) => {
    try {
      const slice = file.size > MAX_TEXT_PREVIEW_BYTES ? file.slice(0, MAX_TEXT_PREVIEW_BYTES) : file;
      const reader = new FileReader();
      reader.onerror = () => resolve({ text: '', truncated: false });
      reader.onload = () => {
        resolve({
          text: String(reader.result ?? ''),
          truncated: file.size > MAX_TEXT_PREVIEW_BYTES,
        });
      };
      reader.readAsText(slice, 'utf-8');
    } catch {
      resolve({ text: '', truncated: false });
    }
  });
}

let draftSeq = 0;

export async function createAttachmentDraft(file) {
  if (!file) return null;
  draftSeq += 1;
  const id = `att_${Date.now()}_${draftSeq}`;
  const name = normalizePastedFileName(file);
  const mimeType = file.type || 'application/octet-stream';
  const ext = getFileExtension(name);
  const kind = inferAttachmentKind({ name, mimeType });
  const previewUrl =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(file)
      : '';

  let textContent = null;
  let textTruncated = false;
  if (kind === 'text' || kind === 'code') {
    const res = await readTextPreviewSafe(file);
    textContent = res.text;
    textTruncated = res.truncated;
  }

  return {
    id,
    file,
    name,
    size: Number(file.size || 0),
    mimeType,
    ext,
    kind,
    url: previewUrl,
    previewUrl: kind === 'image' ? previewUrl : '',
    isBlobUrl: Boolean(previewUrl),
    textContent,
    textTruncated,
  };
}

export function revokeAttachmentDraft(item) {
  if (!item || !item.isBlobUrl || !item.url) return;
  try {
    URL.revokeObjectURL(item.url);
  } catch {
    // ignore revoke errors
  }
}
