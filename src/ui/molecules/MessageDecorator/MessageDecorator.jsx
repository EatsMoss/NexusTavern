import React, { useState, useMemo, memo } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { TypingDots } from '../../atoms/TypingDots/TypingDots.jsx';
import { OverlayScrollArea } from '../../atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import {
  extractThinkingAndCleanBody,
  extractRecapAndCleanBody,
  extractLatestReasoningHeading,
  replaceDisplayMacros,
  decorateInlineText,
  decorateTextNodesInHtml,
  tokenizeStreamingInline,
  stripNonHtmlXmlTags,
  hasHtmlMarkup,
} from '@core/messages/messageDecorator.js';
import { sanitizeMessageHtml } from '@core/messages/messageHtml.js';
import {
  applyRegexPipeline,
  REGEX_PLACEMENT,
} from '@core/regex/regexEngine.js';
import { useRegexDisplayStore } from '@core/regex/regexDisplayStore.js';
import { MessageRecapBox } from '../MessageRecapBox/MessageRecapBox.jsx';
import './MessageDecorator.css';

/**
 * Splits a plain-text body into structural blocks:
 * fenced code blocks, blockquotes, dividers and paragraphs.
 * Only applied when the body carries no HTML markup of its own.
 */
function parseMessageBlocks(cleanText) {
  if (!cleanText) return [];

  const blocks = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  let lastIdx = 0;
  let match;

  const pushProseSegment = (segmentText) => {
    const rawParagraphs = segmentText.split(/\n{2,}/);
    for (const rawPara of rawParagraphs) {
      const trimmed = rawPara.trim();
      if (!trimmed) continue;

      if (/^(?:-\s*-\s*-+|\*\s*\*\s*\*+|_\s*_\s*_+)$/.test(trimmed)) {
        blocks.push({ type: 'hr' });
      } else if (trimmed.startsWith('> ')) {
        const quoteClean = trimmed
          .split('\n')
          .map((line) => line.replace(/^>\s?/, ''))
          .join('\n');
        blocks.push({ type: 'blockquote', content: quoteClean });
      } else {
        blocks.push({ type: 'paragraph', content: trimmed });
      }
    }
  };

  while ((match = codeBlockRegex.exec(cleanText)) !== null) {
    if (match.index > lastIdx) {
      pushProseSegment(cleanText.slice(lastIdx, match.index));
    }
    blocks.push({
      type: 'code',
      lang: match[1] || 'text',
      content: String(match[2] || '').replace(/\n$/, ''),
    });
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < cleanText.length) {
    pushProseSegment(cleanText.slice(lastIdx));
  }

  return blocks;
}

const VOID_HTML_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const ATTR_REACT_NAME_MAP = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  readonly: 'readOnly',
  maxlength: 'maxLength',
};

function parseInlineCssToObject(styleStr = '') {
  const out = {};
  for (const decl of String(styleStr).split(';')) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx <= 0) continue;
    const rawProp = decl.slice(0, colonIdx).trim();
    const val = decl.slice(colonIdx + 1).trim();
    if (!rawProp || !val) continue;
    const camelProp = rawProp.startsWith('--')
      ? rawProp
      : rawProp.replace(/-([a-z])/gi, (_, ch) => ch.toUpperCase());
    out[camelProp] = val;
  }
  return out;
}

function renderStreamingInlineContent(
  content,
  keyScope = '',
  animateWords = true,
  trailingNode = null,
) {
  const prefix = keyScope ? `${keyScope}-` : '';
  const sourceContent = trailingNode
    ? String(content || '').replace(/[ \t\r\n]+$/, '')
    : content;
  const segments = tokenizeStreamingInline(sourceContent);
  if (segments.length === 0) {
    return trailingNode || null;
  }

  return segments.map((seg, segIdx) => {
    const isLastSeg = Boolean(trailingNode) && segIdx === segments.length - 1;
    const lastTokIdx = seg.tokens.length - 1;

    const children = seg.tokens.map((tok, tokIdx) => {
      const renderSpaceToken = (spaceStr) => {
        if (!spaceStr.includes('\n')) return spaceStr;
        const parts = spaceStr.split('\n');
        return parts.map((part, pIdx) => (
          <React.Fragment key={`${prefix}br-${tok.offset}-${pIdx}`}>
            {pIdx > 0 && <br />}
            {part}
          </React.Fragment>
        ));
      };

      const tokEl = tok.isSpace ? (
        renderSpaceToken(tok.text)
      ) : animateWords ? (
        <span key={`${prefix}w-${tok.offset}`} className="bb-stream-word">
          {tok.text}
        </span>
      ) : (
        <span key={`${prefix}w-${tok.offset}`}>{tok.text}</span>
      );

      if (isLastSeg && tokIdx === lastTokIdx) {
        if (!tok.isSpace && tok.text.length <= 28) {
          return (
            <span key={`${prefix}tail-${tok.offset}`} className="bb-decorator-tail-anchor">
              {tokEl}
              {trailingNode}
            </span>
          );
        }
        return (
          <React.Fragment key={`${prefix}tail-${tok.offset}`}>
            {tokEl}
            {trailingNode}
          </React.Fragment>
        );
      }

      return tokEl;
    });

    if (seg.kind === 'code') {
      return (
        <code key={`${prefix}s-${seg.offset}`} className="bb-decorator-inline-code">
          {children}
        </code>
      );
    }
    if (seg.kind === 'bold') {
      return (
        <strong key={`${prefix}s-${seg.offset}`} className="bb-decorator-bold">
          {children}
        </strong>
      );
    }
    if (seg.kind === 'thought') {
      return (
        <em key={`${prefix}s-${seg.offset}`} className="bb-decorator-thought">
          {children}
        </em>
      );
    }
    if (seg.kind === 'quote') {
      return (
        <span key={`${prefix}s-${seg.offset}`} className="bb-decorator-quote">
          {children}
        </span>
      );
    }
    return <React.Fragment key={`${prefix}s-${seg.offset}`}>{children}</React.Fragment>;
  });
}

function findLastVisibleTextNode(root) {
  if (typeof document === 'undefined' || !root) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let lastTextNode = null;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.data || !node.data.trim()) continue;
    const parent = node.parentElement;
    if (parent && parent.closest('style, script, custom-style, noscript')) {
      continue;
    }
    const closedDetails = parent?.closest('details:not([open])');
    if (closedDetails && !parent?.closest('summary')) {
      continue;
    }
    lastTextNode = node;
  }
  return lastTextNode;
}

/**
 * Converts sanitized HTML into stable React nodes while `isStreaming` is true,
 * so even messages containing `<details>`, `<div>`, or status cards keep silky
 * word-by-word reveal without resetting `innerHTML` on every frame.
 * Only the active trailing branch animates newly mounted words, preventing
 * earlier prose paragraphs from re-flashing when a trailing `<details>` block opens.
 */
function renderStreamingSanitizedHtml(sanitizedHtml = '', appendTailDots = false) {
  if (typeof document === 'undefined' || !sanitizedHtml) return null;
  const root = document.createElement('div');
  root.innerHTML = sanitizedHtml;
  const targetDotsTextNode = appendTailDots ? findLastVisibleTextNode(root) : null;

  const findLastMeaningfulIdx = (nodes) => {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const n = nodes[i];
      if (n.nodeType === 1) {
        if (n.tagName.toLowerCase() === 'style') continue;
        return i;
      }
      if (n.nodeType === 3 && (n.data || '').trim()) return i;
    }
    return nodes.length - 1;
  };

  const convertNode = (node, pathKey, isRootChild = false, isTailBranch = false) => {
    if (node.nodeType === 3) {
      const raw = node.data || '';
      if (!raw) return null;
      const isTargetDotsNode = Boolean(targetDotsTextNode && node === targetDotsTextNode);
      if (isRootChild && /\n{2,}/.test(raw)) {
        const paras = raw
          .replace(/\r\n?/g, '\n')
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);
        return paras.map((para, pIdx) => {
          const isTailPara = isTailBranch && pIdx === paras.length - 1;
          const dotsNode =
            isTargetDotsNode && pIdx === paras.length - 1 ? (
              <TypingDots inline className="bb-decorator-stall-dots" />
            ) : null;
          return (
            <p key={`${pathKey}-p${pIdx}`} className="bb-decorator-p bb-decorator-p--streaming">
              {renderStreamingInlineContent(para, `${pathKey}-p${pIdx}`, isTailPara, dotsNode)}
            </p>
          );
        });
      }
      if (!raw.trim()) return raw;
      const dotsNode = isTargetDotsNode ? (
        <TypingDots inline className="bb-decorator-stall-dots" />
      ) : null;
      return (
        <React.Fragment key={pathKey}>
          {renderStreamingInlineContent(raw, pathKey, isTailBranch, dotsNode)}
        </React.Fragment>
      );
    }

    if (node.nodeType !== 1) return null;

    const tag = node.tagName.toLowerCase();
    if (tag === 'style') {
      return (
        <style
          key={pathKey}
          dangerouslySetInnerHTML={{ __html: node.textContent || '' }}
        />
      );
    }

    const props = { key: pathKey };
    for (const attr of Array.from(node.attributes || [])) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) continue;
      if (name === 'style') {
        props.style = parseInlineCssToObject(attr.value);
      } else if (name === 'open' || name === 'disabled' || name === 'checked') {
        props[name] = true;
      } else if (name === 'closed') {
        continue;
      } else {
        props[ATTR_REACT_NAME_MAP[name] || attr.name] = attr.value;
      }
    }

    if (VOID_HTML_TAGS.has(tag)) {
      return React.createElement(tag, props);
    }

    if (tag === 'code' || tag === 'pre') {
      const containsTarget = Boolean(targetDotsTextNode && node.contains(targetDotsTextNode));
      const rawCode = node.textContent || '';
      const trimmedCode = containsTarget ? rawCode.replace(/[ \t\r\n]+$/, '') : rawCode;
      return React.createElement(
        tag,
        props,
        trimmedCode,
        containsTarget ? (
          <TypingDots key="stall-dots" inline className="bb-decorator-stall-dots" />
        ) : null,
      );
    }

    const childArr = Array.from(node.childNodes);
    const lastChildIdx = findLastMeaningfulIdx(childArr);
    const children = [];
    childArr.forEach((child, idx) => {
      const rendered = convertNode(
        child,
        `${pathKey}.${idx}`,
        false,
        isTailBranch && idx === lastChildIdx,
      );
      if (Array.isArray(rendered)) {
        children.push(...rendered);
      } else if (rendered !== null && rendered !== undefined) {
        children.push(rendered);
      }
    });

    return React.createElement(tag, props, children.length > 0 ? children : null);
  };

  const rootChildren = Array.from(root.childNodes);
  const lastRootIdx = findLastMeaningfulIdx(rootChildren);
  const out = [];
  rootChildren.forEach((child, idx) => {
    const rendered = convertNode(child, `rh-${idx}`, true, idx === lastRootIdx);
    if (Array.isArray(rendered)) {
      out.push(...rendered);
    } else if (rendered !== null && rendered !== undefined) {
      out.push(rendered);
    }
  });
  return out;
}

export const MessageDecorator = memo(function MessageDecorator({
  text = '',
  reasoning = '',
  reasoningDurationMs = null,
  userName = 'User',
  charName = 'Character',
  isUser = false,
  depth = 0,
  overrideRegexScripts = null,
  defaultReasoningOpen = false,
  isStreaming = false,
  streamPhase = null,
  streamStalled = false,
  isRecapCompressed = false,
  recapCompressDepth = null,
  onSaveRecap,
}) {
  const [reasoningOpen, setReasoningOpen] = useState(defaultReasoningOpen);
  const [copiedCodeIdx, setCopiedCodeIdx] = useState(null);
  const regexDisplayState = useRegexDisplayStore();
  const activeDisplayScripts =
    overrideRegexScripts !== null ? overrideRegexScripts : regexDisplayState.combinedScripts;

  const { reasoningText, recapText, isRecapStreaming, blocks, htmlBody, streamingHtmlNodes } =
    useMemo(() => {
      const macroResolved = replaceDisplayMacros(text, userName, charName);
      const extracted = extractThinkingAndCleanBody(macroResolved, reasoning, {
        isStreaming,
      });
      let resolvedReasoning = replaceDisplayMacros(
        extracted.reasoningText,
        userName,
        charName,
      );

      const recapExtracted = !isUser
        ? extractRecapAndCleanBody(extracted.cleanBody, { isStreaming })
        : { recapText: '', cleanBody: extracted.cleanBody, isRecapStreaming: false };

      let bodyBeforeSanitize = recapExtracted.cleanBody;
      let resolvedRecap = recapExtracted.recapText;

      if (Array.isArray(activeDisplayScripts) && activeDisplayScripts.length > 0) {
        if (bodyBeforeSanitize) {
          bodyBeforeSanitize = applyRegexPipeline(bodyBeforeSanitize, activeDisplayScripts, {
            placement: isUser ? REGEX_PLACEMENT.USER_INPUT : REGEX_PLACEMENT.AI_OUTPUT,
            isMarkdown: true,
            isStreaming,
            depth,
            charName,
            userName,
          });
        }
        if (resolvedReasoning) {
          resolvedReasoning = applyRegexPipeline(resolvedReasoning, activeDisplayScripts, {
            placement: REGEX_PLACEMENT.REASONING,
            isMarkdown: true,
            isStreaming,
            depth,
            charName,
            userName,
          });
        }
      }

      if (resolvedRecap) {
        resolvedRecap = stripNonHtmlXmlTags(resolvedRecap, {
          stripTrailingPartial: recapExtracted.isRecapStreaming,
        }).trim();
      }

      const cleanedBody = stripNonHtmlXmlTags(bodyBeforeSanitize, {
        stripTrailingPartial: isStreaming,
      });

      if (hasHtmlMarkup(cleanedBody)) {
        const sanitized = sanitizeMessageHtml(cleanedBody);
        if (isStreaming) {
          return {
            reasoningText: resolvedReasoning,
            recapText: resolvedRecap,
            isRecapStreaming: recapExtracted.isRecapStreaming,
            blocks: [],
            htmlBody: '',
            streamingHtmlNodes: renderStreamingSanitizedHtml(
              sanitized,
              Boolean(
                isStreaming &&
                  streamStalled &&
                  !recapExtracted.isRecapStreaming &&
                  streamPhase !== 'waiting' &&
                  streamPhase !== 'generating',
              ),
            ),
          };
        }
        return {
          reasoningText: resolvedReasoning,
          recapText: resolvedRecap,
          isRecapStreaming: false,
          blocks: [],
          htmlBody: decorateTextNodesInHtml(sanitized),
          streamingHtmlNodes: null,
        };
      }

      return {
        reasoningText: resolvedReasoning,
        recapText: resolvedRecap,
        isRecapStreaming: recapExtracted.isRecapStreaming,
        blocks: parseMessageBlocks(cleanedBody),
        htmlBody: '',
        streamingHtmlNodes: null,
      };
    }, [
      text,
      reasoning,
      userName,
      charName,
      isUser,
      depth,
      activeDisplayScripts,
      isStreaming,
      streamStalled,
      streamPhase,
    ]);

  const hasRichStreamingNodes =
    Array.isArray(streamingHtmlNodes) && streamingHtmlNodes.length > 0;
  const isActivelyThinking = Boolean(
    isStreaming &&
      reasoningText &&
      blocks.length === 0 &&
      !htmlBody &&
      !hasRichStreamingNodes,
  );
  const effectiveReasoningOpen = reasoningOpen;

  const liveThinkingHeading = useMemo(() => {
    if (!isActivelyThinking) return null;
    return extractLatestReasoningHeading(reasoningText) || 'Thinking...';
  }, [isActivelyThinking, reasoningText]);

  const showCollapsedLiveHeading = isActivelyThinking && !effectiveReasoningOpen;

  const reasoningMetaLabel = useMemo(() => {
    if (!reasoningText) return '';
    if (isActivelyThinking) {
      return effectiveReasoningOpen ? 'Thinking...' : '';
    }
    if (typeof reasoningDurationMs === 'number' && reasoningDurationMs > 0) {
      return `${(reasoningDurationMs / 1000).toFixed(1)}s`;
    }
    const approxTokens = Math.max(4, Math.ceil(reasoningText.length / 3.8));
    return `~${approxTokens} tok`;
  }, [reasoningText, reasoningDurationMs, isActivelyThinking, effectiveReasoningOpen]);

  const handleCopyCode = (codeContent, idx) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(codeContent).catch(() => {});
    }
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 1500);
  };

  let paraCounter = 0;
  const hasBodyContent =
    blocks.length > 0 || Boolean(htmlBody) || hasRichStreamingNodes;
  const showLoadingIndicator = Boolean(
    isStreaming &&
      (streamPhase === 'waiting' ||
        streamPhase === 'generating' ||
        (!streamPhase && !reasoningText && !hasBodyContent)),
  );
  const loadingStatusLabel =
    streamPhase === 'generating' ? 'Generating response…' : 'Waiting for response…';
  const showStallIndicator = Boolean(
    isStreaming && streamStalled && !showLoadingIndicator && hasBodyContent,
  );
  let lastTextBlockIdx = -1;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    if (blocks[i].type !== 'hr' && String(blocks[i].content || '').trim()) {
      lastTextBlockIdx = i;
      break;
    }
  }

  return (
    <div className={`bb-message-decorator ${isStreaming ? 'is-streaming' : ''}`.trim()}>
      {reasoningText && (
        <div
          className={[
            'bb-reasoning-box',
            effectiveReasoningOpen ? 'bb-reasoning-box--open' : '',
            isActivelyThinking ? 'bb-reasoning-box--thinking' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <button
            type="button"
            className="bb-reasoning-box__header"
            onClick={() => setReasoningOpen((prev) => !prev)}
            aria-expanded={effectiveReasoningOpen}
          >
            <span className="bb-reasoning-box__title">
              <Icon
                name="lightbulb"
                size={14}
                className="bb-reasoning-box__icon"
              />
              {showCollapsedLiveHeading ? (
                <span
                  key={liveThinkingHeading}
                  className="bb-reasoning-box__live-heading"
                >
                  {liveThinkingHeading}
                </span>
              ) : (
                <span className="bb-reasoning-box__label">Chain of Thought</span>
              )}
              {reasoningMetaLabel && (
                <span className="bb-reasoning-box__badge">{reasoningMetaLabel}</span>
              )}
            </span>
            <Icon
              name="chevronDown"
              size={15}
              className="bb-reasoning-box__chevron"
            />
          </button>
          {effectiveReasoningOpen && (
            <OverlayScrollArea
              viewportClassName="bb-reasoning-box__body"
              variant="compact"
              watchValue={reasoningText}
            >
              {reasoningText}
            </OverlayScrollArea>
          )}
        </div>
      )}

      {hasBodyContent && (
        <div className="bb-decorator-body">
          {hasRichStreamingNodes ? (
            <div
              className="bb-decorator-rich"
              onErrorCapture={(e) => {
                const target = e.target;
                if (target && target.tagName === 'IMG' && !target.dataset.bbFallbackApplied) {
                  target.dataset.bbFallbackApplied = '1';
                  const label = String(target.getAttribute('alt') || '').trim();
                  const placeholder = document.createElement('span');
                  placeholder.className = 'bb-decorator-img-fallback';
                  placeholder.textContent = label || 'Image unavailable';
                  placeholder.title = label
                    ? `Failed to load image: ${label}`
                    : 'Failed to load image';
                  target.replaceWith(placeholder);
                }
              }}
            >
              {streamingHtmlNodes}
            </div>
          ) : htmlBody ? (
            <div
              className="bb-decorator-rich"
              onErrorCapture={(e) => {
                const target = e.target;
                if (target && target.tagName === 'IMG' && !target.dataset.bbFallbackApplied) {
                  target.dataset.bbFallbackApplied = '1';
                  const label = String(target.getAttribute('alt') || '').trim();
                  const placeholder = document.createElement('span');
                  placeholder.className = 'bb-decorator-img-fallback';
                  placeholder.textContent = label || 'Image unavailable';
                  placeholder.title = label
                    ? `Failed to load image: ${label}`
                    : 'Failed to load image';
                  target.replaceWith(placeholder);
                }
              }}
              dangerouslySetInnerHTML={{ __html: htmlBody }}
            />
          ) : null}

          {blocks.map((block, idx) => {
            const showBlockTailDots = showStallIndicator && idx === lastTextBlockIdx;
            const tailDotsEl = showBlockTailDots ? (
              <TypingDots inline className="bb-decorator-stall-dots" />
            ) : null;

            if (block.type === 'hr') {
              return <hr key={`b-${idx}`} className="bb-decorator-hr" />;
            }

            if (block.type === 'blockquote') {
              return isStreaming ? (
                <blockquote key={`b-${idx}`} className="bb-decorator-blockquote">
                  {renderStreamingInlineContent(block.content, `b-${idx}`, true, tailDotsEl)}
                </blockquote>
              ) : (
                <blockquote
                  key={`b-${idx}`}
                  className="bb-decorator-blockquote"
                  dangerouslySetInnerHTML={{ __html: decorateInlineText(block.content) }}
                />
              );
            }

            if (block.type === 'code') {
              const codeText = showBlockTailDots
                ? String(block.content || '').replace(/[ \t\r\n]+$/, '')
                : block.content;
              return (
                <div key={`b-${idx}`} className="bb-decorator-codeblock">
                  <div className="bb-decorator-codeblock__bar">
                    <span>{block.lang}</span>
                    <button
                      type="button"
                      className="bb-decorator-codeblock__copy"
                      onClick={() => handleCopyCode(block.content, idx)}
                    >
                      {copiedCodeIdx === idx ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="bb-decorator-codeblock__pre">
                    <code>
                      {codeText}
                      {tailDotsEl}
                    </code>
                  </pre>
                </div>
              );
            }

            const currentParaIdx = paraCounter++;
            if (isStreaming) {
              return (
                <p
                  key={`b-${idx}`}
                  className="bb-decorator-p bb-decorator-p--streaming"
                  data-para-index={currentParaIdx}
                >
                  {renderStreamingInlineContent(block.content, `b-${idx}`, true, tailDotsEl)}
                </p>
              );
            }

            return (
              <p
                key={`b-${idx}`}
                className="bb-decorator-p"
                data-para-index={currentParaIdx}
                dangerouslySetInnerHTML={{ __html: decorateInlineText(block.content) }}
              />
            );
          })}
        </div>
      )}

      {!isUser && (recapText || isRecapStreaming) && (
        <MessageRecapBox
          recapText={recapText}
          isStreaming={isRecapStreaming}
          isCompressed={Boolean(isRecapCompressed)}
          compressedTooltip={
            typeof recapCompressDepth === 'number'
              ? `Active context compression — full <story> block is stripped at depth ${depth} (threshold ≥ ${recapCompressDepth}), sending only this recap to the model.`
              : undefined
          }
          tokenContext={{ charName, userName }}
          onSaveRecap={onSaveRecap}
        />
      )}

      {showLoadingIndicator && (
        <TypingDots
          className="bb-decorator-waiting"
          label={loadingStatusLabel}
        />
      )}
    </div>
  );
});
