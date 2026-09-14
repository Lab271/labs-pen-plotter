import { useEffect, useRef, useState } from 'react';
import type { Point } from '../plot/types';
import { btn, btnPrimary } from './styles';
import { StepPicker } from './StepPicker';

export interface RezeroWizardProps {
  /** Why the origin is gone, in the daemon's words. */
  reason: string | null;
  /** False once the daemon has dropped the steppers and nothing has moved since. */
  motorsPowered: boolean;
  /** Flips true the moment the daemon accepts the new origin — the wizard's finish line. */
  posTrusted: boolean;
  connected: boolean;
  /** Live work position, or null when unknown. Meaningless until home is set again. */
  penPos: Point | null;
  jogStep: number;
  setJogStep: (mm: number) => void;
  onJog: (dx: number, dy: number) => void;
  onPenUp: () => void;
  onPenDown: () => void;
  /** Set the work origin here — `setWorkZero()`, the same call Calibrate makes. */
  onSetHome: () => void;
  onClose: () => void;
}

const STEPS = 3;

/**
 * Re-zero after the motors were powered down.
 *
 * The Home/calibration panel has always described this sequence in prose; with
 * an idle power-down it stops being advice. There are no limit switches on this
 * machine, so once the steppers drop out nothing knows where the paper is — and
 * the controller goes on reporting the old numbers as if it did. This walks the
 * operator back to a real origin and does not let the app pretend otherwise in
 * the meantime.
 *
 * Deliberately not dismissible into silence: closing it leaves the banner, and
 * the gateway refuses Plot and Go to home regardless of what this component does.
 */
export function RezeroWizard(p: RezeroWizardProps) {
  // 0 = what happened, 1 = get to the corner, 2 = done.
  const [step, setStep] = useState(0);
  const canJog = p.connected;

  // The daemon is the authority on trust, not this component. Watch for the
  // moment it *becomes* trusted — which is how a re-zero done from another tab,
  // or from the Calibrate button behind this dialog, finishes the wizard too.
  // Only the edge counts: the wizard can also be opened voluntarily on a machine
  // whose origin is perfectly good, and that must not skip straight to the end.
  const { posTrusted } = p;
  const wasTrusted = useRef(posTrusted);
  useEffect(() => {
    if (posTrusted && !wasTrusted.current) setStep(STEPS - 1);
    wasTrusted.current = posTrusted;
  }, [posTrusted]);

  // Arrow keys jog while the operator is placing the head; their eyes are on the
  // pen tip, not on the screen. Same as the registration wizard.
  const { onJog } = p;
  useEffect(() => {
    if (step !== 1) return;
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
  }, [step, canJog, onJog]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Re-zero the machine"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Re-zero the machine</h2>
          <span className="text-xs text-slate-500">
            step {step + 1} of {STEPS}
          </span>
        </div>

        {step === 0 && (
          <>
            <p className="text-sm">
              {p.reason ?? 'The motors were powered down, so home is no longer known.'}
            </p>
            <p className="mt-2 text-sm">
              This machine has no limit switches, so it cannot find the paper again by itself — and
              it will keep reporting the old coordinates as if nothing happened. Plotting is blocked
              until you set home again.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Nothing is lost: your artwork, placement and pens are untouched. This is only about
              where the machine thinks the paper is.
            </p>
            <div className="mt-4 flex justify-between gap-2">
              <button className={btn} onClick={p.onClose}>
                Not now
              </button>
              <button className={btnPrimary} onClick={() => setStep(1)}>
                Re-zero now
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-sm">
              Move the pen tip to the <span className="font-semibold">paper’s top-left corner</span>
              , then press Set home.
            </p>
            {p.motorsPowered ? (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                The motors are energized again — the gantry will resist being pushed. Use the arrows
                to jog it.
              </p>
            ) : (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                The motors are <span className="font-semibold">off</span>: the gantry moves freely
                and will not fight back. Push it by hand, or jog — the first move switches the
                motors back on.
              </p>
            )}
            {!p.connected && (
              <p className="mt-1 text-xs text-red-600">Not connected — connect to jog and set.</p>
            )}
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Reported position:{' '}
                <span className="tabular-nums text-slate-800">
                  {p.penPos ? `${p.penPos.x.toFixed(2)}, ${p.penPos.y.toFixed(2)}` : '—'}
                </span>{' '}
                <span className="text-slate-400">(means nothing until you set home)</span>
              </span>
            </div>
            <div className="mt-2">
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
            <div className="mt-4 flex justify-between gap-2">
              <button className={btn} onClick={p.onClose}>
                Cancel
              </button>
              <div className="flex gap-2">
                <button className={btn} onClick={() => setStep(0)}>
                  Back
                </button>
                <button
                  className={btnPrimary}
                  disabled={!p.connected}
                  onClick={() => {
                    p.onSetHome();
                    setStep(2);
                  }}
                  title="Set the work origin at the pen’s current position"
                >
                  Set home here
                </button>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm">
              {p.posTrusted
                ? 'Home is set. The position is trusted again and plotting is available.'
                : 'Home was not set — the machine still does not know where the paper is. Go back and try again.'}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {p.motorsPowered
                ? 'The motors are holding the gantry.'
                : 'The motors come back on with the first move — jog once, or just start the plot.'}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Check it before committing a sheet: Go to home should bring the pen back to this
              corner.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              {!p.posTrusted && (
                <button className={btn} onClick={() => setStep(1)}>
                  Back
                </button>
              )}
              <button className={btnPrimary} onClick={p.onClose}>
                Done
              </button>
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
