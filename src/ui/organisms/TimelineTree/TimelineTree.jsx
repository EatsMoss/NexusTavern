import React, {
  memo,
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
} from 'react';
import {
  buildTimelineForest,
  familyColorFor,
  formatShortChatDate as formatShortDate,
  getTimelineNodeNeighbors,
} from '@core/chats/timelineForest.js';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { ScrollIndicator } from '../../atoms/ScrollIndicator/ScrollIndicator.jsx';
import { ProgressIndicator } from '../../atoms/ProgressIndicator/ProgressIndicator.jsx';
import { PearlescentShader } from '../../atoms/PearlescentShader/PearlescentShader.jsx';
import { AvatarStack } from '../../molecules/AvatarStack/AvatarStack.jsx';
import {
  FloatingPalette,
  FloatingPaletteButton,
  FloatingPaletteDivider,
  FloatingPaletteReadout,
} from '../../molecules/FloatingPalette/FloatingPalette.jsx';
import { TimelineMinimap } from '../../molecules/TimelineMinimap/TimelineMinimap.jsx';
import { ChatMessageCard } from '../ChatMessageCard/ChatMessageCard.jsx';
import './TimelineTree.css';

const NODE_W = 264;
const NODE_H = 84;
const GAP_X = 96;
const GAP_Y = 28;
const ROOT_GAP_Y = 44;
const PREVIEW_W = 720;
const PREVIEW_GAP_X = 24;
const ZOOM_MIN = 0.17;
const ZOOM_MAX = 2.0;
const CULL_OVERSCAN_PX = 560;
const CULL_COMMIT_STEP_PX = 220;

function buildTimelineLayout(chats = []) {
  const forest = buildTimelineForest(chats);
  if (forest.roots.length === 0) {
    return {
      nodes: [],
      edges: [],
      roots: [],
      byFile: new Map(),
      bounds: { w: 0, h: 0 },
    };
  }

  let cursorY = 40;
  let maxRight = 0;
  let maxBottom = 0;
  const nodes = [];
  const edges = [];

  forest.roots.forEach((root, familyIdx) => {
    if (familyIdx > 0) {
      cursorY += ROOT_GAP_Y - GAP_Y;
    }

    const placeSubtree = (node, depth) => {
      node.depth = depth;
      node.familyIndex = familyIdx;
      node.rootFile = root.fileName;
      node.x = 48 + depth * (NODE_W + GAP_X);

      if (node.children.length === 0) {
        node.y = cursorY + NODE_H / 2;
        cursorY += NODE_H + GAP_Y;
      } else {
        const placedChildren = node.children.map((child) => {
          const placed = placeSubtree(child, depth + 1);
          edges.push({
            id: `${node.fileName}->${child.fileName}`,
            from: node,
            to: placed,
            familyIndex: familyIdx,
            rootFile: root.fileName,
          });
          return placed;
        });
        node.y =
          (placedChildren[0].y + placedChildren[placedChildren.length - 1].y) / 2;
      }

      maxRight = Math.max(maxRight, node.x + NODE_W);
      maxBottom = Math.max(maxBottom, node.y + NODE_H / 2);
      nodes.push(node);
      return node;
    };

    placeSubtree(root, 0);
  });

  return {
    nodes,
    edges,
    roots: forest.roots,
    byFile: forest.byFile,
    bounds: {
      w: Math.max(400, maxRight + 120),
      h: Math.max(240, maxBottom + 80),
    },
  };
}

function buildLastMessageForPreview(node, characterName) {
  const lm = node?.lastMessage;
  if (lm && typeof lm === 'object') {
    const rawText = String(lm.mes ?? '');
    return {
      id: `tl-preview-${node.fileName}`,
      index: Number.isInteger(lm.index)
        ? lm.index
        : Math.max(0, (node.messageCount || 1) - 1),
      sender: lm.name || (lm.is_user ? node.personaName || 'User' : characterName),
      isUser: Boolean(lm.is_user),
      time: lm.send_date || node.lastSendDate || formatShortDate(node),
      tokens: lm.tokens || Math.max(6, Math.ceil(rawText.length / 3.8)),
      text: rawText || '*(Empty message)*',
      swipeId: Number(lm.swipe_id ?? 0),
      swipeCount: Number(lm.swipe_count ?? 1),
      reasoning: lm.reasoning || '',
      reasoningDurationMs: lm.reasoningDurationMs ?? null,
      durationMs: lm.durationMs ?? lm.extra?.time_spent ?? null,
      api: lm.extra?.api || null,
      model: lm.extra?.model || null,
    };
  }

  const fallbackText = String(node?.lastPreview || '');
  return {
    id: `tl-preview-${node?.fileName || 'empty'}`,
    index: Math.max(0, (node?.messageCount || 1) - 1),
    sender: characterName || 'Character',
    isUser: false,
    time: node?.lastSendDate || formatShortDate(node),
    tokens: Math.max(6, Math.ceil(fallbackText.length / 3.8)),
    text: fallbackText || '*(No messages in this chat yet)*',
    swipeId: 0,
    swipeCount: 1,
    reasoning: '',
  };
}

const TimelineNodeCard = memo(function TimelineNodeCard({
  node,
  isCurrent,
  isSelected,
  characterName,
  characterAvatarUrl,
  characterInitials,
  defaultPersonaName,
  defaultPersonaAvatarUrl,
  onClickNode,
  onDoubleClickNode,
}) {
  const famColor = familyColorFor(node.familyIndex);
  const msgCount = typeof node.messageCount === 'number' ? node.messageCount : 0;
  const resolvedScenarioAvatar = node.scenarioAvatarUrl || characterAvatarUrl || null;
  const resolvedPersonaName = node.personaName || defaultPersonaName || 'User';
  const resolvedPersonaAvatar = node.personaAvatarMissing
    ? null
    : node.personaAvatarUrl || defaultPersonaAvatarUrl || null;
  const resolvedPersonaInitials =
    String(resolvedPersonaName).trim().slice(0, 2).toUpperCase() || 'ME';

  return (
    <div
      role="button"
      tabIndex={0}
      className={`bb-tl-node ${isCurrent ? 'is-current' : ''} ${
        isSelected ? 'is-selected' : ''
      } ${node.orphan ? 'is-orphan' : ''}`.trim()}
      style={{
        left: `${Math.round(node.x)}px`,
        top: `${Math.round(node.y - NODE_H / 2)}px`,
        '--bb-tl-family-color': famColor,
      }}
      title={`${node.fileName}\nClick: Preview last message • Double-click: Open chat`}
      onClick={(e) => onClickNode(e, node)}
      onDoubleClick={(e) => onDoubleClickNode(e, node)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDoubleClickNode(e, node);
        if (e.key === ' ') {
          e.preventDefault();
          onClickNode(e, node);
        }
      }}
    >
      <span className="bb-tl-node__accent" />

      <AvatarStack
        size={34}
        overlap={0.35}
        cutoutGapPx={1.75}
        className="bb-tl-node__avatar-stack"
        items={[
          {
            id: `char-${node.fileName}`,
            name: characterName || 'Scenario',
            avatarUrl: resolvedScenarioAvatar,
            initials: characterInitials || 'CH',
            title: `Scenario: ${characterName}`,
          },
          {
            id: `persona-${node.fileName}`,
            name: resolvedPersonaName,
            avatarUrl: resolvedPersonaAvatar,
            initials: resolvedPersonaInitials,
            title: `Persona: ${resolvedPersonaName}`,
          },
        ]}
      />

      <div className="bb-tl-node__body">
        <div className="bb-tl-node__top-row">
          {node.branchLabel ? (
            <span className="bb-tl-node__branch-pill">{node.branchLabel}</span>
          ) : (
            <span className="bb-tl-node__root-pill">Main</span>
          )}
          {isCurrent && <span className="bb-tl-node__active-dot">Active</span>}
        </div>

        <div className="bb-tl-node__title">{node.baseTitle}</div>

        <div className="bb-tl-node__meta">
          <span className="bb-tl-node__meta-item" title="Messages">
            <Icon name="comments" size={11} />
            {msgCount}
          </span>
          <span className="bb-tl-node__meta-item">{formatShortDate(node)}</span>
          {node.children.length > 0 && (
            <span
              className="bb-tl-node__fork-badge"
              title={`${node.children.length} branch${
                node.children.length === 1 ? '' : 'es'
              }`}
            >
              <Icon name="codeBranch" size={11} />
              {node.children.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export function TimelineTree({
  chats = [],
  activeChatFile = '',
  focusRequest = null,
  onFocusChange,
  loading = false,
  characterName = 'Character',
  characterAvatarUrl = null,
  characterInitials = 'CH',
  defaultPersonaName = 'User',
  defaultPersonaAvatarUrl = null,
  shaderStyle = 'caustics',
  shaderIntensity = 0.38,
  lowGpu = false,
  onSelectChatFile,
}) {
  const viewportRef = useRef(null);
  const worldRef = useRef(null);
  const minimapRef = useRef(null);
  const previewAnchorRef = useRef(null);
  const previewScrollRef = useRef(null);
  const cameraAnimRef = useRef(0);
  const panRafRef = useRef(0);
  const wheelSettleTimerRef = useRef(0);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [viewportSize, setViewportSize] = useState({ w: 1280, h: 800 });
  const [isPanning, setIsPanning] = useState(false);
  const [selectedFile, setSelectedFile] = useState(() => activeChatFile || '');
  const panDragRef = useRef(null);
  const didInitialCenterRef = useRef(false);
  const initialImmediatePreviewRef = useRef(true);
  const prevCharacterRef = useRef(characterName);
  const cameraStateRef = useRef({ x: 40, y: 40, zoom: 1 });
  const committedCullRef = useRef({ x: 40, y: 40, zoom: 1 });

  useEffect(() => {
    if (prevCharacterRef.current !== characterName) {
      prevCharacterRef.current = characterName;
      didInitialCenterRef.current = false;
      initialImmediatePreviewRef.current = true;
      setSelectedFile(activeChatFile || '');
    }
  }, [characterName, activeChatFile]);

  const layout = useMemo(() => buildTimelineLayout(chats), [chats]);
  const hasNodes = layout.nodes.length > 0;

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return undefined;
    const syncSize = () => {
      const w = vp.clientWidth || 1280;
      const h = vp.clientHeight || 800;
      setViewportSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    syncSize();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(syncSize);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [hasNodes]);

  // Imperatively updates the world 2D transform + grid background position in <0.1ms
  // and only commits React state when crossing the culling threshold or settling.
  const applyCameraImmediate = useCallback(
    (rawX, rawY, rawZoom, { commit = false } = {}) => {
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const z = Number(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, rawZoom)).toFixed(3));
      const x = Math.round(rawX * dpr) / dpr;
      const y = Math.round(rawY * dpr) / dpr;

      cameraStateRef.current = { x, y, zoom: z };

      if (worldRef.current) {
        worldRef.current.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
      }
      if (viewportRef.current) {
        viewportRef.current.style.backgroundPosition = `${Math.round(x)}px ${Math.round(y)}px`;
        minimapRef.current?.updateCamera(
          x,
          y,
          z,
          viewportRef.current.clientWidth || 1280,
          viewportRef.current.clientHeight || 800,
        );
      }

      const prevCommitted = committedCullRef.current;
      const movedFar =
        Math.abs(x - prevCommitted.x) >= CULL_COMMIT_STEP_PX ||
        Math.abs(y - prevCommitted.y) >= CULL_COMMIT_STEP_PX ||
        Math.abs(z - prevCommitted.zoom) >= 0.06;

      if (commit || movedFar) {
        committedCullRef.current = { x, y, zoom: z };
        setPan((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
        setZoom((prev) => (prev === z ? prev : z));
      }
    },
    [],
  );

  const stopCameraAnimation = useCallback(() => {
    if (cameraAnimRef.current) {
      cancelAnimationFrame(cameraAnimRef.current);
      cameraAnimRef.current = 0;
    }
  }, []);

  useEffect(
    () => () => {
      stopCameraAnimation();
      if (panRafRef.current) cancelAnimationFrame(panRafRef.current);
      if (wheelSettleTimerRef.current) clearTimeout(wheelSettleTimerRef.current);
    },
    [stopCameraAnimation],
  );

  const animateCameraTo = useCallback(
    (targetX, targetY, targetZoom, { immediate = false } = {}) => {
      stopCameraAnimation();
      const clampedZoom = Number(
        Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetZoom)).toFixed(3),
      );
      const finalX = Math.round(targetX);
      const finalY = Math.round(targetY);

      if (immediate) {
        applyCameraImmediate(finalX, finalY, clampedZoom, { commit: true });
        return;
      }

      const startX = cameraStateRef.current.x;
      const startY = cameraStateRef.current.y;
      const startZoom = cameraStateRef.current.zoom;
      if (
        Math.abs(finalX - startX) < 1 &&
        Math.abs(finalY - startY) < 1 &&
        Math.abs(clampedZoom - startZoom) < 0.002
      ) {
        applyCameraImmediate(finalX, finalY, clampedZoom, { commit: true });
        return;
      }

      const durationMs = 240;
      const startTime = performance.now();

      const step = (now) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        const ease = 1 - Math.pow(1 - t, 3);
        const curZoom = startZoom + (clampedZoom - startZoom) * ease;
        const curX = startX + (finalX - startX) * ease;
        const curY = startY + (finalY - startY) * ease;

        if (t < 1) {
          applyCameraImmediate(curX, curY, curZoom, { commit: false });
          cameraAnimRef.current = requestAnimationFrame(step);
        } else {
          cameraAnimRef.current = 0;
          applyCameraImmediate(finalX, finalY, clampedZoom, { commit: true });
        }
      };

      cameraAnimRef.current = requestAnimationFrame(step);
    },
    [stopCameraAnimation, applyCameraImmediate],
  );

  const zoomAroundViewportCenter = useCallback(
    (nextRawZoom) => {
      const vp = viewportRef.current;
      const { x: curX, y: curY, zoom: curZoom } = cameraStateRef.current;
      const clamped = Number(
        Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextRawZoom)).toFixed(2),
      );
      if (!vp) {
        applyCameraImmediate(curX, curY, clamped, { commit: true });
        return;
      }
      const cx = (vp.clientWidth || 800) / 2;
      const cy = (vp.clientHeight || 520) / 2;
      const worldX = (cx - curX) / curZoom;
      const worldY = (cy - curY) / curZoom;
      animateCameraTo(cx - worldX * clamped, cy - worldY * clamped, clamped);
    },
    [applyCameraImmediate, animateCameraTo],
  );

  const activeNode = useMemo(
    () => (activeChatFile ? layout.byFile.get(activeChatFile) || null : null),
    [layout, activeChatFile],
  );

  const selectedNode = useMemo(
    () => (selectedFile ? layout.byFile.get(selectedFile) || null : null),
    [layout, selectedFile],
  );

  const latestNode = useMemo(() => {
    if (!layout.nodes?.length) return null;
    let best = layout.nodes[0];
    let bestTs = best?.timestampMs || 0;
    for (let i = 1; i < layout.nodes.length; i += 1) {
      const candidate = layout.nodes[i];
      const ts = candidate?.timestampMs || 0;
      if (ts > bestTs) {
        best = candidate;
        bestTs = ts;
      }
    }
    return best;
  }, [layout.nodes]);

  const longestNode = useMemo(() => {
    if (!layout.nodes?.length) return null;
    let best = layout.nodes[0];
    let bestMsgs = Number(best?.messageCount) || 0;
    let bestDepth = Number(best?.depth) || 0;
    let bestTs = Number(best?.timestampMs) || 0;

    for (let i = 1; i < layout.nodes.length; i += 1) {
      const candidate = layout.nodes[i];
      const msgs = Number(candidate?.messageCount) || 0;
      const depth = Number(candidate?.depth) || 0;
      const ts = Number(candidate?.timestampMs) || 0;

      if (
        msgs > bestMsgs ||
        (msgs === bestMsgs && depth > bestDepth) ||
        (msgs === bestMsgs && depth === bestDepth && ts > bestTs)
      ) {
        best = candidate;
        bestMsgs = msgs;
        bestDepth = depth;
        bestTs = ts;
      }
    }
    return best;
  }, [layout.nodes]);

  const highlightedEdgeIds = useMemo(() => {
    const target = selectedNode || activeNode;
    const set = new Set();
    if (!target) return set;
    let cur = target;
    while (cur && cur.parentFile) {
      const parent = layout.byFile.get(cur.parentFile);
      if (!parent) break;
      set.add(`${parent.fileName}->${cur.fileName}`);
      cur = parent;
    }
    return set;
  }, [layout, selectedNode, activeNode]);

  const focusNodeAndPreview = useCallback(
    (node, { withPreview = false, immediate = false } = {}) => {
      const vp = viewportRef.current;
      if (!vp || !node) return;
      const vw = vp.clientWidth || 900;
      const vh = vp.clientHeight || 600;

      if (withPreview) {
        const previewEl = previewAnchorRef.current;
        const previewH = previewEl ? previewEl.offsetHeight || 260 : 260;
        const boxX = node.x;
        const boxY = node.y - NODE_H / 2;
        const boxW = NODE_W + PREVIEW_GAP_X + PREVIEW_W;
        const boxH = Math.max(NODE_H, previewH);

        const padX = 44;
        const padY = 56;
        const fitX = Math.max(120, vw - padX * 2) / boxW;
        const fitY = Math.max(120, vh - padY * 2) / boxH;
        const targetZoom = Math.max(
          ZOOM_MIN,
          Math.min(1.12, Math.min(fitX, fitY)),
        );

        const centerX = boxX + boxW / 2;
        const centerY = boxY + boxH / 2;
        const targetPanX = vw / 2 - centerX * targetZoom;
        const targetPanY = vh / 2 - centerY * targetZoom;

        animateCameraTo(targetPanX, targetPanY, targetZoom, { immediate });
        return;
      }

      const targetZoom = 1;
      const centerX = node.x + NODE_W / 2;
      const centerY = node.y;
      animateCameraTo(
        vw / 2 - centerX * targetZoom,
        vh / 2 - centerY * targetZoom,
        targetZoom,
        { immediate },
      );
    },
    [animateCameraTo],
  );

  const handleFitAll = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || layout.nodes.length === 0) return;
    const vw = vp.clientWidth || 900;
    const vh = vp.clientHeight || 600;
    const fitZ = Math.max(
      ZOOM_MIN,
      Math.min(
        1.15,
        Math.min((vw - 80) / layout.bounds.w, (vh - 100) / layout.bounds.h),
      ),
    );
    animateCameraTo(
      (vw - layout.bounds.w * fitZ) / 2,
      (vh - layout.bounds.h * fitZ) / 2,
      fitZ,
    );
  }, [layout, animateCameraTo]);

  const handleFocusFamily = useCallback(
    (rootFile) => {
      const vp = viewportRef.current;
      if (!vp || !rootFile || layout.nodes.length === 0) return;
      const famNodes = layout.nodes.filter(
        (n) => (n.rootFile || n.fileName) === rootFile,
      );
      if (famNodes.length === 0) return;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < famNodes.length; i += 1) {
        const n = famNodes[i];
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x + NODE_W);
        minY = Math.min(minY, n.y - NODE_H / 2);
        maxY = Math.max(maxY, n.y + NODE_H / 2);
      }

      const famW = Math.max(NODE_W, maxX - minX);
      const famH = Math.max(NODE_H, maxY - minY);
      const vw = vp.clientWidth || 900;
      const vh = vp.clientHeight || 600;
      const padX = 64;
      const padY = 84;
      const fitZ = Math.max(
        ZOOM_MIN,
        Math.min(
          1.12,
          Math.min(
            Math.max(120, vw - padX * 2) / famW,
            Math.max(120, vh - padY * 2) / famH,
          ),
        ),
      );
      const centerX = minX + famW / 2;
      const centerY = minY + famH / 2;
      if (selectedFile) {
        setSelectedFile('');
      }
      animateCameraTo(vw / 2 - centerX * fitZ, vh / 2 - centerY * fitZ, fitZ);
    },
    [layout.nodes, selectedFile, animateCameraTo],
  );

  const handleCenterWorldPoint = useCallback(
    (worldX, worldY) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const vw = vp.clientWidth || 900;
      const vh = vp.clientHeight || 600;
      const curZoom = cameraStateRef.current.zoom;
      animateCameraTo(vw / 2 - worldX * curZoom, vh / 2 - worldY * curZoom, curZoom);
    },
    [animateCameraTo],
  );

  // Auto-select and center on [activeChat + open last-message preview] upon opening Timelines
  useEffect(() => {
    if (didInitialCenterRef.current || layout.nodes.length === 0) return;
    const target =
      (activeChatFile && layout.byFile.get(activeChatFile)) ||
      latestNode ||
      layout.nodes[0];
    if (!target) return;
    didInitialCenterRef.current = true;
    initialImmediatePreviewRef.current = true;
    if (selectedFile === target.fileName) {
      requestAnimationFrame(() => {
        const useImmediate = initialImmediatePreviewRef.current;
        initialImmediatePreviewRef.current = false;
        focusNodeAndPreview(target, { withPreview: true, immediate: useImmediate });
      });
    } else {
      setSelectedFile(target.fileName);
    }
  }, [layout, activeChatFile, latestNode, selectedFile, focusNodeAndPreview]);

  const lastAppliedFocusSeqRef = useRef(0);

  // Respond to explicit external focus requests (e.g. clicking a branch in Left Tome `Chats`)
  useEffect(() => {
    if (!focusRequest?.fileName || !focusRequest?.seq) return;
    if (lastAppliedFocusSeqRef.current === focusRequest.seq) return;
    const node = layout.byFile.get(focusRequest.fileName);
    if (!node) return;
    lastAppliedFocusSeqRef.current = focusRequest.seq;
    didInitialCenterRef.current = true;
    initialImmediatePreviewRef.current = false;
    if (selectedFile === node.fileName) {
      focusNodeAndPreview(node, { withPreview: true, immediate: false });
    } else {
      setSelectedFile(node.fileName);
    }
  }, [focusRequest, layout, selectedFile, focusNodeAndPreview]);

  // Whenever a branch card is selected, zoom and center on [branch card + preview message]
  // once the preview card DOM has rendered and its height is known.
  useEffect(() => {
    onFocusChange?.(selectedFile || '');
    if (!selectedNode) return undefined;
    if (previewScrollRef.current) {
      previewScrollRef.current.scrollTop = 0;
    }
    const useImmediate = initialImmediatePreviewRef.current;
    initialImmediatePreviewRef.current = false;
    const rafId = requestAnimationFrame(() => {
      focusNodeAndPreview(selectedNode, { withPreview: true, immediate: useImmediate });
    });
    return () => cancelAnimationFrame(rafId);
  }, [selectedNode, selectedFile, onFocusChange, focusNodeAndPreview]);

  const handleWheel = useCallback(
    (e) => {
      if (e.target?.closest?.('.bb-tl-preview-anchor')) return;
      e.preventDefault();
      stopCameraAnimation();
      const vp = viewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const { x: curX, y: curY, zoom: curZoom } = cameraStateRef.current;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nextZoom = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, Number((curZoom * factor).toFixed(3))),
      );
      if (Math.abs(nextZoom - curZoom) < 0.001) return;

      const worldX = (cursorX - curX) / curZoom;
      const worldY = (cursorY - curY) / curZoom;
      const nextX = cursorX - worldX * nextZoom;
      const nextY = cursorY - worldY * nextZoom;

      applyCameraImmediate(nextX, nextY, nextZoom, { commit: false });

      if (wheelSettleTimerRef.current) {
        clearTimeout(wheelSettleTimerRef.current);
      }
      wheelSettleTimerRef.current = setTimeout(() => {
        wheelSettleTimerRef.current = 0;
        const settled = cameraStateRef.current;
        applyCameraImmediate(settled.x, settled.y, settled.zoom, { commit: true });
      }, 90);
    },
    [stopCameraAnimation, applyCameraImmediate],
  );

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return undefined;
    vp.addEventListener('wheel', handleWheel, { passive: false });
    return () => vp.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handlePointerDown = (e) => {
    if (
      e.target.closest('.bb-tl-node') ||
      e.target.closest('.bb-tl-preview-anchor') ||
      e.target.closest('.bb-tl-minimap') ||
      e.target.closest('.bb-tl-bottom-dock') ||
      e.target.closest('.bb-floating-palette')
    ) {
      return;
    }
    if (e.button !== 0 && e.button !== 1) return;
    stopCameraAnimation();
    const cur = cameraStateRef.current;
    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: cur.x,
      origY: cur.y,
      latestX: cur.x,
      latestY: cur.y,
      moved: false,
    };
    setIsPanning(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    const drag = panDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      drag.moved = true;
    }
    drag.latestX = drag.origX + dx;
    drag.latestY = drag.origY + dy;

    if (!panRafRef.current) {
      panRafRef.current = requestAnimationFrame(() => {
        panRafRef.current = 0;
        const activeDrag = panDragRef.current;
        if (!activeDrag) return;
        applyCameraImmediate(
          activeDrag.latestX,
          activeDrag.latestY,
          cameraStateRef.current.zoom,
          { commit: false },
        );
      });
    }
  };

  const handlePointerUp = (e) => {
    const drag = panDragRef.current;
    if (!drag) return;
    if (panRafRef.current) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = 0;
    }
    const finalX = drag.latestX;
    const finalY = drag.latestY;
    const didMove = drag.moved;
    panDragRef.current = null;
    setIsPanning(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    applyCameraImmediate(finalX, finalY, cameraStateRef.current.zoom, { commit: true });
    if (!didMove && selectedFile) {
      setSelectedFile('');
    }
  };

  const handleNodeClick = useCallback(
    (e, node) => {
      e.stopPropagation();
      if (selectedFile === node.fileName) {
        focusNodeAndPreview(node, { withPreview: true, immediate: false });
        return;
      }
      setSelectedFile(node.fileName);
    },
    [selectedFile, focusNodeAndPreview],
  );

  const handleNodeDoubleClick = useCallback(
    (e, node) => {
      e.stopPropagation();
      if (onSelectChatFile) {
        onSelectChatFile(node.fileName);
      }
    },
    [onSelectChatFile],
  );

  const previewMessage = useMemo(
    () => (selectedNode ? buildLastMessageForPreview(selectedNode, characterName) : null),
    [selectedNode, characterName],
  );

  const [gridVisible, setGridVisible] = useState(() => {
    try {
      return localStorage.getItem('nexustavern_tl_grid_v1') !== 'false';
    } catch {
      return true;
    }
  });

  const handleToggleGrid = useCallback(() => {
    setGridVisible((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('nexustavern_tl_grid_v1', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleFocusCurrentChat = useCallback(() => {
    if (!activeNode) return;
    if (selectedFile === activeNode.fileName) {
      focusNodeAndPreview(activeNode, { withPreview: true, immediate: false });
    } else {
      setSelectedFile(activeNode.fileName);
    }
  }, [activeNode, selectedFile, focusNodeAndPreview]);

  const handleFocusLatestChat = useCallback(() => {
    if (!latestNode) return;
    if (selectedFile === latestNode.fileName) {
      focusNodeAndPreview(latestNode, { withPreview: true, immediate: false });
    } else {
      setSelectedFile(latestNode.fileName);
    }
  }, [latestNode, selectedFile, focusNodeAndPreview]);

  const handleFocusLongestChat = useCallback(() => {
    if (!longestNode) return;
    if (selectedFile === longestNode.fileName) {
      focusNodeAndPreview(longestNode, { withPreview: true, immediate: false });
    } else {
      setSelectedFile(longestNode.fileName);
    }
  }, [longestNode, selectedFile, focusNodeAndPreview]);

  // Ordered sequence of all nodes in the active/selected timeline family for BookboundUI Prev/Next stepper
  const activeTimelineSequence = useMemo(() => {
    if (!layout.roots?.length) return [];
    const anchor = selectedNode || activeNode || layout.roots[0];
    const rootNode =
      (anchor?.rootFile && layout.byFile.get(anchor.rootFile)) ||
      anchor ||
      layout.roots[0];
    if (!rootNode) return [];
    const seq = [];
    const walk = (n) => {
      seq.push(n);
      if (Array.isArray(n.children)) {
        n.children.forEach(walk);
      }
    };
    walk(rootNode);
    return seq;
  }, [layout, selectedNode, activeNode]);

  const currentStepIndex = useMemo(() => {
    if (activeTimelineSequence.length === 0) return 0;
    const curFile =
      selectedFile || activeChatFile || activeTimelineSequence[0].fileName;
    const idx = activeTimelineSequence.findIndex((r) => r.fileName === curFile);
    return idx >= 0 ? idx : 0;
  }, [activeTimelineSequence, selectedFile, activeChatFile]);

  const stepTimelineChat = useCallback(
    (delta) => {
      if (activeTimelineSequence.length === 0) return;
      const nextIdx =
        (currentStepIndex + delta + activeTimelineSequence.length) %
        activeTimelineSequence.length;
      const target = activeTimelineSequence[nextIdx];
      if (!target) return;
      if (selectedFile === target.fileName) {
        focusNodeAndPreview(target, { withPreview: true, immediate: false });
      } else {
        setSelectedFile(target.fileName);
      }
    },
    [activeTimelineSequence, currentStepIndex, selectedFile, focusNodeAndPreview],
  );

  const lastVisitedChildRef = useRef(new Map());
  const navAnchorNode = useMemo(
    () => selectedNode || activeNode || layout.roots?.[0] || layout.nodes?.[0] || null,
    [selectedNode, activeNode, layout],
  );

  const navNeighbors = useMemo(
    () =>
      getTimelineNodeNeighbors(navAnchorNode, layout, {
        activeChatFile,
        lastVisitedChildMap: lastVisitedChildRef.current,
      }),
    [navAnchorNode, layout, activeChatFile, selectedFile],
  );

  const handleStepDirection = useCallback(
    (dir) => {
      if (!navAnchorNode) return;
      const target = navNeighbors[dir];
      if (!target) {
        if (!selectedNode) {
          setSelectedFile(navAnchorNode.fileName);
        }
        return;
      }
      if (dir === 'left') {
        lastVisitedChildRef.current.set(target.fileName, navAnchorNode.fileName);
      } else if (dir === 'right' && target.parentFile === navAnchorNode.fileName) {
        lastVisitedChildRef.current.set(navAnchorNode.fileName, target.fileName);
      }
      setSelectedFile(target.fileName);
    },
    [navAnchorNode, navNeighbors, selectedNode],
  );

  useEffect(() => {
    if (layout.nodes.length === 0) return undefined;

    const onKeyDown = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('.bb-modal-backdrop')) return;

      if (e.key === '[') {
        e.preventDefault();
        stepTimelineChat(-1);
      } else if (e.key === ']') {
        e.preventDefault();
        stepTimelineChat(1);
      } else if (e.key === '0') {
        e.preventDefault();
        handleFitAll();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleFocusCurrentChat();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleFocusLatestChat();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleFocusLongestChat();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomAroundViewportCenter(cameraStateRef.current.zoom + 0.15);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomAroundViewportCenter(cameraStateRef.current.zoom - 0.15);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleStepDirection('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleStepDirection('right');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleStepDirection('up');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleStepDirection('down');
      } else if (e.key === 'Enter' && selectedNode) {
        if (activeEl && activeEl.closest?.('.bb-tl-branch-list, .bb-tome')) {
          return;
        }
        e.preventDefault();
        onSelectChatFile?.(selectedNode.fileName);
      } else if (e.key === 'Escape' && selectedFile) {
        e.preventDefault();
        setSelectedFile('');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    layout.nodes.length,
    stepTimelineChat,
    handleFitAll,
    handleFocusCurrentChat,
    handleFocusLatestChat,
    handleFocusLongestChat,
    zoomAroundViewportCenter,
    handleStepDirection,
    selectedNode,
    selectedFile,
    onSelectChatFile,
  ]);

  const activeRootFile = activeNode?.rootFile || '';

  const { visibleNodes, visibleEdges } = useMemo(() => {
    if (layout.nodes.length === 0) {
      return { visibleNodes: [], visibleEdges: [] };
    }
    const z = Math.max(0.08, zoom || 1);
    const padWorld = CULL_OVERSCAN_PX / z;
    const minWorldX = -pan.x / z - padWorld;
    const maxWorldX = (viewportSize.w - pan.x) / z + padWorld;
    const minWorldY = -pan.y / z - padWorld;
    const maxWorldY = (viewportSize.h - pan.y) / z + padWorld;

    const nodesInView = layout.nodes.filter((n) => {
      if (n.fileName === selectedFile || n.fileName === activeChatFile) {
        return true;
      }
      const left = n.x;
      const right = n.x + NODE_W;
      const top = n.y - NODE_H / 2;
      const bottom = n.y + NODE_H / 2;
      return (
        right >= minWorldX &&
        left <= maxWorldX &&
        bottom >= minWorldY &&
        top <= maxWorldY
      );
    });

    const edgesInView = layout.edges.filter((edge) => {
      if (highlightedEdgeIds.has(edge.id)) return true;
      const sx = edge.from.x + NODE_W;
      const tx = edge.to.x;
      const minY = Math.min(edge.from.y, edge.to.y);
      const maxY = Math.max(edge.from.y, edge.to.y);
      return (
        tx >= minWorldX &&
        sx <= maxWorldX &&
        maxY >= minWorldY &&
        minY <= maxWorldY
      );
    });

    return { visibleNodes: nodesInView, visibleEdges: edgesInView };
  }, [
    layout.nodes,
    layout.edges,
    pan.x,
    pan.y,
    zoom,
    viewportSize.w,
    viewportSize.h,
    selectedFile,
    activeChatFile,
    highlightedEdgeIds,
  ]);

  if (loading && layout.nodes.length === 0) {
    return (
      <div className="bb-tl-tree">
        <div className="bb-tl-empty">
          <ProgressIndicator variant="circular" size="md" ariaLabel="Loading character timelines" />
          <span>Loading character timelines...</span>
        </div>
      </div>
    );
  }

  if (layout.nodes.length === 0) {
    return (
      <div className="bb-tl-tree">
        <div className="bb-tl-empty">
          <Icon name="timeline" size={28} />
          <span>No saved timelines found for {characterName} yet.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bb-tl-tree">
      <div
        ref={viewportRef}
        className={[
          'bb-tl-viewport',
          gridVisible ? 'is-grid-visible' : '',
          isPanning ? 'is-panning' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={
          gridVisible
            ? { backgroundPosition: `${Math.round(pan.x)}px ${Math.round(pan.y)}px` }
            : undefined
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          ref={worldRef}
          className="bb-tl-tree__world"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <svg className="bb-tl-tree__edges" width="1" height="1">
            {visibleEdges.map((edge) => {
              const sx = edge.from.x + NODE_W;
              const sy = edge.from.y;
              const tx = edge.to.x;
              const ty = edge.to.y;
              const mid = Math.max(28, (tx - sx) / 2);
              const d = `M ${sx} ${sy} C ${sx + mid} ${sy}, ${tx - mid} ${ty}, ${tx} ${ty}`;
              const isSelectedPath = highlightedEdgeIds.has(edge.id);
              const isActiveFamily =
                activeRootFile && edge.rootFile === activeRootFile;
              const famColor = familyColorFor(edge.familyIndex);

              return (
                <g key={edge.id} style={{ '--bb-tl-family-color': famColor }}>
                  {isSelectedPath && (
                    <path d={d} className="bb-tl-tree__edge-glow" />
                  )}
                  <path
                    d={d}
                    className={`bb-tl-tree__edge ${
                      isActiveFamily ? 'is-active-family' : ''
                    } ${isSelectedPath ? 'is-selected-path' : ''}`.trim()}
                  />
                </g>
              );
            })}
          </svg>

          {visibleNodes.map((node) => (
            <TimelineNodeCard
              key={node.fileName}
              node={node}
              isCurrent={node.fileName === activeChatFile}
              isSelected={node.fileName === selectedFile}
              characterName={characterName}
              characterAvatarUrl={characterAvatarUrl}
              characterInitials={characterInitials}
              defaultPersonaName={defaultPersonaName}
              defaultPersonaAvatarUrl={defaultPersonaAvatarUrl}
              onClickNode={handleNodeClick}
              onDoubleClickNode={handleNodeDoubleClick}
            />
          ))}
        {selectedNode && previewMessage && (
          <div
            ref={previewAnchorRef}
            className="bb-tl-preview-anchor"
            style={{
              left: `${Math.round(selectedNode.x + NODE_W + PREVIEW_GAP_X)}px`,
              top: `${Math.round(selectedNode.y - NODE_H / 2)}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bb-tl-preview-anchor__slot">
              <PearlescentShader
                variant="last-message"
                shaderStyle={shaderStyle}
                intensity={shaderIntensity}
                speed={0.283}
                lowGpu={lowGpu}
              >
                <div
                  ref={previewScrollRef}
                  className="bb-tl-preview-anchor__scroll bb-scrollbar--hidden"
                >
                  <ChatMessageCard
                    message={previewMessage}
                    isLast={true}
                    dimmed={false}
                    userName={selectedNode.personaName || defaultPersonaName}
                    userAvatarUrl={
                      selectedNode.personaAvatarMissing
                        ? null
                        : selectedNode.personaAvatarUrl || defaultPersonaAvatarUrl
                    }
                    charName={characterName}
                    charAvatarUrl={characterAvatarUrl}
                    charInitials={characterInitials}
                  />
                </div>
              </PearlescentShader>
              <ScrollIndicator
                scrollRef={previewScrollRef}
                className="bb-scroll-indicator--panel bb-scroll-indicator--tl-preview"
              />
            </div>
          </div>
        )}
      </div>

        <div className="bb-tl-bottom-dock">
          <FloatingPalette
            role="toolbar"
            ariaLabel="Timeline Canvas Toolbar"
            className="bb-tl-tools-palette"
          >
            <FloatingPaletteButton
              icon="zoomOut"
              title="Zoom out (−)"
              ariaLabel="Zoom out"
              onClick={() =>
                zoomAroundViewportCenter(cameraStateRef.current.zoom - 0.15)
              }
            />
            <FloatingPaletteButton
              mono
              title="Reset zoom to 100%"
              onClick={() => zoomAroundViewportCenter(1)}
            >
              {Math.round(zoom * 100)}%
            </FloatingPaletteButton>
            <FloatingPaletteButton
              icon="zoomIn"
              title="Zoom in (+)"
              ariaLabel="Zoom in"
              onClick={() =>
                zoomAroundViewportCenter(cameraStateRef.current.zoom + 0.15)
              }
            />

            <FloatingPaletteDivider />

            <FloatingPaletteButton
              icon="expand"
              title="Fit whole timeline (0)"
              ariaLabel="Fit whole timeline"
              onClick={handleFitAll}
            />
            <FloatingPaletteButton
              icon="grid"
              active={gridVisible}
              title="Toggle grid"
              ariaLabel="Toggle grid"
              onClick={handleToggleGrid}
            />
            {activeNode && (
              <FloatingPaletteButton
                icon="crosshairs"
                active={selectedFile === activeNode.fileName}
                title="Focus current chat (F)"
                ariaLabel="Focus current chat"
                onClick={handleFocusCurrentChat}
              />
            )}
            {latestNode && (
              <FloatingPaletteButton
                icon="history"
                active={selectedFile === latestNode.fileName}
                title={`Focus latest chat (L) — ${latestNode.branchLabel || latestNode.baseTitle || latestNode.fileName}`}
                ariaLabel="Focus latest chat with this character"
                onClick={handleFocusLatestChat}
              />
            )}
            {longestNode && (
              <FloatingPaletteButton
                icon="farthest"
                active={selectedFile === longestNode.fileName}
                title={`Focus farthest / longest chat (M) — ${longestNode.messageCount || 0} msgs · ${longestNode.branchLabel || longestNode.baseTitle || longestNode.fileName}`}
                ariaLabel="Focus longest chat with most messages"
                onClick={handleFocusLongestChat}
              />
            )}
          </FloatingPalette>

          {activeTimelineSequence.length > 0 && (
            <FloatingPalette
              role="navigation"
              ariaLabel="Timeline Chat Stepper"
              className="bb-tl-bottom-nav"
            >
              <FloatingPaletteButton
                icon="chevronLeft"
                disabled={activeTimelineSequence.length <= 1}
                title="Previous chat in active timeline ([)"
                onClick={() => stepTimelineChat(-1)}
              >
                Prev
              </FloatingPaletteButton>
              <FloatingPaletteReadout
                title={`Timeline "${
                  activeTimelineSequence[0]?.baseTitle ||
                  activeTimelineSequence[0]?.fileName ||
                  ''
                }" — chat ${currentStepIndex + 1} of ${activeTimelineSequence.length}`}
              >
                {currentStepIndex + 1} / {activeTimelineSequence.length}
              </FloatingPaletteReadout>
              <FloatingPaletteButton
                iconRight="chevronRight"
                disabled={activeTimelineSequence.length <= 1}
                title="Next chat in active timeline (])"
                onClick={() => stepTimelineChat(1)}
              >
                Next
              </FloatingPaletteButton>
            </FloatingPalette>
          )}
        </div>

        <TimelineMinimap
          ref={minimapRef}
          layout={layout}
          nodeWidth={NODE_W}
          nodeHeight={NODE_H}
          panX={pan.x}
          panY={pan.y}
          zoom={zoom}
          viewportWidth={viewportSize.w}
          viewportHeight={viewportSize.h}
          activeChatFile={activeChatFile}
          selectedFile={selectedFile}
          activeRootFile={selectedNode?.rootFile || activeRootFile}
          onFocusFamily={handleFocusFamily}
          onCenterWorldPoint={handleCenterWorldPoint}
        />
      </div>
    </div>
  );
}




