import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  type AppSettings,
} from '../gateway/appSettings';

const KEY = 'penplotter271.appSettings';
// Pre-1.3 key: calibration was per-browser, before app settings moved to the
// daemon. Read once so a browser that has been driving the machine keeps its
// tuned setup (and seeds the daemon with it on the next connect).
const LEGACY_CALIBRATION_KEY = 'penplotter271.calibration';

/**
 * Local cache of the app settings. The daemon is authoritative — this only
 * decides what the first paint shows, before the WebSocket snapshot arrives,
 * and what seeds the daemon when it has no settings of its own yet.
 */
export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeAppSettings(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_CALIBRATION_KEY);
    if (legacy) return normalizeAppSettings({ calibration: JSON.parse(legacy) });
  } catch {
    /* ignore corrupt storage — fall through to the defaults */
  }
  return { ...DEFAULT_APP_SETTINGS, calibration: { ...DEFAULT_APP_SETTINGS.calibration } };
}

export function saveAppSettings(s: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/availability errors */
  }
}
