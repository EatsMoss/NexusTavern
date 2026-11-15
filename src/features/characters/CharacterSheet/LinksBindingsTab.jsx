import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderCard,
  Button,
  Input,
  Switch,
  Dropdown,
  Icon,
  SafeImage,
} from '@ui/index.js';

function isPersonaLinkedToCard(persona, cardAvatar) {
  if (!persona || !cardAvatar) return false;
  const stem = String(cardAvatar).replace(/\.(png|json)$/i, '');
  const conns = Array.isArray(persona.connections) ? persona.connections : [];
  return conns.some(
    (c) =>
      c &&
      c.type === 'character' &&
      (c.id === cardAvatar || c.id === stem),
  );
}

export function LinksBindingsTab({
  card,
  allTags = [],
  personas = [],
  worlds = [],
  themePresets = [],
  activeChatFile = '',
  activeChatWorld = '',
  busyAction = false,
  onAssignTag,
  onRemoveTag,
  onCreateAndAssignTag,
  onImportEmbeddedTags,
  onBindPersona,
  onUnbindPersona,
  onUnbindAllPersonas,
  onSelectActivePersona,
  openaiPresets = [],
  starredPresets = [],
  onToggleStarPreset,
  activePresetName = '',
  boundPresetName = '',
  onBindPreset,
  onUnbindPreset,
  onActivatePreset,
  onOpenPresetInspector,
  onChangePrimaryWorld,
  onAddAuxWorld,
  onRemoveAuxWorld,
  onImportEmbeddedLore,
  onChangeChatWorld,
  onUpdateScenarioMeta,
}) {
  const [tagQuery, setTagQuery] = useState('');
  const [sourceUrlDraft, setSourceUrlDraft] = useState(card?.scenarioMeta?.sourceUrl || '');

  useEffect(() => {
    setSourceUrlDraft(card?.scenarioMeta?.sourceUrl || '');
    setTagQuery('');
  }, [card?.avatar, card?.scenarioMeta?.sourceUrl]);

  const avatar = card?.avatar || '';
  const assignedTagIds = useMemo(
    () => new Set((card?.tagIds || []).map(String)),
    [card?.tagIds],
  );

  const assignedTagObjs = useMemo(
    () => allTags.filter((t) => assignedTagIds.has(String(t.id))),
    [allTags, assignedTagIds],
  );

  const assignedNameLowerSet = useMemo(
    () => new Set(assignedTagObjs.map((t) => String(t.name || '').trim().toLowerCase())),
    [assignedTagObjs],
  );

  const unimportedEmbeddedTags = useMemo(() => {
    const emb = Array.isArray(card?.embeddedTags) ? card.embeddedTags : [];
    return emb.filter(
      (name) => name && !assignedNameLowerSet.has(String(name).trim().toLowerCase()),
    );
  }, [card?.embeddedTags, assignedNameLowerSet]);

  const suggestedTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    return allTags
      .filter((t) => !assignedTagIds.has(String(t.id)))
      .filter((t) => (!q ? true : String(t.name || '').toLowerCase().includes(q)))
      .slice(0, 12);
  }, [allTags, assignedTagIds, tagQuery]);

  const connectedPersonas = useMemo(
    () => personas.filter((p) => isPersonaLinkedToCard(p, avatar)),
    [personas, avatar],
  );

  const unboundPersonaOptions = useMemo(
    () =>
      personas
        .filter((p) => !isPersonaLinkedToCard(p, avatar))
        .map((p) => ({
          value: p.avatar,
          label: p.name || p.avatar,
          meta: p.isActive ? 'Active' : '',
        })),
    [personas, avatar],
  );

  const boundPresetObj = useMemo(
    () => openaiPresets.find((p) => p.name === boundPresetName) || null,
    [openaiPresets, boundPresetName],
  );

  const presetPickerOptions = useMemo(
    () =>
      openaiPresets
        .filter((p) => p.name !== boundPresetName)
        .map((p) => ({
          value: p.name,
          label: p.name,
          meta:
            p.name === activePresetName
              ? 'Active'
              : p.promptsCount !== undefined
                ? `${p.promptsCount} prompts`
                : '',
        })),
    [openaiPresets, boundPresetName, activePresetName],
  );

  const primaryWorld = String(card?.extensions?.world || '').trim();
  const auxWorlds = Array.isArray(card?.auxWorlds) ? card.auxWorlds : [];
  const loreEntriesCount = Number(card?.loreEntriesCount || 0);

  const worldDropdownOptions = useMemo(() => {
    const base = [{ value: '', label: '— None —', meta: '' }];
    const seen = new Set(['']);
    for (const w of worlds) {
      seen.add(w.name);
      base.push({
        value: w.name,
        label: w.name,
        meta: `${w.entriesCount || 0} entries`,
      });
    }
    if (primaryWorld && !seen.has(primaryWorld)) {
      base.push({ value: primaryWorld, label: `${primaryWorld} (missing)`, meta: 'missing' });
    }
    if (activeChatWorld && !seen.has(activeChatWorld)) {
      base.push({ value: activeChatWorld, label: `${activeChatWorld} (missing)`, meta: 'missing' });
    }
    return base;
  }, [worlds, primaryWorld, activeChatWorld]);

  const auxCandidateOptions = useMemo(() => {
    const used = new Set([primaryWorld, ...auxWorlds].filter(Boolean));
    return worlds
      .filter((w) => !used.has(w.name))
      .map((w) => ({
        value: w.name,
        label: w.name,
        meta: `${w.entriesCount || 0} entries`,
      }));
  }, [worlds, primaryWorld, auxWorlds]);

  const themeOptions = useMemo(
    () => [
      { value: '', label: '— Follow Global Theme —', meta: '' },
      ...themePresets.map((t) => ({
        value: t.id,
        label: t.name,
        meta: t.primaryHex || '',
      })),
    ],
    [themePresets],
  );

  const handleTagInputSubmit = () => {
    const clean = tagQuery.trim();
    if (!clean) return;
    const exactMatch = allTags.find(
      (t) => String(t.name || '').trim().toLowerCase() === clean.toLowerCase(),
    );
    if (exactMatch) {
      if (!assignedTagIds.has(String(exactMatch.id))) {
        onAssignTag?.(exactMatch.id);
      }
    } else {
      onCreateAndAssignTag?.(clean);
    }
    setTagQuery('');
  };

  const commitSourceUrl = () => {
    const clean = String(sourceUrlDraft || '').trim();
    if (clean !== String(card?.scenarioMeta?.sourceUrl || '')) {
      onUpdateScenarioMeta?.({ sourceUrl: clean });
    }
  };

  const isValidExternalUrl = /^https?:\/\/.+/i.test(String(sourceUrlDraft || '').trim());

  return (
    <div className="bb-cs-links-tab">
      <FolderCard
        title="Scenario Tags"
        subtitle={`${assignedTagObjs.length} assigned${
          unimportedEmbeddedTags.length > 0
            ? ` · ${unimportedEmbeddedTags.length} embedded in card`
            : ''
        }`}
        icon="tags"
        defaultOpen
        actions={
          unimportedEmbeddedTags.length > 0 ? (
            <Button
              variant="b1"
              size="sm"
              emphasis="tonal"
              icon="download"
              disabled={busyAction}
              title="Import embedded PNG/JSON tags into global tag map"
              onClick={onImportEmbeddedTags}
            >
              Import ({unimportedEmbeddedTags.length})
            </Button>
          ) : null
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assignedTagObjs.length > 0 || unimportedEmbeddedTags.length > 0 ? (
            <div className="bb-cs-tag-cloud">
              {assignedTagObjs.map((t) => (
                <span key={t.id} className="bb-cs-tag-pill">
                  <span>{t.name}</span>
                  <button
                    type="button"
                    className="bb-cs-tag-pill__rm"
                    title={`Detach tag "${t.name}"`}
                    onClick={() => onRemoveTag?.(t.id)}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </span>
              ))}
              {unimportedEmbeddedTags.map((name) => (
                <span
                  key={`emb-${name}`}
                  className="bb-cs-tag-pill bb-cs-tag-pill--embedded"
                  title="Embedded inside card metadata — click Import to promote to global tag"
                >
                  <span>{name}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="bb-caption-text">No tags assigned to this scenario yet.</div>
          )}

          <div className="bb-cs-tag-add-row">
            <input
              type="text"
              className="bb-cs-tag-add-input"
              value={tagQuery}
              maxLength={40}
              placeholder="Filter existing tags or type a new tag..."
              onChange={(e) => setTagQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagQuery.trim()) {
                  e.preventDefault();
                  handleTagInputSubmit();
                }
              }}
            />
            <Button
              variant="b1"
              size="sm"
              emphasis="tonal"
              icon="plus"
              disabled={!tagQuery.trim()}
              onClick={handleTagInputSubmit}
            >
              Add
            </Button>
          </div>

          {suggestedTags.length > 0 && (
            <div className="bb-cs-tag-suggestions">
              {suggestedTags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="bb-cs-tag-suggest-btn"
                  title={`Assign "${t.name}"`}
                  onClick={() => {
                    onAssignTag?.(t.id);
                    setTagQuery('');
                  }}
                >
                  <Icon name="plus" size={11} />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </FolderCard>

      <FolderCard
        title="Connected Personas"
        subtitle={
          connectedPersonas.length > 0
            ? `${connectedPersonas.length} persona(s) locked to this scenario`
            : 'Auto-switch persona when opening this scenario'
        }
        icon="user"
        defaultOpen
        actions={
          connectedPersonas.length > 1 ? (
            <Button
              variant="b2"
              size="sm"
              icon="unlink"
              disabled={busyAction}
              title="Unbind all personas from this scenario"
              onClick={onUnbindAllPersonas}
            >
              Unbind All
            </Button>
          ) : null
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {connectedPersonas.length > 0 ? (
            <div className="bb-cs-persona-list">
              {connectedPersonas.map((p) => (
                <div key={p.avatar} className="bb-cs-persona-row">
                  <button
                    type="button"
                    className="bb-cs-persona-row__main"
                    title="Click to activate this persona now"
                    onClick={() => onSelectActivePersona?.(p.avatar)}
                  >
                    <SafeImage
                      src={p.thumbnailUrl || p.avatarUrl}
                      alt={p.name}
                      className="bb-cs-persona-row__avatar"
                      draggable={false}
                      fallback={
                        <span className="bb-cs-persona-row__avatar bb-cs-persona-row__avatar--fallback">
                          {String(p.name || 'ME').slice(0, 2).toUpperCase()}
                        </span>
                      }
                    />
                    <span className="bb-cs-persona-row__name">{p.name}</span>
                    {p.isActive && <span className="bb-cs-badge">Active</span>}
                  </button>
                  <Button
                    variant="b2"
                    size="sm"
                    icon="unlink"
                    title={`Unbind ${p.name} from this scenario`}
                    onClick={() => onUnbindPersona?.(p.avatar)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="bb-caption-text">No personas are locked to this scenario.</div>
          )}

          {unboundPersonaOptions.length > 0 && (
            <Dropdown
              options={unboundPersonaOptions}
              value=""
              onChange={(personaAvatar) => {
                if (personaAvatar) onBindPersona?.(personaAvatar);
              }}
              allowStars={false}
              placeholder="+ Bind Persona to Scenario..."
              searchPlaceholder="Search personas..."
            />
          )}
        </div>
      </FolderCard>

      <FolderCard
        title="Bound Completion Preset"
        subtitle={
          boundPresetName
            ? `Auto-activates "${boundPresetName}" when opening this scenario`
            : 'Auto-switch prompt preset when opening this scenario'
        }
        icon="sliders"
        defaultOpen
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {boundPresetName ? (
            <div className="bb-cs-persona-list">
              <div className="bb-cs-persona-row">
                <button
                  type="button"
                  className="bb-cs-persona-row__main"
                  title={
                    boundPresetName === activePresetName
                      ? `"${boundPresetName}" is currently active`
                      : `Click to activate "${boundPresetName}" now`
                  }
                  onClick={() => {
                    if (boundPresetObj && boundPresetName !== activePresetName) {
                      onActivatePreset?.(boundPresetName);
                    }
                  }}
                >
                  <span
                    className={`bb-cs-preset-row__icon ${
                      boundPresetName === activePresetName ? 'is-active' : ''
                    }`}
                  >
                    <Icon name="sliders" size={17} />
                  </span>
                  <span className="bb-cs-preset-row__info">
                    <span className="bb-cs-persona-row__name">{boundPresetName}</span>
                    <span className="bb-cs-preset-row__sub">
                      {boundPresetObj
                        ? boundPresetObj.promptsCount !== undefined
                          ? `${boundPresetObj.promptsCount} prompt blocks`
                          : 'Chat Completion Preset'
                        : 'Preset file not found on disk'}
                    </span>
                  </span>
                  {boundPresetName === activePresetName && (
                    <span className="bb-cs-badge">Active</span>
                  )}
                </button>
                <div className="bb-cs-preset-row__actions">
                  {onOpenPresetInspector && boundPresetObj && (
                    <Button
                      variant="b2"
                      size="sm"
                      icon="sliders"
                      disabled={busyAction}
                      title="Open Prompts inspector"
                      onClick={() => {
                        if (boundPresetName !== activePresetName) {
                          onActivatePreset?.(boundPresetName);
                        }
                        onOpenPresetInspector();
                      }}
                    />
                  )}
                  <Button
                    variant="b2"
                    size="sm"
                    icon="unlink"
                    disabled={busyAction}
                    title={`Unbind "${boundPresetName}" from this scenario`}
                    onClick={() => onUnbindPreset?.()}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="bb-caption-text">
              No completion preset is bound to this scenario.
            </div>
          )}

          {presetPickerOptions.length > 0 && (
            <Dropdown
              options={presetPickerOptions}
              value=""
              onChange={(presetName) => {
                if (presetName) onBindPreset?.(presetName);
              }}
              starredValues={starredPresets}
              onToggleStar={onToggleStarPreset}
              allowStars={Boolean(onToggleStarPreset)}
              placeholder={
                boundPresetName
                  ? 'Switch Bound Preset...'
                  : '+ Bind Preset to Scenario...'
              }
              searchPlaceholder="Search presets..."
            />
          )}
        </div>
      </FolderCard>

      <FolderCard
        title="Lorebooks & World Info"
        subtitle="Embedded card lore, primary world, auxiliary worlds & chat lore"
        icon="bookAtlas"
        defaultOpen
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="bb-cs-lore-embedded-bar">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>
                Embedded Character Book
              </span>
              <span className="bb-caption-text">
                {loreEntriesCount > 0
                  ? `${loreEntriesCount} embedded ${loreEntriesCount === 1 ? 'entry' : 'entries'} inside card`
                  : 'No embedded character_book inside this card'}
              </span>
            </div>
            {loreEntriesCount > 0 && (
              <Button
                variant="b1"
                size="sm"
                emphasis="tonal"
                icon="download"
                disabled={busyAction}
                title="Extract embedded character_book into data/default-user/worlds/ and link as Primary World"
                onClick={onImportEmbeddedLore}
              >
                Extract to Worlds
              </Button>
            )}
          </div>

          <Dropdown
            label="Primary Character World (extensions.world)"
            options={worldDropdownOptions}
            value={primaryWorld}
            onChange={(val) => onChangePrimaryWorld?.(val)}
            allowStars={false}
            placeholder="— None —"
            searchPlaceholder="Filter world files..."
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="bb-caption-text" style={{ fontWeight: 700 }}>
              Auxiliary Linked Worlds (settings.json → charLore)
            </span>
            {auxWorlds.length > 0 && (
              <div className="bb-cs-tag-cloud">
                {auxWorlds.map((wName) => (
                  <span key={wName} className="bb-cs-tag-pill">
                    <Icon name="bookAtlas" size={12} />
                    <span>{wName}</span>
                    <button
                      type="button"
                      className="bb-cs-tag-pill__rm"
                      title={`Unlink auxiliary world "${wName}"`}
                      onClick={() => onRemoveAuxWorld?.(wName)}
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {auxCandidateOptions.length > 0 ? (
              <Dropdown
                options={auxCandidateOptions}
                value=""
                onChange={(val) => {
                  if (val) onAddAuxWorld?.(val);
                }}
                allowStars={false}
                placeholder="+ Link Auxiliary World..."
                searchPlaceholder="Filter world files..."
              />
            ) : worlds.length === 0 ? (
              <div className="bb-caption-text">
                No `.json` lorebooks in `worlds/` yet.
              </div>
            ) : null}
          </div>

          {activeChatFile ? (
            <Dropdown
              label={`Active Chat Lore (${activeChatFile})`}
              options={worldDropdownOptions}
              value={activeChatWorld || ''}
              onChange={(val) => onChangeChatWorld?.(val)}
              allowStars={false}
              placeholder="— None —"
              searchPlaceholder="Filter world files..."
            />
          ) : (
            <div className="bb-caption-text">
              Start or open a chat session to bind a per-chat lorebook (`chat_metadata.world_info`).
            </div>
          )}
        </div>
      </FolderCard>

      <FolderCard
        title="Theme, Source & Media"
        subtitle="Per-scenario palette, card origin link & external media policy"
        icon="palette"
        defaultOpen
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Dropdown
            label="Scenario Theme Preset"
            options={themeOptions}
            value={card?.scenarioMeta?.themePresetId || ''}
            onChange={(val) => onUpdateScenarioMeta?.({ themePresetId: val || null })}
            allowStars={false}
            searchable={false}
            placeholder="— Follow Global Theme —"
          />

          <div className="bb-cs-url-row">
            <Input
              label="Source URL"
              placeholder="https://..."
              value={sourceUrlDraft}
              onChange={(e) => setSourceUrlDraft(e.target.value)}
              onBlur={commitSourceUrl}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitSourceUrl();
                  e.currentTarget.blur();
                }
              }}
            />
            {isValidExternalUrl && (
              <Button
                variant="b1"
                size="sm"
                emphasis="tonal"
                icon="externalLink"
                title="Open source URL in a new browser tab"
                onClick={() =>
                  window.open(String(sourceUrlDraft).trim(), '_blank', 'noopener,noreferrer')
                }
              >
                Open
              </Button>
            )}
          </div>

          <Switch
            checked={card?.scenarioMeta?.externalMediaAllowed !== false}
            onChange={(checked) =>
              onUpdateScenarioMeta?.({ externalMediaAllowed: Boolean(checked) })
            }
            label="Allow External Media"
            description="Permit external images/audio embedded inside messages of this scenario"
          />
        </div>
      </FolderCard>
    </div>
  );
}
