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

## Repositories

- [`libid`](https://github.com/libid-org/libid) — protocol specifications and
  project overview.
- [`libid-rs`](https://github.com/libid-org/libid-rs) — Rust application
  backends and zero-knowledge proof tooling.
- [`libid-contracts`](https://github.com/libid-org/libid-contracts) — Solidity
  contracts for EVM-compatible chains.
