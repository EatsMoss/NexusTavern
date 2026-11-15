export const CONSOLE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'prompt', label: 'Prompts' },
  { id: 'output', label: 'Outputs' },
  { id: 'change', label: 'Changes' },
  { id: 'system', label: 'System' },
  { id: 'error', label: 'Errors' },
];

export function resolveEntryCategoryMeta(entry) {
  const cat = entry?.category || 'system';
  const lvl = entry?.level || 'info';

  if (cat === 'error' || lvl === 'error') {
    return { key: 'error', badge: 'ERROR', icon: 'errorCircle' };
  }
  if (cat === 'prompt') {
    return { key: 'prompt', badge: 'PROMPT', icon: 'fileCode' };
  }
  if (cat === 'output') {
    return {
      key: 'output',
      badge: lvl === 'warn' ? 'STOPPED' : 'OUTPUT',
      icon: 'sparkles',
    };
  }
  if (cat === 'change') {
    return { key: 'change', badge: 'CHANGE', icon: 'edit' };
  }
  if (lvl === 'warn') {
    return { key: 'warn', badge: 'WARN', icon: 'warning' };
  }
  return { key: 'system', badge: 'SYSTEM', icon: 'info' };
}

export function formatConsoleTime(isoString) {
  if (!isoString) return '--:--:--';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function matchesConsoleFilter(entry, activeFilter = 'all') {
  if (!entry) return false;
  if (activeFilter === 'all') return true;
  if (activeFilter === 'error') {
    return entry.category === 'error' || entry.level === 'error' || entry.level === 'warn';
  }
  return entry.category === activeFilter;
}

export function matchesConsoleQuery(entry, rawQuery = '') {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return true;
  if (!entry) return false;

  const haystacks = [
    entry.title,
    entry.summary,
    entry.scope,
    entry.category,
    ...(Array.isArray(entry.badges) ? entry.badges.map((b) => b.label) : []),
  ];

  const d = entry.details;
  if (d) {
    haystacks.push(
      d.endpoint,
      d.connectionName,
      d.modelName,
      d.modelId,
      d.character,
      d.user,
      d.presetName,
      d.response,
      d.reasoning,
    );
    if (Array.isArray(d.messages)) {
      for (const m of d.messages) {
        haystacks.push(m.role, m.name, m.content);
      }
    }
    if (d.errorBody) {
      haystacks.push(JSON.stringify(d.errorBody));
    }
  }

  return haystacks.some((item) => item && String(item).toLowerCase().includes(q));
}

export function formatEntryForClipboard(entry) {
  if (!entry) return '';
  const timeStr = formatConsoleTime(entry.timestamp);
  const meta = resolveEntryCategoryMeta(entry);
  const badgeStr =
    Array.isArray(entry.badges) && entry.badges.length > 0
      ? ` [${entry.badges.map((b) => b.label).join(' • ')}]`
      : '';
  const lines = [
    '──────────────────────────────────────────────────────────────────────────',
    `[${timeStr}] [${meta.badge}] ${entry.scope ? `${entry.scope}: ` : ''}${entry.title}${badgeStr}`,
  ];

  if (entry.summary) {
    lines.push(`  Summary : ${entry.summary}`);
  }

  const d = entry.details;
  if (entry.category === 'prompt' && d) {
    lines.push(`  Endpoint: POST ${d.endpoint || ''} (${d.protocol || 'openai'})`);
    lines.push(
      `  Context : Character="${d.character || ''}" • Persona="${d.user || ''}" • Preset="${d.presetName || ''}"`,
    );
    lines.push(`  Samplers: ${JSON.stringify(d.wireSamplers || {})}`);
    const msgs = Array.isArray(d.messages) ? d.messages : [];
    lines.push(`  Messages (${msgs.length} turns • ~${d.totalTokens || 0} tok):`);
    for (const m of msgs) {
      const role = String(m.wireRole || m.role || 'user').toUpperCase();
      lines.push(`  ┌── #${m.index} [${role}] (~${m.tokens} tok, ${m.chars} chars)`);
      for (const ln of String(m.content || '').split(/\r?\n/)) {
        lines.push(`  │ ${ln}`);
      }
    }
  } else if (entry.category === 'output' && d) {
    lines.push(
      `  Metrics : Status=${d.status || 'completed'} • Duration=${d.durationMs ?? 0}ms${
        d.ttftMs ? ` • TTFT=${d.ttftMs}ms` : ''
      } • Output=~${d.outputTokens ?? 0} tok${d.tokensPerSec ? ` (${d.tokensPerSec} tok/s)` : ''}`,
    );
    if (d.reasoning) {
      lines.push(`  ┌── [CHAIN OF THOUGHT / REASONING]`);
      for (const ln of String(d.reasoning).split(/\r?\n/)) {
        lines.push(`  │ ${ln}`);
      }
    }
    lines.push(`  ┌── [ASSISTANT RESPONSE]`);
    for (const ln of String(d.response || '').split(/\r?\n/)) {
      lines.push(`  │ ${ln}`);
    }
  } else if (d && (d.errorBody || d.meta)) {
    lines.push(JSON.stringify(d.errorBody || d.meta, null, 2));
  }

  return lines.join('\n');
}

export async function copyConsoleText(text) {
  const str = String(text || '');
  if (!str) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(str);
      return true;
    } catch {
      // fallback below
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
