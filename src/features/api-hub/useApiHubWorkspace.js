import { useState, useCallback, useMemo } from 'react';
import {
  fetchApiHubState,
  selectApiHubModel,
  patchApiHubProvider,
  fetchProviderModelsLive,
  createCustomApiHubProvider,
  removeCustomApiHubProvider,
  revealApiHubConnectionKey,
  pingApiHubConnections,
  fetchConnectionTelemetry,
  addApiHubCustomFamily,
  deleteApiHubCustomFamily,
} from '@core/api/apiHubApi.js';

/**
 * Domain workspace controller for the Zero-Trust API Hub (`api-hub.json` +
 * `secrets.json`), model selection, live model catalog fetching, custom
 * provider/family CRUD, connection pings, telemetry, and `ApiHubModal` state.
 */
export function useApiHubWorkspace({ onModelError } = {}) {
  const [apiHubState, setApiHubState] = useState(null);
  const [apiModalOpen, setApiModalOpen] = useState(false);

  const applyHubResponse = useCallback((res) => {
    if (!res) return;
    if (res.hub) {
      setApiHubState(res.hub);
    } else {
      setApiHubState(res);
    }
  }, []);

  const handleSelectHubModel = useCallback(
    async (providerId, modelId = null) => {
      try {
        const res = await selectApiHubModel(providerId, modelId);
        applyHubResponse(res);
      } catch (err) {
        onModelError?.(`Model switch error: ${err.message}`);
      }
    },
    [applyHubResponse, onModelError],
  );

  const handleUpdateHubProvider = useCallback(
    async (providerId, patch) => {
      const res = await patchApiHubProvider(providerId, patch);
      applyHubResponse(res);
      return res;
    },
    [applyHubResponse],
  );

  const handleFetchHubModels = useCallback(
    async (providerId, pendingPatch) => {
      try {
        const res = await fetchProviderModelsLive(providerId, pendingPatch);
        applyHubResponse(res);
        return res;
      } catch (err) {
        const fresh = await fetchApiHubState().catch(() => null);
        if (fresh?.ok) applyHubResponse(fresh);
        throw err;
      }
    },
    [applyHubResponse],
  );

  const handleCreateCustomHubConn = useCallback(
    async (payload) => {
      const res = await createCustomApiHubProvider(payload);
      applyHubResponse(res);
      return res;
    },
    [applyHubResponse],
  );

  const handleDeleteCustomHubConn = useCallback(
    async (providerId) => {
      const res = await removeCustomApiHubProvider(providerId);
      applyHubResponse(res);
      return res;
    },
    [applyHubResponse],
  );

  const handleRevealHubKey = useCallback(async (connectionId, keyId = '') => {
    const res = await revealApiHubConnectionKey(connectionId, keyId);
    return res?.apiKey || '';
  }, []);

  const handlePingHubConnections = useCallback(async () => {
    const res = await pingApiHubConnections();
    applyHubResponse(res);
    return res;
  }, [applyHubResponse]);

  const handleFetchHubTelemetry = useCallback(
    async (connectionId) => {
      const res = await fetchConnectionTelemetry(connectionId);
      applyHubResponse(res);
      return res;
    },
    [applyHubResponse],
  );

  const handleAddHubCustomFamily = useCallback(
    async (payload) => {
      const res = await addApiHubCustomFamily(payload);
      applyHubResponse(res);
      return res;
    },
    [applyHubResponse],
  );

  const handleDeleteHubCustomFamily = useCallback(
    async (familyId) => {
      const res = await deleteApiHubCustomFamily(familyId);
      applyHubResponse(res);
      return res;
    },
    [applyHubResponse],
  );

  const handleClickModelBadge = useCallback(() => setApiModalOpen(true), []);

  const selectedModelLabel =
    apiHubState?.activeModelName && apiHubState.activeModelName !== 'Select Model'
      ? apiHubState.activeModelName
      : 'Add Connection';

  const activeModelMeta = useMemo(() => {
    const activeHubConnObj =
      (apiHubState?.connections || []).find(
        (c) => c.id === (apiHubState?.activeConnectionId || apiHubState?.activeProviderId),
      ) || null;
    if (!activeHubConnObj) return null;
    const activeHubModelObj =
      (activeHubConnObj.models || []).find((m) => m.id === apiHubState?.activeModelId) || null;
    return {
      modelId: activeHubModelObj?.upstreamModelId || apiHubState?.activeModelId || '',
      modelName: activeHubModelObj?.name || apiHubState?.activeModelName || '',
      protocol: activeHubModelObj?.protocol || 'openai',
      routeId: activeHubModelObj?.routeId || activeHubConnObj.activeRouteId || '',
      connectionType: activeHubConnObj.type || '',
    };
  }, [apiHubState]);

  return {
    apiHubState,
    setApiHubState,
    apiModalOpen,
    setApiModalOpen,
    selectedModelLabel,
    activeModelMeta,
    applyHubResponse,
    handleSelectHubModel,
    handleUpdateHubProvider,
    handleFetchHubModels,
    handleCreateCustomHubConn,
    handleDeleteCustomHubConn,
    handleRevealHubKey,
    handlePingHubConnections,
    handleFetchHubTelemetry,
    handleAddHubCustomFamily,
    handleDeleteHubCustomFamily,
    handleClickModelBadge,
  };
}
