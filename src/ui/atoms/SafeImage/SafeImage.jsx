import React, { useState } from 'react';

/**
 * SafeImage — renders an `<img>` that cleanly falls back to `fallback` (placeholder / initials)
 * whenever `src` is empty or fails to load (`onError`), preventing browser broken-image icons.
 */
export function SafeImage({
  src,
  alt = '',
  fallback = null,
  onError,
  ...imgProps
}) {
  const [failedSrc, setFailedSrc] = useState(null);

  if (!src || failedSrc === src) {
    return fallback ?? null;
  }

  return (
    <img
      decoding="async"
      {...imgProps}
      src={src}
      alt={alt}
      onError={(e) => {
        setFailedSrc(src);
        onError?.(e);
      }}
    />
  );
}
