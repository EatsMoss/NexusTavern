import React from 'react';
import './Skeleton.css';

/**
 * M3 Tonal Skeleton atom (`rect` | `text` | `circle` | `pill` | `portrait` | `card`)
 * plus composite presets (`SkeletonMessage`, `SkeletonListRow`, `SkeletonTimelineGroup`, `SkeletonCharacterSheet`).
 */
export function Skeleton({
  variant = 'rect', // 'rect' | 'text' | 'circle' | 'pill' | 'portrait' | 'card'
  width,
  height,
  radius,
  className = '',
  style,
}) {
  const computedStyle = {
    ...(width !== undefined ? { width } : null),
    ...(height !== undefined ? { height } : null),
    ...(radius !== undefined ? { borderRadius: radius } : null),
    ...style,
  };

  return (
    <span
      className={['bb-skeleton', `bb-skeleton--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      style={computedStyle}
      aria-hidden="true"
    />
  );
}

export function SkeletonMessage({
  isUser = false,
  dimmed = false,
  lines = 3,
  className = '',
}) {
  return (
    <div
      className={[
        'bb-skeleton-message',
        isUser ? 'bb-skeleton-message--user' : '',
        dimmed ? 'bb-skeleton-message--dimmed' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <Skeleton
        variant="portrait"
        width={80}
        height={120}
        className="bb-skeleton-message__avatar"
      />
      <div className="bb-skeleton-message__content">
        <div className="bb-skeleton-message__head">
          <Skeleton
            variant="text"
            width={isUser ? 96 : 140}
            height={16}
            className="bb-skeleton-message__sender"
          />
          <Skeleton
            variant="rect"
            width={64}
            height={18}
            radius={5}
            className="bb-skeleton-message__telemetry"
          />
        </div>
        <div className="bb-skeleton-message__lines">
          {Array.from({ length: lines }).map((_, idx) => (
            <Skeleton
              key={idx}
              variant="text"
              width={
                idx === lines - 1 && lines > 1
                  ? '62%'
                  : idx % 2 === 1
                    ? '92%'
                    : '100%'
              }
              height={13}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonListRow({
  avatarVariant = 'portrait', // 'portrait' | 'stack' | 'circle'
  avatarSize,
  showTrailingPill = true,
  className = '',
}) {
  return (
    <div
      className={[
        'bb-skeleton-row',
        `bb-skeleton-row--${avatarVariant}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      {avatarVariant === 'stack' ? (
        <span className="bb-skeleton-avatar-stack">
          <Skeleton
            variant="circle"
            width={avatarSize || 32}
            height={avatarSize || 32}
            className="bb-skeleton-avatar-stack__front"
          />
          <Skeleton
            variant="circle"
            width={avatarSize || 32}
            height={avatarSize || 32}
            className="bb-skeleton-avatar-stack__back"
          />
        </span>
      ) : avatarVariant === 'circle' ? (
        <Skeleton
          variant="circle"
          width={avatarSize || 40}
          height={avatarSize || 40}
        />
      ) : (
        <Skeleton
          variant="portrait"
          width={avatarSize || 44}
          height={avatarSize ? Math.round(avatarSize * 1.36) : 60}
          radius="var(--md-sys-shape-corner-xs, 6px)"
          className="bb-skeleton-row__portrait"
        />
      )}

      <div className="bb-skeleton-row__body">
        <div className="bb-skeleton-row__top">
          <Skeleton variant="text" width="48%" height={14} />
          {showTrailingPill && (
            <Skeleton variant="pill" width={38} height={20} />
          )}
        </div>
        <Skeleton variant="text" width="84%" height={11} />
        {avatarVariant === 'stack' && (
          <Skeleton variant="text" width="58%" height={11} />
        )}
      </div>
    </div>
  );
}

export function SkeletonTimelineGroup({ branches = 2, className = '' }) {
  return (
    <div
      className={`bb-skeleton-tl-group ${className}`.trim()}
      aria-hidden="true"
    >
      <div className="bb-skeleton-tl-group__head">
        <Skeleton variant="circle" width={9} height={9} />
        <div className="bb-skeleton-tl-group__title-wrap">
          <Skeleton variant="text" width="54%" height={13} />
          <Skeleton variant="text" width="34%" height={10} />
        </div>
        <Skeleton variant="circle" width={24} height={24} />
      </div>
      <div className="bb-skeleton-tl-group__branches">
        {Array.from({ length: branches }).map((_, idx) => (
          <SkeletonListRow
            key={idx}
            avatarVariant="stack"
            showTrailingPill={idx === 0}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonCharacterSheet({ isExpanded = false, className = '' }) {
  const portraitWidth = isExpanded ? 108 : 96;
  const portraitHeight = isExpanded ? 162 : 144;

  return (
    <div
      className={[
        'bb-skeleton-sheet',
        isExpanded ? 'bb-skeleton-sheet--expanded' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-busy="true"
      aria-label="Loading scenario sheet"
    >
      <div className="bb-skeleton-sheet__top">
        <div className="bb-skeleton-sheet__header">
          <Skeleton
            variant="portrait"
            width={portraitWidth}
            height={portraitHeight}
            radius="var(--bb-control-radius, 8px)"
            className="bb-skeleton-sheet__portrait"
          />
          <div className="bb-skeleton-sheet__controls">
            <div className="bb-skeleton-sheet__meta">
              <div className="bb-skeleton-sheet__title-row">
                <Skeleton variant="text" width="62%" height={20} />
                <Skeleton variant="circle" width={28} height={28} />
              </div>
              <Skeleton variant="pill" width="38%" height={20} />
              <Skeleton variant="text" width="74%" height={12} />
            </div>

            <div className="bb-skeleton-sheet__toolbar">
              <div className="bb-skeleton-sheet__toolbar-group">
                <Skeleton variant="circle" width={28} height={28} />
                <Skeleton variant="pill" width={92} height={30} />
              </div>
              <div className="bb-skeleton-sheet__toolbar-group">
                <Skeleton variant="circle" width={28} height={28} />
                <Skeleton variant="circle" width={28} height={28} />
                <Skeleton variant="circle" width={28} height={28} />
              </div>
            </div>
          </div>
        </div>

        <Skeleton
          variant="rect"
          width="100%"
          height={30}
          radius="var(--bb-control-radius, 8px)"
        />

        <div className="bb-skeleton-sheet__tabs">
          <Skeleton variant="text" width="22%" height={14} />
          <Skeleton variant="text" width="18%" height={14} />
          <Skeleton variant="text" width="18%" height={14} />
          <Skeleton variant="text" width="18%" height={14} />
        </div>
      </div>

      <div className="bb-skeleton-sheet__editor">
        <div className="bb-skeleton-sheet__editor-bar">
          <Skeleton variant="pill" width={96} height={24} />
          <Skeleton variant="pill" width={72} height={24} />
        </div>
        <div className="bb-skeleton-sheet__editor-lines">
          <Skeleton variant="text" width="94%" height={13} />
          <Skeleton variant="text" width="100%" height={13} />
          <Skeleton variant="text" width="88%" height={13} />
          <Skeleton variant="text" width="96%" height={13} />
          <Skeleton variant="text" width="64%" height={13} />
        </div>
      </div>
    </div>
  );
}
