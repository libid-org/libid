#!/usr/bin/env bash
# One-shot deploy container entrypoint (see docker-compose.yml).
#
#   1. Download the released libid-deploy for this container's arch.
#   2. Apply the committed network file DIRECTLY on its read-only mount.
#      Since libid-deploy 0.4.0 the file is DECLARATIVE: every canonical
#      address is pre-declared, presence is read from chain state, and
#      apply never rewrites the file — a fresh anvil simply converges onto
#      the declared addresses (any deviation aborts via apply's
#      predict-equality canary; validate rejects non-canonical values).
#   3. Assert convergence: `plan --json` must report nothing left to
#      deploy.

set -euo pipefail

VERSION="${LIBID_DEPLOY_VERSION:?}"
ARCH="$(uname -m)" # x86_64 | aarch64
ASSET="libid-deploy-${VERSION}-${ARCH}-unknown-linux-gnu.tar.gz"
URL="https://github.com/libid-org/chain-configurations/releases/download/v${VERSION}/${ASSET}"

apt-get update -qq && apt-get install -y -qq curl ca-certificates jq >/dev/null

echo "==> fetching $ASSET"
curl -fsSL --retry 3 -o /tmp/libid-deploy.tar.gz "$URL"
tar -xzf /tmp/libid-deploy.tar.gz -C /tmp --strip-components=1
chmod +x /tmp/libid-deploy

echo "==> libid-deploy apply (fresh deploy against anvil)"
/tmp/libid-deploy apply \
  --network /input/network.local.toml \
  --signer "${DEPLOYER_KEY:?}" \
  --yes --confirm-fresh-deploy

echo "==> convergence check: plan must have nothing left to deploy"
# RUST_LOG=error: tracing writes to stdout, and stray info-level lines from
# the provider stack would corrupt the JSON document.
RUST_LOG=error /tmp/libid-deploy plan --network /input/network.local.toml --json \
  > /tmp/plan.json
if jq -e '[.items[] | select(.status == "deploy")] | length > 0' \
    /tmp/plan.json >/dev/null; then
  echo ""
  echo "ERROR: the fresh apply left components undeployed:"
  jq -r '.items[] | select(.status == "deploy")
         | "  \(.component): \(.detail)"' /tmp/plan.json
  exit 1
fi

echo "==> deploy converged; every declared contract is live at its canonical address"
