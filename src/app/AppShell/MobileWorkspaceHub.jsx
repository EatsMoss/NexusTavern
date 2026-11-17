import React from 'react';
import { ModuleNavCard, OverlayScrollArea, PanelScreenHeader } from '@ui/index.js';
import { LeftTomeContent } from './LeftTomeContent.jsx';
import { RightTomeContent } from './RightTomeContent.jsx';

const PLUGIN_SUB_SCREENS = new Set(['regex', 'recap', 'refusal', 'st-importer']);

/**
 * MobileWorkspaceHub — Unified smartphone `Workspace` hub & sub-screen router.
 * Zero business/prop duplication: delegates `Settings`, `Journal`, `Media`, and all
 * `Plugins` directly to `LeftTomeContent` and `RightTomeContent`.
 */
export function MobileWorkspaceHub({
  subScreen = null,
  onChangeSubScreen,
  leftTomeSharedProps,
  rightTomeSharedProps,
  personasWs,
  apiHub,
  serverStatus = null,
  consoleOpen = false,
  onOpenConsoleInChat,
  onOpenQrModal,
  onOpenSandbox,
}) {
  const personaName = personasWs.activePersonaObj?.name || personasWs.personaName || 'User';
  const personasCount = Array.isArray(personasWs.personas) ? personasWs.personas.length : 0;
  const tunnelActive = Boolean(serverStatus?.tunnel?.active);

  if (subScreen === 'settings') {
    return (
      <div className="bb-mobile-pane bb-mobile-pane--settings">
        <PanelScreenHeader
          title="Settings & Themes"
          subtitle="Appearance, Chat & AI, LAN & Backup"
          icon="settings"
          backLabel="Back to Workspace"
          onBack={() => onChangeSubScreen(null)}
        />
        <div className="bb-mobile-pane__fill">
          <LeftTomeContent {...leftTomeSharedProps} leftTab="usersettings" />
        </div>
      </div>
    );
  }

  if (subScreen && PLUGIN_SUB_SCREENS.has(subScreen)) {
    return (
      <OverlayScrollArea
        className="bb-mobile-scroll-wrap"
        viewportClassName="bb-mobile-scroll"
      >
        <RightTomeContent
          {...rightTomeSharedProps}
          rightTab="extensions"
          activeExtensionId={subScreen}
          onChangeExtensionId={onChangeSubScreen}
        />
      </OverlayScrollArea>
    );
  }

  if (subScreen === 'worldinfo' || subScreen === 'media') {
    const isWorldInfo = subScreen === 'worldinfo';
    return (
      <OverlayScrollArea
        className="bb-mobile-scroll-wrap"
        viewportClassName="bb-mobile-scroll"
      >
        <div className="bb-mobile-hub__subscreen">
          <PanelScreenHeader
            title={isWorldInfo ? 'Journal & Lorebooks' : 'Media & Backgrounds'}
            subtitle={
              isWorldInfo
                ? "World Info & Author's Notes"
                : 'Scenario backgrounds & gallery'
            }
            icon={isWorldInfo ? 'bookAtlas' : 'images'}
            backLabel="Back to Workspace"
            onBack={() => onChangeSubScreen(null)}
          />
          {isWorldInfo ? (
            <LeftTomeContent {...leftTomeSharedProps} leftTab="worldinfo" />
          ) : (
            <RightTomeContent {...rightTomeSharedProps} rightTab="media" />
          )}
        </div>
      </OverlayScrollArea>
    );
  }

  return (
    <OverlayScrollArea
      className="bb-mobile-scroll-wrap"
      viewportClassName="bb-mobile-scroll"
    >
      <div className="bb-mobile-hub">
        <div className="bb-mobile-hub__group">
          <div className="bb-mobile-hub__section-label">Core &amp; Personalization</div>
          <ModuleNavCard
            icon="settings"
            title="Settings & Themes"
            subtitle="Material You palettes, typography, streaming & system backup"
            onClick={() => onChangeSubScreen('settings')}
          />
          <ModuleNavCard
            icon="user"
            title="User Personas"
            badge={personasCount > 0 ? `${personasCount}` : null}
            badgeTone="active"
            subtitle={`Active persona: ${personaName}`}
            onClick={() => personasWs.handleOpenManagePersonaModal?.()}
          />
          <ModuleNavCard
            icon="plug"
            title="API Connections & Vault"
            badge={apiHub.selectedModelLabel ? 'Connected' : null}
            badgeTone={apiHub.selectedModelLabel ? 'active' : 'neutral'}
            subtitle={
              apiHub.selectedModelLabel
                ? `Active model: ${apiHub.selectedModelLabel}`
                : 'Configure OpenRouter, Anthropic, OpenAI, Gemini or custom endpoints'
            }
            onClick={() => apiHub.setApiModalOpen(true)}
          />
        </div>

        <div className="bb-mobile-hub__group">
          <div className="bb-mobile-hub__section-label">Plugins &amp; Prompt Automation</div>
          <RightTomeContent
            {...rightTomeSharedProps}
            rightTab="extensions"
            activeExtensionId={null}
            onChangeExtensionId={onChangeSubScreen}
          />
        </div>

        <div className="bb-mobile-hub__group">
          <div className="bb-mobile-hub__section-label">World, Media &amp; Tools</div>
          <ModuleNavCard
            icon="bookAtlas"
            title="Journal & Lorebooks"
            subtitle="World Info & Author's Notes"
            onClick={() => onChangeSubScreen('worldinfo')}
          />
          <ModuleNavCard
            icon="images"
            title="Media & Backgrounds"
            subtitle="Scenario backgrounds & gallery"
            onClick={() => onChangeSubScreen('media')}
          />
          <ModuleNavCard
            icon="code"
            title="Live Output Console"
            badge={consoleOpen ? 'Open' : null}
            badgeTone="active"
            subtitle="Inspect compiled prompts, raw LLM stream & workspace logs"
            onClick={onOpenConsoleInChat}
          />
          <ModuleNavCard
            icon="qr"
            title="Remote Access & QR Pairing"
            badge={tunnelActive ? 'Tunnel Live' : 'LAN Ready'}
            badgeTone={tunnelActive ? 'saved' : 'neutral'}
            subtitle="Connect smartphones over local Wi-Fi or E2EE SSH tunnel"
            onClick={onOpenQrModal}
          />
          <ModuleNavCard
            icon="palette"
            title="UI-Kit & Token Sandbox"
            subtitle="Inspect M3 tokens, atoms, molecules & adaptive organisms"
            onClick={onOpenSandbox}
          />
        </div>
      </div>
    </OverlayScrollArea>
  );
}
