import React, { useEffect, useState, useCallback } from 'react';
import { apiFetchJson, initMobileE2EEKeyFromUrl } from '@core/api/apiClient.js';
import { AppShell } from '@ui/index.js';

export function App() {
  const [status, setStatus] = useState(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);

  const fetchServerStatus = useCallback(async () => {
    try {
      initMobileE2EEKeyFromUrl();
      const data = await apiFetchJson('/api/system/status');
      setStatus(data);
    } catch (_err) {
      // Keep previous status if polling fails transiently
    }
  }, []);

  useEffect(() => {
    fetchServerStatus();
    const timer = setInterval(fetchServerStatus, 5000);
    return () => clearInterval(timer);
  }, [fetchServerStatus]);

  const handleToggleTunnel = async (rotateToken = false) => {
    if (tunnelBusy) return;
    setTunnelBusy(true);
    try {
      const isStopping = status?.tunnel?.active && !rotateToken;
      const endpoint = isStopping
        ? '/api/system/tunnel/stop'
        : '/api/system/tunnel/start';
      const data = await apiFetchJson(endpoint, {
        method: 'POST',
        body: { rotateToken },
      });
      if (data.tunnel) {
        setStatus((prev) => (prev ? { ...prev, tunnel: data.tunnel } : prev));
      } else {
        await fetchServerStatus();
      }
      return { ok: true, isStopping, rotateToken, tunnel: data.tunnel };
    } finally {
      setTunnelBusy(false);
    }
  };


  return (
    <AppShell
      serverStatus={status}
      onToggleTunnel={handleToggleTunnel}
      tunnelBusy={tunnelBusy}
      onRefreshStatus={fetchServerStatus}
    />
  );
}

