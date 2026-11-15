import { useState, useRef, useCallback } from 'react';

export const DEFAULT_DURATION_BY_VARIANT = {
  error: 5400,
  warning: 4600,
  success: 3200,
  info: 3400,
};

export const DEFAULT_ICON_BY_VARIANT = {
  error: 'errorCircle',
  warning: 'warning',
  success: 'check',
  info: 'info',
};

const MAX_VISIBLE_TOASTS = 3;

const ACTION_FAILURE_RE =
  /^(Save As failed|Save failed|Import failed|Export failed|ZIP export failed|Rename failed|Duplicate failed|Delete failed|Bulk delete failed|Upload error|Switch failed|Remove failed|Create group failed|Tunnel error|Error)\s*:\s*(.+)$/i;

/**
 * Condenses verbose upstream LLM / HTTP / filesystem error strings into a clean
 * M3 structured payload (`{ badge, title, message, fullText }`).
 */
export function parseSmartNotification(input = '') {
  if (input && typeof input === 'object') {
    const rawMsg = String(input.message || input.raw || '').trim();
    const parsedFromRaw = rawMsg
      ? parseSmartNotification(rawMsg)
      : { badge: '', title: '', message: '', fullText: '' };
    return {
      badge: input.badge ?? parsedFromRaw.badge,
      title: input.title ?? parsedFromRaw.title,
      message:
        input.title || input.badge
          ? rawMsg || parsedFromRaw.message
          : parsedFromRaw.message,
      fullText: input.fullText || rawMsg || parsedFromRaw.fullText,
    };
  }

  const fullText = String(input || '').replace(/\s+/g, ' ').trim();
  if (!fullText) {
    return { badge: '', title: '', message: '', fullText: '' };
  }

  let working = fullText;
  let badge = '';
  let title = '';

  const refusalMatch = working.match(/^Refusal Catcher\s*:\s*(.+)$/i);
  const emptyRespMatch = !refusalMatch
    ? working.match(/^Empty Response\s*:\s*(.+)$/i)
    : null;
  const providerOfflineMatch =
    !refusalMatch && !emptyRespMatch
      ? working.match(
          /^([^():]{2,48})\s*:\s*(Proxy is unavailable,\s*please try again later\.?)$/i,
        )
      : null;
  if (refusalMatch) {
    badge = 'REFUSAL CATCHER';
    working = refusalMatch[1].trim();
  } else if (emptyRespMatch) {
    badge = 'EMPTY RESPONSE';
    working = emptyRespMatch[1].trim();
  } else if (providerOfflineMatch) {
    badge = `${providerOfflineMatch[1].trim()} • OFFLINE`;
    working = providerOfflineMatch[2].trim();
  } else {
    const providerHttpMatch = working.match(/^([^():]{2,48})\s*\((\d{3})\)\s*:\s*(.+)$/);
    if (providerHttpMatch) {
      badge = `${providerHttpMatch[1].trim()} • ${providerHttpMatch[2]}`;
      working = providerHttpMatch[3].trim();
    } else {
      const bareHttpMatch = working.match(/^HTTP\s*(\d{3})\s*[:\-–]?\s*(.*)$/i);
      if (bareHttpMatch) {
        badge = `HTTP ${bareHttpMatch[1]}`;
        working = bareHttpMatch[2].trim() || `Request failed (${bareHttpMatch[1]})`;
      }
    }
  }

  const jsonStart = working.indexOf('{');
  if (jsonStart !== -1 && working.endsWith('}')) {
    try {
      const parsedJson = JSON.parse(working.slice(jsonStart));
      const extracted =
        parsedJson?.error?.message ||
        (typeof parsedJson?.error === 'string' ? parsedJson.error : '') ||
        parsedJson?.message ||
        parsedJson?.detail;
      if (extracted && typeof extracted === 'string') {
        const prefix = working.slice(0, jsonStart).replace(/[:\-–\s]+$/, '').trim();
        working = prefix ? `${prefix}: ${extracted.trim()}` : extracted.trim();
      }
    } catch {
      // Keep plain text when JSON fragment is not valid JSON
    }
  }

  if (!badge) {
    const prefixMatch = working.match(ACTION_FAILURE_RE);
    if (prefixMatch) {
      const rawPrefix = prefixMatch[1].trim();
      title = /^error$/i.test(rawPrefix) ? '' : rawPrefix;
      working = prefixMatch[2].trim();
    }
  }

  return { badge, title, message: working, fullText };
}

/**
 * Reusable notification queue hook with smart error condensation and deduplication.
 */
export function useToastQueue({ maxVisible = MAX_VISIBLE_TOASTS } = {}) {
  const [toasts, setToasts] = useState([]);
  const seqRef = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const pushToast = useCallback(
    (payload) => {
      if (!payload) return null;
      const obj = typeof payload === 'string' ? { message: payload, variant: 'info' } : payload;
      const rawVariant = obj.variant || obj.tone || 'info';
      const variant = DEFAULT_DURATION_BY_VARIANT[rawVariant] ? rawVariant : 'info';
      const parsed = parseSmartNotification(obj);
      if (!parsed.message && !parsed.title) return null;

      const dedupeKey =
        obj.dedupeKey || `${variant}::${parsed.badge}::${parsed.title}::${parsed.message}`;

      let resolvedId = null;
      setToasts((prev) => {
        const existingIdx = prev.findIndex((t) => t.dedupeKey === dedupeKey);
        if (existingIdx !== -1) {
          const existing = prev[existingIdx];
          resolvedId = existing.id;
          const updated = {
            ...existing,
            icon: obj.icon || existing.icon,
            badge: parsed.badge,
            title: parsed.title,
            message: parsed.message,
            fullText: parsed.fullText,
            durationMs: obj.durationMs ?? existing.durationMs,
            actionLabel: obj.actionLabel ?? existing.actionLabel,
            actionIcon: obj.actionIcon ?? existing.actionIcon,
            onAction: obj.onAction ?? existing.onAction,
            count: (existing.count || 1) + 1,
            resetToken: (existing.resetToken || 0) + 1,
          };
          const next = [...prev];
          next.splice(existingIdx, 1);
          return [updated, ...next].slice(0, maxVisible);
        }

        seqRef.current += 1;
        resolvedId = `toast_${Date.now()}_${seqRef.current}`;
        return [
          {
            id: resolvedId,
            dedupeKey,
            variant,
            icon: obj.icon || '',
            badge: parsed.badge,
            title: parsed.title,
            message: parsed.message,
            fullText: parsed.fullText,
            durationMs: obj.durationMs,
            actionLabel: obj.actionLabel || '',
            actionIcon: obj.actionIcon || '',
            onAction: obj.onAction || null,
            count: 1,
            resetToken: 0,
          },
          ...prev,
        ].slice(0, maxVisible);
      });

      return resolvedId;
    },
    [maxVisible],
  );

  return { toasts, pushToast, dismissToast, clearToasts };
}
