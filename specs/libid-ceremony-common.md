# libID common ceremony rules

Status: proposed normative rules shared by every libID identity-platform
ceremony. Companion to the
[platform profiles](libid-platform-ceremonies.md).

The core identity and browser specifications define the claim, platform-flight,
runtime, and persistence records referenced here. They remain separate because
this document owns only ceremony behavior.

This document owns only behavior reused without variation by two or more launch
platforms: ceremony transition/output semantics, the claim digest, OAuth
request serialization, the X/GitHub PKCE construction, and common evidence-time
rules. Each platform profile still owns its exact endpoints, ordered fields,
authenticated response locations, canonical user-ID encoding, metadata clock,
and proof-validity ceiling. The browser protocol owns callback transport,
persistence, continuation, and runtime composition.

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

## Claim digest

Every platform ceremony binds the same 32-byte `claimDigest`. It is the single
value that ties an authorization to the address that will hold the name, and it
is the only claim-level input each on-chain verifier recomputes. It is:

```text
DOMAIN      = keccak256("libid.claim")
claimDigest = keccak256(abi.encode(DOMAIN, version, chainId, address))
```

with exactly four inputs and nothing else:

- `DOMAIN` — a fixed 32-byte constant. It is simultaneously the protocol
  separator (no other protocol's digests collide with libID's) and the intent
  (`claim`). A future libID operation is a new domain string, never a new
  digest field.
- `version` — a `uint256` carried in the submission calldata. The Registry
  dispatches on it to the matching verifier generation, and the selected
  verifier binds it back into this recomputation, so a proof presented to the
  wrong generation recomputes a different digest and fails closed. A
  deprecation window can keep an older generation accepting while a newer one
  is live.
- `chainId` — a `uint256`. It is the only replay scope the digest carries: the
  same contract-wallet address on another chain can be a different owner, so
  the chain must be bound.
- `address` — the 20-byte account that will submit the claim and hold the name.
  This is the whole of the front-running defense; every other mechanism exists
  to carry this value from the browser to the chain without a backend rebinding
  it.

No deployment id, intent field, platform id, session key, registry address, or
expiry appears in the digest. Registry identity is decided by the configured
trust root, not by a digest field; platform is decided by the proof's circuit
and trust root; expiry is the authenticated `proofValidUntil` ceiling below.

Removing the session key has a consequence beyond the digest. An earlier design
generated a throwaway session address, carried it inside the notary attestation
and the circuit's public inputs, and had the verifier check that the two agreed
— that was how a proof was made out to someone when the circuit committed no
holder address. `claimDigest` now performs that binding directly, so the
session address leaves the attestation format and the circuit public inputs
entirely, and the generate-and-discard step disappears from the browser.
Implementations must drop it rather than carry it as an unused field.

Each platform carries `claimDigest` in the form its authorization allows:
Google as the OIDC `nonce` ([Google
profile](libid-platform-ceremonies.md#google-oidc-ceremony)); X and GitHub
through the [shared PKCE construction](#shared-pkce-construction). The digest
bytes are identical across all three, and all three verifiers recompute it from
the same four inputs.

For `version = 1`, `chainId = 1`, and
`address = 0x5bb76b0f81f028de363150602cc6d0ca929e3c31`:

```text
DOMAIN      = 0x5dbcc26f8c343151a88e6a31ed1ffc21d48c5d18123023fb73d683cb2ad24cf7
claimDigest = 0xd03372525670a85e4f57a8df060ff33d4dec559d7f001630d96580763785e87c
```

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
PKCE_V1        = keccak256("libid.identity.pkce.v1")
pkceBinding    = abi.encode(PKCE_V1, claimDigest, pkceNonce)
verifierHash   = SHA256(pkceBinding)
code_verifier  = BASE64URL_NOPAD(verifierHash)
code_challenge = BASE64URL_NOPAD(SHA256(ASCII(code_verifier)))
```

`pkceNonce` is fresh private 32-byte browser randomness and a private proof
witness. It is never a platform parameter, public proof output, callback value,
or log field. It keeps `code_verifier` unpredictable, so an intercepted
authorization code is useless to anyone who does not hold the nonce — the
property that matters for X's public client. Both verifier and challenge are
exactly 43 unpadded-base64url characters. The protocol-domain string is
`libid.identity.pkce.v1`: libID owns the construction, and every conformance
vector is regenerated for this domain.

Because the verifier is fully determined by `claimDigest` (public) and
`pkceNonce` (a private witness the prover holds), a proof recomputes it in
circuit and asserts it equals the transcript bytes; `code_verifier` does not
have to be revealed as a distinct public output to be authenticated.

For the common claim vector above and nonce
`0x4444444444444444444444444444444444444444444444444444444444444444`:

```text
PKCE_V1        = 0x8e444e2acbb12cd1aa318b8613d3628d4ce9f16212d44ccf6fd27810c86bd552
verifierHash   = 0xa08b3c0ed31419dc9a5298a5b56efd81555e5d27820210a326ac22aed442f8f2
code_verifier  = oIs8DtMUGdyaUpiltW79gVVeXSeCAhCjJqwirtRC-PI
code_challenge = KR2TpCAJWKnat-QpKH0Ml6Xqs_c832JcUyWmJvUbF_g
```

## Client binding is a proof output

Every ceremony authenticates the OAuth client that issued its evidence, and the
client identifier is a **public proof input the on-chain verifier checks**
against the client it was configured with. It is not a browser-local check.

Without it the ceremony is unbound at the application layer: an attacker runs
the entire flow under an OAuth client it controls, obtains genuine platform
evidence for its own account, and presents a proof that is internally
consistent. The digest binds who may submit; the client binding is what makes
the evidence libID's rather than anyone's.

| Identity platform | Authenticated source of the client id |
|---|---|
| Google | signed ID-token `aud` |
| X | `client_id` in the notarized token-request body |
| GitHub | `client_id` in the notarized token-exchange body |

An earlier draft placed client, audience, and callback-origin checks
deliberately outside Registry binding. That is reversed here for the client
identifier only. Callback origin and frontend origin remain browser-local: they
are transport concerns the digest and client binding already dominate. This is
still not on-chain application admission — a hostile application using its own
legitimate client is covered under [Security
Considerations](libid-platform-ceremonies.md#security-considerations).

## Notarized-transcript extraction

A proof over a TLSNotary transcript authenticates bytes, not fields. Every
extraction from a notarized request or response therefore obeys the following
rules. They exist because a prover that composes the request — the GitHub
exchange service is exactly such a prover — chooses which bytes are disclosed
and which are hidden.

**Verify the whole request; disclose only what the verifier needs.** Minimal
disclosure and minimal verification are different properties. The complete
request is a private witness and is asserted equal to the profile's fixed
template with a bounded hole for each variable value. Only the values listed as
public proof inputs leave the circuit.

**Match a template, never parse.** A field is located by its full delimiter in
the fixed template — `&code_verifier=` … `&`-or-end for a form body, or
`"name": "` … `"` for JSON — never by searching for a bare field name. Each
listed field must occur exactly once in the verified body.

**Constrain every hole.** A hole whose charset is unconstrained can forge a
field boundary. `code_verifier` is `[A-Za-z0-9_-]{43}`, which by construction
contains no `&`, `=`, or `"`. An undisclosed value is still constrained: the
prover holds its bytes and proves the charset without revealing them.

**Pin the constants byte-for-byte.** Endpoint, authority, method, path,
`Content-Type`, and `redirect_uri` are compiled constants asserted literally.
`redirect_uri` in particular is attacker-writable at the platform: GitHub
accepts a registered callback extended with additional path segments or an
injected query string and still issues a token, so any check weaker than byte
equality admits attacker-chosen bytes into the body.

**Pin the encoding.** GitHub accepts a JSON token-exchange body as well as the
documented form encoding, and the two have different anchoring rules. The
verified template fixes `Content-Type: application/x-www-form-urlencoded`; a
body in any other encoding is not the profile and cannot satisfy the proof.

**An undisclosed range is a smuggling channel.** Bytes hidden from disclosure
are still sent to the platform. If a hidden range may contain `&` or `=`, a
prover can place a second `code_verifier` inside it, let the platform honor
that one, and disclose a different value. Two independent rules close this:
hidden values are charset-constrained as above, and any credential range is
ordered **last** in the body so that no field follows it.

## Common evidence-time rules

Every verified timestamp is an integer Unix time in seconds, canonically
decoded as `uint64`. Fractions, negative values, overflow, textual numbers, and
implementation-local receipt time fail. `metadataObservedAt` is exactly the
platform-profile value; it is never inferred from an HTTP `Date` header or the
browser clock.

Expiry is authenticated, not caller-chosen. Each platform verifier derives its
profile's `proofValidUntil` from signed platform time (a token `exp`, or an
attestation timestamp plus a fixed grace) and requires:

```text
block.timestamp < proofValidUntil
```

`proofValidUntil` is a first-invalid timestamp. Registry receives no
caller-supplied validity bound and accepts no ceremony without the
authenticated ceiling. Every addition and comparison is checked before
narrowing to `uint64`.

An earlier draft carried a browser-chosen `claimExpiresAt` in the digest and
required `block.timestamp < claimExpiresAt <= proofValidUntil`. It is removed:
the authenticated ceiling is enforced regardless, so the extra field only let a
browser shorten a window it could not widen — a policy knob, not a security
bound. Dropping it removes a digest input, a Registry re-check, and the
"browser chooses expiry before authorization" step.
