/**
 * Shared WebSocket protocol between the gateway daemon and browser clients.
 * Event names mirror the GrblController's events 1:1 so the bridge is mechanical.
 */
import type { GrblSettings, StatusReport } from '../grbl/types';
import type { Calibration } from '../grbl/settings';

export const DEFAULT_GATEWAY_PORT = 8717;

export interface StreamDebug {
  inflight: number;
  bytes: number;
  queued: number;
}

/**
 * Self-update progress/outcome. Persisted on the daemon (`.update-status.json`)
 * so it survives the daemon restart an update causes — a reconnecting client
 * reads the final state from the snapshot. See the `software-update` capability.
 */
export interface UpdateStatus {
  state: 'downloading' | 'installing' | 'success' | 'error';
  fromVersion?: string;
  toVersion?: string;
  message?: string;
  /** ISO timestamp of the last state change. */
  at?: string;
}

/** Commands a client sends to the daemon (1:1 with controller operations). */
export type ClientCommand =
  | { cmd: 'plot'; gcode: string[] }
  | { cmd: 'pause' }
  | { cmd: 'resume' }
  | { cmd: 'stop' }
  | { cmd: 'jog'; dx: number; dy: number; dz: number; feed: number }
  | { cmd: 'jogCancel' }
  | { cmd: 'feedOverride'; percent: number }
  | { cmd: 'penUp' }
  | { cmd: 'penDown' }
  | { cmd: 'setWorkZero' }
  | { cmd: 'goToWorkZero' }
  | { cmd: 'motorsOff' }
  | { cmd: 'unlock' }
  | { cmd: 'setSetting'; num: number; value: number }
  | { cmd: 'setCalibration'; calibration: Calibration }
  // Persist the editable session (artwork + page) on the daemon so it lives on
  // the Pi and is restored on any device that connects. Opaque blob to the daemon.
  | { cmd: 'saveSession'; session: unknown }
  // Trigger a self-update to the latest release. Refused while a plot runs.
  | { cmd: 'update' };

export type ClientMessage = { type: 'cmd'; id: number } & ClientCommand;

/** Snapshot of current state sent to a client on attach. */
export interface Snapshot {
  connected: boolean;
  /** GRBL firmware version reported by the controller (e.g. "3.0"). */
  version: string;
  /** Installed application version (what this daemon is running). */
  appVersion: string;
  /** Latest released app version if known (best-effort GitHub lookup), else null. */
  latestVersion: string | null;
  /** Last self-update status (persisted across the update's daemon restart), or null. */
  update: UpdateStatus | null;
  status: StatusReport | null;
  settings: GrblSettings;
  streamDebug: StreamDebug;
  inControl: boolean;
  /** True if a plot is currently paused (e.g. via a Disconnect-as-pause). */
  paused: boolean;
  /** Note if a remembered position was restored on connect (else null). */
  restoredNote: string | null;
  /** The editable session (artwork + page) stored on the daemon, or null. */
  session: unknown | null;
}

/**
 * Events pushed to clients over the WebSocket. The controller events are
 * forwarded verbatim (event name === controller event name); `versionInfo` and
 * `updateStatus` are daemon-originated (not from the controller).
 */
export interface ForwardedEvents {
  connected: { version: string };
  disconnected: undefined;
  status: StatusReport;
  settings: GrblSettings;
  error: { code: number; line: string };
  alarm: { code: number };
  streamProgress: { acked: number; total: number };
  streamComplete: undefined;
  streamAborted: { reason: string };
  log: { dir: 'tx' | 'rx' | 'info'; text: string };
  /** Daemon-originated: latest-release lookup result, pushed when it changes. */
  versionInfo: { appVersion: string; latestVersion: string | null };
  /** Daemon-originated: self-update progress/outcome. */
  updateStatus: UpdateStatus;
}

export type ServerMessage =
  | { type: 'snapshot'; payload: Snapshot }
  | { type: 'control'; inControl: boolean }
  | { type: 'streamDebug'; payload: StreamDebug }
  | { type: 'ack'; id: number }
  | { type: 'cmdError'; id?: number; message: string }
  | {
      [K in keyof ForwardedEvents]: { type: 'event'; event: K; payload: ForwardedEvents[K] };
    }[keyof ForwardedEvents];
