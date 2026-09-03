# OAuth Bridge Server

This document defines the HTTP and deployment contract for the OAuth-owning
OAuth bridge used by `@libid/ceremony`. The bridge publishes platform
configuration, serves the OAuth callback document, and performs the one
confidential platform exchange required by GitHub.

The package API is defined in [ARCHITECTURE.md](ARCHITECTURE.md), the callback
participant in [CALLBACK.md](CALLBACK.md), and proof generation in
[PROVER.md](PROVER.md). The normative libID specification owns authorization,
platform-return, token-exchange, and proof semantics; this document fixes only
the bridge's public transport and deployment boundary.

## Boundary

The OAuth bridge owns:

- OAuth application registrations, public client IDs, and confidential client
  credentials;
- the public ceremony configuration;
- the callback document, its configured path, response policy, and
  immutable callback modules; and
- GitHub's confidential token exchange and token attestation when GitHub is
  enabled.

It does not serve the prover document, prover modules, circuits, notarization
client, proving toolchain, or prover Service Worker. It owns no ceremony Job and
keeps no ceremony progress, OAuth return, proof, retry, cancellation, or
recovery state. Google and X require no confidential bridge route.

The OAuth bridge and prover may use different origins or sites. The bridge
origin is a code-supply-chain boundary for OAuth callback code and public
configuration; the proving origin is an independent code-supply-chain boundary
for proof generation. Supplying the bridge origin to the prover at runtime does
not make the prover response deployment-specific.

## Deployment configuration

One bridge deployment has these inputs:

| Input | Contract |
|---|---|
| Bridge origin | Canonical HTTPS origin used by every bridge route and the configured OAuth redirect URI; explicit loopback development is the only HTTP exception |
| `allowedAppOrigins` | Nonempty, duplicate-free set of canonical HTTPS application origins admitted to fetch configuration and authenticate the callback popup connection |
| Proving origin | One canonical HTTPS origin selected by the operator; defaults may point to the canonical libID Proving Host |
| Callback path | Developer-configurable fixed path whose default is `/auth/callback`; the same URL is used for initial launch and registered as every enabled platform's OAuth `redirect_uri` |
| Platform profiles | Public OAuth client ID and supported ceremony versions for each enabled platform |
| Callback roots | Closed CCDP root map, immutable filenames, stylesheet hash, and response-policy sources required by [CCDP](CCDP.md#callback-shell) |
| GitHub settings | Client secret, redirect URI, token endpoint settings, and server-side notary settings when GitHub is enabled |

`allowedAppOrigins` has no protocol maximum. A duplicate or invalid member is a
deployment error rather than something the bridge normalizes. The set drives
configuration CORS and is embedded into the callback document. It is never
inferred from a request's `Origin`, `Referer`, query, fragment, or body.

The proving origin is likewise deployment data. It is returned to the
application in public configuration and embedded into the callback document so
the callback can start selected-profile prefetch and later navigate the popup to
the prover. It does not identify an artifact, circuit, or notary endpoint.

One platform configuration generates both the public profile entries and the
OAuth registrations used by the callback. The bridge advertises only
platform/version pairs supported by its selected Proving Host.

## Route surface

The bridge exposes only:

| Method | Route | Availability | Purpose | Origin enforcement |
|---|---|---|---|---|
| `GET` | `/api/v1/ceremony/config` | always | public platform and prover configuration | exact request `Origin` member of `allowedAppOrigins`; exact noncredentialed CORS |
| `GET` | configured callback path, default `/auth/callback` | always | callback shell for initial launch and registered OAuth `redirect_uri` | none at HTTP ingress; callback authenticates its popup connection after clearing and classifying its input |
| `OPTIONS`, `POST` | `/api/v1/ceremony/github-token` | only when GitHub is enabled | confidential GitHub token exchange and token attestation | exact request `Origin` equal to the configured proving origin; exact noncredentialed CORS |

Top-level and iframe navigation may omit `Origin`, and an OAuth-platform callback may
identify the platform rather than the application. `Referer` is never an
authority input. The callback document is therefore public and
request-invariant; its browser protocol authenticates the application after it
loads.

No prover, artifact, preparation, continuation, polling, status, result,
cancellation, browser TLS bridge, or proof-recovery route exists on the
OAuth bridge. Unsupported methods fail without route work. Except for the
OAuth-platform-mandated callback query and the GitHub JSON request, bridge routes
accept no query or request body.

The `v1` in `/api/v1/ceremony/...` versions the bridge's JSON API.
The configured callback path is a browser protocol document; its shell selects
`CCDPVersion` from browser-local launch input or OAuth `state`.
`PlatformCeremonyVersion` independently versions one platform ceremony. There
is no request-time version negotiation.

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
  provingOrigin: string
  platforms: Readonly<Record<string, PlatformConfig>>
}
```

The response rules are:

- `PlatformCeremonyVersion` is an unsigned 16-bit integer.
- `redirectUri` is the canonical registered URL on the bridge origin. It
  contains no credentials, query, or fragment.
- `provingOrigin` is the configured canonical HTTPS origin with no credentials,
  path, query, or fragment.
- Each platform entry has one public client ID and a nonempty, duplicate-free
  list of supported ceremony versions. List order has no meaning.
- Unknown fields, malformed URLs, and unsupported numeric representations are
  invalid. A platform absent from the client's closed local catalog is ignored;
  known entries remain exact-validated before use.
- The record contains no secret, `allowedAppOrigins`, artifact URL, CSP source,
  notary setting, platform display metadata, or application-specific value.

The request must carry an `Origin` which exactly matches an
`allowedAppOrigins` member. A successful response sets that exact origin in
`Access-Control-Allow-Origin`, permits no credentials, never uses `*`, and uses
`Content-Type: application/json`, `Cache-Control: no-store`, and
`X-Content-Type-Options: nosniff`. Missing and unlisted origins fail without
returning configuration. Request values do not alter the response record.

The application-scoped `CeremonyClient` fetches and validates this record once
at creation. It freezes the selected client ID, redirect URI, proving origin,
and mutually supported platform ceremony version in each live ceremony.
Callback and prover documents never fetch bridge configuration.

## Callback document

The configured callback path serves one deployment-generated callback document.
The application opens that URL for initial launch, and each enabled OAuth
application registers the same URL as its `redirect_uri`. There is no callback
alias or HTTP redirect.

The response is invariant across requests. Its HTML, headers, root map, CSP,
embedded `allowedAppOrigins`, and proving origin do not depend on request
`Origin`, `Referer`, query, fragment, platform, or ceremony. The document is
top-level, non-isolated, and non-frameable so it preserves the application
opener whenever OAuth-platform policy permits.

[CCDP](CCDP.md#callback-shell) owns the shell's input modes, clearing and root
selection. The bridge embeds only that closed root map, `allowedAppOrigins`,
the configured proving origin, stylesheet hash, and fixed CSP sources.

### Shell document

The response contains only the semantic equivalent of:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>libID</title>
  </head>
  <body>
    <main id="libid-root"></main>
    <script type="module">/* deployment-generated bootstrap */</script>
  </body>
</html>
```

The exact bootstrap is inline so it can clear credentials before requesting any
subresource. Its CSP hash is generated from its exact deployment bytes. The
document contains no external config script, preload, analytics, application
markup, or request-derived interpolation. The root module owns all later UI.

The bootstrap embeds one current default input tuple and a closed map from
supported CCDP versions to immutable, same-origin callback root URLs. A root
entry may override the tuple when needed. Version 1 is equivalent to:

```ts
const defaultInputs = deepFreeze([
  ['https://app.example'],
  'https://prove.lib.id',
])

const callbackRoots = Object.freeze({
  1: Object.freeze({
    moduleUrl: new URL(
      '/assets/libid-ccdp-v1-callback.js',
      location.origin,
    ).href,
  }),
})
```

The displayed asset path is illustrative; a deployment may use any immutable
same-origin path. Neither URL input nor a network response can add or replace a
map entry.

### Stable root input

After selecting and importing a root, the bootstrap calls its sole entrypoint
with the captured location followed by its override or the deeply frozen
default inputs:

```ts
interface CallbackLocationInput {
  query: string
  fragment: string
}

const root = await import(selected.moduleUrl)
root.startCallback(locationInput, ...(selected.inputs ?? defaultInputs))
```

`query` and `fragment` are the bounded byte-for-byte URL components captured
before clearing, including their leading delimiter when nonempty. On initial
launch, `locationInput` contains the launch fragment rather than an OAuth
return. The root exact-validates the selected shape, including unknown fields,
before using it and copies the origin list again before popup acceptance. For
CCDP version 1, the root defines and exact-validates this signature:

```ts
declare function startCallback(
  locationInput: CallbackLocationInput,
  allowedApplicationOrigins: readonly string[],
  provingOrigin: string,
): void
```

The shell-to-root contract is deliberately unversioned and fixed. URL input is
always the raw query/fragment pair, while both default and overridden `inputs`
are opaque to the shell. Each immutable CCDP root defines and exact-validates
its own argument tuple. Roots use the latest deployment values by default. Before
changing the tuple incompatibly, the deployment pins the previous tuple only on
roots that still require it. This changes neither the shell algorithm nor the
browser URL. Neither URL input nor a network response may supply arguments.

### Bootstrap algorithm

Before module import, rendering, storage, error reporting, or other network use,
the inline bootstrap:

1. bounds and copies the raw query and fragment;
2. clears both with `history.replaceState` while retaining the same path;
3. accepts either an empty-query launch fragment or an OAuth-platform return containing
   exactly one routing `state`;
4. reads only `ccdpVersion` from launch input or the `v<version>.` prefix from
   OAuth `state` and rejects malformed, conflicting, or unsupported values;
5. selects the corresponding closed root and its optional input override;
6. deeply freezes the captured location and resolved inputs; and
7. imports the immutable root and invokes
   `startCallback(locationInput, ...(selected.inputs ?? defaultInputs))` once.

Any failure imports no other root and renders only fixed text after clearing.
The bootstrap never parses a platform credential, selects a prover asset, or
uses `Origin` or `Referer` as configuration.

Google returns its credential in the fragment, which is never sent to the
bridge. X and GitHub return OAuth-platform-mandated callback parameters in the query.
The bridge and every upstream proxy suppress or redact callback query strings
from access logs, traces, analytics, metrics labels, and error reports. No
later URL carries the captured return.

The callback response uses:

- `Cross-Origin-Opener-Policy: unsafe-none`;
- `Content-Type: text/html`, `X-Content-Type-Options: nosniff`,
  `Cache-Control: no-store`, and `Referrer-Policy: no-referrer`;
- CSP beginning with `default-src 'none'`, `object-src 'none'`,
  `base-uri 'none'`, `form-action 'none'`, and `frame-ancestors 'none'`;
- `frame-src` admitting only the exact configured proving origin;
- `connect-src` admitting only fixed sources required by the configured popup
  fallback;
- `style-src` permitting only the exact package stylesheet hash;
- one exact hash for the inline clearing bootstrap and only the closed immutable
  callback-root sources; and
- no broad scheme, JavaScript `'unsafe-inline'`, or `'unsafe-eval'` source.

The callback root and its companion assets use immutable versioned URLs, exact
media types, `X-Content-Type-Options: nosniff`, compatible CORS/CORP policy, and
`Cache-Control: public, max-age=31536000, immutable`. A URL is never reused for
different bytes or execution-relevant headers. Markup, styles, and logo remain
package-owned; the bridge exposes no separate template or theme contract.

## GitHub token endpoint

When GitHub is enabled, `POST /api/v1/ceremony/github-token` performs the
confidential OAuth token exchange and token TLSNotary session synchronously. It
retains no state. The prover derives this fixed route from the origin of the
Ceremony Client's frozen `redirectUri` in `AppRequestProof`; the prover document
does not embed it.

The bridge API version implements GitHub ceremony version `1` only. The request
carries no ceremony-version field, and configuration must not advertise a
GitHub version requiring different token-service semantics. Such a change
requires a new bridge API version.

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

Both records are UTF-8 JSON objects. Member order and insignificant whitespace
have no meaning. Duplicate, missing, additional, or wrongly typed members are
invalid. The versioned route carries no redundant schema field.

`code` is nonempty printable ASCII without whitespace or control bytes and at
most 1,024 bytes. `codeVerifier` matches `[A-Za-z0-9_-]{43}`. The bridge does
not normalize either value.

`accessToken` is nonempty printable ASCII without whitespace or control bytes
and at most 4,096 bytes. `attestedData` decodes to a nonempty byte-exact record
of at most 2 MiB; `signature` decodes to exactly 65 bytes; and `bearerOpening`
decodes to exactly 16 bytes. Every byte string uses canonical unpadded base64url.
The encoded response body is at most 3 MiB.

The returned fields are one correlated result: the uniquely framed bearer
commitment in `tokenAttestation.attestedData` equals
`SHA256(accessToken || bearerOpening)`. The bridge preserves signed attestation
bytes exactly. Before its dependent identity notarization, the prover validates
the response encoding, correlation, and open request bindings. Local notary
signature verification remains optional; downstream proof verification is
authoritative.

The endpoint contract is:

- the query is empty and the request media type is exactly `application/json`;
- preflight and POST `Origin` exactly equal the configured proving origin;
- successful preflight admits only `POST` and `Content-Type`, uses no
  credentials, and returns no ceremony data;
- malformed UTF-8, JSON, or fields fail before token exchange;
- client ID, client secret, redirect URI, GitHub endpoint, notary, proxy, and
  destination come only from bridge configuration;
- redirects are rejected and request duration and response size are bounded;
- success is status `200` with exact noncredentialed CORS,
  `Content-Type: application/json`, `Cache-Control: no-store`, and one bounded
  `TokenResponse`;
- credentials and OAuth-platform-return values never enter logs, traces, analytics,
  metrics labels, or error bodies; and
- failure returns no partial credential, attestation, or caller-selected
  diagnostic content.

Timeout, duplicate request, restart, or response loss leaves no bridge record.
There is no action ID, polling route, progress stream, or response recovery; a
lost response requires a fresh ceremony.

## Compatibility

A live page keeps its loaded callback module and embedded configuration. A
breaking JSON request or response changes the bridge API version. CCDP,
platform ceremony, prover release, and popup connection versions remain
independent as defined in
[ARCHITECTURE.md](ARCHITECTURE.md#versioning-and-compatibility).
