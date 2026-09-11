import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Circle, Group, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { Placement, Point, Polyline } from '../plot/types';
import { paperStyle, type PaperStyle } from '../plot/paper';

interface CanvasArt {
  id: string;
  polylines: Polyline[];
  placement: Placement;
  /** Local artwork size (mm) — used for an invisible drag hit-area. */
  w: number;
  h: number;
}

interface Props {
  width: number;
  height: number;
  bedW: number;
  bedH: number;
  paperW: number;
  paperH: number;
  /** How the sheet looks (colour + pattern). Preview only — never plotted. */
  paperStyleId?: string;
  artworks: CanvasArt[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPlacement: (id: string, p: Placement) => void;
  penPos: Point | null;
  /** When true (e.g. a plot is running), artwork can't be dragged/transformed. */
  locked?: boolean;
}

export function PlotCanvas(props: Props) {
  const {
    width,
    height,
    bedW,
    bedH,
    paperW,
    paperH,
    paperStyleId,
    artworks,
    selectedId,
    penPos,
    onSelect,
    onPlacement,
    locked = false,
  } = props;
  // On narrow (phone) canvases the bed (A0) dwarfs the paper, leaving the drawing
  // tiny with empty bed all around — so fit to the paper instead, with a small
  // margin. On wider screens fit the whole bed (more handle clearance for editing).
  const compact = width > 0 && width < 700;
  const margin = compact ? 16 : 64; // px clearance for transform handles
  const fitW = compact ? paperW : bedW;
  const fitH = compact ? paperH : bedH;
  const pxPerMm = Math.max(
    0.01,
    Math.min((width - 2 * margin) / fitW, (height - 2 * margin) / fitH),
  );
  const markerR = 7 / pxPerMm;
  const paper = paperStyle(paperStyleId);
  // Patterned stock (dots/grid/lines) is drawn as ONE tiled fill rather than
  // thousands of nodes: a 5 mm dot grid on A0 would otherwise be ~40 000 circles,
  // redrawn on every placement change. The tile is rendered at a fixed pixel
  // pitch and scaled to mm, so it stays crisp at any zoom the bed fit produces.
  const patternTile = useMemo(() => makePatternTile(paper), [paper]);
  const tileScale = paper.spacingMm > 0 ? paper.spacingMm / TILE_PX : 1;
  // Artwork on dark stock is drawn light — a white or metallic pen is what such
  // sheets are for, so this is both legible and closer to the real result.
  const strokeColor = paper.dark ? '#e2e8f0' : '#475569';
  const selectedStroke = paper.dark ? '#93c5fd' : '#1d4ed8';

  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const trRef = useRef<Konva.Transformer>(null);

  const registerNode = useCallback((id: string, node: Konva.Group | null) => {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }, []);

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedId ? nodeRefs.current.get(selectedId) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, artworks, locked]);

  // Memoize the artwork nodes so the high-frequency pen-position / connection
  // re-renders produce the SAME element references — react-konva then leaves the
  // (potentially thousands of) line nodes in place instead of reconciling them.
  // Rendered directly in the tree (not behind a memoized component boundary,
  // which could drop the nodes on a Stage re-render — that's the bug where the
  // artwork vanished on Disconnect).
  const artNodes = useMemo(
    () =>
      artworks.map((a) => (
        <Group
          key={a.id}
          ref={(node) => registerNode(a.id, node)}
          x={a.placement.x}
          y={a.placement.y}
          scaleX={a.placement.scale}
          scaleY={a.placement.scale}
          rotation={a.placement.rotation}
          draggable={!locked}
          onClick={() => onSelect(a.id)}
          onTap={() => onSelect(a.id)}
          onDragEnd={(e) => onPlacement(a.id, { ...a.placement, x: e.target.x(), y: e.target.y() })}
          onTransformEnd={(e) => {
            const n = e.target as Konva.Group;
            onPlacement(a.id, { x: n.x(), y: n.y(), scale: n.scaleX(), rotation: n.rotation() });
          }}
        >
          {/* Invisible hit-area so the whole bounding box is draggable. */}
          <Rect x={0} y={0} width={a.w} height={a.h} fill="transparent" />
          {a.polylines.map((pl, i) => (
            <Line
              key={i}
              points={pl.flatMap((p) => [p.x, p.y])}
              stroke={a.id === selectedId ? selectedStroke : strokeColor}
              strokeWidth={1.4}
              strokeScaleEnabled={false}
              lineCap="round"
              lineJoin="round"
            />
          ))}
        </Group>
      )),
    [
      artworks,
      selectedId,
      onSelect,
      onPlacement,
      registerNode,
      locked,
      strokeColor,
      selectedStroke,
    ],
  );

  return (
    <Stage
      width={width}
      height={height}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) onSelect(null);
      }}
    >
      {/* Static layer: bed, paper, artwork, transform handles. */}
      <Layer>
        <Group x={margin} y={margin} scaleX={pxPerMm} scaleY={pxPerMm}>
          <Rect
            x={0}
            y={0}
            width={bedW}
            height={bedH}
            fill="#f1f5f9"
            stroke="#cbd5e1"
            strokeWidth={1}
            strokeScaleEnabled={false}
          />
          <Rect
            x={0}
            y={0}
            width={paperW}
            height={paperH}
            fill={paper.color}
            stroke="#94a3b8"
            strokeWidth={1}
            strokeScaleEnabled={false}
            shadowColor="#000"
            shadowOpacity={0.12}
            shadowBlur={6}
          />
          {patternTile && (
            <Rect
              x={0}
              y={0}
              width={paperW}
              height={paperH}
              // Konva types this as HTMLImageElement, but draws any canvas
              // image source — a <canvas> avoids the async decode an <img>
              // (data URL) would need before the first paint.
              fillPatternImage={patternTile as unknown as HTMLImageElement}
              fillPatternScaleX={tileScale}
              fillPatternScaleY={tileScale}
              fillPatternRepeat="repeat"
              listening={false}
            />
          )}
          {/* Subtle paper-size label, centered on the paper (behind the artwork). */}
          <Text
            x={0}
            y={paperH / 2 - Math.min(paperW, paperH) * 0.03}
            width={paperW}
            align="center"
            text={`${Math.round(paperW)} × ${Math.round(paperH)} mm`}
            fontSize={Math.min(paperW, paperH) * 0.06}
            fill={paper.dark ? '#475569' : '#cbd5e1'}
            listening={false}
          />
          {artNodes}
        </Group>
        {selectedId && !locked && (
          <Transformer ref={trRef} rotateEnabled keepRatio flipEnabled={false} />
        )}
      </Layer>

      {/* Marker layer: only this redraws as the pen moves (live). */}
      <Layer listening={false}>
        <Group x={margin} y={margin} scaleX={pxPerMm} scaleY={pxPerMm}>
          {penPos && (
            <Circle
              x={penPos.x}
              y={penPos.y}
              radius={markerR}
              fill="#ef4444"
              stroke="#fff"
              strokeWidth={1}
              strokeScaleEnabled={false}
            />
          )}
        </Group>
      </Layer>
    </Stage>
  );
}

/** Pixel pitch of a pattern tile — one cell, scaled to the style's mm pitch. */
const TILE_PX = 24;

/**
 * Render one cell of the sheet's pattern to an offscreen canvas, for use as a
 * repeating fill. Returns null for unpatterned stock (and outside a browser).
 */
function makePatternTile(style: PaperStyle): HTMLCanvasElement | null {
  if (style.pattern === 'none' || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = TILE_PX;
  c.height = TILE_PX;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = style.patternColor;
  ctx.strokeStyle = style.patternColor;
  // The tile is drawn at the cell's top-left edge, so neighbouring tiles join
  // into continuous rules rather than repeating a line inside each cell.
  if (style.pattern === 'dots') {
    ctx.beginPath();
    ctx.arc(0, 0, TILE_PX * 0.075, 0, Math.PI * 2);
    ctx.fill();
  } else if (style.pattern === 'grid') {
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.lineTo(0.5, TILE_PX);
    ctx.moveTo(0, 0.5);
    ctx.lineTo(TILE_PX, 0.5);
    ctx.stroke();
  } else {
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(TILE_PX, 0.5);
    ctx.stroke();
  }
  return c;
}
