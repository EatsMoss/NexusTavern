import React, { useMemo } from 'react';
import {
  Button,
  FolderCard,
  IntroCard,
  SortableStack,
  estimateIntroTokens,
} from '@ui/index.js';

export function padIntroMetaArray(rawList, length) {
  const arr = Array.isArray(rawList) ? rawList : [];
  return Array.from({ length }, (_, idx) => {
    const item = arr[idx];
    return {
      title: typeof item?.title === 'string' ? item.title : '',
      portraitUrl: item?.portraitUrl || null,
      rawPortraitUrl: item?.rawPortraitUrl || item?.portraitUrl || null,
    };
  });
}

export function toServerIntroMetaPayload(uiList) {
  return uiList.map((m) => ({
    title: String(m?.title || ''),
    portraitUrl: m?.rawPortraitUrl || null,
  }));
}

export function resolveIntroEditorTargetData(card, selection) {
  if (!card || !selection) return null;
  const cardId = card.avatar || card.id || '';
  if (selection.cardId && selection.cardId !== cardId) return null;

  const isGroup = selection.kind === 'group';
  const standardTexts = [
    String(card.first_mes ?? ''),
    ...(Array.isArray(card.alternate_greetings)
      ? card.alternate_greetings.map((g) => String(g ?? ''))
      : []),
  ];
  const groupTexts = Array.isArray(card.group_only_greetings)
    ? card.group_only_greetings.map((g) => String(g ?? ''))
    : [];

  const list = isGroup ? groupTexts : standardTexts;
  if (list.length === 0) return null;

  const metaList = isGroup
    ? padIntroMetaArray(card.scenarioMeta?.groupIntrosMeta, groupTexts.length)
    : padIntroMetaArray(card.scenarioMeta?.introsMeta, standardTexts.length);

  const safeIdx = Math.max(0, Math.min(Number(selection.index ?? 0) || 0, list.length - 1));
  return {
    cardId,
    kind: isGroup ? 'group' : 'standard',
    index: safeIdx,
    totalCount: list.length,
    text: list[safeIdx] ?? '',
    title: metaList[safeIdx]?.title ?? '',
    portraitUrl: metaList[safeIdx]?.portraitUrl ?? null,
    rawPortraitUrl: metaList[safeIdx]?.rawPortraitUrl ?? null,
  };
}

/**
 * IntrosTab — Step 4.2.7 Tab II. Intros in CharacterSheet.
 * Manages `first_mes` + `alternate_greetings` + Spec v3 `group_only_greetings`,
 * drag-and-drop reordering (#1 automatically becomes `first_mes`),
 * per-intro portraits & titles in `.nexustavern/characters/<avatar>.json`,
 * central IntroEditorSheet selection, and 1-click "Start Chat with this Intro".
 */
export function IntrosTab({
  card,
  activeIntroIdx = 0,
  busyPortrait = false,
  editingIntroTarget = null,
  onOpenIntroEditor,
  onChangeIntroIdx,
  onChangeCardField,
  onPersistCardPatch,
  onUpdateScenarioMeta,
  onUploadIntroPortrait,
  onStartChatWithIntro,
}) {
  const cardId = card?.avatar || card?.id || '';

  const standardTexts = useMemo(() => {
    const first = String(card?.first_mes ?? '');
    const alts = Array.isArray(card?.alternate_greetings)
      ? card.alternate_greetings.map((g) => String(g ?? ''))
      : [];
    return [first, ...alts];
  }, [card?.first_mes, card?.alternate_greetings]);

  const groupTexts = useMemo(() => {
    return Array.isArray(card?.group_only_greetings)
      ? card.group_only_greetings.map((g) => String(g ?? ''))
      : [];
  }, [card?.group_only_greetings]);

  const standardMeta = useMemo(
    () => padIntroMetaArray(card?.scenarioMeta?.introsMeta, standardTexts.length),
    [card?.scenarioMeta?.introsMeta, standardTexts.length],
  );

  const groupMeta = useMemo(
    () => padIntroMetaArray(card?.scenarioMeta?.groupIntrosMeta, groupTexts.length),
    [card?.scenarioMeta?.groupIntrosMeta, groupTexts.length],
  );

  const totalTokens = useMemo(
    () => standardTexts.reduce((acc, t) => acc + estimateIntroTokens(t), 0),
    [standardTexts],
  );
  const avgTokens = standardTexts.length > 0 ? Math.round(totalTokens / standardTexts.length) : 0;

  const defaultPortraitUrl = card?.thumbnailUrl || card?.avatarUrl || null;
  const fallbackInitials = card?.initials || String(card?.name || 'CH').slice(0, 2).toUpperCase();
  const portraitGallery = card?.scenarioMeta?.avatarGallery || [];

  const applyStandardList = (nextTexts, nextMetaUi, { persist = true } = {}) => {
    const safeTexts = nextTexts.length > 0 ? nextTexts : [''];
    const [nextFirst, ...nextAlts] = safeTexts;
    const patch = {
      first_mes: nextFirst,
      alternate_greetings: nextAlts,
    };
    if (persist && onPersistCardPatch) {
      onPersistCardPatch(patch);
    } else {
      onChangeCardField?.(patch);
    }
    if (nextMetaUi) {
      onUpdateScenarioMeta?.({
        introsMeta: toServerIntroMetaPayload(nextMetaUi.slice(0, safeTexts.length)),
      });
    }
  };

  const applyGroupList = (nextTexts, nextMetaUi, { persist = true } = {}) => {
    const patch = {
      group_only_greetings: nextTexts,
    };
    if (persist && onPersistCardPatch) {
      onPersistCardPatch(patch);
    } else {
      onChangeCardField?.(patch);
    }
    if (nextMetaUi) {
      onUpdateScenarioMeta?.({
        groupIntrosMeta: toServerIntroMetaPayload(nextMetaUi.slice(0, nextTexts.length)),
      });
    }
  };

  const handleAddIntro = (kind = 'standard') => {
    if (kind === 'group') {
      const nextTexts = [...groupTexts, ''];
      const nextMeta = [...groupMeta, { title: '', portraitUrl: null, rawPortraitUrl: null }];
      applyGroupList(nextTexts, nextMeta, { persist: false });
      onOpenIntroEditor?.({ cardId, kind: 'group', index: nextTexts.length - 1 });
      return;
    }
    const nextTexts = [...standardTexts, ''];
    const nextMeta = [...standardMeta, { title: '', portraitUrl: null, rawPortraitUrl: null }];
    applyStandardList(nextTexts, nextMeta, { persist: false });
    onChangeIntroIdx?.(nextTexts.length - 1);
    onOpenIntroEditor?.({ cardId, kind: 'standard', index: nextTexts.length - 1 });
  };

  const handleRenameIntro = (kind, idx, nextTitle) => {
    if (kind === 'group') {
      const nextMeta = groupMeta.map((m, i) => (i === idx ? { ...m, title: nextTitle } : m));
      onUpdateScenarioMeta?.({ groupIntrosMeta: toServerIntroMetaPayload(nextMeta) });
      return;
    }
    const nextMeta = standardMeta.map((m, i) => (i === idx ? { ...m, title: nextTitle } : m));
    onUpdateScenarioMeta?.({ introsMeta: toServerIntroMetaPayload(nextMeta) });
  };

  const handleSelectPortraitUrl = (kind, idx, rawUrl, displayUrl) => {
    if (kind === 'group') {
      const nextMeta = groupMeta.map((m, i) =>
        i === idx ? { ...m, rawPortraitUrl: rawUrl, portraitUrl: displayUrl } : m,
      );
      onUpdateScenarioMeta?.({ groupIntrosMeta: toServerIntroMetaPayload(nextMeta) });
      return;
    }
    const nextMeta = standardMeta.map((m, i) =>
      i === idx ? { ...m, rawPortraitUrl: rawUrl, portraitUrl: displayUrl } : m,
    );
    onUpdateScenarioMeta?.({ introsMeta: toServerIntroMetaPayload(nextMeta) });
  };

  const handleDuplicateIntro = (kind, idx) => {
    if (kind === 'group') {
      const srcText = groupTexts[idx] ?? '';
      const srcMeta = groupMeta[idx] || { title: '', portraitUrl: null, rawPortraitUrl: null };
      const copyTitle = srcMeta.title ? `${srcMeta.title} (Copy)` : '';
      const nextTexts = [...groupTexts.slice(0, idx + 1), srcText, ...groupTexts.slice(idx + 1)];
      const nextMeta = [
        ...groupMeta.slice(0, idx + 1),
        { ...srcMeta, title: copyTitle },
        ...groupMeta.slice(idx + 1),
      ];
      applyGroupList(nextTexts, nextMeta);
      return;
    }
    const srcText = standardTexts[idx] ?? '';
    const srcMeta = standardMeta[idx] || { title: '', portraitUrl: null, rawPortraitUrl: null };
    const copyTitle = srcMeta.title ? `${srcMeta.title} (Copy)` : '';
    const nextTexts = [
      ...standardTexts.slice(0, idx + 1),
      srcText,
      ...standardTexts.slice(idx + 1),
    ];
    const nextMeta = [
      ...standardMeta.slice(0, idx + 1),
      { ...srcMeta, title: copyTitle },
      ...standardMeta.slice(idx + 1),
    ];
    applyStandardList(nextTexts, nextMeta);
    onChangeIntroIdx?.(idx + 1);
  };

  const handleDeleteIntro = (kind, idx) => {
    if (kind === 'group') {
      const nextTexts = groupTexts.filter((_, i) => i !== idx);
      const nextMeta = groupMeta.filter((_, i) => i !== idx);
      applyGroupList(nextTexts, nextMeta);
      return;
    }
    if (standardTexts.length <= 1) return;
    const nextTexts = standardTexts.filter((_, i) => i !== idx);
    const nextMeta = standardMeta.filter((_, i) => i !== idx);
    applyStandardList(nextTexts, nextMeta);
    if (activeIntroIdx >= nextTexts.length) {
      onChangeIntroIdx?.(Math.max(0, nextTexts.length - 1));
    } else if (activeIntroIdx > idx) {
      onChangeIntroIdx?.(activeIntroIdx - 1);
    }
    if (
      editingIntroTarget &&
      editingIntroTarget.cardId === cardId &&
      editingIntroTarget.kind === 'standard'
    ) {
      if (editingIntroTarget.index === idx) {
        onOpenIntroEditor?.(null);
      } else if (editingIntroTarget.index > idx) {
        onOpenIntroEditor?.({
          cardId,
          kind: 'standard',
          index: editingIntroTarget.index - 1,
        });
      }
    }
  };

  const reorderWithinKind = (kind, fromIdx, toIdx) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    if (kind === 'group') {
      const nextTexts = [...groupTexts];
      const nextMeta = [...groupMeta];
      const [movedT] = nextTexts.splice(fromIdx, 1);
      const [movedM] = nextMeta.splice(fromIdx, 1);
      nextTexts.splice(toIdx, 0, movedT);
      nextMeta.splice(toIdx, 0, movedM);
      applyGroupList(nextTexts, nextMeta);
      return;
    }
    const nextTexts = [...standardTexts];
    const nextMeta = [...standardMeta];
    const [movedT] = nextTexts.splice(fromIdx, 1);
    const [movedM] = nextMeta.splice(fromIdx, 1);
    nextTexts.splice(toIdx, 0, movedT);
    nextMeta.splice(toIdx, 0, movedM);
    applyStandardList(nextTexts, nextMeta);
    if (activeIntroIdx === fromIdx) {
      onChangeIntroIdx?.(toIdx);
    }
  };

  const handleMoveBetweenPools = (fromKind, idx) => {
    if (fromKind === 'standard') {
      if (standardTexts.length <= 1) return;
      const movedText = standardTexts[idx] ?? '';
      const movedMeta = standardMeta[idx] || { title: '', portraitUrl: null, rawPortraitUrl: null };
      applyStandardList(
        standardTexts.filter((_, i) => i !== idx),
        standardMeta.filter((_, i) => i !== idx),
      );
      applyGroupList([...groupTexts, movedText], [...groupMeta, movedMeta]);
    } else {
      const movedText = groupTexts[idx] ?? '';
      const movedMeta = groupMeta[idx] || { title: '', portraitUrl: null, rawPortraitUrl: null };
      applyGroupList(
        groupTexts.filter((_, i) => i !== idx),
        groupMeta.filter((_, i) => i !== idx),
      );
      applyStandardList([...standardTexts, movedText], [...standardMeta, movedMeta]);
    }
  };

  return (
    <div className="bb-cs-intros">
      <div className="bb-cs-intros__toolbar">
        <div className="bb-cs-intros__summary">
          <span className="bb-cs-intros__count">
            {standardTexts.length} {standardTexts.length === 1 ? 'Greeting' : 'Greetings'}
          </span>
          <span className="bb-cs-intros__sep">•</span>
          <span className="bb-cs-intros__meta">~{avgTokens} avg tok</span>
          {groupTexts.length > 0 && (
            <>
              <span className="bb-cs-intros__sep">•</span>
              <span className="bb-cs-intros__meta">{groupTexts.length} group</span>
            </>
          )}
        </div>

        <div className="bb-cs-intros__toolbar-actions">
          <Button
            variant="b2"
            size="sm"
            icon="users"
            title="Add a Spec v3 Group-Only Greeting"
            onClick={() => handleAddIntro('group')}
          >
            + Group
          </Button>
          <Button
            variant="b1"
            size="sm"
            icon="plus"
            title="Add a new greeting to this scenario"
            onClick={() => handleAddIntro('standard')}
          >
            New Intro
          </Button>
        </div>
      </div>

      <SortableStack
        items={standardTexts}
        getKey={(_txt, idx) => `std-${idx}`}
        onReorder={(fromIdx, toIdx) => reorderWithinKind('standard', fromIdx, toIdx)}
        renderItem={(txt, idx, { isGhost }) => {
          const meta = standardMeta[idx] || {};
          return (
            <IntroCard
              index={idx}
              kind="standard"
              title={meta.title || ''}
              text={txt}
              portraitUrl={meta.portraitUrl || null}
              rawPortraitUrl={meta.rawPortraitUrl || null}
              defaultPortraitUrl={defaultPortraitUrl}
              fallbackInitials={fallbackInitials}
              portraitGallery={portraitGallery}
              selected={activeIntroIdx === idx}
              editing={
                Boolean(editingIntroTarget) &&
                editingIntroTarget.cardId === cardId &&
                editingIntroTarget.kind === 'standard' &&
                editingIntroTarget.index === idx
              }
              draggable={standardTexts.length > 1}
              isGhost={isGhost}
              busyPortrait={busyPortrait}
              canDelete={standardTexts.length > 1}
              kebabExtraItems={[
                standardTexts.length > 1 && {
                  id: 'move-to-group',
                  label: 'Move to Group-Only (v3)',
                  icon: 'users',
                  onClick: () => handleMoveBetweenPools('standard', idx),
                },
              ].filter(Boolean)}
              onSelect={() => onChangeIntroIdx?.(idx)}
              onRenameTitle={(nextTitle) => handleRenameIntro('standard', idx, nextTitle)}
              onEdit={() => {
                onChangeIntroIdx?.(idx);
                onOpenIntroEditor?.({ cardId, kind: 'standard', index: idx });
              }}
              onDuplicate={() => handleDuplicateIntro('standard', idx)}
              onSetAsFirst={() => reorderWithinKind('standard', idx, 0)}
              onDelete={() => handleDeleteIntro('standard', idx)}
              onStartChat={() =>
                onStartChatWithIntro?.({
                  index: idx,
                  text: txt,
                  rawPortraitUrl: meta.rawPortraitUrl || null,
                  portraitUrl: meta.portraitUrl || null,
                })
              }
              onSelectPortraitUrl={(rawUrl, dispUrl) =>
                handleSelectPortraitUrl('standard', idx, rawUrl, dispUrl)
              }
              onUploadPortraitFile={(file) =>
                onUploadIntroPortrait?.('standard', idx, file, { applyImmediately: true })
              }
            />
          );
        }}
      />

      {groupTexts.length > 0 && (
        <FolderCard
          title={`Group-Only Greetings (${groupTexts.length})`}
          subtitle="Spec v3 greetings triggered exclusively in group chats"
          icon="users"
          defaultOpen
          actions={
            <Button
              variant="b2"
              size="sm"
              icon="plus"
              onClick={() => handleAddIntro('group')}
            >
              Add
            </Button>
          }
        >
          <SortableStack
            items={groupTexts}
            getKey={(_txt, idx) => `grp-${idx}`}
            onReorder={(fromIdx, toIdx) => reorderWithinKind('group', fromIdx, toIdx)}
            renderItem={(txt, idx, { isGhost }) => {
              const meta = groupMeta[idx] || {};
              return (
                <IntroCard
                  index={idx}
                  kind="group"
                  title={meta.title || ''}
                  text={txt}
                  portraitUrl={meta.portraitUrl || null}
                  rawPortraitUrl={meta.rawPortraitUrl || null}
                  defaultPortraitUrl={defaultPortraitUrl}
                  fallbackInitials={fallbackInitials}
                  portraitGallery={portraitGallery}
                  editing={
                    Boolean(editingIntroTarget) &&
                    editingIntroTarget.cardId === cardId &&
                    editingIntroTarget.kind === 'group' &&
                    editingIntroTarget.index === idx
                  }
                  draggable={groupTexts.length > 1}
                  isGhost={isGhost}
                  busyPortrait={busyPortrait}
                  canDelete
                  kebabExtraItems={[
                    {
                      id: 'move-to-std',
                      label: 'Move to Standard Intros',
                      icon: 'bookOpen',
                      onClick: () => handleMoveBetweenPools('group', idx),
                    },
                  ]}
                  onRenameTitle={(nextTitle) => handleRenameIntro('group', idx, nextTitle)}
                  onEdit={() => onOpenIntroEditor?.({ cardId, kind: 'group', index: idx })}
                  onDuplicate={() => handleDuplicateIntro('group', idx)}
                  onDelete={() => handleDeleteIntro('group', idx)}
                  onSelectPortraitUrl={(rawUrl, dispUrl) =>
                    handleSelectPortraitUrl('group', idx, rawUrl, dispUrl)
                  }
                  onUploadPortraitFile={(file) =>
                    onUploadIntroPortrait?.('group', idx, file, { applyImmediately: true })
                  }
                />
              );
            }}
          />
        </FolderCard>
      )}
    </div>
  );
}



