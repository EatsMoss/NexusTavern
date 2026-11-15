import React from 'react';
import { BrandLogo } from '../../atoms/BrandLogo/BrandLogo.jsx';
import { ProgressIndicator } from '../../atoms/ProgressIndicator/ProgressIndicator.jsx';
import { Badge } from '../../atoms/Badge/Badge.jsx';
import './SplashScreen.css';

export const APP_VERSION = '0.5.0-beta.1';

/**
 * Lightweight frameless M3 Splash Screen for NexusTavern.
 * Zero WebGL shaders and zero external assets: uses ambient theme colors,
 * soft shadows, inline vector mark, boot stage copy, accent M3 progress bar,
 * and version badge underneath the steps.
 */
export function SplashScreen({
  open = true,
  exiting = false,
  inline = false,
  title = 'NexusTavern',
  statusText = '',
  stepLabel = '',
  versionBadge = APP_VERSION,
  progress = null, // number 0..100 or null for indeterminate
  lowGpu = false,
  actions = null,
  onBackdropClick,
  className = '',
}) {
  if (!open && !exiting) return null;

  const isDeterminate = typeof progress === 'number' && Number.isFinite(progress);

  return (
    <div
      className={[
        'bb-splash-screen',
        exiting ? 'bb-splash-screen--exiting' : '',
        inline ? 'bb-splash-screen--inline' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
      aria-label={title}
      onClick={onBackdropClick}
    >
      <div
        className="bb-splash-screen__center"
        onClick={onBackdropClick ? (e) => e.stopPropagation() : undefined}
      >
        <BrandLogo
          size={58}
          pulse={!lowGpu}
          title={title}
          className="bb-splash-screen__logo"
        />

        <div className="bb-splash-screen__titles">
          <div className="bb-splash-screen__title">{title}</div>
          {statusText && <p className="bb-splash-screen__subtitle">{statusText}</p>}
        </div>

        <div className="bb-splash-screen__progress-box">
          <ProgressIndicator
            variant="linear"
            size="md"
            tone="primary"
            value={isDeterminate ? progress : null}
            ariaLabel={stepLabel || 'Loading NexusTavern'}
          />
          {stepLabel && <div className="bb-splash-screen__step-meta">{stepLabel}</div>}
          {versionBadge && (
            <Badge variant="tonal" size="sm" mono className="bb-splash-screen__version">
              {versionBadge}
            </Badge>
          )}
        </div>

        {actions && <div className="bb-splash-screen__actions">{actions}</div>}
      </div>
    </div>
  );
}
