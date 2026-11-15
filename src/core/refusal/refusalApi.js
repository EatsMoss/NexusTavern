import { apiFetchJson } from '@core/api/apiClient.js';

export async function fetchRefusalCatcherState() {
  return apiFetchJson('/api/refusal-catcher');
}

export async function updateRefusalCatcherState(patch = {}) {
  return apiFetchJson('/api/refusal-catcher', {
    method: 'PUT',
    body: patch,
  });
}

export async function addRefusalBannedPhrase(phrase) {
  return apiFetchJson('/api/refusal-catcher/phrases', {
    method: 'POST',
    body: { phrase },
  });
}

export async function removeRefusalBannedPhrase(phrase) {
  return apiFetchJson('/api/refusal-catcher/phrases', {
    method: 'DELETE',
    body: { phrase },
  });
}
