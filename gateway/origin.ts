/**
 * Origin filtering for the WebSocket handshake.
 *
 * The daemon has no authentication — whatever opens a socket gets control of the
 * machine, including `plot`, `jog`, `setSetting` (writes GRBL EEPROM) and
 * `update` (installs a .deb and restarts). Browsers do NOT apply the same-origin
 * policy to WebSocket connections: they send an `Origin` header and leave the
 * decision to the server. Without this check, any page anyone on the same
 * network happens to visit can connect and drive the gantry — the attacker never
 * needs access to the network, the victim's browser reaches in for them.
 *
 * Rules:
 * - **No `Origin` header** → allowed. Native clients (curl, the smoke test)
 *   don't send one, and they already require network access to the daemon, which
 *   is the exposure `GATEWAY_HOST=0.0.0.0` accepts by design. Rejecting them
 *   would break tooling without closing the browser path.
 * - **Origin host equals the request's `Host`** → allowed. Covers direct access
 *   and a reverse proxy that forwards the original host (Traefik
 *   `passHostHeader: true`).
 * - **Anything else** → rejected, unless listed in `GATEWAY_ALLOWED_ORIGINS`.
 */
export function isOriginAllowed(
  origin: string | undefined,
  host: string | undefined,
  allowlist: readonly string[] = [],
): boolean {
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // unparseable Origin — not something a real browser sends
  }
  if (!originHost) return false;

  if (host && originHost === host) return true;

  return allowlist.includes(origin) || allowlist.includes(originHost);
}

/** Parse the comma-separated `GATEWAY_ALLOWED_ORIGINS` env value. */
export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
