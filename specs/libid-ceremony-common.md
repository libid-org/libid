# libID common ceremony rules

Status: proposed normative rules shared by every libID identity-platform
ceremony. Companion to the
[platform profiles](libid-platform-ceremonies.md).

## 1. Scope

This document is the normative owner of the constructions shared by two or
more platform ceremonies: the claim digest, OAuth request serialization, the
PKCE construction, notarized-transcript extraction, client binding, and
evidence-time rules. Each platform profile owns its endpoints, ordered
fields, authenticated response locations, canonical user-ID encoding, and
proof-validity ceiling. The browser protocol owns callback transport,
persistence, continuation, and runtime composition.

## 2. Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

## 3. Terminology

Claim Digest: The 32-byte value binding one authorization to the call data
   that will consume it, constructed as specified in §6.

Call Data: Opaque bytes carried in the Claim Digest and decoded by the
   consuming contract into that operation's expected arguments.

Claim Random: Fresh 32-byte randomness that makes each Claim Digest unique.

Protocol Version: The libID protocol revision a ceremony ran under, fixing its
   digest layout, binding construction, and evidence rules.

Platform Ceremony: The complete operation that turns one platform
   authorization into a locally verified claim.

Identity Platform: Google, X, GitHub, or a future source of authenticated
   identity evidence. "Provider" is reserved for the formal OIDC term and for
   the EIP-1193 wallet provider.

Exchange Service: The confidential-client component that performs a token
   exchange requiring a client secret.

Canonical Runtime: The immutable browser release that constructs claim
   digests, verifies attestations, and builds proofs.

## 4. Assumptions

- ASM-CHAIN-01:
  The Consuming Contract observes an authentic `msg.sender` and a block
  timestamp within tolerance of real time.
- ASM-CHAIN-02:
  Each deployment is reachable under exactly one chain identifier, and that
  identifier is observable on chain.
- ASM-PROV-01:
  An Identity Platform delivers an authorization response only to a redirect
  URI registered against the requesting client.
- ASM-PROV-02:
  An Identity Platform that received a `code_challenge` rejects a token request
  whose `code_verifier` does not match it.
- ASM-PROV-03:
  An Identity Platform binds an authorization code to the account that approved
  it, and accepts that code exactly once.
- ASM-PROV-04:
  A confidential-client Identity Platform rejects a token request that does not
  carry the registered client secret.
- ASM-PROV-05:
  Google signs ID Tokens with a key published at its JWKS endpoint, and
  includes the requested `nonce` verbatim.
- ASM-NOTARY-01:
  The configured notary key signs only transcripts it observed.
- ASM-BROWSER-01:
  The Canonical Runtime executes unmodified, and the user agent enforces the
  same-origin policy over authorization responses.

## 5. Security properties

- SP-BIND-01:
  Evidence produced by a ceremony discharges only for the Call Data committed
  in its Claim Digest. Depends on ASM-PROV-02, ASM-PROV-05, ASM-CHAIN-01.
  Evidence: conformance tests (supporting, not proving) plus the collision
  resistance of SHA-256 and keccak256.
- SP-CLIENT-01:
  Evidence issued to an OAuth client other than the configured one is rejected.
  Depends on ASM-PROV-04, ASM-PROV-05. Evidence: checked invariant in the
  Consuming Contract, plus conformance tests (supporting).
- SP-DELIVERY-01:
  An authorization response reaches only an origin the deployment controls, so
  a site that registered no redirect URI cannot obtain evidence for a ceremony
  it induced. Depends on ASM-PROV-01, ASM-BROWSER-01. Evidence: external audit
  of the registered redirect URI list, plus conformance tests (supporting).
- SP-EXCHANGE-01:
  An attested token exchange redeems the authorization code produced by this
  ceremony and no other. Depends on ASM-PROV-03, ASM-NOTARY-01, ASM-BROWSER-01.
  Evidence: conformance tests (supporting, not proving).
- SP-FRESH-01:
  Evidence older than its authenticated ceiling is rejected. Depends on
  ASM-CHAIN-01, ASM-NOTARY-01, ASM-PROV-05. Evidence: checked invariant in the
  Consuming Contract.
- SP-REPLAY-01:
  One ceremony authorizes at most one authoritative effect. Depends on
  ASM-CHAIN-01, ASM-CHAIN-02. Evidence: checked invariant in the consuming
  contract.

## 6. Claim digest

The Claim Digest is the single value binding one authorization to the
operation that will consume it.

```text
DOMAIN      = keccak256("libid.claim")
claimDigest = keccak256(abi.encode(DOMAIN, version, chainId, claimRandom, callData))
```

- REQ-COMMON-01 (upholds SP-BIND-01):
  The Canonical Runtime MUST construct every Claim Digest as the keccak256 of
  the ABI encoding of exactly `DOMAIN`, `version`, `chainId`, `claimRandom`,
  and `callData`, in that order and with no other input.
- REQ-COMMON-02 (upholds SP-BIND-01):
  The Consuming Contract MUST recompute the Claim Digest from its own `DOMAIN`
  constant, its own `version`, the chain identifier it observes, and the
  `claimRandom` and `callData` supplied in the submission.
- REQ-COMMON-02A (upholds SP-BIND-01):
  The Consuming Contract MUST reject a proof whose Claim Digest public input
  differs from the digest it recomputed.
- REQ-COMMON-03 (upholds SP-BIND-01):
  The Consuming Contract MUST decode `callData` into the argument format of the
  entrypoint being invoked. The Consuming Contract MUST reject call data it
  cannot decode into that exact format.
- REQ-COMMON-04 (upholds SP-REPLAY-01):
  The Canonical Runtime MUST draw `claimRandom` from a cryptographically secure
  random source, freshly for each ceremony.
- REQ-COMMON-05 (upholds SP-REPLAY-01):
  The Consuming Contract MUST record every Claim Digest it accepts.
- REQ-COMMON-05A (upholds SP-REPLAY-01):
  The Consuming Contract MUST reject a Claim Digest it has already recorded.
- REQ-COMMON-06 (upholds SP-BIND-01):
  The Consuming Contract MUST reject a submission whose `version` differs from
  the protocol version that contract implements.

`DOMAIN` is simultaneously the protocol separator and the operation
identifier. A further libID operation takes a new domain string, not a new
digest field.

`version` is the libID protocol version the ceremony ran under: it fixes the
digest layout, the binding construction, and the evidence rules the ceremony
followed. It is bound into the digest so evidence produced under one protocol
version cannot be presented under another, and it is carried in the submission
call data so a registry can route to the deployment implementing it.

`callData` carries the operation's arguments as opaque bytes. A name claim
encodes the holder address; an operation that installs a session key encodes
that key alongside it. The digest layout does not change between operations.

`claimRandom` makes each digest unique, which is what allows the digest
itself to serve as the replay nullifier. No platform identifier and no user
identifier appear in the digest or in the nullifier derived from it.

Conformance vector, for `version = 1`, `chainId = 1`,
`claimRandom = 0x5555…5555`, and `callData = abi.encode(address
0x5bb76b0f81f028de363150602cc6d0ca929e3c31)`:

```text
DOMAIN      = 0x5dbcc26f8c343151a88e6a31ed1ffc21d48c5d18123023fb73d683cb2ad24cf7
callData    = 0x0000000000000000000000005bb76b0f81f028de363150602cc6d0ca929e3c31
claimDigest = 0x0f2c7b78eb48061ef5ee980dbab5d7d80326c6e343e29ad6c8803b7fb46cf8ef
```

Each platform carries the Claim Digest in the form its authorization allows:
Google as the OIDC `nonce`, X and GitHub through the PKCE construction in §8.

## 7. Canonical OAuth serialization

- REQ-COMMON-07:
  The Implementation MUST serialize each listed parameter tuple with the WHATWG
  `application/x-www-form-urlencoded` serializer, taking UTF-8 input, encoding
  space as `+`, and using uppercase hexadecimal percent escapes. Necessity:
  byte-exact request reproduction across implementations, without which a
  notarized transcript cannot be matched against a template.
- REQ-COMMON-08:
  The Implementation MUST emit each field listed in the platform profile
  exactly once, in the listed order. The Implementation MUST emit no other
  field. Necessity: cross-component interoperability of the transcript
  template.
- REQ-COMMON-09 (upholds SP-BIND-01):
  The Implementation MUST NOT accept a caller-supplied parameter into a
  serialized authorization or token request.
- REQ-COMMON-10:
  The Implementation MUST send an authorization request's serialization as the
  endpoint query, and a token request's serialization as the body with media
  type `application/x-www-form-urlencoded`. Necessity: cross-component
  interoperability.
- REQ-COMMON-11 (upholds SP-EXCHANGE-01):
  The Implementation MUST NOT follow a redirect on a notarized request.
- REQ-COMMON-29 (upholds SP-DELIVERY-01):
  The Deployment MUST register with each Identity Platform only redirect URIs
  whose origins it controls.
- REQ-COMMON-30 (upholds SP-DELIVERY-01):
  The Canonical Runtime MUST forward an authorization response only to the
  compiled application origin.
- REQ-COMMON-31 (upholds SP-DELIVERY-01):
  The Canonical Runtime MUST ignore a forwarding target supplied in the
  callback request.

The HTTPS authority, method, path, parameter tuple, and authenticated
request and response values carry proof semantics. Header casing and order do
not, unless a platform profile commits them.

Serializer conformance vector:

```text
ordered tuple:
  label        = A B
  redirect_uri = https://callback.example/oauth/callback
  state        = _-~

serialized:
label=A+B&redirect_uri=https%3A%2F%2Fcallback.example%2Foauth%2Fcallback&state=_-%7E
```

## 8. PKCE construction

X and GitHub bind the Claim Digest through S256 PKCE.

```text
PKCE_V1        = keccak256("libid.identity.pkce.v1")
pkceBinding    = abi.encode(PKCE_V1, claimDigest, pkceNonce)
verifierHash   = SHA256(pkceBinding)
code_verifier  = BASE64URL_NOPAD(verifierHash)
code_challenge = BASE64URL_NOPAD(SHA256(ASCII(code_verifier)))
```

- REQ-COMMON-12 (upholds SP-BIND-01):
  The Canonical Runtime MUST derive `code_verifier` from `PKCE_V1`, the Claim
  Digest, and `pkceNonce` as shown above.
- REQ-COMMON-13 (upholds SP-BIND-01):
  The Canonical Runtime MUST draw `pkceNonce` freshly per authorization attempt
  from a cryptographically secure random source.
- REQ-COMMON-14 (upholds SP-BIND-01):
  The Canonical Runtime MUST NOT emit `pkceNonce` as a platform parameter, a
  public proof output, a callback value, or a log field.
- REQ-COMMON-15 (upholds SP-BIND-01):
  The Proving Circuit MUST recompute `code_verifier` from the public Claim
  Digest and the private `pkceNonce`. The Proving Circuit MUST assert byte
  equality with the verifier in the attested request.

A fresh `pkceNonce` per attempt gives a retry of the same Claim Digest a
distinct verifier. Both verifier and challenge are exactly 43 unpadded
base64url characters.

Conformance vector, for the Claim Digest of §6 and
`pkceNonce = 0x4444444444444444444444444444444444444444444444444444444444444444`:

```text
PKCE_V1        = 0x8e444e2acbb12cd1aa318b8613d3628d4ce9f16212d44ccf6fd27810c86bd552
verifierHash   = 0x99eebca3842581b0bf16b70914482877627e53bb8cc0cf1f4503406dc9b8911f
code_verifier  = me68o4QlgbC_FrcJFEgod2J-U7uMwM8fRQNAbcm4kR8
code_challenge = 3dO6tdOjSBXmevuCoQPdbfiMtI1F1cuV2mXmsb1052s
```

## 9. Client binding

The OAuth client that issued the evidence is a public proof input, and the
consuming contract compares it against the client it was configured with.

| Identity platform | Authenticated source of the client identifier |
|---|---|
| Google | signed ID-Token `aud` |
| X | `client_id` in the notarized token request |
| GitHub | `client_id` in the notarized token exchange |

- REQ-COMMON-16 (upholds SP-CLIENT-01):
  The Proving Circuit MUST expose the authenticated client identifier as a
  public proof input.
- REQ-COMMON-17 (upholds SP-CLIENT-01):
  The Consuming Contract MUST reject a proof whose client identifier differs
  from its configured client.

Callback origin, frontend origin, and application authorization remain
browser-local and produce no on-chain effect.

## 10. Notarized-transcript extraction

A proof over a TLSNotary transcript authenticates bytes, not fields. These
rules apply wherever a party that composes a request also proves over it.

- REQ-COMMON-18 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST take the complete notarized request as a private
  witness. The Proving Circuit MUST assert equality with the profile's
  template, allowing a bounded hole only where the profile lists a variable
  value.
- REQ-COMMON-19 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST locate a field by its full delimiter in the
  template. The Proving Circuit MUST NOT locate a field by searching for a bare
  field name.
- REQ-COMMON-20 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST constrain every variable value to the charset the
  profile states, including values that are never disclosed.
- REQ-COMMON-21 (upholds SP-BIND-01):
  The Proving Circuit MUST assert the endpoint authority, method, path, media
  type, and `redirect_uri` byte for byte against compiled constants.
- REQ-COMMON-22 (upholds SP-EXCHANGE-01):
  The Platform Profile MUST order any undisclosed credential last in the
  request body.

An undisclosed range still reaches the platform. Ordering it last, and
constraining its charset so it cannot contain a field delimiter, prevents a
prover hiding a second copy of a field behind it.

## 11. Evidence time

- REQ-COMMON-23:
  The Implementation MUST decode every verified timestamp as an integer Unix
  time in seconds represented as `uint64`. Necessity: cross-component
  interoperability of authenticated time.
- REQ-COMMON-24 (upholds SP-FRESH-01):
  The Implementation MUST reject a fractional, negative, overflowing, or
  textual timestamp.
- REQ-COMMON-25 (upholds SP-FRESH-01):
  The Implementation MUST take `metadataObservedAt` from the platform-profile
  value. The Implementation MUST NOT infer it from an HTTP `Date` header or a
  local clock.
- REQ-COMMON-26 (upholds SP-FRESH-01):
  The Consuming Contract MUST derive `proofValidUntil` from the profile's
  authenticated platform time. The Consuming Contract MUST reject a submission
  where `block.timestamp >= proofValidUntil`.
- REQ-COMMON-27 (upholds SP-FRESH-01):
  The Consuming Contract MUST NOT accept a caller-supplied validity bound.
- REQ-COMMON-28 (upholds SP-FRESH-01):
  The Implementation MUST perform every timestamp addition and comparison with
  checked arithmetic before narrowing to `uint64`.

## 12. Conformance

Roles: Canonical Runtime, Exchange Service, Proving Circuit, Consuming
Contract. The Implementation claiming a role MUST pass the vectors covering
the constructions that role implements.

- TEST-COMMON-01 (exercises REQ-COMMON-01, REQ-COMMON-02, REQ-COMMON-02A):
  The §6 digest vector reproduces `claimDigest` exactly.
- TEST-COMMON-02 (exercises REQ-COMMON-03):
  Call data that does not decode into the entrypoint's argument format is
  rejected.
- TEST-COMMON-03 (exercises REQ-COMMON-05, REQ-COMMON-05A):
  Resubmitting a recorded Claim Digest is rejected.
- TEST-COMMON-04 (exercises REQ-COMMON-04, REQ-COMMON-06):
  Two ceremonies over identical call data yield distinct digests, and a digest
  carrying a foreign `version` is rejected.
- TEST-COMMON-05 (exercises REQ-COMMON-07, REQ-COMMON-08, REQ-COMMON-10):
  The §7 serializer vector reproduces byte for byte.
- TEST-COMMON-06 (exercises REQ-COMMON-09, REQ-COMMON-11):
  A request carrying an appended caller parameter is rejected, and a redirected
  notarized request is abandoned.
- TEST-COMMON-07 (exercises REQ-COMMON-12, REQ-COMMON-13, REQ-COMMON-15):
  The §8 PKCE vector reproduces `code_verifier` and `code_challenge` exactly.
- TEST-COMMON-08 (exercises REQ-COMMON-14):
  No ceremony artifact, log, or public input contains `pkceNonce`.
  Verification: inspection of the emitted artifacts.
- TEST-COMMON-09 (exercises REQ-COMMON-16, REQ-COMMON-17):
  A proof carrying a client identifier other than the configured one is
  rejected.
- TEST-COMMON-10 (exercises REQ-COMMON-18, REQ-COMMON-19, REQ-COMMON-20, REQ-COMMON-22):
  A transcript carrying a second copy of a templated field, placed inside or
  after an undisclosed range, is rejected.
- TEST-COMMON-11 (exercises REQ-COMMON-21):
  A transcript whose `redirect_uri` carries an appended path segment or query
  string is rejected.
- TEST-COMMON-12 (exercises REQ-COMMON-23, REQ-COMMON-24, REQ-COMMON-25):
  A fractional, negative, overflowing, or textual timestamp is rejected.
- TEST-COMMON-13 (exercises REQ-COMMON-26, REQ-COMMON-27, REQ-COMMON-28):
  A submission at or after `proofValidUntil` is rejected, and a caller-supplied
  validity bound has no effect.
- TEST-COMMON-14 (exercises REQ-COMMON-30, REQ-COMMON-31):
  A callback carrying a forwarding target in its request forwards to the
  compiled application origin instead.
- TEST-COMMON-15 (exercises REQ-COMMON-29):
  Every redirect URI registered against each production client resolves to an
  origin the deployment controls. Verification: audit of the platform client
  configuration.

## 13. Security Considerations

This document enforces SP-BIND-01, SP-CLIENT-01, SP-EXCHANGE-01,
SP-FRESH-01, and SP-REPLAY-01 under the assumptions of §4.

Replay across ceremonies is prevented by `claimRandom` and REQ-COMMON-05.
Replay across chains is prevented by `chainId` in the digest. Replay across
protocol versions is prevented by `version`. The digest binds no registry
address: a proof carrying the same call data cannot be redirected, because
every binding entrypoint requires the proof-bound target to equal the
authenticated caller, so a copied proof creates no authority for its copier.
The Consuming Contract MUST authenticate an equivalent authorization of the
target at any entrypoint that does not authenticate the caller directly.

Client binding rejects evidence issued to another OAuth client, which is what
prevents an application registering its own OAuth client from harvesting
authorizations and claiming the identities behind them. It creates no on-chain
application admission.

Consent-screen phishing remains outside protocol enforcement. A user who
approves a real consent screen presented by a hostile site produces an
authorization the platform delivers only to a registered redirect URI
(ASM-PROV-01), so the hostile site does not receive it. The registered
redirect URI list and the origins on it are therefore trust-bearing
configuration.

Input validation, denial of service, trust-anchor lifecycle, and browser
origin, storage, and credential boundaries are owned by the browser
specification. Per-platform failure behavior, transports, and trust roots are
owned by the [platform profiles](libid-platform-ceremonies.md).

## 14. References

Normative: [RFC2119], [RFC8174], [RFC6749], [RFC7636], [RFC7519], [OIDC].

Informative: [RFC9700].
