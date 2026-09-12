import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ALGORITHMS,
  contourAlgorithms,
  DEFAULT_PARAMS,
  runAlgorithm,
  type AlgorithmId,
  type AlgorithmParams,
} from '../plot/algorithms';
import { adjustField, DEFAULT_ADJUST, type AdjustSpec } from '../plot/adjust';
import type { FieldSource } from '../plot/raster';
import type { Polyline } from '../plot/types';
import { btn, btnPrimary, field as fieldClass } from './styles';

/** What the wizard hands back, and what the object stores so it can be reopened. */
export interface ImportSpec {
  adjust: AdjustSpec;
  algorithm: AlgorithmId;
  params: AlgorithmParams;
}

export const DEFAULT_IMPORT_SPEC: ImportSpec = {
  adjust: DEFAULT_ADJUST,
  algorithm: 'outline',
  params: DEFAULT_PARAMS,
};

export interface ImportWizardProps {
  /** File name, for the heading. */
  name: string;
  /** The decoded image. Adjustments and algorithms both run on this. */
  source: FieldSource;
  /** Reopening an existing import starts from its settings. */
  initial?: ImportSpec;
  /**
   * Cutting mode: only conversions that produce outlines are offered. A fill
   * handed to a drag knife shreds the sticker instead of cutting it out.
   */
  contourOnly?: boolean;
  onConfirm: (
    result: { polylines: Polyline[]; widthMm: number; heightMm: number },
    spec: ImportSpec,
  ) => void;
  onCancel: () => void;
}

type Step = 'adjust' | 'convert';

/**
 * The image import wizard: adjust the picture, choose how it becomes lines, tune
 * that, confirm.
 *
 * Both previews are drawn from the same functions the plot uses — the adjusted
 * field is the field the algorithm reads, and the lines shown are the polylines
 * that will be added to the page. A preview produced any other way would be a
 * picture of something the machine is not going to draw.
 */
export function ImportWizard(p: ImportWizardProps) {
  const [step, setStep] = useState<Step>('adjust');
  const [adjust, setAdjust] = useState<AdjustSpec>(p.initial?.adjust ?? DEFAULT_ADJUST);
  const available = p.contourOnly ? contourAlgorithms() : ALGORITHMS;
  const [algorithm, setAlgorithm] = useState<AlgorithmId>(() => {
    const wanted = p.initial?.algorithm ?? 'outline';
    // A job switched to cutting can carry a fill algorithm from an earlier
    // import; fall back rather than offering something that is not in the list.
    return available.some((a) => a.id === wanted) ? wanted : available[0].id;
  });
  const [params, setParams] = useState<AlgorithmParams>(p.initial?.params ?? DEFAULT_PARAMS);

  const adjusted = useMemo(() => adjustField(p.source, adjust), [p.source, adjust]);

  // Converting is the expensive half, so it runs debounced and only on the step
  // that shows it — dragging a slider must not queue a trace per pixel moved.
  const [result, setResult] = useState<{
    polylines: Polyline[];
    widthMm: number;
    heightMm: number;
  } | null>(null);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (step !== 'convert') return;
    setWorking(true);
    const t = setTimeout(() => {
      setResult(runAlgorithm(algorithm, adjusted, params));
      setWorking(false);
    }, 120);
    return () => clearTimeout(t);
  }, [step, adjusted, algorithm, params]);

  const strokeCount = result?.polylines.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/40 p-0 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Import image"
    >
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white shadow-xl md:mx-auto md:max-w-4xl md:rounded-lg">
        <header className="flex items-center gap-2 border-b border-slate-300 px-4 py-2">
          <h2 className="truncate text-sm font-semibold">Import {p.name}</h2>
          <span className="text-xs text-slate-500">
            {step === 'adjust'
              ? 'Step 1 of 2 — adjust the image'
              : 'Step 2 of 2 — convert to lines'}
          </span>
          <button className={`${btn} ml-auto`} onClick={p.onCancel}>
            Cancel
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row">
          <div className="flex min-h-48 flex-1 items-center justify-center bg-slate-100 p-3">
            {step === 'adjust' ? (
              <FieldPreview source={adjusted} />
            ) : (
              <LinePreview
                result={result}
                widthMm={result?.widthMm ?? 0}
                heightMm={result?.heightMm ?? 0}
              />
            )}
          </div>

          <aside className="w-full shrink-0 border-t border-slate-300 p-3 text-sm md:w-72 md:border-l md:border-t-0">
            {step === 'adjust' ? (
              <AdjustControls adjust={adjust} onChange={setAdjust} />
            ) : (
              <ConvertControls
                algorithm={algorithm}
                params={params}
                available={available}
                contourOnly={!!p.contourOnly}
                onAlgorithm={setAlgorithm}
                onParams={setParams}
              />
            )}
          </aside>
        </div>

        <footer className="flex items-center gap-2 border-t border-slate-300 px-4 py-2 text-xs">
          {step === 'convert' && (
            <span className="text-slate-500">
              {working ? 'Converting…' : `${strokeCount} strokes`}
              {result && strokeCount > 0
                ? ` · ${result.widthMm.toFixed(0)}×${result.heightMm.toFixed(0)} mm`
                : ''}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {step === 'convert' && (
              <button className={btn} onClick={() => setStep('adjust')}>
                Back
              </button>
            )}
            {step === 'adjust' ? (
              <button className={btnPrimary} onClick={() => setStep('convert')}>
                Next — convert to lines
              </button>
            ) : (
              <button
                className={btnPrimary}
                disabled={!result || strokeCount === 0}
                title={
                  strokeCount === 0
                    ? 'Nothing to add — try a higher threshold or a different algorithm'
                    : undefined
                }
                onClick={() => result && p.onConfirm(result, { adjust, algorithm, params })}
              >
                Add to page
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/** The adjusted image itself, drawn from the field so it is what the algorithm sees. */
function FieldPreview(props: { source: FieldSource }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { field, gw, gh } = props.source;
    canvas.width = gw;
    canvas.height = gh;
    const img = ctx.createImageData(gw, gh);
    for (let i = 0; i < gw * gh; i++) {
      const v = Math.round(field[i] * 255);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [props.source]);
  return (
    <canvas
      ref={ref}
      className="max-h-full max-w-full bg-white object-contain shadow"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

/** The polylines that will be added — the plot's own geometry, not a re-render. */
function LinePreview(props: {
  result: { polylines: Polyline[] } | null;
  widthMm: number;
  heightMm: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !props.result) return;
    const W = 520;
    const H = 360;
    canvas.width = W;
    canvas.height = H;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    const w = props.widthMm || 1;
    const h = props.heightMm || 1;
    const scale = Math.min((W - 16) / w, (H - 16) / h);
    ctx.translate((W - w * scale) / 2, (H - h * scale) / 2);
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = Math.max(0.15, 0.8 / scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const poly of props.result.polylines) {
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.stroke();
    }
  }, [props.result, props.widthMm, props.heightMm]);
  return <canvas ref={ref} className="max-h-full max-w-full bg-white object-contain shadow" />;
}

function AdjustControls(props: { adjust: AdjustSpec; onChange: (a: AdjustSpec) => void }) {
  const { adjust, onChange } = props;
  const crop = (edge: keyof AdjustSpec['crop']) => (v: number) =>
    onChange({ ...adjust, crop: { ...adjust.crop, [edge]: v } });
  return (
    <>
      <WizardSlider
        label="Brightness"
        value={adjust.brightness}
        min={-0.5}
        max={0.5}
        step={0.01}
        onChange={(v) => onChange({ ...adjust, brightness: v })}
      />
      <WizardSlider
        label="Contrast"
        value={adjust.contrast}
        min={0.2}
        max={4}
        step={0.05}
        onChange={(v) => onChange({ ...adjust, contrast: v })}
      />
      <label className="mb-2 flex items-center justify-between text-xs text-slate-600">
        <span>Invert</span>
        <input
          type="checkbox"
          checked={adjust.invert}
          onChange={(e) => onChange({ ...adjust, invert: e.target.checked })}
        />
      </label>
      <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
        <span>Rotate</span>
        <button
          className={btn}
          onClick={() => onChange({ ...adjust, rotateQuarters: (adjust.rotateQuarters + 1) % 4 })}
        >
          ⟳ 90° ({adjust.rotateQuarters * 90}°)
        </button>
      </div>
      <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Crop</p>
      <WizardSlider
        label="Left"
        value={adjust.crop.left}
        min={0}
        max={0.9}
        step={0.01}
        onChange={crop('left')}
      />
      <WizardSlider
        label="Right"
        value={adjust.crop.right}
        min={0}
        max={0.9}
        step={0.01}
        onChange={crop('right')}
      />
      <WizardSlider
        label="Top"
        value={adjust.crop.top}
        min={0}
        max={0.9}
        step={0.01}
        onChange={crop('top')}
      />
      <WizardSlider
        label="Bottom"
        value={adjust.crop.bottom}
        min={0}
        max={0.9}
        step={0.01}
        onChange={crop('bottom')}
      />
      <button className={`${btn} mt-2`} onClick={() => onChange({ ...DEFAULT_ADJUST })}>
        Reset adjustments
      </button>
      <p className="mt-2 text-[10px] text-slate-400">
        Scale is set on the page after importing — the image keeps its real-world size here.
      </p>
    </>
  );
}

function ConvertControls(props: {
  algorithm: AlgorithmId;
  params: AlgorithmParams;
  available: typeof ALGORITHMS;
  contourOnly: boolean;
  onAlgorithm: (a: AlgorithmId) => void;
  onParams: (p: AlgorithmParams) => void;
}) {
  const { algorithm, params, available, onAlgorithm, onParams } = props;
  const info = available.find((a) => a.id === algorithm) ?? available[0];
  const set = (key: keyof AlgorithmParams) => (v: number) => onParams({ ...params, [key]: v });
  const RANGES: Record<
    keyof AlgorithmParams,
    { min: number; max: number; step: number; label: string }
  > = {
    threshold: { min: 0.05, max: 0.95, step: 0.01, label: 'Threshold' },
    levels: { min: 1, max: 8, step: 1, label: 'Levels' },
    spacingMm: { min: 0.3, max: 10, step: 0.1, label: 'Line spacing (mm)' },
    angleDeg: { min: -90, max: 90, step: 5, label: 'Angle (°)' },
    toleranceMm: { min: 0.05, max: 2, step: 0.05, label: 'Simplify (mm)' },
    passes: { min: 1, max: 6, step: 1, label: 'Directions' },
  };
  return (
    <>
      <label className="mb-1 block text-xs text-slate-600">Algorithm</label>
      <select
        className={`${fieldClass} mb-1 w-full`}
        value={algorithm}
        onChange={(e) => onAlgorithm(e.target.value as AlgorithmId)}
      >
        {available.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <p className="mb-3 text-[11px] text-slate-500">{info.description}</p>
      {props.contourOnly && (
        <p className="mb-3 text-[11px] text-amber-600">
          Cutting mode: only outline conversions are offered — a fill handed to a drag knife shreds
          the sticker instead of cutting it out.
        </p>
      )}
      {info.params.map((key) => (
        <WizardSlider
          key={key}
          label={RANGES[key].label}
          value={params[key]}
          min={RANGES[key].min}
          max={RANGES[key].max}
          step={RANGES[key].step}
          onChange={set(key)}
        />
      ))}
    </>
  );
}

function WizardSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-2 block">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{props.label}</span>
        <input
          type="number"
          className={`${fieldClass} w-16`}
          value={props.value}
          step={props.step}
          onChange={(e) => props.onChange(Number(e.target.value))}
        />
      </div>
      <input
        type="range"
        className="mt-1 w-full"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}
