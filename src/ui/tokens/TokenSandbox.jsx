import React, { useState, useEffect, useMemo } from 'react';
import {
  M3_PRESET_SEEDS,
  M3_SURFACE_ROLES,
  M3_SEMANTIC_ROLES,
  M3_ELEVATION_LEVELS,
  M3_SHAPES,
  M3_SPACING_STEPS,
  applyM3ThemeTokens,
} from './themeTokens.js';
import { SegmentedGroup, Button, SplashScreen } from '@ui/index.js';
import { PearlescentShader } from '@ui/atoms/PearlescentShader/PearlescentShader.jsx';
import { AtomsMoleculesShowcase } from './AtomsMoleculesShowcase.jsx';
import { OrganismsShowcase } from './OrganismsShowcase.jsx';
import './TokenSandbox.css';

const SECTIONS = [
  { id: 'colors', label: 'Colour Roles' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'shape', label: 'Shape & Spacing' },
  { id: 'type', label: 'Typography' },
  { id: 'components', label: 'Atoms & Molecules' },
  { id: 'organisms', label: 'Organisms' },
  { id: 'shaders', label: 'Shaders' },
];

const TYPE_STEPS = [
  { token: '--bb-display-size', name: 'Display', sample: 'NexusTavern', family: 'var(--bb-font-heading)' },
  { token: '--bb-headline-size', name: 'Headline', sample: 'Character Archive', family: 'var(--bb-font-heading)' },
  { token: '--bb-title-size', name: 'Title', sample: 'Selected Scenario', family: 'var(--bb-font-heading)' },
  { token: '--bb-body-size', name: 'Body', sample: 'The lantern glass hummed softly against the rain-slicked parapet.', family: 'var(--bb-font-body)' },
  { token: '--bb-label-size', name: 'Label', sample: 'Context 16,384 • Temperature 1.05', family: 'var(--bb-font-body)' },
  { token: '--bb-caption-size', name: 'Caption', sample: 'Synced with Character Card v2/v3 metadata', family: 'var(--bb-font-body)' },
  { token: '--bb-mono-size', name: 'Mono', sample: 'Swipe 2 / 4 • 318 tokens • 1.24s', family: 'var(--bb-font-mono)' },
];

const CONTROL_HEIGHTS = [
  { token: '--bb-control-height-sm', name: 'Small', usage: 'Chips, inline badges, compact icon buttons' },
  { token: '--bb-control-height-md', name: 'Medium', usage: 'Default buttons, text inputs, dropdown triggers' },
  { token: '--bb-search-height', name: 'Search Pill', usage: 'M3 capsule search inputs' },
  { token: '--bb-control-height-lg', name: 'Large', usage: 'Send button, primary floating actions' },
  { token: '--bb-list-row-height', name: 'List Row (1-line)', usage: 'Prompt Manager rows, dropdown & menu items' },
  { token: '--bb-list-row-2line-height', name: 'List Row (2-line)', usage: 'Persona, character & branch list rows' },
];

export function TokenSandbox() {
  const [themeMode, setThemeMode] = useState('dark');
  const [activeSeed, setActiveSeed] = useState(M3_PRESET_SEEDS[0]);
  const [lowGpu, setLowGpu] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [shaderIntensity, setShaderIntensity] = useState(0.38);
  const [showSplashModal, setShowSplashModal] = useState(false);
  const [activeSection, setActiveSection] = useState('colors');

  useEffect(() => {
    applyM3ThemeTokens({
      themeMode,
      seedHex: activeSeed.primaryHex,
      secondaryHex: activeSeed.secondaryHex,
      tertiaryHex: activeSeed.tertiaryHex,
      fontScale,
      lowGpu,
    });
  }, [themeMode, activeSeed, fontScale, lowGpu]);

  const jumpTo = (id) => {
    setActiveSection(id);
    document.getElementById(`bb-kit-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const swatches = useMemo(
    () => [
      ...M3_SURFACE_ROLES.map((r) => ({ token: r.token, usage: r.usage })),
      ...M3_SEMANTIC_ROLES.map((r) => ({ token: r.bg, usage: r.label })),
    ],
    [],
  );
  return (
    <div className="bb-sandbox">
      {/* 1. Live controls - restyle the whole kit from here */}
      <section className="bb-sandbox-toolbar" aria-label="Design System Controls">
        <div className="bb-sandbox-control-group">
          <span className="bb-sandbox-control-label">Theme</span>
          <SegmentedGroup
            value={themeMode}
            onChange={setThemeMode}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </div>

        <div className="bb-sandbox-control-group">
          <span className="bb-sandbox-control-label">Seed</span>
          {M3_PRESET_SEEDS.map((seed) => (
            <button
              key={seed.id}
              type="button"
              title={seed.name}
              aria-label={seed.name}
              className={`bb-seed-swatch ${activeSeed.id === seed.id ? 'bb-seed-swatch--active' : ''}`}
              style={{ background: seed.primaryHex }}
              onClick={() => setActiveSeed(seed)}
            />
          ))}
        </div>

        <div className="bb-sandbox-control-group">
          <span className="bb-sandbox-control-label">Scale</span>
          <SegmentedGroup
            value={fontScale}
            onChange={setFontScale}
            options={[0.9, 1, 1.1].map((scale) => ({ value: scale, label: `${Math.round(scale * 100)}%` }))}
          />
        </div>

        <div className="bb-sandbox-control-group">
          <Button
            variant="b1"
            size="sm"
            emphasis={lowGpu ? 'filled' : 'outlined'}
            icon="sliders"
            onClick={() => setLowGpu((v) => !v)}
          >
            {lowGpu ? 'Low-GPU On' : 'Low-GPU Off'}
          </Button>
        </div>
      </section>

      <div className="bb-kit">
        <nav className="bb-kit__index" aria-label="Catalogue sections">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`bb-kit__index-item ${activeSection === section.id ? 'is-active' : ''}`}
              onClick={() => jumpTo(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="bb-kit__content">
          {/* 2. Colour roles */}
          <section id="bb-kit-colors" className="bb-sandbox-section">
            <header className="bb-sandbox-section-head">
              <div>
                <span className="bb-sandbox-eyebrow">Tokens</span>
                <h2 className="bb-t1-heading">Colour Roles</h2>
                <p className="bb-caption-text">
                  Every surface, ink and accent role currently in force. Swatches read the live
                  custom properties, so they follow the seed palette and theme above.
                </p>
              </div>
            </header>

            <div className="bb-swatch-grid">
              {swatches.map((item) => (
                <div
                  key={item.token}
                  className="bb-swatch"
                  style={{ background: `var(${item.token})`, color: 'var(--md-sys-color-on-surface)' }}
                >
                  <span className="bb-swatch__name">{item.token.replace('--', '')}</span>
                  <span className="bb-swatch__value">{item.usage}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 3. Elevation */}
          <section id="bb-kit-elevation" className="bb-sandbox-section">
            <header className="bb-sandbox-section-head">
              <div>
                <span className="bb-sandbox-eyebrow">Tokens</span>
                <h2 className="bb-t1-heading">Elevation</h2>
                <p className="bb-caption-text">
                  Six sequential levels, flat by design: no inner highlights, no stacked rims.
                  Higher levels are reserved for things that genuinely float.
                </p>
              </div>
            </header>

            <div className="bb-specimen-grid">
              {M3_ELEVATION_LEVELS.map((level) => (
                <div
                  key={level.level}
                  className="bb-specimen"
                  style={{
                    backgroundColor: `var(${level.surface})`,
                    boxShadow: `var(${level.token})`,
                  }}
                >
                  <div className="bb-specimen__label">
                    <span className="bb-specimen__name">{level.label}</span>
                    <span className="bb-specimen__token">L{level.level}</span>
                  </div>
                  <p className="bb-caption-text">{level.desc}</p>
                  <code className="bb-caption-text" style={{ fontFamily: 'var(--bb-font-mono)' }}>
                    {level.token}
                  </code>
                </div>
              ))}
            </div>
          </section>
          {/* 4. Shape and spacing */}
          <section id="bb-kit-shape" className="bb-sandbox-section">
            <header className="bb-sandbox-section-head">
              <div>
                <span className="bb-sandbox-eyebrow">Tokens</span>
                <h2 className="bb-t1-heading">Shape &amp; Spacing</h2>
                <p className="bb-caption-text">
                  One corner radius governs every control, pills stay fully round, and all spacing
                  walks the 4px baseline grid.
                </p>
              </div>
            </header>

            <div className="bb-specimen-grid">
              {M3_SHAPES.map((shape) => (
                <div key={shape.id} className="bb-specimen" style={{ borderRadius: `var(${shape.token})` }}>
                  <div className="bb-specimen__label">
                    <span className="bb-specimen__name">{shape.radius}</span>
                    <span className="bb-specimen__token">{shape.id}</span>
                  </div>
                  <p className="bb-caption-text">{shape.usage}</p>
                  <code className="bb-caption-text" style={{ fontFamily: 'var(--bb-font-mono)' }}>
                    {shape.token}
                  </code>
                </div>
              ))}
            </div>

            <div className="bb-specimen-grid">
              {CONTROL_HEIGHTS.map((item) => (
                <div key={item.token} className="bb-specimen">
                  <div className="bb-specimen__label">
                    <span className="bb-specimen__name">{item.name}</span>
                    <span className="bb-specimen__token">{item.token.replace('--', '')}</span>
                  </div>
                  <div
                    className="bb-specimen__row"
                    style={{
                      height: `var(${item.token})`,
                      border: '1px solid var(--bb-page-border-mid)',
                      borderRadius: 'var(--bb-control-radius)',
                      background: 'var(--bb-page-input-bg)',
                      padding: '0 8px',
                    }}
                  >
                    <span className="bb-caption-text">{item.usage}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bb-specimen__row" style={{ alignItems: 'flex-end', gap: 'var(--bb-space-3)' }}>
              {M3_SPACING_STEPS.map((step) => (
                <div key={step.name} className="bb-specimen__stack" style={{ alignItems: 'center' }}>
                  <div
                    style={{
                      width: step.px,
                      height: 18,
                      borderRadius: 2,
                      background: 'var(--md-sys-color-primary)',
                    }}
                  />
                  <code className="bb-caption-text" style={{ fontFamily: 'var(--bb-font-mono)' }}>
                    {step.px}px
                  </code>
                </div>
              ))}
            </div>
          </section>
          {/* 5. Typography */}
          <section id="bb-kit-type" className="bb-sandbox-section">
            <header className="bb-sandbox-section-head">
              <div>
                <span className="bb-sandbox-eyebrow">Tokens</span>
                <h2 className="bb-t1-heading">Typography</h2>
                <p className="bb-caption-text">
                  Seven steps, each bound to a token and scaled by the font-size control above.
                  Components never declare a raw pixel size.
                </p>
              </div>
            </header>

            <div className="bb-specimen__stack">
              {TYPE_STEPS.map((step) => (
                <div
                  key={step.token}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    paddingBottom: 6,
                    borderBottom: '1px solid var(--bb-page-border)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: step.family,
                      fontSize: `var(${step.token})`,
                      color: 'var(--bb-ink-heading)',
                      minWidth: 0,
                    }}
                  >
                    {step.sample}
                  </span>
                  <code
                    className="bb-caption-text"
                    style={{ fontFamily: 'var(--bb-font-mono)', whiteSpace: 'nowrap' }}
                  >
                    {step.name} / {step.token.replace('--', '')}
                  </code>
                </div>
              ))}
            </div>
          </section>
          {/* 6. Atoms and molecules */}
          <section id="bb-kit-components" className="bb-sandbox-section">
            <header className="bb-sandbox-section-head">
              <div>
                <span className="bb-sandbox-eyebrow">Kit</span>
                <h2 className="bb-t1-heading">Atoms &amp; Molecules</h2>
                <p className="bb-caption-text">
                  Every interactive element with its live states. Adjust a token above and the
                  whole catalogue follows.
                </p>
              </div>
            </header>
            <AtomsMoleculesShowcase />
          </section>

          {/* 7. Organisms */}
          <section id="bb-kit-organisms" className="bb-sandbox-section">
            <header className="bb-sandbox-section-head">
              <div>
                <span className="bb-sandbox-eyebrow">Kit</span>
                <h2 className="bb-t1-heading">Organisms</h2>
                <p className="bb-caption-text">
                  Composed surfaces built from the atoms above: dropdowns, editors, panels and cards.
                </p>
              </div>
            </header>
            <OrganismsShowcase />
          </section>
          {/* 8. Shaders */}
          <section id="bb-kit-shaders" className="bb-sandbox-section">
            <header className="bb-sandbox-section-head">
              <div>
                <span className="bb-sandbox-eyebrow">Rare accents</span>
                <h2 className="bb-t1-heading">Pearlescent WebGL Shaders</h2>
                <p className="bb-caption-text">
                  A lightweight fragment shader synced with the palette tokens. Pauses off-screen
                  and falls back to a static gradient in Low-GPU mode.
                </p>
              </div>
              <div className="bb-sandbox-control-group">
                <span className="bb-caption-text">Pearl {Math.round(shaderIntensity * 100)}%</span>
                <input
                  type="range"
                  min="0.2"
                  max="1"
                  step="0.05"
                  value={shaderIntensity}
                  onChange={(e) => setShaderIntensity(Number(e.target.value))}
                />
                <Button
                  variant="b1"
                  size="sm"
                  emphasis="filled"
                  icon="expand"
                  onClick={() => setShowSplashModal(true)}
                >
                  Splash Preview
                </Button>
              </div>
            </header>

            <div className="bb-shader-grid">
              <PearlescentShader
                variant="last-message"
                shaderStyle="caustics"
                intensity={shaderIntensity}
                speed={0.85}
                lowGpu={lowGpu}
              >
                <div className="bb-last-mes-card">
                  <div className="bb-last-mes-header">
                    <div className="bb-avatar-mock">A</div>
                    <div>
                      <div className="bb-t2-heading">Chaotic Acoustic Flow</div>
                      <div className="bb-caption-text">shaderStyle=&quot;caustics&quot;</div>
                    </div>
                  </div>
                  <p className="bb-last-mes-body">
                    The lantern glass hummed softly against the rain-slicked parapet, casting subtle
                    ripples across the stone.
                  </p>
                </div>
              </PearlescentShader>

              <PearlescentShader
                variant="last-message"
                shaderStyle="nacre"
                intensity={shaderIntensity}
                speed={0.85}
                lowGpu={lowGpu}
              >
                <div className="bb-last-mes-card">
                  <div className="bb-last-mes-header">
                    <div className="bb-avatar-mock">B</div>
                    <div>
                      <div className="bb-t2-heading">Iridescent Nacre</div>
                      <div className="bb-caption-text">shaderStyle=&quot;nacre&quot;</div>
                    </div>
                  </div>
                  <p className="bb-last-mes-body">
                    A faint opalescent shimmer drifted across the vellum pages as the seal dissolved
                    into light.
                  </p>
                </div>
              </PearlescentShader>
            </div>
          </section>
        </div>
      </div>
      <SplashScreen
        open={showSplashModal}
        lowGpu={lowGpu}
        stepLabel="Stage 2 / 3 · Hydrating workspace"
        onBackdropClick={() => setShowSplashModal(false)}
        actions={
          <Button
            variant="b1"
            emphasis="filled"
            icon="close"
            onClick={() => setShowSplashModal(false)}
          >
            Close Preview
          </Button>
        }
      />
    </div>
  );
}
