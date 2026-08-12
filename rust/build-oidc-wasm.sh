#!/usr/bin/env bash
# Build the browser OIDC wasm bundle from rust/libid-oidc-wasm (a
# wasm-bindgen wrapper over libid-oidc-core) and stage it into the demo
# app's public/wasm/, where the Google claim flow dynamically imports it
# (`${origin}/wasm/oidc_noir_wasm.js` + `oidc_noir_wasm_bg.wasm`).
#
# The generated bundle is NOT committed — run this after a fresh checkout
# (harness/stage-assets.sh calls it) and whenever the Rust crates change.
#
# Requirements: wasm-pack, pinned for reproducible bundles. A version
# mismatch is a hard error; set WASM_PACK_REQUIRED= to override the pin at
# your own risk.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OIDC_WASM_CRATE="$REPO_ROOT/rust/libid-oidc-wasm"
OIDC_WASM_OUT="${OIDC_WASM_OUT:-$REPO_ROOT/ts/apps/demo/public/wasm}"

WASM_PACK_REQUIRED="${WASM_PACK_REQUIRED-0.15.0}"

if ! command -v wasm-pack >/dev/null 2>&1; then
    echo "ERROR: 'wasm-pack' not found in PATH."
    echo "       Install: cargo install wasm-pack --version ${WASM_PACK_REQUIRED:-0.15.0} --locked"
    exit 1
fi

if [ -n "$WASM_PACK_REQUIRED" ]; then
    WASM_PACK_HAVE=$(wasm-pack --version 2>/dev/null | sed -nE 's/^wasm-pack ([0-9.]+).*/\1/p')
    if [ "$WASM_PACK_HAVE" != "$WASM_PACK_REQUIRED" ]; then
        echo "ERROR: wasm-pack $WASM_PACK_HAVE installed — the bundle is pinned to $WASM_PACK_REQUIRED."
        echo "       cargo install wasm-pack --version $WASM_PACK_REQUIRED --locked --force"
        echo "       (or set WASM_PACK_REQUIRED= to override the pin, at your own risk.)"
        exit 1
    fi
fi

echo "==> wasm-pack build libid-oidc-wasm -> $OIDC_WASM_OUT"
(cd "$OIDC_WASM_CRATE" && \
    wasm-pack build --target web --release \
        --out-dir "$OIDC_WASM_OUT" \
        --out-name oidc_noir_wasm)

# wasm-pack drops packaging files we do not want in a public/ directory.
rm -f "$OIDC_WASM_OUT/package.json" "$OIDC_WASM_OUT/.gitignore" "$OIDC_WASM_OUT/README.md"

echo ""
echo "Done. Staged browser bundle (gitignored build artifacts):"
echo "  $OIDC_WASM_OUT/oidc_noir_wasm.js"
echo "  $OIDC_WASM_OUT/oidc_noir_wasm_bg.wasm"
