# libID identity-platform ceremonies

Status: proposed normative identity-evidence and ceremony specification for
the launch identity platforms. Companion to the
[common ceremony rules](libid-ceremony-common.md).

## 1. Scope

This document is the normative owner of each platform's OAuth profile,
authenticated identity fields, evidence composition, proof-validity ceiling,
exchange service, and platform-specific failure behavior. The
[common ceremony rules](libid-ceremony-common.md) own the claim digest,
serialization, PKCE, transcript extraction, client binding, and evidence
time. The contract protocol owns registry dispatch and trust-root governance.
The browser protocol owns browsing contexts, callback transport, storage,
resume, and runtime handoff.

Every launch platform uses the OAuth authorization-code flow. Identity
evidence is either an OIDC ID Token signed by the platform (Google) or a
notarized transcript of an authenticated platform API response (X, GitHub).

## 2. Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

Terms are imported from
[common ceremony rules §3](libid-ceremony-common.md#3-terminology).

## 3. Ceremony profiles

Each platform ceremony has an independently versioned immutable profile:
`google/v1`, `x/v1`, `github/v1`.

- REQ-PLAT-01:
  The Canonical Runtime MUST record in the ceremony state the exact profile it
  selected. The Canonical Runtime MUST NOT substitute another profile on
  resume. Necessity: a resumed ceremony that changed profile would produce
  evidence the selected verifier cannot check.
- REQ-PLAT-02:
  The Canonical Runtime MUST treat a profile as ineligible until the
  application's authenticated profile lists it and the generated deployment
  contains every fixed route it requires. Necessity: cross-component
  interoperability between runtime and deployment.
- REQ-PLAT-03 (upholds SP-CLIENT-01):
  The Canonical Runtime MUST construct the verified claim exclusively from
  locally verified proof public inputs.

### 3.1 Canonical platform user identifiers

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

### 3.2 Metadata ordering and validity ceilings

| Identity platform | `metadataObservedAt` | `proofValidUntil` — first invalid timestamp |
|---|---|---|
| Google | signed ID-Token `iat` | `min(signed exp + CLOCK_SKEW_GRACE, trustedUntil)` |
| X | signed `meAttest.timestamp` | `min(tokenAttest.timestamp, meAttest.timestamp) + 10 minutes` |
| GitHub | signed `userAttest.timestamp` | `min(tokenAttest.timestamp, userAttest.timestamp) + 10 minutes` |

For X and GitHub, "timestamp" is the signed TLSNotary attestation creation
time.

- REQ-PLAT-09 (upholds SP-FRESH-01):
  The Consuming Contract MUST reject an X or GitHub attestation timestamp more
  than five minutes ahead of `block.timestamp`.

## 4. Google OIDC ceremony

Google uses the authorization-code flow with a confidential client. Identity
evidence is the signed ID Token returned by the token endpoint.

### 4.1 Authorization request

`GET https://accounts.google.com/o/oauth2/v2/auth`, serialized per
[common §7](libid-ceremony-common.md#7-canonical-oauth-serialization):

| Order | Field | Exact value |
|---|---|---|
| 1 | `response_type` | `code` |
| 2 | `client_id` | configured client identifier |
| 3 | `redirect_uri` | immutable callback URI |
| 4 | `scope` | `openid email` |
| 5 | `state` | immutable one-use OAuth state |
| 6 | `nonce` | `BASE64URL_NOPAD(bytes32(claimDigest))` |
| 7 | `prompt` | `select_account` |

- REQ-PLAT-10 (upholds SP-BIND-01):
  The Canonical Runtime MUST set `nonce` to the base64url encoding of the 32
  Claim Digest bytes, not to hexadecimal text.
- REQ-PLAT-11:
  The Canonical Runtime MUST send `prompt=select_account`. Necessity: without
  it Google reuses whichever session is already active, and the ceremony cannot
  establish which account the user intended.
- REQ-PLAT-12 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST require exactly one `state` and exactly one `code`
  XOR `error`. The Canonical Runtime MUST reject duplicate, additional
  authoritative, mixed, or malformed fields.

Conformance vector, for the Claim Digest of
[common §6](libid-ceremony-common.md#6-claim-digest):

```text
claimDigest  = 0x0f2c7b78eb48061ef5ee980dbab5d7d80326c6e343e29ad6c8803b7fb46cf8ef
Google nonce = Dyx7eOtIBh717pgNurXX2AMmxuND4prWyIA7f7Rs-O8
```

### 4.2 Token exchange

`POST https://oauth2.googleapis.com/token`, media type
`application/x-www-form-urlencoded`:

| Order | Field | Exact value |
|---|---|---|
| 1 | `grant_type` | `authorization_code` |
| 2 | `client_id` | configured client identifier |
| 3 | `code` | consumed callback code |
| 4 | `redirect_uri` | immutable callback URI |
| 5 | `client_secret` | compiled deployment secret; this exchange is not notarized |

- REQ-PLAT-13 (upholds SP-EXCHANGE-01):
  The Exchange Service MUST send the `code` consumed at callback ingress for
  the matching `state`. The Exchange Service MUST reject a request whose
  `state` has no live record.
- REQ-PLAT-14 (upholds SP-BIND-01):
  The Canonical Runtime MUST reject an ID Token whose `nonce` differs from the
  Claim Digest it constructed.
- REQ-PLAT-15:
  The Exchange Service MUST discard the returned `access_token` after
  extracting the ID Token. The Exchange Service MUST NOT log, persist, or
  forward it. Necessity: the ceremony requires no API capability, so retaining
  one creates a credential with no protocol purpose.

### 4.3 Proof statement

The Proving Circuit and consuming contract enforce all of the following:

- REQ-PLAT-16 (upholds SP-CLIENT-01):
  The Proving Circuit MUST prove Google's signature over the ID Token under a
  key whose modulus the registry lists as trusted.
- REQ-PLAT-17 (upholds SP-BIND-01):
  The Proving Circuit MUST prove the signed `iss` equals
  `https://accounts.google.com`.
- REQ-PLAT-18 (upholds SP-BIND-01):
  The Proving Circuit MUST prove `nonce` equals the Claim Digest.
- REQ-PLAT-19 (upholds SP-CLIENT-01):
  The Proving Circuit MUST expose the signed `aud` as the client-binding public
  input.
- REQ-PLAT-20:
  The Proving Circuit MUST prove `email_verified` is the boolean `true`.
  Necessity: an unverified email would let one account assert another party's
  address as its handle.
- REQ-PLAT-21 (upholds SP-BIND-01):
  The Proving Circuit MUST require exactly one top-level value of the required
  type for `iss`, `sub`, `aud`, `iat`, `exp`, `nonce`, `email`, and
  `email_verified`. The Proving Circuit MUST reject duplicate keys, type
  substitution, and nested lookalikes.
- REQ-PLAT-22 (upholds SP-FRESH-01):
  The Consuming Contract MUST reject a proof whose signed `exp` places
  `proofValidUntil` at or before `block.timestamp`.

The signing key is fetched from Google's JWKS endpoint as witness input.

- REQ-PLAT-23 (upholds SP-CLIENT-01):
  The Consuming Contract MUST reject a proof whose signing modulus is absent
  from the registry's active trusted Google modulus set.
- REQ-PLAT-24:
  The Registry Governance Process MUST add a newly published Google modulus to
  the trusted set before Google signs with it in production. Necessity: Google
  rotates signing keys on the order of weekly, so every Google ceremony fails
  closed while an active modulus is untrusted.

## 5. Browser TLSNotary transport profiles

X's `/2/oauth2/token` and `/2/users/me` sessions and GitHub's `/user` session
use one of the following deployment-qualified transports.

| Property | Proxy profile | Browser MPC profile |
|---|---|---|
| Platform connection | notary connects to the pinned platform endpoint | deployment module supplies an encrypted WebSocket-to-TCP bridge |
| Platform sees | notary egress | application callback-origin egress |
| Deployment sees OAuth plaintext | no | no |
| Soundness | notary-to-platform path must not be adversarial | survives an adversarial byte bridge |
| Cost | lower bandwidth, latency, rounds | higher browser and deployment cost |

- REQ-PLAT-25 (upholds SP-EXCHANGE-01):
  The Implementation MUST NOT carry a partial transcript or TLS state across a
  retry between transports.
- REQ-PLAT-26 (upholds SP-EXCHANGE-01):
  The Implementation MUST NOT use application-controlled platform egress in the
  Proxy profile, because the prover holds the session keys and prover-egress
  collusion could inject authenticated server-direction records.
- REQ-PLAT-27:
  The Deployment MUST restrict each bridge route to one fixed target:
  `/tls/bridge/x` to `api.x.com:443`, and `/tls/bridge/github-user` to
  `api.github.com:443`. Necessity: a bridge that accepts a caller-chosen
  destination is a general-purpose proxy on the Deployment origin.
- REQ-PLAT-28:
  The Deployment MUST accept no action, claim, stage, job, destination,
  callback, or return field. The Deployment MUST discard the byte stream on
  close. Necessity: the bridge is untrusted by construction, so ceremony
  soundness must not depend on it authenticating anything.

## 6. X ceremony

X uses a public client with S256 PKCE and two browser-owned TLSNotary
sessions.

### 6.1 Authorization request

`GET https://x.com/i/oauth2/authorize`:

| Order | Field | Exact value |
|---|---|---|
| 1 | `response_type` | `code` |
| 2 | `client_id` | configured client identifier |
| 3 | `redirect_uri` | immutable callback URI |
| 4 | `scope` | `tweet.read users.read` |
| 5 | `state` | immutable one-use OAuth state |
| 6 | `code_challenge` | PKCE challenge per common §8 |
| 7 | `code_challenge_method` | `S256` |

### 6.2 Token request

`POST https://api.x.com/2/oauth2/token`, media type
`application/x-www-form-urlencoded`, `Accept: application/json`:

| Order | Field | Exact value |
|---|---|---|
| 1 | `grant_type` | `authorization_code` |
| 2 | `client_id` | configured client identifier |
| 3 | `code` | consumed callback code |
| 4 | `redirect_uri` | immutable callback URI |
| 5 | `code_verifier` | PKCE verifier per common §8 |

X and GitHub share this field order and this template.

- REQ-PLAT-29 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST disclose the token request's `code` range. The
  Proving Circuit MUST assert byte equality with the code consumed at callback
  ingress.
- REQ-PLAT-30 (upholds SP-BIND-01):
  The Proving Circuit MUST require exactly one nonempty printable-ASCII
  top-level `access_token` string of at most 4096 bytes in the token response.

### 6.3 Identity request

`GET https://api.x.com/2/users/me` with no query,
`Authorization: Bearer <access_token>`, `Accept: application/json`.

- REQ-PLAT-31 (upholds SP-BIND-01):
  The Proving Circuit MUST require one top-level `data` object carrying exactly
  one string `id` and one string `username`. The Proving Circuit MUST reject
  duplicate, nested-lookalike, differently typed, and out-of-object fields.
- REQ-PLAT-32 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST assert the same bearer commitment across the token
  transcript and the identity transcript.

Public proof inputs are the Claim Digest, the client identifier, both
attestation timestamps, and the identity fields. The bearer is committed and
never disclosed. The `code_verifier` is recomputed in circuit per
REQ-COMMON-15.

- REQ-PLAT-33 (upholds SP-FRESH-01):
  The Canonical Runtime MUST complete the token request within X's
  authorization-code deadline of 30 seconds. The Canonical Runtime MUST abandon
  the ceremony otherwise.

## 7. GitHub ceremony

GitHub uses a confidential client, a deployment-owned token-exchange
TLSNotary session, and a browser-owned `/user` TLSNotary session. The
structure matches X: two attestations, one bearer linked across both, one
proof binding both to the Claim Digest. The exchange runs server-side because
the client is confidential, which makes the Exchange Service the prover for
that transcript.

### 7.1 Authorization request

`GET https://github.com/login/oauth/authorize`:

| Order | Field | Exact value |
|---|---|---|
| 1 | `client_id` | configured client identifier |
| 2 | `redirect_uri` | immutable callback URI |
| 3 | `scope` | `read:user` |
| 4 | `state` | immutable one-use OAuth state |
| 5 | `code_challenge` | PKCE challenge per common §8 |
| 6 | `code_challenge_method` | `S256` |

- REQ-PLAT-34:
  The Canonical Runtime MUST request exactly `read:user`. Necessity: GitHub
  inherits previously granted scopes for the same OAuth application, so an
  omitted scope does not yield a known grant.

### 7.2 Token exchange

`POST https://github.com/login/oauth/access_token`, media type
`application/x-www-form-urlencoded`, `Accept: application/json`:

| Order | Field | Exact value |
|---|---|---|
| 1 | `grant_type` | `authorization_code` |
| 2 | `client_id` | configured client identifier |
| 3 | `code` | consumed callback code |
| 4 | `redirect_uri` | immutable callback URI |
| 5 | `code_verifier` | PKCE verifier per common §8 |
| 6 | `client_secret` | compiled deployment secret; redacted, never revealed |

Fields 1 through 5 are identical in order and meaning to §6.2.
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
- REQ-PLAT-36 (upholds SP-BIND-01):
  The Proving Circuit MUST require exactly one nonempty printable-ASCII
  top-level `access_token` string of at most 4096 bytes in the exchange
  response.

### 7.3 Exchange service

The Deployment exposes one stateless exchange handler at the fixed
`/oauth/github/exchange` route on the callback origin.

```ts
interface GitHubExchangeRequestV1 {
  schema: 1
  code: string
  codeVerifier: string
}

interface GitHubExchangeResponseV1 {
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
  `MAX_GITHUB_ACCESS_TOKEN_BYTES = 4096`, a decoded attestation exceeding
  `MAX_GITHUB_TOKEN_ATTESTATION_BYTES = 2 MiB`, and a response body exceeding
  `MAX_GITHUB_EXCHANGE_RESPONSE_BYTES = 3 MiB`. Necessity: bounded parsing.
- REQ-PLAT-40:
  The Implementation MUST reject duplicate, missing, additional, differently
  typed, and malformed fields on both interfaces. Necessity: cross-component
  interoperability.
- REQ-PLAT-41 (upholds SP-EXCHANGE-01):
  The Exchange Service MUST use only its compiled client identifier, client
  secret, callback URI, token endpoint, and notary configuration. The Exchange
  Service MUST NOT accept a caller-selected action, job, client, redirect,
  endpoint, return URL, or operation.
- REQ-PLAT-42:
  The Exchange Service MUST persist no code, verifier, bearer, attestation,
  result, or progress state. The Exchange Service MUST expose no polling or
  result route. Necessity: the service holds ceremony credentials, so retention
  creates a compromise target with no protocol purpose.
- REQ-PLAT-43:
  The Exchange Service MUST accept only the compiled Canonical Runtime origin.
  Necessity: limits accidental browser disclosure; it is not caller
  authentication.
- REQ-PLAT-43A:
  The Exchange Service MUST answer the CORS preflight for that origin.
  Necessity: cross-component interoperability with the Canonical Runtime.
- REQ-PLAT-43B:
  The Exchange Service MUST reject redirects. Necessity: a followed redirect
  would notarize a session other than the pinned token endpoint.
- REQ-PLAT-43C:
  The Exchange Service MUST emit `Cache-Control: no-store`. Necessity: the
  response carries a bearer token.

### 7.4 Disclosure and verification

The exchange transcript discloses exactly three request ranges — `client_id`,
`code`, and `code_verifier` — plus the response status and the token
commitment.

- REQ-PLAT-44 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST verify the exchange attestation under the
  configured GitHub notary key before using the bearer.
- REQ-PLAT-45 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST require the attested TLS server and path to be
  GitHub's token endpoint.
- REQ-PLAT-46 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST require the disclosed `code` to equal the code it
  consumed at callback ingress, byte for byte.
- REQ-PLAT-47 (upholds SP-CLIENT-01):
  The Canonical Runtime MUST require the disclosed `client_id` to equal its
  configured client.
- REQ-PLAT-48 (upholds SP-BIND-01):
  The Canonical Runtime MUST require the disclosed `code_verifier` to equal the
  verifier it derived.
- REQ-PLAT-49 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST require the returned bearer to open the attested
  token-response commitment.
- REQ-PLAT-50 (upholds SP-EXCHANGE-01):
  The Canonical Runtime MUST discard the response and start neither `/user` nor
  a resume record when any check in REQ-PLAT-44 through REQ-PLAT-49 fails.

Verifying only the disclosed ranges is insufficient, which is why
REQ-COMMON-18 requires the full request as a private witness: a prover that
composes the request could otherwise hide a second `code` or `code_verifier`
in an unverified range and let GitHub honor that copy.

### 7.5 Identity request

`GET https://api.github.com/user` with no query,
`Authorization: Bearer <access_token>`, `Accept: application/vnd.github+json`,
`X-GitHub-Api-Version: 2022-11-28`.

- REQ-PLAT-51 (upholds SP-BIND-01):
  The Proving Circuit MUST require exactly one top-level `id` JSON integer and
  one top-level `login` string. The Proving Circuit MUST reject duplicate,
  nested-lookalike, differently typed, and noncanonical values.
- REQ-PLAT-52 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST assert the same bearer commitment across the
  exchange transcript and the identity transcript.

Changing the pinned API version is a profile and verifier revision, not
runtime configuration. The granted scope is not a proof input: `/user.id` and
`/user.login` are authentic at any scope, and the bearer is never disclosed.

- REQ-PLAT-53:
  The Exchange Service MUST NOT promise idempotency or replay. The Canonical
  Runtime MUST start a fresh ceremony when GitHub consumed the code but no
  response reached it. Necessity: the exchange is a single-use, non-recoverable
  step.

## 8. Adding an identity platform

The Platform Profile for a new platform MUST define a stable platform
identifier and immutable
user-ID namespace; canonical handle normalization and authenticated
observation ordering; client portability or a bounded client family; exact
authorization and callback transport; every authenticated request and
response field with its provenance; how the Claim Digest is carried through
that platform's authorization; its authenticated client-binding source; an
authenticated proof-validity ceiling; its trust root and registry lifecycle;
browser and deployment data exposure, retry, resume, and withholding
behavior; and conformance vectors.

## 9. Conformance

Roles: Canonical Runtime, Exchange Service, proving circuit, consuming
contract.

- TEST-PLAT-01 (exercises REQ-PLAT-10, REQ-PLAT-18):
  The §4.1 nonce vector reproduces exactly, and a token carrying another nonce
  is rejected.
- TEST-PLAT-02 (exercises REQ-PLAT-04, REQ-PLAT-05, REQ-PLAT-06, REQ-PLAT-07, REQ-PLAT-08):
  The §3.1 identifier vectors reproduce, and each listed malformed identifier
  is rejected.
- TEST-PLAT-03 (exercises REQ-PLAT-11, REQ-PLAT-12):
  An authorization request omitting `prompt` is rejected, and a callback
  carrying duplicate `state` or both `code` and `error` is rejected.
- TEST-PLAT-04 (exercises REQ-PLAT-13, REQ-PLAT-14):
  An exchange for a `state` with no live record is rejected, and an ID Token
  whose `nonce` is not the constructed digest is rejected.
- TEST-PLAT-05 (exercises REQ-PLAT-15):
  No artifact or log retains a Google access token. Verification: inspection of
  the emitted artifacts.
- TEST-PLAT-06 (exercises REQ-PLAT-16, REQ-PLAT-17, REQ-PLAT-19, REQ-PLAT-20, REQ-PLAT-21, REQ-PLAT-23):
  A token with a foreign issuer, foreign audience, `email_verified: false`, a
  duplicated top-level claim, or an untrusted signing modulus is rejected in
  each case.
- TEST-PLAT-07 (exercises REQ-PLAT-22, REQ-PLAT-09):
  A proof at or after `proofValidUntil`, and an attestation timestamp more than
  five minutes ahead of `block.timestamp`, are rejected.
- TEST-PLAT-08 (exercises REQ-PLAT-24):
  The trusted modulus set contains every modulus currently published at
  Google's JWKS endpoint.
- TEST-PLAT-09 (exercises REQ-PLAT-29, REQ-PLAT-46):
  A transcript whose disclosed `code` differs from the code consumed at
  callback ingress is rejected on X and on GitHub.
- TEST-PLAT-10 (exercises REQ-PLAT-30, REQ-PLAT-31, REQ-PLAT-32, REQ-PLAT-36, REQ-PLAT-51, REQ-PLAT-52):
  A response missing the required field, carrying a duplicate, or carrying a
  differently typed value is rejected, and a proof whose two transcripts commit
  different bearers is rejected.
- TEST-PLAT-11 (exercises REQ-PLAT-33):
  A token request issued after the 30-second deadline is abandoned.
- TEST-PLAT-12 (exercises REQ-PLAT-34, REQ-PLAT-35, REQ-PLAT-35A, REQ-PLAT-35B, REQ-PLAT-35C):
  An authorization request carrying a scope other than `read:user` is rejected,
  and a transcript whose undisclosed secret range contains `&` or `=` is
  rejected.
- TEST-PLAT-13 (exercises REQ-PLAT-37, REQ-PLAT-38, REQ-PLAT-39, REQ-PLAT-40):
  Each over-limit, malformed, duplicate, and missing field on both exchange
  interfaces is rejected.
- TEST-PLAT-14 (exercises REQ-PLAT-41, REQ-PLAT-42, REQ-PLAT-43, REQ-PLAT-43A, REQ-PLAT-43B, REQ-PLAT-43C):
  A request selecting an endpoint, client, or return URL is rejected; no state
  survives the call; a foreign origin is refused.
- TEST-PLAT-15 (exercises REQ-PLAT-44, REQ-PLAT-45, REQ-PLAT-47, REQ-PLAT-48, REQ-PLAT-49, REQ-PLAT-50):
  An attestation with a bad notary signature, a foreign endpoint, a foreign
  client, a foreign verifier, or a bearer that does not open the commitment is
  discarded in each case, and no resume record is written.
- TEST-PLAT-16 (exercises REQ-PLAT-53):
  A ceremony whose exchange response was lost restarts from authorization.
- TEST-PLAT-17 (exercises REQ-PLAT-01, REQ-PLAT-02, REQ-PLAT-03):
  A resume that substitutes a newer profile is rejected, an unlisted profile is
  ineligible, and no claim field originates outside verified public inputs.
- TEST-PLAT-18 (exercises REQ-PLAT-25, REQ-PLAT-26, REQ-PLAT-27, REQ-PLAT-28):
  A bridge route asked for a foreign destination refuses, and a transport retry
  carries no prior transcript state.

## 10. Security Considerations

This document enforces SP-BIND-01, SP-CLIENT-01, SP-EXCHANGE-01, and
SP-FRESH-01 for the launch platforms, under the assumptions of
[common §4](libid-ceremony-common.md#4-assumptions).

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

A malicious Exchange Service cannot rebind a ceremony to other call data,
because the Claim Digest fixes it before the platform is contacted. It can
withhold, and it can attempt to substitute a token obtained under a
separately arranged authorization; REQ-PLAT-46 rejects that substitution by
requiring the attested code to be the one this ceremony consumed. A proof
built outside the Canonical Runtime performs no such check, so a submission
of that proof is bounded by the caller-authentication rule stated in
[common §13](libid-ceremony-common.md#13-security-considerations).

The notary key is a trust root for X and GitHub evidence. Its compromise
mints fresh evidence until the key is removed, and does not revoke authority
already committed.

Google's JWKS rotation makes the trusted modulus set a liveness dependency
(REQ-PLAT-24): every Google ceremony fails closed while Google signs with an
untrusted modulus.

## 11. References

Normative: [RFC2119], [RFC8174], [RFC6749], [RFC7636], [RFC7519], [OIDC],
[RFC8446].

Informative: [RFC9700], [TLSNotary-Proxy].
