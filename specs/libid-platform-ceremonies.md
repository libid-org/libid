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

In this suite, an **identity platform** is Google, X, GitHub, or a future
source of authenticated identity evidence. “Provider” is reserved for a formal
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

The canonical runtime manifest lists the ceremony profiles it implements. A new
job selects the current profile compatible with its platform, application OAuth
configuration, chain catalog, proof domain, and verifier revision, then stores
that exact profile in `PlatformCeremonyStateV1`. Resume never substitutes a
newer profile. A profile requiring new scopes, client settings, secrets, or
platform registration is ineligible until the application's authenticated
profile lists that ceremony profile and its generated callback deployment
contains every fixed server route it requires; compatible circuit or verifier
updates may become current without application code changes.

Profile identifiers and runtime releases are immutable. Older profiles and the
fixed request/response routes they own remain available through their
published deprecation window and every live job lifetime. A revoked proof root
or ceremony profile fails closed and requires a fresh supported action.

Every platform ceremony follows the shared [transition and terminal-output
contract](libid-ceremony-common.md#ceremony-transition-and-terminal-output).
Its terminal output is only `VerifiedIdentityCeremonyV1`; intermediate
operations return the next exact ceremony state for runtime commit. The
canonical claim encoding, deployment domain, intent values, nullifier, and
platform IDs are defined by the core identity specification.

The canonical popup constructs `VerifiedClaimV1` exclusively from locally
verified proof public inputs. Generated callback routes, callback pages,
application code, and unproved sidecar metadata cannot supply or override
`userId`, `handle`, `metadataObservedAt`, client binding, or another claim
field. Registry repeats proof verification on chain.

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

These platform definitions follow [Google
OIDC](https://developers.google.com/identity/openid-connect/openid-connect),
[OIDC public
subjects](https://openid.net/specs/openid-connect-core-1_0-18.html#SubjectIDTypes),
[X IDs](https://docs.x.com/fundamentals/x-ids), [GitHub durable
IDs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app#use-the-durable-unique-id-to-store-the-user),
and [GitHub username
changes](https://docs.github.com/en/account-and-profile/concepts/username-changes).

Email, audience, client ID, X username, and GitHub login never replace the
immutable `userId`. A future platform may participate in clean-device recovery
only if its account ID is stable across the supported client family. Pairwise
subjects require a stable client family or a distinct platform/identity model.

The platform ceremony authenticates its configured OAuth client and exposes
that client identifier as a public proof input which the on-chain verifier
checks against the client it was configured with. See [client binding is a
proof output](libid-ceremony-common.md#client-binding-is-a-proof-output) for
the rule and each platform's authenticated source. Callback origin, frontend
origin, and application authorization remain browser-local. None of this
creates on-chain application admission.

The verifier authenticates mutable-metadata ordering independently from wallet
authority:

| Identity platform | `metadataObservedAt` |
|---|---|
| Google | signed ID-token `iat` |
| X | exact signed `meAttest.timestamp` |
| GitHub | exact signed `userAttest.timestamp` |

X and GitHub use the shared [proof-bound PKCE
construction](libid-ceremony-common.md#shared-pkce-construction). For metadata
ordering, “timestamp” above always means the signed TLSNotary attestation
creation time, not an HTTP `Date` header, response field, browser receipt time,
or backend clock.

Every platform verifier derives and enforces an authenticated validity ceiling.
No caller supplies one:

| Identity platform | `proofValidUntil` — first invalid timestamp |
|---|---|
| Google | `min(signed JWT exp + CLOCK_SKEW_GRACE, trustedUntil)` |
| X | `min(tokenAttest.timestamp, meAttest.timestamp) + 10 minutes` |
| GitHub | `min(tokenAttest.timestamp, userAttest.timestamp) + 10 minutes` |

The common [evidence-time
rules](libid-ceremony-common.md#common-evidence-time-rules) apply. X and GitHub
reject either attestation timestamp when it is more than five minutes ahead of
`block.timestamp`; the ten-minute additions use checked arithmetic.

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
| 2 | `client_id` | configured client ID |
| 3 | `redirect_uri` | immutable `PlatformFlightV1.callbackUri` |
| 4 | `scope` | `openid email` |
| 5 | `state` | immutable one-use OAuth state |
| 6 | `nonce` | `BASE64URL_NOPAD(bytes32(claimDigest))` |

No prompt, login hint, hosted domain, incremental authorization, access-token
response type, or additional scope is present in the launch profile.
`response_mode` is not sent: `response_type=id_token` already mandates fragment
delivery, so pinning it added a parameter without adding a constraint.

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
- `nonce` equal to the recomputed `claimDigest`;
- immutable `sub` as `userId`;
- normalized email as `handle`;
- the exact Boolean `email_verified: true`;
- signed `iat` as `metadataObservedAt`; and
- signed `aud` as the public client-binding input, which the on-chain verifier
  compares to its configured client.

The signed JWT payload must contain exactly one top-level value of the required
type for `iss`, `sub`, `aud`, `iat`, `exp`, `nonce`, `email`, and
`email_verified`. Duplicate keys, type substitution, nested lookalikes, or a
second accepted occurrence fail. The canonical user-ID and handle rules above
apply before proof construction.

For the [common claim vector](libid-ceremony-common.md#claim-digest):

```text
claimDigest  = 0xd03372525670a85e4f57a8df060ff33d4dec559d7f001630d96580763785e87c
Google nonce = 0DNyUlZwqF5PV6jfBg_zPU3sVZ1_ABYw2WWAdjeF6Hw
```

ASCII-hex, padding, a legacy address-valued nonce, or any altered digest input
fails verification.

The current RSA key is fetched from Google's fixed JWKS origin as witness
input. It has authority only when its exact modulus belongs to the Registry's
active trusted Google modulus set. A browser
JWKS response alone cannot authorize a claim.

Google rotates its JWKS signing keys on the order of once per week, so the
trusted modulus set is a live operational dependency, not a static
configuration: every Google ceremony fails closed the moment Google signs with
a modulus the Registry has not yet been told to trust. The Registry governance
specification owns who updates that set, the latency budget between Google
publishing a key and the Registry trusting it, and how many prior moduli stay
trusted. Launch requires that pipeline to exist and be monitored.

The audience check is client binding, not identity or Registry admission — see
[client binding is a proof
output](libid-ceremony-common.md#client-binding-is-a-proof-output). The signed
claim digest binds version, chain, and holder address. The verifier must not
treat legacy prover-selected chain or Registry public inputs as signed
authority.

## Browser TLSNotary transport profiles

Every browser-owned TLSNotary attempt uses one of the following deployment-
qualified transport modes. This applies to X's `/token` and `/2/users/me`
sessions and GitHub's `/user` session. Transport is not durable ceremony
identity: notarization is one atomic recomputable step, so an interrupted
attempt may retry through another mode qualified by the same deployment without
changing the ceremony profile or verified output. No partial transcript or TLS
state crosses that retry. GitHub's callback-deployment-owned confidential token
exchange is a separate server-side session and does not use either browser
transport mode.

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
`/tls/bridge/github-user` can open only `api.github.com:443`. A route accepts
no action, claim, stage, job, destination, callback, or return field. It
retains only the live encrypted byte stream and discards it on close. The
generated manifest pins its origin, handshake, connection, concurrency, byte,
and time limits for the qualified build; applications cannot widen them at
runtime. Because each bridge is deliberately untrusted, ceremony soundness does
not depend on it authenticating an action or understanding proof state.

Launch qualification runs both profiles against every exact browser-owned
platform transcript using pinned libraries, circuits, regions, and immutable
assets. It covers cold and warm caches, the supported desktop/mobile matrix,
constrained bandwidth, high RTT, suspension/resumption, proof latency, success
rate, bytes, memory/CPU/battery, cancellation, egress IP, and hostile MPC
bridge mutation. Published [TLSNotary browser
benchmarks](https://tlsnotary.org/blog/2026/05/10/blog-proxy-mode/) are
comparative input; the exact libID ceremonies are the launch gate. Until that
gate selects otherwise, the implemented Proxy profile is the executable browser
baseline.

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
| 2 | `client_id` | configured client ID |
| 3 | `code` | consumed callback code |
| 4 | `redirect_uri` | immutable `PlatformFlightV1.callbackUri` |
| 5 | `code_verifier` | common proof-bound verifier |

X and GitHub share this field order, so one serializer and one
template-matching routine serve both. The order follows the [credential-last
rule](libid-ceremony-common.md#notarized-transcript-extraction): X's public
client sends no secret, and GitHub appends `client_secret` after
`code_verifier`.

The authenticated response must contain exactly one nonempty printable-ASCII
top-level `access_token` string of at most 4096 bytes. The second notarized
request is exactly `GET https://api.x.com/2/users/me` with no query, the same
bearer in `Authorization: Bearer <access_token>`, and `Accept:
application/json`. Its bounded response must contain one top-level `data`
object with exactly one string `id` and one string `username`; duplicate,
nested-lookalike, differently typed, or out-of-object fields cannot satisfy the
proof.

X returns through the registered callback query. After common transport
labeling, ingress requires `transport=query` and exactly one `state` plus one
`code` XOR `error`; duplicate, additional authoritative, mixed, or malformed
fields fail before exchange or proving.

1. The token session sends the exact request above. Its attestation commits the
   returned bearer.
2. The `/2/users/me` session sends that exact bearer to `api.x.com`, commits
   the same bearer in the request, and authenticates the response's immutable
   `id` and mutable `username`.
3. The final proof binds the exact ordered token request under the [extraction
   rules](libid-ceremony-common.md#notarized-transcript-extraction), the PKCE
   derivation from `claimDigest` and the private `pkceNonce`, both
   attestations, one bearer across both transcripts, immutable identity,
   normalized handle, metadata timestamp, and nullifier.

Its public proof inputs are `claimDigest`, `client_id`, the two attestation
timestamps, and the identity fields. The bearer is committed and cross-linked
between the two transcripts by commitment; it is never a public output. The
`code_verifier` is recomputed in circuit rather than disclosed.

The configured X notary key is the proof trust root. Notary compromise can mint
fresh X evidence until that key is actually removed or the platform is retired;
rotation and proof expiry do not undo bindings or sessions already committed.

The response-bound continuation begins token exchange and proving as soon as
its one-use gate is consumed; it never waits for a managed-wallet WebAuthn
gesture. Before OAuth navigation, the popup may best-effort prefetch the exact
hash-named worker and WASM assets from the immutable manifest. Cold cache
remains a required path, not an error fallback.

X qualification additionally runs both profiles against the complete
token-plus-user flow and X's documented [30-second authorization-code
deadline](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code),
proof including callback-to-isolated-document startup and token completion on
cold and warm caches. This exact mobile ceremony remains the tightest transport
qualification gate.

## GitHub OAuth and TLSNotary ceremony

GitHub uses confidential-client OAuth, popup-generated S256 PKCE, one
callback-deployment-owned token-exchange TLSNotary session, and one
browser-owned `/user` TLSNotary session. The backend exchange uses the
generated server module's fixed transport and never the browser WebSocket
bridge. The browser `/user` session uses the GitHub profile selected from
[browser TLSNotary transport profiles](#browser-tlsnotary-transport-profiles).
The authorization request asks for exactly `read:user`, because GitHub may
inherit previously granted scopes for the same OAuth application, as documented
by [GitHub's OAuth authorization
flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
The granted scope is not a proof input: `/user.id` and `/user.login` are
authentic at any scope, and the bearer is never disclosed, so an in-circuit
scope parser would spend constraints on blast-radius hygiene rather than on
claim soundness.

The shape is deliberately X's: two attestations, one bearer cross-linked
between them by commitment, and one proof that binds both to the same
`claimDigest`. The only structural difference is where the token exchange runs.
GitHub is a confidential client, so the exchange is a server-side notarized
session rather than a browser-owned one — which makes the exchange prover the
party the design distrusts, and is why the [extraction
rules](libid-ceremony-common.md#notarized-transcript-extraction) are normative
for it.

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
| 1 | `grant_type` | `authorization_code` |
| 2 | `client_id` | configured client ID |
| 3 | `code` | consumed callback code |
| 4 | `redirect_uri` | immutable `PlatformFlightV1.callbackUri` |
| 5 | `code_verifier` | common proof-bound verifier |
| 6 | `client_secret` | compiled callback-deployment secret, committed but undisclosed |

Fields 1 through 5 are byte-identical in order and meaning to the [X token
body](#x-authorization-and-transcript-profile). `client_secret` is appended
last so that no field follows the undisclosed range: a hidden range with a
field after it is a smuggling channel, because the prover composes the request
and the platform sees bytes the disclosure does not. The secret is additionally
constrained in circuit to a charset containing no `&` or `=`, which the prover
can prove without revealing it. GitHub accepts this field order and does not
require `grant_type`, which is sent only so one template serves both platforms.

Its authenticated JSON response must contain exactly one top-level
`access_token` string, nonempty printable ASCII of at most 4096 bytes.

An earlier draft also proved `token_type: bearer` and parsed the returned scope
set to the exact singleton `{read:user}`. Both are removed from the proof. The
scope request above still constrains what the token can do; proving it
afterwards does not change which account `/user` returns.

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

The `code` field is non-empty printable ASCII without whitespace or controls
and at most `MAX_GITHUB_CODE_BYTES = 1024`. The `codeVerifier` field matches
`[A-Za-z0-9_-]{43}` exactly, per the [PKCE
construction](libid-ceremony-common.md#shared-pkce-construction). The access
token is non-empty printable ASCII without whitespace or controls and at most
`MAX_GITHUB_ACCESS_TOKEN_BYTES = 4096`. The decoded attestation is non-empty
and at most `MAX_GITHUB_TOKEN_ATTESTATION_BYTES = 2 MiB`; the complete response
body is at most `MAX_GITHUB_EXCHANGE_RESPONSE_BYTES = 3 MiB`. Both sides reject
duplicate, missing, additional, differently typed, malformed, or over-limit
fields.

### What the exchange attestation discloses

The exchange session discloses exactly two request ranges — `client_id` and
`code_verifier` — plus the response status and the token commitment. The client
secret is never disclosed, and neither is the bearer.

Disclosure and verification are separate, as the [extraction
rules](libid-ceremony-common.md#notarized-transcript-extraction) require. The
full request is a private witness and is asserted equal to the template above:
pinned endpoint, authority, method, path, `Content-Type`, and byte-exact
`redirect_uri`, with each field occurring exactly once and every hole
charset-constrained. A proof that checked only the two disclosed windows would
admit a prover that hides a second `code_verifier` in an unverified range, lets
GitHub honor that one, and discloses another — which is the address-rebinding
attack the whole ceremony exists to prevent, reintroduced one layer up.

The disclosed `code_verifier` range is what ties the exchange to `claimDigest`:
the circuit recomputes the verifier from the public digest and the private
`pkceNonce` and asserts equality with the transcript bytes. GitHub's acceptance
of that verifier is the evidence that this exchange belongs to the
authorization the browser started — the platform enforces the
challenge/verifier match, and a `200` is only reachable for the verifier
registered at authorize time.

Before persisting or using the bearer, the popup verifies the attestation under
the configured GitHub notary key. It requires the authenticated TLS server and
path to be GitHub's exact token endpoint, the disclosed client ID to equal the
configured client, the disclosed verifier to equal the one it derived, and the
returned bearer to open the attested token-response commitment while the client
secret remains hidden. Failure discards the response, starts neither `/user`
nor a resume record, and requires fresh OAuth.

Only after those checks does the popup atomically encrypt the bearer and
exchange attestation into `CeremonyResumeV1`. It then notarizes GitHub's exact
`/user` request above in the browser and builds the final proof, joining the
two sessions:

1. The exchange attestation authenticates `client_id`, the digest-bound
   `code_verifier`, and a commitment to the issued bearer.
2. The `/user` attestation sends that same bearer to `api.github.com`, commits
   it in the request, and authenticates `id` and `login`.
3. The proof asserts one bearer commitment across both transcripts and emits
   `claimDigest`, `client_id`, both attestation timestamps, and the identity
   fields as public inputs. The bearer, the secret, and `pkceNonce` stay
   private.

This is the same join as X's, with the first session produced server-side.

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
TLSNotary role's fixed transport profile. The callback-deployment build then
includes only the confidential modules required by that selection:

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
- how the common `claimDigest` is carried through that platform's
  authorization, and its binding to the nullifier;
- its authenticated client-binding source;
- a fresh authenticated proof-validity ceiling;
- the trust root and its Registry lifecycle;
- browser/callback-deployment data exposure, retry, resume, and withholding
  behavior; and
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

The claim digest binds the holder address but not a registry address, so within
its authenticated validity window a live proof can be consumed by any contract
on the same chain that adopts the libID domain and verifier. The effect is
bounded: such a contract can only bind the holder's own platform account to the
holder's own address, nullifier state is per-contract, and the window is
minutes for X and GitHub. It is recorded here because a proof observed in the
mempool can materialize in a system the user did not submit to.

`state` is browser-local. With the digest bound into PKCE and the OIDC nonce,
an injected authorization code cannot produce a proof for another address, so
`state` carries no proof semantics and appears in no circuit or verifier. It
remains normative browser behavior for callback routing and one-use replay
rejection.

X and GitHub ceremonies depend on the platform enforcing the PKCE
challenge/verifier match. This is the binding's foundation: if a platform
stopped enforcing it, an exchange would succeed with any verifier and the
digest binding would be decorative. GitHub shipped enforcement in July 2025 and
enforces it when a challenge is sent, but does not require one. Conformance
therefore includes a live check, run continuously and not only at launch, that
each platform still rejects an exchange whose `code_verifier` does not match
the registered `code_challenge`.
