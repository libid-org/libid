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
| Worker | module Service Worker JavaScript | `text/javascript; charset=utf-8`. Its default scope covers the version-matched Prefetch, Airlock, and Prover paths, and its policy admits only the same-origin implementation and proving resources needed for popup continuity and asset caching. |

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

`@libid/ceremony` owns a target-neutral artifact pipeline. It produces one
closed graph of public paths, response bodies, and response profiles, then
passes that graph directly to a target-specific output step. The graph has no
serialized public or deployment-facing format.

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
Service origin. It does not parse this Markdown or ask a deployment target to
reconstruct policy.

### Generation

For each supported CCDP version, the pipeline:

1. gives the declared entrypoints to the compiler/bundler;
2. reads emitted filenames and dependency edges from its output API;
3. materializes owner-declared external resources under immutable paths;
4. renders protocol bodies using those paths and response profiles; and
5. validates the closed graph before passing it to the selected deployment
   target.

The pipeline rejects a missing body, unindexed dependency, malformed external
pin, mutable asset path, or partial graph. Pinned source releases are cached by
immutable identity rather than fetched on every build.

## Deployment targets

A target-specific command materializes the validated graph for one hosting
platform without weakening its routes, bodies, or response policies. There is
no public target interface, custom serving implementation, or portable
deployment manifest. Additional targets may reuse the pipeline when needed.

### Cloudflare Pages

Cloudflare Pages is the current target:

```sh
pnpm --filter @libid/ceremony build:ccdp-artifacts:cf -- --out-dir <directory>
```

It emits a directly deployable directory:

```text
<directory>/
├── ccdp/v{CCDPVersion}/callback.js
├── ccdp/v{CCDPVersion}/prefetch
├── ccdp/v{CCDPVersion}/airlock
├── ccdp/v{CCDPVersion}/prover
├── ccdp/v{CCDPVersion}/worker.js
├── ccdp/assets/...
├── 404.html
└── _headers
```

There is no Pages Function, root `_worker.js`, `_redirects`, or CCDP-specific
server. Exact files implement the routes, generated `_headers` applies their
response profiles, and the inert top-level `404.html` prevents Cloudflare Pages
from enabling its single-page-application fallback.

`_headers` contains one exact block per versioned protocol resource and one
`/ccdp/assets/*` block. It contains no catch-all executable policy. The target
rejects overlapping rules, more than Cloudflare Pages' 100 header rules, or a
header line longer than 2,000 characters. It also rejects a file over 25 MiB or
a distribution over the 20,000-file Wrangler upload limit.

Cloudflare adds `Access-Control-Allow-Origin: *` to static responses by default,
so `_headers` removes it from every profile except Callback, where cross-origin
module loading requires it. Other Cloudflare operational headers cannot weaken
the HTTP contract. Pages supplies ETags and handles compression and conditional
requests.

The target replaces its output directory only after the graph is complete. The
complete directory is deployed before promotion to the production
`ccdpOrigin`. The command accepts `--watch` for local development; watch mode
changes no browser protocol or response policy.

Serve the output locally with:

```sh
npx wrangler pages dev <directory>
```

Publish it with [Cloudflare Pages Direct
Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/):

```sh
npx wrangler pages deploy <directory> --project-name <project>
```

Cloudflare Pages' [`_headers`
format](https://developers.cloudflare.com/pages/configuration/headers/) is the
only target-specific manifest.
