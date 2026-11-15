export function estimateTokens(text) {
  const s = String(text || '');
  if (!s) return 0;
  return Math.max(1, Math.ceil(s.length / 3.8));
}

export function stripReasoningFromHistoryText(rawText = '') {
  if (!rawText) return '';
  return String(rawText)
    .replace(/<(?:think|thinking|reasoning|thought)>[\s\S]*?<\/(?:think|thinking|reasoning|thought)>/gi, '')
    .trim();
}

function rollDiceExpression(expr = 'd20') {
  const clean = String(expr || 'd20').trim().toLowerCase();
  const match = clean.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) {
    const n = Number.parseInt(clean, 10);
    return Number.isFinite(n) && n > 0 ? String(Math.floor(Math.random() * n) + 1) : '1';
  }
  const count = Math.min(100, Math.max(1, Number.parseInt(match[1] || '1', 10)));
  const sides = Math.max(1, Number.parseInt(match[2], 10));
  const mod = match[3] ? Number.parseInt(match[3], 10) : 0;
  let total = mod;
  for (let i = 0; i < count; i += 1) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return String(total);
}

export function resolveMacros(input, ctx = {}) {
  if (input === null || input === undefined) return '';
  let text = String(input);
  if (!text.includes('{{') && !text.includes('<USER>') && !text.includes('<BOT>')) {
    return text;
  }

  const charName = String(ctx.charName || 'Character');
  const userName = String(ctx.userName || 'User');
  const vars = ctx.variables instanceof Map ? ctx.variables : new Map();
  const now = ctx.now instanceof Date ? ctx.now : new Date();

  const weekdayNames = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
  ];
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const isoDate = now.toISOString().slice(0, 10);
  const isoTime = now.toISOString().slice(11, 19);

  for (let pass = 0; pass < 3; pass += 1) {
    if (!text.includes('{{') && !text.includes('<USER>') && !text.includes('<BOT>')) break;
    const prev = text;

    text = text.replace(/\{\{\/\/[\s\S]*?\}\}/g, '');

    text = text.replace(/\{\{setvar::([^:}]+)::([\s\S]*?)\}\}/gi, (_m, k, v) => {
      vars.set(String(k).trim(), String(v));
      return '';
    });
    text = text.replace(/\{\{addvar::([^:}]+)::([\s\S]*?)\}\}/gi, (_m, k, v) => {
      const key = String(k).trim();
      const cur = Number.parseFloat(vars.get(key) ?? '0');
      const add = Number.parseFloat(v);
      vars.set(key, Number.isFinite(cur) && Number.isFinite(add) ? String(cur + add) : `${vars.get(key) || ''}${v}`);
      return '';
    });
    text = text.replace(/\{\{getvar::([^}]+)\}\}/gi, (_m, k) => String(vars.get(String(k).trim()) ?? ''));

    text = text.replace(/\{\{(?:random|pick)::([\s\S]*?)\}\}/gi, (_m, listRaw) => {
      const parts = String(listRaw).split('::').filter((x) => x.length > 0);
      return parts.length > 0 ? parts[Math.floor(Math.random() * parts.length)] : '';
    });
    text = text.replace(/\{\{(?:random|pick):([^}]+)\}\}/gi, (_m, listRaw) => {
      const parts = String(listRaw)
        .split(/(?<!\\),/)
        .map((s) => s.replace(/\\,/g, ',').trim())
        .filter((x) => x.length > 0);
      return parts.length > 0 ? parts[Math.floor(Math.random() * parts.length)] : '';
    });
    text = text.replace(/\{\{roll:([^}]+)\}\}/gi, (_m, expr) => rollDiceExpression(expr));

    const map = {
      char: charName,
      user: userName,
      charifnotgroup: charName,
      group: ctx.groupName || charName,
      original: String(ctx.original ?? ''),
      model: String(ctx.modelId || ''),
      persona: String(ctx.personaDescription || ''),
      description: String(ctx.charDescription || ''),
      personality: String(ctx.charPersonality || ''),
      scenario: String(ctx.charScenario || ''),
      mesexamples: String(ctx.mesExamplesRaw || ''),
      charprompt: String(ctx.charSystemPrompt || ''),
      charinstruction: String(ctx.charPostHistory || ''),
      lastmessage: String(ctx.lastMessage || ''),
      lastusermessage: String(ctx.lastUserMessage || ''),
      lastcharmessage: String(ctx.lastCharMessage || ''),
      time: timeStr,
      date: dateStr,
      weekday: weekdayNames[now.getDay()],
      isodate: isoDate,
      isotime: isoTime,
      newline: '\n',
      noop: '',
    };

    text = text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (full, rawKey) => {
      const lower = rawKey.toLowerCase();
      if (lower === 'trim') return '{{trim}}';
      return Object.prototype.hasOwnProperty.call(map, lower) ? map[lower] : full;
    });

    text = text.replace(/<USER>/gi, userName).replace(/<BOT>/gi, charName);
    if (text === prev) break;
  }

  if (text.includes('{{trim}}')) {
    text = text.replace(/\s*\{\{trim\}\}\s*/gi, '');
  }
  return text;
}

export function parseMesExampleBlocks(rawExamples = '', ctx = {}) {
  const expanded = resolveMacros(rawExamples, ctx).trim();
  if (!expanded) return [];

  const blocks = expanded
    .split(/<START>/i)
    .map((b) => b.trim())
    .filter(Boolean);

  const charName = String(ctx.charName || 'Character');
  const userName = String(ctx.userName || 'User');
  const newExampleHeader = String(ctx.newExampleChatPrompt ?? '[Example Chat]').trim();
  const out = [];

  const userEsc = userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const charEsc = charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const speakerRegex = new RegExp(`^(${userEsc}|${charEsc}|user|assistant):\\s*(.*)$`, 'i');

  for (let bIdx = 0; bIdx < blocks.length; bIdx += 1) {
    if (newExampleHeader) {
      out.push({
        role: 'system',
        content: newExampleHeader,
        source: 'dialogueExamples',
        label: `Example Chat #${bIdx + 1} Header`,
      });
    }

    const lines = blocks[bIdx].split(/\r?\n/);
    let current = null;

    for (const line of lines) {
      const m = line.match(speakerRegex);
      if (m) {
        if (current && current.content.trim()) out.push(current);
        const speaker = m[1].toLowerCase();
        const isUser = speaker === userName.toLowerCase() || speaker === 'user';
        current = {
          role: 'system',
          name: isUser ? 'example_user' : 'example_assistant',
          content: m[2] || '',
          source: 'dialogueExamples',
          label: isUser ? `Example (${userName})` : `Example (${charName})`,
        };
      } else if (current) {
        current.content = `${current.content}\n${line}`;
      } else if (line.trim()) {
        current = {
          role: 'system',
          content: line,
          source: 'dialogueExamples',
          label: `Example Note #${bIdx + 1}`,
        };
      }
    }
    if (current && current.content.trim()) out.push(current);
  }

  return out;
}
