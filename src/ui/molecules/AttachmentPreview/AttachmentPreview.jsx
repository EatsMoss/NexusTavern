import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Button } from '@ui/atoms/Button/Button.jsx';
import { OverlayScrollArea } from '@ui/atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import {
  formatFileSize,
  getFileExtension,
  inferAttachmentKind,
  resolveAttachmentIcon,
} from './attachmentModel.js';
import './AttachmentPreview.css';

export function AttachmentLightbox({
  items = [],
  activeIndex = -1,
  onClose,
  onChangeIndex,
}) {
  const [zoomed, setZoomed] = useState(false);
  const [fetchedText, setFetchedText] = useState({ url: '', text: null, loading: false });

  const isOpen = activeIndex >= 0 && activeIndex < items.length;
  const current = isOpen ? items[activeIndex] : null;
  const kind = current ? current.kind || inferAttachmentKind(current) : 'file';
  const ext = current ? (current.ext || getFileExtension(current.name)).toUpperCase() : '';
  const sizeLabel = current && current.size ? formatFileSize(current.size) : '';
  const srcUrl = current?.url || current?.previewUrl || '';

  useEffect(() => {
    setZoomed(false);
  }, [activeIndex, srcUrl]);

  useEffect(() => {
    if (!isOpen || !current) return undefined;
    if ((kind !== 'text' && kind !== 'code') || typeof current.textContent === 'string' || !srcUrl) {
      return undefined;
    }
    let cancelled = false;
    setFetchedText({ url: srcUrl, text: null, loading: true });
    fetch(srcUrl)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('Failed to load file'))))
      .then((txt) => {
        if (!cancelled) {
          setFetchedText({
            url: srcUrl,
            text: txt.length > 300000 ? `${txt.slice(0, 300000)}\n\n… [Preview truncated]` : txt,
            loading: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedText({ url: srcUrl, text: null, loading: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, current, kind, srcUrl]);

  const handlePrev = useCallback(() => {
    if (items.length <= 1) return;
    onChangeIndex?.((activeIndex - 1 + items.length) % items.length);
  }, [activeIndex, items.length, onChangeIndex]);

  const handleNext = useCallback(() => {
    if (items.length <= 1) return;
    onChangeIndex?.((activeIndex + 1) % items.length);
  }, [activeIndex, items.length, onChangeIndex]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      } else if (e.key === 'ArrowLeft' && items.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        handlePrev();
      } else if (e.key === 'ArrowRight' && items.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        handleNext();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, items.length, onClose, handlePrev, handleNext]);

  if (!isOpen || !current || typeof document === 'undefined') return null;

  const resolvedText =
    typeof current.textContent === 'string'
      ? current.textContent
      : fetchedText.url === srcUrl
        ? fetchedText.text
        : null;

  const handleDownload = () => {
    if (!srcUrl) return;
    const a = document.createElement('a');
    a.href = srcUrl;
    a.download = current.name || 'attachment';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const subtitleParts = [];
  if (ext) subtitleParts.push(ext);
  if (sizeLabel) subtitleParts.push(sizeLabel);
  if (items.length > 1) subtitleParts.push(`${activeIndex + 1} / ${items.length}`);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.name || 'Attachment preview'}
      className="bb-attach-lightbox"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <header className="bb-attach-lightbox__topbar">
        <div className="bb-attach-lightbox__info">
          <Icon name={resolveAttachmentIcon(kind)} size={20} />
          <div className="bb-attach-lightbox__title-col">
            <span className="bb-attach-lightbox__filename">
              {current.name || current.title || 'Attachment'}
            </span>
            {subtitleParts.length > 0 && (
              <span className="bb-attach-lightbox__sub">{subtitleParts.join(' • ')}</span>
            )}
          </div>
        </div>

        <div className="bb-attach-lightbox__actions">
          {kind === 'image' && (
            <Button
              variant="b2"
              size="md"
              icon={zoomed ? 'zoomOut' : 'zoomIn'}
              title={zoomed ? 'Fit to screen' : 'Zoom actual size'}
              aria-label={zoomed ? 'Fit to screen' : 'Zoom actual size'}
              onClick={() => setZoomed((v) => !v)}
            />
          )}
          {srcUrl && (
            <Button
              variant="b1"
              size="sm"
              emphasis="tonal"
              icon="download"
              onClick={handleDownload}
            >
              Download
            </Button>
          )}
          <Button
            variant="b2"
            size="md"
            icon="close"
            title="Close preview (Esc)"
            aria-label="Close preview"
            onClick={onClose}
          />
        </div>
      </header>

      <div
        className="bb-attach-lightbox__stage"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        {items.length > 1 && (
          <button
            type="button"
            className="bb-attach-lightbox__nav bb-attach-lightbox__nav--prev"
            title="Previous attachment (←)"
            aria-label="Previous attachment"
            onClick={handlePrev}
          >
            <Icon name="chevronLeft" size={22} />
          </button>
        )}

        {kind === 'image' && srcUrl ? (
          <img
            src={srcUrl}
            alt={current.name || current.title || 'Attached image'}
            className={`bb-attach-lightbox__img ${zoomed ? 'is-zoomed' : ''}`.trim()}
            onClick={() => setZoomed((v) => !v)}
          />
        ) : kind === 'video' && srcUrl ? (
          <video src={srcUrl} controls autoPlay className="bb-attach-lightbox__media-player" />
        ) : (
          <div className="bb-attach-lightbox__doc-card">
            {kind === 'audio' && srcUrl ? (
              <div className="bb-attach-lightbox__binary-card">
                <Icon name="file" size={36} />
                <div className="bb-attach-lightbox__filename">{current.name}</div>
                <audio src={srcUrl} controls style={{ width: 'min(420px, 80vw)' }} />
              </div>
            ) : resolvedText !== null ? (
              <OverlayScrollArea
                variant="compact"
                watchValue={resolvedText}
                className="bb-attach-lightbox__doc-scroll"
              >
                <pre className="bb-attach-lightbox__code">
                  {resolvedText || '(Empty file)'}
                  {current.textTruncated ? '\n\n… [Preview truncated at 512 KB]' : ''}
                </pre>
              </OverlayScrollArea>
            ) : fetchedText.loading ? (
              <div className="bb-attach-lightbox__binary-card">
                <span className="bb-caption-text">Loading file preview...</span>
              </div>
            ) : (
              <div className="bb-attach-lightbox__binary-card">
                <Icon name={resolveAttachmentIcon(kind)} size={40} />
                <div className="bb-attach-lightbox__filename">{current.name || 'File'}</div>
                <span className="bb-caption-text">
                  {sizeLabel
                    ? `${ext ? `${ext} file • ` : ''}${sizeLabel}`
                    : 'Binary file attachment'}
                </span>
                {srcUrl && (
                  <Button
                    variant="b1"
                    size="sm"
                    emphasis="filled"
                    icon="download"
                    onClick={handleDownload}
                  >
                    Download File
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {items.length > 1 && (
          <button
            type="button"
            className="bb-attach-lightbox__nav bb-attach-lightbox__nav--next"
            title="Next attachment (→)"
            aria-label="Next attachment"
            onClick={handleNext}
          >
            <Icon name="chevronRight" size={22} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function AttachmentTray({
  items = [],
  onRemove,
  onOpenPreview,
  standalone = false,
  className = '',
}) {
  const [lightboxIdx, setLightboxIdx] = useState(-1);

  if (!Array.isArray(items) || items.length === 0) return null;

  const handleOpen = (idx, item) => {
    if (onOpenPreview) {
      onOpenPreview(idx, item);
      return;
    }
    setLightboxIdx(idx);
  };

  return (
    <>
      <div
        role="list"
        aria-label="Attached files"
        className={`bb-attach-tray bb-scrollbar--hidden ${
          standalone ? 'bb-attach-tray--standalone' : ''
        } ${className}`.trim()}
      >
        {items.map((item, idx) => {
          const kind = item.kind || inferAttachmentKind(item);
          const isImg = kind === 'image' && Boolean(item.previewUrl || item.url);
          const ext = (item.ext || getFileExtension(item.name)).slice(0, 5);
          const sizeStr = item.size ? formatFileSize(item.size) : '';

          return (
            <div
              key={item.id || `${item.name}-${idx}`}
              role="listitem"
              className={`bb-attach-item ${
                isImg ? 'bb-attach-item--image' : 'bb-attach-item--file'
              }`}
            >
              <button
                type="button"
                className="bb-attach-item__trigger"
                title={`Click to preview ${item.name || 'attachment'}`}
                aria-label={`Preview ${item.name || 'attachment'}`}
                onClick={() => handleOpen(idx, item)}
              >
                {isImg ? (
                  <img
                    src={item.previewUrl || item.url}
                    alt={item.name || 'Attached image'}
                    draggable={false}
                    className="bb-attach-item__thumb"
                  />
                ) : (
                  <>
                    <span className="bb-attach-item__icon-badge" aria-hidden="true">
                      <Icon name={resolveAttachmentIcon(kind)} size={16} />
                      {ext && <span className="bb-attach-item__ext">{ext}</span>}
                    </span>
                    <span className="bb-attach-item__meta">
                      <span className="bb-attach-item__name">{item.name || 'Attachment'}</span>
                      <span className="bb-attach-item__size">
                        {sizeStr || (ext ? ext.toUpperCase() : 'FILE')}
                      </span>
                    </span>
                  </>
                )}
              </button>

              {onRemove && (
                <button
                  type="button"
                  className="bb-attach-item__remove"
                  title={`Remove ${item.name || 'file'}`}
                  aria-label={`Remove ${item.name || 'file'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.id, item);
                  }}
                >
                  <Icon name="close" size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!onOpenPreview && (
        <AttachmentLightbox
          items={items}
          activeIndex={lightboxIdx}
          onClose={() => setLightboxIdx(-1)}
          onChangeIndex={setLightboxIdx}
        />
      )}
    </>
  );
}
