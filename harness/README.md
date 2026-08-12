# Integration harness

Everything needed to run a real, manual, end-to-end handle claim against a
local chain: anvil, the deployed 0.2.0 contract stack, the released notary
and identity-backend images, and the buttons-only demo UI on top of
`@libid/claim`.

Automation of the click-through itself (captured-credentials driving a real
browser — dyaka has prior art with chromiumoxide) is the next phase; today
the harness boots the stack and a human clicks. The `integration-smoke` CI
job already automates everything up to the consent screen: stack boot,
deterministic-deploy drift check, and API-level assertions.

## One command

```sh
harness/boot.sh
```

which does, in order:

1. **`stage-assets.sh`** — downloads/builds the demo's static assets into
   `ts/apps/demo/public/` (gitignored): the tlsn wasm bundle from the
   `libid-org/notary` release, the compiled circuits from
   `libid-org/libid-circuits` (sha256-verified against the release
   manifest), noir's acvm/abi wasm from `node_modules`, and the OIDC wasm
   via `rust/build-oidc-wasm.sh` (wasm-pack pinned 0.15.0).
   Prereqs: `pnpm -C ts install` has run; `curl`; wasm-pack 0.15.0
   (`cargo install wasm-pack --version 0.15.0 --locked`).
2. **`render-env.sh`** — parses the committed `network.local.toml` into
   `harness/.env` (compose interpolation) and `ts/apps/demo/.env.local`
   (VITE_ vars, including the anvil #4 dev-fallback signer so no wallet
   extension is needed). Both outputs are generated, never committed.
3. **`docker compose up --wait`** — the stack below.
4. Health checks (anvil RPC, notary `/info`, backend `/health`) + a status
   table.
5. The vite dev server, foreground, at `http://localhost:5173`. Exit tears
   the stack down (`KEEP_STACK=1` to keep it).

## The compose stack

| Service | Image | Role |
|---|---|---|
| `anvil` | `ghcr.io/foundry-rs/foundry:v1.5.1` | chain 31337, `--code-size-limit 65536` (the Honk verifiers exceed EIP-170) |
| `deploy` | `debian:bookworm-slim` (one-shot) | downloads released `libid-deploy` 0.2.0 for the container arch, fresh-applies the contracts, **asserts determinism** (below) |
| `notary` | `ghcr.io/libid-org/notary:0.1.0` | MPC-TLS/ProxyMode notary; TCP 7047 + HTTP/WS 7048 |
| `identity-backend` | `ghcr.io/libid-org/identity-backend:0.1.0` | GitHub OAuth + MPC-TLS proof service on 8722; also serves the Google fragment relay |

Two addresses that look confusable and are not: the notary's
`VERIFYING_CONTRACT_ADDRESS` (and the backend's, same value) is
**GitHubIdentityVerifier**; the notary's `X_ZK_VERIFIER_ADDRESS` is
**XIdentityVerifier**. Both come from `network.local.toml` via
`render-env.sh`.

### No runtime address hand-off, by construction

Anvil is deterministic (fixed mnemonic, deployer = account #0 from nonce 0)
and `libid-deploy`'s deploy order is fixed, so the deployed addresses are
known in advance and committed in `network.local.toml`. Compose wires them
as static env. The one-shot `deploy` service re-runs the fresh apply
against the fresh anvil and byte-compares the rewritten file with the
committed one — if `libid-deploy` or the embedded bytecode ever changes,
the boot fails loudly instead of the addresses silently drifting away from
the static wiring. (Verified locally: two fresh anvil runs produced
byte-identical files.)

To regenerate after an upstream change: blank every value under
`[contracts]` and `[identity]`, run a local anvil
(`--chain-id 31337 --code-size-limit 65536`), point `rpc_url` at it, run

```sh
harness/bin/bin/libid-deploy apply --network harness/network.local.toml \
  --signer ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --yes --confirm-fresh-deploy
```

restore `rpc_url = "http://anvil:8545"`, and commit the diff.

## Manual test procedure

Prereqs (once):

* Docker, pnpm 10, node ≥ 20, curl, wasm-pack 0.15.0.
* **GitHub OAuth App** (the flow that works out of the box): create a plain
  OAuth App with callback URL exactly `http://localhost:8722/auth/github/callback`,
  then `export GH_OAUTH_CLIENT_ID=… GH_OAUTH_CLIENT_SECRET=…` before boot.
  Without them the stack boots with dummies and everything except the
  GitHub consent screen works.
* **X** (optional): an X OAuth2 app with redirect URI
  `http://localhost:5173/zk/x-popup`, and its client id in
  `network.local.toml` (`[platforms] x_client_id`) *before* boot — the id
  is baked into the on-chain verifier at deploy time. Addresses do not
  move when inputs change (CREATE addresses depend only on deployer
  nonces).
* **Google** (optional): an OAuth client with redirect URI
  `http://localhost:8722/auth/gmail/callback`, its client id in
  `network.local.toml` (`[platforms] google_client_id`) before boot. Note:
  Google claims additionally need a JWKS rotation listener feeding
  `identity_jwks_roots` (deployed empty) — not part of this harness yet;
  Google binds revert with `UntrustedModulus` until then.

Then:

1. `harness/boot.sh` — wait for the status table and the vite banner.
2. Open `http://localhost:5173`.
3. **Connect wallet** — with no extension installed the demo falls back to
   the anvil #4 dev key (the page says "(dev key)").
4. Pick **GitHub**, leave "Publish the handle" checked, click **Claim my
   GitHub handle**, authorize in the popup.
5. Expected: status walks through the backend poll → "Signing…" → the
   claim transaction lands → the page reads the name back and shows
   "*handle* now resolves to your wallet" (that read-back is
   `resolveId(platform, userId) == holder`).
6. Paste your handle or the holder address into **Resolve** and confirm
   both directions.

## Dev alternative without Docker

`harness/build-bins.sh` cargo-installs the released `libid-deploy`,
`notary` and `identity-backend` into `harness/bin/bin/` (timings in the
script header) and its comments sketch the native run — same ports, same
env, values from `network.local.toml`.
