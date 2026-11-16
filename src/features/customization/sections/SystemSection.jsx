import React, { useState, useRef } from 'react';
import {
  Badge,
  Button,
  Switch,
  FolderCard,
  Modal,
  ProgressIndicator,
} from '@ui/index.js';

function downloadJsonFile(fileName, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyTextToClipboard(text) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function resolvePreferredLanUrl(lanItem, serverStatus) {
  if (!lanItem) return '';
  const currentPort = typeof window !== 'undefined' ? String(window.location.port || '') : '';
  if (currentPort && Number(currentPort) === Number(serverStatus?.clientPort) && lanItem.devUrl) {
    return lanItem.devUrl;
  }
  return lanItem.serverUrl || lanItem.devUrl || `http://${lanItem.address}:8088`;
}

export function SystemSection({
  customization,
  forceOpen = false,
  visibleKeys = null,
  onNotify,
  serverStatus = null,
  tunnelBusy = false,
  onToggleTunnelWithToast,
  onRefreshStatus,
  onOpenQrModal,
  onOpenWelcomeGuide,
}) {
  const {
    config,
    customPresets,
    updateConfig,
    handleImportBackup,
    resetAllSettingsToDefault,
  } = customization;

  const sys = config.system;
  const patchSys = (patch) => updateConfig({ system: patch });
  const show = (key) => !visibleKeys || visibleKeys.has(key);

  const [importingBackup, setImportingBackup] = useState(false);
  const [confirmResetAllOpen, setConfirmResetAllOpen] = useState(false);
  const backupInputRef = useRef(null);

  const tunnelActive = Boolean(serverStatus?.tunnel?.active);
  const isHostPc = serverStatus ? Boolean(serverStatus.isLocalHost) : true;
  const lanList = Array.isArray(serverStatus?.lanAddresses) ? serverStatus.lanAddresses : [];

  const handleCopyUrl = async (url, label = 'URL') => {
    if (!url) return;
    try {
      await copyTextToClipboard(url);
      onNotify?.(`Copied ${label} to clipboard`, 'success');
    } catch {
      onNotify?.(`Could not copy ${label}`, 'error');
    }
  };

  const handleExportWorkspaceBackup = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const payload = {
      schema: 'nexustavern-customization-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      config,
      customPresets: Array.isArray(customPresets) ? customPresets : [],
    };
    downloadJsonFile(`nexustavern-settings-backup-${stamp}.json`, payload);
    onNotify?.('Exported workspace settings & custom themes JSON', 'success');
  };

  const handleImportWorkspaceFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingBackup(true);
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      await handleImportBackup(parsed);
    } catch (err) {
      onNotify?.(err.message || 'Invalid workspace backup JSON file', 'error');
    } finally {
      setImportingBackup(false);
    }
  };

  return (
    <>
      {show('system-network') && (
        <FolderCard
          title="Network, LAN & Remote E2EE Tunnel"
          subtitle="Local Wi-Fi addresses, encrypted mobile access & startup launch"
          icon="globe"
          forceOpen={forceOpen}
        >
          <div className="bb-cust-subcard">
            {tunnelBusy && (
              <ProgressIndicator
                variant="linear"
                size="sm"
                ariaLabel="Updating encrypted mobile tunnel"
              />
            )}
            <div className="bb-cust-subcard__head">
              <span className="bb-cust-subcard__title">Mobile Access &amp; E2EE Tunnel</span>
              <Badge
                variant={tunnelActive ? 'tonal' : 'outlined'}
                icon={tunnelActive ? 'chatLock' : 'globe'}
              >
                {tunnelActive ? 'Active · AES-256-GCM' : 'Local Only'}
              </Badge>
            </div>

            {tunnelActive && serverStatus?.tunnel?.publicUrl && (
              <div className="bb-cust-net-row">
                <div className="bb-cust-net-row__meta">
                  <span className="bb-cust-net-row__label">Public Tunnel Endpoint</span>
                  <code className="bb-cust-net-row__url">{serverStatus.tunnel.publicUrl}</code>
                </div>
                <Button
                  variant="b2"
                  size="sm"
                  icon="copy"
                  onClick={() =>
                    handleCopyUrl(
                      serverStatus.tunnel.authorizedUrl || serverStatus.tunnel.publicUrl,
                      'authorized tunnel link',
                    )
                  }
                >
                  Copy
                </Button>
              </div>
            )}

            <div className="bb-cust-toolbar">
              {isHostPc && onToggleTunnelWithToast && (
                <Button
                  variant="b1"
                  size="sm"
                  emphasis="filled"
                  icon={tunnelActive ? 'stopCircle' : 'link'}
                  disabled={tunnelBusy}
                  onClick={() => onToggleTunnelWithToast(false)}
                >
                  {tunnelActive ? 'Stop Tunnel' : 'Enable Mobile Tunnel'}
                </Button>
              )}
              {isHostPc && tunnelActive && onToggleTunnelWithToast && (
                <Button
                  variant="b2"
                  size="sm"
                  icon="key"
                  disabled={tunnelBusy}
                  onClick={() => onToggleTunnelWithToast(true)}
                >
                  Rotate Key
                </Button>
              )}
              {onOpenQrModal && (
                <Button variant="b2" size="sm" icon="qr" onClick={onOpenQrModal}>
                  QR &amp; Pairing
                </Button>
              )}
              {onRefreshStatus && (
                <Button
                  variant="b2"
                  size="sm"
                  icon="refresh"
                  disabled={tunnelBusy}
                  onClick={onRefreshStatus}
                >
                  Refresh
                </Button>
              )}
            </div>

            {!isHostPc && (
              <span className="bb-caption-text">
                Connected from a remote or LAN client — starting/stopping the SSH tunnel is
                restricted to the host PC.
              </span>
            )}
          </div>

          <div className="bb-cust-subcard">
            <div className="bb-cust-subcard__head">
              <span className="bb-cust-subcard__title">Host PC LAN Addresses</span>
              <Badge variant="neutral" mono>
                {lanList.length} {lanList.length === 1 ? 'adapter' : 'adapters'}
              </Badge>
            </div>

            {lanList.length > 0 ? (
              <div className="bb-cust-net-list">
                {lanList.map((item) => {
                  const lanUrl = resolvePreferredLanUrl(item, serverStatus);
                  return (
                    <div
                      key={`${item.interface}-${item.address}`}
                      className="bb-cust-net-row"
                    >
                      <div className="bb-cust-net-row__meta">
                        <span className="bb-cust-net-row__label">{item.interface}</span>
                        <code className="bb-cust-net-row__url">{lanUrl}</code>
                      </div>
                      <Button
                        variant="b2"
                        size="sm"
                        icon="copy"
                        onClick={() => handleCopyUrl(lanUrl, 'LAN address')}
                      >
                        Copy
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <span className="bb-caption-text">
                {serverStatus
                  ? 'No active private LAN IPv4 interfaces detected on the host.'
                  : 'Reading network status from NexusTavern Server...'}
              </span>
            )}
          </div>

          <Switch
            checked={sys.autoOpenBrowser}
            onChange={(autoOpenBrowser) => patchSys({ autoOpenBrowser })}
            label="Auto-Open Browser on Startup"
            description="Automatically launch your default browser when starting NexusTavern in standalone mode"
          />
        </FolderCard>
      )}

      {show('system-performance') && (
        <FolderCard
          title="Performance & Hardware"
          subtitle="GPU compositing, backdrop blur & battery efficiency"
          icon="sliders"
          forceOpen={forceOpen}
        >
          <Switch
            checked={sys.lowGpu}
            onChange={(lowGpu) => patchSys({ lowGpu })}
            label="Low-GPU Mode"
            description="Disables the pearlescent shader, frosted backdrop-blur filters, and heavy compositing effects for smoother frame rates and lower battery drain"
          />
        </FolderCard>
      )}

      {show('system-backup') && (
        <FolderCard
          title="Workspace Backup & Onboarding"
          subtitle="Export/import full settings & custom themes JSON or reopen Welcome Guide"
          icon="folder"
          forceOpen={forceOpen}
        >
          <p className="bb-caption-text">
            Backups bundle your entire <code>customization.json</code> configuration together with
            all custom theme presets. Character cards, chat logs, and API keys remain untouched.
          </p>

          <div className="bb-cust-toolbar">
            <Button
              variant="b1"
              size="sm"
              emphasis="filled"
              icon="download"
              onClick={handleExportWorkspaceBackup}
            >
              Export Backup
            </Button>
            <Button
              variant="b2"
              size="sm"
              icon="upload"
              disabled={importingBackup}
              onClick={() => backupInputRef.current?.click()}
            >
              {importingBackup ? 'Importing...' : 'Import Backup'}
            </Button>
            {onOpenWelcomeGuide && (
              <Button
                variant="b2"
                size="sm"
                icon="bookOpen"
                onClick={onOpenWelcomeGuide}
              >
                Show Welcome Guide
              </Button>
            )}
            <Button
              variant="b2"
              size="sm"
              icon="refresh"
              onClick={() => setConfirmResetAllOpen(true)}
            >
              Reset All Settings
            </Button>
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={handleImportWorkspaceFile}
            />
          </div>

          {serverStatus?.storage && (
            <div className="bb-cust-storage-note">
              <span>
                Data Directories: <strong>{serverStatus.storage.readyDirectories}</strong> /{' '}
                {serverStatus.storage.totalDirectories} SillyTavern-compatible folders ready
              </span>
            </div>
          )}
        </FolderCard>
      )}

      <Modal
        open={confirmResetAllOpen}
        onClose={() => setConfirmResetAllOpen(false)}
        title="Reset All Workspace Settings?"
        subtitle="Restores Appearance, Chat & AI, and System options to factory defaults."
        icon="refresh"
        width={430}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="b2" onClick={() => setConfirmResetAllOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="b4"
              icon="refresh"
              onClick={() => {
                resetAllSettingsToDefault();
                setConfirmResetAllOpen(false);
              }}
            >
              Reset All Settings
            </Button>
          </div>
        }
      >
        <p className="bb-caption-text">
          Your saved custom theme presets, uploaded fonts, characters, chats, and API connections
          will not be deleted.
        </p>
      </Modal>
    </>
  );
}
