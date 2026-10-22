#!/usr/bin/env bash
# Assemble the staging tree for the PenPlotter271 .deb, then (if nfpm is present)
# build the package.
#
# MUST run on an arm64 Linux host — the Raspberry Pi (bootstrap) or an arm64 CI
# container (QEMU). The bundled Node and the native `serialport` binding are
# arch-specific; running this on macOS/x64 produces a broken package.
set -euo pipefail

cd "$(dirname "$0")/.."  # repo root

NODE_VERSION="${NODE_VERSION:-22.23.4}"   # current Node LTS line — override if newer
NODE_ARCH="${NODE_ARCH:-arm64}"
STAGE="build/stage"
OPT="$STAGE/opt/penplotter271"
SEMVER="$(node -p "require('./package.json').version")"
export SEMVER

echo "==> Building GUI + gateway bundle"
npm run build          # dist/  (the served GUI)
npm run build:gateway  # dist-gateway/gateway.js  (no tsx at runtime)

echo "==> Resetting staging tree ($STAGE)"
rm -rf "$STAGE"
mkdir -p "$OPT"

echo "==> Fetching Node v$NODE_VERSION ($NODE_ARCH)"
NODE_DIR="node-v${NODE_VERSION}-linux-${NODE_ARCH}"
curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIR}.tar.xz" -o "build/${NODE_DIR}.tar.xz"
tar -xJf "build/${NODE_DIR}.tar.xz" -C build
cp "build/${NODE_DIR}/bin/node" "$OPT/node"

echo "==> Installing runtime deps (serialport + ws only)"
SP_VER="$(node -p "require('./package.json').dependencies.serialport")"
WS_VER="$(node -p "require('./package.json').dependencies.ws")"
RT="build/runtime"
rm -rf "$RT"
mkdir -p "$RT"
cat >"$RT/package.json" <<JSON
{
  "name": "penplotter271-runtime",
  "private": true,
  "dependencies": { "serialport": "$SP_VER", "ws": "$WS_VER" }
}
JSON
(cd "$RT" && npm install --omit=dev --no-audit --no-fund)
cp -R "$RT/node_modules" "$OPT/node_modules"

echo "==> Copying app files"
cp dist-gateway/gateway.js "$OPT/gateway.js"
cp -R dist "$OPT/dist"

echo "==> Staging complete: $OPT (version $SEMVER)"

if command -v nfpm >/dev/null 2>&1; then
  echo "==> Building .deb with nfpm"
  mkdir -p dist-deb
  nfpm package --packager deb --target dist-deb/
  ls -la dist-deb/
else
  echo "nfpm not found. Install it, then run:"
  echo "    SEMVER=$SEMVER nfpm package --packager deb --target dist-deb/"
fi
