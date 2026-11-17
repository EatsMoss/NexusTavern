import React, { lazy, Suspense } from 'react';
import { isDemoCardId } from '@core/cards/cardsApi.js';
import { Button, ProgressIndicator, OverlayScrollArea } from '@ui/index.js';
import { ChatViewport } from '@features/chat/ChatViewport.jsx';
import { CharacterSheet } from '@features/characters/CharacterSheet/CharacterSheet.jsx';

const EMPTY_ARRAY = Object.freeze([]);

const LazyTokenSandbox = lazy(() =>
  import('@ui/tokens/TokenSandbox.jsx').then((m) => ({ default: m.TokenSandbox })),
);
const LazyCreateScenarioSheet = lazy(() =>
  import('@features/characters/CreateScenarioSheet.jsx').then((m) => ({
    default: m.CreateScenarioSheet,
  })),
);
const LazyPersonaSheet = lazy(() =>
  import('@features/personas/PersonaSheet.jsx').then((m) => ({ default: m.PersonaSheet })),
);
const LazyPromptEditorSheet = lazy(() =>
  import('@ui/organisms/PromptManager/PromptEditorSheet.jsx').then((m) => ({
    default: m.PromptEditorSheet,
  })),
);
const LazyIntroEditorSheet = lazy(() =>
  import('@features/characters/CharacterSheet/IntroEditorSheet.jsx').then((m) => ({
    default: m.IntroEditorSheet,
  })),
);

/**
 * Renders an active central workspace sheet (`sandbox` | `createScenario` |
 * `persona` | `prompt` | `intro` | `expandedCharacter`) when open, or `null`
 * when the default `ChatViewport` should be displayed.
 */
export function CenterWorkspaceSheets({
  viewMode,
  onExitSandbox,
  leftTomeInset = 0,
  rightTomeInset = 0,
  chatListOpen,
  timelinesOpen,
  centerSheetSurfaceRef,
  createScenarioSheetRef,
  introEditorSheetRef,
  chatStreamRef,
  chatComposerRef,
  scenario,
  personasWs,
  apiHub,
  presets,
  chat,
  sheetDismiss,
  resolvedEditingPrompt,
  onSaveEditedGroupInDoc,
  sheetExpanded,
  characterSheetSharedProps,
  shaderStyle,
  shaderIntensity,
  lowGpu,
  pushComposerToast,
  composerToasts,
  dismissComposerToast,
  consoleStream,
  recapConfig,
}) {
  const {
    createScenarioModalOpen,
    createScenarioModalMode,
    tags,
    creatingScenario,
    createScenarioStatus,
    handleCreateScenario: onCreateScenario,
    handleImportScenarioFiles: onImportScenarioFiles,
    cards,
    groups,
    activeCharacter,
    resolvedEditingIntro,
    matchedActiveCardFull,
    busyPortrait,
    handleSaveEditedIntro: onSaveEditedIntro,
    setActiveIntroIdx,
    setEditingIntroTarget,
    handleUploadIntroPortrait: onUploadIntroPortrait,
    hasActiveScenario,
  } = scenario;
  const {
    personaModalOpen,
    personaSheetRef,
    personaModalMode,
    personaModalTargetAvatar,
    personas,
    activePersonaAvatar,
    handleCreatePersona: onCreatePersona,
    handleSavePersonaById: onSavePersonaById,
    handleUploadPersonaAvatar: onUploadPersonaAvatar,
    handleDuplicatePersona: onDuplicatePersona,
    handleDeletePersona: onDeletePersona,
    handleSelectPersona: onSelectPersona,
    handleConfirmReplacePersonaInChat: onConfirmReplacePersonaInChat,
  } = personasWs;
  const {
    promptEditorSheetRef,
    handleSaveEditedPromptInDoc: onSaveEditedPromptInDoc,
  } = presets;
  const {
    effectiveHasUserMessages,
    effectiveUserMessageCount,
    handleCreateNewChat: onCreateNewChat,
  } = chat;
  const {
    requestCloseActiveWorkspaceSheet,
    handleCreateScenarioDirtyChange: onCreateScenarioDirtyChange,
    handlePersonaDirtyChange: onPersonaDirtyChange,
    handlePromptDirtyChange: onPromptDirtyChange,
    handleIntroDirtyChange: onIntroDirtyChange,
  } = sheetDismiss;
  if (viewMode === 'sandbox') {
    return (
      <OverlayScrollArea
        className="bb-sandbox-scroll-wrap"
        viewportClassName="bb-sandbox-scroll"
      >
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '8px 14px',
              marginBottom: 12,
              borderRadius: 10,
              background: 'var(--bb-m3-surface-container-high, rgba(28, 25, 21, 0.85))',
              border: '1px solid var(--bb-m3-outline-variant, rgba(125, 113, 98, 0.28))',
            }}
          >
            <span className="bb-caption-text">
              <strong>NexusTavern UI Kit &amp; Token Sandbox</strong> — Shortcut:{' '}
              <code style={{ fontFamily: 'var(--bb-font-mono)' }}>Ctrl+Shift+U</code>
            </span>
            <Button
              variant="b1"
              size="sm"
              emphasis="filled"
              icon="close"
              onClick={onExitSandbox}
            >
              Return to Tavern (Ctrl+Shift+U)
            </Button>
          </div>
          <Suspense
            fallback={
              <div style={{ padding: '24px 16px' }}>
                <ProgressIndicator
                  variant="linear"
                  size="sm"
                  label="Loading UI Sandbox..."
                />
              </div>
            }
          >
            <LazyTokenSandbox />
          </Suspense>
        </div>
      </OverlayScrollArea>
    );
  }

  if (createScenarioModalOpen) {
    return (
      <section className="bb-center-column__sheet" aria-label="Create scenario workspace">
        <div ref={centerSheetSurfaceRef} className="bb-center-column__sheet-surface">
          <Suspense
            fallback={
              <ProgressIndicator
                variant="linear"
                size="sm"
                overlay="top"
                ariaLabel="Loading scenario editor"
              />
            }
          >
            <LazyCreateScenarioSheet
              ref={createScenarioSheetRef}
              initialMode={createScenarioModalMode}
              availableTags={tags}
              submitting={creatingScenario}
              statusMsg={createScenarioStatus}
              onClose={requestCloseActiveWorkspaceSheet}
              onCreateScenario={onCreateScenario}
              onImportScenarioFiles={onImportScenarioFiles}
              onDirtyChange={onCreateScenarioDirtyChange}
            />
          </Suspense>
        </div>
      </section>
    );
  }

  if (personaModalOpen) {
    return (
      <section className="bb-center-column__sheet" aria-label="Persona workspace">
        <div ref={centerSheetSurfaceRef} className="bb-center-column__sheet-surface">
          <Suspense
            fallback={
              <ProgressIndicator
                variant="linear"
                size="sm"
                overlay="top"
                ariaLabel="Loading persona editor"
              />
            }
          >
            <LazyPersonaSheet
              ref={personaSheetRef}
              initialMode={personaModalMode}
              initialTargetAvatar={personaModalTargetAvatar}
              personas={personas}
              activePersonaAvatar={activePersonaAvatar}
              cards={cards}
              groups={groups}
              activeCharacter={activeCharacter}
              hasUserMessages={effectiveHasUserMessages}
              userMessageCount={effectiveUserMessageCount}
              onClose={requestCloseActiveWorkspaceSheet}
              onCreatePersona={onCreatePersona}
              onSavePersona={onSavePersonaById}
              onUploadPersonaAvatar={onUploadPersonaAvatar}
              onDuplicatePersona={onDuplicatePersona}
              onDeletePersona={onDeletePersona}
              onSelectPersonaInChat={onSelectPersona}
              onConfirmReplacePersonaInChat={onConfirmReplacePersonaInChat}
              onDirtyChange={onPersonaDirtyChange}
            />
          </Suspense>
        </div>
      </section>
    );
  }

  if (resolvedEditingPrompt) {
    return (
      <section className="bb-center-column__sheet" aria-label="Prompt editor workspace">
        <div ref={centerSheetSurfaceRef} className="bb-center-column__sheet-surface">
          <Suspense
            fallback={
              <ProgressIndicator
                variant="linear"
                size="sm"
                overlay="top"
                ariaLabel="Loading prompt editor"
              />
            }
          >
            <LazyPromptEditorSheet
              ref={promptEditorSheetRef}
              mode={resolvedEditingPrompt.mode}
              target={resolvedEditingPrompt.target}
              isInherited={resolvedEditingPrompt.isInherited}
              onClose={requestCloseActiveWorkspaceSheet}
              onSavePrompt={onSaveEditedPromptInDoc}
              onSaveGroup={onSaveEditedGroupInDoc}
              onDirtyChange={onPromptDirtyChange}
            />
          </Suspense>
        </div>
      </section>
    );
  }

  if (resolvedEditingIntro && matchedActiveCardFull) {
    return (
      <section className="bb-center-column__sheet" aria-label="Greeting editor workspace">
        <div ref={centerSheetSurfaceRef} className="bb-center-column__sheet-surface">
          <Suspense
            fallback={
              <ProgressIndicator
                variant="linear"
                size="sm"
                overlay="top"
                ariaLabel="Loading greeting editor"
              />
            }
          >
            <LazyIntroEditorSheet
              ref={introEditorSheetRef}
              target={resolvedEditingIntro}
              scenarioName={matchedActiveCardFull.name || ''}
              defaultPortraitUrl={
                matchedActiveCardFull.thumbnailUrl || matchedActiveCardFull.avatarUrl || null
              }
              fallbackInitials={
                matchedActiveCardFull.initials ||
                String(matchedActiveCardFull.name || 'CH').slice(0, 2).toUpperCase()
              }
              portraitGallery={matchedActiveCardFull.scenarioMeta?.avatarGallery || []}
              busyPortrait={busyPortrait}
              onClose={requestCloseActiveWorkspaceSheet}
              onSave={onSaveEditedIntro}
              onDirtyChange={onIntroDirtyChange}
              onNavigateIndex={(nextKind, nextIdx) => {
                if (nextKind === 'standard') {
                  setActiveIntroIdx(nextIdx);
                }
                setEditingIntroTarget({
                  cardId: matchedActiveCardFull.avatar || matchedActiveCardFull.id,
                  kind: nextKind,
                  index: nextIdx,
                });
              }}
              onStartChat={(introPayload) => onCreateNewChat(introPayload)}
              onUploadPortraitFile={onUploadIntroPortrait}
            />
          </Suspense>
        </div>
      </section>
    );
  }

  if (sheetExpanded && (matchedActiveCardFull || hasActiveScenario)) {
    return (
      <section className="bb-center-column__sheet" aria-label="Scenario sheet workspace">
        <div ref={centerSheetSurfaceRef} className="bb-center-column__sheet-surface">
          <CharacterSheet {...characterSheetSharedProps} isExpanded />
        </div>
      </section>
    );
  }

  return (
    <ChatViewport
      streamRef={chatStreamRef}
      composerRef={chatComposerRef}
      isDemoCard={!scenario.hasActiveScenario || isDemoCardId(scenario.selectedCardId)}
      hasActiveScenario={scenario.hasActiveScenario}
      switchingScenario={chat.isSwitchingScenario}
      onOpenCreateScenario={() => scenario.handleOpenCreateScenarioModal('create')}
      onOpenImportScenario={() => scenario.handleOpenCreateScenarioModal('import')}
      chatListOpen={chatListOpen}
      timelinesOpen={timelinesOpen}
      timelineChats={
        chat.committedChatCardId === scenario.selectedCardId
          ? chat.timelineChats.length > 0
            ? chat.timelineChats
            : chat.chatFiles
          : []
      }
      timelineForest={
        chat.committedChatCardId === scenario.selectedCardId
          ? chat.timelineForest
          : null
      }
      loadingTimelines={chat.loadingTimelines}
      focusedTimelineRequest={chat.focusedTimelineRequest}
      onTimelineFocusChange={chat.setFocusedTimelineNodeFile}
      leftTomeInset={leftTomeInset}
      rightTomeInset={rightTomeInset}
      chatFiles={
        chat.committedChatCardId === scenario.selectedCardId ? chat.chatFiles : []
      }
      totalChatsCount={
        chat.committedChatCardId === scenario.selectedCardId
          ? chat.chatListMeta.totalChats
          : 0
      }
      hasMoreChats={
        chat.committedChatCardId === scenario.selectedCardId
          ? chat.chatListMeta.hasMore
          : false
      }
      loadingMoreChats={chat.chatListMeta.loadingMore}
      onLoadMoreChats={chat.handleLoadMoreChats}
      onSelectChatFile={chat.handleSelectChatFromList}
      onBranchChatFile={chat.handleBranchChatFromList}
      onDeleteChatFiles={chat.handleDeleteChatsFromList}
      onCloseChatList={chat.handleBackToChat}
      onCloseTimelines={chat.handleBackToChat}
      activeChatFile={
        chat.committedChatCardId === scenario.selectedCardId ? chat.activeChatFile : ''
      }
      chatMetaStats={chat.chatMetaStats}
      loadingChat={chat.loadingChat}
      onLoadOlderMessages={chat.handleLoadOlderMessages}
      messages={chat.messages}
      demoSwipeIdx={chat.swipeIdx}
      personas={personasWs.personas}
      activePersonaAvatar={personasWs.activePersonaAvatar}
      personaName={personasWs.activePersonaObj?.name || personasWs.personaName}
      personaAvatarUrl={personasWs.activePersonaAvatarUrl}
      cards={scenario.cards}
      groups={scenario.groups}
      activeCharacter={scenario.activeCharacter}
      hasUserMessages={chat.effectiveHasUserMessages}
      userMessageCount={chat.effectiveUserMessageCount}
      onSelectPersona={personasWs.handleSelectPersona}
      onConfirmReplacePersonaInChat={personasWs.handleConfirmReplacePersonaInChat}
      onToggleBindPersonaToActiveCard={personasWs.handleToggleBindPersonaToActiveCard}
      onOpenManagePersonaModal={personasWs.handleOpenManagePersonaModal}
      onOpenCreatePersonaModal={personasWs.handleOpenCreatePersonaModal}
      onDuplicatePersona={personasWs.handleDuplicatePersona}
      onDeletePersona={personasWs.handleDeletePersona}
      onClickPersonaBadge={personasWs.handleClickPersonaBadge}
      modelLabel={apiHub.selectedModelLabel}
      hubConnections={apiHub.apiHubState?.connections || EMPTY_ARRAY}
      activeProviderId={
        apiHub.apiHubState?.activeConnectionId ||
        apiHub.apiHubState?.activeProviderId ||
        ''
      }
      activeModelId={apiHub.apiHubState?.activeModelId || ''}
      activeModelName={apiHub.apiHubState?.activeModelName || ''}
      onSelectHubModel={apiHub.handleSelectHubModel}
      onUpdateHubConnection={apiHub.handleUpdateHubProvider}
      onFetchHubModels={apiHub.handleFetchHubModels}
      onDeleteHubConnection={apiHub.handleDeleteCustomHubConn}
      onRevealHubKey={apiHub.handleRevealHubKey}
      onPingHubConnections={apiHub.handlePingHubConnections}
      onFetchHubTelemetry={apiHub.handleFetchHubTelemetry}
      hubCustomFamilies={apiHub.apiHubState?.customFamilies || EMPTY_ARRAY}
      onAddHubCustomFamily={apiHub.handleAddHubCustomFamily}
      onDeleteHubCustomFamily={apiHub.handleDeleteHubCustomFamily}
      onClickModelBadge={apiHub.handleClickModelBadge}
      characterName={chat.chatDisplayCharacter.name}
      characterAvatarUrl={chat.chatScenarioAvatarUrl}
      characterInitials={chat.chatDisplayCharacter.initials || 'CH'}
      shaderStyle={shaderStyle}
      shaderIntensity={shaderIntensity}
      lowGpu={lowGpu}
      onSwipeMessage={chat.stableHandleSwipeMessage}
      onGenerateSwipe={chat.stableHandleGenerateSwipe}
      onContinueMessage={chat.stableHandleContinueMessage}
      onDeleteSwipe={chat.stableHandleDeleteSwipe}
      onSaveEditedMessage={chat.stableHandleSaveEditedMessage}
      onRemoveMessageAttachment={chat.stableHandleRemoveMessageAttachment}
      onDeleteMessage={chat.stableHandleDeleteMessage}
      onDeleteMessagesBatch={chat.stableHandleDeleteMessagesBatch}
      onCreateBranch={chat.stableHandleCreateBranchAtMessage}
      onNotify={pushComposerToast}
      composerToasts={composerToasts}
      onDismissComposerToast={dismissComposerToast}
      onSendMessage={chat.stableHandleSend}
      isGenerating={chat.isGenerating}
      onStopGeneration={chat.handleStopGeneration}
      consoleStream={consoleStream}
      recapCompressDepth={
        recapConfig.enabled && recapConfig.stripEnabled
          ? recapConfig.keepFullDepth
          : null
      }
    />
  );
}
