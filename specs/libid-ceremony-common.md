# libID common ceremony rules

Status: proposed normative rules shared by every libID identity-platform
ceremony. Companion to the
[platform profiles](libid-platform-ceremonies.md).

The core identity and browser specifications define the claim, platform-flight,
runtime, and persistence records referenced here. They remain separate because
this document owns only ceremony behavior.

This document owns only behavior reused without variation by two or more launch
platforms: ceremony transition/output semantics, OAuth request serialization,
the common ceremony binding and nullifier, X/GitHub PKCE, and common
evidence-time rules. Each platform profile still owns its exact endpoints,
ordered fields, authenticated response locations, canonical user-ID encoding,
metadata clock, and proof-validity ceiling. The browser protocol owns callback
transport, persistence, continuation, and runtime composition.

## Ceremony transition and terminal output

A platform module consumes the immutable `ClaimRequestV1` and
`PlatformFlightV1` from the core identity/browser seam. Its
`start`, `resume`, and platform-named operations return either:

- the next exact `IdentityCeremonyStateV1`, which the owning runtime validates
  and commits through its browser-job compare-and-swap; or
- the single terminal `VerifiedIdentityCeremonyV1`.

The terminal result contains only the action ID, locally verified proof, and
`VerifiedClaimV1`. No platform credential, witness, attestation, resume key,
runtime state, or sidecar display field crosses that boundary. A platform
transition does not commit storage itself and receives no database or generic
finalizer capability.

## Canonical OAuth serialization

Every launch profile lists one exact HTTPS endpoint, HTTP method, and ordered
parameter tuple for each authorization or token request. Implementations
serialize that tuple with the WHATWG `application/x-www-form-urlencoded`
serializer used by `URLSearchParams`: UTF-8 input, space encoded as `+`, and
percent escapes using uppercase hexadecimal. The serialized query or body
contains each listed field exactly once and no other field. The field order in
the platform table is normative.

Authorization requests append that serialization as the endpoint's query.
Token requests send it as the body with exact media type
`application/x-www-form-urlencoded`. A profile may additionally require an
`Accept` header. Redirect following is forbidden for notarized requests.
Header casing and order are not proof semantics unless the platform profile
explicitly commits them; the HTTPS authority, method, path, parameter tuple,
and authenticated request/response values are.

Configured values such as client ID, client secret, and callback URI are
inserted as values before serialization. They are never pre-encoded and no
caller may append a parameter. The callback URI is the exact immutable
`PlatformFlightV1.callbackUri`;
deriving only an origin or path is insufficient.

All implementations reproduce this serializer vector:

```text
ordered tuple:
  label        = A B
  redirect_uri = https://callback.example/oauth/callback
  state        = _-~

serialized:
label=A+B&redirect_uri=https%3A%2F%2Fcallback.example%2Foauth%2Fcallback&state=_-%7E
```

## Shared ceremony binding and PKCE construction

Every platform ceremony starts with one fresh private 32-byte browser value and
derives the same binding and raw nullifier:

```text
CEREMONY_V1            = keccak256("libid.identity.ceremony.v1")
CEREMONY_NULLIFIER_V1  = keccak256("libid.identity.ceremony-nullifier.v1")
ceremonyNonce          = fresh private random bytes32
ceremonyBinding        = keccak256(abi.encode(
  CEREMONY_V1, claimDigest, ceremonyNonce
))
rawCeremonyNullifier   = keccak256(abi.encode(
  CEREMONY_NULLIFIER_V1, ceremonyNonce
))
```

`ceremonyNonce` is stored with the platform flight and is a private proof
witness. It is never a platform parameter, public proof output, callback value,
or log field. Every platform circuit recomputes both outputs from the same
witness and exposes `rawCeremonyNullifier` as a public proof input. This makes a
replay of the same platform credential collide while a fresh ceremony remains
usable.

The configured platform verifier wrapper supplies the canonical `platformId`
and applies the core identity specification's final domain exactly once:

```text
claimNullifier = keccak256(abi.encode(
  CLAIM_NULLIFIER_V1, platformId, rawCeremonyNullifier
))
```

`platformId` is not a circuit input and is never prover-selected. Its wrapper
adds namespace separation at negligible cost; `ceremonyNonce` independently
provides freshness.

Google sends `BASE64URL_NOPAD(ceremonyBinding)` as its signed OIDC `nonce`. X
and GitHub use those same 32 bytes as their proof-bound S256 verifier:

```text
code_verifier  = BASE64URL_NOPAD(ceremonyBinding)
code_challenge = BASE64URL_NOPAD(SHA256(ASCII(code_verifier)))
```

The Google nonce and PKCE verifier are exactly 43 unpadded-base64url characters.
Only X and GitHub add the PKCE challenge step; the underlying ceremony binding
and nullifier are identical across all launch platforms.

For the common claim vector and test-only `ceremonyNonce`
`0x4444444444444444444444444444444444444444444444444444444444444444`:

```text
CEREMONY_V1           = 0x22652ec356722341e1939aad0ec04a6a966a31f150c0ca5b28eee90a4a6e5967
CEREMONY_NULLIFIER_V1 = 0xc9efbeb1e2d360925f53197e623348f554f8bdd12e51341de96983912d1a45cb
ceremonyBinding       = 0x4b570947a252a393a94616ef41e0ea3334b258d5baec041aa6f2dc89501500f8
rawCeremonyNullifier  = 0xb4b91e0da75aba0fd73b5303326dd44ab515f421622ad3c07388c859829d9d4e
Google nonce / verifier = S1cJR6JSo5OpRhbvQeDqMzSyWNW67AQapvLciVAVAPg
code_challenge        = kCeWtpB1xuO6-VAnRjlFNjodS3hJGtvreOvOWwwHPsI
```

## Common evidence-time rules

Every verified timestamp is an integer Unix time in seconds, canonically
decoded as `uint64`. Fractions, negative values, overflow, textual numbers, and
implementation-local receipt time fail. `metadataObservedAt` is exactly the
platform-profile value; it is never inferred from an HTTP `Date` header or the
browser clock.

The browser chooses `claimExpiresAt` before authorization. Each platform
verifier derives its profile's authenticated `proofValidUntil` and requires:

```text
block.timestamp < claimExpiresAt <= proofValidUntil
```

Both bounds are first-invalid timestamps. Registry receives no
caller-supplied `proofValidUntil`, repeats the `claimExpiresAt` check, and
accepts no ceremony without the authenticated ceiling. Browser policy may
shorten but never widen it. Every addition and comparison is checked before
narrowing to `uint64`.
