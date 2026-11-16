import { apiFetchJson } from '@core/api/apiClient.js';

export async function fetchStImporterState() {
  return apiFetchJson('/api/st-import/state');
}

export async function clearStImporterState() {
  return apiFetchJson('/api/st-import/state', {
    method: 'DELETE',
  });
}

export async function browseStDirectory(initialPath = '', { signal } = {}) {
  return apiFetchJson('/api/st-import/browse', {
    method: 'POST',
    body: { initialPath },
    signal,
  });
}

export async function scanStDirectoryApi({ rootPath = '', profile = '' } = {}) {
  return apiFetchJson('/api/st-import/scan', {
    method: 'POST',
    body: { rootPath, profile },
  });
}

export async function startStImportApi({
  rootPath = '',
  profile = '',
  categories = {},
  conflictMode = 'skip',
} = {}) {
  return apiFetchJson('/api/st-import/start', {
    method: 'POST',
    body: {
      rootPath,
      profile,
      categories,
      conflictMode,
    },
  });
}

export async function fetchStImportJobApi() {
  return apiFetchJson('/api/st-import/job');
}

export async function cancelStImportApi() {
  return apiFetchJson('/api/st-import/cancel', {
    method: 'POST',
  });
}
