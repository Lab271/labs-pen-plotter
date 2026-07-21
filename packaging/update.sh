#!/bin/sh
# ExecStart of plotter-update.service. Runs as root (the oneshot unit), in its own
# cgroup — independent of the gateway daemon, so the daemon restart that apt-get
# triggers mid-install can't kill this script. Steps:
#   mid-plot guard → resolve latest release .deb → download → apt-get install
#   (dpkg restarts the gateway) → record status throughout.
# Status is written to a file the (restarted) daemon reads back, since the
# WebSocket drops across the restart.
set -eu

STATE_DIR=/var/lib/penplotter271
STATUS="${UPDATE_STATUS:-$STATE_DIR/.update-status.json}"
PLOTTER_STATE="${PLOTTER_STATE:-$STATE_DIR/.plotter-state.json}"
REPO="${GITHUB_REPO:-LAB271/labs-pen-plotter}"
NODE=/opt/penplotter271/node
DEB="$STATE_DIR/penplotter271-update.deb"
FROM="$(dpkg-query -W -f='${Version}' penplotter271 2>/dev/null || echo '')"

# Write {state,message,...} atomically; chown so the daemon (penplotter) can read it.
write_status() { # $1=state  $2=message  $3=toVersion(optional)
  tmp="$STATUS.tmp"
  printf '{"state":"%s","fromVersion":"%s","toVersion":"%s","message":"%s","at":"%s"}\n' \
    "$1" "$FROM" "${3:-}" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$tmp"
  mv "$tmp" "$STATUS"
  chown penplotter:penplotter "$STATUS" 2>/dev/null || true
}
fail() { write_status error "$1"; exit 1; }

# 1. Mid-plot guard — same fresh-state-file check as prerm (defense in depth; the
#    daemon already refuses the trigger while plotting).
if [ -f "$PLOTTER_STATE" ] && [ -n "$(find "$PLOTTER_STATE" -newermt '-3 seconds' 2>/dev/null)" ]; then
  fail "Plotter is moving — update aborted."
fi

# 2. Resolve the latest release's tag + .deb asset URL (bundled Node; no jq dep).
write_status downloading "Finding latest release…"
INFO="$(REPO="$REPO" "$NODE" --input-type=module 2>/dev/null <<'JS' || true
const r = await fetch(`https://api.github.com/repos/${process.env.REPO}/releases/latest`, {
  headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'penplotter271' },
});
if (!r.ok) process.exit(2);
const j = await r.json();
const a = (j.assets || []).find((x) => x.name.endsWith('.deb'));
if (!a) process.exit(2);
console.log(`${(j.tag_name || '').replace(/^v/, '')}|${a.browser_download_url}`);
JS
)"
[ -n "$INFO" ] || fail "Could not find a .deb on the latest release."
TO="${INFO%%|*}"
URL="${INFO#*|}"

# 3. Download the .deb (follow redirects to the asset CDN).
write_status downloading "Downloading v$TO…" "$TO"
URL="$URL" OUT="$DEB" "$NODE" --input-type=module <<'JS' || fail "Download failed."
const r = await fetch(process.env.URL, { headers: { 'User-Agent': 'penplotter271' }, redirect: 'follow' });
if (!r.ok) process.exit(3);
const buf = Buffer.from(await r.arrayBuffer());
const fs = await import('node:fs');
fs.writeFileSync(process.env.OUT, buf);
JS

# 4. Install. dpkg's postinst restarts plotter-gateway; this script (own cgroup)
#    survives that and writes the final status the new daemon reads back.
#    --allow-downgrades so re-installing the same/older version works for testing.
#    Non-interactive + --force-confold so a release that changes a conffile installs
#    without a (terminal-less) prompt and preserves operator edits to the config.
write_status installing "Installing v$TO…" "$TO"
if DEBIAN_FRONTEND=noninteractive apt-get install -y --allow-downgrades \
  -o Dpkg::Options::="--force-confold" "$DEB" >/var/log/penplotter271-update.log 2>&1; then
  write_status success "Updated to v$TO." "$TO"
  rm -f "$DEB"
else
  fail "apt-get install failed — previous version kept running. See /var/log/penplotter271-update.log"
fi
