import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  BookmarkRibbons,
  Button,
  SegmentedGroup,
  Input,
  Switch,
  MarkdownEditor,
  Icon,
  SafeImage,
  OverlayScrollArea,
  ImageCropModal,
  useImageCropQueue,
} from '@ui/index.js';
import {
  convertImageFileToPngBase64,
  readFileAsBase64,
} from '@core/utils/imageCodec.js';
import { useViewport } from '@core/hooks/useViewport.js';
import './CreateScenarioSheet.css';

export { convertImageFileToPngBase64, readFileAsBase64 };

const CREATE_EDITOR_TABS = [
  { id: 'description', label: 'I. Description' },
  { id: 'firstMes', label: 'II. First Message' },
  { id: 'notes', label: "III. Creator's Notes" },
];

export const CreateScenarioSheet = forwardRef(function CreateScenarioSheet(
  {
    initialMode = 'create',
    availableTags = [],
    submitting = false,
    statusMsg = '',
    onClose,
    onCreateScenario,
    onImportScenarioFiles,
    onDirtyChange,
  },
  ref,
) {
  const { isMobile } = useViewport();
  const [mode, setMode] = useState(initialMode === 'import' ? 'import' : 'create');
  const [editorTab, setEditorTab] = useState('description');
  const [name, setName] = useState('');
  const [creatorNotes, setCreatorNotes] = useState('');
  const [description, setDescription] = useState('');
  const [firstMes, setFirstMes] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [specVersion, setSpecVersion] = useState('chara_card_v3');
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [avatarPngBase64, setAvatarPngBase64] = useState(null);

  const [importFiles, setImportFiles] = useState([]);
  const [importEmbeddedTags, setImportEmbeddedTags] = useState(true);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const portraitInputRef = useRef(null);
  const importInputRef = useRef(null);

  useEffect(() => {
    setMode(initialMode === 'import' ? 'import' : 'create');
  }, [initialMode]);

  const approxTotalTokens = useMemo(() => {
    const combined = [name, description, firstMes].filter(Boolean).join('\n');
    return combined ? Math.ceil(combined.length / 3.8) : 0;
  }, [name, description, firstMes]);

  const { requestCropFile: requestCreateCrop, cropModalProps: createCropModalProps } =
    useImageCropQueue({ defaultTitle: 'Crop Scenario Portrait' });

  const handlePickPortrait = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const cropped = await requestCreateCrop(file, {
        title: 'Crop Scenario Portrait',
      });
      if (cropped?.dataUrl) {
        setAvatarPreviewUrl(cropped.dataUrl);
        setAvatarPngBase64(cropped.dataUrl);
      }
    } catch {
      // ignore invalid image
    }
  };

  const handleQueueImportFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const accepted = Array.from(fileList).filter((f) => /\.(png|json)$/i.test(f.name));
    if (accepted.length === 0) return;
    setImportFiles((prev) => {
      const existingNames = new Set(prev.map((x) => `${x.name}:${x.size}`));
      const next = [...prev];
      for (const f of accepted) {
        const key = `${f.name}:${f.size}`;
        if (!existingNames.has(key)) {
          existingNames.add(key);
          next.push(f);
        }
      }
      return next;
    });
  };

  const handleAddTagChipToInput = (tagName) => {
    const clean = String(tagName || '').trim();
    if (!clean) return;
    const current = tagsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (current.some((t) => t.toLowerCase() === clean.toLowerCase())) return;
    setTagsText([...current, clean].join(', '));
  };

  const handleSubmit = useCallback(async () => {
    if (submitting) return false;
    if (mode === 'import') {
      if (importFiles.length === 0) return false;
      await onImportScenarioFiles?.(importFiles, { importEmbeddedTags });
      setImportFiles([]);
      return true;
    }

    const cleanName = name.trim();
    if (!cleanName) return false;
    const parsedTags = tagsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    await onCreateScenario?.({
      avatarBase64: avatarPngBase64,
      asJson: !avatarPngBase64,
      fields: {
        name: cleanName,
        creator_notes: creatorNotes,
        description,
        first_mes: firstMes,
        tags: parsedTags,
        spec: specVersion,
      },
    });
    return true;
  }, [
    submitting,
    mode,
    importFiles,
    importEmbeddedTags,
    name,
    tagsText,
    avatarPngBase64,
    creatorNotes,
    description,
    firstMes,
    specVersion,
    onCreateScenario,
    onImportScenarioFiles,
  ]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyS' || e.key?.toLowerCase() === 's')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (mode === 'create' && name.trim() && !submitting) {
          handleSubmit();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [mode, name, submitting, handleSubmit]);

  const canSubmit =
    !submitting && (mode === 'create' ? Boolean(name.trim()) : importFiles.length > 0);

  const isDirty = useMemo(() => {
    if (mode === 'import') {
      return importFiles.length > 0;
    }
    return Boolean(
      name.trim() ||
        creatorNotes.trim() ||
        description.trim() ||
        firstMes.trim() ||
        tagsText.trim() ||
        avatarPngBase64,
    );
  }, [mode, importFiles.length, name, creatorNotes, description, firstMes, tagsText, avatarPngBase64]);

  const handleDiscardDraft = useCallback(() => {
    setName('');
    setCreatorNotes('');
    setDescription('');
    setFirstMes('');
    setTagsText('');
    setAvatarPreviewUrl('');
    setAvatarPngBase64(null);
    setImportFiles([]);
  }, []);

  useEffect(() => {
    const label =
      mode === 'import'
        ? `${importFiles.length} queued card file${importFiles.length === 1 ? '' : 's'}`
        : name.trim() || 'New Scenario';
    onDirtyChange?.({
      isDirty,
      canSave: canSubmit,
      cannotSaveReason:
        !canSubmit && mode === 'create'
          ? 'Enter a Scenario Name before creating the card, or discard changes.'
          : '',
      saveLabel: mode === 'import' ? 'Import & Close' : 'Create & Close',
      itemName: label,
      subtitle: mode === 'import' ? 'Import Scenario Cards' : 'Create New Scenario',
      busy: submitting,
    });
  }, [isDirty, canSubmit, mode, importFiles.length, name, submitting, onDirtyChange]);

  useImperativeHandle(
    ref,
    () => ({
      isDirty,
      canSave: canSubmit,
      save: handleSubmit,
      discard: handleDiscardDraft,
    }),
    [isDirty, canSubmit, handleSubmit, handleDiscardDraft],
  );

  return (
    <div className="bb-create-scen-sheet">
      <header className="bb-create-scen-sheet__header">
        <div className="bb-create-scen-sheet__title-group">
          {isMobile && onClose ? (
            <Button
              variant="b2"
              size="sm"
              icon="arrowLeft"
              title="Back"
              aria-label="Back"
              onClick={onClose}
            />
          ) : (
            <span className="bb-create-scen-sheet__icon-badge" aria-hidden="true">
              <Icon name={mode === 'import' ? 'upload' : 'userPlus'} size={16} />
            </span>
          )}
          <div className="bb-create-scen-sheet__titles">
            <div className="bb-create-scen-sheet__title">
              {mode === 'import' ? 'Import Cards' : 'New Scenario'}
            </div>
            {!isMobile && (
              <div className="bb-create-scen-sheet__subtitle">
                {mode === 'import'
                  ? 'Import SillyTavern Character Card Spec V2 / V3 (.png & .json)'
                  : 'SillyTavern-compatible V2 / CCv3 scenario card'}
              </div>
            )}
          </div>
        </div>

        <div className="bb-create-scen-sheet__header-right">
          <SegmentedGroup
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'create', label: 'Create' },
              { value: 'import', label: 'Import' },
            ]}
          />
          {isMobile ? (
            <Button
              variant="b1"
              size="sm"
              emphasis={canSubmit ? 'filled' : 'tonal'}
              icon={mode === 'import' ? 'upload' : 'check'}
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {submitting ? 'Saving...' : mode === 'import' ? 'Import' : 'Create'}
            </Button>
          ) : (
            onClose && (
              <Button
                variant="b2"
                size="sm"
                icon="close"
                title="Close scenario creator"
                onClick={onClose}
              />
            )
          )}
        </div>
      </header>

      {mode === 'create' ? (
        <>
          <div className="bb-create-scen-sheet__meta-card">
            <div
              className="bb-create-scen-sheet__portrait-box"
              title="Click or drop an image to set the scenario portrait (2:3)"
              onClick={() => portraitInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer?.files?.[0];
                if (file) handlePickPortrait(file);
              }}
            >
              <SafeImage
                src={avatarPreviewUrl}
                alt="Portrait preview"
                className="bb-create-scen-sheet__portrait-img"
                fallback={
                  <div className="bb-create-scen-sheet__portrait-placeholder">
                    <Icon name="image" size={20} />
                    <span>Portrait</span>
                    <small>PNG / WEBP</small>
                  </div>
                }
              />
              {avatarPreviewUrl && (
                <button
                  type="button"
                  className="bb-create-scen-sheet__portrait-clear"
                  title="Remove portrait (save as .json card)"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAvatarPreviewUrl('');
                    setAvatarPngBase64(null);
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              )}
              <input
                ref={portraitInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePickPortrait(file);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="bb-create-scen-sheet__top-fields">
              <div className="bb-create-scen-sheet__name-row">
                <div className="bb-create-scen-sheet__name-field">
                  <Input
                    size="sm"
                    label="Character / Scenario Name *"
                    placeholder="e.g. Seraphina, Cyberpunk Heist..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="bb-create-scen-sheet__spec-toggle">
                  <span className="bb-caption-text">Card Spec</span>
                  <SegmentedGroup
                    size="sm"
                    value={specVersion}
                    onChange={setSpecVersion}
                    options={[
                      { value: 'chara_card_v3', label: 'CCv3' },
                      { value: 'chara_card_v2', label: 'V2' },
                    ]}
                  />
                </div>
              </div>

              <Input
                size="sm"
                label="Tags (comma-separated)"
                placeholder="fantasy, slow-burn, sci-fi"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
              />

              {availableTags.length > 0 && (
                <div className="bb-create-scen-sheet__tag-suggestions">
                  {availableTags.slice(0, 10).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="bb-create-scen-sheet__tag-pill"
                      onClick={() => handleAddTagChipToInput(t.name)}
                    >
                      + {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <BookmarkRibbons
            variant="secondary"
            tabs={CREATE_EDITOR_TABS}
            activeId={editorTab}
            onChange={setEditorTab}
            className="bb-cs-tabs"
          />

          <div className="bb-create-scen-sheet__editor-stage">
            {editorTab === 'description' && (
              <MarkdownEditor
                label="Character Description & Lore"
                fillHeight
                placeholder="Describe {{char}}'s appearance, personality traits, and background..."
                value={description}
                onChange={setDescription}
              />
            )}

            {editorTab === 'firstMes' && (
              <MarkdownEditor
                label="First Message (Primary Greeting / Intro #1)"
                fillHeight
                placeholder="Write the opening scene for {{user}} and {{char}}..."
                value={firstMes}
                onChange={setFirstMes}
              />
            )}

            {editorTab === 'notes' && (
              <MarkdownEditor
                label="Creator's Notes"
                headerActions={
                  <span className="bb-caption-text">Not sent to AI prompt</span>
                }
                fillHeight
                placeholder="Optional usage notes, recommended models, or lore hints..."
                value={creatorNotes}
                onChange={setCreatorNotes}
              />
            )}
          </div>
        </>
      ) : (
        <div className="bb-create-scen-sheet__import-stage">
          <div
            className={`bb-create-scen-sheet__dropzone ${isDraggingOver ? 'is-dragging' : ''}`}
            onClick={() => importInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingOver(false);
              handleQueueImportFiles(e.dataTransfer?.files);
            }}
          >
            <Icon name="upload" size={28} />
            <div className="bb-create-scen-sheet__dropzone-title">
              Drop SillyTavern Card files here or click to browse
            </div>
            <div className="bb-caption-text">
              Supports Character Cards v2 / v3 (<code>.png</code> with <code>chara</code> /{' '}
              <code>ccv3</code> chunks and <code>.json</code> files)
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept=".png,.json,image/png,application/json"
              multiple
              hidden
              onChange={(e) => {
                handleQueueImportFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          <Switch
            checked={importEmbeddedTags}
            onChange={setImportEmbeddedTags}
            label="Import embedded card tags automatically"
            description="Syncs tags stored inside the PNG/JSON card into your NexusTavern tag list"
          />

          {importFiles.length > 0 && (
            <OverlayScrollArea
              className="bb-create-scen-sheet__file-list-wrap"
              viewportClassName="bb-create-scen-sheet__file-list"
              variant="compact"
            >
              <div className="bb-create-scen-sheet__file-list-header">
                <span>Queued files ({importFiles.length})</span>
                <button
                  type="button"
                  className="bb-create-scen-sheet__clear-btn"
                  onClick={() => setImportFiles([])}
                >
                  Clear all
                </button>
              </div>
              {importFiles.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="bb-create-scen-sheet__file-row">
                  <Icon
                    name={file.name.toLowerCase().endsWith('.png') ? 'image' : 'book'}
                    size={14}
                  />
                  <span className="bb-create-scen-sheet__file-name">{file.name}</span>
                  <span className="bb-create-scen-sheet__file-size">
                    {Math.max(1, Math.round(file.size / 1024))} KB
                  </span>
                  <button
                    type="button"
                    className="bb-create-scen-sheet__file-remove"
                    onClick={() =>
                      setImportFiles((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
            </OverlayScrollArea>
          )}
        </div>
      )}

      <footer className="bb-create-scen-sheet__footer">
        <div className="bb-create-scen-sheet__footer-meta">
          {statusMsg ? (
            <span className="bb-caption-text">{statusMsg}</span>
          ) : mode === 'create' ? (
            <span className="bb-caption-text">
              Est. card tokens: <strong>~{approxTotalTokens.toLocaleString()}</strong> tok ·{' '}
              {avatarPngBase64 ? 'Saves as .png card' : 'Saves as .json card (until portrait uploaded)'}
            </span>
          ) : (
            <span className="bb-caption-text">
              {importFiles.length > 0
                ? `${importFiles.length} file${importFiles.length === 1 ? '' : 's'} ready`
                : 'Select one or more .png / .json files'}
            </span>
          )}
        </div>

        <div className="bb-create-scen-sheet__footer-actions">
          <Button variant="b1" size="sm" emphasis="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="b1"
            size="sm"
            emphasis="filled"
            icon={mode === 'import' ? 'upload' : 'check'}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting
              ? mode === 'import'
                ? 'Importing...'
                : 'Creating...'
              : mode === 'import'
                ? `Import ${importFiles.length || ''} Card${importFiles.length === 1 ? '' : 's'}`
                : 'Create Scenario Card'}
          </Button>
        </div>
      </footer>
      <ImageCropModal {...createCropModalProps} />
    </div>
  );
});
