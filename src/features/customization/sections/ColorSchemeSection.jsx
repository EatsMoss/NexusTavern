import React from 'react';
import { PALETTE_OVERRIDE_SLOTS } from '@core/customization/customizationDefaults.js';
import { buildDerivedTavernPalette } from '@core/customization/paletteEngine.js';
import {
  Button,
  SegmentedGroup,
  FolderCard,
  ColorField,
  PaletteStrip,
} from '@ui/index.js';

export function ColorSchemeSection({ customization, forceOpen = false }) {
  const { config, updateConfig, handleExtractFromPortrait } = customization;

  const baseAutoPalette = buildDerivedTavernPalette({
    themeMode: config.themeMode,
    colorScheme: config.colorScheme,
    primaryColor: config.primaryColor,
    accentColor: config.accentColor,
    paletteOverrides: null,
  });

  const portraitSwatches = config.portraitPalette?.swatches || undefined;
  const activeOverrides = config.paletteOverrides || {};

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

  const stripSlots = PALETTE_OVERRIDE_SLOTS.map((slot) => {
    const autoHex = baseAutoPalette.slots[slot.key];
    const isOverridden = Boolean(activeOverrides[slot.key]);
    return {
      key: slot.key,
      shortLabel: slot.shortLabel,
      label: slot.label,
      hint: slot.hint,
      value: activeOverrides[slot.key] || autoHex,
      autoValue: autoHex,
      isOverridden,
    };
  });

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

      <PaletteStrip
        label="Derived Palette"
        hint="Click any swatch to customize"
        slots={stripSlots}
        swatches={portraitSwatches}
        onSlotChange={(slotKey, hex) => handlePatchSlot(slotKey, hex)}
        onSlotReset={(slotKey) => handlePatchSlot(slotKey, null)}
        onResetAll={() => updateConfig({ paletteOverrides: null })}
      />
    </FolderCard>
  );
}
