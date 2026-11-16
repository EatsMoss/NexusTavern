import { useState, useCallback, useRef } from 'react';

/**
 * Promise-driven image crop queue hook.
 * Opens `ImageCropModal` immediately whenever 1 or more images are selected/dropped,
 * returning cropped `{ file, dataUrl }` results in order (or `null` / partial array if cancelled).
 */
export function useImageCropQueue({ defaultTitle = 'Crop Portrait' } = {}) {
  const [activeJob, setActiveJob] = useState(null);
  const queueRef = useRef(null);

  const finishQueue = useCallback((results) => {
    const current = queueRef.current;
    queueRef.current = null;
    setActiveJob(null);
    current?.resolve?.(results);
  }, []);

  const requestCropFiles = useCallback(
    (files, options = {}) => {
      const validFiles = Array.from(files || []).filter(
        (f) => f && typeof f.type === 'string' && f.type.startsWith('image/'),
      );
      if (validFiles.length === 0) {
        return Promise.resolve([]);
      }

      // Cancel any stale active queue before starting a fresh one
      if (queueRef.current) {
        queueRef.current.resolve([]);
        queueRef.current = null;
      }

      return new Promise((resolve) => {
        const jobState = {
          files: validFiles,
          index: 0,
          results: [],
          title: options.title || defaultTitle,
          subtitle: options.subtitle || '',
          aspectRatio: options.aspectRatio,
          resolve,
        };
        queueRef.current = jobState;
        setActiveJob({
          file: validFiles[0],
          stepIndex: 0,
          totalSteps: validFiles.length,
          title: jobState.title,
          subtitle: jobState.subtitle,
          aspectRatio: jobState.aspectRatio,
        });
      });
    },
    [defaultTitle],
  );

  const requestCropFile = useCallback(
    async (file, options = {}) => {
      if (!file) return null;
      const results = await requestCropFiles([file], options);
      return results[0] || null;
    },
    [requestCropFiles],
  );

  const handleConfirmStep = useCallback(
    (cropResult) => {
      const q = queueRef.current;
      if (!q) return;
      q.results.push(cropResult);
      const nextIdx = q.index + 1;
      if (nextIdx < q.files.length) {
        q.index = nextIdx;
        setActiveJob({
          file: q.files[nextIdx],
          stepIndex: nextIdx,
          totalSteps: q.files.length,
          title: q.title,
          subtitle: q.subtitle,
          aspectRatio: q.aspectRatio,
        });
      } else {
        finishQueue(q.results);
      }
    },
    [finishQueue],
  );

  const handleCancelQueue = useCallback(() => {
    const q = queueRef.current;
    // If user cropped some images in a multi-select batch and cancelled the rest,
    // return already-confirmed items if `keepCompleted` is desired, or empty on single file.
    finishQueue(q && q.results.length > 0 ? q.results : []);
  }, [finishQueue]);

  const cropModalProps = {
    open: Boolean(activeJob),
    file: activeJob?.file || null,
    title: activeJob?.title || defaultTitle,
    subtitle: activeJob?.subtitle || '',
    aspectRatio: activeJob?.aspectRatio,
    stepIndex: activeJob?.stepIndex || 0,
    totalSteps: activeJob?.totalSteps || 1,
    onConfirm: handleConfirmStep,
    onCancel: handleCancelQueue,
  };

  return {
    requestCropFile,
    requestCropFiles,
    cropModalProps,
  };
}
