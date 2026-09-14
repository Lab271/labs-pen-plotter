import { describe, expect, it } from 'vitest';
import {
  canRestorePosition,
  describeIdlePeriod,
  MOTORS_HOLDING,
  reduceMotorPower,
  shouldDropMotors,
  type IdleCheck,
  type MotorPower,
} from '../motorPower';

const HOUR_MS = 60 * 60 * 1000;

/** An idle, connected, energized machine that has done nothing for two hours. */
function idle(over: Partial<IdleCheck> = {}): IdleCheck {
  return {
    now: 2 * HOUR_MS,
    lastActivityAt: 0,
    idleMinutes: 60,
    connected: true,
    busy: false,
    powered: true,
    ...over,
  };
}

describe('shouldDropMotors', () => {
  it('drops the motors once the machine has been idle for the period', () => {
    expect(shouldDropMotors(idle())).toBe(true);
  });

  it('waits while the period has not elapsed', () => {
    expect(shouldDropMotors(idle({ now: 59 * 60_000 }))).toBe(false);
  });

  it('drops exactly on the boundary', () => {
    expect(shouldDropMotors(idle({ now: 60 * 60_000 }))).toBe(true);
  });

  // The whole point of the feature is that it never costs a sheet of paper.
  // isPlotting() folds streaming, queued, paused, Run, Hold AND the pen-change
  // hold into one flag; the timer must respect it whatever put it there.
  it('never fires while the machine is busy', () => {
    expect(shouldDropMotors(idle({ busy: true }))).toBe(false);
  });

  it('never fires while a job is held at a pen change, however long the wait', () => {
    // A pen-change hold is deliberately Idle with an empty queue: only `busy`
    // distinguishes it from a machine nobody is using.
    expect(shouldDropMotors(idle({ busy: true, now: 99 * HOUR_MS }))).toBe(false);
  });

  it('does nothing when no plotter is connected', () => {
    expect(shouldDropMotors(idle({ connected: false }))).toBe(false);
  });

  it('does not disable motors that are already off', () => {
    expect(shouldDropMotors(idle({ powered: false }))).toBe(false);
  });

  it('treats zero as never', () => {
    expect(shouldDropMotors(idle({ idleMinutes: 0, now: 99 * HOUR_MS }))).toBe(false);
  });

  it('treats a negative period as never, rather than as always', () => {
    expect(shouldDropMotors(idle({ idleMinutes: -1 }))).toBe(false);
  });

  it('treats a non-finite period as never — a bad settings file must not free the gantry', () => {
    expect(shouldDropMotors(idle({ idleMinutes: Number.NaN }))).toBe(false);
    expect(shouldDropMotors(idle({ idleMinutes: Number.POSITIVE_INFINITY }))).toBe(false);
  });

  it('honours a short period', () => {
    expect(shouldDropMotors(idle({ idleMinutes: 5, now: 5 * 60_000 }))).toBe(true);
    expect(shouldDropMotors(idle({ idleMinutes: 5, now: 4 * 60_000 }))).toBe(false);
  });
});

describe('reduceMotorPower', () => {
  it('starts out holding the gantry with a known origin', () => {
    expect(MOTORS_HOLDING).toEqual({ powered: true, posTrusted: true, reason: null });
  });

  it('loses the motors and the origin on the idle timeout, and says why', () => {
    const s = reduceMotorPower(MOTORS_HOLDING, { kind: 'idleTimeout', minutes: 60 });
    expect(s.powered).toBe(false);
    expect(s.posTrusted).toBe(false);
    expect(s.reason).toContain('1 hour');
    expect(s.reason).toContain('home is no longer known');
  });

  it('treats Motors off exactly like the timer — same free gantry', () => {
    const s = reduceMotorPower(MOTORS_HOLDING, { kind: 'manualOff' });
    expect(s.powered).toBe(false);
    expect(s.posTrusted).toBe(false);
    expect(s.reason).toBeTruthy();
  });

  it('distrusts a position saved across a power-down without claiming the motors are off', () => {
    const s = reduceMotorPower(MOTORS_HOLDING, { kind: 'staleRestore' });
    expect(s.posTrusted).toBe(false);
    expect(s.powered).toBe(true); // the controller just reset; nothing here disabled it
    expect(s.reason).toContain('not restored');
  });

  it('re-energizes on motion but does not invent an origin', () => {
    const off = reduceMotorPower(MOTORS_HOLDING, { kind: 'idleTimeout', minutes: 60 });
    const moved = reduceMotorPower(off, { kind: 'motion' });
    expect(moved.powered).toBe(true);
    expect(moved.posTrusted).toBe(false);
    expect(moved.reason).toBe(off.reason); // the operator still needs to hear it
  });

  it('restores trust only when the operator sets work zero', () => {
    const off = reduceMotorPower(MOTORS_HOLDING, { kind: 'idleTimeout', minutes: 60 });
    const zeroed = reduceMotorPower(off, { kind: 'setWorkZero' });
    expect(zeroed.posTrusted).toBe(true);
    expect(zeroed.reason).toBeNull();
  });

  it('walks the whole cycle: idle → untrusted → jogged → re-zeroed → trusted', () => {
    let s: MotorPower = MOTORS_HOLDING;
    s = reduceMotorPower(s, { kind: 'idleTimeout', minutes: 60 });
    expect(s.posTrusted).toBe(false);
    s = reduceMotorPower(s, { kind: 'motion' }); // jogged towards the corner
    expect(s.posTrusted).toBe(false);
    s = reduceMotorPower(s, { kind: 'motion' }); // and again
    expect(s.posTrusted).toBe(false);
    s = reduceMotorPower(s, { kind: 'setWorkZero' });
    expect(s).toEqual({ powered: true, posTrusted: true, reason: null });
  });

  it('does not claim the gantry is held just because home was set', () => {
    // G10 L20 writes an offset; it does not move anything, so it cannot
    // re-energize a stepper. Claiming otherwise would tell the operator the
    // gantry is safe to leave when it is still free.
    const off = reduceMotorPower(MOTORS_HOLDING, { kind: 'manualOff' });
    expect(reduceMotorPower(off, { kind: 'setWorkZero' }).powered).toBe(false);
  });

  it('never mutates the state it was given', () => {
    const before = { ...MOTORS_HOLDING };
    reduceMotorPower(MOTORS_HOLDING, { kind: 'manualOff' });
    expect(MOTORS_HOLDING).toEqual(before);
  });
});

describe('describeIdlePeriod', () => {
  it('says an hour rather than sixty minutes', () => {
    expect(describeIdlePeriod(60)).toBe('1 hour');
  });
  it('counts whole hours', () => {
    expect(describeIdlePeriod(120)).toBe('2 hours');
  });
  it('falls back to minutes', () => {
    expect(describeIdlePeriod(90)).toBe('90 minutes');
    expect(describeIdlePeriod(5)).toBe('5 minutes');
    expect(describeIdlePeriod(1)).toBe('1 minute');
  });
});

describe('canRestorePosition', () => {
  it('restores a position saved while the motors were holding it', () => {
    expect(canRestorePosition({ trusted: true })).toBe(true);
  });

  it('refuses a position saved after a power-down — the case this feature exists for', () => {
    expect(canRestorePosition({ trusted: false })).toBe(false);
  });

  it('trusts a file written before the flag existed, rather than losing every upgrade’s home', () => {
    expect(canRestorePosition({})).toBe(true);
  });

  it('has nothing to restore from a missing file', () => {
    expect(canRestorePosition(null)).toBe(false);
    expect(canRestorePosition(undefined)).toBe(false);
  });
});
