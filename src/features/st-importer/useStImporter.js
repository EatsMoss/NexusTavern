import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchStImporterState,
  clearStImporterState,
  browseStDirectory,
  scanStDirectoryApi,
  startStImportApi,
  fetchStImportJobApi,
  cancelStImportApi,
} from '@core/stImport/stImportApi.js';

const DEFAULT_CATEGORIES = {
  backgrounds: true,
  characters: true,
  personas: true,
  regex: true,
  chats: true,
};

export function useStImporter({ onImportCompleted, onNotify } = {}) {
  const [isLocalHost, setIsLocalHost] = useState(true);
  const [canBrowseNative, setCanBrowseNative] = useState(true);
  const [rootPath, setRootPath] = useState('');
  const [selectedProfile, setSelectedProfile] = useState('default-user');
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [conflictMode, setConflictMode] = useState('skip');

  const [browsing, setBrowsing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState(null);
  const [scanError, setScanError] = useState('');

  const [job, setJob] = useState(null);
  const [lastReport, setLastReport] = useState(null);

  const pollTimerRef = useRef(null);
  const handledJobIdRef = useRef('');
  const callbacksRef = useRef({ onImportCompleted, onNotify });
  callbacksRef.current = { onImportCompleted, onNotify };

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPollingJob = useCallback(() => {
    stopPolling();
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetchStImportJobApi();
        const nextJob = res?.job || null;
        if (!nextJob) return;
        setJob(nextJob);

        if (!nextJob.running) {
          stopPolling();
          if (nextJob.id && handledJobIdRef.current !== nextJob.id) {
            handledJobIdRef.current = nextJob.id;
            if (nextJob.report) {
              setLastReport(nextJob.report);
              await callbacksRef.current.onImportCompleted?.(nextJob.report);
              const impCount = Number(nextJob.report.totals?.imported || 0);
              const skipCount = Number(nextJob.report.totals?.skipped || 0);
              if (nextJob.canceled) {
                callbacksRef.current.onNotify?.(
                  `Import canceled (${impCount.toLocaleString('en-US')} imported before stop)`,
                  'warning',
                );
              } else {
                callbacksRef.current.onNotify?.(
                  `SillyTavern import finished: ${impCount.toLocaleString('en-US')} imported, ${skipCount.toLocaleString('en-US')} skipped`,
                  'success',
                );
              }
            } else if (nextJob.error) {
              callbacksRef.current.onNotify?.(nextJob.error, 'error');
            }
          }
        }
      } catch {
        // transient network poll retry
      }
    }, 220);
  }, [stopPolling]);

  useEffect(() => {
    let cancelled = false;
    fetchStImporterState()
      .then((res) => {
        if (cancelled || !res?.ok) return;
        setIsLocalHost(Boolean(res.isLocalHost));
        setCanBrowseNative(Boolean(res.canBrowseNative));

        if (res.persisted) {
          if (res.persisted.lastRootPath) setRootPath(res.persisted.lastRootPath);
          if (res.persisted.lastProfile) setSelectedProfile(res.persisted.lastProfile);
          if (res.persisted.lastScan) setScanSummary(res.persisted.lastScan);
          if (res.persisted.lastReport) setLastReport(res.persisted.lastReport);
        }

        if (res.job) {
          setJob(res.job);
          if (res.job.running) {
            startPollingJob();
          } else if (res.job.id) {
            handledJobIdRef.current = res.job.id;
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [startPollingJob, stopPolling]);

  const handleChangeRootPath = useCallback(
    (nextValue) => {
      setRootPath(nextValue);
      setScanError('');
      if (
        scanSummary &&
        String(nextValue || '').trim() !== String(scanSummary.resolvedRoot || '').trim()
      ) {
        setScanSummary(null);
      }
    },
    [scanSummary],
  );

  const handleScanDirectory = useCallback(
    async (targetPath = rootPath, targetProfile = selectedProfile) => {
      const cleanPath = String(targetPath || '').trim();
      if (!cleanPath) return null;

      setScanning(true);
      setScanError('');
      try {
        const res = await scanStDirectoryApi({
          rootPath: cleanPath,
          profile: targetProfile,
        });
        if (res?.scan) {
          setScanSummary(res.scan);
          setRootPath(res.scan.resolvedRoot || cleanPath);
          if (res.scan.activeProfile) {
            setSelectedProfile(res.scan.activeProfile);
          }
          return res.scan;
        }
        return null;
      } catch (err) {
        const msg = err?.message || 'Failed to scan SillyTavern directory';
        setScanSummary(null);
        setScanError(msg);
        return null;
      } finally {
        setScanning(false);
      }
    },
    [rootPath, selectedProfile],
  );

  const handleBrowseDirectory = useCallback(async () => {
    setBrowsing(true);
    setScanError('');
    try {
      const res = await browseStDirectory(rootPath);
      if (!res?.canceled && res?.path) {
        setRootPath(res.path);
        await handleScanDirectory(res.path, selectedProfile);
      }
    } catch (err) {
      setScanError(err?.message || 'Unable to open folder browser');
    } finally {
      setBrowsing(false);
    }
  }, [rootPath, selectedProfile, handleScanDirectory]);

  const handleSelectProfile = useCallback(
    async (nextProfile) => {
      setSelectedProfile(nextProfile);
      if (String(rootPath || '').trim()) {
        await handleScanDirectory(rootPath, nextProfile);
      }
    },
    [rootPath, handleScanDirectory],
  );

  const handleToggleCategory = useCallback((catId, nextChecked) => {
    setCategories((prev) => ({
      ...prev,
      [catId]: Boolean(nextChecked),
    }));
  }, []);

  const handleSetAllCategories = useCallback((checked) => {
    const val = Boolean(checked);
    setCategories({
      backgrounds: val,
      characters: val,
      personas: val,
      regex: val,
      chats: val,
    });
  }, []);

  const handleStartImport = useCallback(async () => {
    const cleanPath = String(rootPath || '').trim();
    if (!cleanPath) return;

    setScanError('');
    try {
      const res = await startStImportApi({
        rootPath: cleanPath,
        profile: selectedProfile,
        categories,
        conflictMode,
      });
      if (res?.job) {
        setJob(res.job);
        startPollingJob();
      }
    } catch (err) {
      const msg = err?.message || 'Failed to start SillyTavern import';
      setScanError(msg);
      callbacksRef.current.onNotify?.(msg, 'error');
    }
  }, [rootPath, selectedProfile, categories, conflictMode, startPollingJob]);

  const handleCancelImport = useCallback(async () => {
    try {
      const res = await cancelStImportApi();
      if (res?.job) setJob(res.job);
    } catch (err) {
      callbacksRef.current.onNotify?.(err?.message || 'Failed to cancel import', 'error');
    }
  }, []);

  const handleClearSavedState = useCallback(async () => {
    try {
      await clearStImporterState();
      setRootPath('');
      setScanSummary(null);
      setScanError('');
      setLastReport(null);
      setJob(null);
    } catch (err) {
      callbacksRef.current.onNotify?.(
        err?.message || 'Failed to clear saved directory',
        'error',
      );
    }
  }, []);

  const handleDismissReport = useCallback(() => {
    setLastReport(null);
  }, []);

  return {
    isLocalHost,
    canBrowseNative,
    rootPath,
    selectedProfile,
    categories,
    conflictMode,
    browsing,
    scanning,
    scanSummary,
    scanError,
    job,
    lastReport,
    setConflictMode,
    handleChangeRootPath,
    handleBrowseDirectory,
    handleScanDirectory,
    handleSelectProfile,
    handleToggleCategory,
    handleSetAllCategories,
    handleStartImport,
    handleCancelImport,
    handleClearSavedState,
    handleDismissReport,
  };
}

