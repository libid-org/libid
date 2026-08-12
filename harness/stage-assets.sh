#!/usr/bin/env bash
# Stage every static asset the demo app serves, into ts/apps/demo/public/.
# All of it is gitignored build/release output:
#
#   /tlsn_wasm.js /tlsn_wasm_bg.wasm /spawn.js   ← libid-org/notary release
#   /circuit/dyaka_noir_token.json               ← libid-org/libid-circuits (X)
#   /circuits/jwt_email.json                     ← libid-org/libid-circuits (Google)
#   /wasm/acvm_js_bg.wasm /wasm/noirc_abi_wasm_bg.wasm ← node_modules (noir_js)
#   /wasm/oidc_noir_wasm.js /wasm/oidc_noir_wasm_bg.wasm ← rust/build-oidc-wasm.sh
#
# (Yes, /circuit/ singular for X and /circuits/ plural for Google — the two
# flows grew up separately and both paths are overridable per-call in
# @libid/claim; the harness keeps the defaults.)
#
# Prereqs: `pnpm install` has run in ts/ (noir wasm comes from
# node_modules); curl; wasm-pack 0.15.0 for the OIDC bundle; shasum or
# sha256sum.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC="$REPO_ROOT/ts/apps/demo/public"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

NOTARY_RELEASE="${NOTARY_RELEASE:-v0.1.0}"
CIRCUITS_RELEASE="${CIRCUITS_RELEASE:-v0.1.0}"

fetch() {
  # curl works anonymously — the libid-org repos are public.
  echo "==> fetch $1"
  curl -fsSL --retry 3 -o "$2" "$1"
}

sha() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

mkdir -p "$PUBLIC" "$PUBLIC/circuit" "$PUBLIC/circuits" "$PUBLIC/wasm"

# ── tlsn wasm bundle (X flow's MPC/Proxy prover) ───────────────────────────
tlsn_ver="${NOTARY_RELEASE#v}"
fetch "https://github.com/libid-org/notary/releases/download/$NOTARY_RELEASE/tlsn-wasm-$tlsn_ver.tar.gz" \
  "$WORK/tlsn-wasm.tar.gz"
mkdir -p "$WORK/tlsn"
tar -xzf "$WORK/tlsn-wasm.tar.gz" -C "$WORK/tlsn"
for f in tlsn_wasm.js tlsn_wasm_bg.wasm spawn.js; do
  src="$(find "$WORK/tlsn" -name "$f" | head -1)"
  [ -n "$src" ] || { echo "ERROR: $f missing from tlsn-wasm tarball"; exit 1; }
  cp "$src" "$PUBLIC/$f"
  echo "staged public/$f"
done

# ── circuits (verified against the release manifest) ───────────────────────
circ_ver="${CIRCUITS_RELEASE#v}"
circ_base="https://github.com/libid-org/libid-circuits/releases/download/$CIRCUITS_RELEASE"
fetch "$circ_base/manifest.json" "$WORK/manifest.json"

stage_circuit() { # tarball-suffix circuit-json dest
  local tarball="libid-circuits-$circ_ver-$1.tar.gz"
  fetch "$circ_base/$tarball" "$WORK/$tarball"
  local want have
  want=$(node -e "console.log(require('$WORK/manifest.json').tarballs['$tarball'].sha256)")
  have=$(sha "$WORK/$tarball")
  if [ "$want" != "$have" ]; then
    echo "ERROR: $tarball sha256 mismatch (manifest $want, got $have)"; exit 1
  fi
  mkdir -p "$WORK/$1"
  tar -xzf "$WORK/$tarball" -C "$WORK/$1"
  local src
  src="$(find "$WORK/$1" -name "$2" | head -1)"
  [ -n "$src" ] || { echo "ERROR: $2 missing from $tarball"; exit 1; }
  cp "$src" "$3"
  echo "staged ${3#"$PUBLIC"/} (from $tarball)"
}

stage_circuit dyaka-noir-token dyaka_noir_token.json "$PUBLIC/circuit/dyaka_noir_token.json"
stage_circuit jwt_email jwt_email.json "$PUBLIC/circuits/jwt_email.json"

# ── noir wasm (worker prover init) ─────────────────────────────────────────
node "$REPO_ROOT/ts/apps/demo/scripts/stage-noir-wasm.mjs"

# ── OIDC wasm (Google flow input building) ─────────────────────────────────
bash "$REPO_ROOT/rust/build-oidc-wasm.sh"

echo ""
echo "All demo assets staged under ts/apps/demo/public/."
