# libID common ceremony rules

Status: proposed normative rules shared by every libID identity-platform
ceremony. Companion to the
[platform profiles](libid-platform-ceremonies.md).

The core identity and browser specifications define the claim, platform-flight,
runtime, and persistence records referenced here. They remain separate because
this document owns only ceremony behavior.

This document owns only behavior reused without variation by two or more launch
platforms: ceremony transition/output semantics, OAuth request serialization,
the X/GitHub PKCE construction, and common evidence-time rules. Each platform
profile still owns its exact endpoints, ordered fields, authenticated response
locations, canonical user-ID encoding, metadata clock, and proof-validity
ceiling. The browser protocol owns callback transport, persistence,
continuation, and runtime composition.

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

## Shared PKCE construction

X and GitHub use the same proof-bound S256 construction:

```text
PKCE_V1        = keccak256("webwallet.identity.pkce.v1")
pkceBinding    = abi.encode(PKCE_V1, claimDigest, pkceNonce)
verifierHash   = SHA256(pkceBinding)
code_verifier  = BASE64URL_NOPAD(verifierHash)
code_challenge = BASE64URL_NOPAD(SHA256(ASCII(code_verifier)))
```

`pkceNonce` is fresh private 32-byte browser randomness and a private proof
witness. It is never a platform parameter, public proof output, callback value,
or log field. Both verifier and challenge are exactly 43 unpadded-base64url
characters. The protocol-domain string remains `webwallet.identity.pkce.v1`
for compatibility even though libID now owns the construction.

For the common claim vector and nonce
`0x4444444444444444444444444444444444444444444444444444444444444444`:

```text
PKCE_V1        = 0x656626ac386489f9e8be8d54de2d3fbdc8f925c8e6f907994914a26ef4f74f9c
verifierHash   = 0x516e4b1f33dd678cd2e1f23de454eabd516606c472a6710e5169f14d3c841eb8
code_verifier  = UW5LHzPdZ4zS4fI95FTqvVFmBsRypnEOUWnxTTyEHrg
code_challenge = 1Btn1hoQHVEstJljVDvMXPEMzKA9oRfbBYeuazzsVW8
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
