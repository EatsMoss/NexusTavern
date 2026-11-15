import React, { useId, useMemo } from 'react';
import DOMPurify from 'dompurify';
import './ModelIcon.css';

const RAW_ICON_MODULES = import.meta.glob('./icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const RAW_ICONS_BY_KEY = Object.entries(RAW_ICON_MODULES).reduce((acc, [filePath, rawSvg]) => {
  const match = filePath.match(/\/([^/]+)\.svg$/i);
  if (match && typeof rawSvg === 'string') {
    acc[match[1].toLowerCase()] = rawSvg;
  }
  return acc;
}, {});

const NORMALIZED_SVG_CACHE = new Map();

function getNormalizedSvgTemplate(iconKey) {
  const resolvedKey = RAW_ICONS_BY_KEY[iconKey] ? iconKey : 'generic';
  if (NORMALIZED_SVG_CACHE.has(resolvedKey)) {
    return NORMALIZED_SVG_CACHE.get(resolvedKey);
  }

  let svg = String(RAW_ICONS_BY_KEY[resolvedKey] || '');

  svg = svg
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  svg = svg.replace(/<svg\b([^>]*)>/i, (_, attrs) => {
    const cleaned = attrs
      .replace(/\s(?:width|height|x|y|fill|class|data-inject-url)="[^"]*"/gi, '')
      .replace(/\s(?:inkscape|sodipodi):[a-z0-9_-]+="[^"]*"/gi, '');
    return `<svg${cleaned} fill="currentColor" focusable="false" aria-hidden="true">`;
  });

  svg = svg
    .replace(/<sodipodi:namedview[\s\S]*?(?:\/>|<\/sodipodi:namedview>)/gi, '')
    .replace(/\sfill=""/gi, '');

  if (resolvedKey === 'openrouter') {
    svg = svg.replace(
      /<path\b([^>]*\bstroke-width="90"[^>]*)>/gi,
      '<path$1 fill="none" stroke="currentColor">',
    );
  }

  svg = svg
    .replace(
      /\bfill="black"/gi,
      'fill="var(--bb-page-card-bg, var(--md-sys-color-surface-container))"',
    )
    .replace(
      /fill:#ffffff/gi,
      'fill:var(--bb-page-card-bg, var(--md-sys-color-surface-container))',
    );

  const sanitized =
    typeof window !== 'undefined'
      ? DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_TAGS: ['use'],
          ADD_ATTR: [
            'xlink:href',
            'href',
            'clip-path',
            'fill-rule',
            'clip-rule',
            'preserveAspectRatio',
            'viewBox',
          ],
        })
      : svg;

  NORMALIZED_SVG_CACHE.set(resolvedKey, sanitized);
  return sanitized;
}

function scopeSvgIds(svgMarkup, instanceSuffix) {
  if (!svgMarkup || !instanceSuffix) return svgMarkup;
  const ids = [];
  svgMarkup.replace(/\bid="([^"]+)"/g, (_, id) => {
    ids.push(id);
    return _;
  });
  if (ids.length === 0) return svgMarkup;

  let scoped = svgMarkup;
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nextId = `${id}_${instanceSuffix}`;
    scoped = scoped
      .replace(new RegExp(`\\bid="${escaped}"`, 'g'), `id="${nextId}"`)
      .replace(new RegExp(`url\\(#${escaped}\\)`, 'g'), `url(#${nextId})`)
      .replace(new RegExp(`href="#${escaped}"`, 'g'), `href="#${nextId}"`);
  }
  return scoped;
}

const API_ICON_ALIASES = {
  anthropic: 'claude',
  google: 'makersuite',
  'google-ai': 'makersuite',
  'vertex-ai': 'vertexai',
  mistral: 'mistralai',
  ooba: 'textgenerationwebui',
  kobold: 'koboldcpp',
  horde: 'koboldhorde',
  novelai: 'novel',
  'open-router': 'openrouter',
  llama: 'llamacpp',
  yi: '01ai',
  zhipu: 'zai',
  glm: 'zai',
  kimi: 'moonshot',
};

export function inferModelFamily(modelId = '', api = '') {
  const s = String(modelId || '').trim().toLowerCase();
  const a = String(api || '').trim().toLowerCase();

  if (s) {
    if (s.includes('claude') || s.includes('anthropic')) return 'claude';
    if (s.includes('gemini') || s.includes('gemma') || s.includes('learnlm')) return 'makersuite';
    if (s.includes('palm') || s.includes('bison')) return 'palm';
    if (s.includes('deepseek')) return 'deepseek';
    if (
      s.includes('gpt-') ||
      s.includes('gpt4') ||
      s.includes('chatgpt') ||
      /(?:^|\/|:)o[134](?:[-/]|$)/.test(s) ||
      s.startsWith('openai/')
    ) {
      return 'openai';
    }
    if (s.includes('grok') || s.includes('x-ai/') || s.startsWith('xai/')) return 'xai';
    if (
      s.includes('mistral') ||
      s.includes('mixtral') ||
      s.includes('pixtral') ||
      s.includes('codestral') ||
      s.includes('ministral')
    ) {
      return 'mistralai';
    }
    if (s.includes('kimi') || s.includes('moonshot')) return 'moonshot';
    if (
      s.includes('glm') ||
      s.includes('chatglm') ||
      s.includes('zhipu') ||
      s.startsWith('z-ai/') ||
      s.startsWith('zai/')
    ) {
      return 'zai';
    }
    if (s.includes('command') || s.includes('cohere') || s.includes('aya-')) return 'cohere';
    if (s.includes('sonar') || s.includes('perplexity') || s.includes('r1-1776')) return 'perplexity';
    if (s.includes('yi-') || s.includes('01-ai/')) return '01ai';
    if (s.includes('jamba') || s.includes('jurassic') || s.includes('ai21')) return 'ai21';
    if (s.includes('kayra') || s.includes('erato') || s.includes('clio')) return 'novel';
    if (s.includes('llama')) return 'llamacpp';
  }

  if (a) {
    if (RAW_ICONS_BY_KEY[a]) return a;
    const aliased = API_ICON_ALIASES[a];
    if (aliased && RAW_ICONS_BY_KEY[aliased]) return aliased;
  }

  return 'generic';
}

export const AVAILABLE_MODEL_ICONS = Object.keys(RAW_ICONS_BY_KEY).sort();

export function ModelIcon({
  model = '',
  api = '',
  icon = '',
  size = 15,
  className = '',
  style,
}) {
  const rawUid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const resolvedKey = useMemo(() => {
    const explicit = String(icon || '').trim().toLowerCase();
    if (explicit && RAW_ICONS_BY_KEY[explicit]) return explicit;
    if (explicit && API_ICON_ALIASES[explicit]) return API_ICON_ALIASES[explicit];
    return inferModelFamily(model, api);
  }, [icon, model, api]);

  const svgHtml = useMemo(() => {
    const base = getNormalizedSvgTemplate(resolvedKey);
    return scopeSvgIds(base, rawUid);
  }, [resolvedKey, rawUid]);

  return (
    <span
      aria-hidden="true"
      data-model-icon={resolvedKey}
      className={`bb-model-icon bb-model-icon--${resolvedKey} ${className}`.trim()}
      style={{ width: size, height: size, ...style }}
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}
