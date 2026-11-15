import React, { useState, useEffect } from 'react';
import './PersonaChip.css';

/**
 * M3 Persona Chip Molecule
 * Renders the active persona name inside a 30px M3 capsule:
 * - Right edge holds the full, uncropped width of the portrait zoomed out to show
 *   its upper 2/3 (rule-of-thirds framing so the character's face sits cleanly in view).
 * - To the left of the portrait, a stretched & blurred strip of the image's own left edge
 *   fades smoothly into the chip surface without eating into the portrait itself.
 */
export function PersonaChip({
  name = 'User',
  avatarUrl = null,
  initials = '',
  title = 'Persona Management',
  disabled = false,
  className = '',
  onClick,
  ...rest
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const resolvedInitials =
    initials || String(name || 'ME').trim().slice(0, 2).toUpperCase() || 'ME';
  const showImage = Boolean(avatarUrl) && !imgError;

  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-label={title ? `${title}: ${name}` : name}
      onClick={onClick}
      className={`bb-persona-chip ${className}`.trim()}
      {...rest}
    >
      <span className="bb-persona-chip__label">{name}</span>
      {showImage ? (
        <span className="bb-persona-chip__media" aria-hidden="true">
          <span className="bb-persona-chip__blur-bed">
            <span className="bb-persona-chip__blur-canvas">
              <img
                src={avatarUrl}
                alt=""
                className="bb-persona-chip__stretch-img"
                onError={() => setImgError(true)}
              />
              <img
                src={avatarUrl}
                alt=""
                className="bb-persona-chip__blur-portrait-img"
                onError={() => setImgError(true)}
              />
            </span>
          </span>
          <span className="bb-persona-chip__portrait">
            <img
              src={avatarUrl}
              alt=""
              className="bb-persona-chip__img"
              onError={() => setImgError(true)}
            />
          </span>
        </span>
      ) : (
        <span className="bb-persona-chip__fallback" aria-hidden="true">
          <span className="bb-persona-chip__initials">{resolvedInitials}</span>
        </span>
      )}
    </button>
  );
}

