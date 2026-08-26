# libID

libID is a trust-minimized identity system that bridges identities from
OAuth-enabled platforms to blockchains. Initial integrations include Google,
X, and GitHub, but the system is designed to support any OAuth-based platform.
It currently supports EVM-compatible chains.

The initial integrations were chosen for both product relevance and technical
coverage. Google represents direct OIDC delivery of a signed ID Token; X uses
the authorization-code flow as a public client with S256 PKCE; and GitHub uses
the authorization-code flow as a confidential client with PKCE and a
deployment-owned token exchange. Together they cover most OAuth variability
relevant to libID—signed tokens versus API evidence, fragment versus query
returns, and public versus confidential clients—and demonstrate that secure
identity bridging is feasible across these models.

Identity bridging lets **an existing user handle stand in for an onchain
address**, similar to an onchain naming service.

A central motivation is reach: **a user can transact with anyone who already
has an account on a supported platform, even before the recipient links a
wallet**. Value addressed to that platform identity remains claimable when its
owner proves control of the account and links a wallet.

The core is built bottom-up using a spec-driven approach and includes the tools
needed to make the system accessible, self-hostable, and reusable by
application developers, wallet providers, and other integrators without
introducing a central point of failure.

Beyond identity bridging, libID seeks closer collaboration with online
platforms through integrations that benefit both platforms and their users.
These integrations will **enable users to prove their activity and transact
freely on those platforms**, exercising their essential human right to
transact.

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
  libid-server-rs images) plus asset staging and one `boot.sh` for a
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
- [`libid-server-rs`](https://github.com/libid-org/libid-server-rs) — the
  deployable libID server for GitHub OAuth and MPC-TLS proof generation.
- [`chain-configurations`](https://github.com/libid-org/chain-configurations)
  — desired-state deployment files and the `libid-deploy` binary.
- [`keeper`](https://github.com/libid-org/keeper) — permissionlessly keeps
  authoritative off-chain data, initially Google OIDC signing keys, current
  across configured on-chain deployments.
- [`repository-template`](https://github.com/libid-org/repository-template) —
  shared licensing, contribution, and AI-agent defaults for new repositories.
