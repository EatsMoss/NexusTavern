import React, { useState, useEffect, useMemo } from 'react';
import {
  Button,
  Dropdown,
  Icon,
  Input,
  Textarea,
  Modal,
  UnsavedChangesModal,
  SegmentedGroup,
} from '@ui/index.js';
import './ApiHubModal.css';

const CONNECTION_TYPE_TABS = [
  { value: 'rp_proxy', label: '1. RP Proxy' },
  { value: 'oai_proxy', label: '2. OAI-Comp' },
  { value: 'official_api', label: '3. Official API' },
];

const DEFAULT_OAI_SHORTCUTS = [
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'featherless', name: 'Featherless', baseUrl: 'https://api.featherless.ai/v1' },
  { id: 'nanogpt', name: 'NanoGPT', baseUrl: 'https://nano-gpt.com/api/v1' },
  { id: 'chutes', name: 'Chutes', baseUrl: 'https://llm.chutes.ai/v1' },
  { id: 'electronhub', name: 'ElectronHub', baseUrl: 'https://api.electronhub.top/v1' },
  { id: 'local_ollama', name: 'Local :11434', baseUrl: 'http://localhost:11434/v1' },
];

const DEFAULT_OFFICIAL_OPTIONS = [
  { value: 'makersuite', label: 'Google AI Studio (Gemini)', meta: 'Gemini' },
  { value: 'claude', label: 'Anthropic Claude', meta: 'Claude' },
  { value: 'deepseek', label: 'DeepSeek Official', meta: 'R1 / V3' },
  { value: 'openai', label: 'OpenAI Official', meta: 'GPT / o3' },
  { value: 'xai', label: 'xAI (Grok)', meta: 'Grok' },
  { value: 'mistralai', label: 'Mistral AI', meta: 'Mistral' },
  { value: 'groq', label: 'Groq Cloud', meta: 'Fast LPU' },
];

function previewCleanRpBase(raw = '') {
  let s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  s = s
    .replace(/\/(?:v1|v1beta)\/(?:chat\/completions|completions|messages|models)$/i, '')
    .replace(/\/(?:chat\/completions|completions|messages|models)$/i, '')
    .replace(/\/(?:v1|v1beta)$/i, '')
    .replace(/\/proxy\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i, '')
    .replace(/\/+$/, '');
  return s;
}

function previewAutoName(type, rawUrl, officialId) {
  if (type === 'official_api') {
    const found = DEFAULT_OFFICIAL_OPTIONS.find((o) => o.value === officialId);
    return found ? found.label : 'Official API';
  }
  const clean = String(rawUrl || '').trim();
  if (!clean) return type === 'rp_proxy' ? 'RP Proxy' : 'OAI Proxy';
  const preset = DEFAULT_OAI_SHORTCUTS.find((p) =>
    clean.toLowerCase().startsWith(p.baseUrl.replace(/\/v1$/i, '').toLowerCase()),
  );
  if (preset) return preset.name;
  try {
    const withProto = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
    const u = new URL(withProto);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return u.port ? `Local :${u.port}` : 'Local Server';
    }
    return u.hostname.replace(/^www\./i, '') || 'Proxy';
  } catch {
    return 'Proxy';
  }
}

export function ApiHubModal({
  open = false,
  hubState = null,
  onClose,
  onCreateCustomProvider,
}) {
  const [connType, setConnType] = useState('rp_proxy');
  const [baseUrl, setBaseUrl] = useState('');
  const [officialId, setOfficialId] = useState('makersuite');
  const [keysText, setKeysText] = useState('');
  const [customName, setCustomName] = useState('');

  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null); // { type: 'error' | 'warn', text: string }
  const [unsavedPromptOpen, setUnsavedPromptOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setUnsavedPromptOpen(false);
      return;
    }
    setConnType('rp_proxy');
    setBaseUrl('');
    setOfficialId('makersuite');
    setKeysText('');
    setCustomName('');
    setBusy(false);
    setBanner(null);
    setUnsavedPromptOpen(false);
  }, [open]);

  const parsedKeysCount = useMemo(
    () =>
      keysText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean).length,
    [keysText],
  );

  const normalizedRpPreview = useMemo(
    () => (connType === 'rp_proxy' ? previewCleanRpBase(baseUrl) : ''),
    [connType, baseUrl],
  );

  const autoNameHint = useMemo(
    () => previewAutoName(connType, normalizedRpPreview || baseUrl, officialId),
    [connType, normalizedRpPreview, baseUrl, officialId],
  );

  if (!open) return null;

  const oaiShortcuts = hubState?.presetsCatalog?.oaiPresets?.length
    ? hubState.presetsCatalog.oaiPresets
    : DEFAULT_OAI_SHORTCUTS;

  const canSubmit =
    !busy &&
    (connType === 'official_api'
      ? parsedKeysCount > 0
      : Boolean(baseUrl.trim()) &&
        (connType === 'oai_proxy' && /^https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(baseUrl.trim())
          ? true
          : parsedKeysCount > 0 || connType === 'oai_proxy'));

  const isDirty = Boolean(
    !banner &&
      (baseUrl.trim() || keysText.trim() || customName.trim()),
  );

  const handleRequestClose = () => {
    if (busy) return;
    if (isDirty) {
      setUnsavedPromptOpen(true);
      return;
    }
    onClose?.();
  };

  const handleConnect = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) return;
    setUnsavedPromptOpen(false);
    setBusy(true);
    setBanner(null);
    try {
      const res = await onCreateCustomProvider?.({
        type: connType,
        name: customName.trim(),
        baseUrl: baseUrl.trim(),
        officialProviderId: officialId,
        apiKeys: keysText,
        autoFetch: true,
      });

      if (res?.fetchWarning) {
        setBanner({
          type: 'error',
          text: `Saved connection, but model fetch returned: ${res.fetchWarning}. You can close and add models manually or check the key in the bar.`,
        });
        setBusy(false);
        return;
      }

      onClose?.();
    } catch (err) {
      setBanner({ type: 'error', text: err.message || 'Failed to add connection' });
      setBusy(false);
    }
  };

  return (
    <>
    <Modal
      open={open}
      onClose={handleRequestClose}
      title="Connect Proxy / API"
      subtitle="Add credentials once — switch & manage directly from the chat bar"
      icon="plug"
      width={480}
      className="bb-api-modal-frame"
      footer={
        <div className="bb-api-modal__footer">
          <Button
            variant="b1"
            emphasis="outlined"
            disabled={busy}
            onClick={handleRequestClose}
          >
            {banner ? 'Done' : 'Cancel'}
          </Button>
          <Button
            variant="b1"
            emphasis="filled"
            icon={busy ? 'refresh' : 'check'}
            disabled={!canSubmit}
            onClick={handleConnect}
          >
            {busy ? 'Connecting & Discovering...' : 'Connect & Load Models'}
          </Button>
        </div>
      }
    >
      <form className="bb-api-modal__form" onSubmit={handleConnect}>
        <div className="bb-api-modal__tabs">
          <SegmentedGroup
            fullWidth
            options={CONNECTION_TYPE_TABS}
            value={connType}
            onChange={(val) => {
              setConnType(val);
              setBanner(null);
            }}
          />
        </div>

        <div className="bb-api-modal__desc">
          {connType === 'rp_proxy' &&
            'Paste your RP Proxy link and key. Live endpoints (/proxy/gcp/claude, /proxy/aws/claude, /proxy/google-ai, /proxy/openrouter, etc.) and models are discovered automatically.'}
          {connType === 'oai_proxy' &&
            'Single OpenAI-compatible endpoint (/v1). All models on this proxy load into one dropdown.'}
          {connType === 'official_api' &&
            'Direct official provider API. Paste one or multiple keys for automatic quota failover.'}
        </div>


        {connType === 'oai_proxy' && (
          <div className="bb-api-modal__field">
            <span className="bb-api-modal__label-hint">Quick fill endpoint:</span>
            <div className="bb-api-modal__presets">
              {oaiShortcuts.map((sc) => {
                const active = baseUrl.trim().toLowerCase() === sc.baseUrl.toLowerCase();
                return (
                  <button
                    key={sc.id}
                    type="button"
                    className={`bb-api-modal__preset-chip ${active ? 'is-active' : ''}`}
                    onClick={() => {
                      setBaseUrl(sc.baseUrl);
                      if (!customName.trim()) setCustomName(sc.name);
                    }}
                  >
                    {sc.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {connType === 'official_api' ? (
          <Dropdown
            label="Official Provider"
            options={DEFAULT_OFFICIAL_OPTIONS}
            value={officialId}
            onChange={setOfficialId}
            searchable={false}
            allowStars={false}
          />
        ) : (
          <div className="bb-api-modal__field">
            <Input
              label={connType === 'rp_proxy' ? 'Proxy URL' : 'Endpoint URL'}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={
                connType === 'rp_proxy'
                  ? 'https://your-rp-proxy.org'
                  : 'https://your-oai-proxy.com/v1'
              }
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            {connType === 'rp_proxy' &&
              normalizedRpPreview &&
              normalizedRpPreview.toLowerCase() !==
                baseUrl.trim().replace(/\/+$/, '').toLowerCase() && (
                <div className="bb-api-modal__url-preview">
                  <Icon name="check" size={12} />
                  <span>Base URL normalized to: {normalizedRpPreview}</span>
                </div>
              )}
          </div>
        )}

        <div className="bb-api-modal__field">
          <div className="bb-api-modal__label-row">
            <label className="bb-api-modal__label" htmlFor="bb-api-keys-input">
              {connType === 'rp_proxy' ? 'Proxy Key(s)' : 'API Key(s)'}
            </label>
            <span className="bb-api-modal__label-hint">
              {parsedKeysCount > 1
                ? `${parsedKeysCount} keys ready (auto-failover)`
                : '1 per line for backup keys'}
            </span>
          </div>
          <Textarea
            id="bb-api-keys-input"
            className="bb-api-modal__keys-box"
            rows={2}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={
              connType === 'oai_proxy'
                ? 'Paste key (or multiple keys, one per line; optional for localhost)...'
                : 'Paste key (or multiple backup keys, one per line)...'
            }
            value={keysText}
            onChange={(e) => setKeysText(e.target.value)}
          />
        </div>

        <Input
          label="Name (Optional)"
          placeholder={`Auto: ${autoNameHint}`}
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
        />

        {banner && (
          <div className={`bb-api-modal__banner ${banner.type === 'error' ? 'is-error' : ''}`}>
            {banner.text}
          </div>
        )}
      </form>
    </Modal>

    <UnsavedChangesModal
      open={unsavedPromptOpen}
      subtitle="Connect Proxy / API"
      itemName={customName.trim() || autoNameHint || 'New Connection'}
      saveLabel="Connect & Save"
      canSave={canSubmit}
      cannotSaveReason={
        !canSubmit
          ? connType === 'official_api'
            ? 'Enter at least one API key before saving, or discard changes.'
            : 'Enter a valid endpoint URL and key before saving, or discard changes.'
          : ''
      }
      busy={busy}
      onCancel={() => setUnsavedPromptOpen(false)}
      onDiscard={() => {
        setUnsavedPromptOpen(false);
        onClose?.();
      }}
      onSave={() => handleConnect()}
    />
    </>
  );
}

