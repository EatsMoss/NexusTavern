import React, { useState, useMemo, useRef } from 'react';
import {
  CURATED_FONT_OPTIONS,
  parseGoogleFontUrl,
} from '@core/customization/customizationDefaults.js';
import {
  Icon,
  Button,
  Input,
  Textarea,
  Switch,
  Slider,
  Dropdown,
  FolderCard,
} from '@ui/index.js';

function mergeFontOptions(baseList, googleFonts = [], importedFonts = []) {
  const map = new Map();
  for (const opt of baseList) {
    map.set(opt.value, opt);
  }
  for (const g of googleFonts) {
    if (!map.has(g.family)) {
      map.set(g.family, { value: g.family, label: `${g.family} (Google)` });
    }
  }
  for (const imp of importedFonts) {
    if (!map.has(imp.family)) {
      map.set(imp.family, { value: imp.family, label: `${imp.family} (Local)` });
    }
  }
  return Array.from(map.values());
}

export function TypographyAndCssSection({
  customization,
  forceOpen = false,
  visibleKeys = null,
  onNotify,
}) {
  const { config, updateConfig, handleUploadFont, handleRemoveFont } = customization;
  const [googleUrlDraft, setGoogleUrlDraft] = useState('');
  const [uploadingFont, setUploadingFont] = useState(false);
  const fontFileInputRef = useRef(null);

  const show = (key) => !visibleKeys || visibleKeys.has(key);

  const headingOptions = useMemo(
    () => mergeFontOptions(CURATED_FONT_OPTIONS.heading, config.googleFonts, config.importedFonts),
    [config.googleFonts, config.importedFonts],
  );
  const bodyOptions = useMemo(
    () => mergeFontOptions(CURATED_FONT_OPTIONS.body, config.googleFonts, config.importedFonts),
    [config.googleFonts, config.importedFonts],
  );
  const monoOptions = useMemo(
    () => mergeFontOptions(CURATED_FONT_OPTIONS.mono, config.googleFonts, config.importedFonts),
    [config.googleFonts, config.importedFonts],
  );

  const handleAddGoogleFont = () => {
    const parsed = parseGoogleFontUrl(googleUrlDraft);
    if (!parsed) {
      onNotify?.(
        'Paste a valid https://fonts.googleapis.com/css2?family=... stylesheet URL.',
        'error',
      );
      return;
    }
    const existing = config.googleFonts || [];
    const additions = parsed.families
      .filter((fam) => !existing.some((e) => e.family.toLowerCase() === fam.toLowerCase()))
      .map((fam) => ({
        id: `gf-${fam.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        family: fam,
        url: parsed.url,
      }));
    if (additions.length === 0) {
      onNotify?.('This Google Font family is already added.', 'info');
      setGoogleUrlDraft('');
      return;
    }
    updateConfig({
      googleFonts: [...existing, ...additions],
      fontBody: additions[0].family,
    });
    setGoogleUrlDraft('');
    onNotify?.(`Added Google Font "${additions[0].family}"`, 'success');
  };

  const handleFontFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingFont(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read font file.'));
        reader.readAsDataURL(file);
      });
      const font = await handleUploadFont({ fileName: file.name, dataUrl });
      if (font) {
        updateConfig({ fontBody: font.family });
      }
    } catch (err) {
      onNotify?.(err.message || 'Font upload failed', 'error');
    } finally {
      setUploadingFont(false);
    }
  };

  return (
    <>
      {show('appearance-typography') && (
        <FolderCard
          title="Scale & Typography"
          subtitle="UI scale, curated & custom Google / local fonts"
          icon="font"
          defaultOpen={false}
          forceOpen={forceOpen}
        >
          <Slider
            label="UI & Chat Font Scale"
            hint="Scales all 6 typography steps proportionally across the app"
            value={config.fontScale}
            min={75}
            max={135}
            step={5}
            defaultValue={100}
            unit="%"
            onChange={(fontScale) => updateConfig({ fontScale })}
          />

          <Dropdown
            label="Heading Font"
            searchable={false}
            allowStars={false}
            options={headingOptions}
            value={config.fontHeading}
            onChange={(fontHeading) => updateConfig({ fontHeading })}
          />

          <Dropdown
            label="Body & Narrative Font"
            searchable={false}
            allowStars={false}
            options={bodyOptions}
            value={config.fontBody}
            onChange={(fontBody) => updateConfig({ fontBody })}
          />

          <Dropdown
            label="Monospace & Code Font"
            searchable={false}
            allowStars={false}
            options={monoOptions}
            value={config.fontMono}
            onChange={(fontMono) => updateConfig({ fontMono })}
          />

          <div className="bb-cust-subcard">
            <span className="bb-cust-subcard__title">Add Google Font</span>
            <div className="bb-cust-font-add-row">
              <Input
                placeholder="https://fonts.googleapis.com/css2?family=..."
                value={googleUrlDraft}
                onChange={(e) => setGoogleUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddGoogleFont();
                }}
              />
              <Button
                variant="b1"
                size="sm"
                emphasis="filled"
                icon="plus"
                disabled={!googleUrlDraft.trim()}
                onClick={handleAddGoogleFont}
              >
                Add
              </Button>
            </div>
            {(config.googleFonts || []).length > 0 && (
              <div className="bb-cust-font-tags">
                {config.googleFonts.map((gf) => (
                  <span key={gf.id} className="bb-cust-font-tag">
                    <span>{gf.family}</span>
                    <button
                      type="button"
                      className="bb-cust-font-tag__del"
                      title={`Remove ${gf.family}`}
                      onClick={() =>
                        updateConfig({
                          googleFonts: config.googleFonts.filter((x) => x.id !== gf.id),
                        })
                      }
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bb-cust-subcard">
            <div className="bb-cust-subcard__head">
              <span className="bb-cust-subcard__title">Local Font Files (.woff2 / .ttf / .otf)</span>
              <Button
                variant="b2"
                size="sm"
                icon="upload"
                disabled={uploadingFont}
                onClick={() => fontFileInputRef.current?.click()}
              >
                {uploadingFont ? 'Uploading...' : 'Upload Font'}
              </Button>
              <input
                ref={fontFileInputRef}
                type="file"
                accept=".woff2,.woff,.ttf,.otf"
                hidden
                onChange={handleFontFileChange}
              />
            </div>
            {(config.importedFonts || []).length > 0 && (
              <div className="bb-cust-font-tags">
                {config.importedFonts.map((imp) => (
                  <span key={imp.id} className="bb-cust-font-tag">
                    <span>{imp.family}</span>
                    <button
                      type="button"
                      className="bb-cust-font-tag__del"
                      title={`Delete ${imp.family}`}
                      onClick={() => handleRemoveFont(imp.id)}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <Switch
            checked={config.reducedMotion}
            onChange={(reducedMotion) => updateConfig({ reducedMotion })}
            label="Reduced Motion"
            description="Disable non-essential UI animations and floating avatar motion"
          />
        </FolderCard>
      )}

      {show('appearance-custom-css') && (
        <FolderCard
          title="Custom CSS"
          subtitle="Live user stylesheet with instant master switch"
          icon="fileCode"
          defaultOpen={false}
          forceOpen={forceOpen}
        >
          <Switch
            checked={config.customCssEnabled}
            onChange={(customCssEnabled) => updateConfig({ customCssEnabled })}
            label="Enable Custom CSS"
            description="Toggle off anytime to troubleshoot layout without losing your code"
          />
          <Textarea
            monospace
            rows={7}
            placeholder="/* Example: .bb-decorator-body { line-height: 1.6; } */"
            value={config.customCss}
            onChange={(e) => updateConfig({ customCss: e.target.value })}
          />
        </FolderCard>
      )}
    </>
  );
}

