import { apiFetchJson, apiFetchSse } from '@core/api/apiClient.js';

export async function fetchConsoleLogs(afterSeq = 0) {
  const qs = afterSeq > 0 ? `?afterSeq=${encodeURIComponent(afterSeq)}` : '';
  return apiFetchJson(`/api/system/logs${qs}`);
}

export async function clearConsoleLogsApi() {
  return apiFetchJson('/api/system/logs/clear', {
    method: 'POST',
    body: {},
  });
}

export async function postClientConsoleLog(payload = {}) {
  return apiFetchJson('/api/system/logs/client', {
    method: 'POST',
    body: payload,
  });
}

export async function streamConsoleLogs({ afterSeq = 0, signal, onEvent } = {}) {
  return apiFetchSse('/api/system/logs/stream', {
    body: { afterSeq },
    signal,
    onEvent,
  });
}
