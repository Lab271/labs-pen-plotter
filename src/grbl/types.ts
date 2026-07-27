export type MachineState =
  'Idle' | 'Run' | 'Hold' | 'Jog' | 'Alarm' | 'Door' | 'Home' | 'Check' | 'Sleep' | 'Unknown';

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface StatusReport {
  state: MachineState;
  /** Machine position (absolute, from homing origin). */
  mpos: Position;
  /** Work-coordinate offset, if reported. WPos = MPos - WCO. */
  wco?: Position;
  /** Live feed rate (mm/min). */
  feed?: number;
  /** Live spindle value. */
  spindle?: number;
}

/** Parsed GRBL `$$` settings, keyed by setting number (e.g. 130 -> 1189). */
export type GrblSettings = Record<number, number>;
