# `@libid/ceremony` server contract

This document defines the HTTP and deployment contract expected by
`@libid/ceremony`. An integrating server implements these routes; the ceremony
package supplies the browser modules, exact public-record validators, and
browser-side platform codecs.

The package API and proving pipelines are defined in
[ARCHITECTURE.md](ARCHITECTURE.md). The browser documents communicate through
the [Ceremony Cross-Document Protocol](CCDP.md). The normative libID
specification owns authorization, platform-return, token-exchange, and proof
semantics; this document defines only their server transport and deployment.

## Boundary

The ceremony server owns:

- OAuth application registrations and confidential client credentials;
- the public ceremony configuration;
- fixed popup, callback, and prover documents and their response policy;
- immutable ceremony browser assets and configured libID prover assets; and
- the confidential platform endpoint required by an enabled platform.

It does not own a ceremony Job or keep ceremony progress, OAuth-return, proof,
retry, cancellation, or recovery state. Google and X require no confidential
ceremony route. GitHub adds one synchronous, stateless token-exchange route.

The configured server origin and everything it serves are a code-supply-chain
trust boundary. A malicious server can replace the browser code and response
policy. Closed inputs, Content Security Policy (CSP), Subresource Integrity
(SRI), and origin checks prevent request-controlled expansion and
cross-application confusion; they cannot constrain the server owner.

## Deployment configuration

One deployment has these server-owned inputs:

| Input | Contract |
|---|---|
| Server origin | Canonical HTTPS origin used by every ceremony route and the configured OAuth redirect URI; explicit loopback development is the only HTTP exception |
| `allowedAppOrigins` | Nonempty set of canonical application origins admitted to fetch configuration and authenticate a returned popup |
| Callback path | Developer-configurable path whose default is `/auth/v1/callback` |
| Platform profiles | Public OAuth client ID and supported ceremony versions for each enabled platform |
| Popup and prover roots | Immutable module URLs, integrity values, and deployment-fixed CSP sources |
| Prover assets | One exact immutable URL for the libID-built notarization client and one exact immutable circuit URL per platform/version |
| Confidential platform settings | GitHub client secret, redirect URI, notary, and other normative token-exchange settings when GitHub is enabled |

`allowedAppOrigins` uses set semantics and has no protocol maximum. The same
value drives configuration CORS and is embedded into the popup document. It is
deployment data, never inferred from a request's `Origin`, `Referer`, query,
fragment, or body.

One deployment platform configuration generates both the public
`CeremonyConfig` entries and the embedded prover profiles. They are projections
of one enabled set, not independently maintained platform lists.

Only libID-owned circuit and notarization-client locations are configurable
prover assets. The ceremony package pins their expected identities. It pins the
Aztec-distributed bb.js and Noir toolchain, including its worker, WebAssembly,
and common-reference-string dependency graph, in code.

## Route surface

An integrating server exposes:

| Method | Route | Availability | Purpose | Origin enforcement |
|---|---|---|---|---|
| `GET` | `/api/v1/ceremony/config` | always | public application configuration | server exact-checks request `Origin` against `allowedAppOrigins` and returns exact noncredentialed CORS |
| `GET` | `/api/v1/ceremony/popup` | always | initial ceremony popup document | none at HTTP ingress; loaded popup exact-checks browser-stamped `MessageEvent.origin` against its embedded `allowedAppOrigins` |
| `GET` | configured callback path, default `/auth/v1/callback` | always | direct byte-identical alias of the popup document and registered OAuth `redirect_uri` | none at HTTP ingress; loaded popup performs the same browser-side check after provider return |
| `GET` | `/api/v1/ceremony/prover` | always | shared prefetch, prover coordinator, and isolated-prover document | none at HTTP ingress; the fixed public document binds through CCDP and same-origin popup/prover channels after loading |
| `POST` | `/api/v1/ceremony/github-token` | only when GitHub is enabled | confidential GitHub token exchange and token attestation | server requires `Origin` to equal the configured ceremony server origin and rejects cross-origin preflight |

Server-side request-origin enforcement is used only where the browser reliably
sends an authoritative `Origin`. Top-level and iframe navigation may omit it,
and the OAuth callback may identify the provider rather than the application;
`Referer` is never an authority input. The fixed popup, callback, and prover
documents therefore remain public and request-invariant, with authority
established by their browser protocol after loading.

No preparation, continuation, polling, status, result, cancellation, browser
TLS bridge, or proof-recovery route exists. Unsupported methods fail without
running route work. Except for the provider-mandated callback query and the
GitHub JSON body, ceremony routes accept no query or request body.

The `/api/v1` namespace versions the server HTTP surface. It is independent of
`CCDPVersion`, which versions browser messages, and
`PlatformCeremonyVersion`, which versions one platform's ceremony semantics.
There is no request-time version negotiation.

## Public configuration

`GET /api/v1/ceremony/config` returns `application/json` with this exact record:

```ts
import type {
  PlatformCeremonyVersion,
  PlatformId,
} from '@libid/ceremony/protocol'

interface PlatformConfig {
  clientId: string
  ceremonyVersions: readonly PlatformCeremonyVersion[]
}

interface CeremonyConfig {
  schema: 1
  redirectUri: string
  platforms: Partial<Record<PlatformId, PlatformConfig>>
}
```

The response rules are:

- `PlatformCeremonyVersion` is an unsigned 16-bit integer.
- `redirectUri` is the canonical registered URL on the configured server
  origin. It contains no credentials, query, or fragment.
- Each platform entry has a public client ID and a nonempty, duplicate-free
  list of supported ceremony versions. List order has no meaning.
- Unknown fields, invalid identifiers, malformed URLs, and unsupported numeric
  representations are invalid.
- The record contains no secret, `allowedAppOrigins`, asset URL, CSP source,
  notary setting, platform display metadata, or application-specific value.

The browser request must carry an `Origin` which exactly matches a member of
`allowedAppOrigins`. A successful response sets that exact origin in
`Access-Control-Allow-Origin`, permits no credentials, never uses `*`, and is
served as `application/json` with `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff`. Missing and unlisted origins fail without
returning configuration. Request values do not alter the response record.

The application-scoped `CeremonyClient` fetches and validates this record once
at creation. Popup and prover documents never fetch it. The client freezes the
selected client ID, redirect URI, and mutually supported platform ceremony
version in each live Ceremony.

## Popup document and callback alias

`GET /api/v1/ceremony/popup` and the configured callback path directly serve
one deployment-generated popup document with the same bytes and security
headers. The callback path is an alias, not a second document or an HTTP
redirect. The OAuth registration uses the callback URL, while application
launch uses `/api/v1/ceremony/popup`.

The response is invariant across requests. In particular, its HTML, headers,
root module, SRI, CSP, and embedded `allowedAppOrigins` do not depend on the
request path, `Origin`, `Referer`, query, fragment, platform, or ceremony. The
document is top-level, non-isolated, and non-frameable so it preserves the
application opener through OAuth.

### Ingress bootstrap

The document contains one CSP-hashed inline bootstrap. Before storage,
rendering, error reporting, module loading, or network activity, it:

1. bounds the combined raw query and fragment to
   `MAX_OAUTH_REDIRECT_BYTES = 32 KiB`;
2. copies the exact `location.search` and `location.hash`, including their
   leading delimiters when nonempty;
3. clears both with `history.replaceState`;
4. appends the exact immutable `libid-ceremony-popup.js` root as a module
   preload with SRI and anonymous CORS, waits for success, and imports that same
   URL from the module map; and
5. invokes the package entrypoint with the captured values and embedded
   deployment allowlist:

```ts
interface OAuthReturn {
  query: string
  fragment: string
}

declare function startPopup(
  oauthReturn: OAuthReturn,
  allowedAppOrigins: readonly string[],
): void

startPopup(oauthReturn, allowedAppOrigins)
```

Malformed and oversized input follows the same clearing order; an oversized
value is not retained, and no failure is rendered until both URL components are
gone.

The bootstrap does not parse platform fields or derive an allowlist. The popup
module owns the closed launch/callback grammar and CCDP behavior after URL
clearing.

Google returns its credential in the fragment, which is never sent to the
server. X and GitHub return provider-mandated callback parameters in the query.
The server and every upstream proxy suppress or redact callback query strings
from access logs, traces, analytics, metrics labels, and error reports. No later
URL carries the captured return.

### Popup response policy

The shared popup response uses:

- `Cross-Origin-Opener-Policy: unsafe-none`;
- `Content-Type: text/html` and `X-Content-Type-Options: nosniff`;
- `Cache-Control: no-store` and `Referrer-Policy: no-referrer`;
- CSP beginning with `default-src 'none'`, `object-src 'none'`,
  `base-uri 'none'`, `form-action 'none'`, and `frame-ancestors 'none'`;
- `frame-src 'self'` only for the prover iframe;
- `connect-src 'self'`;
- one exact hash for the inline clearing bootstrap and only the exact
  integrity-pinned root-module source; and
- no broad `https:`, JavaScript `'unsafe-inline'`, or `'unsafe-eval'` source.

## Prover document

`GET /api/v1/ceremony/prover` serves one deployment-generated response for all
platforms and all three browser roles:

- `#prefetch(ceremonyId, platformId, ceremonyVersion)` starts selected-profile
  asset prefetch;
- an empty fragment creates the returned-popup coordinator; and
- a bare ceremony ID creates the COOP-isolated fallback prover window.

Fragments do not reach the server. Every role therefore receives identical
HTML, headers, embedded assets, and root module. A nonempty query is rejected;
no server request parameter selects platform, role, isolation mode, asset, or
CSP.

### Embedded prover assets

The response embeds one exact record:

```ts
interface ProverProfile {
  platformId: PlatformId
  platformCeremonyVersion: PlatformCeremonyVersion
  circuitUrl: string
}

interface ProverAssets {
  notarizationClientUrl: string
  profiles: readonly ProverProfile[]
}
```

Every URL string is a canonical absolute HTTPS URL for one immutable,
content-identified release asset. The explicit loopback development profile is
the only HTTP exception. `notarizationClientUrl` selects the one libID-built
notarization client shared by all notarized platform implementations. Its host
is deployment configuration: an initial GitHub release URL and a later CDN URL
have identical protocol meaning.
`profiles` contains exactly one circuit entry for every enabled
platform/version advertised by `CeremonyConfig`, restricted to the package's
single closed catalog, and selects its circuit descriptor through `circuitUrl`.
The closed
[platform pipeline](ARCHITECTURE.md#platform-pipelines) determines whether it
also fetches the global notarization client. The server schema does not
redefine that platform inventory. A request, fragment, or browser message
cannot add or replace either URL.

The bootstrap bounds and copies its fragment, clears it before storage,
rendering, errors, module loading, or network activity, and then exact-validates
the closed value and embedded `ProverAssets`. It integrity-loads the exact
same-origin immutable `libid-ceremony-prover.js` root and passes both values to
its Window entrypoint.
The prover root is also the module service-worker registration URL and permits
a scope covering `/api/v1/ceremony/`; its response sets
`Service-Worker-Allowed: /api/v1/ceremony/` when the script URL's default scope
does not already cover it. Popup and prover perform no configuration request.

### Prover response policy

The prover response uses:

- `Document-Isolation-Policy: isolate-and-require-corp`;
- `Cross-Origin-Opener-Policy: same-origin`;
- `Cross-Origin-Embedder-Policy: require-corp`;
- `Content-Type: text/html` and `X-Content-Type-Options: nosniff`;
- `Cache-Control: no-store` and `Referrer-Policy: no-referrer`;
- same-origin framing only, for the DIP iframe placement;
- CSP beginning with `default-src 'none'`, `object-src 'none'`,
  `base-uri 'none'`, and `form-action 'none'`;
- the exact root, worker, `blob:`, WebAssembly, and network sources needed by
  the pinned prover graph; and
- no broad scheme, request-derived source, JavaScript `'unsafe-inline'`, or
  `'unsafe-eval'` source beyond the exact hashed clearing bootstrap.

Because the response is byte-identical and the platform is selected only after
fragment clearing, `connect-src` is the deployment-fixed union of exact origins
required by all enabled platform/version profiles. The active closed platform
module issues requests only to its own exact URLs. This union is a ceiling for
the trusted prover bundle, not browser-enforced isolation between profiles; a
compromised root module can reach any origin in the union.

## GitHub token endpoint

When GitHub is enabled, the server implements
`POST /api/v1/ceremony/github-token`. The endpoint performs the confidential
OAuth token exchange and token TLSNotary session synchronously and retains no
state.

The exact `TokenRequest` and `TokenResponse` codecs and their proof semantics
come from the selected GitHub platform ceremony version in the normative
platform specification. `@libid/ceremony/platforms/github` supplies the
browser-side codecs and validation; the ceremony package supplies no server
handler.

The route contract is:

- the method is `POST`, the query is empty, and the media type is exactly
  `application/json`;
- `Origin` exactly equals the configured server origin used by the popup and
  prover; cross-origin preflight and credentialed cross-origin use are rejected;
- the request is an exact, bounded `TokenRequest`; unknown fields and malformed
  JSON fail before token exchange;
- client ID, client secret, redirect URI, platform endpoint, notary, proxy, and
  destination come from server configuration, never caller input;
- redirects are rejected and request duration and response size are bounded;
- a successful response is status `200`, `application/json`,
  `Cache-Control: no-store`, and exactly one bounded `TokenResponse`;
- credentials and provider-return values never enter logs, traces, analytics,
  metrics labels, or error bodies; and
- failures return no partial credential, attestation, or caller-selected
  diagnostic content.

The current response includes a canonical unpadded base64url `bearerBlinder`
which decodes to exactly 16 bytes. The browser validates the complete response
before beginning its dependent `/user` notarization.

Timeout, duplicate request, process restart, or response loss leaves no server
record. There is no action ID beyond the request's normative fields, no polling
or result route, and no server progress stream. Loss of the response requires a
fresh browser ceremony.

## Immutable browser assets

Root modules, companion chunks, workers, and WebAssembly are immutable release
assets. Every content-addressed response has:

- the exact media type and `X-Content-Type-Options: nosniff`;
- CORS and Cross-Origin-Resource-Policy behavior compatible with its documented
  isolated consumer;
- `Cache-Control: public, max-age=31536000, immutable`; and
- no redirect, opaque response, partial response, or mutable alias in an
  admitted fetch path.

Popup and prover HTML may embed deployment-specific values but is invariant
within that deployment release and remains `no-store`. A production deployment
uses immutable root URLs with SRI. Serving a mutable root, omitting integrity,
or broadening CSP turns request-independent browser code into mutable server
authority and is unsupported.

The reference deployment uses a dedicated cookie-free origin with no unrelated
same-origin API. This limits incidental ambient authority but does not create a
new protocol role or require a canonical libID service.

## Compatibility and changes

A live page keeps the immutable modules and embedded configuration it loaded.
The application client's one configuration fetch and the popup/prover embedded
values are not refreshed mid-ceremony. Rotating configuration may make an old
live ceremony fail closed; a new client uses the new deployment values.

A compatible deployment may add a platform or platform ceremony version to
configuration and `ProverAssets` while retaining the browser implementations
needed by live clients. A breaking HTTP route or response change requires a new
server API namespace. A breaking cross-document message change increments
`CCDPVersion`; a change to one platform's authorization, OAuth, or proof
semantics increments that platform's `PlatformCeremonyVersion`.
