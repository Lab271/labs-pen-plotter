import { useEffect, useMemo, useState } from 'react';
import { fitRegistration } from '../plot/register';
import type { CalibrationPoint, Placement, Point } from '../plot/types';
import { btn, btnPrimary } from './styles';
import { StepPicker } from './StepPicker';

/**
 * RMS residual above which the fit is flagged. A sighted pen tip repeats to
 * ~0.1–0.2 mm; a single point set 1 mm off gives an RMS of ~0.4 with three
 * points, because least squares shares the error out (so the mis-set point is
 * not reliably the one with the largest residual — warn on the RMS).
 */
const RMS_WARN_MM = 0.3;
/** Implied print scale deviation above which the sticker (or a measurement) is suspect. */
const SCALE_WARN = 0.01;

export interface RegistrationWizardProps {
  artName: string;
  /** Calibration points in the artwork frame (as imported). */
  points: CalibrationPoint[];
  /** Page offset from import, to show the operator the file's page coordinates. */
  pageOffset?: Point;
  /** Live work position of the pen, or null when unknown/disconnected. */
  penPos: Point | null;
  connected: boolean;
  /** A program is streaming: jog and Set are held. */
  busy: boolean;
  jogStep: number;
  setJogStep: (mm: number) => void;
  onJog: (dx: number, dy: number) => void;
  onPenUp: () => void;
  onPenDown: () => void;
  onApply: (placement: Placement) => void;
  onCancel: () => void;
}

/**
 * Step-by-step registration: mount the sticker → jog the pen onto each printed
 * calibration point and Set → fit → Apply. The fit (rotation + translation,
 * scale fixed at 1:1) becomes the artwork's placement, so the cut follows the
 * sticker as it actually sits on the bed. The math lives in plot/register.ts;
 * this is only the steps and the readout.
 */
export function RegistrationWizard(p: RegistrationWizardProps) {
  const n = p.points.length;
  // step 0 = mount; 1..n = points; n+1 = result
  const [step, setStep] = useState(0);
  const [measured, setMeasured] = useState<(Point | null)[]>(() => p.points.map(() => null));
  const canJog = p.connected && !p.busy;
  const atPoint = step >= 1 && step <= n;
  const pt = atPoint ? p.points[step - 1] : null;
  const pagePt = pt ? { x: pt.x + (p.pageOffset?.x ?? 0), y: pt.y + (p.pageOffset?.y ?? 0) } : null;

  // Arrow keys jog while a point step is showing — the operator's eyes are on
  // the pen tip; reaching for the mouse between nudges is slow.
  const { onJog } = p;
  useEffect(() => {
    if (!atPoint) return;
    const map: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const onKey = (e: KeyboardEvent) => {
      const d = map[e.key];
      if (!d || !canJog) return;
      e.preventDefault();
      onJog(d[0], d[1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [atPoint, canJog, onJog]);

  const fit = useMemo(() => {
    if (step !== n + 1 || measured.some((m) => !m)) return null;
    return fitRegistration(p.points, measured as Point[]);
  }, [step, n, measured, p.points]);

  function setPoint() {
    if (!p.penPos || !canJog) return;
    const pos = { x: p.penPos.x, y: p.penPos.y };
    setMeasured((m) => m.map((v, i) => (i === step - 1 ? pos : v)));
    setStep(step + 1);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Register artwork to the sticker"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Register {p.artName}</h2>
          <span className="text-xs text-slate-500">
            step {Math.min(step + 1, n + 2)} of {n + 2}
          </span>
        </div>

        {step === 0 && (
          <>
            <p className="text-sm">
              Mount the printed sticker on the plotter bed. It does not need to be square — the cut
              will be fitted to where its {n} calibration points really are.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {n < 3
                ? 'With only two points the fit cannot check itself; a third point would catch a mis-set one.'
                : 'Three points: the third checks the other two.'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className={btn} onClick={p.onCancel}>
                Cancel
              </button>
              <button className={btnPrimary} onClick={() => setStep(1)}>
                Sticker is mounted
              </button>
            </div>
          </>
        )}

        {pt && pagePt && (
          <>
            <p className="text-sm">
              Jog the pen tip onto <span className="font-semibold">{pt.name}</span>{' '}
              <span className="text-slate-500">
                (page {pagePt.x.toFixed(1)}, {pagePt.y.toFixed(1)} mm)
              </span>
              , then press Set.
            </p>
            {!p.connected && (
              <p className="mt-1 text-xs text-red-600">Not connected — connect to jog and set.</p>
            )}
            {p.busy && (
              <p className="mt-1 text-xs text-red-600">
                A program is running — wait for it to finish.
              </p>
            )}
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Work position:{' '}
                <span className="tabular-nums text-slate-800">
                  {p.penPos ? `${p.penPos.x.toFixed(2)}, ${p.penPos.y.toFixed(2)}` : '—'}
                </span>
              </span>
              <StepPicker value={p.jogStep} onChange={p.setJogStep} />
            </div>
            <div className="mt-2 grid w-36 grid-cols-3 gap-1">
              <span />
              <Arrow label="↑" disabled={!canJog} onPress={() => onJog(0, -1)} />
              <span />
              <Arrow label="←" disabled={!canJog} onPress={() => onJog(-1, 0)} />
              <span />
              <Arrow label="→" disabled={!canJog} onPress={() => onJog(1, 0)} />
              <span />
              <Arrow label="↓" disabled={!canJog} onPress={() => onJog(0, 1)} />
              <span />
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <button className={btn} disabled={!canJog} onClick={p.onPenDown}>
                Pen down
              </button>
              <button className={btn} disabled={!canJog} onClick={p.onPenUp}>
                Pen up
              </button>
              <span className="self-center text-slate-500">Arrow keys jog too.</span>
            </div>
            <ul className="mt-3 text-xs text-slate-500">
              {p.points.map((q, i) => (
                <li key={q.name + i} className="flex justify-between tabular-nums">
                  <span>{q.name}</span>
                  <span>
                    {measured[i]
                      ? `${measured[i]!.x.toFixed(2)}, ${measured[i]!.y.toFixed(2)}`
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between gap-2">
              <button className={btn} onClick={p.onCancel}>
                Cancel
              </button>
              <div className="flex gap-2">
                <button className={btn} onClick={() => setStep(step - 1)}>
                  Back
                </button>
                <button
                  className={btnPrimary}
                  disabled={!p.penPos || !canJog}
                  onClick={setPoint}
                  title="Record the current work position as this point"
                >
                  Set {pt.name}
                </button>
              </div>
            </div>
          </>
        )}

        {step === n + 1 && fit && (
          <>
            <p className="text-sm">The sticker sits at:</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-slate-500">Rotation</dt>
              <dd className="tabular-nums">{fit.placement.rotation.toFixed(2)}°</dd>
              <dt className="text-slate-500">Offset</dt>
              <dd className="tabular-nums">
                {fit.placement.x.toFixed(2)}, {fit.placement.y.toFixed(2)} mm
              </dd>
              <dt className="text-slate-500">RMS residual</dt>
              <dd className={`tabular-nums ${fit.rms > RMS_WARN_MM ? 'text-red-600' : ''}`}>
                {fit.rms.toFixed(2)} mm
              </dd>
              <dt className="text-slate-500">Implied print scale</dt>
              <dd
                className={`tabular-nums ${
                  Math.abs(fit.impliedScale - 1) > SCALE_WARN ? 'text-red-600' : ''
                }`}
              >
                {(fit.impliedScale * 100).toFixed(2)}%
              </dd>
            </dl>
            <ul className="mt-2 text-xs text-slate-600">
              {p.points.map((q, i) => (
                <li key={q.name + i} className="flex justify-between tabular-nums">
                  <span>{q.name}</span>
                  <span className={fit.residuals[i] > RMS_WARN_MM ? 'text-red-600' : ''}>
                    off by {fit.residuals[i].toFixed(2)} mm
                  </span>
                </li>
              ))}
            </ul>
            {fit.rms > RMS_WARN_MM && (
              <p className="mt-2 text-xs text-red-600">
                The points do not agree to within {RMS_WARN_MM} mm — one was probably set off its
                crosshair (the error is shared out, so it need not be the largest). Back to
                re-measure, or apply anyway.
              </p>
            )}
            {Math.abs(fit.impliedScale - 1) > SCALE_WARN && (
              <p className="mt-2 text-xs text-red-600">
                The measurements imply the print is {((fit.impliedScale - 1) * 100).toFixed(1)}% off
                true size. The cut stays 1:1; check the print or the measurements.
              </p>
            )}
            <div className="mt-4 flex justify-between gap-2">
              <button className={btn} onClick={p.onCancel}>
                Cancel
              </button>
              <div className="flex gap-2">
                <button className={btn} onClick={() => setStep(n)}>
                  Back
                </button>
                <button className={btnPrimary} onClick={() => p.onApply(fit.placement)}>
                  Apply to cut lines
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Arrow(props: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <button
      className="rounded border border-slate-300 bg-white py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
      disabled={props.disabled}
      onClick={props.onPress}
    >
      {props.label}
    </button>
  );
}
