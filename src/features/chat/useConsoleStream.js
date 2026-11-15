import { useState, useRef, useEffect, useCallback } from 'react';
import {
  streamConsoleLogs,
  clearConsoleLogsApi,
} from '@core/system/consoleApi.js';

const MAX_CLIENT_LOGS = 250;
const RECONNECT_DELAY_MS = 2200;

export function useConsoleStream() {
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);

  const latestSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let abortCtrl = null;
    let retryTimer = null;

    const connect = async () => {
      if (cancelled) return;
      abortCtrl = new AbortController();

      try {
        setConnected(true);
        await streamConsoleLogs({
          afterSeq: latestSeqRef.current,
          signal: abortCtrl.signal,
          onEvent: (evt) => {
            if (!evt || cancelled) return;

            if (evt.type === 'clear') {
              setEntries([]);
              return;
            }

            if (evt.type === 'snapshot' && Array.isArray(evt.entries)) {
              if (Number(evt.latestSeq) > latestSeqRef.current) {
                latestSeqRef.current = Number(evt.latestSeq);
              }
              if (evt.entries.length > 0) {
                setEntries((prev) => {
                  const seen = new Set(prev.map((x) => x.seq));
                  const merged = [...prev];
                  for (const item of evt.entries) {
                    if (item && !seen.has(item.seq)) {
                      merged.push(item);
                      if (item.seq > latestSeqRef.current) {
                        latestSeqRef.current = item.seq;
                      }
                    }
                  }
                  merged.sort((a, b) => a.seq - b.seq);
                  return merged.length > MAX_CLIENT_LOGS
                    ? merged.slice(merged.length - MAX_CLIENT_LOGS)
                    : merged;
                });
              }
              return;
            }

            if (evt.type === 'entry' && evt.entry) {
              const nextEntry = evt.entry;
              if (nextEntry.seq > latestSeqRef.current) {
                latestSeqRef.current = nextEntry.seq;
              }
              setEntries((prev) => {
                if (prev.some((x) => x.seq === nextEntry.seq)) return prev;
                const next = [...prev, nextEntry];
                return next.length > MAX_CLIENT_LOGS
                  ? next.slice(next.length - MAX_CLIENT_LOGS)
                  : next;
              });
            }
          },
        });
      } catch {
        // Reconnect below unless unmounted
      }

      if (!cancelled) {
        setConnected(false);
        retryTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (abortCtrl) abortCtrl.abort();
    };
  }, []);

  const clearLogs = useCallback(async () => {
    setEntries([]);
    try {
      await clearConsoleLogsApi();
    } catch {
      // ignore offline clear failure
    }
  }, []);

  return {
    entries,
    connected,
    clearLogs,
  };
}
