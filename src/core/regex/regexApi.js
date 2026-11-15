import { apiFetchJson } from '@core/api/apiClient.js';

/**
 * Client API client for NexusTavern Regex Engine (`/api/regex`).
 */

export async function fetchRegexWorkspace({ cardAvatar = '', presetName = '' } = {}) {
  const params = new URLSearchParams();
  if (cardAvatar) params.set('cardAvatar', cardAvatar);
  if (presetName) params.set('presetName', presetName);
  const qs = params.toString();
  return apiFetchJson(`/api/regex${qs ? `?${qs}` : ''}`);
}

export async function saveRegexScopeScripts({
  scope = 'global',
  targetId = '',
  scripts = [],
  masterEnabled,
} = {}) {
  return apiFetchJson('/api/regex/scripts', {
    method: 'PUT',
    body: {
      scope,
      targetId,
      scripts,
      ...(typeof masterEnabled === 'boolean' ? { masterEnabled } : {}),
    },
  });
}

export async function patchRegexMasterSwitch(masterEnabled) {
  return apiFetchJson('/api/regex/master', {
    method: 'PATCH',
    body: { masterEnabled: Boolean(masterEnabled) },
  });
}

export async function saveRegexFoldersMeta({ scopeKey, folders = [], assignments = {} } = {}) {
  return apiFetchJson('/api/regex/folders', {
    method: 'PUT',
    body: { scopeKey, folders, assignments },
  });
}

export async function transferRegexScriptBetweenScopes({
  fromScope,
  fromTargetId = '',
  toScope,
  toTargetId = '',
  scriptId,
  mode = 'move', // 'move' | 'copy'
} = {}) {
  return apiFetchJson('/api/regex/transfer', {
    method: 'POST',
    body: {
      fromScope,
      fromTargetId,
      toScope,
      toTargetId,
      scriptId,
      mode,
    },
  });
}
