# CCDP Distribution

This document defines the static browser resources and proving assets required
by [CCDP](CCDP.md#documents-and-routes). CCDP owns the protocol routes,
fragments, roles, navigations, and versions; this document owns their HTTP,
build, and deployment contract.

## Distribution boundary

One CCDP Distribution is served from one canonical HTTPS `ccdpOrigin`. Explicit
loopback development is the only HTTP exception. It contains:

- every protocol resource for each supported CCDP version; and
- every module, worker, WASM, circuit, CRS, and other browser dependency those
  resources fetch.

The OAuth Bridge separately serves ceremony configuration, the registered
callback shell, and enabled confidential platform endpoints. Requests to the
OAuth Platform, OAuth Bridge, Notary Service, and public platform APIs are
protocol traffic rather than CCDP assets.

The Distribution may be the canonical libID release or an operator-selected
replacement. Replacing it changes the code-supply-chain authority for Callback
and proof generation.

One Distribution may serve any number of independently operated OAuth Bridges.
It does not enumerate or register them: each Bridge selects a `ccdpOrigin`,
which serves the same public resources to all of them. A Bridge advertises only
platform/version pairs present in its selected Distribution; no shared
deployment system is required.

## HTTP contract

The Distribution is static and request-invariant. It sets no cookies, serves no
unrelated same-origin application API, and performs no request-time compilation,
templating, source resolution, archive extraction, or remote asset fetch.

### Protocol resources

The Distribution exposes the exact versioned
[resources](CCDP.md#documents-and-routes) defined by CCDP. Their fragments,
roles, and execution contexts remain CCDP rules.

Prefetch, Airlock, and Prover contain their clearing bootstrap and entry code
directly, with no browser-visible manifest or second entry-script request. They
may load implementation-private immutable chunks and expose only an empty mount
point to package-owned presentation. Callback remains a separate ES module
because the OAuth Bridge shell loads the version selected from OAuth `state`.

Each supported path has one representation and response policy. Conditional
caching may return `304 Not Modified`; otherwise query values, request headers,
`Origin`, `Referer`, cookies, and user agent cannot select different bytes,
policy, embedded configuration, or implementation. A nonempty query may receive
the same static resource, but its clearing bootstrap rejects before protocol
execution. Only `GET` and `HEAD` are defined. Unknown paths and versions return
an inert failure without fallback or redirect; other methods execute no CCDP
code.

The not-found response is static HTML containing no script, style, link, form,
redirect, or protocol data.

Versioned protocol resources use `Cache-Control: no-cache` and an ETag so one
path may receive compatible implementation updates. A breaking protocol change
publishes a new CCDP-version path.

All protocol resources send their exact media type and
`X-Content-Type-Options: nosniff`. Top-level documents additionally send
`Referrer-Policy: no-referrer` and are not frameable. Document CSP begins with
`default-src 'none'`, `object-src 'none'`, `base-uri 'none'`,
`form-action 'none'`, and `frame-ancestors 'none'`; admits only the exact
build-generated entry code, stylesheet, resources, and network sources needed
by that document; and uses neither JavaScript `'unsafe-inline'` nor
`'unsafe-eval'`.

| Resource | Form | Additional response contract |
|---|---|---|
| Callback | ES module loaded by the OAuth Bridge shell | `text/javascript; charset=utf-8`, noncredentialed `Access-Control-Allow-Origin: *`, and `Cross-Origin-Resource-Policy: cross-origin`. The OAuth Bridge owns the containing document and its CSP. |
| Prefetch | top-level non-isolated HTML | `Cross-Origin-Opener-Policy: unsafe-none` and no COEP. CSP admits only its same-origin Worker and proving resources. |
| Airlock | top-level non-isolated HTML | `Cross-Origin-Opener-Policy: unsafe-none` and no COEP. CSP admits only the code and presentation needed to accept a connection and navigate to Prover. |
| Prover | top-level isolated HTML | `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Script, worker, and asset sources remain closed to the build-generated same-origin graph and toolchain-required `blob:` workers. `connect-src https:` permits a shared Prover to call any validated third-party OAuth Bridge; the build additionally pins the Notary Service's exact WebSocket origin. Proving begins only after confirming cross-origin isolation, shared memory, and worker support; there is no weaker fallback. |
| Worker | module Service Worker JavaScript | `text/javascript; charset=utf-8` and `Service-Worker-Allowed: /`. Prefetch registers it with `scope: '/'`; it remains compatible with every live CCDP version, passes requests outside its pinned resource graph through unchanged, and admits only the same-origin implementation and proving resources needed for popup continuity and asset caching. |

One request-invariant Prover response supports multiple platform profiles and
arbitrary canonical HTTPS OAuth Bridges. CSP cannot express a runtime-selected
exact Bridge origin, so its HTTPS connection class is not per-Bridge
compartmentalization. Prover derives GitHub's fixed token route only from the
validated `redirectUri` frozen by the Application; no message supplies another
Bridge endpoint. Compromised Prover code can use every network class admitted
by the response.

### Proving assets

`GET /ccdp/assets/*` is the Distribution's static proving-resource namespace,
not a CCDP API or versioned protocol route. Every browser-fetched proving
resource other than the versioned protocol resources resolves there. CCDP
assigns no structure to the suffix: versioned code pins each exact path, while
protocol code neither enumerates nor parses the namespace.

Each asset response:

- has a canonical path with no query, fragment, mutable alias, or redirect;
- serves one immutable byte sequence with its exact media type and `nosniff`;
- uses `Cross-Origin-Resource-Policy: same-origin`; and
- uses `Cache-Control: public, max-age=31536000, immutable`.

The ceremony build pins every platform/version circuit, shared notarization
resource, Noir and bb.js dependency, worker, WASM, CRS path, and SRS size.
Requests, fragments, messages, and application inputs cannot add or replace
them. The Distribution receives no asset-source configuration and exposes no
catalog.

The distribution contains every path referenced by its code. Browsers never
list the asset tree, reach an upstream source, or trigger archive extraction or
remote fetch. A separate asset CDN is unnecessary: `ccdpOrigin` is the stable
browser-facing origin and may itself run behind a CDN.

### Publication and compatibility

Activation is asset-complete: every immutable resource referenced by an updated
protocol resource or Worker is retrievable with its final bytes and response
metadata before that update becomes reachable.

An unchanged asset retains its URL across compatible releases. Changed bytes or
execution-relevant metadata receive a new immutable URL, and old URLs remain
available while any live ceremony, supported CCDP implementation, platform
profile, or compatibility window may reference them. Runtime content hashing is
not required; release-qualified, content-addressed, and build-generated
immutable paths all satisfy this contract.

Asset revisions change `CCDPVersion` or `PlatformCeremonyVersion` only when
their observable protocol or proof semantics change.

## Static artifact build

`@libid/ceremony` owns a platform-neutral artifact pipeline. It produces one
closed graph of public paths, response bodies, and response profiles, then
materializes it as static files and a Static Web Server configuration. The
graph has no separate serialized format or browser-visible manifest.

### Source declarations

One resource table declares each protocol resource's stable public route,
source entrypoint, and response profile:

```ts
const resources = {
  callback: {
    route: `/ccdp/v${version}/callback.js`,
    entry: callbackEntry,
    profile: 'callback',
  },
  prefetch: {
    route: `/ccdp/v${version}/prefetch`,
    entry: prefetchEntry,
    profile: 'prefetch',
  },
  airlock: {
    route: `/ccdp/v${version}/airlock`,
    entry: airlockEntry,
    profile: 'airlock',
  },
  prover: {
    route: `/ccdp/v${version}/prover`,
    entry: proverEntry,
    profile: 'prover',
  },
  worker: {
    route: `/ccdp/v${version}/worker.js`,
    entry: prefetchEntry,
    profile: 'worker',
  },
} as const
```

The entrypoints are build-tool inputs, not output filenames. First-party modules
declare dependencies through ordinary imports; the module owning a non-imported
proving resource declares it once by logical role. The build consumes the
compiler/bundler's emitted graph and filenames. It maintains no second filename
list, generated-source scrape, or deployment template. Renaming an internal
output therefore requires no manual mapping change; renaming an external
release member changes only its code-owned pin.

One response-profile table is the executable source for the policies under
[HTTP contract](#http-contract):

```ts
const responseProfiles = {
  callback: callbackResponseProfile,
  prefetch: prefetchResponseProfile,
  airlock: airlockResponseProfile,
  prover: proverResponseProfile,
  worker: workerResponseProfile,
  asset: immutableAssetResponseProfile,
} as const
```

Profiles contain fixed isolation, cache, framing, media-type, and CSP rules but
no generated filenames. The build fills body-dependent values such as inline
script/style hashes, generated resource URLs, and the build-pinned Notary
Service origin. It does not parse this Markdown or ask SWS to reconstruct
policy.

### Generation

For each supported CCDP version, the pipeline:

1. gives the declared entrypoints to the compiler/bundler;
2. reads emitted filenames and dependency edges from its output API;
3. materializes owner-declared external resources under immutable paths;
4. renders protocol bodies using those paths and response profiles; and
5. validates the closed graph before replacing the generated output.

The pipeline rejects a missing body, unindexed dependency, malformed external
pin, mutable asset path, or partial graph. Pinned source releases are cached by
immutable identity rather than fetched on every build.

## Portable distribution

[Static Web Server v2](https://static-web-server.net/v2/) (SWS) is the sole
serving dependency. It is an open-source static file server with a
[TOML configuration](https://static-web-server.net/v2/configuration/config-file),
[path-matched response
headers](https://static-web-server.net/v2/features/custom-http-headers), ETags,
range requests, and [rootless multi-architecture container
images](https://static-web-server.net/v2/features/docker). No CCDP-specific
server or SWS plugin exists.

Build the portable distribution with:

```sh
pnpm --filter @libid/ceremony build:ccdp-artifacts -- --out-dir <directory>
```

It replaces the output directory only after validating the complete graph and
emits:

```text
<directory>/
├── public/
│   ├── ccdp/v{CCDPVersion}/callback.js
│   ├── ccdp/v{CCDPVersion}/prefetch
│   ├── ccdp/v{CCDPVersion}/airlock
│   ├── ccdp/v{CCDPVersion}/prover
│   ├── ccdp/v{CCDPVersion}/worker.js
│   ├── ccdp/assets/...
│   └── 404.html
└── sws.toml
```

`public/` contains only the validated public graph. `sws.toml` remains outside
that root and is the only deployment manifest. It is generated rather than
operator-edited and starts from this fixed baseline:

```toml
[general]
host = "::"
port = 80
root = "/home/sws/public"
page404 = "/home/sws/public/404.html"
cache-control-headers = false
compression = true
security-headers = false
directory-listing = false
redirect-trailing-slash = false
health = false
text-charset = ""
```

No SPA fallback is configured. Only exact files implement protocol routes.
SWS may negotiate transport compression, but the decoded resource bytes and
their generated response profile remain fixed.

The generator emits one non-overlapping `advanced.headers` rule for every
versioned protocol resource and one recursive rule for the `/ccdp/assets/`
namespace. Those rules are compiled from the response-profile table; SWS does
not reconstruct policy. They set exact media, cache, isolation, framing, CORS,
CSP, and `Service-Worker-Allowed` headers. The generator rejects overlapping
patterns, an omitted profile, an unrepresented file, or any SWS option that
could weaken the [HTTP contract](#http-contract).

The checked-in container recipe is fixed apart from the SWS image digest:

```dockerfile
FROM ghcr.io/static-web-server/static-web-server:2-alpine@sha256:<pinned-digest>
COPY --chown=sws:sws public/ /home/sws/public/
COPY --chown=sws:sws sws.toml /etc/sws.toml
ENV SERVER_CONFIG_FILE=/etc/sws.toml
```

Release automation pins the SWS v2 image by digest, builds this image from the
generated directory, and verifies the served route, header, cache, method, and
404 contracts before publication. The container serves HTTP internally; its
deployment terminates public HTTPS at an ordinary container ingress, load
balancer, or CDN without rewriting paths, bodies, or security headers.

The resulting OCI image is the portable release artifact. A deployment may run
it on any container platform and may place a transparent CDN in front of it.
Promotion switches to the complete image atomically; the image already contains
every old protocol resource and immutable asset required by the supported
compatibility window. No startup download, mounted source directory,
request-time templating, or platform-specific manifest is required.

The same image runs locally:

```sh
docker build --file <ccdp.Dockerfile> --tag libid-ccdp <directory>
docker run --rm --publish 8787:80 libid-ccdp
```

Rebuilding it for development changes no browser protocol or response policy.
