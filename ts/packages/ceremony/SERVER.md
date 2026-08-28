# `@libid/ceremony` server contract

This document defines the HTTP and deployment contract expected by
`@libid/ceremony`. An integrating server implements these routes; the ceremony
package supplies the browser modules, exact public-record validators, and
browser-side platform codecs.

The package API is defined in [ARCHITECTURE.md](ARCHITECTURE.md), the popup
participant in [POPUP.md](POPUP.md), and the prover subsystem in
[PROVER.md](PROVER.md). The browser documents communicate through the
[Ceremony Cross-Document Protocol](CCDP.md). The normative libID specification
owns authorization, platform-return, token-exchange, and proof semantics; this
document defines only their server transport and deployment.

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
policy. Closed inputs, Content Security Policy (CSP), and origin checks prevent
request-controlled expansion and cross-application confusion; they cannot
constrain the server owner. Launch does not add runtime content hashing inside
code supplied by that same server; deployment asset-integrity checks may be
added later as operational hardening.

## Deployment configuration

One deployment has these server-owned inputs:

| Input | Contract |
|---|---|
| Server origin | Canonical HTTPS origin used by every ceremony route and the configured OAuth redirect URI; explicit loopback development is the only HTTP exception |
| `allowedAppOrigins` | Nonempty set of canonical application origins admitted to fetch configuration and authenticate a returned popup |
| Callback path | Developer-configurable path whose default is `/auth/v1/callback` |
| Platform profiles | Public OAuth client ID and supported ceremony versions for each enabled platform |
| Popup and prover roots | Immutable module URLs, exact package-owned stylesheet hashes, and deployment-fixed CSP sources |
| Prover asset sources | One remote URL or local filesystem source for the libID-built notarization-client module and its fixed sibling WASM, one source for each platform/version circuit, and one common Notary Service address |
| Confidential platform settings | GitHub client secret, redirect URI, and other platform-required token-exchange settings when GitHub is enabled |

`allowedAppOrigins` uses set semantics and has no protocol maximum. The same
value drives configuration CORS and is embedded into the popup document. It is
deployment data, never inferred from a request's `Origin`, `Referer`, query,
fragment, or body.

One deployment platform configuration generates both the public
`CeremonyConfig` entries and the embedded prover profiles. They are projections
of one enabled set, not independently maintained platform lists.

Only libID-owned circuit and notarization-client locations are configurable
artifact assets. A
`notaryAddress` is a network endpoint rather than an artifact and is
deployment-fixed for the whole ceremony deployment. The package pins the
Aztec-distributed bb.js and Noir toolchain, including its worker, WebAssembly,
and common-reference-string dependency graph, in code.

### Prover asset sources

Each configured libID-owned artifact has either a remote `url` or a filesystem
`localPath`. These are mutually exclusive operator/server configuration fields,
not a browser type or an explicit mode sent to JavaScript. A source cannot be
selected or altered by an HTTP request, application, ceremony, platform return,
fragment, or browser message.

The `url` branch names one browser-ready file, not an archive or release page.
It must:

- be one canonical absolute HTTPS URL without credentials or fragment;
- return status `200` without a redirect, authentication, cookies, or partial
  content;
- permit a credentialless CORS fetch from the ceremony-server origin with
  `Access-Control-Allow-Origin: *` or that exact origin; an origin-specific
  response also returns `Vary: Origin`;
- return the exact media type from [Immutable browser assets](#immutable-browser-assets),
  `X-Content-Type-Options: nosniff`, and
  `Cache-Control: public, max-age=31536000, immutable`;
- omit an attachment `Content-Disposition`; and
- retain the same bytes and execution-relevant response metadata for the
  lifetime of that URL.

The notarization-client URL identifies `tlsn_wasm.js`; its independently
fetchable `tlsn_wasm_bg.wasm` sibling must satisfy the same rules at the URL
obtained by replacing only the final path component. A configured circuit URL
identifies its browser-readable circuit descriptor directly. Current GitHub
release-download URLs do not satisfy this contract: they redirect to
non-CORS attachment responses and publish archives rather than the required
browser files. They may be inputs to a deployment build, but never embedded as
runtime asset URLs.

The `localPath` branch names a file on the ceremony-server machine. For a
notarization client it names `tlsn_wasm.js`, with `tlsn_wasm_bg.wasm` required
beside it; for a circuit it names the descriptor file. At startup the server:

1. resolves and validates every configured file before serving ceremony
   routes;
2. creates a closed manifest containing only those files;
3. assigns an immutable asset key which changes if any served bytes or
   execution-relevant response metadata change; and
4. maps each entry to
   `/api/v1/ceremony/assets/<asset-key>/<filename>`.

The reference implementation may derive the key from content; it is cache
identity, not an additional proof-security check. The server must not serve
changed bytes under an existing key. A local-file update therefore requires a
configuration reload or restart which generates new embedded URLs.

The local asset handler is a manifest server, not a general filesystem server.
It accepts no caller-selected filesystem path, exposes no directory listing,
follows no request path outside the startup manifest, and returns `404` for an
unknown key or filename. Local paths and filesystem errors never enter browser
responses.

#### Open alternative: one ceremony asset distribution

The launch contract above configures each libID-owned prover artifact. A
possible simplification is to make the ceremony build publish one complete,
browser-ready distribution instead:

```text
manifest.json
libid-ceremony-popup.js
libid-ceremony-prover.js
assets/*
circuits/*
tlsn/tlsn_wasm.js
tlsn/tlsn_wasm_bg.wasm
```

An operator would configure exactly one of:

```toml
ceremony_assets_url = "https://cdn.example/libid/ceremony/<release>/"
ceremony_assets_path = "/opt/libid/ceremony-assets/<release>/"
```

The package-generated manifest, not operator configuration, would map logical
platform/version assets to immutable files. For a remote distribution the
server would prepend `ceremony_assets_url`; for a local distribution it would
serve exact manifest entries below
`/api/v1/ceremony/assets/<release>/`. Both modes would produce the same browser
URLs and use the same package-defined media types and cache policy.

This would replace per-circuit and notarization-client source configuration,
startup asset-key generation, sibling discovery in server configuration, and
the possibility of mixing files from incompatible releases. The same directory
could initially be served by the ceremony server and later uploaded unchanged
to a CDN. GitHub releases would remain inputs used by the ceremony build to
assemble it; the browser would still never consume their archives.

The tradeoff is release granularity: changing one circuit or the notary client
would publish a new complete ceremony distribution even when the other files
are unchanged. Content-addressed filenames would still allow browsers and CDNs
to reuse unchanged bodies. The choice also determines whether popup/prover root
modules and configured prover artifacts share one deployment unit.

This alternative is not part of the current server contract or conformance
plan. Selecting it would replace the per-artifact source rules above rather
than add a second configuration layer.

## Route surface

An integrating server exposes:

| Method | Route | Availability | Purpose | Origin enforcement |
|---|---|---|---|---|
| `GET` | `/api/v1/ceremony/config` | always | public application configuration | server exact-checks request `Origin` against `allowedAppOrigins` and returns exact noncredentialed CORS |
| `GET` | `/api/v1/ceremony/popup` | always | initial ceremony popup document | none at HTTP ingress; loaded popup exact-checks browser-stamped `MessageEvent.origin` against its embedded `allowedAppOrigins` |
| `GET` | configured callback path, default `/auth/v1/callback` | always | direct byte-identical alias of the popup document and registered OAuth `redirect_uri` | none at HTTP ingress; loaded popup performs the same browser-side check after provider return |
| `GET` | `/api/v1/ceremony/prover` | always | shared prefetch, prover coordinator, and isolated-prover document | none at HTTP ingress; the fixed public document binds through CCDP and same-origin popup/prover channels after loading |
| `GET` | `/api/v1/ceremony/assets/<asset-key>/<filename>` | when any prover asset uses `localPath` | immutable same-origin response for one startup-manifest entry | public fixed asset; request path can only select an exact manifest entry |
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
import type { PlatformCeremonyVersion } from '@libid/ceremony'

interface PlatformConfig {
  clientId: string
  ceremonyVersions: readonly PlatformCeremonyVersion[]
}

interface CeremonyConfig {
  redirectUri: string
  platforms: Readonly<Record<string, PlatformConfig>>
}
```

The response rules are:

- `PlatformCeremonyVersion` is an unsigned 16-bit integer.
- `redirectUri` is the canonical registered URL on the configured server
  origin. It contains no credentials, query, or fragment.
- Each platform entry has a public client ID and a nonempty, duplicate-free
  list of supported ceremony versions. List order has no meaning.
- Unknown fields inside either record, malformed URLs, and unsupported numeric
  representations are invalid. A platform key absent from the client's closed
  local catalog is ignored; known entries remain exact-validated before use.
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
root module URL, CSP, and embedded `allowedAppOrigins` do not depend on the
request path, `Origin`, `Referer`, query, fragment, platform, or ceremony. The
document is top-level, non-isolated, and non-frameable so it preserves the
application opener through OAuth.

The HTML is a security shell, not a UI template. It contains the clearing
bootstrap and one empty mount point, but no ceremony view, branding markup,
loading control, or normal-operation stylesheet. After clearing, the root
module creates the complete package UI. Only the bootstrap's fixed textual
module-load failure can render without it.

### Ingress bootstrap

The document contains one CSP-hashed inline bootstrap. Before storage,
rendering, error reporting, module loading, or network activity, it:

1. bounds the combined raw query and fragment to
   `MAX_OAUTH_REDIRECT_BYTES = 32 KiB`;
2. copies the exact `location.search` and `location.hash`, including their
   leading delimiters when nonempty;
3. clears both with `history.replaceState`;
4. imports the exact immutable `libid-ceremony-popup.js` root URL; and
5. invokes the package entrypoint with the captured values and embedded
   deployment allowlist:

```ts
declare function startPopup(
  oauthReturn: { query: string; fragment: string },
  allowedAppOrigins: readonly string[],
): void

startPopup(oauthReturn, allowedAppOrigins)
```

Malformed and oversized input follows the same clearing order; an oversized
value is not retained, and no failure is rendered until both URL components are
gone.

A root import failure is terminal for that document. The bootstrap does not
retry the same module URL because browsers retain a failed module-map entry; a
user retry starts in a fresh popup document.

The bootstrap does not parse platform fields or derive an allowlist. The popup
module owns the closed launch/callback grammar and local lifecycle after URL
clearing, as defined in [POPUP.md](POPUP.md#entrypoint-and-trusted-inputs).
CCDP owns its cross-document messages and ordering.

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
- `style-src` permitting only the exact hash of the stylesheet text installed
  by the immutable popup root;
- one exact hash for the inline clearing bootstrap and only the deployment's
  immutable root-module source; and
- no broad `https:`, JavaScript `'unsafe-inline'`, or `'unsafe-eval'` source.

## Prover document

`GET /api/v1/ceremony/prover` serves one deployment-generated response for all
platforms and all three browser roles:

- `#prefetch(ceremonyId, platformId, ceremonyVersion)` starts selected-profile
  asset prefetch;
- a bare ceremony ID creates the returned-popup coordinator when embedded and
  the COOP-isolated fallback prover when top-level.

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
  notaryAddress: string
  profiles: readonly ProverProfile[]
}
```

Each URL string is either a canonical absolute HTTPS `url` source or the
canonical root-relative route generated for a `localPath` source. A
root-relative value begins with `/api/v1/ceremony/assets/`, contains no query,
fragment, dot segment, or encoded path separator, and resolves against the
configured server origin before use. The explicit loopback development profile
is the only HTTP exception.

`ProverAssets` contains no source kind. Browser code resolves every value with
`new URL(value, location.origin)` and follows the same fetch, validation, and
cache path for remote and server-hosted assets.

`notarizationClientUrl` selects the immutable `tlsn_wasm.js` ES module shared
by all notarized platform implementations. Its only companion is the separate
sibling `tlsn_wasm_bg.wasm`, resolved with
`new URL('tlsn_wasm_bg.wasm', new URL(notarizationClientUrl,
location.origin))`. Both files are one pinned release, use independent
immutable HTTP cache entries, and share their versioned directory. An archive
is not a browser artifact.
`notaryAddress` is one canonical absolute HTTPS origin with no credentials,
path, query, or fragment, shared by every notarized session in the deployment.
The testnet value is `https://notary.testnet.lib.id`; the browser derives
`wss://notary.testnet.lib.id/notarize-proxy` by replacing `https` with `wss` and
appending the fixed path. It is not the `notarizationClientUrl` release asset.
`profiles` contains exactly one circuit entry for every enabled
platform/version advertised by `CeremonyConfig`, restricted to the package's
single closed catalog, and selects its circuit descriptor through `circuitUrl`.
The common address is embedded deployment data and cannot be supplied or
replaced by a request, fragment, or browser message. Its browser use is defined in
[NOTARIZATION.md](NOTARIZATION.md). The closed
[platform pipeline](PROVER.md#platform-pipelines) determines whether it
also fetches the global notarization client. The server schema does not
redefine that platform inventory. A request, fragment, or browser message
cannot add or replace any URL.

The bootstrap bounds and copies its fragment, clears it before storage,
rendering, errors, module loading, or network activity, and then exact-validates
the closed value and embedded `ProverAssets`. It imports the exact same-origin
immutable `libid-ceremony-prover.js` root and passes both values to
its Window entrypoint:

```ts
declare function startProver(
  fragment: string,
  assets: ProverAssets,
): void
```

The ServiceWorker branch installs its package-private handlers when the same
root is evaluated in a worker and exports no protocol entrypoint.
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
- `style-src` permitting only the exact hash of the stylesheet text installed
  by the immutable prover root; and
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

The server API namespace fixes this JSON wire contract and implements GitHub
ceremony version `1` only. The route carries no per-request ceremony-version
field and `/api/v1/ceremony/config` must not advertise a GitHub version that
needs different token-service semantics. Such a change requires a new server
API namespace; other platform ceremony versions remain independent.

```ts
interface TokenRequest {
  code: string
  codeVerifier: string
}

interface TokenResponse {
  accessToken: string
  tokenAttestation: {
    attestedData: string // canonical unpadded base64url
    signature: string    // canonical unpadded base64url
  }
  bearerOpening: string // canonical unpadded base64url
}
```

Both records are JSON objects encoded as UTF-8. Member order and insignificant
JSON whitespace have no meaning. Duplicate, missing, additional, or wrongly
typed members are invalid. No `schema` member is carried because
`/api/v1/ceremony/github-token` already versions this transport.

`TokenRequest.code` is the exact GitHub authorization code captured by the
popup. It is nonempty printable ASCII without whitespace or control bytes and
is at most 1,024 bytes. `codeVerifier` is the Ceremony Client's exact PKCE code
verifier and matches `[A-Za-z0-9_-]{43}`. Neither value is normalized before
the server constructs the platform request.

`TokenResponse.accessToken` is nonempty printable ASCII without whitespace or
control bytes and is at most 4,096 bytes. `attestedData` is the nonempty,
byte-exact attested-data record and decodes to at most 2 MiB; `signature`
decodes to the exact 65-byte notary signature authenticating those bytes.
`bearerOpening` decodes to exactly 16 bytes. Every byte string uses the RFC 4648
URL-safe alphabet without padding; noncanonical encodings are invalid. The
entire encoded response body is at most 3 MiB.

The returned token, attestation, and opening are one result: the uniquely
framed bearer commitment in `tokenAttestation.attestedData` equals
`SHA256(accessToken || bearerOpening)`. The server preserves the attested data
and signature byte-for-byte. Before beginning its dependent `/user`
notarization, the browser exact-validates the response encoding, correlation,
and open request bindings required by the selected GitHub ceremony. Local
signature verification is optional; downstream verification remains
authoritative.

The route contract is:

- the method is `POST`, the query is empty, and the media type is exactly
  `application/json`;
- `Origin` exactly equals the configured server origin used by the popup and
  prover; cross-origin preflight and credentialed cross-origin use are rejected;
- the request is an exact, bounded `TokenRequest`; malformed UTF-8 or JSON and
  invalid record fields fail before token exchange;
- client ID, client secret, redirect URI, platform endpoint, notary, proxy, and
  destination come from server configuration, never caller input;
- redirects are rejected and request duration and response size are bounded;
- a successful response is status `200`, `application/json`,
  `Cache-Control: no-store`, and exactly one bounded `TokenResponse`;
- credentials and provider-return values never enter logs, traces, analytics,
  metrics labels, or error bodies; and
- failures return no partial credential, attestation, or caller-selected
  diagnostic content.

Timeout, duplicate request, process restart, or response loss leaves no server
record. There is no action ID beyond the request fields, no polling
or result route, and no server progress stream. Loss of the response requires a
fresh browser ceremony.

## Immutable browser assets

Root modules, companion chunks, workers, and WebAssembly are immutable,
versioned release assets. Configured circuit and notarization-client responses
obey the same contract. Their exact media types are:

| Resource | `Content-Type` |
|---|---|
| JavaScript module | `text/javascript; charset=utf-8` |
| WebAssembly | `application/wasm` |
| Circuit descriptor | `application/json` |

Every asset response has:

- the exact media type and `X-Content-Type-Options: nosniff`;
- `Cache-Control: public, max-age=31536000, immutable`; and
- no redirect, opaque response, partial response, or mutable alias in an
  admitted fetch path.

A configured remote response additionally has the CORS behavior defined under
[Prover asset sources](#prover-asset-sources); successful CORS is sufficient
for its COEP consumer and does not also require CORP. A local asset route returns
`Cross-Origin-Resource-Policy: same-origin`; it needs no CORS header because
the popup, prover, worker, and asset share the configured server origin.

An asset URL is never reused for different bytes or execution-relevant response
metadata, including media type, CORS/CORP behavior, and worker or isolation
policy. Launch trusts the configured remote host or server-admitted local file;
the prover does not hash downloaded dependencies at runtime.

Popup/prover markup, stylesheet text, and the inline libID logo are compiled
into their root modules. The package release publishes their exact stylesheet
hashes for CSP construction; it publishes no separate popup HTML template,
logo, stylesheet, theme, or renderer artifact.

Popup and prover HTML may embed deployment-specific values but is invariant
within that deployment release and remains `no-store`. A production deployment
uses immutable root URLs. Serving mutable bytes at one of those URLs or
broadening CSP is unsupported.

The reference deployment uses a dedicated cookie-free origin with no unrelated
same-origin API. This limits incidental ambient authority but does not create a
new protocol role or require a canonical libID service.

## Compatibility and changes

A live page keeps its loaded modules and embedded configuration; rotation may
fail an old ceremony closed and affects new clients. A breaking HTTP route or
response changes the server API namespace. Other version axes are defined in
[ARCHITECTURE.md](ARCHITECTURE.md#versioning-and-compatibility).
