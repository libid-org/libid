# Identity-platform ceremonies

Part of the [libID protocol specification](libid.md).

## 1. Scope

This document is the normative owner of each platform's OAuth profile,
authenticated identity fields, evidence composition, proof-validity ceiling,
exchange service, and platform-specific failure behavior. The
[common ceremony rules](ceremony-common.md) own the claim digest,
serialization, PKCE, transcript extraction, client binding, and evidence
time. The contract protocol owns registry dispatch and trust-root governance.
The browser protocol owns browsing contexts, redirect transport, storage,
resume, and runtime handoff.

Google returns a signed OIDC ID Token directly to the redirect fragment. X and
GitHub use the OAuth authorization-code flow and notarized transcripts of
authenticated platform API responses.

Terms are imported from
[common ceremony rules §2](ceremony-common.md#2-terminology).

## 2. Ceremony profiles

Each platform ceremony has an independently versioned immutable profile:
`google/v1`, `x/v1`, `github/v1`.

- REQ-PLAT-01:
  The Canonical Runtime MUST record in the ceremony state the exact profile it
  selected. The Canonical Runtime MUST NOT substitute another profile on
  resume. Necessity: a resumed ceremony that changed profile would produce
  evidence the selected verifier cannot check.
- REQ-PLAT-01A (upholds SP-BIND-01):
  The Registry Governance Process MUST select an exact final-proof verifier
  artifact for every eligible profile and an exact Attestation Verifier
  artifact for every TLSNotary profile. Necessity: a profile name without its
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
  revealed identity-response bytes that the Consuming Contract parses, using
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
| X | `/2/users/me.data.id` JSON string | canonical nonzero `uint64` decimal | normalized `username` |
| GitHub | `/user.id` JSON integer token | canonical nonzero `uint64` decimal | normalized `login` |

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
  `^[1-9][0-9]{0,19}$` with a numeric value at most `uint64.max`. Necessity:
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

### 2.2 Metadata ordering and validity ceilings

Proof validity and mutable-metadata ordering use the authenticated times below.

| Identity platform | `metadataObservedAt` | `proofValidUntil` |
|---|---|---|
| Google | signed ID-Token `exp` | signed ID-Token `exp` |
| X | signed `meAttest.timestamp` | `tokenAttest.timestamp + proofLifetime[x]` |
| GitHub | signed `userAttest.timestamp` | `tokenAttest.timestamp + proofLifetime[github]` |

For X and GitHub, "timestamp" is the signed TLSNotary attestation creation
time. The token attestation is the one-time PKCE and Claim-Digest binding, so
it alone anchors proof validity. The identity attestation opens the same bearer
and its timestamp orders the mutable handle it observed; it does not refresh
the authorization. The named lifetimes are current
[protocol parameters](libid.md#protocol-parameters).

Google's signed `exp` already supplies the accepted one-hour ordering and
validity value. A Google proof also requires its signing modulus to remain in
the Registry's active set. The Claim Digest carries no expiration.
`metadataObservedAt` is the monotone replay watermark of common
REQ-COMMON-25A. Older evidence cannot regress stored metadata and does not
block an otherwise valid authority operation.

- REQ-PLAT-09 (upholds SP-FRESH-01):
  The Consuming Contract MUST reject an X or GitHub attestation timestamp more
  than `maxFutureAttestationSkew` ahead of `block.timestamp`.
- REQ-PLAT-09A (upholds SP-FRESH-01):
  The Consuming Contract MUST derive `metadataObservedAt` and
  `proofValidUntil` from the exact sources in the table above. An X or GitHub
  identity attestation does not authorize an extension: the Consuming Contract
  MUST NOT use it to extend `proofValidUntil`.

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
| 7 | `nonce` | `BASE64URL_NOPAD(bytes32(claimDigest))` |

The authorization request is plain browser navigation and is never
notarized; no proof semantics attach to any field above. The table is
operational guidance for obtaining a token whose signed claims satisfy
§3.2–§3.3. The signed ID Token is the only Google evidence.

- REQ-PLAT-10 (upholds SP-BIND-01):
  The Canonical Runtime MUST set `nonce` to the base64url encoding of the 32
  Claim Digest bytes, not to hexadecimal text.
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

Conformance vector, for the Claim Digest of
[common §5](ceremony-common.md#5-claim-digest):

```text
claimDigest  = 0xbbc7bfcce62d070cc25d7ba04ce8820da8f4e5c92f5e63a2bd403940c84ab625
Google nonce = u8e_zOYtBwzCXXugTOiCDaj05ckvXmOivUA5QMhKtiU
```

### 3.2 Local token verification

- REQ-PLAT-14 (upholds SP-BIND-01):
  The Canonical Runtime MUST reject an ID Token whose `nonce` differs from the
  Claim Digest it constructed.
- REQ-PLAT-15:
  The Redirect Runtime MUST reject a Google response carrying `code` or
  `access_token`. Necessity: neither artifact belongs to this
  authentication-only profile.

### 3.3 Proof statement

The Proving Circuit and consuming contract enforce all of the following:

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
  The Proving Circuit MUST NOT decide Registry membership or take the active
  set as an input. The Consuming Contract alone checks the modulus under
  REQ-PLAT-23. JWK decoding and canonical-encoding validation happen where a
  modulus is admitted to the trusted set, per REQ-PLAT-24; the JWK encoding
  appears in no signed artifact, so proving it would add nothing.
- REQ-PLAT-16B (upholds SP-BIND-01, SP-CLIENT-01, SP-FRESH-01):
  The Proving Circuit MUST expose exactly the following Google public inputs,
  each derived from the signed payload or verified signing key:

  | Public input | Authenticated source |
  |---|---|
  | Claim Digest | signed `nonce`, decoded as exactly 32 bytes |
  | client identifier | signed `aud` |
  | canonical `userId` | signed `sub` |
  | raw `email` bytes | signed `email`; the Consuming Contract derives the normalized handle |
  | evidence timestamp | signed `exp`; used for both `metadataObservedAt` and `proofValidUntil` |
  | RSA modulus | exact `n` that verified the JWS; `e = 65537` is profile-fixed |

  The Proving Circuit MUST NOT expose a detached second representation of a
  claim. Proofs are over raw bytes; normalization, such as lowercasing the
  handle, is the Consuming Contract's decision at consumption time.
- REQ-PLAT-17 (upholds SP-BIND-01):
  The Proving Circuit MUST prove the signed `iss` equals
  `https://accounts.google.com`.
- REQ-PLAT-18 (upholds SP-BIND-01):
  The Proving Circuit MUST prove `nonce` equals the Claim Digest.
- REQ-PLAT-19 (upholds SP-CLIENT-01):
  The Proving Circuit MUST expose the signed `aud` as the client-binding public
  input. Admission stays permissionless per common REQ-COMMON-17C; the Consuming
  Contract MAY read the exposed `aud`.
- REQ-PLAT-20:
  The Proving Circuit MUST prove `email_verified` is the boolean `true`.
  Necessity: an unverified email would let one account assert another party's
  address as its handle.
- REQ-PLAT-21 (upholds SP-BIND-01):
  The prover supplies the offset of each checked claim as a private input.
  The Proving Circuit MUST check the string claims `iss`, `sub`, `aud`,
  `nonce`, and `email` under common REQ-COMMON-19 and REQ-COMMON-19B. The
  Proving Circuit MUST check `exp` as a canonical unsigned JSON integer bounded
  by `uint64`, and `email_verified` as the exact unquoted JSON boolean `true`,
  under common REQ-COMMON-19D.
  Duplicate-free top-level structure is the issuer's behavior under
  ASM-PROV-06; the circuit performs no search and no duplicate scan.
- REQ-PLAT-22 (upholds SP-FRESH-01):
  The Consuming Contract MUST reject a proof whose signed `exp` places
  `proofValidUntil` at or before `block.timestamp`.

The signing key is fetched from Google's JWKS endpoint as witness input.

- REQ-PLAT-23 (upholds SP-CLIENT-01):
  The Consuming Contract MUST reject a proof whose RSA modulus is absent from
  the registry's active trusted Google modulus set.
- REQ-PLAT-24:
  The Registry Governance Process MUST add a newly published Google signing
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
  The Proving Circuit MUST disclose the token request's `code` range. The
  Proving Circuit MUST assert byte equality with the code consumed at redirect
  ingress.
- REQ-PLAT-30 (upholds SP-BIND-01):
  The Proving Circuit MUST require exactly one nonempty printable-ASCII
  top-level `access_token` string of at most 4096 bytes in the token response.

Per common §9, the token session reveals exactly these ranges; every other
byte stays behind a charset-constrained range commitment of the pinned
Attestation Verifier:

| Range | Revealed | Why |
|---|---|---|
| endpoint authority, method, path | yes | exposed as public proof inputs per common REQ-COMMON-21 |
| `grant_type` | yes | constant `authorization_code`; revealed so no delimiter can hide beside it |
| `client_id` | yes | exposed as a public proof input |
| `code` | yes | compared to the code consumed at redirect ingress |
| `redirect_uri` | yes | the Canonical Runtime compares its immutable profile; no chain or circuit value |
| `SHA256(ASCII(access_token))` | yes | hash commitment linking the token and identity transcripts |
| attestation timestamp | yes | derives the authenticated validity ceiling |
| everything else | no | headers, `code_verifier`, `scope`, `token_type`, other response fields |

With those reveals and the in-circuit `code_verifier` opening of REQ-COMMON-15,
every token-request body byte is either revealed or opened and
charset-constrained. ASM-PROV-07 is defense-in-depth for `x/v1`, not a
soundness dependency.

- REQ-PLAT-29A (upholds SP-CLIENT-01):
  The Proving Circuit MUST reveal the `client_id` range of the token request.
- REQ-PLAT-29B (upholds SP-CLIENT-01):
  The Proving Circuit MUST expose that revealed `client_id` as a public proof
  input.
- REQ-PLAT-29C (upholds SP-EXCHANGE-01):
  The Implementation MUST reveal the token request's `grant_type` and
  `redirect_uri` ranges in the notarized session, including in the
  presentation the Consuming Contract verifies. The Canonical Runtime MUST
  reject a transcript whose revealed `grant_type` or `redirect_uri` differs
  from its immutable deployment profile. Neither value is a circuit
  constraint, a public proof input, or a value the Consuming Contract reads;
  the reveal exists so no token-request body byte stays both hidden and
  unopened in the evidence the chain verifies.
- REQ-PLAT-30A (upholds SP-EXCHANGE-01):
  The Implementation MUST reveal the returned `access_token` from the notarized
  token session only as its `SHA256(ASCII(access_token))` hash commitment. The
  Implementation MUST keep the plaintext token bytes redacted.

### 5.3 Identity request

`GET https://api.x.com/2/users/me` with no query,
`Authorization: Bearer <access_token>`, `Accept: application/json`.

- REQ-PLAT-31 (upholds SP-BIND-01):
  The Consuming Contract MUST extract `id` and `username` from the revealed
  response bytes by their full `"field":"` delimiters, rejecting a transcript
  in which either delimiter matches at more than one position, per common
  REQ-COMMON-19A. Necessity: the response carries account-holder-influenced
  text, such as the display name, that can embed a lookalike field.
- REQ-PLAT-31A (upholds SP-BIND-01):
  The Canonical Runtime MUST derive the X `userId` and normalized handle from
  those same revealed `id` and `username` bytes. The Final Identity Circuit
  MUST NOT expose a second independently supplied representation of either
  identity field.
- REQ-PLAT-32 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST assert the same bearer commitment across the token
  transcript and the identity transcript.
- REQ-PLAT-32A (upholds SP-EXCHANGE-01):
  The Implementation MUST reveal the `Authorization` bearer value from the
  notarized identity session only as the same
  `SHA256(ASCII(access_token))` hash commitment. The Implementation MUST keep
  the plaintext token bytes redacted.

- REQ-PLAT-32B (upholds SP-BIND-01, SP-CLIENT-01, SP-EXCHANGE-01, SP-FRESH-01):
  The Final Identity Circuit MUST expose exactly the following X public
  inputs:

  | Public input | Authenticated source |
  |---|---|
  | Claim Digest | bound to the token request's `code_verifier` under common REQ-COMMON-15 |
  | client identifier | revealed token-request `client_id` |
  | token-attestation timestamp | notarized token session |
  | identity-attestation timestamp | notarized `/users/me` session |
  | revealed identity-response ranges | notarized `/users/me` response containing `id` and `username` |
  | token endpoint authority, method, and path | notarized token session |
  | identity endpoint authority, method, and path | notarized `/users/me` session |

  The Final Identity Circuit MUST keep the bearer, bearer commitment,
  `pkceNonce`, and all hidden-range commitments private. The Final Identity
  Circuit MUST NOT expose a detached `userId`, handle, or timestamp.

The `code_verifier` is recomputed in circuit per REQ-COMMON-15. The Consuming
Contract compares the endpoint inputs with the `x/v1` profile.

- REQ-PLAT-33 (upholds SP-FRESH-01):
  The Canonical Runtime MUST complete the token request within X's
  authorization-code deadline of 30 seconds. The Canonical Runtime MUST abandon
  the ceremony otherwise.

## 6. GitHub ceremony

GitHub uses a confidential client, a deployment-owned token-exchange proof,
and a browser-owned `/user` TLSNotary session. The
structure matches X: two attestations, one bearer linked across both, one
proof binding both to the Claim Digest. The exchange runs server-side because
the client is confidential, which makes the Token-Proof Service the prover for
that transcript.

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

- REQ-PLAT-35 (upholds SP-CLIENT-01):
  The Proving Circuit MUST constrain the redacted `client_secret` to a charset
  containing neither `&` nor `=`, proving the charset without revealing the
  value.
- REQ-PLAT-35A (upholds SP-CLIENT-01):
  The Proving Circuit MUST NOT expose `client_secret`, or any value derived
  from it, as a public proof input.
- REQ-PLAT-35B (upholds SP-CLIENT-01):
  The Proving Circuit MUST reveal the `client_id` range of the exchange
  request.
- REQ-PLAT-35C (upholds SP-CLIENT-01):
  The Proving Circuit MUST expose that revealed `client_id` as a public proof
  input.
- REQ-PLAT-35D (upholds SP-EXCHANGE-01):
  The Token-Proof Circuit MUST open the `client_secret` range as a private
  witness and constrain its charset to exclude `&` and `=`. Necessity: with
  every other exchange-body range revealed and the secret opened and
  delimiter-free, no body byte stays both hidden and unopened, making
  ASM-PROV-07 defense-in-depth for `github/v1` rather than a soundness
  dependency.
- REQ-PLAT-36 (upholds SP-BIND-01):
  The Proving Circuit MUST require exactly one nonempty printable-ASCII
  top-level `access_token` string of at most 4096 bytes in the exchange
  response, exactly one `token_type` equal to `bearer`, and exactly one `scope`
  whose comma-separated members form the singleton set `{read:user}`. The
  Token-Proof Circuit MUST reject empty, duplicate, whitespace-bearing, and
  unknown scope members.

### 6.3 Token-proof service

The Deployment exposes one stateless Token-Proof Service at the fixed
`/oauth/github/token-proof` route on the redirect origin.

```ts
interface TokenProofRequestV1 {
  schema: 1
  code: string
  codeVerifier: string
}

interface TokenProofResponseV1 {
  schema: 1
  accessToken: string
  tokenProof: string // canonical unpadded base64url
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
  `MAX_GITHUB_ACCESS_TOKEN_BYTES = 4096`, a decoded token proof exceeding
  `MAX_GITHUB_TOKEN_PROOF_BYTES = 2 MiB`, and a response body exceeding
  `MAX_GITHUB_TOKEN_PROOF_RESPONSE_BYTES = 3 MiB`. Necessity: bounded parsing.
- REQ-PLAT-40:
  The Implementation MUST reject duplicate, missing, additional, differently
  typed, and malformed fields on both interfaces. Necessity: cross-component
  interoperability.
- REQ-PLAT-41 (upholds SP-EXCHANGE-01):
  The Token-Proof Service MUST use only its compiled client identifier, client
  secret, redirect URI, token endpoint, and notary configuration. The
  Token-Proof Service MUST NOT accept a caller-selected action, job, client,
  redirect, endpoint, return URL, or operation.
- REQ-PLAT-42:
  The Token-Proof Service MUST persist no code, verifier, bearer, proof,
  result, or progress state. The Token-Proof Service MUST expose no polling or
  result route. Necessity: the service holds ceremony credentials, so retention
  creates a compromise target with no protocol purpose.
- REQ-PLAT-43:
  The Token-Proof Service MUST accept only the compiled redirect-runtime origin.
  Necessity: limits accidental browser disclosure; it is not caller
  authentication.
- REQ-PLAT-43A:
  The Token-Proof Service MUST answer the CORS preflight for that origin.
  Necessity: cross-component interoperability with the Canonical Runtime.
- REQ-PLAT-43B:
  The Token-Proof Service MUST reject redirects. Necessity: a followed redirect
  would notarize a session other than the pinned token endpoint.
- REQ-PLAT-43C:
  The Token-Proof Service MUST emit `Cache-Control: no-store`. Necessity: the
  response carries a bearer token.

### 6.4 Disclosure and verification

The Token-Proof Service, which knows the client secret and complete exchange
transcript, produces `tokenProof`. Its circuit opens the hidden-range
commitments of common REQ-COMMON-18, and the verifier checks the revealed
ranges and layout per common REQ-COMMON-18A and REQ-COMMON-21A. The browser
never receives the client secret or an unverifiable selectively disclosed
transcript.

The token proof exposes exactly the public outputs needed to bind it to the
local ceremony and the later `/user` transcript. The separately returned
`accessToken` is the only additional response value.

| Range | Revealed | Why |
|---|---|---|
| `client_id` | yes | the Canonical Runtime checks its immutable profile |
| `code` | yes | the Canonical Runtime compares it to the code it consumed |
| `redirect_uri` | yes | the Canonical Runtime compares its immutable profile |
| `code_verifier` | yes | the Canonical Runtime compares it to the verifier it derived |
| `SHA256(ASCII(access_token))` | yes | opens the returned bearer and links it to `/user` |
| attestation timestamp | yes | derives the authenticated validity ceiling |
| token endpoint authority | yes | the Consuming Contract checks the profile endpoint |
| token request method | yes | the Consuming Contract checks the profile method |
| token request path | yes | the Consuming Contract checks the profile path |
| `client_secret` | no | never revealed, per REQ-PLAT-35A |
| everything else | no | headers, status line, `scope`, `token_type`, other response fields |

Every unexposed range stays behind the pinned Attestation Verifier's range
commitment, bounded by revealed anchor bytes and charset-constrained per common
REQ-COMMON-20. The
`token_type` and scope rule of REQ-PLAT-36 are asserted in circuit against
their committed ranges without disclosure. Revealing those bytes would add no
check and would widen exposure.

- REQ-PLAT-43D (upholds SP-EXCHANGE-01):
  The Token Proof MUST expose no public output outside the nine rows marked `yes`
  above.
- REQ-PLAT-43E (upholds SP-CLIENT-01):
  The Final Identity Circuit MUST NOT expose the bearer or bearer
  commitment as a public proof input.

- REQ-PLAT-44 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST verify `tokenProof` under the immutable
  `github/v1` token-proof verifier before using the bearer.
- REQ-PLAT-45 (upholds SP-EXCHANGE-01):
  The Token-Proof Circuit MUST require the configured notary signature and
  expose the authenticated token-endpoint authority, method, and path. The
  Final Identity Circuit MUST carry those public inputs unchanged to the
  Consuming Contract.
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
  The Canonical Runtime MUST require the returned bearer to hash to the token
  proof's `SHA256(ASCII(access_token))` output.
- REQ-PLAT-50 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST discard the response and start neither `/user` nor
  a resume record when any check in REQ-PLAT-44 through REQ-PLAT-49 fails.

Verifying only arbitrary byte substrings is insufficient: a prover that
composes the request could otherwise witness one `code` or `code_verifier`
while GitHub consumes a duplicate. The local form-field matcher and layout
tiling prove where the checked values occur and that no transcript bytes are
omitted. Deliberately, they do not pay the impractical circuit cost of proving
the complete form grammar; uniqueness of decoded request fields is the
endpoint-parser assumption ASM-PROV-07. The server-produced token proof carries
the commitments while keeping the client secret from the browser.

### 6.5 Identity request

`GET https://api.github.com/user` with no query,
`Authorization: Bearer <access_token>`, `Accept: application/vnd.github+json`,
`X-GitHub-Api-Version: 2022-11-28`.

- REQ-PLAT-51 (upholds SP-BIND-01):
  The Consuming Contract MUST extract `id` and `login` from the revealed
  response bytes by their full field delimiters, rejecting a transcript in
  which either delimiter matches at more than one position, per common
  REQ-COMMON-19A. The Consuming Contract MUST reject a noncanonical `id`
  encoding.
- REQ-PLAT-51A (upholds SP-BIND-01):
  The Canonical Runtime MUST derive the GitHub `userId` and normalized handle
  from those same revealed `id` and `login` bytes. The Final Identity Circuit
  MUST NOT expose a second independently supplied representation of either
  identity field.
- REQ-PLAT-52 (upholds SP-EXCHANGE-01):
  The Final Identity Circuit MUST verify the `github/v1` token proof and assert
  the same bearer commitment across that proof and the identity transcript. The
  Final Identity Circuit MUST also expose the authenticated authority, method,
  and path of the `/user` request. The Consuming Contract MUST compare both
  endpoint triples with the `github/v1` profile.

- REQ-PLAT-52A (upholds SP-BIND-01, SP-CLIENT-01, SP-EXCHANGE-01, SP-FRESH-01):
  The Final Identity Circuit MUST expose exactly the following GitHub public
  inputs:

  | Public input | Authenticated source |
  |---|---|
  | Claim Digest | public input bound to the nested `code_verifier` under common REQ-COMMON-15 |
  | client identifier | token proof `client_id` |
  | token-attestation timestamp | token proof |
  | identity-attestation timestamp | notarized `/user` session |
  | revealed identity-response ranges | notarized `/user` response containing `id` and `login` |
  | token endpoint authority, method, and path | token proof |
  | identity endpoint authority, method, and path | notarized `/user` session |

  The Final Identity Circuit MUST carry every token-proof value in this table
  unchanged from the verified nested proof. The Final Identity Circuit MUST
  keep the code, redirect URI, verifier, bearer, bearer commitment, and all
  hidden-range commitments private. The Final Identity Circuit MUST NOT expose
  a detached `userId`, handle, or timestamp.

Changing the pinned API version is a profile and verifier revision, not
runtime configuration. The granted scope is enforced inside the token proof
but is not a final public proof input. The bearer is never disclosed by the
final identity proof.

- REQ-PLAT-53:
  The Token-Proof Service MUST NOT promise idempotency or replay. The Canonical
  Runtime MUST start a fresh ceremony when GitHub consumed the code but no
  response reached it. Necessity: the exchange is a single-use, non-recoverable
  step.

## 7. Adding an identity platform

The Platform Profile for a new platform MUST define a stable platform
identifier and immutable
user-ID namespace; canonical handle normalization and authenticated
observation ordering; client portability or a bounded client family; exact
authorization and redirect transport; every authenticated request and
response field with its provenance; how the Claim Digest is carried through
that platform's authorization; its authenticated client-binding source; an
authenticated proof-validity ceiling; its trust root and registry lifecycle;
browser and deployment data exposure, retry, resume, and withholding
behavior; and conformance vectors.

## 8. Conformance

Roles: Canonical Runtime, Token-Proof Service, proving circuit, consuming
contract.

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
- TEST-PLAT-06 (exercises REQ-COMMON-19D, REQ-PLAT-16, REQ-PLAT-16A, REQ-PLAT-16B, REQ-PLAT-17, REQ-PLAT-19, REQ-PLAT-20, REQ-PLAT-21, REQ-PLAT-23):
  A token with a foreign issuer, foreign audience, `email_verified: false`, a
  quoted or non-boolean `email_verified`, a quoted, negative, fractional,
  exponent, leading-zero, or overflowing `exp`, a duplicated top-level claim,
  or an untrusted signing modulus is rejected in each case. A token signed
  under any other algorithm or key fails the fixed verification relation.
  Header, payload, signature, or public-output substitution is rejected. A
  cryptographically valid proof under an inactive signing modulus passes
  circuit verification but is rejected by the Consuming Contract.
- TEST-PLAT-07 (exercises REQ-PLAT-22, REQ-PLAT-09, REQ-PLAT-09A):
  A proof at or after `proofValidUntil`, and an attestation timestamp more than
  `maxFutureAttestationSkew` ahead of `block.timestamp`, are rejected. A later
  X or GitHub identity attestation advances `metadataObservedAt` without
  extending the token-attestation-derived `proofValidUntil`; Google uses its
  signed `exp` for both values.
- TEST-PLAT-08 (exercises REQ-PLAT-24):
  The trusted modulus set contains every modulus currently published at
  Google's JWKS endpoint, and every corresponding exponent is 65537.
- TEST-PLAT-09 (exercises REQ-PLAT-29, REQ-PLAT-46):
  A transcript whose disclosed `code` differs from the code consumed at
  redirect ingress is rejected on X and on GitHub.
- TEST-PLAT-09A (exercises REQ-PLAT-29A, REQ-PLAT-29B):
  An X proof that does not reveal the token request's `client_id`, or does not
  expose it as a public input, is rejected.
- TEST-PLAT-09B (exercises REQ-PLAT-30A, REQ-PLAT-32A):
  An X transcript that reveals plaintext `access_token` bytes in either
  session, or omits the bearer hash commitment, is rejected.
- TEST-PLAT-09C (exercises REQ-PLAT-29C):
  An X presentation that hides the `grant_type` or `redirect_uri` range is
  rejected, and the Canonical Runtime rejects a revealed value differing from
  its deployment profile.
- TEST-PLAT-10 (exercises REQ-PLAT-30, REQ-PLAT-31, REQ-PLAT-32, REQ-PLAT-36, REQ-PLAT-51, REQ-PLAT-52):
  A response missing the required field, carrying a duplicate, or carrying a
  differently typed value is rejected; GitHub rejects a response whose
  `token_type` or exact scope is wrong; and a proof whose two transcripts commit
  different bearers is rejected.
- TEST-PLAT-11 (exercises REQ-PLAT-33):
  A token request issued after the 30-second deadline is abandoned.
- TEST-PLAT-12 (exercises REQ-PLAT-34, REQ-PLAT-35, REQ-PLAT-35A, REQ-PLAT-35B, REQ-PLAT-35C, REQ-PLAT-35D):
  An authorization request carrying a scope other than `read:user` is rejected,
  and a transcript whose opened secret range contains `&` or `=` fails to
  prove.
- TEST-PLAT-13 (exercises REQ-PLAT-37, REQ-PLAT-38, REQ-PLAT-39, REQ-PLAT-40):
  Each over-limit, malformed, duplicate, and missing field on both token-proof
  interfaces is rejected.
- TEST-PLAT-14 (exercises REQ-PLAT-41, REQ-PLAT-42, REQ-PLAT-43, REQ-PLAT-43A, REQ-PLAT-43B, REQ-PLAT-43C, REQ-PLAT-43D, REQ-PLAT-43E):
  A request selecting an endpoint, client, or return URL is rejected; no state
  survives the call; a foreign origin is refused.
- TEST-PLAT-15 (exercises REQ-PLAT-44, REQ-PLAT-45, REQ-PLAT-47, REQ-PLAT-48, REQ-PLAT-49, REQ-PLAT-50):
  A token proof with a bad proof or notary signature, a foreign endpoint, a
  foreign client, a foreign verifier, or a bearer that does not open the
  commitment is discarded in each case, and no resume record is written.
- TEST-PLAT-15A (exercises REQ-PLAT-52, REQ-PLAT-52A):
  Substituting the Claim Digest, client identifier, either timestamp, either
  endpoint triple, or the revealed identity-response ranges between the token
  proof, identity attestation, and final proof is rejected. The final proof
  contains no bearer, bearer commitment, code, verifier, redirect URI, hidden
  range commitment, or detached identity field.
- TEST-PLAT-15B (exercises REQ-PLAT-32B):
  Substituting any REQ-PLAT-32B public input between the X token attestation,
  identity attestation, and final proof is rejected. The final X proof
  contains no bearer, bearer commitment, `pkceNonce`, hidden-range
  commitment, or detached identity field.
- TEST-PLAT-16 (exercises REQ-PLAT-53):
  A ceremony whose exchange response was lost restarts from authorization.
- TEST-PLAT-17 (exercises REQ-PLAT-01, REQ-PLAT-01A, REQ-PLAT-02, REQ-PLAT-03):
  A resume that substitutes a newer profile is rejected, an unlisted profile is
  ineligible, a profile missing either required verifier artifact is
  ineligible, and no claim field originates outside verified public inputs.
- TEST-PLAT-17A (exercises REQ-PLAT-03, REQ-PLAT-31A, REQ-PLAT-51A):
  Pair authenticated X or GitHub identity-response bytes for account B with a
  detached `userId`, handle, or metadata value for account A. The runtime
  rejects the extra representation; without it, the runtime and Consuming
  Contract both derive account B byte for byte.
- TEST-PLAT-18 (exercises REQ-PLAT-25, REQ-PLAT-26, REQ-PLAT-27):
  Launch uses Proxy mode, rejects application or request selection of Browser
  MPC, uses no application-controlled platform egress, and carries no partial
  transcript state into a retry.
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

X and GitHub request-field uniqueness likewise rests on their fixed token
endpoints' decoded-form behavior (ASM-PROV-07), rather than a complete grammar
proof. The authenticated authority, method, and path plus the endpoint's
refusal of other media types scope that assumption to the behavior exercised
by TEST-PLAT-19. If an endpoint begins accepting any duplicate profile field,
its profile is ineligible until a new proof construction closes the ambiguity.

A malicious Token-Proof Service cannot rebind a ceremony to other call data,
because the Claim Digest fixes it before the platform is contacted. It can
withhold, and it can attempt to substitute a token obtained under a
separately arranged authorization; REQ-PLAT-46 rejects that substitution by
requiring the proven code to be the one this ceremony consumed. A proof
built outside the Canonical Runtime performs no such check, so a submission
of that proof is bounded by the caller-authentication rule stated in
[common §12](ceremony-common.md#12-security-considerations).

The notary key is a trust root for X and GitHub evidence. Its compromise
mints fresh evidence until the key is removed, and does not revoke authority
already committed.

Google has no Token-Proof Service or deployment-visible authorization
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
