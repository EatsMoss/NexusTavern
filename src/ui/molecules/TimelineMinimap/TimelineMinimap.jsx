import React, {
  forwardRef,
  useState,
  useRef,
  useMemo,
  useImperativeHandle,
  useCallback,
  useEffect,
} from 'react';
import { familyColorFor } from '@core/chats/timelineForest.js';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import './TimelineMinimap.css';

/**
 * TimelineMinimap — M3 overview frame displaying simplified color-coded branching
 * and relative length of every timeline in the forest.
 * - Clicking a colored timeline centers & fits that entire timeline on the canvas.
 * - Clicking empty space pans the camera to that world coordinate.
 */
export const TimelineMinimap = forwardRef(function TimelineMinimap(
  {
    layout,
    nodeWidth = 264,
    nodeHeight = 84,
    panX = 0,
    panY = 0,
    zoom = 1,
    viewportWidth = 1280,
    viewportHeight = 800,
    activeChatFile = '',
    selectedFile = '',
    activeRootFile = '',
    onFocusFamily,
    onCenterWorldPoint,
  },
  ref,
) {
  const vpRectRef = useRef(null);
  const svgRef = useRef(null);
  const [hoveredRootFile, setHoveredRootFile] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const worldW = Math.max(400, layout?.bounds?.w || 400);
  const worldH = Math.max(240, layout?.bounds?.h || 240);

  const stageW = 186;
  const stageH = useMemo(() => {
    const rawH = Math.round((worldH / worldW) * stageW);
    return Math.max(78, Math.min(142, rawH));
  }, [worldW, worldH]);

  const projection = useMemo(() => {
    const pad = 8;
    const availW = stageW - pad * 2;
    const availH = stageH - pad * 2;
    const scale = Math.min(availW / worldW, availH / worldH);
    const offsetX = (stageW - worldW * scale) / 2;
    const offsetY = (stageH - worldH * scale) / 2;
    return { scale, offsetX, offsetY };
  }, [worldW, worldH, stageW, stageH]);

  const families = useMemo(() => {
    const nodes = layout?.nodes || [];
    const edges = layout?.edges || [];
    if (nodes.length === 0) return [];

    let maxMsg = 1;
    for (let i = 0; i < nodes.length; i += 1) {
      const m = Number(nodes[i].messageCount) || 0;
      if (m > maxMsg) maxMsg = m;
    }

    const byRoot = new Map();
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const key = n.rootFile || n.fileName;
      let fam = byRoot.get(key);
      if (!fam) {
        fam = {
          rootFile: key,
          familyIndex: n.familyIndex || 0,
          color: familyColorFor(n.familyIndex || 0),
          title: n.baseTitle || key.replace(/\.jsonl$/i, ''),
          nodes: [],
          edges: [],
          minX: Infinity,
          minY: Infinity,
          maxX: -Infinity,
          maxY: -Infinity,
          totalMessages: 0,
        };
        byRoot.set(key, fam);
      }
      fam.nodes.push(n);
      fam.totalMessages += Number(n.messageCount) || 0;
      fam.minX = Math.min(fam.minX, n.x);
      fam.maxX = Math.max(fam.maxX, n.x + nodeWidth);
      fam.minY = Math.min(fam.minY, n.y - nodeHeight / 2);
      fam.maxY = Math.max(fam.maxY, n.y + nodeHeight / 2);
    }

    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i];
      const fam = byRoot.get(e.rootFile);
      if (fam) fam.edges.push(e);
    }

    return Array.from(byRoot.values()).map((fam) => ({
      ...fam,
      maxMsg,
    }));
  }, [layout, nodeWidth, nodeHeight]);

  const syncViewportRect = useCallback(
    (curPanX, curPanY, curZoom, curVw, curVh) => {
      const el = vpRectRef.current;
      if (!el) return;
      const z = Math.max(0.05, Number(curZoom) || 1);
      const wx = -curPanX / z;
      const wy = -curPanY / z;
      const ww = (curVw || 1280) / z;
      const wh = (curVh || 800) / z;

      const rx = projection.offsetX + wx * projection.scale;
      const ry = projection.offsetY + wy * projection.scale;
      const rw = Math.max(8, ww * projection.scale);
      const rh = Math.max(6, wh * projection.scale);

      el.setAttribute('x', rx.toFixed(1));
      el.setAttribute('y', ry.toFixed(1));
      el.setAttribute('width', rw.toFixed(1));
      el.setAttribute('height', rh.toFixed(1));
    },
    [projection],
  );

  useImperativeHandle(
    ref,
    () => ({
      updateCamera(nextPanX, nextPanY, nextZoom, nextVw, nextVh) {
        syncViewportRect(nextPanX, nextPanY, nextZoom, nextVw, nextVh);
      },
    }),
    [syncViewportRect],
  );

  useEffect(() => {
    if (!collapsed) {
      syncViewportRect(panX, panY, zoom, viewportWidth, viewportHeight);
    }
  }, [panX, panY, zoom, viewportWidth, viewportHeight, collapsed, syncViewportRect]);

  const handleStageClick = useCallback(
    (e) => {
      if (!onCenterWorldPoint || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const sx = ((e.clientX - rect.left) / rect.width) * stageW;
      const sy = ((e.clientY - rect.top) / rect.height) * stageH;
      const worldX = (sx - projection.offsetX) / projection.scale;
      const worldY = (sy - projection.offsetY) / projection.scale;
      onCenterWorldPoint(worldX, worldY);
    },
    [onCenterWorldPoint, stageW, stageH, projection],
  );

  if (!families.length) return null;

  const hoveredFam = hoveredRootFile
    ? families.find((f) => f.rootFile === hoveredRootFile)
    : null;

  return (
    <aside
      className={`bb-tl-minimap ${collapsed ? 'is-collapsed' : ''}`.trim()}
      aria-label="Timeline Overview Map"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="bb-tl-minimap__header">
        <span className="bb-tl-minimap__title">
          {hoveredFam ? (
            <>
              <span
                className="bb-tl-minimap__swatch"
                style={{ backgroundColor: hoveredFam.color }}
              />
              <span>
                {hoveredFam.title} ({hoveredFam.nodes.length})
              </span>
            </>
          ) : (
            <span>
              Overview · {families.length} {families.length === 1 ? 'line' : 'lines'}
            </span>
          )}
        </span>
        <button
          type="button"
          className="bb-tl-minimap__toggle"
          title={collapsed ? 'Expand timeline overview' : 'Collapse timeline overview'}
          onClick={() => setCollapsed((v) => !v)}
        >
          <Icon name={collapsed ? 'expand' : 'chevronDown'} size={13} />
        </button>
      </div>

      {!collapsed && (
        <div className="bb-tl-minimap__stage" onClick={handleStageClick}>
          <svg
            ref={svgRef}
            className={`bb-tl-minimap__svg ${hoveredRootFile ? 'has-hover' : ''}`.trim()}
            viewBox={`0 0 ${stageW} ${stageH}`}
          >
            {families.map((fam) => {
              const isHovered = hoveredRootFile === fam.rootFile;
              const isActive = activeRootFile === fam.rootFile;
              const bx = projection.offsetX + fam.minX * projection.scale - 3;
              const by = projection.offsetY + fam.minY * projection.scale - 3;
              const bw = Math.max(8, (fam.maxX - fam.minX) * projection.scale + 6);
              const bh = Math.max(6, (fam.maxY - fam.minY) * projection.scale + 6);

              return (
                <g
                  key={fam.rootFile}
                  className={`bb-tl-minimap__family ${isHovered ? 'is-hovered' : ''} ${
                    isActive ? 'is-active' : ''
                  }`.trim()}
                  style={{ '--bb-tl-family-color': fam.color }}
                  onPointerEnter={() => setHoveredRootFile(fam.rootFile)}
                  onPointerLeave={() =>
                    setHoveredRootFile((prev) => (prev === fam.rootFile ? '' : prev))
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocusFamily?.(fam.rootFile);
                  }}
                >
                  <title>
                    {`${fam.title} — ${fam.nodes.length} branch${
                      fam.nodes.length === 1 ? '' : 'es'
                    }, ${fam.totalMessages} msgs (Click to center timeline)`}
                  </title>

                  <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    rx={3}
                    className="bb-tl-minimap__family-hit"
                  />

                  {fam.edges.map((edge) => {
                    const sx =
                      projection.offsetX + (edge.from.x + nodeWidth) * projection.scale;
                    const sy = projection.offsetY + edge.from.y * projection.scale;
                    const tx = projection.offsetX + edge.to.x * projection.scale;
                    const ty = projection.offsetY + edge.to.y * projection.scale;
                    const mid = Math.max(2, (tx - sx) / 2);
                    return (
                      <path
                        key={edge.id}
                        d={`M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${(sx + mid).toFixed(
                          1,
                        )} ${sy.toFixed(1)}, ${(tx - mid).toFixed(1)} ${ty.toFixed(
                          1,
                        )}, ${tx.toFixed(1)} ${ty.toFixed(1)}`}
                        className="bb-tl-minimap__edge"
                      />
                    );
                  })}

                  {fam.nodes.map((n) => {
                    const nx = projection.offsetX + n.x * projection.scale;
                    const ny =
                      projection.offsetY + (n.y - nodeHeight / 2) * projection.scale;
                    const fullW = Math.max(4, nodeWidth * projection.scale);
                    const nh = Math.max(2.6, nodeHeight * projection.scale);
                    const msgRatio = Math.max(
                      0.35,
                      Math.min(1, (Number(n.messageCount) || 1) / fam.maxMsg),
                    );
                    const barW = Math.max(3, fullW * msgRatio);
                    const isCurrentOrSelected =
                      n.fileName === activeChatFile || n.fileName === selectedFile;

                    return (
                      <g key={n.fileName}>
                        <rect
                          x={nx}
                          y={ny}
                          width={fullW}
                          height={nh}
                          rx={1.5}
                          className="bb-tl-minimap__node-track"
                        />
                        <rect
                          x={nx}
                          y={ny}
                          width={barW}
                          height={nh}
                          rx={1.5}
                          className="bb-tl-minimap__node-bar"
                        />
                        {isCurrentOrSelected && (
                          <rect
                            x={nx - 1}
                            y={ny - 1}
                            width={fullW + 2}
                            height={nh + 2}
                            rx={2}
                            className="bb-tl-minimap__node-active-ring"
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            <rect
              ref={vpRectRef}
              x="0"
              y="0"
              width={stageW}
              height={stageH}
              rx={3}
              className="bb-tl-minimap__viewport"
            />
          </svg>
        </div>
      )}
    </aside>
  );
});
