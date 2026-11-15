import { apiFetchJson, apiFetchSse } from '@core/api/apiClient.js';

export async function fetchApiHubState() {
  return apiFetchJson('/api/hub/state');
}

export async function selectApiHubModel(connectionId, modelId = null) {
  return apiFetchJson('/api/hub/select', {
    method: 'POST',
    body: { connectionId, modelId },
  });
}

export async function createApiHubConnection(payload) {
  return apiFetchJson('/api/hub/connections', {
    method: 'POST',
    body: payload,
  });
}

export async function patchApiHubConnection(connectionId, patch) {
  return apiFetchJson(`/api/hub/connections/${encodeURIComponent(connectionId)}`, {
    method: 'PATCH',
    body: patch,
  });
}

export async function deleteApiHubConnection(connectionId) {
  return apiFetchJson(`/api/hub/connections/${encodeURIComponent(connectionId)}`, {
    method: 'DELETE',
  });
}

export async function fetchConnectionModelsLive(connectionId, pendingPatch = {}) {
  return apiFetchJson(`/api/hub/connections/${encodeURIComponent(connectionId)}/fetch-models`, {
    method: 'POST',
    body: pendingPatch,
  });
}

export async function revealApiHubConnectionKey(connectionId, keyId = '') {
  return apiFetchJson(`/api/hub/connections/${encodeURIComponent(connectionId)}/reveal-key`, {
    method: 'POST',
    body: { keyId },
  });
}

export async function pingApiHubConnections() {
  return apiFetchJson('/api/hub/ping', { method: 'POST' });
}

export async function fetchConnectionTelemetry(connectionId) {
  return apiFetchJson(`/api/hub/connections/${encodeURIComponent(connectionId)}/telemetry`, {
    method: 'POST',
  });
}

export async function addApiHubCustomFamily(payload) {
  return apiFetchJson('/api/hub/custom-families', {
    method: 'POST',
    body: payload,
  });
}

export async function deleteApiHubCustomFamily(familyId) {
  return apiFetchJson(`/api/hub/custom-families/${encodeURIComponent(familyId)}`, {
    method: 'DELETE',
  });
}

export async function compilePromptDryRun(payload = {}) {
  return apiFetchJson('/api/hub/dry-run', {
    method: 'POST',
    body: payload,
  });
}

export async function streamApiHubGeneration(payload = {}, { signal, onEvent } = {}) {
  return apiFetchSse('/api/hub/generate', {
    body: payload,
    signal,
    onEvent,
  });
}

export async function stopApiHubGeneration(requestId = '') {
  return apiFetchJson('/api/hub/stop', {
    method: 'POST',
    body: requestId ? { requestId } : {},
  });
}

// Legacy aliases kept until UI transition finishes
export const patchApiHubProvider = patchApiHubConnection;
export const fetchProviderModelsLive = fetchConnectionModelsLive;
export const createCustomApiHubProvider = createApiHubConnection;
export const removeCustomApiHubProvider = deleteApiHubConnection;
