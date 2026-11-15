import { apiFetchJson } from '@core/api/apiClient.js';

export async function fetchMessageRecapState() {
  return apiFetchJson('/api/message-recap');
}

export async function updateMessageRecapState(patch = {}) {
  return apiFetchJson('/api/message-recap', {
    method: 'PUT',
    body: patch,
  });
}

export async function resetMessageRecapState({ enabled } = {}) {
  return apiFetchJson('/api/message-recap/reset', {
    method: 'POST',
    body: typeof enabled === 'boolean' ? { enabled } : {},
  });
}
