import React from 'react';
import { CHAT_TEXT_CARDS } from '@core/customization/customizationDefaults.js';
import { hexToRgba } from '@core/customization/paletteEngine.js';
import {
  Button,
  FolderCard,
  TextColorCard,
} from '@ui/index.js';

function renderLivePreviewSample(card, resolved) {
  if (card.key === 'text') {
    return <span style={{ color: resolved.text }}>{card.sample}</span>;
  }
  if (card.key === 'quote') {
    return (
      <span style={{ color: resolved.quote, fontWeight: 450, textDecoration: 'none' }}>
        {card.sample}
      </span>
    );
  }
  if (card.key === 'apostrophe') {
    return (
      <span style={{ color: resolved.apostrophe, textDecoration: 'none' }}>
        {card.sample}
      </span>
    );
  }
  if (card.key === 'italic') {
    return <em style={{ color: resolved.italic, fontStyle: 'italic' }}>{card.sample}</em>;
  }
  if (card.key === 'bold') {
    return <strong style={{ color: resolved.bold, fontWeight: 650 }}>{card.sample}</strong>;
  }
  if (card.key === 'code') {
    return (
      <code
        style={{
          padding: '2px 6px',
          borderRadius: 4,
          border: '1px solid var(--bb-page-border-mid)',
          fontFamily: 'var(--bb-font-mono)',
          fontSize: '0.92em',
          color: resolved.code.text,
          backgroundColor: hexToRgba(resolved.code.bg, resolved.code.bgAlpha),
        }}
      >
        seal_integrity: 94%
      </code>
    );
  }
  if (card.key === 'codeBlock') {
    return (
      <pre
        style={{
          margin: 0,
          padding: '7px 10px',
          borderRadius: 5,
          border: '1px solid var(--bb-page-border-mid)',
          fontFamily: 'var(--bb-font-mono)',
          fontSize: '0.88em',
          color: resolved.codeBlock.text,
          backgroundColor: hexToRgba(resolved.codeBlock.bg, resolved.codeBlock.bgAlpha),
        }}
      >
        {card.sample}
      </pre>
    );
  }
  return (
    <div
      style={{
        padding: '6px 10px',
        borderRadius: 5,
        border: '1px solid var(--bb-page-border-mid)',
        color: resolved.details.text,
        backgroundColor: hexToRgba(resolved.details.bg, resolved.details.bgAlpha),
      }}
    >
      <strong>▸ {card.sample}</strong> — Active scene notes &amp; hidden lore.
    </div>
  );
}

export function ChatTextColorsSection({ customization, forceOpen = false }) {
  const { config, derivedPalette, effectiveChatText, updateConfig } = customization;
  const autoPal = derivedPalette.chatTextPalette;
  const swatches = config.portraitPalette?.swatches || undefined;

  const hasManualCard = CHAT_TEXT_CARDS.some((c) => config.chatTextAuto?.[c.key] === false);

  const resetAllToAuto = () => {
    const nextAuto = {};
    CHAT_TEXT_CARDS.forEach((c) => {
      nextAuto[c.key] = true;
    });
    updateConfig({ chatTextAuto: nextAuto, activePresetId: 'custom' });
  };

  return (
    <FolderCard
      title="RP Chat Text Colors"
      subtitle="8 live-preview prose slots (quotes & apostrophes without underline)"
      icon="font"
      defaultOpen={false}
      forceOpen={forceOpen}
      actions={
        hasManualCard ? (
          <Button variant="b2" size="sm" icon="sparkles" onClick={resetAllToAuto}>
            Auto All
          </Button>
        ) : null
      }
    >
      <div className="bb-cust-textcards-grid">
        {CHAT_TEXT_CARDS.map((card) => {
          const isAuto = config.chatTextAuto?.[card.key] !== false;
          const isPair = card.type === 'pair';
          const isLeadProse = card.key === 'text';

          const handleToggleAuto = (nextAuto) => {
            if (nextAuto) {
              updateConfig({
                chatTextAuto: { [card.key]: true },
                activePresetId: 'custom',
              });
            } else {
              const seedVal = isPair
                ? { ...effectiveChatText[card.key] }
                : effectiveChatText[card.key];
              updateConfig({
                chatTextAuto: { [card.key]: false },
                chatText: { [card.key]: seedVal },
                activePresetId: 'custom',
              });
            }
          };

          if (!isPair) {
            return (
              <TextColorCard
                key={card.key}
                type="text"
                fullSpan={isLeadProse}
                title={card.label}
                subtitle={isLeadProse ? card.hint : undefined}
                hint={card.hint}
                isAuto={isAuto}
                onToggleAuto={handleToggleAuto}
                value={config.chatText[card.key]}
                autoValue={autoPal[card.key]}
                swatches={swatches}
                onChange={(hex) =>
                  updateConfig({
                    chatTextAuto: { [card.key]: false },
                    chatText: { [card.key]: hex },
                    activePresetId: 'custom',
                  })
                }
              >
                {renderLivePreviewSample(card, effectiveChatText)}
              </TextColorCard>
            );
          }

          return (
            <TextColorCard
              key={card.key}
              type="pair"
              fullSpan
              title={card.label}
              subtitle={card.hint}
              hint={card.hint}
              isAuto={isAuto}
              onToggleAuto={handleToggleAuto}
              value={config.chatText[card.key]?.text}
              autoValue={autoPal[card.key]?.text}
              bgValue={config.chatText[card.key]?.bg}
              autoBgValue={autoPal[card.key]?.bg}
              bgOpacity={Math.round((effectiveChatText[card.key]?.bgAlpha ?? 1) * 100)}
              swatches={swatches}
              onChange={(text) =>
                updateConfig({
                  chatTextAuto: { [card.key]: false },
                  chatText: {
                    [card.key]: { ...effectiveChatText[card.key], text },
                  },
                  activePresetId: 'custom',
                })
              }
              onBgChange={(bg) =>
                updateConfig({
                  chatTextAuto: { [card.key]: false },
                  chatText: {
                    [card.key]: { ...effectiveChatText[card.key], bg },
                  },
                  activePresetId: 'custom',
                })
              }
              onBgOpacityChange={(pct) =>
                updateConfig({
                  chatTextAuto: { [card.key]: false },
                  chatText: {
                    [card.key]: {
                      ...effectiveChatText[card.key],
                      bgAlpha: Number((pct / 100).toFixed(2)),
                    },
                  },
                  activePresetId: 'custom',
                })
              }
            >
              {renderLivePreviewSample(card, effectiveChatText)}
            </TextColorCard>
          );
        })}
      </div>
    </FolderCard>
  );
}

