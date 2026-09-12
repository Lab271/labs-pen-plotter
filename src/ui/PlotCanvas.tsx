import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { Placement, Point, Polyline } from '../plot/types';
import { paperStyle, type PaperStyle } from '../plot/paper';
import { objectsInRect, rectFromDrag, type Rect as MmRect } from '../plot/scene';
import type { Magnet } from '../plot/magnet';

interface CanvasArt {
  id: string;
  polylines: Polyline[];
  placement: Placement;
  /** Local artwork size (mm) — used for an invisible drag hit-area. */
  w: number;
  h: number;
  /** The pen's colour, so the preview shows what will actually be drawn. */
  penColor?: string;
  /** The pen's line width in mm — the line the tip really lays down. */
  penWidthMm?: number;
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
  /**
   * Cutting mode: the job is a blade job, so everything is drawn as a cut line
   * rather than in a pen's colour. There is one blade, and what matters on
   * screen is which lines the knife will follow.
   */
  cutting?: boolean;
  /** Hold-down magnets on the sheet, drawn as keep-out circles. */
  magnets?: Magnet[];
  /** Ids of magnets the artwork runs into — drawn as a warning. */
  magnetsHit?: string[];
  /** Dragging a magnet moves it; null while a plot is running. */
  onMagnetMove?: (id: string, x: number, y: number) => void;
  artworks: CanvasArt[];
  /** Every selected object. The transformer acts on all of them at once. */
  selectedIds: string[];
  /** `additive` = the click carried Shift/Cmd, i.e. toggle into the selection. */
  onSelect: (id: string | null, additive?: boolean) => void;
  /** Result of a rubber-band drag (replaces the selection). */
  onSelectMany: (ids: string[]) => void;
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
    cutting = false,
    magnets,
    magnetsHit,
    onMagnetMove,
    artworks,
    selectedIds,
    penPos,
    onSelect,
    onSelectMany,
    onPlacement,
    locked = false,
  } = props;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
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
  // Fallback stroke colours for artwork with no pen assigned (a session saved
  // before pens existed). Artwork on dark stock is drawn light — a white or
  // metallic pen is what such sheets are for, so this is both legible and
  // closer to the real result.
  const strokeColor = paper.dark ? '#e2e8f0' : '#475569';
  const selectedStroke = paper.dark ? '#93c5fd' : '#1d4ed8';
  /**
   * Stroke width in screen px for a pen of `widthMm`. To scale where the zoom
   * allows it, but never thinner than a hairline: fitting A0 into a laptop
   * canvas is ~0.5 px/mm, where an honest 0.5 mm line is a quarter of a pixel —
   * i.e. invisible artwork. The floor keeps the drawing visible, and the
   * relative weight of a 0.3 against a 0.8 pen still reads once zoomed in.
   */
  const penPx = (widthMm: number | undefined) => Math.max(1.2, (widthMm ?? 0.5) * pxPerMm);

  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const trRef = useRef<Konva.Transformer>(null);

  const registerNode = useCallback((id: string, node: Konva.Group | null) => {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }, []);

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = selectedIds
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Group => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, artworks, locked]);

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
          onClick={(e) => onSelect(a.id, isAdditive(e))}
          onTap={() => onSelect(a.id, false)}
          onDragStart={() => {
            // Dragging an unselected object selects it first, so the drag moves
            // what the operator grabbed rather than a stale selection.
            if (!selected.has(a.id)) onSelect(a.id, false);
          }}
          onDragEnd={(e) => {
            // Konva drags only the grabbed node; the rest of the selection is
            // carried by the same delta so a multi-object move stays rigid.
            const dx = e.target.x() - a.placement.x;
            const dy = e.target.y() - a.placement.y;
            onPlacement(a.id, { ...a.placement, x: e.target.x(), y: e.target.y() });
            if (selected.has(a.id) && (dx !== 0 || dy !== 0)) {
              for (const other of artworks) {
                if (other.id === a.id || !selected.has(other.id)) continue;
                onPlacement(other.id, {
                  ...other.placement,
                  x: other.placement.x + dx,
                  y: other.placement.y + dy,
                });
              }
            }
          }}
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
              // The pen's own colour once it has one: selection is shown by the
              // transform handles, so the preview does not have to recolour the
              // artwork to indicate it — and recolouring would hide the pen.
              stroke={
                cutting
                  ? CUT_STROKE
                  : (a.penColor ?? (selected.has(a.id) ? selectedStroke : strokeColor))
              }
              strokeWidth={penPx(a.penWidthMm)}
              strokeScaleEnabled={false}
              lineCap="round"
              lineJoin="round"
            />
          ))}
        </Group>
      )),
    [
      artworks,
      onSelect,
      onPlacement,
      registerNode,
      locked,
      strokeColor,
      selectedStroke,
      pxPerMm,
      selected,
      onSelectMany,
      cutting,
    ],
  );

  // Rubber band, in paper mm (the same frame as placements, so the hit test is
  // the pure one from scene.ts rather than pixel arithmetic done twice).
  const [band, setBand] = useState<MmRect | null>(null);
  const bandStart = useRef<{ x: number; y: number } | null>(null);
  const toMm = (pos: { x: number; y: number }) => ({
    x: (pos.x - margin) / pxPerMm,
    y: (pos.y - margin) / pxPerMm,
  });

  return (
    <Stage
      width={width}
      height={height}
      onMouseDown={(e) => {
        // Only a press on empty space starts a band; a press on artwork is a drag.
        if (e.target !== e.target.getStage()) return;
        if (!isAdditive(e)) onSelect(null);
        if (locked) return;
        const pos = e.target.getStage()?.getPointerPosition();
        if (pos) bandStart.current = toMm(pos);
      }}
      onMouseMove={(e) => {
        const start = bandStart.current;
        if (!start) return;
        const pos = e.target.getStage()?.getPointerPosition();
        if (pos) setBand(rectFromDrag(start, toMm(pos)));
      }}
      onMouseUp={() => {
        const rect = band;
        bandStart.current = null;
        setBand(null);
        // A click with no drag is a deselect, already handled on mousedown —
        // don't let a stray 0×0 band select everything it happens to touch.
        if (rect && (rect.width > 1 || rect.height > 1)) {
          onSelectMany(objectsInRect(artworks.map(toSceneObject), rect));
        }
      }}
      onMouseLeave={() => {
        bandStart.current = null;
        setBand(null);
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
          {(magnets ?? []).map((m) => {
            const hit = magnetsHit?.includes(m.id);
            return (
              <Circle
                key={m.id}
                x={m.x}
                y={m.y}
                radius={m.radiusMm}
                // The circle is the keep-out zone, so it is drawn to scale and
                // filled faintly: the operator has to see what it covers, not
                // just where its centre is.
                fill={hit ? 'rgba(220,38,38,0.22)' : 'rgba(100,116,139,0.18)'}
                stroke={hit ? '#dc2626' : '#475569'}
                strokeWidth={1.2}
                strokeScaleEnabled={false}
                dash={hit ? undefined : [4, 3]}
                draggable={!locked && !!onMagnetMove}
                onDragEnd={(e) => onMagnetMove?.(m.id, e.target.x(), e.target.y())}
              />
            );
          })}
        </Group>
        {band && (
          <Group x={margin} y={margin} scaleX={pxPerMm} scaleY={pxPerMm} listening={false}>
            <Rect
              x={band.x}
              y={band.y}
              width={band.width}
              height={band.height}
              fill="#3b82f6"
              opacity={0.12}
              stroke="#3b82f6"
              strokeWidth={1}
              strokeScaleEnabled={false}
            />
          </Group>
        )}
        {selectedIds.length > 0 && !locked && (
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

/** Cut lines are red, the convention every cutter's software uses. */
const CUT_STROKE = '#dc2626';

/** Shift/Cmd/Ctrl on a click means "add to the selection" rather than "replace it". */
function isAdditive(e: Konva.KonvaEventObject<MouseEvent>): boolean {
  const ev = e.evt;
  return !!(ev?.shiftKey || ev?.metaKey || ev?.ctrlKey);
}

/** The part of a canvas artwork the pure scene hit-test needs. */
function toSceneObject(a: CanvasArt) {
  return { id: a.id, placement: a.placement, widthMm: a.w, heightMm: a.h };
}
