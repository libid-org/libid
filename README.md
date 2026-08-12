# libID

libID is a trust-minimized identity system that bridges identities from
OAuth-enabled platforms to blockchains. Initial integrations include Google,
X, and GitHub, but the system is designed to support any OAuth-based platform.
It currently supports EVM-compatible chains.

Identity bridging lets an existing user handle stand in for an onchain address,
similar to an onchain naming service.

The core is built bottom-up using a spec-driven approach and includes the tools
needed to make the system accessible, self-hostable, and reusable by
application developers, wallet providers, and other integrators without
introducing a central point of failure.

Beyond identity bridging, libID seeks closer collaboration with online
platforms through integrations that benefit both platforms and their users.
These integrations will enable users to prove their activity and transact
freely on those platforms, exercising their essential human right to transact.

## In this repository

Besides the protocol specifications under [`specs/`](specs/), this repo
carries the browser claim library and the integration harness:

- [`ts/packages/claim`](ts/packages/claim) — **`@libid/claim`**, the browser
  library for the OAuth handle-claim flows. GitHub (backend-driven MPC-TLS),
  X (in-browser TLSNotary ProxyMode + a Noir/UltraHonk proof), and Google
  (a SNARK over the OIDC id_token). Each flow opens the consent popup,
  proves control of the account, and returns bind-ready proof bytes made
  out to the holder address; encoding/submission/resolution helpers come
  from [`@libid/contracts`](https://www.npmjs.com/package/@libid/contracts).
  Framework-free (no React), wallet-product-free (a unit test enforces it).
- [`ts/apps/demo`](ts/apps/demo) — a buttons-only vite demo consuming the
  library: connect a wallet (or a dev key), claim a handle, resolve it.
- [`harness/`](harness) — the integration harness: a docker-compose stack
  (anvil + deterministic contract deploy + released notary and
  identity-backend images) plus asset staging and one `boot.sh` for a
  real, manual end-to-end claim. See [`harness/README.md`](harness/README.md).

## Repositories

- [`libid`](https://github.com/libid-org/libid) — protocol specifications,
  project overview, the `@libid/claim` browser library, and the
  integration harness.
- [`libid-rs`](https://github.com/libid-org/libid-rs) — Rust application
  backends and zero-knowledge proof tooling.
- [`libid-contracts`](https://github.com/libid-org/libid-contracts) — Solidity
  contracts for EVM-compatible chains.
- [`libid-circuits`](https://github.com/libid-org/libid-circuits) — the Noir
  circuits; releases ship the compiled circuits + verification keys the
  claim flows load.
- [`notary`](https://github.com/libid-org/notary) — the notary service
  (MPC-TLS / ProxyMode verifier + attestation signer).
- [`identity-backend`](https://github.com/libid-org/identity-backend) — the
  GitHub claim backend (OAuth + MPC-TLS proof service).
- [`chain-configurations`](https://github.com/libid-org/chain-configurations)
  — desired-state deployment files and the `libid-deploy` binary.
