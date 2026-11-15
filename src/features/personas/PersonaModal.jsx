import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Modal,
  Button,
  Input,
  MarkdownEditor,
  Icon,
  SafeImage,
  OverlayScrollArea,
} from '@ui/index.js';
import { convertImageFileToPngBase64 } from '@core/utils/imageCodec.js';
import './PersonaModal.css';

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

export function PersonaModal({
  open = false,
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
}) {
  const [mode, setMode] = useState(initialMode === 'create' ? 'create' : 'manage');
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'connections'
  const [rosterSearchOpen, setRosterSearchOpen] = useState(false);
  const [rosterQuery, setRosterQuery] = useState('');

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

  const loadPersonaIntoDraft = (persona) => {
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
  };

  const resetForCreate = () => {
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
  };

  useEffect(() => {
    if (!open) return;
    setRosterQuery('');
    setRosterSearchOpen(false);
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
  }, [open, initialMode, initialTargetAvatar]);

  const selectedPersonaObj = useMemo(
    () => personas.find((p) => p.avatar === selectedAvatar) || null,
    [personas, selectedAvatar],
  );

  // Sync fresh server avatar URL after upload/save when no local pending file is queued
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

  const filteredRoster = useMemo(() => {
    const q = rosterQuery.trim().toLowerCase();
    if (!q) return personas;
    return personas.filter((p) =>
      `${p.name || ''} ${p.title || ''}`.toLowerCase().includes(q),
    );
  }, [personas, rosterQuery]);

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

  const isEntityInDraft = (ent) =>
    connsDraft.some(
      (c) =>
        c.type === ent.type &&
        (c.id === ent.id || (ent.type === 'character' && c.id === ent.stem)),
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
    if (!q) return unlinked.slice(0, 8);
    return unlinked
      .filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
      .slice(0, 14);
  }, [allScenarioEntities, connsDraft, entityQuery]);

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

  const handleAvatarFileChosen = async (file) => {
    if (!file || !file.type?.startsWith('image/')) return;
    try {
      const dataUrl = await convertImageFileToPngBase64(file);
      if (!dataUrl) return;
      setAvatarPreviewUrl(dataUrl);
      setPendingAvatarBase64(dataUrl);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Could not process image' });
    }
  };
  const handleSubmitSave = async () => {
    const cleanName = nameDraft.trim();
    if (!cleanName) {
      setFeedback({ type: 'error', text: 'Display Name is required.' });
      return;
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
          onClose?.();
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
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to save persona' });
    } finally {
      setBusy(false);
    }
  };

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
      const res = await onDeletePersona?.(selectedAvatar);
      const nextList = res?.personas || [];
      setConfirmDelete(false);
      if (nextList.length > 0) {
        const nextTarget =
          nextList.find((p) => p.avatar === res?.activePersonaAvatar) || nextList[0];
        loadPersonaIntoDraft(nextTarget);
      } else {
        resetForCreate();
      }
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

  const modalFooter = (
    <div className="bb-pmodal__footer">
      <div className="bb-pmodal__footer-left">
        {mode === 'manage' && (
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
                  className="bb-pmodal__circle-btn"
                  title="Duplicate persona"
                  disabled={busy}
                  onClick={handleDuplicate}
                >
                  <Icon name="copy" size={15} />
                </button>
                <button
                  type="button"
                  className="bb-pmodal__circle-btn is-danger"
                  title={canDelete ? 'Delete persona' : 'Cannot delete the only persona'}
                  disabled={!canDelete || busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Icon name="trash" size={15} />
                </button>
                {!isSelectedActiveInChat && (
                  <button
                    type="button"
                    className="bb-pmodal__pill-btn"
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
        )}
      </div>

      <div className="bb-pmodal__footer-right">
        <Button variant="b2" size="sm" disabled={busy} onClick={onClose}>
          Close
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
    </div>
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'New Persona' : 'Personas'}
      icon="user"
      width={540}
      className="bb-pmodal-frame"
      footer={modalFooter}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleAvatarFileChosen(f);
          e.target.value = '';
        }}
      />

      {personas.length > 0 && (
        <div className="bb-pmodal__roster-wrap">
          <div className="bb-pmodal__roster-bar">
            <div className="bb-pmodal__roster bb-scrollbar--hidden">
              <button
                type="button"
                className={`bb-pmodal__new-pill ${mode === 'create' ? 'is-active' : ''}`}
                onClick={resetForCreate}
              >
                <Icon name="plus" size={15} />
                <span>New</span>
              </button>

              {filteredRoster.map((p) => {
                const isSel = mode === 'manage' && p.avatar === selectedAvatar;
                const isChatActive = p.avatar === activePersonaAvatar;
                const thumb = p.thumbnailUrl || p.avatarUrl || null;
                const init = String(p.name || 'ME').slice(0, 2).toUpperCase();
                return (
                  <button
                    key={p.avatar}
                    type="button"
                    className={`bb-pmodal__roster-item ${isSel ? 'is-selected' : ''}`}
                    onClick={() => loadPersonaIntoDraft(p)}
                  >
                    <span className="bb-pmodal__roster-avatar">
                      <SafeImage
                        src={thumb}
                        alt=""
                        draggable={false}
                        fallback={<span className="bb-pmodal__roster-initials">{init}</span>}
                      />
                    </span>
                    <span className="bb-pmodal__roster-name">{p.name}</span>
                    {isChatActive && (
                      <span className="bb-pmodal__roster-dot" title="Active in current chat" />
                    )}
                  </button>
                );
              })}
            </div>

            {personas.length >= 5 && (
              <button
                type="button"
                className={`bb-pmodal__roster-search-btn ${rosterSearchOpen ? 'is-active' : ''}`}
                title="Filter personas"
                onClick={() => {
                  setRosterSearchOpen((v) => !v);
                  setRosterQuery('');
                }}
              >
                <Icon name="search" size={15} />
              </button>
            )}
          </div>

          {rosterSearchOpen && (
            <div className="bb-pmodal__search-wrap">
              <Icon name="search" size={16} className="bb-pmodal__search-icon" />
              <input
                type="text"
                value={rosterQuery}
                onChange={(e) => setRosterQuery(e.target.value)}
                placeholder="Filter personas..."
                className="bb-pmodal__search-input"
              />
              {rosterQuery && (
                <button
                  type="button"
                  className="bb-pmodal__search-clear"
                  onClick={() => setRosterQuery('')}
                >
                  <Icon name="close" size={15} />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bb-pmodal__hero">
        <button
          type="button"
          className="bb-pmodal__portrait-btn"
          title="Upload portrait (click or drop an image)"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            const f = e.dataTransfer?.files?.[0];
            if (f) await handleAvatarFileChosen(f);
          }}
        >
          <SafeImage
            src={avatarPreviewUrl}
            alt=""
            className="bb-pmodal__portrait-img"
            draggable={false}
            fallback={
              <span className="bb-pmodal__portrait-empty">
                <Icon name="image" size={20} />
                <span>2:3</span>
              </span>
            }
          />
          <span className="bb-pmodal__portrait-cam">
            <Icon name="edit" size={12} />
          </span>
        </button>

        <div className="bb-pmodal__hero-fields">
          <Input
            label="Display Name"
            value={nameDraft}
            placeholder="e.g. Aki"
            onChange={(e) => setNameDraft(e.target.value)}
          />
          <Input
            label="Subtitle / Tag (optional)"
            value={titleDraft}
            placeholder="e.g. Goblin, Mouse, Human"
            onChange={(e) => setTitleDraft(e.target.value)}
          />
        </div>
      </div>

      <div className="bb-pmodal__tabs">
        <button
          type="button"
          className={`bb-pmodal__tab ${activeTab === 'details' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          <Icon name="paragraph" size={14} />
          <span>Description</span>
        </button>
        <button
          type="button"
          className={`bb-pmodal__tab ${activeTab === 'connections' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('connections')}
        >
          <Icon name="link" size={14} />
          <span>Connections</span>
          <span className="bb-pmodal__tab-badge">{linkedEntities.length}</span>
        </button>
      </div>

      {activeTab === 'details' ? (
        <>
          <div className="bb-pmodal__desc-meta">
            <span>Injected into the prompt by the Prompt Manager block.</span>
            <span className="bb-pmodal__token-pill">{`~${tokenCount} tokens`}</span>
          </div>
          <MarkdownEditor
            label="Persona Description"
            value={descDraft}
            onChange={setDescDraft}
            placeholder="Describe who you are in the story. You can use {{user}} and {{char}} macros."
          />
        </>
      ) : (
        <div className="bb-pmodal__conns">
          {activeCharEntity && (
            <div
              className={`bb-pmodal__entity-row ${
                isEntityInDraft(activeCharEntity) ? 'is-linked' : ''
              }`}
            >
              <div className="bb-pmodal__entity-main">
                <span className="bb-pmodal__entity-avatar">
                  <SafeImage
                    src={activeCharEntity.avatarUrl}
                    alt=""
                    draggable={false}
                    fallback={
                      <span className="bb-pmodal__entity-initials">
                        {activeCharEntity.name.slice(0, 2).toUpperCase()}
                      </span>
                    }
                  />
                </span>
                <span className="bb-pmodal__entity-info">
                  <span className="bb-pmodal__entity-name">{activeCharEntity.name}</span>
                  <span className="bb-pmodal__entity-sub">
                    {isEntityInDraft(activeCharEntity)
                      ? 'Linked — auto-selected in this scenario'
                      : 'Currently open scenario'}
                  </span>
                </span>
              </div>
              <button
                type="button"
                className={`bb-pmodal__pill-btn ${
                  isEntityInDraft(activeCharEntity) ? 'is-danger' : ''
                }`}
                onClick={() => toggleDraftEntityLink(activeCharEntity)}
              >
                <Icon name={isEntityInDraft(activeCharEntity) ? 'unlink' : 'link'} size={13} />
                <span>{isEntityInDraft(activeCharEntity) ? 'Unlink' : 'Link'}</span>
              </button>
            </div>
          )}

          <div className="bb-pmodal__search-wrap">
            <Icon name="search" size={16} className="bb-pmodal__search-icon" />
            <input
              type="text"
              value={entityQuery}
              onChange={(e) => setEntityQuery(e.target.value)}
              placeholder="Search characters or groups to link..."
              className="bb-pmodal__search-input"
            />
            {entityQuery && (
              <button
                type="button"
                className="bb-pmodal__search-clear"
                onClick={() => setEntityQuery('')}
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </div>

          <div className="bb-pmodal__sec-head">
            <span>{`Linked Scenarios (${linkedEntities.length})`}</span>
            {linkedEntities.length > 1 && (
              <button
                type="button"
                className="bb-pmodal__text-btn"
                onClick={() => setConnsDraft([])}
              >
                Unbind All
              </button>
            )}
          </div>

          {linkedEntities.length === 0 ? (
            <div className="bb-pmodal__empty">
              No linked scenarios. This persona will use the global active state.
            </div>
          ) : (
            <OverlayScrollArea
              viewportClassName="bb-pmodal__entity-list"
              variant="compact"
            >
              {linkedEntities.map((ent) => (
                <div key={`${ent.type}:${ent.id}`} className="bb-pmodal__entity-row is-linked">
                  <div className="bb-pmodal__entity-main">
                    <span className="bb-pmodal__entity-avatar">
                      <SafeImage
                        src={ent.avatarUrl}
                        alt=""
                        draggable={false}
                        fallback={
                          <span className="bb-pmodal__entity-initials">
                            {String(ent.name || 'CH').slice(0, 2).toUpperCase()}
                          </span>
                        }
                      />
                    </span>
                    <span className="bb-pmodal__entity-info">
                      <span className="bb-pmodal__entity-name">{ent.name}</span>
                      <span className="bb-pmodal__entity-sub">
                        {ent.type === 'group' ? 'Group' : 'Character'}
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="bb-pmodal__pill-btn is-danger"
                    title={`Unlink ${ent.name}`}
                    onClick={() => toggleDraftEntityLink(ent)}
                  >
                    <Icon name="unlink" size={13} />
                    <span>Unbind</span>
                  </button>
                </div>
              ))}
            </OverlayScrollArea>
          )}

          {availableUnlinkedEntities.length > 0 && (
            <>
              <div className="bb-pmodal__sec-head">
                <span>Available to Link</span>
              </div>
              <OverlayScrollArea
                viewportClassName="bb-pmodal__entity-list"
                variant="compact"
              >
                {availableUnlinkedEntities.map((ent) => (
                  <div key={`${ent.type}:${ent.id}`} className="bb-pmodal__entity-row">
                    <div className="bb-pmodal__entity-main">
                      <span className="bb-pmodal__entity-avatar">
                        <SafeImage
                          src={ent.avatarUrl}
                          alt=""
                          draggable={false}
                          fallback={
                            <span className="bb-pmodal__entity-initials">
                              {String(ent.name || 'CH').slice(0, 2).toUpperCase()}
                            </span>
                          }
                        />
                      </span>
                      <span className="bb-pmodal__entity-info">
                        <span className="bb-pmodal__entity-name">{ent.name}</span>
                        <span className="bb-pmodal__entity-sub">
                          {ent.type === 'group' ? 'Group' : 'Character'}
                        </span>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="bb-pmodal__pill-btn"
                      title={`Link ${ent.name}`}
                      onClick={() => toggleDraftEntityLink(ent)}
                    >
                      <Icon name="plus" size={13} />
                      <span>Link</span>
                    </button>
                  </div>
                ))}
              </OverlayScrollArea>
            </>
          )}
        </div>
      )}

      {feedback && (
        <div className={`bb-pmodal__banner ${feedback.type === 'error' ? 'is-error' : ''}`}>
          {feedback.text}
        </div>
      )}
    </Modal>
  );
}



