import { describe, it, expect } from 'vitest';
import { isOriginAllowed, parseAllowedOrigins } from '../origin';

describe('isOriginAllowed', () => {
  it('allows a request with no Origin (curl, smoke test, native clients)', () => {
    expect(isOriginAllowed(undefined, 'plotter.local:8717')).toBe(true);
    expect(isOriginAllowed('', 'plotter.local:8717')).toBe(true);
  });

  it('allows same-origin — direct access on the gateway port', () => {
    expect(isOriginAllowed('http://plotter.local:8717', 'plotter.local:8717')).toBe(true);
  });

  it('allows same-origin behind a proxy that forwards the host', () => {
    expect(isOriginAllowed('https://plotter.example.com', 'plotter.example.com')).toBe(true);
  });

  it('rejects a foreign origin — the drive-by case', () => {
    expect(isOriginAllowed('https://evil.example', 'plotter.local:8717')).toBe(false);
  });

  it('rejects the same host on a different port', () => {
    expect(isOriginAllowed('http://plotter.local:9999', 'plotter.local:8717')).toBe(false);
  });

  it('rejects an unparseable Origin', () => {
    expect(isOriginAllowed('not a url', 'plotter.local:8717')).toBe(false);
    expect(isOriginAllowed('null', 'plotter.local:8717')).toBe(false);
  });

  it('rejects when the request carries no Host to compare against', () => {
    expect(isOriginAllowed('https://evil.example', undefined)).toBe(false);
  });

  it('honours the allowlist, by full origin or by host', () => {
    expect(
      isOriginAllowed('http://localhost:5173', 'localhost:8717', ['http://localhost:5173']),
    ).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', 'localhost:8717', ['localhost:5173'])).toBe(
      true,
    );
    expect(isOriginAllowed('https://evil.example', 'localhost:8717', ['localhost:5173'])).toBe(
      false,
    );
  });
});

describe('parseAllowedOrigins', () => {
  it('defaults to empty', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
  });

  it('splits, trims, and drops blanks', () => {
    expect(parseAllowedOrigins(' http://a.local:5173 , http://b.local ,, ')).toEqual([
      'http://a.local:5173',
      'http://b.local',
    ]);
  });
});
