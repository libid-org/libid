#!/usr/bin/env bash
# One-shot deploy container entrypoint (see docker-compose.yml).
#
#   1. Download the released libid-deploy for this container's arch.
#   2. Copy the committed network file and BLANK its output keys — the
#      committed file carries the expected addresses, and apply would treat
#      them as already-deployed.
#   3. Fresh-apply against the anvil service.
#   4. Byte-compare the rewritten file with the committed one: anvil and
#      libid-deploy are deterministic, so any diff means the toolchain or
#      bytecode changed upstream — fail loudly instead of shifting
#      addresses under the static env wiring.

set -euo pipefail

VERSION="${LIBID_DEPLOY_VERSION:?}"
ARCH="$(uname -m)" # x86_64 | aarch64
ASSET="libid-deploy-${VERSION}-${ARCH}-unknown-linux-gnu.tar.gz"
URL="https://github.com/libid-org/chain-configurations/releases/download/v${VERSION}/${ASSET}"

apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null

echo "==> fetching $ASSET"
curl -fsSL --retry 3 -o /tmp/libid-deploy.tar.gz "$URL"
tar -xzf /tmp/libid-deploy.tar.gz -C /tmp --strip-components=1
chmod +x /tmp/libid-deploy

# Blank every value under [contracts] and [identity] (section-aware: the
# `notary` key also exists under [accounts], where it must stay).
awk '
  /^\[/ { section = $0 }
  section == "[contracts]" || section == "[identity]" {
    if ($0 ~ /^[a-z_]+ = "0x[0-9a-fA-F]+"$/) { sub(/"0x[0-9a-fA-F]+"/, "\"\"") }
  }
  { print }
' /input/network.local.toml > /tmp/network.toml

echo "==> libid-deploy apply (fresh deploy against anvil)"
/tmp/libid-deploy apply \
  --network /tmp/network.toml \
  --signer "${DEPLOYER_KEY:?}" \
  --yes --confirm-fresh-deploy

echo "==> drift check: rewritten file must equal the committed one"
if ! diff -u /input/network.local.toml /tmp/network.toml; then
  echo ""
  echo "ERROR: the fresh deploy did not reproduce harness/network.local.toml."
  echo "libid-deploy or the embedded contract bytecode changed. Regenerate"
  echo "the committed file (see harness/README.md) and re-wire the env."
  exit 1
fi

echo "==> deploy converged; addresses match the committed network file"
