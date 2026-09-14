/**
 * Motor power and position trust.
 *
 * This machine has no limit switches and no homing (`$22=0`), and FluidNC has no
 * encoder feedback. The work origin exists only because the operator set it by
 * hand, and the energized steppers are the only thing holding the gantry there.
 * The moment they drop out, the coordinates the controller keeps reporting are a
 * *claim* about a machine that can be pushed, not a measurement of one.
 *
 * So the two things worth tracking are independent:
 *
 * - `powered` — are the steppers holding the gantry? They go off on `$MD` and
 *   come back with the next commanded move (FluidNC re-energizes on motion).
 * - `posTrusted` — is the work origin still the one the operator set? Only a
 *   human standing at the paper's corner can answer yes. No amount of movement
 *   restores it.
 *
 * Pure rules, no timers and no transport, so the part that decides whether it is
 * safe to drop the motors is unit-tested rather than buried in an interval.
 */

/** What the daemon knows about the steppers and the origin they were holding. */
export interface MotorPower {
  /** True while the steppers are believed to be energized and holding the gantry. */
  powered: boolean;
  /** True while the work origin is still the one the operator set. */
  posTrusted: boolean;
  /** Why the position cannot be trusted, in words for the operator. Null when it can. */
  reason: string | null;
}

/** Motors on, origin known — what a freshly calibrated machine looks like. */
export const MOTORS_HOLDING: MotorPower = { powered: true, posTrusted: true, reason: null };

/** Things that change what is known about the motors or the origin. */
export type MotorPowerEvent =
  /** The idle timer disabled the steppers after `minutes` with nothing to do. */
  | { kind: 'idleTimeout'; minutes: number }
  /** The operator pressed Motors off — same physical consequence, chosen on purpose. */
  | { kind: 'manualOff' }
  /** A persisted position was found that was written after a power-down: not usable as an origin. */
  | { kind: 'staleRestore' }
  /** Something was commanded to move, which re-energizes the steppers. Says nothing about the origin. */
  | { kind: 'motion' }
  /** The operator set the work origin at the head's current position. */
  | { kind: 'setWorkZero' };

/** "1 hour", "90 minutes" — how long the machine sat, said the way a person would. */
export function describeIdlePeriod(minutes: number): string {
  if (minutes === 60) return '1 hour';
  if (minutes > 60 && minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Apply one event to the known motor/origin state.
 *
 * `motion` deliberately leaves trust alone: the gantry moving proves the drivers
 * are live, and proves nothing at all about where the paper is.
 */
export function reduceMotorPower(prev: MotorPower, event: MotorPowerEvent): MotorPower {
  switch (event.kind) {
    case 'idleTimeout':
      return {
        powered: false,
        posTrusted: false,
        reason:
          `The motors were powered down after ${describeIdlePeriod(event.minutes)} idle. ` +
          'The gantry is free, so home is no longer known.',
      };
    case 'manualOff':
      return {
        powered: false,
        posTrusted: false,
        reason:
          'The motors were switched off, so the gantry can be moved by hand and home is no ' +
          'longer known.',
      };
    case 'staleRestore':
      // The daemon has just started and found a position saved on the wrong side
      // of a power-down. The steppers themselves are whatever the controller's
      // reset left them as — untouched here — but that position is not an origin.
      return {
        powered: prev.powered,
        posTrusted: false,
        reason:
          'The saved position was recorded after the motors were powered down, so it was not ' +
          'restored. Home is not known.',
      };
    case 'motion':
      return { powered: true, posTrusted: prev.posTrusted, reason: prev.reason };
    case 'setWorkZero':
      return { powered: prev.powered, posTrusted: true, reason: null };
  }
}

/**
 * Whether a persisted position may be reinstated as the work origin.
 *
 * A file written before motors could be powered down carries no `trusted` field.
 * Those positions were only ever saved while the steppers were holding the
 * gantry, so an absent flag reads as trusted — reading it the other way would
 * throw away the remembered home of every machine that upgrades.
 */
export function canRestorePosition(saved: { trusted?: boolean } | null | undefined): boolean {
  return saved != null && saved.trusted !== false;
}

/** Everything the idle rule needs to decide. All of it, so the rule has no hidden inputs. */
export interface IdleCheck {
  now: number;
  /** When the machine was last commanded to move (epoch ms). */
  lastActivityAt: number;
  /** Configured idle period in minutes. Zero or less means never power down. */
  idleMinutes: number;
  /** Is a plotter attached at all? */
  connected: boolean;
  /**
   * `isPlotting()` — streaming, queued, paused, `Run`, `Hold`, **or held at a pen
   * change**. That last one is the trap: it is deliberately Idle with an empty
   * queue and no motion, and it is mid-job. Dropping the motors there shifts the
   * gantry and lands the rest of the drawing offset on a sheet nobody can restart.
   */
  busy: boolean;
  /** Are the steppers currently energized? No point disabling them twice. */
  powered: boolean;
}

/** True when the steppers may be de-energized right now. */
export function shouldDropMotors(c: IdleCheck): boolean {
  if (!c.connected || !c.powered || c.busy) return false;
  // A non-finite period is a hand-edited settings file, not an instruction to
  // drop the motors immediately — and zero is the operator saying "never".
  if (!Number.isFinite(c.idleMinutes) || c.idleMinutes <= 0) return false;
  return c.now - c.lastActivityAt >= c.idleMinutes * 60_000;
}
