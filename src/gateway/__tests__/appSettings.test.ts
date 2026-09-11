import { describe, expect, it } from 'vitest';
import { DEFAULT_CALIBRATION } from '../../grbl/settings';
import {
  APP_SETTINGS_VERSION,
  appSettingsFromLegacySession,
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
} from '../appSettings';

describe('normalizeAppSettings', () => {
  it('returns the defaults for a missing or non-object value', () => {
    for (const junk of [undefined, null, 'nope', 42, []]) {
      expect(normalizeAppSettings(junk)).toEqual(DEFAULT_APP_SETTINGS);
    }
  });

  it('keeps the fields present and defaults the rest', () => {
    const s = normalizeAppSettings({ calibration: { drawFeed: 2400, penDownZ: 2.5 } });
    expect(s.calibration.drawFeed).toBe(2400);
    expect(s.calibration.penDownZ).toBe(2.5);
    expect(s.calibration.travelFeed).toBe(DEFAULT_CALIBRATION.travelFeed);
    expect(s.version).toBe(APP_SETTINGS_VERSION);
  });

  it('rejects non-numeric and non-finite values rather than letting them reach G-code', () => {
    const s = normalizeAppSettings({
      calibration: { drawFeed: 'fast', penDownZ: NaN, travelFeed: Infinity },
    });
    expect(s.calibration.drawFeed).toBe(DEFAULT_CALIBRATION.drawFeed);
    expect(s.calibration.penDownZ).toBe(DEFAULT_CALIBRATION.penDownZ);
    expect(s.calibration.travelFeed).toBe(DEFAULT_CALIBRATION.travelFeed);
  });

  it('drops unknown keys instead of persisting them', () => {
    const s = normalizeAppSettings({ calibration: { nonsense: 1 }, somethingElse: true });
    expect(Object.keys(s).sort()).toEqual(['calibration', 'version']);
    expect(s.calibration).toEqual(DEFAULT_CALIBRATION);
  });

  it('does not alias the defaults, so a mutation cannot leak into them', () => {
    const s = normalizeAppSettings(undefined);
    s.calibration.drawFeed = 1;
    expect(DEFAULT_APP_SETTINGS.calibration.drawFeed).toBe(DEFAULT_CALIBRATION.drawFeed);
  });
});

describe('appSettingsFromLegacySession', () => {
  it('lifts the calibration a pre-1.3 session blob carried', () => {
    const s = appSettingsFromLegacySession({ items: [], calibration: { drawFeed: 2400 } });
    expect(s?.calibration.drawFeed).toBe(2400);
  });

  it('returns null when there is nothing to migrate', () => {
    expect(appSettingsFromLegacySession(null)).toBeNull();
    expect(appSettingsFromLegacySession({ items: [] })).toBeNull();
  });
});
