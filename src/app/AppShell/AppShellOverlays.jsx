import React, { lazy, Suspense } from 'react';
import {
  SafeImage,
  Button,
  Input,
  Switch,
  Modal,
  ImageCropModal,
  UnsavedChangesModal,
  SplashScreen,
  ProgressIndicator,
  OverlayScrollArea,
} from '@ui/index.js';

const LazyWelcomeModal = lazy(() =>
  import('@ui/organisms/WelcomeModal/WelcomeModal.jsx').then((m) => ({
    default: m.WelcomeModal,
  })),
);

const LazyApiHubModal = lazy(() =>
  import('@features/api-hub/ApiHubModal.jsx').then((m) => ({ default: m.ApiHubModal })),
);

/**
 * Top-layer modal and splash overlays composed at the `src/app/AppShell/` boundary.
 */
export function AppShellOverlays({
  viewMode,
  boot,
  scenario,
  personasWs,
  apiHub,
  sheetDismiss,
  lowGpu,
  stImporter,
  qrModalOpen,
  onCloseQrModal,
  serverStatus,
  tunnelBusy,
  onRefreshStatus,
  onToggleTunnelWithToast,
}) {
  const {
    welcomeModalOpen,
    bootSplashOpen,
    bootSplashExiting,
    bootStage,
    markOnboardingDismissed,
  } = boot;
  const bootStageStepLabel = bootStage.stepLabel;
  const onOpenCreatePersonaModal = personasWs.handleOpenCreatePersonaModal;
  const {
    apiModalOpen,
    apiHubState,
    handleCreateCustomHubConn: onCreateCustomHubConn,
    setApiModalOpen,
  } = apiHub;
  const onCloseApiModal = () => setApiModalOpen(false);
  const {
    renameDialog,
    setRenameDialog,
    renameDialogUnsavedOpen,
    setRenameDialogUnsavedOpen,
    handleConfirmRenameDialog: onConfirmRenameDialog,
    deleteDialog,
    setDeleteDialog,
    handleDeleteTag: onDeleteTag,
    handleDeleteCard: onDeleteCard,
    createGroupDialog,
    setCreateGroupDialog,
    createGroupUnsavedOpen,
    setCreateGroupUnsavedOpen,
    handleConfirmCreateGroup: onConfirmCreateGroup,
    bulkDeleteDialog,
    setBulkDeleteDialog,
    handleConfirmBulkDelete: onConfirmBulkDelete,
  } = scenario;
  const {
    workspaceUnsavedGuard,
    handleCancelWorkspaceGuard: onCancelWorkspaceGuard,
    handleDiscardWorkspaceGuard: onDiscardWorkspaceGuard,
    handleConfirmSaveWorkspaceGuard: onSaveWorkspaceGuard,
  } = sheetDismiss;
  return (
    <>
      {welcomeModalOpen && !bootSplashOpen && viewMode === 'tavern' && (
        <Suspense fallback={null}>
          <LazyWelcomeModal
            open
            onClose={markOnboardingDismissed}
            onStartEmpty={markOnboardingDismissed}
            onCreatePersona={() => {
              markOnboardingDismissed();
              onOpenCreatePersonaModal();
            }}
            importer={stImporter}
          />
        </Suspense>
      )}

      {apiModalOpen && (
        <Suspense fallback={null}>
          <LazyApiHubModal
            open
            hubState={apiHubState}
            onClose={onCloseApiModal}
            onCreateCustomProvider={onCreateCustomHubConn}
          />
        </Suspense>
      )}

      <Modal
        open={qrModalOpen}
        onClose={onCloseQrModal}
        title="Mobile Access & Server Status"
        subtitle="SSH Tunnel + End-to-End AES-256-GCM Encryption"
        icon="qr"
        width={620}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" icon="refresh" onClick={onRefreshStatus}>
              Refresh Status
            </Button>
            <Button variant="b1" emphasis="filled" icon="check" onClick={onCloseQrModal}>
              Close
            </Button>
          </>
        }
      >
        {serverStatus ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="bb-tunnel-box">
              {tunnelBusy && (
                <ProgressIndicator
                  variant="linear"
                  size="sm"
                  overlay="top"
                  ariaLabel="Updating encrypted tunnel..."
                />
              )}
              {serverStatus.tunnel?.qrSvg && (
                <div
                  className="bb-qr-wrap"
                  dangerouslySetInnerHTML={{ __html: serverStatus.tunnel.qrSvg }}
                />
              )}
              <div className="bb-tunnel-info">
                <div className="bb-lan-label">
                  Tunnel Status:{' '}
                  <strong>
                    {serverStatus.tunnel?.active ? 'Active (Encrypted)' : 'Local Only'}
                  </strong>
                </div>
                {serverStatus.tunnel?.publicUrl && (
                  <a
                    href={serverStatus.tunnel.authorizedUrl || serverStatus.tunnel.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="bb-link"
                  >
                    {serverStatus.tunnel.publicUrl}
                  </a>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <Button
                    variant="b1"
                    emphasis="filled"
                    disabled={tunnelBusy}
                    onClick={() => onToggleTunnelWithToast(false)}
                  >
                    {serverStatus.tunnel?.active ? 'Stop Tunnel' : 'Enable Mobile Access'}
                  </Button>
                  {serverStatus.tunnel?.active && (
                    <Button
                      variant="b1"
                      emphasis="outlined"
                      disabled={tunnelBusy}
                      onClick={() => onToggleTunnelWithToast(true)}
                    >
                      Rotate Key
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="bb-caption-text">
              Storage: {serverStatus.storage?.readyDirectories}/
              {serverStatus.storage?.totalDirectories} SillyTavern folders ready (
              {serverStatus.storage?.root})
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
            <ProgressIndicator variant="circular" size="sm" ariaLabel="Connecting to server" />
            <span className="bb-caption-text">Connecting to NexusTavern Server...</span>
          </div>
        )}
      </Modal>

      {/* Rename Card / Tag / Folder Modal */}
      <Modal
        open={Boolean(renameDialog)}
        onClose={() => {
          if (
            renameDialog &&
            String(renameDialog.name || '').trim() !==
              String(renameDialog.initialName ?? '').trim()
          ) {
            setRenameDialogUnsavedOpen(true);
            return;
          }
          setRenameDialogUnsavedOpen(false);
          setRenameDialog(null);
        }}
        title={
          renameDialog?.kind === 'tag'
            ? 'Rename Tag'
            : renameDialog?.kind === 'folder'
              ? 'Rename Folder'
              : 'Rename Scenario'
        }
        subtitle="Enter a new display name"
        icon="edit"
        width={420}
        footer={
          <>
            <Button
              variant="b1"
              emphasis="outlined"
              onClick={() => {
                if (
                  renameDialog &&
                  String(renameDialog.name || '').trim() !==
                    String(renameDialog.initialName ?? '').trim()
                ) {
                  setRenameDialogUnsavedOpen(true);
                  return;
                }
                setRenameDialogUnsavedOpen(false);
                setRenameDialog(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="check"
              disabled={!renameDialog?.name?.trim()}
              onClick={onConfirmRenameDialog}
            >
              Save
            </Button>
          </>
        }
      >
        {renameDialog && (
          <div
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameDialog.name.trim()) {
                e.preventDefault();
                onConfirmRenameDialog();
              }
            }}
          >
            <Input
              label="Name"
              value={renameDialog.name}
              onChange={(val) =>
                setRenameDialog((prev) => (prev ? { ...prev, name: val } : null))
              }
              placeholder="Enter new name..."
            />
          </div>
        )}
      </Modal>

      {/* Confirm Delete Card / Tag Modal */}
      <Modal
        open={Boolean(deleteDialog)}
        onClose={() => setDeleteDialog(null)}
        title={
          deleteDialog?.kind === 'tag'
            ? 'Delete Tag'
            : deleteDialog?.isGroup
              ? 'Delete Group'
              : 'Delete Scenario'
        }
        subtitle="This action cannot be undone"
        icon="trash"
        width={420}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="b4"
              icon="trash"
              onClick={() => {
                if (!deleteDialog) return;
                if (deleteDialog.kind === 'tag') {
                  onDeleteTag(deleteDialog.id);
                } else {
                  onDeleteCard(deleteDialog.id, {
                    deleteChats: Boolean(deleteDialog.deleteChats),
                    isGroup: Boolean(deleteDialog.isGroup),
                  });
                }
                setDeleteDialog(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        {deleteDialog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="bb-caption-text">
              {deleteDialog.kind === 'tag' ? (
                <>
                  Delete tag <strong>&ldquo;{deleteDialog.name}&rdquo;</strong>? The tag will be
                  detached from all scenarios, while the scenario cards themselves will remain
                  intact.
                </>
              ) : (
                <>
                  Delete <strong>&ldquo;{deleteDialog.name}&rdquo;</strong>?{' '}
                  {deleteDialog.deleteChats
                    ? 'The scenario card and all of its chat histories will be permanently removed.'
                    : 'Only the scenario card file will be removed; existing .jsonl chat files will remain on disk.'}
                </>
              )}
            </div>

            {deleteDialog.kind !== 'tag' && (
              <Switch
                checked={Boolean(deleteDialog.deleteChats)}
                onChange={(checked) =>
                  setDeleteDialog((prev) =>
                    prev ? { ...prev, deleteChats: Boolean(checked) } : null,
                  )
                }
                label="Also delete chat files"
                description="Remove all associated .jsonl chat histories from disk"
              />
            )}
          </div>
        )}
      </Modal>

      {/* Create Group Chat Modal (Multi-Select) */}
      <Modal
        open={Boolean(createGroupDialog)}
        onClose={() => {
          if (
            createGroupDialog &&
            String(createGroupDialog.name || '').trim() !==
              String(createGroupDialog.initialName ?? '').trim()
          ) {
            setCreateGroupUnsavedOpen(true);
            return;
          }
          setCreateGroupUnsavedOpen(false);
          setCreateGroupDialog(null);
        }}
        title="Create Group Chat"
        subtitle={
          createGroupDialog
            ? `${(createGroupDialog.members || []).length} scenario(s) selected`
            : ''
        }
        icon="users"
        width={460}
        footer={
          <>
            <Button
              variant="b1"
              emphasis="outlined"
              onClick={() => {
                if (
                  createGroupDialog &&
                  String(createGroupDialog.name || '').trim() !==
                    String(createGroupDialog.initialName ?? '').trim()
                ) {
                  setCreateGroupUnsavedOpen(true);
                  return;
                }
                setCreateGroupUnsavedOpen(false);
                setCreateGroupDialog(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="check"
              disabled={!createGroupDialog?.name?.trim()}
              onClick={onConfirmCreateGroup}
            >
              Create Group
            </Button>
          </>
        }
      >
        {createGroupDialog && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && createGroupDialog.name.trim()) {
                e.preventDefault();
                onConfirmCreateGroup();
              }
            }}
          >
            <Input
              label="Group Name"
              value={createGroupDialog.name}
              onChange={(val) =>
                setCreateGroupDialog((prev) => (prev ? { ...prev, name: val } : null))
              }
              placeholder="Enter group name..."
            />

            <div>
              <div
                className="bb-caption-text"
                style={{ marginBottom: 6, fontWeight: 600 }}
              >
                Members ({(createGroupDialog.members || []).length})
              </div>
              <OverlayScrollArea
                viewportClassName="bb-m3-ms-modal-members"
                variant="compact"
              >
                {(createGroupDialog.members || []).map((member) => {
                  const avatarSrc = member.thumbnailUrl || member.avatarUrl || null;
                  return (
                    <span key={member.id} className="bb-m3-ms-modal-member-pill">
                      <SafeImage
                        src={avatarSrc}
                        alt={member.name}
                        className="bb-m3-ms-modal-member-avatar"
                        fallback={
                          <span className="bb-m3-ms-modal-member-avatar">
                            {member.initials || member.name?.[0] || 'CH'}
                          </span>
                        }
                      />
                      <span>{member.name}</span>
                    </span>
                  );
                })}
              </OverlayScrollArea>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Delete Confirmation Modal (Multi-Select) */}
      <Modal
        open={Boolean(bulkDeleteDialog)}
        onClose={() => setBulkDeleteDialog(null)}
        title={`Delete ${bulkDeleteDialog?.items?.length || 0} Selected Item(s)`}
        subtitle="This action cannot be undone"
        icon="trash"
        width={460}
        footer={
          <>
            <Button
              variant="b1"
              emphasis="outlined"
              onClick={() => setBulkDeleteDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant="b4"
              icon="trash"
              onClick={onConfirmBulkDelete}
            >
              Delete ({bulkDeleteDialog?.items?.length || 0})
            </Button>
          </>
        }
      >
        {bulkDeleteDialog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="bb-caption-text">
              Are you sure you want to permanently delete the following{' '}
              <strong>{bulkDeleteDialog.items.length}</strong> selected item(s)?
            </div>

            <OverlayScrollArea
              viewportClassName="bb-m3-ms-modal-members"
              variant="compact"
            >
              {bulkDeleteDialog.items.map((item) => {
                const avatarSrc = item.thumbnailUrl || item.avatarUrl || null;
                return (
                  <span key={item.id} className="bb-m3-ms-modal-member-pill">
                    <SafeImage
                      src={avatarSrc}
                      alt={item.name}
                      className="bb-m3-ms-modal-member-avatar"
                      fallback={
                        <span className="bb-m3-ms-modal-member-avatar">
                          {item.initials || item.name?.[0] || 'CH'}
                        </span>
                      }
                    />
                    <span>{item.name}</span>
                  </span>
                );
              })}
            </OverlayScrollArea>

            <Switch
              checked={Boolean(bulkDeleteDialog.deleteChats)}
              onChange={(checked) =>
                setBulkDeleteDialog((prev) =>
                  prev ? { ...prev, deleteChats: Boolean(checked) } : null,
                )
              }
              label="Also delete chat files"
              description="Remove all associated .jsonl chat histories from disk"
            />
          </div>
        )}
      </Modal>

      <UnsavedChangesModal
        open={renameDialogUnsavedOpen && Boolean(renameDialog)}
        subtitle={
          renameDialog?.kind === 'tag'
            ? 'Rename Tag'
            : renameDialog?.kind === 'folder'
              ? 'Rename Folder'
              : 'Rename Scenario'
        }
        itemName={
          String(renameDialog?.name || '').trim() ||
          renameDialog?.initialName ||
          'Item'
        }
        saveLabel="Save"
        canSave={Boolean(renameDialog?.name?.trim())}
        cannotSaveReason="Name cannot be empty."
        onCancel={() => setRenameDialogUnsavedOpen(false)}
        onDiscard={() => {
          setRenameDialogUnsavedOpen(false);
          setRenameDialog(null);
        }}
        onSave={onConfirmRenameDialog}
      />

      <UnsavedChangesModal
        open={createGroupUnsavedOpen && Boolean(createGroupDialog)}
        subtitle="Create Group Chat"
        itemName={String(createGroupDialog?.name || '').trim() || 'New Group'}
        saveLabel="Create Group"
        canSave={Boolean(createGroupDialog?.name?.trim())}
        cannotSaveReason="Group name cannot be empty."
        onCancel={() => setCreateGroupUnsavedOpen(false)}
        onDiscard={() => {
          setCreateGroupUnsavedOpen(false);
          setCreateGroupDialog(null);
        }}
        onSave={onConfirmCreateGroup}
      />

      <UnsavedChangesModal
        open={Boolean(workspaceUnsavedGuard)}
        subtitle={workspaceUnsavedGuard?.subtitle || 'Your recent edits have not been saved yet'}
        itemName={workspaceUnsavedGuard?.itemName || ''}
        saveLabel={workspaceUnsavedGuard?.saveLabel || 'Save & Close'}
        canSave={Boolean(workspaceUnsavedGuard?.canSave)}
        cannotSaveReason={workspaceUnsavedGuard?.cannotSaveReason || ''}
        busy={Boolean(workspaceUnsavedGuard?.busy)}
        onCancel={onCancelWorkspaceGuard}
        onDiscard={onDiscardWorkspaceGuard}
        onSave={onSaveWorkspaceGuard}
      />

      <ImageCropModal {...(scenario.portraitCropModalProps || {})} />

      <SplashScreen
        open={bootSplashOpen}
        exiting={bootSplashExiting}
        stepLabel={bootStageStepLabel}
        lowGpu={lowGpu}
      />
    </>
  );
}
