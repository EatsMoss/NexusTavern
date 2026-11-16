import React from 'react';
import {
  JRPG_BACKDROP_PATTERNS,
  buildJrpgPatternDataUri,
} from '@core/customization/jrpgPatterns.js';
import {
  SegmentedGroup,
  Switch,
  Slider,
  FolderCard,
  ColorField,
  PatternTileCard,
} from '@ui/index.js';

export function LayoutAndSurfacesSection({
  customization,
  forceOpen = false,
  visibleKeys = null,
}) {
  const { config, derivedPalette, updateConfig } = customization;
  const lowGpu = Boolean(config.system?.lowGpu);
  const show = (key) => !visibleKeys || visibleKeys.has(key);

  return (
    <>
      {show('appearance-column') && (
        <FolderCard
          title="Chat Column & Message Cards"
          subtitle="Reading width, card translucency & blur"
          icon="comments"
          defaultOpen={false}
          forceOpen={forceOpen}
        >
          <Slider
            label="Chat Reading Column Width"
            hint="Maximum width of messages, composer & top bar"
            value={config.chatColumnMaxWidth}
            min={620}
            max={1280}
            defaultValue={784}
            unit="px"
            onChange={(chatColumnMaxWidth) => updateConfig({ chatColumnMaxWidth })}
          />
          <Slider
            label="Message Card Opacity"
            hint="Lower to reveal stage patterns or scenario backgrounds"
            value={config.mesBgOpacity}
            min={0}
            max={100}
            defaultValue={84}
            unit="%"
            onChange={(mesBgOpacity) => updateConfig({ mesBgOpacity })}
          />
          <Slider
            label="Message Backdrop Blur"
            hint={lowGpu ? 'Paused while Low-GPU Mode is active' : 'Glass blur behind message cards'}
            value={config.mesBackdropBlur}
            min={0}
            max={32}
            defaultValue={0}
            unit="px"
            disabled={lowGpu}
            onChange={(mesBackdropBlur) => updateConfig({ mesBackdropBlur })}
          />
          <Switch
            checked={config.chatEdgeFade}
            onChange={(chatEdgeFade) => updateConfig({ chatEdgeFade })}
            label="Chat Edge Soft Fade"
            description="Subtle top and bottom scroll mask on the message stream"
          />
        </FolderCard>
      )}

      {show('appearance-shader') && (
        <FolderCard
          title="Last Message Pearlescent Shader"
          subtitle="Native WebGL iridescent glow on the latest reply"
          icon="sparkles"
          defaultOpen={false}
          forceOpen={forceOpen}
        >
          <SegmentedGroup
            fullWidth
            value={config.shaderStyle}
            onChange={(shaderStyle) => updateConfig({ shaderStyle })}
            options={[
              { value: 'nacre', label: 'Pearl Nacre' },
              { value: 'caustics', label: 'Chaotic Flow' },
              { value: 'off', label: 'Off' },
            ]}
          />
          {config.shaderStyle !== 'off' && (
            <>
              <Slider
                label="Shader Intensity"
                value={config.shaderIntensity}
                min={15}
                max={100}
                defaultValue={38}
                unit="%"
                onChange={(shaderIntensity) => updateConfig({ shaderIntensity })}
              />
              <ColorField
                label="Shader Iridescent Tint"
                description="Follows active M3 accent automatically or uses custom tint"
                value={config.shaderTintColor}
                autoValue={derivedPalette.slots.accentHex}
                isAuto={config.shaderTintAuto}
                onToggleAuto={(shaderTintAuto) => updateConfig({ shaderTintAuto })}
                onChange={(shaderTintColor) =>
                  updateConfig({ shaderTintAuto: false, shaderTintColor })
                }
              />
            </>
          )}
        </FolderCard>
      )}

      {show('appearance-tomes-backdrop') && (
        <FolderCard
          title="Side Tomes & Stage Backdrop"
          subtitle="Tome translucency & geometric JRPG stage patterns"
          icon="window"
          defaultOpen={false}
          forceOpen={forceOpen}
        >
          <Switch
            checked={config.idleFade}
            onChange={(idleFade) => updateConfig({ idleFade })}
            label="Tome Idle Translucency"
            description="Dim side tomes while your cursor rests in the chat"
          />
          {config.idleFade && (
            <Slider
              label="Idle Tome Opacity"
              value={config.tomeIdleOpacity}
              min={20}
              max={100}
              defaultValue={55}
              unit="%"
              onChange={(tomeIdleOpacity) => updateConfig({ tomeIdleOpacity })}
            />
          )}
          <Slider
            label="Tome Surface Opacity"
            value={config.tomeSurfaceOpacity}
            min={45}
            max={100}
            defaultValue={92}
            unit="%"
            onChange={(tomeSurfaceOpacity) => updateConfig({ tomeSurfaceOpacity })}
          />
          <Slider
            label="Tome Backdrop Blur"
            value={config.tomeBackdropBlur}
            min={0}
            max={32}
            defaultValue={0}
            unit="px"
            disabled={lowGpu}
            onChange={(tomeBackdropBlur) => updateConfig({ tomeBackdropBlur })}
          />

          <SegmentedGroup
            fullWidth
            value={config.backdropMode === 'jrpg-pattern' ? 'jrpg-pattern' : 'solid'}
            onChange={(backdropMode) => updateConfig({ backdropMode })}
            options={[
              { value: 'solid', label: 'Theme Solid' },
              { value: 'jrpg-pattern', label: 'JRPG Pattern' },
            ]}
          />

          {config.backdropMode === 'jrpg-pattern' && (
            <>
              <div className="bb-cust-patterns-grid" role="radiogroup" aria-label="JRPG backdrop patterns">
                {JRPG_BACKDROP_PATTERNS.map((pat) => {
                  const preview = buildJrpgPatternDataUri(
                    pat.id,
                    derivedPalette.slots.inkMainHex,
                    derivedPalette.slots.accentHex,
                  );
                  const thumbW = Math.round(preview.baseWidth * 0.62);
                  const thumbH = Math.round(preview.baseHeight * 0.62);
                  return (
                    <PatternTileCard
                      key={pat.id}
                      name={pat.name}
                      patternDataUri={preview.dataUri}
                      patternSize={`${thumbW}px ${thumbH}px`}
                      surfaceBg={derivedPalette.slots.bgDeepHex}
                      active={config.bgPatternId === pat.id}
                      onSelect={() => updateConfig({ bgPatternId: pat.id })}
                    />
                  );
                })}
              </div>
              <Slider
                label="Pattern Opacity"
                value={config.bgPatternOpacity}
                min={0}
                max={100}
                defaultValue={36}
                unit="%"
                onChange={(bgPatternOpacity) => updateConfig({ bgPatternOpacity })}
              />
              <Slider
                label="Pattern Scale"
                value={config.bgPatternScale}
                min={50}
                max={300}
                defaultValue={150}
                unit="%"
                onChange={(bgPatternScale) => updateConfig({ bgPatternScale })}
              />
            </>
          )}

          <Slider
            label="Global Screen Dimming"
            hint="Soft dark veil across the stage background"
            value={config.screenDimOpacity}
            min={0}
            max={85}
            defaultValue={0}
            unit="%"
            onChange={(screenDimOpacity) => updateConfig({ screenDimOpacity })}
          />
        </FolderCard>
      )}
    </>
  );
}

