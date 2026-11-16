import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  BookmarkRibbons,
  Button,
  Input,
  MarkdownEditor,
  Icon,
  SafeImage,
  OverlayScrollArea,
  ImageCropModal,
  useImageCropQueue,
} from '@ui/index.js';
import './PersonaSheet.css';

function estimatePersonaTokens(text = '') {
  const clean = String(text || '').trim();
  if (!clean) return 0;
  return Math.max(1, Math.ceil(clean.length / 3.8));
}

function normalizeConnections(conns) {
  if (!Array.isArray(conns)) return [];
  const seen = new Set();
  const out = [];
  for (const c of conns) {
    if (!c || !c.id) continue;
    const type = c.type === 'group' ? 'group' : 'character';
    const id = String(c.id).trim();
    if (!id) continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, id });
  }
  return out;
}

export const PersonaSheet = forwardRef(function PersonaSheet(
  {
    initialMode = 'manage', // 'manage' | 'create'
    initialTargetAvatar = '',
    personas = [],
    activePersonaAvatar = '',
    cards = [],
    groups = [],
    activeCharacter = null,
    hasUserMessages = false,
    userMessageCount = 0,
    onClose,
    onCreatePersona,
    onSavePersona,
    onUploadPersonaAvatar,
    onDuplicatePersona,
    onDeletePersona,
    onSelectPersonaInChat,
    onConfirmReplacePersonaInChat,
    onDirtyChange,
  },
  ref,
) {
  const [mode, setMode] = useState(initialMode === 'create' ? 'create' : 'manage');
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'connections'

  // Editable draft fields
  const [nameDraft, setNameDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [connsDraft, setConnsDraft] = useState([]);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
  const [pendingAvatarBase64, setPendingAvatarBase64] = useState('');

  // Connections search & UI state
  const [entityQuery, setEntityQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUseInChat, setConfirmUseInChat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'ok' | 'error', text }

  const fileInputRef = useRef(null);

  const loadPersonaIntoDraft = useCallback((persona) => {
    if (!persona) return;
    setMode('manage');
    setSelectedAvatar(persona.avatar);
    setNameDraft(persona.name || '');
    setTitleDraft(persona.title || '');
    setDescDraft(persona.description || '');
    setConnsDraft(normalizeConnections(persona.connections));
    setAvatarPreviewUrl(persona.avatarUrl || persona.thumbnailUrl || null);
    setPendingAvatarBase64('');
    setConfirmDelete(false);
    setConfirmUseInChat(false);
    setFeedback(null);
  }, []);

  const resetForCreate = useCallback(() => {
    setMode('create');
    setSelectedAvatar('');
    setNameDraft('');
    setTitleDraft('');
    setDescDraft('');
    setConnsDraft([]);
    setAvatarPreviewUrl(null);
    setPendingAvatarBase64('');
    setActiveTab('details');
    setConfirmDelete(false);
    setConfirmUseInChat(false);
    setFeedback(null);
  }, []);

  useEffect(() => {
    setEntityQuery('');
    if (initialMode === 'create' || personas.length === 0) {
      resetForCreate();
      return;
    }
    const target =
      personas.find((p) => p.avatar === initialTargetAvatar) ||
      personas.find((p) => p.avatar === activePersonaAvatar) ||
      personas[0];
    if (target) {
      loadPersonaIntoDraft(target);
      setActiveTab('details');
    }
  }, [initialMode, initialTargetAvatar, resetForCreate, loadPersonaIntoDraft]);

  const selectedPersonaObj = useMemo(
    () => personas.find((p) => p.avatar === selectedAvatar) || null,
    [personas, selectedAvatar],
  );

  useEffect(() => {
    if (mode === 'manage' && selectedPersonaObj && !pendingAvatarBase64) {
      setAvatarPreviewUrl(
        selectedPersonaObj.avatarUrl || selectedPersonaObj.thumbnailUrl || null,
      );
    }
  }, [mode, selectedPersonaObj, pendingAvatarBase64]);

  const isDirty = useMemo(() => {
    if (mode === 'create') {
      return Boolean(
        nameDraft.trim() ||
          titleDraft.trim() ||
          descDraft.trim() ||
          pendingAvatarBase64 ||
          connsDraft.length > 0,
      );
    }
    if (!selectedPersonaObj) return false;
    if (pendingAvatarBase64) return true;
    if (nameDraft.trim() !== (selectedPersonaObj.name || '').trim()) return true;
    if (titleDraft.trim() !== (selectedPersonaObj.title || '').trim()) return true;
    if (descDraft !== (selectedPersonaObj.description || '')) return true;
    const origConns = JSON.stringify(normalizeConnections(selectedPersonaObj.connections));
    const nextConns = JSON.stringify(normalizeConnections(connsDraft));
    return origConns !== nextConns;
  }, [
    mode,
    selectedPersonaObj,
    nameDraft,
    titleDraft,
    descDraft,
    connsDraft,
    pendingAvatarBase64,
  ]);

  const allScenarioEntities = useMemo(() => {
    const list = [];
    for (const c of cards || []) {
      const av = c?.avatar || c?.id || '';
      if (!av || /^(?:c\d+|c_\d+)$/.test(String(av))) continue;
      list.push({
        type: 'character',
        id: av,
        stem: av.replace(/\.(png|json)$/i, ''),
        name: c.name || av,
        avatarUrl: c.thumbnailUrl || c.avatarUrl || null,
      });
    }
    for (const g of groups || []) {
      if (!g || g.id === undefined || g.id === null) continue;
      list.push({
        type: 'group',
        id: String(g.id),
        stem: String(g.id),
        name: g.name || 'Group',
        avatarUrl: g.avatarUrl || null,
      });
    }
    return list;
  }, [cards, groups]);

  const isEntityInDraft = useCallback(
    (ent) =>
      connsDraft.some(
        (c) =>
          c.type === ent.type &&
          (c.id === ent.id || (ent.type === 'character' && c.id === ent.stem)),
      ),
    [connsDraft],
  );

  const linkedEntities = useMemo(() => {
    const out = [];
    for (const conn of connsDraft) {
      const found = allScenarioEntities.find(
        (e) =>
          e.type === conn.type &&
          (e.id === conn.id || (e.type === 'character' && e.stem === conn.id)),
      );
      out.push(
        found || {
          type: conn.type,
          id: conn.id,
          stem: conn.id,
          name: String(conn.id).replace(/\.(png|json)$/i, ''),
          avatarUrl: null,
        },
      );
    }
    return out;
  }, [connsDraft, allScenarioEntities]);

  const activeCharEntity = useMemo(() => {
    const av = activeCharacter?.avatar || activeCharacter?.id || '';
    if (!av || /^(?:c\d+|c_\d+)$/.test(String(av))) return null;
    return (
      allScenarioEntities.find((e) => e.type === 'character' && e.id === av) || {
        type: 'character',
        id: av,
        stem: av.replace(/\.(png|json)$/i, ''),
        name: activeCharacter?.name || av,
        avatarUrl: activeCharacter?.thumbnailUrl || activeCharacter?.avatarUrl || null,
      }
    );
  }, [activeCharacter, allScenarioEntities]);

  const availableUnlinkedEntities = useMemo(() => {
    const q = entityQuery.trim().toLowerCase();
    const unlinked = allScenarioEntities.filter((e) => !isEntityInDraft(e));
    if (!q) return unlinked.slice(0, 12);
    return unlinked
      .filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
      .slice(0, 24);
  }, [allScenarioEntities, isEntityInDraft, entityQuery]);

  const toggleDraftEntityLink = (ent) => {
    if (!ent) return;
    setConnsDraft((prev) => {
      const exists = prev.some(
        (c) =>
          c.type === ent.type &&
          (c.id === ent.id || (ent.type === 'character' && c.id === ent.stem)),
      );
      if (exists) {
        return prev.filter(
          (c) =>
            !(
              c.type === ent.type &&
              (c.id === ent.id || (ent.type === 'character' && c.id === ent.stem))
            ),
        );
      }
      return [...prev, { type: ent.type, id: ent.id }];
    });
  };

  const { requestCropFile: requestPersonaCrop, cropModalProps: personaCropModalProps } =
    useImageCropQueue({ defaultTitle: 'Crop Persona Portrait' });

  const handleAvatarFileChosen = async (file) => {
    if (!file || !file.type?.startsWith('image/')) return;
    try {
      const cropped = await requestPersonaCrop(file, {
        title: 'Crop Persona Portrait',
      });
      if (!cropped?.dataUrl) return;
      setAvatarPreviewUrl(cropped.dataUrl);
      setPendingAvatarBase64(cropped.dataUrl);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Could not process image' });
    }
  };

  const handleSubmitSave = useCallback(async () => {
    const cleanName = nameDraft.trim();
    if (!cleanName) {
      setFeedback({ type: 'error', text: 'Display Name is required.' });
      return false;
    }
    setBusy(true);
    setFeedback(null);
    try {
      if (mode === 'create') {
        const res = await onCreatePersona?.({
          name: cleanName,
          title: titleDraft.trim(),
          description: descDraft,
          imageBase64: pendingAvatarBase64 || '',
          connections: normalizeConnections(connsDraft),
          setAsActive: !hasUserMessages,
        });
        const createdAv = res?.createdPersonaAvatar || '';
        const createdObj = (res?.personas || []).find((p) => p.avatar === createdAv);
        if (createdObj) {
          loadPersonaIntoDraft(createdObj);
          setFeedback({ type: 'ok', text: `Created "${createdObj.name}"` });
        } else {
          onClose?.({ skipGuard: true });
        }
      } else if (selectedAvatar) {
        if (pendingAvatarBase64 && onUploadPersonaAvatar) {
          await onUploadPersonaAvatar(selectedAvatar, pendingAvatarBase64);
        }
        const res = await onSavePersona?.(selectedAvatar, {
          name: cleanName,
          title: titleDraft.trim(),
          description: descDraft,
          connections: normalizeConnections(connsDraft),
        });
        setPendingAvatarBase64('');
        const updatedObj = (res?.personas || []).find((p) => p.avatar === selectedAvatar);
        if (updatedObj) {
          setAvatarPreviewUrl(updatedObj.avatarUrl || updatedObj.thumbnailUrl || null);
        }
        setFeedback({ type: 'ok', text: 'Saved changes' });
      }
      return true;
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to save persona' });
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    nameDraft,
    mode,
    titleDraft,
    descDraft,
    pendingAvatarBase64,
    connsDraft,
    hasUserMessages,
    selectedAvatar,
    onCreatePersona,
    onUploadPersonaAvatar,
    onSavePersona,
    loadPersonaIntoDraft,
    onClose,
  ]);

  const handleDiscardDraft = useCallback(() => {
    if (mode === 'create' || !selectedPersonaObj) {
      resetForCreate();
      return;
    }
    loadPersonaIntoDraft(selectedPersonaObj);
  }, [mode, selectedPersonaObj, resetForCreate, loadPersonaIntoDraft]);

  const canSaveDraft = Boolean(!busy && nameDraft.trim());

  useEffect(() => {
    const label =
      mode === 'create'
        ? nameDraft.trim() || 'New Persona'
        : selectedPersonaObj?.name || nameDraft.trim() || 'Persona';
    onDirtyChange?.({
      isDirty,
      canSave: canSaveDraft,
      cannotSaveReason: !nameDraft.trim()
        ? 'Enter a Display Name before saving, or discard changes.'
        : '',
      saveLabel: mode === 'create' ? 'Create & Close' : 'Save & Close',
      itemName: label,
      subtitle: mode === 'create' ? 'New Persona' : 'Persona Workspace',
      busy,
    });
  }, [isDirty, canSaveDraft, nameDraft, mode, selectedPersonaObj, busy, onDirtyChange]);

  useImperativeHandle(
    ref,
    () => ({
      isDirty,
      canSave: canSaveDraft,
      save: handleSubmitSave,
      discard: handleDiscardDraft,
    }),
    [isDirty, canSaveDraft, handleSubmitSave, handleDiscardDraft],
  );

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyS' || e.key?.toLowerCase() === 's')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!busy && nameDraft.trim() && (mode === 'create' || isDirty)) {
          handleSubmitSave();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [busy, nameDraft, mode, isDirty, handleSubmitSave]);

  const handleDuplicate = async () => {
    if (!selectedAvatar || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await onDuplicatePersona?.(selectedAvatar);
      const dupAv = res?.createdPersonaAvatar || '';
      const dupObj = (res?.personas || []).find((p) => p.avatar === dupAv);
      if (dupObj) {
        loadPersonaIntoDraft(dupObj);
        setFeedback({ type: 'ok', text: `Duplicated as "${dupObj.name}"` });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Duplicate failed' });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedAvatar || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await onDeletePersona?.(selectedAvatar);
      setConfirmDelete(false);
      onClose?.();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Delete failed' });
    } finally {
      setBusy(false);
    }
  };

  const handleUseSelectedInChat = async () => {
    if (!selectedPersonaObj || busy) return;
    if (hasUserMessages && userMessageCount > 0 && !confirmUseInChat) {
      setConfirmUseInChat(true);
      return;
    }
    setBusy(true);
    try {
      if (hasUserMessages && userMessageCount > 0) {
        await onConfirmReplacePersonaInChat?.(selectedPersonaObj);
      } else {
        await onSelectPersonaInChat?.(selectedPersonaObj.avatar);
      }
      setConfirmUseInChat(false);
      setFeedback({ type: 'ok', text: `Active in chat: "${selectedPersonaObj.name}"` });
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Could not switch persona' });
    } finally {
      setBusy(false);
    }
  };

  const tokenCount = useMemo(() => estimatePersonaTokens(descDraft), [descDraft]);
  const isSelectedActiveInChat =
    mode === 'manage' && Boolean(selectedAvatar && selectedAvatar === activePersonaAvatar);
  const canDelete = mode === 'manage' && personas.length > 1;

  const personaTabs = useMemo(
    () => [
      { id: 'details', label: 'I. Description' },
      {
        id: 'connections',
        label:
          linkedEntities.length > 0
            ? `II. Connections (${linkedEntities.length})`
            : 'II. Connections',
      },
    ],
    [linkedEntities.length],
  );

  return (
    <div className="bb-persona-sheet">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleAvatarFileChosen(f);
          e.target.value = '';
        }}
      />

      <header className="bb-persona-sheet__header">
        <div className="bb-persona-sheet__title-group">
          <span className="bb-persona-sheet__icon-badge" aria-hidden="true">
            <Icon name={mode === 'create' ? 'userPlus' : 'user'} size={16} />
          </span>
          <div className="bb-persona-sheet__titles">
            <div className="bb-persona-sheet__title-row">
              <span className="bb-persona-sheet__title">
                {mode === 'create'
                  ? 'New Persona'
                  : selectedPersonaObj?.name || nameDraft || 'Edit Persona'}
              </span>
              {isSelectedActiveInChat && (
                <span className="bb-persona-sheet__active-pill">Active in Chat</span>
              )}
            </div>
            <div className="bb-persona-sheet__subtitle">
              {mode === 'create'
                ? 'Create a user persona with portrait, description & scenario bindings'
                : 'Edit persona portrait, prompt description & scenario bindings'}
            </div>
          </div>
        </div>

        <div className="bb-persona-sheet__header-right">
          {onClose && (
            <Button
              variant="b2"
              size="sm"
              icon="close"
              title="Close persona sheet"
              onClick={onClose}
            />
          )}
        </div>
      </header>

      <div className="bb-persona-sheet__meta-card">
        <button
          type="button"
          className="bb-persona-sheet__portrait-box"
          title="Upload portrait (click or drop an image)"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const f = e.dataTransfer?.files?.[0];
            if (f) await handleAvatarFileChosen(f);
          }}
        >
          <SafeImage
            src={avatarPreviewUrl}
            alt="Persona portrait"
            className="bb-persona-sheet__portrait-img"
            draggable={false}
            fallback={
              <span className="bb-persona-sheet__portrait-placeholder">
                <Icon name="image" size={20} />
                <span>Portrait</span>
                <small>2:3 PNG</small>
              </span>
            }
          />
          <span className="bb-persona-sheet__portrait-cam" aria-hidden="true">
            <Icon name="edit" size={12} />
          </span>
        </button>

        <div className="bb-persona-sheet__top-fields">
          <Input
            size="sm"
            label="Display Name *"
            value={nameDraft}
            placeholder="e.g. Aki"
            onChange={(e) => setNameDraft(e.target.value)}
          />
          <Input
            size="sm"
            label="Subtitle / Tag (optional)"
            value={titleDraft}
            placeholder="e.g. Goblin, Mouse, Human"
            onChange={(e) => setTitleDraft(e.target.value)}
          />
        </div>
      </div>

      <BookmarkRibbons
        variant="secondary"
        tabs={personaTabs}
        activeId={activeTab}
        onChange={setActiveTab}
        className="bb-cs-tabs"
      />
      <div className="bb-persona-sheet__stage">
        {activeTab === 'details' ? (
          <MarkdownEditor
            label="Persona Description"
            fillHeight
            headerActions={
              <span className="bb-persona-sheet__token-pill">{`~${tokenCount} tokens`}</span>
            }
            value={descDraft}
            onChange={setDescDraft}
            placeholder="Describe who you are in the story. Injected into the prompt by the Prompt Manager block. You can use {{user}} and {{char}} macros."
          />
        ) : (
          <div className="bb-persona-sheet__conns">
            {activeCharEntity && (
              <div
                className={`bb-persona-sheet__entity-row ${
                  isEntityInDraft(activeCharEntity) ? 'is-linked' : ''
                }`}
              >
                <div className="bb-persona-sheet__entity-main">
                  <span className="bb-persona-sheet__entity-avatar">
                    <SafeImage
                      src={activeCharEntity.avatarUrl}
                      alt=""
                      draggable={false}
                      fallback={
                        <span className="bb-persona-sheet__entity-initials">
                          {activeCharEntity.name.slice(0, 2).toUpperCase()}
                        </span>
                      }
                    />
                  </span>
                  <span className="bb-persona-sheet__entity-info">
                    <span className="bb-persona-sheet__entity-name">{activeCharEntity.name}</span>
                    <span className="bb-persona-sheet__entity-sub">
                      {isEntityInDraft(activeCharEntity)
                        ? 'Linked — auto-selected in this scenario'
                        : 'Currently open scenario'}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  className={`bb-persona-sheet__pill-btn ${
                    isEntityInDraft(activeCharEntity) ? 'is-danger' : ''
                  }`}
                  onClick={() => toggleDraftEntityLink(activeCharEntity)}
                >
                  <Icon name={isEntityInDraft(activeCharEntity) ? 'unlink' : 'link'} size={13} />
                  <span>{isEntityInDraft(activeCharEntity) ? 'Unlink' : 'Link'}</span>
                </button>
              </div>
            )}

            <div className="bb-persona-sheet__search-wrap">
              <Icon name="search" size={16} className="bb-persona-sheet__search-icon" />
              <input
                type="text"
                value={entityQuery}
                onChange={(e) => setEntityQuery(e.target.value)}
                placeholder="Search characters or groups to link..."
                className="bb-persona-sheet__search-input"
              />
              {entityQuery && (
                <button
                  type="button"
                  className="bb-persona-sheet__search-clear"
                  onClick={() => setEntityQuery('')}
                  aria-label="Clear search"
                >
                  <Icon name="close" size={15} />
                </button>
              )}
            </div>
            <OverlayScrollArea
              className="bb-persona-sheet__conns-scroll-wrap"
              viewportClassName="bb-persona-sheet__conns-scroll"
              variant="compact"
            >
              <div className="bb-persona-sheet__sec-head">
                <span>{`Linked Scenarios (${linkedEntities.length})`}</span>
                {linkedEntities.length > 1 && (
                  <button
                    type="button"
                    className="bb-persona-sheet__text-btn"
                    onClick={() => setConnsDraft([])}
                  >
                    Unbind All
                  </button>
                )}
              </div>

              {linkedEntities.length === 0 ? (
                <div className="bb-persona-sheet__empty">
                  No linked scenarios. This persona will use the global active state.
                </div>
              ) : (
                <div className="bb-persona-sheet__entity-list">
                  {linkedEntities.map((ent) => (
                    <div
                      key={`${ent.type}:${ent.id}`}
                      className="bb-persona-sheet__entity-row is-linked"
                    >
                      <div className="bb-persona-sheet__entity-main">
                        <span className="bb-persona-sheet__entity-avatar">
                          <SafeImage
                            src={ent.avatarUrl}
                            alt=""
                            draggable={false}
                            fallback={
                              <span className="bb-persona-sheet__entity-initials">
                                {String(ent.name || 'CH').slice(0, 2).toUpperCase()}
                              </span>
                            }
                          />
                        </span>
                        <span className="bb-persona-sheet__entity-info">
                          <span className="bb-persona-sheet__entity-name">{ent.name}</span>
                          <span className="bb-persona-sheet__entity-sub">
                            {ent.type === 'group' ? 'Group' : 'Character'}
                          </span>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="bb-persona-sheet__pill-btn is-danger"
                        title={`Unlink ${ent.name}`}
                        onClick={() => toggleDraftEntityLink(ent)}
                      >
                        <Icon name="unlink" size={13} />
                        <span>Unbind</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {availableUnlinkedEntities.length > 0 && (
                <>
                  <div className="bb-persona-sheet__sec-head">
                    <span>Available to Link</span>
                  </div>
                  <div className="bb-persona-sheet__entity-list">
                    {availableUnlinkedEntities.map((ent) => (
                      <div
                        key={`${ent.type}:${ent.id}`}
                        className="bb-persona-sheet__entity-row"
                      >
                        <div className="bb-persona-sheet__entity-main">
                          <span className="bb-persona-sheet__entity-avatar">
                            <SafeImage
                              src={ent.avatarUrl}
                              alt=""
                              draggable={false}
                              fallback={
                                <span className="bb-persona-sheet__entity-initials">
                                  {String(ent.name || 'CH').slice(0, 2).toUpperCase()}
                                </span>
                              }
                            />
                          </span>
                          <span className="bb-persona-sheet__entity-info">
                            <span className="bb-persona-sheet__entity-name">{ent.name}</span>
                            <span className="bb-persona-sheet__entity-sub">
                              {ent.type === 'group' ? 'Group' : 'Character'}
                            </span>
                          </span>
                        </div>
                        <button
                          type="button"
                          className="bb-persona-sheet__pill-btn"
                          title={`Link ${ent.name}`}
                          onClick={() => toggleDraftEntityLink(ent)}
                        >
                          <Icon name="plus" size={13} />
                          <span>Link</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </OverlayScrollArea>
          </div>
        )}
      </div>
      {feedback && (
        <div className={`bb-persona-sheet__banner ${feedback.type === 'error' ? 'is-error' : ''}`}>
          {feedback.text}
        </div>
      )}

      <footer className="bb-persona-sheet__footer">
        <div className="bb-persona-sheet__footer-left">
          {mode === 'manage' ? (
            <>
              {confirmDelete ? (
                <>
                  <Button
                    variant="b4"
                    size="sm"
                    icon="trash"
                    disabled={busy}
                    onClick={handleConfirmDelete}
                  >
                    Confirm Delete
                  </Button>
                  <Button
                    variant="b2"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : confirmUseInChat ? (
                <>
                  <Button
                    variant="b1"
                    emphasis="filled"
                    size="sm"
                    icon="check"
                    disabled={busy}
                    onClick={handleUseSelectedInChat}
                  >
                    {`Replace ${userMessageCount} msg${userMessageCount === 1 ? '' : 's'}`}
                  </Button>
                  <Button
                    variant="b2"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirmUseInChat(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="bb-persona-sheet__circle-btn"
                    title="Duplicate persona"
                    disabled={busy}
                    onClick={handleDuplicate}
                  >
                    <Icon name="copy" size={15} />
                  </button>
                  <button
                    type="button"
                    className="bb-persona-sheet__circle-btn is-danger"
                    title={canDelete ? 'Delete persona' : 'Cannot delete the only persona'}
                    disabled={!canDelete || busy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                  {!isSelectedActiveInChat && (
                    <button
                      type="button"
                      className="bb-persona-sheet__pill-btn"
                      disabled={busy}
                      title="Switch current chat to this persona"
                      onClick={handleUseSelectedInChat}
                    >
                      <Icon name="check" size={14} />
                      <span>Use in Chat</span>
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <span className="bb-caption-text">
              Est. persona tokens: <strong>~{tokenCount.toLocaleString()}</strong> tok
            </span>
          )}
        </div>

        <div className="bb-persona-sheet__footer-right">
          <Button variant="b1" size="sm" emphasis="outlined" disabled={busy} onClick={onClose}>
            {mode === 'create' ? 'Cancel' : 'Close'}
          </Button>
          <Button
            variant="b1"
            emphasis="filled"
            size="sm"
            icon={mode === 'create' ? 'plus' : 'check'}
            disabled={busy || !nameDraft.trim() || (mode === 'manage' && !isDirty)}
            onClick={handleSubmitSave}
          >
            {busy
              ? 'Saving...'
              : mode === 'create'
                ? 'Create Persona'
                : 'Save Changes'}
          </Button>
        </div>
      </footer>
      <ImageCropModal {...personaCropModalProps} />
    </div>
  );
});



