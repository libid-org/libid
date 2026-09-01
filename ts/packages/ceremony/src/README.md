# Preserved, not wired up

**This directory does not compile, is not a package, and is not built, tested
or published.** It has no `package.json`, so `pnpm -r build|test|typecheck`
skips it entirely.

It exists for one reason: these 1,616 lines are the only TypeScript
implementation of the ceremony wire constructions that exists anywhere, and
they were about to be deleted from a contracts pull request where they did not
belong. This is the copy, kept so the work is not lost.

## Where it came from

`libid-org/libid-contracts#13`, `ts/packages/contracts/src/ceremony/`.

They were removed from there because that repository owns the contracts and
the TypeScript wrappers around them — typed ABIs, calldata, the concrete types
a caller needs to invoke a function. These files are none of those. They are
browser runtime protocol code: nothing here calls a contract, and nothing here
is needed in order to call one.

## What is in it

| file | what it implements |
|---|---|
| `authorization.ts` | ceremony-common §5 Authorization Digest, §7 derived PKCE `code_verifier` |
| `attestation.ts` | ceremony-common §9.1 attestation format, plus coverage, bearer-framing and uniqueness checks |
| `profile.ts` | pinned platform profiles and protocol parameters, and the GitHub Token-Exchange Service HTTP contract |
| `*.test.ts` | 686 lines of tests, passing at the commit they were taken from |

## Why it does not compile here

`profile.ts` imports `../identity/handleVectors.js`, which is generated in
libid-contracts from `solidity/contracts/identity/handles.json` and does not
exist in this repository. That import is the only structural break; everything
else is self-contained apart from `viem` and `vitest`.

## What still has to be decided

Nothing here should be taken as settled placement.

- `@libid/ceremony` does not exist yet. Its architecture and module layout are
  specified in #13, which is documentation only and unmerged. When that lands,
  these files should be reorganized to match it rather than kept as they are.
- `profile.ts` mixes two things. The pinned platform constants mirror
  `CeremonyProfile.sol`. The token-exchange half — `TOKEN_EXCHANGE_ROUTE`,
  the size caps, `TokenExchangeRequestV1`/`ResponseV1` and their validators —
  is the HTTP contract of a server, and it currently disagrees with
  `ts/packages/ceremony/SERVER.md` as proposed in #13: that document specifies
  `POST /api/v1/ceremony/github-token` carrying no `schema` member, while
  merged `specs/platform-ceremonies.md` §6.3 fixes
  `/oauth/github/token-exchange` with `schema: 1`. These files implement the
  merged specification. One of the two has to move.
- Cross-implementation agreement is currently a hex string hand-copied into
  three repositories (here, `CeremonyAttestation.t.sol`, and
  `libid-rs/crates/libid-ceremony`). Nothing checks that the three match.
  Generating conformance vectors from one source, the way libid-contracts
  already generates its handle vectors, would make that a guarantee instead of
  a convention.
