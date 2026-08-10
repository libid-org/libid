# libID

libID is a trust-minimized identity system that bridges identities from widely
used platforms—including Google, X, and GitHub—to blockchains. It currently
supports EVM-compatible chains.

Identity bridging lets an existing user handle stand in for an onchain address,
similar to an onchain naming service.

The core protocol is built bottom-up using a spec-driven approach. Beyond the
core, libID will provide the tools needed to make the system accessible,
self-hostable, and reusable by application developers, wallet providers, and
other integrators without introducing a central point of failure.

## Repositories

- [`libid`](https://github.com/libid-org/libid) — protocol specifications and
  project overview.
- [`libid-rs`](https://github.com/libid-org/libid-rs) — Rust application
  backends and zero-knowledge proof tooling.
- [`libid-contracts`](https://github.com/libid-org/libid-contracts) — Solidity
  contracts for EVM-compatible chains.
