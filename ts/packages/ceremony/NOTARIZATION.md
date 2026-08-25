# `@libid/ceremony` notarization architecture

This document defines the browser-side `prover/notarization` module: how it
runs a TLSNotary session, applies platform-selected transcript disclosures, and
returns a byte-exact attestation plus private commitment openings. The enclosing
pipeline is defined in [PROVER.md](PROVER.md), browser placement in
[CCDP.md](CCDP.md), and deployment inputs in [SERVER.md](SERVER.md). Exact
proof semantics remain normative in the
[common ceremony rules](../../../specs/ceremony-common.md) and
[identity-platform ceremonies](../../../specs/platform-ceremonies.md).

## Boundary and rationale

The module is one internal TypeScript adapter over the pinned upstream
TLSNotary JavaScript/WASM client. The browser-side TLSNotary Prover and the
Notary Service's TLSNotary Verifier run MPC-TLS. The adapter owns their browser
transport, disclosure call, reclaimed-channel attestation delivery, and output
correlation. Each closed platform-version module owns its exact HTTP request,
response parser, and revealed transcript ranges.

Keeping platform logic in TypeScript avoids rebuilding a custom WASM facade
for every profile change without creating a security boundary: the prover
origin loads both TypeScript and WASM. The adapter still isolates upstream API
churn from platform code. It ships inside `libid-ceremony-prover.js`; the
separately fetched notarization-client asset is the pinned upstream bundle.

The enclosing prover supplies the deployment's common `notaryAddress` when the
module starts. Applications, ceremony inputs, OAuth responses, and CCDP
messages cannot replace that address or select a provider request, disclosure
layout, or Notary Service behavior.

## Internal contract

```ts
interface ByteRange {
  start: number // inclusive
  end: number   // exclusive
}

interface Reveals {
  sent: readonly ByteRange[]
  received: readonly ByteRange[]
}

interface ExactHttpRequest {
  url: string
  method: 'GET' | 'POST'
  headers: Readonly<Record<string, Uint8Array>>
  body: Uint8Array
}

interface Transcript {
  sent: Uint8Array
  received: Uint8Array
}

interface CommitmentOpening {
  direction: 'sent' | 'received'
  start: number
  end: number
  blinder: Uint8Array
}

interface NotaryAttestation {
  attestedData: Uint8Array
  signature: Uint8Array // exactly 65 bytes
}

interface NotarizeResult {
  transcript: Transcript
  openings: readonly CommitmentOpening[]
  attestation: NotaryAttestation
}

declare function notarize(
  request: ExactHttpRequest,
  selectReveals: (transcript: Transcript) => Reveals,
): Promise<NotarizeResult>
```

This API is internal to the prover. `CommitmentOpening.blinder` is exactly 16
bytes. Header order is not semantic: selection operates on the actual
serialized transcript, while the Platform Verifier checks request framing and
profile-significant fields without requiring relative header position. Request
body bytes remain exact because a platform's form grammar may depend on them.

The transcript exists only long enough for the platform module to parse its
private response and build its witness. It never crosses CCDP or the public
ceremony API. The adapter correlates the raw TLSNotary commitments with the
signed attestation, discards duplicate commitment hashes, and returns only the
range and private blinder for each opening.

## Canonical attested-data decoder

`prover/notarization` owns one read-only decoder for the signed attested-data
bytes. It does not expose an encoder and never reserializes a received record.
The decoder returns this internal view:

```ts
const MAX_ATTESTED_DATA_BYTES = 2 * 1024 * 1024

interface DecodedRevealedRange {
  start: number
  bytes: Uint8Array
}

interface DecodedRangeCommitment {
  start: number
  end: number
  commitment: Uint8Array // exactly 32 bytes
}

interface DecodedDirection {
  revealed: readonly DecodedRevealedRange[]
  commitments: readonly DecodedRangeCommitment[]
}

interface DecodedAttestedData {
  authorityId: Uint8Array // exactly 32 bytes
  createdAt: bigint
  sentTranscriptLength: number
  receivedTranscriptLength: number
  sent: DecodedDirection
  received: DecodedDirection
}

declare function decodeAttestedData(bytes: Uint8Array): DecodedAttestedData
```

The wire is bincode 2.0.1 with fixed-width big-endian integers and fields in
the order shown below. Collection and byte-string lengths are unsigned 64-bit
integers; transcript offsets and lengths are unsigned 32-bit integers.

```text
AttestedData =
  bytes32 authorityId
  u64     createdAt
  u32     sentTranscriptLength
  u32     receivedTranscriptLength
  Direction sent
  Direction received

Direction =
  u64 revealedCount
  RevealedRange[revealedCount]
  u64 commitmentCount
  RangeCommitment[commitmentCount]

RevealedRange = u32 start || u64 byteLength || bytes[byteLength]
RangeCommitment = u32 start || u32 end || bytes32 commitment
```

Before allocating or converting to a JavaScript `number`, the decoder rejects
an input over `MAX_ATTESTED_DATA_BYTES` and bounds every count and length against
the remaining input and signed transcript length. It rejects truncation,
trailing bytes, overflow, empty or unordered ranges, overlaps, out-of-bounds
ranges, malformed commitments, and values that cannot be represented exactly.
`createdAt` stays a `bigint`; every accepted offset and transcript length fits
exactly in a JavaScript `number`.

The decoder is pinned to the rebased `libid-rs` cross-language vector. The
fixture is one complete `AttestedData` record in hexadecimal:

```text
4930142f5283d4a8eab0d24c588f00b21213ae2a47e7ed6c1dc6a57044f1655d0000000069800e800000003c00000028000000000000000200000000000000000000001461616161616161616161616161616161616161610000002800000000000000146262626262626262626262626262626262626262000000000000000100000014000000280707070707070707070707070707070707070707070707070707070707070707000000000000000100000000000000000000000a6363636363636363636300000000000000010000000a000000280909090909090909090909090909090909090909090909090909090909090909
```

Its `keccak256` digest is:

```text
48162f05bdb27b19b3544bf2aae608745861bf357bb31e07f536b6fb50e95936
```

Decoding yields `authorityId = keccak256(UTF8("api.x.com"))` and a `createdAt`
of `1770000000`. Sent and received transcript lengths are 60 and 40. Sent reveals
`[0,20)` and `[40,60)` surround commitment `[20,40)`; received reveal `[0,10)`
precedes commitment `[10,40)`. The revealed bytes are respectively twenty `a`
bytes, twenty `b` bytes, and ten `c` bytes; the two commitments are 32 bytes of
`0x07` and `0x09`. This fixture is copied unchanged from the rebased
[`libid-rs` encoder](https://github.com/libid-org/libid-rs/blob/239a4bb426ac72591fe30006f22660e164a98d96/crates/libid-ceremony/src/attestation.rs).

## Session lifecycle

```mermaid
sequenceDiagram
    participant M as Platform module
    participant T as Notarization Client
    participant W as Browser TLSNotary Prover
    participant N as Notary Service
    participant P as Platform HTTPS server

    M->>T: notarize(request, selectReveals)
    T->>N: Open configured Proxy WebSocket
    T->>W: setup(IoChannel)
    W->>N: MPC-TLS setup messages
    N-->>W: MPC-TLS setup messages
    T->>W: sendRequest(request)
    W->>N: MPC-TLS request messages
    N->>P: Forward encrypted TLS records
    P-->>N: Return encrypted TLS records
    N-->>W: MPC-TLS response messages
    W-->>T: Complete local transcript
    T->>M: selectReveals(transcript)
    M-->>T: Revealed ranges
    T->>W: reveal(ranges and complement commitments)
    W->>N: Reveal proof and commitments
    N-->>W: Accept authenticated partial transcript
    W-->>T: Commitment openings
    T->>W: finish()
    N->>N: finish()
    N-->>T: NotaryAttestation
    T->>T: Correlate signed output and openings
    T-->>M: NotarizeResult
```

`finish()` releases each TLSNotary driver from its side of the original
JavaScript `IoChannel`. Once its verifier finishes, the Notary Service writes
exactly one bounded `NotaryAttestation` on that same channel and closes it; it
reads no application-level request. The verified session already supplies all
signed data, so no ceremony ID, request ID, platform, or token/identity tag
crosses this boundary. A missing response, a second response, trailing bytes,
or a channel that does not close fails.

The adapter is also indifferent to application sequencing. Platform code
retains which call produced each result; the identity request naturally waits
for the token exchange to produce its bearer, although independent TLS setup
may overlap. The final Platform Verifier checks each attestation's exact
authority, method, path, framing, and proof position rather than trusting
browser execution order.

## Disclosure and commitments

The Notary Service does not choose disclosures. After the platform responds,
the platform module selects ascending, non-overlapping revealed ranges from its
local transcript. One adapter helper validates those ranges and commits their
complement over the complete signed transcript length. Every byte is therefore
revealed or committed by construction, with no separately maintained committed
range list that could leave a gap or overlap.

Every committed range uses SHA-256 and a fresh 16-byte blinder. For a bearer:

```text
SHA256(bearer || blinder)
```

The Notary Service learns the range, its blinded commitment, and any revealed
framing, but neither the bearer nor blinder. It signs the verifier-produced
attested data containing the transcript lengths, reveals, commitments,
authority, and evidence time. It receives no caller-supplied identity, handle,
OAuth client, chain, transaction, or extracted bearer.

For X and GitHub, `bearer-link` later proves that one private bearer opens the
token-exchange and identity-request commitments under their independent
blinders. The Platform Verifier reconstructs both public commitments from the
verified attestations; the delivered proof does not copy them.

## Platform call sites

The adapter has exactly three browser call sites at launch:

| Platform operation | Request | Selected disclosure |
|---|---|---|
| X token exchange | `POST /2/oauth2/token` | reveal the profile request and access-token framing; commit the returned bearer |
| X identity request | `GET /2/users/me` | reveal request framing except the bearer and the response's `id` and `username` framing |
| GitHub identity request | `GET /user` | reveal request framing except the bearer and the response's `id` and `login` framing |

X and GitHub reuse the request-side bearer selector. Their response selectors
differ only in platform JSON grammar. X token exchange differs because its
bearer occurs in the response. Exact fields, bounds, and layouts belong to the
selected normative platform version; no caller-defined profile or plugin
exists.

GitHub's confidential token exchange is server-side and does not use this
browser module. Its HTTP contract is defined in
[SERVER.md](SERVER.md#github-token-endpoint), while the GitHub platform module
owns browser-side response validation and subsequent `/user` orchestration.

## Attestation handoff

The adapter preserves `attestedData` and its signature byte-for-byte. It decodes
the required read-only view for bounds and commitment correlation but never
normalizes or re-encodes the signed bytes. Platform proofs place the unchanged
token and identity attestations in their named fields alongside the
`bearer-link` proof. Transcripts, access tokens, blinders, raw TLSNotary objects,
and locally extracted identity fields do not enter the platform proof.

Malformed signed data, range ordering, coverage, commitment correlation,
same-channel framing, cancellation, or a partial result rejects the call.
Authoritative signature and platform-profile acceptance remains the Consumer's
responsibility.

[TEST_PLAN.md](TEST_PLAN.md) owns the executable notarization requirements.
