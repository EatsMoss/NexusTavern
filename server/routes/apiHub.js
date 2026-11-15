import { Router } from 'express';
import {
  getApiHubState,
  createHubConnection,
  selectActiveHubModel,
  updateHubConnection,
  deleteHubConnection,
  addCustomModelFamily,
  removeCustomModelFamily,
  revealConnectionKeyForCopy,
  pingAllHubConnections,
  refreshSingleConnectionTelemetry,
} from '../services/apiHubStore.js';
import { testAndFetchProviderModels } from '../services/modelFetcher.js';
import { compileChatPrompt } from '../services/promptCompiler.js';
import { streamChatGeneration } from '../services/llmStreamer.js';
import { encryptJsonPayload } from '../utils/auth.js';
import { recordConsoleLog } from '../services/consoleLogger.js';

export const apiHubRouter = Router();

/**
 * GET /api/hub/state
 * Returns sanitized Zero-Trust API Hub v2 state (user connections, masked keychains with dead/active status, models).
 */
apiHubRouter.get('/state', (_req, res) => {
  try {
    const state = getApiHubState();
    res.json({ ok: true, ...state });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/hub/select
 * Switches active connection (keeping same model when `modelId` is omitted — Scenario 1)
 * or switches active connection + model (Scenarios 2 & 3).
 */
apiHubRouter.post('/select', async (req, res) => {
  try {
    const { connectionId, providerId, modelId } = req.body || {};
    const targetId = connectionId || providerId;
    const state = await selectActiveHubModel(targetId, modelId ?? null);
    recordConsoleLog({
      category: 'change',
      level: 'info',
      scope: 'Model Picker',
      title: `Switched active target to ${state.activeProviderName || targetId} → ${state.activeModelName || state.activeModelId}`,
      badges: [
        ...(state.activeProviderName ? [{ label: state.activeProviderName, tone: 'neutral' }] : []),
        ...(state.activeModelName ? [{ label: state.activeModelName, tone: 'accent' }] : []),
      ],
    });
    res.json({ ok: true, ...state });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/hub/connections (and `/custom` alias)
 * Creates a new connection (`rp_proxy` | `oai_proxy` | `official_api`) with 1 or multiple keys,
 * and automatically fetches its live `/models` catalog unless `autoFetch: false`.
 */
async function handleCreateConnection(req, res) {
  try {
    const body = req.body || {};
    const { createdId, hub: initialHub } = await createHubConnection(body);

    if (body.autoFetch !== false) {
      try {
        const fetched = await testAndFetchProviderModels(createdId);
        return res.json({
          ok: true,
          createdId,
          fetchedCount: fetched.fetchedCount,
          elapsedMs: fetched.elapsedMs,
          hub: fetched.hub,
          ...fetched.hub,
        });
      } catch (fetchErr) {
        const latestHub = getApiHubState();
        return res.json({
          ok: true,
          createdId,
          fetchWarning: fetchErr.message,
          hub: latestHub,
          ...latestHub,
        });
      }
    }

    return res.json({ ok: true, createdId, hub: initialHub, ...initialHub });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
}

apiHubRouter.post('/connections', handleCreateConnection);
apiHubRouter.post('/custom', handleCreateConnection);

/**
 * PATCH /api/hub/connections/:id (and `/providers/:id` alias)
 * Updates name, baseUrl, keychain (add/replace/select/delete keys), starred models (`★`), or manual models.
 */
async function handlePatchConnection(req, res) {
  try {
    const body = req.body || {};
    const state = await updateHubConnection(req.params.id, body);
    const conn = (state.connections || []).find((c) => c.id === req.params.id);
    const changedKeys = Object.keys(body).filter((k) => k !== 'apiKey' && k !== 'addKeys');
    if (body.apiKey || body.addKeys) changedKeys.push('keychain');
    recordConsoleLog({
      category: 'change',
      level: 'info',
      scope: 'API Hub',
      title: `Updated connection "${conn?.name || req.params.id}"`,
      summary: changedKeys.length > 0 ? `Modified: ${changedKeys.join(', ')}` : '',
    });
    res.json({ ok: true, ...state });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
}

apiHubRouter.patch('/connections/:id', handlePatchConnection);
apiHubRouter.patch('/providers/:id', handlePatchConnection);

/**
 * DELETE /api/hub/connections/:id (and `/providers/:id` alias)
 * Deletes any connection and cleans up its isolated keys from `secrets.json`.
 */
async function handleDeleteConnection(req, res) {
  try {
    const state = await deleteHubConnection(req.params.id);
    res.json({ ok: true, ...state });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
}

apiHubRouter.delete('/connections/:id', handleDeleteConnection);
apiHubRouter.delete('/providers/:id', handleDeleteConnection);

/**
 * POST /api/hub/connections/:id/fetch-models (and `/providers/:id/fetch-models` alias)
 * Runs live `/models` discovery with automatic keychain failover & dead-key marking.
 */
async function handleFetchModels(req, res) {
  const connectionId = req.params.id;
  try {
    const { apiKey, addKeys, baseUrl } = req.body || {};
    if (
      (typeof apiKey === 'string' && apiKey.trim()) ||
      addKeys !== undefined ||
      baseUrl !== undefined
    ) {
      await updateHubConnection(connectionId, {
        ...(typeof apiKey === 'string' && apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(addKeys !== undefined ? { addKeys } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
      });
    }

    const result = await testAndFetchProviderModels(connectionId);
    const conn = (result.hub?.connections || []).find((c) => c.id === connectionId);
    recordConsoleLog({
      category: 'system',
      level: 'success',
      scope: 'API Hub',
      title: `Fetched ${result.fetchedCount} models from "${conn?.name || connectionId}"`,
      badges: [{ label: `${result.elapsedMs}ms`, tone: 'ok' }],
    });
    res.json({
      ok: true,
      fetchedCount: result.fetchedCount,
      elapsedMs: result.elapsedMs,
      ...result.hub,
    });
  } catch (err) {
    // Always include updated `hub` so newly marked `dead` keys immediately reflect in UI!
    const latestHub = getApiHubState();
    res.status(400).json({ ok: false, error: err.message, hub: latestHub });
  }
}

apiHubRouter.post('/connections/:id/fetch-models', handleFetchModels);
apiHubRouter.post('/providers/:id/fetch-models', handleFetchModels);

/**
 * POST /api/hub/connections/:id/reveal-key
 * On-demand single key retrieval exclusively for user-initiated "Copy API Key" clipboard action.
 */
apiHubRouter.post('/connections/:id/reveal-key', (req, res) => {
  try {
    const rawKey = revealConnectionKeyForCopy(req.params.id, req.body?.keyId || '');
    res.json({ ok: true, apiKey: rawKey });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/hub/ping
 * Zero-token parallel health & latency check across all user connections (triggered on Provider Popover open).
 */
apiHubRouter.post('/ping', async (_req, res) => {
  try {
    const state = await pingAllHubConnections();
    res.json({ ok: true, ...state });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/hub/connections/:id/telemetry
 * Single zero-token status request (triggered on Model Popover open) to update `0 active keys` & locked context.
 */
apiHubRouter.post('/connections/:id/telemetry', async (req, res) => {
  try {
    const state = await refreshSingleConnectionTelemetry(req.params.id);
    res.json({ ok: true, ...state });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/hub/custom-families & DELETE /api/hub/custom-families/:id
 * Adds or removes user-defined company / family filter chips (`+` button next to All / Pinned / Claude / Gemini).
 */
apiHubRouter.post('/custom-families', async (req, res) => {
  try {
    const state = await addCustomModelFamily(req.body || {});
    res.json({ ok: true, ...state });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

apiHubRouter.delete('/custom-families/:id', async (req, res) => {
  try {
    const state = await removeCustomModelFamily(req.params.id);
    res.json({ ok: true, ...state });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/hub/dry-run
 */
apiHubRouter.post('/dry-run', (req, res) => {
  try {
    const compiled = compileChatPrompt(req.body || {});
    res.json({ ok: true, ...compiled });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

const activeGenerationControllers = new Map();

/**
 * POST /api/hub/stop
 * Explicitly aborts an active generation stream by `requestId` (or all active
 * streams when omitted) so upstream proxy connections close immediately even
 * when sitting behind a dev proxy or tunnel during the waiting phase.
 */
apiHubRouter.post('/stop', (req, res) => {
  const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId.trim() : '';
  let stoppedCount = 0;

  if (requestId) {
    const ctrl = activeGenerationControllers.get(requestId);
    if (ctrl) {
      ctrl.abort();
      activeGenerationControllers.delete(requestId);
      stoppedCount = 1;
    }
  } else {
    for (const [id, ctrl] of activeGenerationControllers.entries()) {
      ctrl.abort();
      activeGenerationControllers.delete(id);
      stoppedCount += 1;
    }
  }

  res.json({ ok: true, stoppedCount });
});

/**
 * POST /api/hub/generate
 * Live SSE token + Chain-of-Thought streaming endpoint (`reply` | `swipe` | `continue`)
 * with automatic key rotation, E2EE mobile tunnel envelope support, and atomic `.jsonl` save.
 */
apiHubRouter.post('/generate', async (req, res) => {
  const useE2EE = req.headers['x-bb-e2ee'] === '1';
  const requestId =
    typeof req.body?.requestId === 'string' && req.body.requestId.trim()
      ? req.body.requestId.trim()
      : `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const abortCtrl = new AbortController();
  activeGenerationControllers.set(requestId, abortCtrl);

  const abortFromDisconnect = () => {
    if (!res.writableEnded) {
      abortCtrl.abort();
    }
  };
  req.on('aborted', abortFromDisconnect);
  res.on('close', abortFromDisconnect);

  const writeSseEvent = (eventObj) => {
    if (res.writableEnded) return;
    const wireObj = useE2EE ? encryptJsonPayload(eventObj) : eventObj;
    res.write(`data: ${JSON.stringify(wireObj)}\n\n`);
  };

  try {
    await streamChatGeneration({
      ...(req.body || {}),
      signal: abortCtrl.signal,
      onEvent: writeSseEvent,
    });
  } catch (err) {
    if (!abortCtrl.signal.aborted && err?.name !== 'AbortError') {
      writeSseEvent({
        type: 'error',
        error: err?.message || 'Generation failed',
        refusalDetected: Boolean(err?.refusalDetected),
        allModelsRefused: Boolean(err?.allModelsRefused),
        emptyResponse: Boolean(err?.emptyResponse),
        matchedPhrase: err?.matchedPhrase || '',
        proxyOffline: Boolean(err?.proxyOffline),
        connectionName: err?.connectionName || '',
        hub: getApiHubState(),
      });
    }
  } finally {
    activeGenerationControllers.delete(requestId);
    req.off('aborted', abortFromDisconnect);
    res.off('close', abortFromDisconnect);
    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

