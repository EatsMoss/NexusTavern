import React, { useState } from 'react';
import { PALETTE_OVERRIDE_SLOTS } from '@core/customization/customizationDefaults.js';
import { buildDerivedTavernPalette } from '@core/customization/paletteEngine.js';
import {
  Button,
  SegmentedGroup,
  FolderCard,
  ColorField,
} from '@ui/index.js';

export function ColorSchemeSection({ customization, forceOpen = false }) {
  const { config, updateConfig, handleExtractFromPortrait } = customization;
  const [slotsOpen, setSlotsOpen] = useState(false);

  const baseAutoPalette = buildDerivedTavernPalette({
    themeMode: config.themeMode,
    colorScheme: config.colorScheme,
    primaryColor: config.primaryColor,
    accentColor: config.accentColor,
    paletteOverrides: null,
  });

  const portraitSwatches = config.portraitPalette?.swatches || undefined;
  const activeOverrides = config.paletteOverrides || {};
  const hasAnyOverride = Object.keys(activeOverrides).length > 0;

  const handlePatchSlot = (slotKey, nextHex) => {
    const nextOverrides = { ...activeOverrides };
    if (!nextHex) {
      delete nextOverrides[slotKey];
    } else {
      nextOverrides[slotKey] = nextHex;
    }
    updateConfig({
      activePresetId: 'custom',
      paletteOverrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : null,
    });
  };

  return (
    <FolderCard
      title="Color Scheme & Auto Palette"
      subtitle="Automatic M3 & Bookbound harmonic color derivation"
      icon="palette"
      forceOpen={forceOpen}
      actions={
        <Button
          variant="b2"
          size="sm"
          icon="sparkles"
          title="Sample colors from active character portrait (click again to cycle harmonious variants)"
          onClick={handleExtractFromPortrait}
        >
          Auto Portrait
        </Button>
      }
    >
      <SegmentedGroup
        fullWidth
        value={config.themeMode}
        onChange={(themeMode) => updateConfig({ themeMode, activePresetId: 'custom' })}
        options={[
          { value: 'dark', label: 'Dark Mode' },
          { value: 'light', label: 'Light Mode' },
        ]}
      />

      <SegmentedGroup
        fullWidth
        value={config.colorScheme}
        onChange={(colorScheme) => updateConfig({ colorScheme, activePresetId: 'custom' })}
        options={[
          { value: 'two-color', label: 'Two-Color Scheme' },
          { value: 'monochrome', label: 'Monochrome' },
        ]}
      />

      {portraitSwatches?.length > 0 && (
        <div className="bb-cust-portrait-bar">
          <span className="bb-caption-text">Portrait Clusters (click swatch to apply):</span>
          <div className="bb-cust-portrait-swatches">
            {portraitSwatches.map((hex) => (
              <button
                key={hex}
                type="button"
                className="bb-cust-portrait-dot"
                style={{ backgroundColor: hex, cursor: 'pointer' }}
                title={`Apply ${hex} as accent seed`}
                onClick={() => updateConfig({ accentColor: hex, activePresetId: 'custom' })}
              />
            ))}
          </div>
        </div>
      )}

      <ColorField
        label="Primary Surface Seed"
        description="Derives deep workspace, side tome, card & border tones"
        value={config.primaryColor}
        defaultValue="#6D6D83"
        swatches={portraitSwatches}
        onChange={(primaryColor) => updateConfig({ primaryColor, activePresetId: 'custom' })}
      />

      {config.colorScheme === 'two-color' && (
        <ColorField
          label="Secondary Accent Seed"
          description="Derives active controls, spoken quotes & shader iridescence"
          value={config.accentColor}
          defaultValue="#6575B3"
          swatches={portraitSwatches}
          onChange={(accentColor) => updateConfig({ accentColor, activePresetId: 'custom' })}
        />
      )}

      <div className="bb-cust-subcard">
        <div className="bb-cust-subcard__head">
          <span className="bb-cust-subcard__title">
            Fine-Tune Derived Surface Slots {hasAnyOverride ? '(Custom)' : '(All Auto)'}
          </span>
          <div style={{ display: 'inline-flex', gap: 6 }}>
            {hasAnyOverride && (
              <Button
                variant="b2"
                size="sm"
                icon="refresh"
                title="Reset all 7 slots back to automatic derivation"
                onClick={() => updateConfig({ paletteOverrides: null })}
              >
                Auto All
              </Button>
            )}
            <Button
              variant="b2"
              size="sm"
              onClick={() => setSlotsOpen((v) => !v)}
            >
              {slotsOpen || forceOpen ? 'Hide Slots' : 'Edit 7 Slots'}
            </Button>
          </div>
        </div>

        {(slotsOpen || forceOpen) && (
          <div className="bb-cust-slots-grid">
            {PALETTE_OVERRIDE_SLOTS.map((slot) => {
              const isOverridden = Boolean(activeOverrides[slot.key]);
              const autoHex = baseAutoPalette.slots[slot.key];
              return (
                <ColorField
                  key={slot.key}
                  variant="compact"
                  label={`${slot.shortLabel} · ${slot.label}`}
                  value={activeOverrides[slot.key] || autoHex}
                  autoValue={autoHex}
                  isAuto={!isOverridden}
                  onToggleAuto={(nextAuto) => {
                    if (nextAuto) handlePatchSlot(slot.key, null);
                    else handlePatchSlot(slot.key, autoHex);
                  }}
                  swatches={portraitSwatches}
                  onChange={(hex) => handlePatchSlot(slot.key, hex)}
                />
              );
            })}
          </div>
        )}
      </div>
    </FolderCard>
  );
}
