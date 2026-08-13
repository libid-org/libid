# libID identity-platform ceremonies

Status: proposed normative identity-evidence and ceremony specification for
the launch identity platforms. Companion to the
[common ceremony rules](libid-ceremony-common.md).

The core identity, contract, browser, and developer-integration specifications
define the claim format, Registry and trust-root governance, browser lifecycle,
and application deployment referenced here. Those boundaries are dependencies,
not part of this ceremony-specific specification.

This document is the sole normative home for each platform's OAuth/OIDC
profile, authenticated identity fields, evidence composition, client binding,
proof-validity ceiling, exchange service, and platform-specific failure
behavior. The [common ceremony rules](libid-ceremony-common.md) own shared
transition, serialization, PKCE, and evidence-time behavior. The
identity boundary owns the common claim and identity model. The contract
protocol owns Registry dispatch and trust-root governance. The browser protocol
owns browsing contexts, callback transport, storage, resume, CSP, COOP, and
runtime handoff. Developer integration owns only platform enablement, the
application profile, and deployment of required confidential callback routes.

In this suite, an **identity platform** is Google, X, GitHub, or a future source
of authenticated identity evidence. “Provider” is reserved for a formal
standards term such as OIDC Provider and for the EIP-1193 wallet provider. A
**platform ceremony** is the complete operation which turns one platform
authorization into a locally verified `VerifiedClaimV1`.

## Common ceremony contract

Each platform ceremony has an independently versioned immutable profile, such
as `google/v1`, `x/v1`, or `github/v1`. A profile owns that platform's exact
authorization and callback grammar, canonical identity extraction, exchange or
encrypted-transport route contract, authenticated transcripts, proof
construction, verifier compatibility, and validity rules. Changing one does
not version another platform or the Tier 1/WebWallet client APIs.

The canonical runtime manifest lists the ceremony profiles it implements. A
new job selects the current profile compatible with its platform, application
OAuth configuration, chain catalog, proof domain, and verifier revision, then
stores that exact profile in `PlatformCeremonyStateV1`. Resume never substitutes
a newer profile. A profile requiring new scopes, client settings, secrets, or
platform registration is ineligible until the application's authenticated
profile lists that ceremony profile and its generated callback deployment
contains every fixed server route it requires;
compatible circuit or verifier updates may become
current without application code changes.

Profile identifiers and runtime releases are immutable. Older profiles and the
fixed request/response routes they own remain available through their
published deprecation window and every live job lifetime. A revoked proof root
or ceremony profile fails closed and requires a fresh supported action.

Every platform ceremony follows the shared
[transition and terminal-output contract](libid-ceremony-common.md#ceremony-transition-and-terminal-output).
Its terminal output is only `VerifiedIdentityCeremonyV1`; intermediate
operations return the next exact ceremony state for runtime commit. The
canonical claim encoding, deployment domain, intent values, nullifier, and
platform IDs are defined by the core identity specification.

The canonical popup constructs `VerifiedClaimV1` exclusively from locally
verified proof public inputs. Generated callback routes, callback pages, application
code, and unproved sidecar metadata cannot supply or override `userId`,
`handle`, `metadataObservedAt`, client binding, or another claim field. Registry
repeats proof verification on chain.

### Canonical platform user IDs

Each launch platform uses an immutable account ID portable across that
platform's OAuth applications. `VerifiedClaimV1.userId` is the following exact
string; no caller, JSON library, or display formatter may rewrite it:

| Identity platform | Authenticated source | Canonical `userId` | Mutable handle |
|---|---|---|---|
| Google | signed ID-token `sub` | its exact 1–255 case-sensitive ASCII bytes | normalized email |
| X | `/2/users/me.data.id` JSON string | canonical nonzero `uint64` decimal | normalized `username` |
| GitHub | `/user.id` JSON integer token | canonical nonzero `uint64` decimal | normalized `login` |

Google accepts bytes `0x20` through `0x7e`, rejects empty, control, non-ASCII,
and over-255-byte values, and performs no trimming or case conversion. X
requires `^[1-9][0-9]{0,19}$` and numeric value at most `uint64.max`. GitHub
requires the raw JSON number token to match the same grammar and bound, then
copies those decimal bytes as the string; it never parses through JavaScript
`number`, accepts exponent notation, or rounds the value. These launch bounds
are part of identity compatibility, not display validation.

Canonical vectors are:

| Platform | Authenticated input | `userId` |
|---|---|---|
| Google | `sub: "123456789012345678901"` | `123456789012345678901` |
| X | `"id":"2244994945"` | `2244994945` |
| GitHub | `"id":1` | `1` |

Empty values, leading zeroes for numeric IDs, signs, fractions, exponents,
values above `uint64.max`, GitHub quoted IDs, X numeric IDs, and any
normalization of Google `sub` fail before `VerifiedClaimV1` construction.

These platform definitions follow
[Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect),
[OIDC public subjects](https://openid.net/specs/openid-connect-core-1_0-18.html#SubjectIDTypes),
[X IDs](https://docs.x.com/fundamentals/x-ids),
[GitHub durable IDs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app#use-the-durable-unique-id-to-store-the-user),
and [GitHub username changes](https://docs.github.com/en/account-and-profile/concepts/username-changes).

Email, audience, client ID, X username, and GitHub login never replace the
immutable `userId`. A future platform may participate in clean-device recovery
only if its account ID is stable across the supported client family. Pairwise
subjects require a stable client family or a distinct platform/identity model.

The platform ceremony validates its configured OAuth client locally. Client ID,
audience, callback origin, frontend origin, and application
authorization are deliberately absent from Registry binding and wallet policy.
They prevent a browser ceremony from accepting evidence issued to another
application; they do not create on-chain application admission.

The verifier authenticates mutable-metadata ordering independently from wallet
authority:

| Identity platform | `metadataObservedAt` |
|---|---|
| Google | signed ID-token `iat` |
| X | exact signed `meAttest.timestamp` |
| GitHub | exact signed `userAttest.timestamp` |

X and GitHub use the shared
[proof-bound PKCE construction](libid-ceremony-common.md#shared-pkce-construction).
For metadata ordering, “timestamp” above always means the signed TLSNotary
attestation creation time, not an HTTP `Date` header, response field, browser
receipt time, or backend clock.

The browser chooses `claimExpiresAt` before authorization, but every platform
verifier derives and enforces a stricter authenticated ceiling:

| Identity platform | `proofValidUntil` — first invalid timestamp |
|---|---|
| Google | `min(signed JWT exp + CLOCK_SKEW_GRACE, trustedUntil)` |
| X | `min(tokenAttest.timestamp, meAttest.timestamp) + 10 minutes` |
| GitHub | `min(tokenAttest.timestamp, userAttest.timestamp) + 10 minutes` |

The common [evidence-time rules](libid-ceremony-common.md#common-evidence-time-rules)
apply. X and GitHub reject either attestation timestamp when it is more than
five minutes ahead of `block.timestamp`; the ten-minute additions use checked
arithmetic.

The common callback, ingress, one-use continuation, encrypted
`CeremonyResumeV1`, progress, cancellation, and local-proof-verification rules
are owned by the browser specification. No platform
ceremony creates a backend proof job, result capability, polling API, or
platform-specific callback database.

libID's operator supplies the configured notary services. Application
developers neither run nor select a notary at runtime. A generated server
module may connect to that fixed service, but its caller cannot substitute the
notary, platform endpoint, OAuth client, redirect URI, or proof circuit.

## Google OIDC ceremony

Google uses direct authentication-only OIDC. The user ceremony has no token
exchange, client secret, PKCE, or live notary.

### Google authorization profile

The request is `GET https://accounts.google.com/o/oauth2/v2/auth` with this
exact ordered tuple under the
[common serializer](libid-ceremony-common.md#canonical-oauth-serialization):

| Order | Field | Exact value |
|---|---|---|
| 1 | `response_type` | `id_token` |
| 2 | `response_mode` | `fragment` |
| 3 | `client_id` | configured client ID |
| 4 | `redirect_uri` | immutable `PlatformFlightV1.callbackUri` |
| 5 | `scope` | `openid email` |
| 6 | `state` | immutable one-use OAuth state |
| 7 | `nonce` | `BASE64URL_NOPAD(bytes32(claimDigest))` |

No prompt, login hint, hosted domain, incremental authorization, access-token
response type, or additional scope is present in the launch profile.

Google returns through the registered callback fragment. After the common
trampoline labels that raw transport, ingress requires `transport=fragment`,
exactly one `state`, and exactly one `id_token` XOR `error`. It ignores and
scrubs diagnostic fields, including unsigned `iss`; only the issuer inside the
signed token is authoritative.

The `nonce` is
`BASE64URL_NOPAD(bytes32(claimDigest))`: the 32 digest bytes, not hexadecimal
text. The result is exactly 43 ASCII characters. The circuit and verifier prove
or enforce all of the following:

- Google's signature and exact signed issuer `https://accounts.google.com`;
- token expiry and the platform proof-validity ceiling;
- `nonce` equal to the immutable action's `claimDigest`;
- immutable `sub` as `userId`;
- normalized email as `handle`;
- the exact Boolean `email_verified: true`;
- signed `iat` as `metadataObservedAt`; and
- `aud` equal to the immutable action's configured client.

The signed JWT payload must contain exactly one top-level value of the required
type for `iss`, `sub`, `aud`, `iat`, `exp`, `nonce`, `email`, and
`email_verified`. Duplicate keys, type substitution, nested lookalikes, or a
second accepted occurrence fail. The canonical user-ID and handle rules above
apply before proof construction.

For the common RegisterSession and Bootstrap claim vectors, respectively:

```text
claimDigest             = 0x2c66fac6f79187cf540f2b16b54bfbbaca093ed6b2a5f88be16444615a88ff78
Google nonce            = LGb6xveRh89UDysWtUv7usoJPtaypfiL4WREYVqI_3g

Bootstrap claimDigest   = 0xb3e63675eece3203732883593df6ce43e36367c652d16127a56b4e286f02e41f
Bootstrap Google nonce  = s-Y2de7OMgNzKINZPfbOQ-NjZ8ZS0WEnpWtOKG8C5B8
```

ASCII-hex, padding, a legacy address-valued nonce, or any altered claim field
fails verification.

The current RSA key is fetched from Google's fixed JWKS origin as witness
input. It has authority only when its exact modulus belongs to the Registry's
active trusted Google modulus set. A browser
JWKS response alone cannot authorize a claim.

The audience check authenticates the application ceremony locally but is not
identity or Registry admission. The signed claim digest already binds
deployment, intent, platform, target, session, and expiry. The verifier must
not treat legacy prover-selected chain or Registry public inputs as signed
authority.

## Browser TLSNotary transport profiles

Every browser-owned TLSNotary attempt uses one of the following deployment-
qualified transport modes. This applies to X's `/token` and `/2/users/me`
sessions and GitHub's `/user` session. Transport is not durable ceremony
identity: notarization is one atomic recomputable step, so an interrupted
attempt may retry through another mode qualified by the same deployment without
changing the ceremony profile or verified output. No partial transcript or TLS
state crosses that retry. GitHub's callback-deployment-owned confidential token exchange
is a separate server-side session and does not use either browser transport
mode.

| Property | Proxy profile | Browser MPC profile |
|---|---|---|
| Platform connection | notary connects directly to the pinned platform endpoint | generated callback-deployment module supplies an encrypted WebSocket-to-TCP byte bridge |
| Platform sees | notary egress | application callback-origin egress |
| Callback deployment sees OAuth plaintext | no | no |
| Soundness | notary-to-platform network path must not be adversarial | survives an adversarial byte bridge |
| Cost | lower bandwidth, latency, and rounds | higher browser and callback-deployment cost |

A browser cannot open raw TCP. In the browser MPC profile, the TLSNotary
worker supplies its server I/O through the generated WebSocket-to-TCP bridge;
the MPC protocol and request construction remain in the browser. The bridge is
a transport adapter, not TLSNotary Proxy mode, and no browser extension is
required for these fixed requests. In the Proxy profile, the browser supplies
no server socket and the notary opens the platform connection.

Proxy mode never uses application-controlled platform egress: the prover holds
the TLS session keys, so prover/egress collusion could inject authenticated
server-direction records. Application egress is safe only in the browser MPC
profile's untrusted encrypted-byte bridge. This is the additional network-path
assumption documented for
[TLSNotary Proxy mode](https://tlsnotary.org/docs/protocol/proxy-mode/).

The generated MPC module exposes one stateless fixed-target WebSocket route per
enabled browser role: `/tls/bridge/x` can open only `api.x.com:443`, and
`/tls/bridge/github-user` can open only `api.github.com:443`. A route accepts no
action, claim, stage, job, destination, callback, or return field. It retains
only the live encrypted byte stream and discards it on close. The generated
manifest pins its origin, handshake, connection, concurrency, byte, and time
limits for the qualified build; applications cannot widen them at runtime.
Because each bridge is deliberately untrusted, ceremony soundness does not
depend on it authenticating an action or understanding proof state.

Launch qualification runs both profiles against every exact browser-owned
platform transcript using pinned libraries, circuits, regions, and immutable
assets. It covers cold and warm caches, the supported desktop/mobile matrix,
constrained bandwidth, high RTT, suspension/resumption, proof latency, success
rate, bytes, memory/CPU/battery, cancellation, egress IP, and hostile MPC
bridge mutation. Published
[TLSNotary browser benchmarks](https://tlsnotary.org/blog/2026/05/10/blog-proxy-mode/)
are comparative input; the exact libID ceremonies are the launch gate. Until
that gate selects otherwise, the implemented Proxy profile is the executable
browser baseline.

## X OAuth and TLSNotary ceremony

X uses public-client OAuth with S256 PKCE and two browser-owned TLSNotary
sessions. Both use the X profile selected from
[browser TLSNotary transport profiles](#browser-tlsnotary-transport-profiles).

### X authorization and transcript profile

The authorization request is `GET https://x.com/i/oauth2/authorize` with this
exact ordered tuple under the
[common serializer](libid-ceremony-common.md#canonical-oauth-serialization):

| Order | Field | Exact value |
|---|---|---|
| 1 | `response_type` | `code` |
| 2 | `client_id` | configured client ID |
| 3 | `redirect_uri` | immutable `PlatformFlightV1.callbackUri` |
| 4 | `scope` | `tweet.read users.read` |
| 5 | `state` | immutable one-use OAuth state |
| 6 | `code_challenge` | common proof-bound challenge |
| 7 | `code_challenge_method` | `S256` |

After callback consumption, the first notarized request is
`POST https://api.x.com/2/oauth2/token`, with
`Content-Type: application/x-www-form-urlencoded`, `Accept: application/json`,
and this exact ordered body:

| Order | Field | Exact value |
|---|---|---|
| 1 | `grant_type` | `authorization_code` |
| 2 | `code` | consumed callback code |
| 3 | `redirect_uri` | immutable `PlatformFlightV1.callbackUri` |
| 4 | `code_verifier` | common proof-bound verifier |
| 5 | `client_id` | configured client ID |

The authenticated response must contain exactly one nonempty printable-ASCII
top-level `access_token` string of at most 4096 bytes. The second notarized
request is exactly `GET https://api.x.com/2/users/me` with no query, the same
bearer in `Authorization: Bearer <access_token>`, and
`Accept: application/json`. Its bounded response must contain one top-level
`data` object with exactly one string `id` and one string `username`; duplicate,
nested-lookalike, differently typed, or out-of-object fields cannot satisfy the
proof.

X returns through the registered callback query. After common transport
labeling, ingress requires `transport=query` and exactly one `state` plus one
`code` XOR `error`; duplicate, additional authoritative, mixed, or malformed
fields fail before exchange or proving.

1. The token session sends the exact request above. Its attestation commits the
   returned bearer.
2. The `/2/users/me` session sends that exact bearer to `api.x.com`, commits the
   same bearer in the request, and authenticates the response's immutable `id`
   and mutable `username`.
3. The final proof binds the exact ordered token request, PKCE derivation,
   `claimDigest`, both attestations, one bearer across both transcripts,
   immutable identity, normalized handle, metadata timestamp, and nullifier.

The configured X notary key is the proof trust root. Notary compromise can mint
fresh X evidence until that key is actually removed or the platform is retired;
rotation and proof expiry do not undo bindings or sessions already committed.

The response-bound continuation begins token exchange and proving as soon as
its one-use gate is consumed; it never waits for a managed-wallet WebAuthn
gesture. Before OAuth navigation, the popup may best-effort prefetch the exact
hash-named worker and WASM assets from the immutable manifest. Cold cache
remains a required path, not an error fallback.

X qualification additionally runs both profiles against the complete
token-plus-user flow and X's documented
[30-second authorization-code deadline](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), proof
including callback-to-isolated-document startup and token completion on cold
and warm caches. This exact mobile ceremony remains the tightest transport
qualification gate.

## GitHub OAuth and TLSNotary ceremony

GitHub uses confidential-client OAuth, popup-generated S256 PKCE, one
callback-deployment-owned token-exchange TLSNotary session, and one browser-owned `/user`
TLSNotary session. The backend exchange uses the generated server module's
fixed transport and never the browser WebSocket bridge. The browser `/user`
session uses the GitHub profile selected from
[browser TLSNotary transport profiles](#browser-tlsnotary-transport-profiles).
The authorization request asks for exactly `read:user`; the
proof rejects a missing, inherited-broader, or otherwise different normalized
scope set. An omitted scope is not the launch profile because GitHub may inherit
previously granted scopes for the same OAuth application, as documented by
[GitHub's OAuth authorization flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

### GitHub authorization and transcript profile

The authorization request is
`GET https://github.com/login/oauth/authorize` with this exact ordered tuple
under the
[common serializer](libid-ceremony-common.md#canonical-oauth-serialization):

| Order | Field | Exact value |
|---|---|---|
| 1 | `client_id` | configured client ID |
| 2 | `redirect_uri` | immutable `PlatformFlightV1.callbackUri` |
| 3 | `scope` | `read:user` |
| 4 | `state` | immutable one-use OAuth state |
| 5 | `code_challenge` | common proof-bound challenge |
| 6 | `code_challenge_method` | `S256` |

The callback-deployment-owned notarized exchange is exactly
`POST https://github.com/login/oauth/access_token`, with
`Content-Type: application/x-www-form-urlencoded`, `Accept: application/json`,
and this ordered body:

| Order | Field | Exact value |
|---|---|---|
| 1 | `client_id` | configured client ID |
| 2 | `client_secret` | compiled callback-deployment secret, committed but undisclosed |
| 3 | `code` | consumed callback code |
| 4 | `redirect_uri` | immutable `PlatformFlightV1.callbackUri` |
| 5 | `code_verifier` | common proof-bound verifier |

Its authenticated JSON response must contain exactly one top-level string each
for `access_token`, `scope`, and `token_type`. `token_type` is exactly `bearer`.
The scope parser splits on ASCII comma, rejects empty, duplicate, whitespace,
or unknown members, and requires the exact singleton set `{read:user}`.

The browser-owned identity request is exactly
`GET https://api.github.com/user` with no query,
`Authorization: Bearer <access_token>`,
`Accept: application/vnd.github+json`, and
`X-GitHub-Api-Version: 2022-11-28`. Its bounded response must contain exactly
one top-level `id` JSON integer and one top-level `login` string. Duplicate,
nested-lookalike, differently typed, or noncanonical values cannot satisfy the
proof. Changing the pinned API version is a platform-profile and verifier
revision, not runtime configuration.

GitHub returns through the registered callback query and uses the same closed
`state` plus `code` XOR `error` ingress grammar as X. Its callback never
redeems the code.

The generated callback deployment exposes one stateless exchange
handler at the fixed `/oauth/github/exchange` route on the same origin as
`/oauth/callback`. Selecting GitHub mounts that route as part of the generated
bundle; application developers never implement or register it separately.

After canonical callback ingress consumes the exact action-owned state, the
isolated continuation sends this request:

```ts
interface GitHubExchangeRequestV1 {
  schema: 1
  code: string
  codeVerifier: string
}
```

The generated handler uses only its compiled client ID, client secret, callback
URI, token endpoint, and notary configuration. The request cannot select an
action, job, client, redirect, endpoint, return URL, or operation. It returns
only after the token-exchange attestation is complete:

```ts
interface GitHubExchangeResponseV1 {
  schema: 1
  accessToken: string
  tokenAttestation: string // canonical unpadded base64url
}
```

The code is non-empty printable ASCII without whitespace or controls and at
most `MAX_GITHUB_CODE_BYTES = 1024`. The verifier matches
`[A-Za-z0-9_-]{43}` exactly. The access token is non-empty printable ASCII
without whitespace or controls and at most
`MAX_GITHUB_ACCESS_TOKEN_BYTES = 4096`. The decoded attestation is non-empty
and at most `MAX_GITHUB_TOKEN_ATTESTATION_BYTES = 2 MiB`; the complete response
body is at most `MAX_GITHUB_EXCHANGE_RESPONSE_BYTES = 3 MiB`. Both sides reject
duplicate, missing, additional, differently typed, malformed, or over-limit
fields.

Before persisting or using the bearer, the popup verifies the attestation under
the configured GitHub notary key. It requires the authenticated TLS server and
path to be GitHub's exact token endpoint. It requires the disclosed request
code, client ID, callback URI, and verifier to equal the consumed callback and
immutable platform flight. It also requires the returned bearer to open the
attested token-response commitment while the client secret remains hidden.
Failure discards the response, starts neither `/user` nor a resume record, and
requires fresh OAuth.

Only after those checks does the popup atomically encrypt the bearer and
exchange attestation into `CeremonyResumeV1`. It then notarizes GitHub's exact
`/user` request above in the browser and builds the final proof. The proof
re-enforces the confidential exchange, PKCE derivation, exact `read:user`
scope, and one bearer across both transcripts. It derives immutable `/user.id`,
normalized `/user.login`, and the notarized response timestamp from verified
public inputs.

The exchange handler retains request material only for the synchronous call. It
persists no code, verifier, bearer, attestation, action, result, progress, or
cancellation state and exposes no polling or result route. It promises neither
idempotency nor replay: if GitHub consumes the code but the response does not
reach the popup, the browser starts a fresh OAuth ceremony. A crash after the
encrypted local commit resumes `/user` notarization or final proving without
another exchange call.

The generated route accepts only the compiled canonical runtime origin, handles
the corresponding CORS preflight, rejects redirects, and emits
`Cache-Control: no-store`. It applies the fixed request/body/time bounds above,
load shedding, and credential-body log redaction. CORS limits accidental
browser disclosure; it is not caller authentication, and ceremony soundness
comes from local attestation verification plus the action-owned code and PKCE
verifier.

## Platform runtime and callback-deployment modules

Every immutable canonical runtime release contains the browser implementations
for its supported platform profiles: common callback, runtime, worker, proof,
and platform code. An application's authenticated profile enables a subset; it
does not produce application-specific browser JavaScript or remove code from
the canonical release.

Application developers select identity platforms and each enabled browser
TLSNotary role's fixed transport profile. The callback-deployment build then includes only
the confidential modules required by that selection:

- the GitHub exchange module when GitHub is enabled;
- the fixed X and/or GitHub encrypted transport bridges selected by browser MPC
  profiles; and
- no unused platform route or secret.

Selecting GitHub therefore requires a server-capable deployment and its client
secret, but developers do not implement or separately mount its exchange
endpoint. Build-time validation rejects an enabled platform whose required
client, secret, notary, callback, or runtime-profile configuration is absent.
Frontend configuration contains only the callback origin and enabled platform
slugs; canonical preparation fetches the authenticated application profile and
the frontend never receives a runtime selector, secrets, notary URLs, or
internal exchange routes.

## Adding an identity platform

A new platform profile must define, at minimum:

- a stable platform ID and immutable user-ID namespace;
- canonical handle normalization and authenticated observation ordering;
- client portability or an explicitly bounded client family;
- exact authorization and callback transport;
- every authenticated request/response field and its provenance;
- binding of the common `claimDigest`, target, session, and nullifier;
- a fresh authenticated proof-validity ceiling;
- the trust root and its Registry lifecycle;
- browser/callback-deployment data exposure, retry, resume, and withholding behavior; and
- conformance vectors for all supported implementations.

Adding a platform never creates a caller-selected claim intent, generic
verifier escape hatch, or runtime-specific proof format.

## Security Considerations

The user authorizes the real identity-platform ceremony selected by the
application. A hostile application using its own legitimate client can still
induce a valid proof for the action it prepared; canonical UI and first-use
review match the ordinary OAuth consent boundary but are not on-chain
application admission.

The platform operator and configured proof root remain trust dependencies for
the authenticity of their platform identity. Actually invalidating a
compromised root or retiring a platform blocks future proof acceptance; it does
not revoke authority already committed to a wallet. The browser locally checks
proof/public-input correspondence so a backend can withhold or abort a ceremony
but cannot substitute another account's unproved metadata.
