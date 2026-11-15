import { estimateTokens } from './macroResolver.js';

const MAX_LOG_ENTRIES = 250;
const SENSITIVE_KEY_RE =
  /^(authorization|x-api-key|x-goog-api-key|api[_-]?key|proxy[_-]?password|secret|password|token)$/i;

const logBuffer = [];
let nextSeq = 1;
const subscribers = new Set();

const USE_COLOR = !process.env.NO_COLOR;
const ANSI = {
  reset: USE_COLOR ? '\x1b[0m' : '',
  bold: USE_COLOR ? '\x1b[1m' : '',
  dim: USE_COLOR ? '\x1b[2m' : '',
  cyan: USE_COLOR ? '\x1b[36m' : '',
  green: USE_COLOR ? '\x1b[32m' : '',
  yellow: USE_COLOR ? '\x1b[33m' : '',
  red: USE_COLOR ? '\x1b[31m' : '',
  magenta: USE_COLOR ? '\x1b[35m' : '',
  blue: USE_COLOR ? '\x1b[34m' : '',
  gray: USE_COLOR ? '\x1b[90m' : '',
};

export function maskSecretString(raw = '') {
  const str = String(raw || '').trim();
  if (!str) return '';
  if (str.toLowerCase().startsWith('bearer ')) {
    const token = str.slice(7).trim();
    return `Bearer ${maskSecretString(token)}`;
  }
  if (str.length <= 6) return '••••••';
  return `••••${str.slice(-4)}`;
}

export function maskUrlSecrets(rawUrl = '') {
  const str = String(rawUrl || '').trim();
  if (!str) return '';
  return str.replace(/([?&](?:key|api_key|apikey|token)=)([^&#]+)/gi, (_, prefix, val) => {
    const decoded = decodeURIComponent(val);
    return `${prefix}${maskSecretString(decoded)}`;
  });
}

function formatBase64Placeholder(b64 = '', mime = 'binary') {
  const approxBytes = Math.round((String(b64).length * 3) / 4);
  const kb = (approxBytes / 1024).toFixed(1);
  return `<base64 ${mime} • ${kb} KB>`;
}

/**
 * Deep-clones a request/response object while masking any secret headers/fields
 * and replacing multi-kilobyte base64 image payloads with readable placeholders.
 */
export function sanitizePayloadForLog(value, keyHint = '', depth = 0) {
  if (depth > 12) return '[Max Depth]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (keyHint && SENSITIVE_KEY_RE.test(keyHint)) {
      return maskSecretString(value);
    }
    const dataUriMatch = value.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);
    if (dataUriMatch && value.length > 256) {
      return formatBase64Placeholder(dataUriMatch[2], dataUriMatch[1]);
    }
    if (
      (keyHint === 'data' || keyHint === 'base64Data') &&
      value.length > 512 &&
      /^[A-Za-z0-9+/=\r\n]+$/.test(value.slice(0, 256))
    ) {
      return formatBase64Placeholder(value, 'inline-media');
    }
    return value;
  }

  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayloadForLog(item, '', depth + 1));
  }

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(k) && typeof v === 'string') {
      out[k] = maskSecretString(v);
    } else if (
      k === 'inlineData' &&
      v &&
      typeof v === 'object' &&
      typeof v.data === 'string'
    ) {
      out[k] = {
        mimeType: v.mimeType || 'image/*',
        data: formatBase64Placeholder(v.data, v.mimeType || 'image/*'),
      };
    } else if (
      k === 'source' &&
      v &&
      typeof v === 'object' &&
      v.type === 'base64' &&
      typeof v.data === 'string'
    ) {
      out[k] = {
        ...v,
        data: formatBase64Placeholder(v.data, v.media_type || 'image/*'),
      };
    } else {
      out[k] = sanitizePayloadForLog(v, k, depth + 1);
    }
  }
  return out;
}

/**
 * Extracts normalized readable turn blocks from OpenAI, Anthropic, or Gemini wire payloads.
 */
export function extractWireMessagesForLog(protocol, payload = {}) {
  if (!payload || typeof payload !== 'object') return [];
  const turns = [];

  if (protocol === 'anthropic') {
    if (payload.system) {
      const sysText =
        typeof payload.system === 'string'
          ? payload.system
          : Array.isArray(payload.system)
            ? payload.system.map((p) => p?.text || '').join('\n\n')
            : '';
      if (sysText) {
        turns.push({
          index: 0,
          role: 'system',
          content: sysText,
          tokens: estimateTokens(sysText),
          chars: sysText.length,
          images: 0,
        });
      }
    }
    const msgs = Array.isArray(payload.messages) ? payload.messages : [];
    for (const m of msgs) {
      let text = '';
      let images = 0;
      if (typeof m?.content === 'string') {
        text = m.content;
      } else if (Array.isArray(m?.content)) {
        const textParts = [];
        for (const part of m.content) {
          if (part?.type === 'text' && part.text) textParts.push(part.text);
          else if (part?.type === 'image') images += 1;
        }
        text = textParts.join('\n\n');
      }
      turns.push({
        index: turns.length,
        role: m?.role || 'user',
        content: text,
        tokens: estimateTokens(text),
        chars: text.length,
        images,
      });
    }
    return turns;
  }

  if (protocol === 'gemini') {
    const sysParts = payload.systemInstruction?.parts;
    if (Array.isArray(sysParts) && sysParts.length > 0) {
      const sysText = sysParts
        .map((p) => p?.text || '')
        .filter(Boolean)
        .join('\n\n');
      if (sysText) {
        turns.push({
          index: 0,
          role: 'system',
          content: sysText,
          tokens: estimateTokens(sysText),
          chars: sysText.length,
          images: 0,
        });
      }
    }
    const contents = Array.isArray(payload.contents) ? payload.contents : [];
    for (const c of contents) {
      const parts = Array.isArray(c?.parts) ? c.parts : [];
      const textParts = [];
      let images = 0;
      for (const p of parts) {
        if (typeof p?.text === 'string' && p.text) textParts.push(p.text);
        else if (p?.inlineData) images += 1;
      }
      const text = textParts.join('\n\n');
      turns.push({
        index: turns.length,
        role: c?.role === 'model' ? 'assistant' : 'user',
        wireRole: c?.role || 'user',
        content: text,
        tokens: estimateTokens(text),
        chars: text.length,
        images,
      });
    }
    return turns;
  }

  // OpenAI / Chat Completions
  const msgs = Array.isArray(payload.messages) ? payload.messages : [];
  for (const m of msgs) {
    let text = '';
    let images = 0;
    if (typeof m?.content === 'string') {
      text = m.content;
    } else if (Array.isArray(m?.content)) {
      const textParts = [];
      for (const part of m.content) {
        if (part?.type === 'text' && part.text) textParts.push(part.text);
        else if (part?.type === 'image_url') images += 1;
      }
      text = textParts.join('\n\n');
    }
    turns.push({
      index: turns.length,
      role: m?.role || 'user',
      ...(m?.name ? { name: m.name } : {}),
      content: text,
      tokens: estimateTokens(text),
      chars: text.length,
      images,
    });
  }
  return turns;
}

/**
 * Extracts active wire-level generation parameters without the messages array.
 */
export function extractWireSamplersForLog(payload = {}) {
  if (!payload || typeof payload !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'messages' || k === 'system' || k === 'contents' || k === 'systemInstruction') {
      continue;
    }
    out[k] = sanitizePayloadForLog(v, k);
  }
  return out;
}

function formatClockTime(isoString) {
  const d = new Date(isoString);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function getCategoryStyle(category, level) {
  if (level === 'error' || category === 'error') {
    return { tag: 'ERROR', color: ANSI.red };
  }
  if (category === 'prompt') {
    return { tag: 'PROMPT', color: ANSI.cyan };
  }
  if (category === 'output') {
    return { tag: 'OUTPUT', color: ANSI.green };
  }
  if (category === 'change') {
    return { tag: 'CHANGE', color: ANSI.magenta };
  }
  if (level === 'warn') {
    return { tag: 'WARN', color: ANSI.yellow };
  }
  return { tag: 'SYSTEM', color: ANSI.blue };
}

function indentMultiline(text = '', prefix = '  │ ') {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function printEntryToWindowsConsole(entry) {
  const timeStr = formatClockTime(entry.timestamp);
  const { tag, color } = getCategoryStyle(entry.category, entry.level);
  const divider = `${ANSI.gray}${'─'.repeat(74)}${ANSI.reset}`;
  const badgeText =
    Array.isArray(entry.badges) && entry.badges.length > 0
      ? ` ${ANSI.dim}[${entry.badges.map((b) => b.label).join(' • ')}]${ANSI.reset}`
      : '';

  if (entry.category === 'prompt' && entry.details) {
    const d = entry.details;
    const lines = [
      divider,
      `${ANSI.gray}[${timeStr}]${ANSI.reset} ${color}${ANSI.bold}[${tag}]${ANSI.reset} ${ANSI.bold}${entry.title}${ANSI.reset}${badgeText}`,
      `  ${ANSI.dim}Endpoint:${ANSI.reset} POST ${d.endpoint || '(resolved upstream)'} (${d.protocol || 'openai'})`,
      `  ${ANSI.dim}Context :${ANSI.reset} Character="${d.character || 'Character'}" • Persona="${d.user || 'User'}" • Preset="${d.presetName || 'Default'}"`,
      `  ${ANSI.dim}Samplers:${ANSI.reset} ${JSON.stringify(d.wireSamplers || {})}`,
    ];

    const msgs = Array.isArray(d.messages) ? d.messages : [];
    lines.push(
      `  ${ANSI.cyan}${ANSI.bold}Compiled Prompt Messages (${msgs.length} turns • ~${d.totalTokens || 0} tokens):${ANSI.reset}`,
    );
    for (const m of msgs) {
      const roleLabel = String(m.wireRole || m.role || 'user').toUpperCase();
      const nameSuffix = m.name ? ` (${m.name})` : '';
      const imgSuffix = m.images > 0 ? `, ${m.images} image(s)` : '';
      lines.push(
        `  ${ANSI.yellow}┌── #${m.index} [${roleLabel}${nameSuffix}] (~${m.tokens} tok, ${m.chars} chars${imgSuffix})${ANSI.reset}`,
      );
      lines.push(indentMultiline(m.content || '(empty)', `  ${ANSI.gray}│${ANSI.reset} `));
    }
    lines.push(divider);
    console.log(lines.join('\n'));
    return;
  }

  if (entry.category === 'output' && entry.details) {
    const d = entry.details;
    const lines = [
      divider,
      `${ANSI.gray}[${timeStr}]${ANSI.reset} ${color}${ANSI.bold}[${tag}]${ANSI.reset} ${ANSI.bold}${entry.title}${ANSI.reset}${badgeText}`,
      `  ${ANSI.dim}Metrics :${ANSI.reset} Status=${d.status || 'completed'} • Duration=${d.durationMs ?? 0}ms${
        d.ttftMs ? ` • TTFT=${d.ttftMs}ms` : ''
      } • Output=~${d.outputTokens ?? 0} tok${
        d.tokensPerSec ? ` (${d.tokensPerSec} tok/s)` : ''
      }${d.savedFile ? ` • File="${d.savedFile}"` : ''}`,
    ];
    if (d.fallbackInfo) {
      lines.push(
        `  ${ANSI.yellow}Fallback:${ANSI.reset} Redirected from ${d.fallbackInfo.fromModel || 'primary'} -> ${d.modelName}`,
      );
    }
    if (d.reasoning) {
      lines.push(
        `  ${ANSI.magenta}${ANSI.bold}┌── [CHAIN OF THOUGHT / REASONING] (~${d.reasoningTokens || estimateTokens(d.reasoning)} tok${
          d.reasoningDurationMs ? `, ${d.reasoningDurationMs}ms` : ''
        })${ANSI.reset}`,
      );
      lines.push(indentMultiline(d.reasoning, `  ${ANSI.gray}│${ANSI.reset} `));
    }
    lines.push(
      `  ${ANSI.green}${ANSI.bold}┌── [ASSISTANT RESPONSE] (~${d.responseTokens || estimateTokens(d.response || '')} tok)${ANSI.reset}`,
    );
    lines.push(indentMultiline(d.response || '(empty)', `  ${ANSI.gray}│${ANSI.reset} `));
    lines.push(divider);
    console.log(lines.join('\n'));
    return;
  }

  if ((entry.category === 'error' || entry.level === 'error') && entry.details) {
    const lines = [
      divider,
      `${ANSI.gray}[${timeStr}]${ANSI.reset} ${ANSI.red}${ANSI.bold}[ERROR]${ANSI.reset} ${ANSI.bold}${entry.title}${ANSI.reset}${badgeText}`,
    ];
    if (entry.summary) {
      lines.push(`  ${ANSI.red}${entry.summary}${ANSI.reset}`);
    }
    if (entry.details.errorBody || entry.details.meta) {
      const dump = sanitizePayloadForLog(entry.details.errorBody || entry.details.meta);
      lines.push(indentMultiline(JSON.stringify(dump, null, 2), `  ${ANSI.gray}│${ANSI.reset} `));
    }
    lines.push(divider);
    console.error(lines.join('\n'));
    return;
  }

  const scopePrefix = entry.scope ? `${ANSI.dim}${entry.scope}:${ANSI.reset} ` : '';
  const summaryPart = entry.summary ? ` — ${entry.summary}` : '';
  console.log(
    `${ANSI.gray}[${timeStr}]${ANSI.reset} ${color}${ANSI.bold}[${tag}]${ANSI.reset} ${scopePrefix}${entry.title}${summaryPart}${badgeText}`,
  );
}

/**
 * Records a structured log entry into the in-memory ring buffer, prints it to
 * the Windows console, and broadcasts it to all live UI console subscribers.
 */
export function recordConsoleLog({
  category = 'system',
  level = 'info',
  scope = 'System',
  title = '',
  summary = '',
  badges = [],
  details = null,
  silentTerminal = false,
} = {}) {
  const seq = nextSeq;
  nextSeq += 1;

  const entry = {
    id: `log_${seq}`,
    seq,
    timestamp: new Date().toISOString(),
    category,
    level,
    scope: String(scope || 'System'),
    title: String(title || 'Event'),
    summary: String(summary || ''),
    badges: Array.isArray(badges)
      ? badges
          .filter((b) => b && b.label)
          .map((b) => ({
            label: String(b.label),
            tone: b.tone || 'neutral',
          }))
      : [],
    details: details ? sanitizePayloadForLog(details) : null,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.splice(0, logBuffer.length - MAX_LOG_ENTRIES);
  }

  if (!silentTerminal) {
    try {
      printEntryToWindowsConsole(entry);
    } catch {
      // Never break request handling because of terminal encoding edge cases
    }
  }

  for (const listener of subscribers) {
    try {
      listener({ type: 'entry', entry });
    } catch {
      // ignore stale subscriber errors
    }
  }

  return entry;
}

export function getConsoleLogsSnapshot({ afterSeq = 0 } = {}) {
  const minSeq = Number(afterSeq) || 0;
  const entries = minSeq > 0 ? logBuffer.filter((e) => e.seq > minSeq) : [...logBuffer];
  return {
    entries,
    latestSeq: nextSeq - 1,
    totalBuffered: logBuffer.length,
  };
}

export function clearConsoleLogs() {
  logBuffer.length = 0;
  const clearedAt = new Date().toISOString();
  for (const listener of subscribers) {
    try {
      listener({ type: 'clear', clearedAt });
    } catch {
      // ignore
    }
  }
  return { clearedAt, latestSeq: nextSeq - 1 };
}

export function subscribeConsoleLogs(listener) {
  if (typeof listener !== 'function') return () => {};
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}



