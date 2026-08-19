# Identity-platform ceremonies

Part of the [libID protocol specification](libid.md).

## 1. Scope

This document is the normative owner of each platform's OAuth profile,
authenticated identity fields, evidence composition, proof-validity ceiling,
exchange service, and platform-specific failure behavior. The
[common ceremony rules](ceremony-common.md) own the Authorization Digest,
serialization, PKCE, transcript extraction, client binding, and evidence
time. The consumer protocol owns transaction dispatch and authorization.
The browser protocol owns browsing contexts, redirect transport, storage,
resume, and runtime handoff.

Google returns a signed OIDC ID Token directly to the redirect fragment. X and
GitHub use the OAuth authorization-code flow and notarized transcripts of
authenticated platform API responses.

Terms are imported from
[common ceremony rules §2](ceremony-common.md#2-terminology).

## 2. Ceremony profiles

Each platform ceremony has an independently versioned immutable profile:
`google/v1`, `x/v1`, `github/v1`. Every profile fixes the exact Platform
Verifier Version carried in its Authorization Digest and submission; launch
profiles use `platformVerifierVersion = 1`.

- REQ-PLAT-01:
  The Canonical Runtime MUST record in the ceremony state the exact profile it
  selected. The Canonical Runtime MUST NOT substitute another profile on
  resume. Necessity: a resumed ceremony that changed profile would produce
  evidence the selected verifier cannot check.
- REQ-PLAT-01A (upholds SP-BIND-01):
  The Verifier Governance Process MUST select an exact proof-verifier
  artifact for every eligible profile and an exact Notary Service for every
  TLSNotary profile. Necessity: a profile name without its
  verifier artifacts does not identify one proof statement.
- REQ-PLAT-02:
  The Canonical Runtime MUST treat a profile as ineligible until the
  application's authenticated profile lists it and the generated deployment
  contains every fixed route it requires. Necessity: cross-component
  interoperability between runtime and deployment.
- REQ-PLAT-03 (upholds SP-CLIENT-01):
  The Canonical Runtime MUST construct the verified claim exclusively from the
  Platform Profile's canonical authenticated source after locally verifying
  the proof. For X and GitHub, the Canonical Runtime MUST parse the exact
  revealed identity-response bytes that the Platform Verifier extracts, using
  the same canonical extraction and normalization rules. The Canonical Runtime
  MUST reject a detached proof output, sidecar value, or caller value that
  supplies or overrides `userId`, handle, or `metadataObservedAt`.

This is a data-source invariant, not a browser-flow requirement. It defines the
claim returned to callers and used by any composition-owned UI; it does not
create a ceremony-owned confirmation page.

### 2.1 Canonical platform user identifiers

| Identity platform | Authenticated source | Canonical `userId` | Mutable handle |
|---|---|---|---|
| Google | signed ID-Token `sub` | its exact 1–255 case-sensitive ASCII bytes | normalized email |
| X | `/2/users/me.data.id` JSON string | canonical nonzero unsigned 64-bit decimal | normalized `username` |
| GitHub | `/user.id` JSON integer token | canonical nonzero unsigned 64-bit decimal | normalized `login` |

- REQ-PLAT-04:
  The Implementation MUST accept a Google `sub` of bytes `0x20` through `0x7e`
  only. The Implementation MUST reject empty, control, non-ASCII, and
  over-255-byte values. Necessity: identity compatibility across
  implementations.
- REQ-PLAT-05:
  The Implementation MUST NOT trim or case-convert a Google `sub`. Necessity:
  identity compatibility.
- REQ-PLAT-06:
  The Implementation MUST require an X or GitHub identifier to match
  `^[1-9][0-9]{0,19}$` with a numeric value at most `2^64 - 1`. Necessity:
  identity compatibility.
- REQ-PLAT-07:
  The Implementation MUST copy the GitHub raw JSON number token's decimal bytes
  as the string. The Implementation MUST NOT parse it through a floating-point
  number, accept exponent notation, or round it. Necessity: identity
  compatibility.
- REQ-PLAT-08:
  The Implementation MUST reject a quoted GitHub identifier, a numeric X
  identifier, a leading zero, a sign, a fraction, an exponent, and any
  normalization of a Google `sub`. Necessity: identity compatibility.

Conformance vectors:

| Platform | Authenticated input | `userId` |
|---|---|---|
| Google | `sub: "123456789012345678901"` | `123456789012345678901` |
| X | `"id":"2244994945"` | `2244994945` |
| GitHub | `"id":1` | `1` |

Email, audience, client identifier, X username, and GitHub login never
replace the immutable `userId`.

### 2.1a Handle normalization

Proof layers work with raw bytes; normalization is a consumption-time
derivation, layered strictly:

- REQ-PLAT-08A (upholds SP-BIND-01):
  The Proving Circuit and the Notary Service MUST NOT case-fold, trim, or
  otherwise transform identity bytes. The Consumer MUST receive the handle as
  the raw authenticated bytes of its platform source.
- REQ-PLAT-08B (upholds SP-BIND-01):
  The Consumer MUST derive the normalized handle from the
  proof-verified raw bytes on its own write path. The Consumer MUST
  NOT accept a caller-supplied normalized handle or pre-hashed handle key.
  Necessity: the handle arrives inside a proof; a caller supplying the
  derived key could name any handle it liked.
- REQ-PLAT-08C:
  A browser-side normalization exists only for display and local checks. No
  proof statement or Consumer behavior may rely on it. Necessity: a check
  running in software the prover chooses whether to run is not a defense.

Normalization applies these per-platform criteria: ASCII-only input with
disallowed bytes rejected; lowercasing; Google validates the value as an
email address and keeps its `@`; X and GitHub strip one leading `@`;
underscore is allowed on X and not on GitHub; hyphen is allowed on GitHub and
not on X, and never leading, trailing, or doubled; a per-platform maximum
length; an empty result is rejected. The exact byte-level algorithm is fixed
by the shared cross-language handle vector table this profile publishes
alongside the specification, which every implementation reproduces; that
table, not this prose, is the precision anchor. A profile that publishes no
such table is ineligible.

- TEST-PLAT-20 (exercises REQ-PLAT-08A, REQ-PLAT-08B, REQ-PLAT-08C):
  Every implementation reproduces the shared handle vector table byte for
  byte; a caller-supplied normalized handle or pre-hashed key is rejected;
  and identity bytes transformed anywhere before Consumer-side derivation
  fail conformance.

### 2.2 Metadata ordering and validity ceilings

Proof validity and mutable-metadata ordering use the authenticated times below.

| Identity platform | `metadataObservedAt` | `proofValidUntil` |
|---|---|---|
| Google | signed ID-Token `exp` | signed ID-Token `exp` |
| X | the token attestation's signed creation time | `metadataObservedAt + proofLifetime[x]` |
| GitHub | the token-exchange attestation's signed creation time | `metadataObservedAt + proofLifetime[github]` |

For X and GitHub, "timestamp" is the signed TLSNotary attestation creation
time. The token attestation is the one-time PKCE and Authorization Digest
binding, so it alone supplies evidence time: one signed timestamp anchors both metadata
ordering and proof validity, exactly as Google's single signed `exp` does.
The identity attestation opens the same bearer and carries the identity
fields; its own creation time is not an evidence-time input and does not
refresh the authorization. The named lifetimes are current
[protocol parameters](libid.md#protocol-parameters).

Google's signed `exp` already supplies the accepted one-hour ordering and
validity value. A Google proof also requires its signing modulus to remain in
the Platform Verifier's active set. The Authorization Digest carries no expiration.
`metadataObservedAt` is the monotone metadata watermark of common
REQ-COMMON-25A. Older evidence cannot regress stored metadata and does not
block an otherwise valid authority operation.

- REQ-PLAT-09 (upholds SP-FRESH-01):
  The Platform Verifier MUST reject an X or GitHub attestation timestamp more than
  `maxFutureAttestationSkew` ahead of Block Time.
- REQ-PLAT-09A (upholds SP-FRESH-01):
  The Platform Verifier MUST derive `metadataObservedAt` and
  `proofValidUntil` from the exact sources in the table above and from
  nothing else.

## 3. Google OIDC ceremony

Google uses direct authentication-only OIDC. The ceremony has no token
exchange, client secret, PKCE, token-exchange service, or server-side state.
Identity evidence is the signed ID Token delivered in the redirect fragment.

### 3.1 Authorization request

`GET https://accounts.google.com/o/oauth2/v2/auth`, serialized per
[common §6](ceremony-common.md#6-canonical-oauth-serialization):

| Order | Field | Exact value |
|---|---|---|
| 1 | `response_type` | `id_token` |
| 2 | `response_mode` | `fragment` |
| 3 | `client_id` | configured client identifier |
| 4 | `redirect_uri` | immutable redirect URI |
| 5 | `scope` | `openid email` |
| 6 | `state` | immutable one-use OAuth state |
| 7 | `nonce` | `BASE64URL_NOPAD(authorizationDigest)` |

The authorization request is plain browser navigation and is never
notarized; no proof semantics attach to any field above. The table is
operational guidance for obtaining a token whose signed claims satisfy
§3.2–§3.3. The signed ID Token is the only Google evidence.

- REQ-PLAT-10 (upholds SP-BIND-01):
  The Canonical Runtime MUST set `nonce` to the base64url encoding of the 32
  Authorization Digest bytes, not to hexadecimal text.
- REQ-PLAT-11 (upholds SP-DELIVERY-01):
  The Canonical Runtime MUST request only `response_type=id_token` with
  `response_mode=fragment`. The Canonical Runtime MUST NOT request an
  authorization code or access token. Necessity: the signed identity evidence
  reaches the local redirect runtime without introducing a confidential
  backend or bearer capability.
- REQ-PLAT-12 (upholds SP-DELIVERY-01):
  The Redirect Runtime MUST copy the bounded fragment into memory, clear the
  fragment before storage or network access, and require exactly one `state`
  plus exactly one `id_token` XOR `error`. The Redirect Runtime MUST reject
  duplicate, additional authoritative, mixed, or malformed fields. The Redirect
  Runtime MUST scrub ignored diagnostic fields.
- REQ-PLAT-13 (upholds SP-DELIVERY-01):
  The Canonical Runtime MUST match `state` to exactly one live local ceremony
  and consume it once before accepting the ID Token. No server-side state or
  prepare request participates in this lookup.

Conformance vector, for the Authorization Digest of
[common §5](ceremony-common.md#5-authorization-digest):

```text
authorizationDigest = 0xb318fb559e16a179b853ed2853576cda16032d93b0839bb81a55135d334c0af5
Google nonce         = sxj7VZ4WoXm4U-0oU1ds2hYDLZOwg5u4GlUTXTNMCvU
```

### 3.2 Local token verification

- REQ-PLAT-14 (upholds SP-BIND-01):
  The Canonical Runtime MUST reject an ID Token whose `nonce` differs from the
  Authorization Digest it constructed.
- REQ-PLAT-15:
  The Redirect Runtime MUST reject a Google response carrying `code` or
  `access_token`. Necessity: neither artifact belongs to this
  authentication-only profile.

### 3.3 Proof statement

The Proving Circuit and Consumer enforce all of the following:

- REQ-PLAT-16 (upholds SP-CLIENT-01):
  The Proving Circuit MUST hash the exact ASCII
  `BASE64URL_NOPAD(header) || "." || BASE64URL_NOPAD(payload)` bytes with
  SHA-256. The Proving Circuit MUST verify the signature as
  RSASSA-PKCS1-v1_5 under the exact RSA modulus `n` and the profile-fixed
  exponent `e = 65537`. The Proving Circuit MUST decode the claims checked
  below from that signed payload, not from a detached copy.

The profile fixes RS256; the circuit performs no algorithm dispatch and does
not parse the protected header. A token signed under any other algorithm or
key simply fails the fixed verification relation. Algorithm-confusion attacks
require a verifier that dispatches on the header `alg`; none exists here.

- REQ-PLAT-16A (upholds SP-CLIENT-01):
  The Proving Circuit MUST expose the exact RSA modulus used for REQ-PLAT-16
  as a public proof input, in the limb encoding its verifier artifact fixes.
  The Proving Circuit MUST NOT decide trusted-set membership or take the active
  set as an input. The Platform Verifier alone checks the modulus under
  REQ-PLAT-23. JWK decoding and canonical-encoding validation happen where a
  modulus is admitted to the trusted set, per REQ-PLAT-24; the JWK encoding
  appears in no signed artifact, so proving it would add nothing.
- REQ-PLAT-16B (upholds SP-BIND-01, SP-CLIENT-01, SP-FRESH-01):
  The Proving Circuit MUST expose exactly the following Google public inputs,
  each derived from the signed payload or verified signing key:

  | Public input | Authenticated source |
  |---|---|
  | Authorization Digest | signed `nonce`, decoded as exactly 32 bytes |
  | client-identifier digest | `SHA256` of the signed `aud` |
  | canonical `userId` | signed `sub` |
  | raw `email` bytes | signed `email`; the Consumer derives the normalized handle |
  | evidence timestamp | signed `exp`; used for both `metadataObservedAt` and `proofValidUntil` |
  | RSA modulus | exact `n` that verified the JWS; `e = 65537` is profile-fixed |

  The Proving Circuit MUST NOT expose a detached second representation of a
  claim. Proofs are over raw bytes; normalization, such as lowercasing the
  handle, is the Consumer's decision at consumption time.
- REQ-PLAT-17 (upholds SP-BIND-01):
  The Proving Circuit MUST prove the signed `iss` equals
  `https://accounts.google.com`.
- REQ-PLAT-18 (upholds SP-BIND-01):
  The Proving Circuit MUST prove `nonce` equals the Authorization Digest.
- REQ-PLAT-19 (upholds SP-CLIENT-01):
  The Proving Circuit MUST expose `SHA256` of the signed `aud` as the
  client-binding public input.
- REQ-PLAT-19A (upholds SP-CLIENT-01):
  The Platform Verifier MUST require `SHA256` of the `aud` bytes carried in
  the submission to equal that public input. The Platform Verifier MUST return those bytes
  as the client identifier of common REQ-COMMON-16. Necessity: the digest authenticates the
  bytes without the circuit packing a variable-length string into public
  inputs, and the Consumer still receives the readable value. Admission stays
  permissionless per common REQ-COMMON-17C.
- REQ-PLAT-20:
  The Proving Circuit MUST prove `email_verified` is the boolean `true`.
  Necessity: an unverified email would let one account assert another party's
  address as its handle.
- REQ-PLAT-21 (upholds SP-BIND-01):
  The prover supplies the offset of each checked claim as a private input.
  The Proving Circuit MUST check the string claims `iss`, `sub`, `aud`,
  `nonce`, and `email` under common REQ-COMMON-19 and REQ-COMMON-19B. The
  Proving Circuit MUST check `exp` as a canonical unsigned JSON integer bounded
  by an unsigned 64-bit integer, and `email_verified` as the exact unquoted
  JSON boolean `true`,
  under common REQ-COMMON-19D.
  Duplicate-free top-level structure is the issuer's behavior under
  ASM-PROV-06; the circuit performs no search and no duplicate scan.
- REQ-PLAT-22 (upholds SP-FRESH-01):
  The Platform Verifier MUST reject a proof whose signed `exp` places
  `proofValidUntil` at or before Block Time.

The signing key is fetched from Google's JWKS endpoint as witness input.

- REQ-PLAT-23 (upholds SP-CLIENT-01):
  The Platform Verifier MUST reject a proof whose RSA modulus is absent from
  the Platform Verifier's active trusted Google modulus set.
- REQ-PLAT-24:
  The Verifier Governance Process MUST add a newly published Google signing
  modulus to the trusted set before Google signs with it in production.
  Necessity: Google rotates signing keys on the order of weekly, so every
  Google ceremony fails closed while an active modulus is untrusted.

## 4. Browser TLSNotary launch transport

Launch fixes X's `/2/oauth2/token` and `/2/users/me` sessions and GitHub's
`/user` session to the Proxy profile.

| Property | Proxy profile | Browser MPC profile |
|---|---|---|
| Platform connection | notary connects to the pinned platform endpoint | deployment module supplies an encrypted WebSocket-to-TCP bridge |
| Platform sees | notary egress | application redirect-origin egress |
| Deployment sees OAuth plaintext | no | no |
| Soundness | notary-to-platform path must not be adversarial | survives an adversarial byte bridge |
| Cost | lower bandwidth, latency, rounds | higher browser and deployment cost |

- REQ-PLAT-25 (upholds SP-EXCHANGE-01):
  The Implementation MUST discard every partial transcript and TLS state before
  retrying a notarized request.
- REQ-PLAT-26 (upholds SP-EXCHANGE-01):
  The Implementation MUST NOT use application-controlled platform egress in the
  launch profile, because the prover holds the session keys and
  prover-egress collusion could inject authenticated server-direction records.
- REQ-PLAT-27 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST NOT let an application, user, request, browser
  probe, failure, or retry select Browser MPC or switch transport within a
  launch ceremony.
- REQ-PLAT-28 (upholds SP-DELIVERY-01):
  The Redirect Runtime MUST require the X or GitHub authorization redirect to
  carry exactly one `code` and exactly one `state`, or exactly one `error`.
  The Redirect Runtime MUST reject duplicate, mixed, additional
  authoritative, and malformed fields. The single accepted `code` is the code
  consumed at redirect ingress that REQ-PLAT-29 and REQ-PLAT-46 compare
  against.
- REQ-PLAT-28A (upholds SP-DELIVERY-01):
  The Canonical Runtime MUST match the redirect's `state` to exactly one live
  local ceremony and consume it once before starting the token request. No
  server-side state or prepare request participates in this lookup.
  Necessity: the redirect is the only point where the ceremony that requested
  the authorization can still be identified.

Browser MPC is a deferred protocol alternative. It may remove the
notary-to-platform path assumption and notary egress exposure, but it requires
qualification of browser bandwidth, latency, memory, battery,
WebSocket-to-TCP bridging, and mobile suspension. Adopting it requires a new
ceremony profile whenever it changes the verifier, artifacts, or security
assumptions; it is not deployment configuration under `x/v1` or `github/v1`.

## 5. X ceremony

X uses a public client with S256 PKCE and two browser-owned TLSNotary
sessions.

### 5.1 Authorization request

`GET https://x.com/i/oauth2/authorize`:

| Order | Field | Exact value |
|---|---|---|
| 1 | `response_type` | `code` |
| 2 | `client_id` | configured client identifier |
| 3 | `redirect_uri` | immutable redirect URI |
| 4 | `scope` | `tweet.read users.read` |
| 5 | `state` | immutable one-use OAuth state |
| 6 | `code_challenge` | PKCE challenge per common §7 |
| 7 | `code_challenge_method` | `S256` |

### 5.2 Token request

`POST https://api.x.com/2/oauth2/token`, media type
`application/x-www-form-urlencoded`, `Accept: application/json`:

| Order | Field | Exact value |
|---|---|---|
| 1 | `grant_type` | `authorization_code` |
| 2 | `client_id` | configured client identifier |
| 3 | `code` | consumed redirect code |
| 4 | `redirect_uri` | immutable redirect URI |
| 5 | `code_verifier` | PKCE verifier per common §7 |

- REQ-PLAT-29 (upholds SP-EXCHANGE-01):
  The Implementation MUST reveal the token request's `code` range. The
  Canonical Runtime MUST require that revealed code to equal the code consumed
  at redirect ingress, byte for byte.
- REQ-PLAT-30 (upholds SP-BIND-01):
  The Proving Circuit MUST constrain the opened bearer range to nonempty
  printable ASCII of at most 4096 bytes. The carriage-return and line-feed
  exclusion of common REQ-COMMON-37 applies to this range, because the
  identity session sends it inside a header. Necessity: the range is opened
  to link two attestations, so it needs a bound and a charset; the circuit
  verifies no other property of the token response.

Per common §9, the token session reveals exactly these ranges; every other
byte stays behind a charset-constrained range commitment of the pinned
attestation format:

| Range | Revealed | Why |
|---|---|---|
| endpoint authority, method, path | yes | the Platform Verifier compares them with its profile constants |
| `grant_type` | yes | constant `authorization_code`; revealed for runtime/profile inspection |
| `client_id` | yes | the Platform Verifier reads and returns it |
| `code` | yes | compared to the code consumed at redirect ingress |
| `redirect_uri` | yes | the Canonical Runtime compares its immutable profile; no chain or circuit value |
| `code_verifier` | yes | the Platform Verifier recomputes it from the digest and `pkceNonce` per common REQ-COMMON-15A |
| attestation timestamp | yes | derives the authenticated validity ceiling |
| bearer range | committed | a blinded commitment, opened only in circuit |
| everything else | no | headers, `scope`, `token_type`, other response fields |

Those reveals and the in-circuit `code_verifier` opening of REQ-COMMON-15
reduce the hidden request surface, but revealing a range does not reject a form
delimiter inside it. `x/v1` therefore retains ASM-PROV-07 as a soundness
dependency.

- REQ-PLAT-29A (upholds SP-CLIENT-01):
  The Implementation MUST reveal the `client_id` range of the token request in
  the notarized session.
- REQ-PLAT-29B (upholds SP-CLIENT-01):
  The Platform Verifier MUST read the client identifier from that revealed
  range and return its exact bytes. The Proving Circuit MUST NOT expose a
  client identifier public input. Necessity: the attestation already
  authenticates those bytes, so a circuit copy would be a second
  representation of one fact.
- REQ-PLAT-29C (upholds SP-EXCHANGE-01):
  The Implementation MUST reveal the token request's `grant_type` and
  `redirect_uri` ranges in the notarized session, including in the
  attestation the Platform Verifier checks. The Canonical Runtime MUST
  reject a transcript whose revealed `grant_type` or `redirect_uri` differs
  from its immutable deployment profile. Neither value is a circuit
  constraint, a public proof input, or a value the Consumer reads. Revealing
  them narrows the body a prover can compose without being observed; it does
  not by itself exclude a duplicate field, which remains ASM-PROV-07. The
  Platform Verifier enforces the disclosure: an attestation hiding either
  range does not match the profile layout of common REQ-COMMON-17A and
  REQ-COMMON-18A and fails verification.
- REQ-PLAT-30A (upholds SP-EXCHANGE-01):
  The Implementation MUST commit the returned `access_token` range of the
  notarized token session as the attestation format's blinded hash
  commitment. The Implementation MUST keep the plaintext token bytes
  redacted.

### 5.3 Identity request

`GET https://api.x.com/2/users/me` with no query. The request carries
exactly four headers, in this order: `authorization: Bearer <access_token>`,
`accept: application/json`, `host: api.x.com`, and `connection: close`.

Per common §9, the identity session reveals exactly these request ranges;
the bearer value is the only committed request range, and every other
request byte is revealed:

| Range | Revealed | Why |
|---|---|---|
| request line and all request headers, except the bearer value | yes | the Platform Verifier runs the line-anchored uniqueness scan of common REQ-COMMON-39 over these bytes and frames the committed range per common REQ-COMMON-40 |
| bearer value of the `authorization` header | committed | a blinded commitment, opened only in circuit |

The two ranges account for the request's signed transcript length exactly,
with no gap and no overlap, per common REQ-COMMON-35 and REQ-COMMON-36, so
the request leaves no byte undisclosed and uncommitted.

- REQ-PLAT-31 (upholds SP-BIND-01):
  The Platform Verifier MUST extract `id` and `username` from the revealed
  response bytes by their full `"field":"` delimiters, rejecting a transcript
  in which either delimiter matches at more than one position, per common
  REQ-COMMON-19A. Necessity: the response carries account-holder-influenced
  text, such as the display name, that can embed a lookalike field.
- REQ-PLAT-31A (upholds SP-BIND-01):
  The Canonical Runtime MUST derive the X `userId` and normalized handle from
  those same revealed `id` and `username` bytes. The Proving Circuit
  MUST NOT expose a second independently supplied representation of either
  identity field.
- REQ-PLAT-32 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST assert the same bearer commitment across the token
  transcript and the identity transcript.
- REQ-PLAT-32A (upholds SP-EXCHANGE-01):
  The Implementation MUST commit the `Authorization` bearer range of the
  notarized identity session as the attestation format's blinded hash
  commitment. The Implementation MUST keep the plaintext token bytes
  redacted. Necessity: each notarized session carries its own blinder, so the
  same bearer commits to two different values. Nothing outside a proof can
  tell that they open to one bearer, which is the reason a circuit exists at
  all.

- REQ-PLAT-32B (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST expose exactly these two X public inputs:

  | Public input | Meaning |
  |---|---|
  | token bearer commitment | the commitment the Platform Verifier matches against the verified token attestation |
  | identity bearer commitment | the commitment the Platform Verifier matches against the verified `/users/me` attestation |

  The Proving Circuit MUST keep the bearer private. The Proving Circuit MUST
  NOT add an Authorization Digest, client identifier, timestamp, endpoint,
  `userId`, or handle public input.
- REQ-PLAT-32C (upholds SP-EXCHANGE-01):
  The Platform Verifier MUST require each bearer commitment public input to
  equal the
  corresponding commitment in the attestation it verified. Necessity: without
  this the circuit could prove a link between two attestations other than the
  ones submitted.

The circuit proves exactly one thing: one hidden bearer opens both
attestations' blinded commitments. Everything else is checked where it can be
seen — the Platform Verifier binds the Authorization Digest by recomputing
the verifier under common REQ-COMMON-15A, and reads the client identifier,
evidence timestamp, endpoint triples and identity fields from revealed
attestation bytes. The circuit carries no copy of any of them, because a fact
that can be checked in the open does not belong in a proof.

- REQ-PLAT-33 (upholds SP-FRESH-01):
  The Canonical Runtime MUST complete the token request within X's
  authorization-code deadline of 30 seconds. The Canonical Runtime MUST abandon
  the ceremony otherwise.

## 6. GitHub ceremony

GitHub uses a confidential client, a deployment-owned token-exchange
TLSNotary session, and a browser-owned `/user` TLSNotary session. The
structure matches X exactly: two attestations, both verified by the Notary
Service, one
hidden bearer linking them, and one proof binding that link to the
Authorization Digest. The exchange runs server-side because the client is
confidential, which makes the Token-Exchange Service the notarized party for
that session. It produces an attestation, not a proof.

### 6.1 Authorization request

`GET https://github.com/login/oauth/authorize`:

| Order | Field | Exact value |
|---|---|---|
| 1 | `client_id` | configured client identifier |
| 2 | `redirect_uri` | immutable redirect URI |
| 3 | `scope` | `read:user` |
| 4 | `state` | immutable one-use OAuth state |
| 5 | `code_challenge` | PKCE challenge per common §7 |
| 6 | `code_challenge_method` | `S256` |

- REQ-PLAT-34:
  The Canonical Runtime MUST request exactly `read:user`. Necessity: GitHub
  inherits previously granted scopes for the same OAuth application, so an
  omitted scope does not yield a known grant.

### 6.2 Token exchange

`POST https://github.com/login/oauth/access_token`, media type
`application/x-www-form-urlencoded`, `Accept: application/json`:

| Order | Field | Exact value |
|---|---|---|
| 1 | `client_id` | configured client identifier |
| 2 | `code` | consumed redirect code |
| 3 | `redirect_uri` | immutable redirect URI |
| 4 | `code_verifier` | PKCE verifier per common §7 |
| 5 | `client_secret` | compiled deployment secret; redacted, never revealed |

`client_secret` is ordered last per REQ-COMMON-22. It stays in the body
rather than an `Authorization: Basic` header because Basic encodes the client
identifier and the secret into one redacted value, which would make the
revealed `client_id` something other than the credential GitHub authenticated.

- REQ-PLAT-35 (upholds SP-EXCHANGE-01):
  The Deployment MUST configure a client secret containing neither `&` nor
  `=`. Necessity: the secret is redacted and no party proves its contents, so
  a secret carrying a form delimiter would make the deployment's own request
  decode as more fields than it lists. Verification: inspection of the
  configured credential.
- REQ-PLAT-35A (upholds SP-CLIENT-01):
  The Proving Circuit MUST NOT expose `client_secret`, or any value derived
  from it, as a public proof input.
- REQ-PLAT-35B (upholds SP-CLIENT-01):
  The Implementation MUST reveal the `client_id` range of the exchange request
  in the notarized session.
- REQ-PLAT-35C (upholds SP-CLIENT-01):
  The Platform Verifier MUST read the client identifier from that revealed
  range and return its exact bytes. The Proving Circuit MUST NOT expose a
  client identifier public input. Necessity: the attestation already
  authenticates those bytes, so a circuit copy would be a second
  representation of one fact.
- REQ-PLAT-36 (upholds SP-BIND-01):
  The Proving Circuit MUST constrain the opened bearer range to nonempty
  printable ASCII of at most 4096 bytes. The Proving Circuit MUST verify no
  other property of the exchange response. The carriage-return and
  line-feed exclusion of common REQ-COMMON-37 applies to this range,
  because the `/user` session sends it inside a header. Necessity:
  `token_type` and the granted `scope` are response schema, and nothing on
  the Consumer Chain acts on them; the Canonical Runtime MAY check them
  locally.

### 6.3 Token-exchange service

The Deployment exposes one stateless Token-Exchange Service at the fixed
`/oauth/github/token-exchange` route on the redirect origin.

```ts
interface TokenExchangeRequestV1 {
  schema: 1
  code: string
  codeVerifier: string
}

interface TokenExchangeResponseV1 {
  schema: 1
  accessToken: string
  tokenAttestation: string // canonical unpadded base64url
}
```

- REQ-PLAT-37:
  The Implementation MUST reject a `code` that is empty, carries whitespace or
  control characters, is not printable ASCII, or exceeds `MAX_GITHUB_CODE_BYTES
  = 1024`. Necessity: bounded parsing.
- REQ-PLAT-38:
  The Implementation MUST require `codeVerifier` to match `[A-Za-z0-9_-]{43}`.
  Necessity: cross-component interoperability with the PKCE construction.
- REQ-PLAT-39:
  The Implementation MUST reject an `accessToken` exceeding
  `MAX_GITHUB_ACCESS_TOKEN_BYTES = 4096`, a decoded token attestation exceeding
  `MAX_GITHUB_TOKEN_ATTESTATION_BYTES = 2 MiB`, and a response body exceeding
  `MAX_GITHUB_TOKEN_EXCHANGE_RESPONSE_BYTES = 3 MiB`. Necessity: bounded parsing.
- REQ-PLAT-40:
  The Implementation MUST reject duplicate, missing, additional, differently
  typed, and malformed fields on both interfaces. Necessity: cross-component
  interoperability.
- REQ-PLAT-41 (upholds SP-EXCHANGE-01):
  The Token-Exchange Service MUST use only its compiled client identifier, client
  secret, redirect URI, token endpoint, and notary configuration. The
  Token-Exchange Service MUST NOT accept a caller-selected action, job, client,
  redirect, endpoint, return URL, or operation.
- REQ-PLAT-42:
  The Token-Exchange Service MUST persist no code, verifier, bearer, proof,
  result, or progress state. The Token-Exchange Service MUST expose no polling or
  result route. Necessity: the service holds ceremony credentials, so retention
  creates a compromise target with no protocol purpose.
- REQ-PLAT-43:
  The Token-Exchange Service MUST accept only the compiled redirect-runtime origin.
  Necessity: limits accidental browser disclosure; it is not caller
  authentication.
- REQ-PLAT-43A:
  The Token-Exchange Service MUST answer the CORS preflight for that origin.
  Necessity: cross-component interoperability with the Canonical Runtime.
- REQ-PLAT-43B:
  The Token-Exchange Service MUST reject redirects. Necessity: a followed redirect
  would notarize a session other than the pinned token endpoint.
- REQ-PLAT-43C:
  The Token-Exchange Service MUST emit `Cache-Control: no-store`. Necessity: the
  response carries a bearer token.

### 6.4 Disclosure and verification

The Token-Exchange Service, which holds the client secret, runs the exchange
inside a notarized TLS session and returns the resulting attestation. The
`client_secret` range stays redacted behind that attestation's range
commitment, so the browser never receives the secret. The attestation is
verified under the pinned `github/v1` Notary Service, exactly
as the `/user` attestation is.

The token-exchange attestation reveals exactly the ranges needed to bind it to
the local ceremony and to the later `/user` attestation. The separately
returned `accessToken` is the only additional response value.

| Range | Revealed | Why |
|---|---|---|
| `client_id` | yes | the Platform Verifier reads and returns it; the runtime checks its profile |
| `code` | yes | the Canonical Runtime compares it to the code it consumed |
| `redirect_uri` | yes | the Canonical Runtime compares its immutable profile |
| `code_verifier` | yes | the Platform Verifier recomputes it from the digest and `pkceNonce` per common REQ-COMMON-15A |
| bearer range | committed | a blinded commitment, opened only in circuit to link this attestation to `/user` |
| attestation timestamp | yes | derives the authenticated validity ceiling |
| token endpoint authority | yes | the Platform Verifier checks its profile endpoint |
| token request method | yes | the Platform Verifier checks its profile method |
| token request path | yes | the Platform Verifier checks its profile path |
| `client_secret` | no | never revealed, per REQ-PLAT-35A |
| everything else | no | headers, status line, `scope`, `token_type`, other response fields |

Every unrevealed range stays behind the pinned attestation format's range
commitment, bounded by revealed anchor bytes. Revealing more would widen
exposure without adding a check.

- REQ-PLAT-43D (upholds SP-EXCHANGE-01):
  The Token-Exchange Service MUST reveal no range outside the eight rows
  marked `yes` above. The Token-Exchange Service MUST commit the bearer range
  rather than reveal it.
- REQ-PLAT-43E (upholds SP-CLIENT-01):
  The Proving Circuit MUST NOT expose the bearer, or any value from which the
  bearer can be recovered, as a public proof input. The bearer commitments
  are public inputs under REQ-PLAT-52A; they reveal nothing about
  the bearer and are what ties the circuit to the two verified attestations.

- REQ-PLAT-44 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST verify the returned token-exchange attestation
  locally against the `github/v1` profile's pinned notary key and attestation
  format before using the bearer. Necessity: the browser checks what it got
  back before spending a `/user` session on it; the Notary Service decision
  the chain relies on is separate.
- REQ-PLAT-45 (upholds SP-EXCHANGE-01):
  The Token-Exchange Service MUST return an attestation carrying the
  configured notary's signature and revealing the token-endpoint authority,
  method, and path. The Platform Verifier MUST compare those revealed values
  with the
  `github/v1` profile.
- REQ-PLAT-46 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST require the disclosed `code` to equal the code it
  consumed at redirect ingress, byte for byte.
- REQ-PLAT-47 (upholds SP-CLIENT-01):
  The Canonical Runtime MUST require the disclosed `client_id` to equal its
  configured client.
- REQ-PLAT-48 (upholds SP-BIND-01):
  The Canonical Runtime MUST require the disclosed `code_verifier` to equal the
  verifier it derived.
- REQ-PLAT-49 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST require the returned bearer to open the bearer
  commitment of the token-exchange attestation.
- REQ-PLAT-50 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST discard the response and start neither `/user` nor
  a resume record when any check in REQ-PLAT-44 through REQ-PLAT-49 fails.

Verifying only arbitrary byte substrings is insufficient: a prover that
composes the request could otherwise witness one `code` or `code_verifier`
while GitHub consumes a duplicate. The layout tiling accounts for every
transcript byte, every body range other than the secret is revealed, and the
opened secret is delimiter-free per REQ-PLAT-35. These checks reduce hidden
surface but do not prove the decoded form grammar or reject duplicates inside
revealed values. `github/v1` therefore retains ASM-PROV-07 as a soundness
dependency. The server-produced token-exchange attestation carries the
commitments while
keeping the client secret from the browser.

### 6.5 Identity request

`GET https://api.github.com/user` with no query. The request carries
exactly five headers, in this order:
`authorization: Bearer <access_token>`, `accept: application/vnd.github+json`,
`x-github-api-version: 2022-11-28`, `host: api.github.com`, and
`connection: close`.

Per common §9, the identity session reveals exactly these request ranges;
the bearer value is the only committed request range, and every other
request byte is revealed:

| Range | Revealed | Why |
|---|---|---|
| request line and all request headers, except the bearer value | yes | the Platform Verifier runs the line-anchored uniqueness scan of common REQ-COMMON-39 over these bytes and frames the committed range per common REQ-COMMON-40 |
| bearer value of the `authorization` header | committed | a blinded commitment, opened only in circuit |

The two ranges account for the request's signed transcript length exactly,
with no gap and no overlap, per common REQ-COMMON-35 and REQ-COMMON-36, so
the request leaves no byte undisclosed and uncommitted.

- REQ-PLAT-51 (upholds SP-BIND-01):
  The Platform Verifier MUST extract `id` and `login` from the revealed
  response bytes by their full field delimiters, rejecting a transcript in
  which either delimiter matches at more than one position, per common
  REQ-COMMON-19A. The Platform Verifier MUST reject a noncanonical `id`
  encoding.
- REQ-PLAT-51A (upholds SP-BIND-01):
  The Canonical Runtime MUST derive the GitHub `userId` and normalized handle
  from those same revealed `id` and `login` bytes. The Proving Circuit
  MUST NOT expose a second independently supplied representation of either
  identity field.
- REQ-PLAT-52 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST assert that one private bearer value opens the
  bearer commitment of the token-exchange attestation and the
  `Authorization` bearer commitment of the `/user` attestation. The Platform
  Verifier MUST compare the endpoint triple revealed in each attestation with
  the `github/v1` profile.

- REQ-PLAT-52A (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST expose exactly these two GitHub public inputs:

  | Public input | Meaning |
  |---|---|
  | token-exchange bearer commitment | the commitment the Platform Verifier matches against the verified token-exchange attestation |
  | identity bearer commitment | the commitment the Platform Verifier matches against the verified `/user` attestation |

  The Proving Circuit MUST NOT add an Authorization Digest, client identifier,
  timestamp, endpoint, `userId`, or handle public input. Necessity: the digest
  is bound by the Platform Verifier under common REQ-COMMON-15A, and the rest
  are revealed bytes it reads directly, so a circuit copy would be a second
  representation of a fact that already has one.
- REQ-PLAT-52B (upholds SP-EXCHANGE-01):
  The Platform Verifier MUST require each bearer commitment public input to
  equal the
  corresponding commitment in the attestation it verified. Necessity: without
  this the circuit could prove a link between two attestations other than the
  ones submitted.

Changing the pinned API version is a profile and verifier revision, not
runtime configuration. The granted scope is enforced by the Proving Circuit over the token-exchange attestation
but is not a public proof input. The bearer is never disclosed by the
proof.

- REQ-PLAT-53:
  The Token-Exchange Service MUST NOT promise idempotency or replay. The Canonical
  Runtime MUST start a fresh ceremony when GitHub consumed the code but no
  response reached it. Necessity: the exchange is a single-use, non-recoverable
  step.

## 7. Adding an identity platform

The Platform Profile for a new platform MUST define a stable platform
identifier and immutable
user-ID namespace; canonical handle normalization and authenticated
observation ordering; client portability or a bounded client family; exact
authorization and redirect transport; every authenticated request and
response field with its provenance; how the Authorization Digest is carried
through that platform's authorization; its authenticated client-binding source; an
authenticated proof-validity ceiling; its trust-root lifecycle;
browser and deployment data exposure, retry, resume, and withholding
behavior; and conformance vectors.

## 8. Conformance

Roles: Canonical Runtime, Token-Exchange Service, Proving Circuit,
Platform Verifier, Notary Service, Consumer.

- TEST-PLAT-01 (exercises REQ-PLAT-10, REQ-PLAT-18):
  The §3.1 nonce vector reproduces exactly, and a token carrying another nonce
  is rejected.
- TEST-PLAT-02 (exercises REQ-PLAT-04, REQ-PLAT-05, REQ-PLAT-06, REQ-PLAT-07, REQ-PLAT-08):
  The §2.1 identifier vectors reproduce, and each listed malformed identifier
  is rejected.
- TEST-PLAT-03 (exercises REQ-PLAT-11, REQ-PLAT-12):
  A Google authorization request not using the exact direct-ID-token fragment
  profile is rejected, and a fragment carrying duplicate `state`, both
  `id_token` and `error`, `code`, or `access_token` is rejected.
- TEST-PLAT-04 (exercises REQ-PLAT-13, REQ-PLAT-14):
  A fragment whose `state` has no unique live local ceremony, and an ID Token
  whose `nonce` is not the constructed digest, are rejected. No backend state
  lookup occurs.
- TEST-PLAT-05 (exercises REQ-PLAT-15):
  A Google response carrying an authorization code or access token is rejected,
  and the deployment contains no Google exchange route or client secret.
  Verification: inspection of emitted artifacts.
- TEST-PLAT-06 (exercises REQ-COMMON-19D, REQ-PLAT-16, REQ-PLAT-16A, REQ-PLAT-16B, REQ-PLAT-17, REQ-PLAT-19, REQ-PLAT-19A, REQ-PLAT-20, REQ-PLAT-21, REQ-PLAT-23):
  A token with a foreign issuer, foreign audience, `email_verified: false`, a
  quoted or non-boolean `email_verified`, a quoted, negative, fractional,
  exponent, leading-zero, or overflowing `exp`, or an untrusted signing
  modulus is rejected in each case. A token signed
  under any other algorithm or key fails the fixed verification relation.
  Header, payload, signature, or public-output substitution is rejected. A
  cryptographically valid proof under an inactive signing modulus passes
  circuit verification but is rejected by the Platform Verifier. A submission
  whose supplied `aud` bytes do not hash to the audience public input is
  rejected, and an accepted one returns those exact bytes as the client
  identifier.
- TEST-PLAT-07 (exercises REQ-PLAT-22, REQ-PLAT-09, REQ-PLAT-09A):
  A proof at or after `proofValidUntil`, and a token-attestation creation time
  more than `maxFutureAttestationSkew` ahead of Block Time, are rejected. An
  X or GitHub identity-attestation timestamp changes neither
  `metadataObservedAt` nor `proofValidUntil`; Google uses its signed `exp`
  for both values.
- TEST-PLAT-08 (exercises REQ-PLAT-24):
  The trusted modulus set contains every modulus currently published at
  Google's JWKS endpoint, and every corresponding exponent is 65537.
- TEST-PLAT-09 (exercises REQ-PLAT-29, REQ-PLAT-46):
  A transcript whose disclosed `code` differs from the code consumed at
  redirect ingress is rejected on X and on GitHub.
- TEST-PLAT-09A (exercises REQ-PLAT-29A, REQ-PLAT-29B):
  An X attestation that does not reveal the token request's `client_id` is
  rejected; a proof exposing a client identifier public input is rejected; and
  the identifier the Platform Verifier returns equals the revealed bytes.
- TEST-PLAT-09B (exercises REQ-PLAT-30A, REQ-PLAT-32A):
  An X transcript that reveals plaintext `access_token` bytes in either
  session, or omits the bearer hash commitment, is rejected.
- TEST-PLAT-09C (exercises REQ-PLAT-29C):
  The Platform Verifier rejects an X attestation that hides the `grant_type`
  or `redirect_uri` range, and the Canonical Runtime rejects a revealed value
  differing from its deployment profile.
- TEST-PLAT-10 (exercises REQ-PLAT-30, REQ-PLAT-31, REQ-PLAT-32, REQ-PLAT-36, REQ-PLAT-51, REQ-PLAT-52):
  An opened bearer range that is empty, over 4096 bytes, or outside printable
  ASCII fails to prove; a revealed identity response missing `id` or the
  handle field is rejected; and a proof whose two attestations commit
  different bearers is rejected. No proof statement covers `token_type` or the
  granted scope.
- TEST-PLAT-11 (exercises REQ-PLAT-33):
  A token request issued after the 30-second deadline is abandoned.
- TEST-PLAT-12 (exercises REQ-PLAT-34, REQ-PLAT-35, REQ-PLAT-35A, REQ-PLAT-35B, REQ-PLAT-35C):
  An authorization request carrying a scope other than `read:user` is
  rejected; no public proof input derives from the client secret; an exchange
  attestation that does not reveal the `client_id` range is rejected; an
  accepted one returns those exact bytes as the client identifier; and the
  configured secret contains neither `&` nor `=`. Verification: inspection of
  the configured credential for the secret rule.
- TEST-PLAT-13 (exercises REQ-PLAT-37, REQ-PLAT-38, REQ-PLAT-39, REQ-PLAT-40):
  Each over-limit, malformed, duplicate, and missing field on both token-exchange
  interfaces is rejected.
- TEST-PLAT-14 (exercises REQ-PLAT-41, REQ-PLAT-42, REQ-PLAT-43, REQ-PLAT-43A, REQ-PLAT-43B, REQ-PLAT-43C, REQ-PLAT-43D, REQ-PLAT-43E):
  A request selecting an endpoint, client, or return URL is rejected; no state
  survives the call; a foreign origin is refused; the CORS preflight for the
  compiled origin is answered; every response carries `Cache-Control:
  no-store`; an attestation revealing a range outside the eight marked rows,
  or revealing the bearer range instead of committing it, is rejected; and no proof exposes the bearer or a value it can be recovered
  from.
- TEST-PLAT-15 (exercises REQ-PLAT-44, REQ-PLAT-45, REQ-PLAT-47, REQ-PLAT-48, REQ-PLAT-49, REQ-PLAT-50):
  A token-exchange attestation with a bad notary signature, a foreign
  endpoint, a foreign client, a foreign `code_verifier`, or a bearer that does not
  open the commitment is discarded in each case, and no resume record is
  written.
- TEST-PLAT-15A (exercises REQ-PLAT-52, REQ-PLAT-52A, REQ-PLAT-52B):
  A GitHub proof whose bearer commitment public input differs from the
  commitment in either submitted attestation is rejected; substituting one
  attestation for another from a different ceremony is rejected; and the
  proof carries no bearer, code, verifier, redirect URI, or added identity,
  time, client, or endpoint public input.
- TEST-PLAT-15B (exercises REQ-PLAT-32B, REQ-PLAT-32C):
  An X proof whose bearer commitment public input differs from the commitment
  in the submitted attestation is rejected, and a proof carrying a client
  identifier, timestamp, endpoint, `userId`, or handle public input is
  rejected.
- TEST-PLAT-16 (exercises REQ-PLAT-53):
  A ceremony whose exchange response was lost restarts from authorization.
- TEST-PLAT-17 (exercises REQ-PLAT-01, REQ-PLAT-01A, REQ-PLAT-02, REQ-PLAT-03):
  A resume that substitutes a newer profile is rejected, an unlisted profile is
  ineligible, a profile missing its verifier artifact or, for a TLSNotary
  profile, its Notary Service is ineligible, and no claim field originates
  outside verified public inputs and verified revealed attestation bytes.
- TEST-PLAT-17A (exercises REQ-PLAT-03, REQ-PLAT-31A, REQ-PLAT-51A):
  Pair authenticated X or GitHub identity-response bytes for account B with a
  detached `userId`, handle, or metadata value for account A. The runtime
  rejects the extra representation; without it, the runtime and the Platform
  Verifier both derive account B byte for byte.
- TEST-PLAT-18 (exercises REQ-PLAT-25, REQ-PLAT-26, REQ-PLAT-27, REQ-PLAT-28, REQ-PLAT-28A):
  Launch uses Proxy mode, rejects application or request selection of Browser
  MPC, uses no application-controlled platform egress, and carries no partial
  transcript state into a retry. A redirect carrying two `code` fields, two
  `state` fields, both `code` and `error`, or a malformed field is rejected
  before any token request starts, as is a redirect whose `state` matches no
  live local ceremony or a ceremony already consumed.
- TEST-PLAT-19 (exercises REQ-COMMON-32; supports ASM-PROV-07):
  Recurring integration probes send each profile-listed X and GitHub token
  request field twice, in both orders and using both literal and percent-encoded
  equivalent field names, and send the otherwise valid request under alternate
  media types. The production endpoint rejects every probe and issues no
  bearer.

## 9. Security Considerations

This document enforces SP-BIND-01, SP-CLIENT-01, SP-EXCHANGE-01, and
SP-FRESH-01 for the launch platforms, under the assumptions of
[common §3](ceremony-common.md#3-assumptions).

Google is the only platform whose evidence is a bearer artifact: an ID Token
is complete evidence to whoever holds it. Its delivery is therefore
trust-bearing, and ASM-PROV-01 carries that weight. X and GitHub deliver an
authorization code, which is not evidence until redeemed, so a code alone
grants nothing.

Redemption differs by client type. GitHub requires the client secret
(ASM-PROV-04), so a code obtained by another party is inert. X is a public
client and requires no secret, so for X the registered redirect URI list is
the only barrier between an intercepted code and complete evidence; every
origin on that list is trust-bearing configuration, and an open redirect,
subdomain takeover, or script injection on any of them defeats it.

SP-BIND-01 rests on the platform enforcing the PKCE challenge match
(ASM-PROV-02) for X and GitHub, and on Google reflecting the requested nonce
into a signed token (ASM-PROV-05). ASM-PROV-02 is a live dependency on
platform behavior rather than a proven property. The Implementation claiming
conformance MUST run a recurring check that each platform still rejects a
mismatched `code_verifier`.

X and GitHub request-field uniqueness depends on their fixed token endpoints'
decoded-form behavior under ASM-PROV-07. Disclosure and delimiter constraints
reduce hidden request surface but do not replace that parser assumption.
TEST-PLAT-19 exercises it continuously; a failed probe makes the affected
profile ineligible for new ceremonies.

A malicious Token-Exchange Service cannot rebind a ceremony to other
Authorized Transaction Data while ASM-PROV-07 holds, because the Authorization
Digest fixes that data before the platform is contacted and the service cannot
make GitHub redeem a `code_verifier` other than the one proven. Should
ASM-PROV-07 fail at GitHub's token endpoint, this is the party positioned to
exploit it: it legitimately holds the user's code and verifier. It can
withhold, and it can attempt to substitute a token obtained under a
separately arranged authorization; REQ-PLAT-46 rejects that substitution by
requiring the proven code to be the one this ceremony consumed. A proof
built outside the Canonical Runtime performs no such check, so a submission
of that proof is bounded by the Transaction Author rule stated in
[common §12](ceremony-common.md#12-security-considerations).

The notary key is a trust root for X and GitHub evidence. Its compromise
mints fresh evidence until the key is removed, and does not revoke authority
already committed.

Google has no Token-Exchange Service or deployment-visible authorization
response. Its signed ID Token reaches the redirect fragment, is cleared before
other work, and is bound to the local ceremony by `state`, signed `nonce`, and
signed `aud`. A deployment backend can withhold the static redirect document
but cannot substitute an ID Token through a server exchange that does not
exist.

Google's JWKS rotation makes the trusted modulus set a liveness dependency
(REQ-PLAT-24): every Google ceremony fails closed while Google signs with an
untrusted modulus.

## 10. References

Normative: [RFC6749], [RFC7636], [RFC7515], [RFC7517], [RFC7518], [RFC7519],
[RFC8017], [OIDC], [RFC8446].

Informative: [RFC9700], [TLSNotary-Proxy].
