#!/usr/bin/env bash
# DEV ALTERNATIVE to the docker-compose stack: build the released service
# binaries natively into harness/bin/bin/. The compose path
# (docker-compose.yml + boot.sh) is the supported one; use this when you
# want to run the services directly (debugger, no Docker, etc.).
#
# Build times on an M-class Mac with a warm cargo cache (2026-08):
#   libid-deploy      ~2 min
#   notary            ~6 min   (tlsn MPC dependency tree — the big one)
#   identity-backend  ~5 min
#   keeper            ~6 min   (same tlsn graph via the notary crate)
#
# Native run sketch (ports/env mirror docker-compose.yml — read it for the
# full variable table; addresses come from network.local.toml):
#   anvil --chain-id 31337 --code-size-limit 65536
#   libid-deploy apply --network <copy with rpc_url=http://127.0.0.1:8545> \
#     --signer <anvil #0> --yes --confirm-fresh-deploy
#     (0.4.0 is declarative: no blanking, apply never rewrites the file)
#   notary --host 127.0.0.1 --port 7047 --ws-port 7048 \
#     --signing-key <anvil #1> --chain-id 31337 \
#     --verifying-contract <github_identity_verifier> \
#     --x-zk-verifier-address <x_identity_verifier>
#   identity-backend  (env: see the identity-backend service in compose)
#   keeper --config <keeper.toml pointing at the same copy> once
#     (notary_url tcp://127.0.0.1:7047 — real MPC-TLS JWKS rotation)

set -euo pipefail

HARNESS="$(cd "$(dirname "$0")" && pwd)"
ROOT_FLAG=(--root "$HARNESS/bin" --locked)

DEPLOY_TAG="${DEPLOY_TAG:-v0.4.0}"
NOTARY_TAG="${NOTARY_TAG:-v0.1.0}"
BACKEND_TAG="${BACKEND_TAG:-v0.1.0}"
KEEPER_TAG="${KEEPER_TAG:-v0.1.0}"

echo "==> libid-deploy $DEPLOY_TAG"
cargo install --git https://github.com/libid-org/chain-configurations \
  --tag "$DEPLOY_TAG" libid-deploy "${ROOT_FLAG[@]}"

echo "==> notary $NOTARY_TAG"
cargo install --git https://github.com/libid-org/notary \
  --tag "$NOTARY_TAG" notary "${ROOT_FLAG[@]}"

echo "==> identity-backend $BACKEND_TAG"
cargo install --git https://github.com/libid-org/identity-backend \
  --tag "$BACKEND_TAG" identity-backend "${ROOT_FLAG[@]}"

echo "==> keeper $KEEPER_TAG"
cargo install --git https://github.com/libid-org/keeper \
  --tag "$KEEPER_TAG" keeper "${ROOT_FLAG[@]}"

echo ""
echo "Binaries in $HARNESS/bin/bin/ (gitignored)."
