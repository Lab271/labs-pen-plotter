/**
 * Machine calibration. Pure data + defaults seeded from the probed UUNA TEK 3.0
 * (A0). Persistence (localStorage) lives in the UI layer, not here, to keep the
 * engine framework-free.
 */
export interface Calibration {
  /** Work area in mm (X is the long axis on this machine). */
  workAreaX: number;
  workAreaY: number;
  /** Z value that puts the pen on the paper. NOTE: this machine is inverted — Z+ is DOWN. */
  penDownZ: number;
  /** Z value that lifts the pen clear (<= 0). */
  penUpZ: number;
  /** Settle dwell after a pen move, in milliseconds, before the next motion. */
  penDwellMs: number;
  /** Default jog feed rate (mm/min). */
  jogFeed: number;
  /** Feed rate for pen-down (drawing) moves, mm/min. */
  drawFeed: number;
  /** Feed rate for pen-up (travel) moves, mm/min. */
  travelFeed: number;
  /** Level of detail in 0..1 (1 = full, 0 = most aggressive) — fewer strokes plot faster. */
  detail: number;
  /** PNG import: darkness cutoff 0..1 (pixels darker than this are inked). */
  pngThreshold: number;
  /** PNG import: number of brightness contours (1 = outline, more = tonal shading). */
  pngLevels: number;
  /** Machine limits, for reference and UI clamping. */
  maxFeedXY: number;
  maxFeedZ: number;
  /**
   * Minutes of no commanded motion after which the daemon de-energizes the
   * steppers (`$MD`). `0` means never — which is also the "keep the motors on"
   * override, for an operator who is stepping away mid-setup and wants the
   * origin held. Powering down frees the gantry, and with no homing that loses
   * the work origin, so this always costs a re-zero. See src/grbl/motorPower.ts.
   */
  motorIdleMin: number;
}

export const DEFAULT_CALIBRATION: Calibration = {
  workAreaX: 1189,
  workAreaY: 841,
  penDownZ: 3,
  penUpZ: 0,
  penDwellMs: 250,
  jogFeed: 2000,
  drawFeed: 1500,
  travelFeed: 5000,
  detail: 0.6,
  pngThreshold: 0.5,
  pngLevels: 1,
  maxFeedXY: 11000,
  maxFeedZ: 5000,
  motorIdleMin: 60,
};
