import React, { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetchJson, initMobileE2EEKeyFromUrl } from '@core/api/apiClient.js';
import { AppShell } from '@app/AppShell/AppShell.jsx';

const STATUS_POLL_INTERVAL_MS = 5000;

function computeStatusSignature(data) {
  if (!data || typeof data !== 'object') return '';
  const { timestamp: _ignoredTimestamp, ...meaningful } = data;
  try {
    return JSON.stringify(meaningful);
  } catch {
    return '';
  }
}

export function App() {
  const [status, setStatus] = useState(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const lastStatusSigRef = useRef('');
  const latestStateRef = useRef({ status: null, tunnelBusy: false });
  latestStateRef.current = { status, tunnelBusy };

  const applyNextStatus = useCallback((nextData) => {
    if (!nextData) return;
    const nextSig = computeStatusSignature(nextData);
    if (nextSig && nextSig === lastStatusSigRef.current) {
      return;
    }
    lastStatusSigRef.current = nextSig;
    setStatus(nextData);
  }, []);

  const fetchServerStatus = useCallback(async () => {
    try {
      initMobileE2EEKeyFromUrl();
      const data = await apiFetchJson('/api/system/status');
      applyNextStatus(data);
    } catch (_err) {
      // Keep previous status if polling fails transiently
    }
  }, [applyNextStatus]);

  useEffect(() => {
    fetchServerStatus();

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      fetchServerStatus();
    }, STATUS_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchServerStatus();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [fetchServerStatus]);

  const handleToggleTunnel = useCallback(
    async (rotateToken = false) => {
      const { status: curStatus, tunnelBusy: curBusy } = latestStateRef.current;
      if (curBusy) return undefined;
      setTunnelBusy(true);
      try {
        const isStopping = curStatus?.tunnel?.active && !rotateToken;
        const endpoint = isStopping
          ? '/api/system/tunnel/stop'
          : '/api/system/tunnel/start';
        const data = await apiFetchJson(endpoint, {
          method: 'POST',
          body: { rotateToken },
        });
        if (data.tunnel) {
          setStatus((prev) => {
            const merged = prev ? { ...prev, tunnel: data.tunnel } : prev;
            lastStatusSigRef.current = computeStatusSignature(merged);
            return merged;
          });
        } else {
          await fetchServerStatus();
        }
        return { ok: true, isStopping, rotateToken, tunnel: data.tunnel };
      } finally {
        setTunnelBusy(false);
      }
    },
    [fetchServerStatus],
  );

  return (
    <AppShell
      serverStatus={status}
      onToggleTunnel={handleToggleTunnel}
      tunnelBusy={tunnelBusy}
      onRefreshStatus={fetchServerStatus}
    />
  );
}

