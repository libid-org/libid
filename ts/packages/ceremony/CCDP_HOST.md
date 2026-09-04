# CCDP Host deployment contract

This document defines the HTTP and deployment contract for a CCDP Host.
[CCDP](CCDP.md#documents-and-routes) owns the protocol routes, fragments,
execution contexts, roles, navigations, and versions; this document defines how
one host serves those resources and their proving assets. It does not redefine
the protocol.

## Boundary

One CCDP Host serves one canonical HTTPS `ccdpOrigin`. Explicit loopback
development is the only HTTP exception. It serves:

- every versioned CCDP resource required by the CCDP versions it supports; and
- every module, worker, WASM, circuit, and CRS resource fetched by those
  implementations.

The OAuth Bridge separately serves ceremony configuration, the registered
callback shell, and enabled confidential platform endpoints. OAuth Platform,
OAuth Bridge, Notary Service, and public platform API requests are protocol
traffic rather than CCDP assets.

The CCDP Host may be the canonical libID deployment or an operator-selected
replacement. Replacing it changes the code-supply-chain authority for Callback
and proof generation.

## Static distribution

The ceremony build emits hostable static responses for each supported CCDP
version: Prefetch, Callback, Airlock, Prover, Worker, and their immutable
browser dependencies. It also emits the matching response metadata needed to
apply this document's media types, cache rules, and security headers. On-disk
layout and build tooling are not protocol surface.

A CCDP Host consumes that output and maps it to the protocol routes. It may
serve the files from disk, embed them in a binary, or publish them through a
static CDN; it needs no JavaScript runtime. A host may run the ceremony build
itself, but need not do so when it consumes a published distribution. It does
not compile, template, import, or execute ceremony code while handling a
request.

## Protocol resources

The host implements the exact versioned paths defined by
[CCDP](CCDP.md#documents-and-routes): Callback, Prefetch, Airlock, Prover, and
Worker. Their paths, fragments, roles, and execution contexts remain CCDP
rules.

Prefetch, Airlock, and Prover responses contain their clearing bootstrap and
entry code directly, with no root manifest or second entry-script request. They
may load implementation-private immutable chunks and expose only an empty mount
point to package-owned presentation. Callback remains a separate module because
the OAuth Bridge shell loads the version selected from OAuth `state`.

Every supported resource response is invariant across requests. Query values,
request headers, `Origin`, `Referer`, cookies, and user agent cannot select its
bytes, policy, embedded configuration, or implementation. Unsupported methods,
queries, paths, and CCDP versions fail without fallback or redirect. The host
sets no cookies and serves no unrelated same-origin application API.

Versioned protocol resources use `Cache-Control: no-cache` and a strong `ETag`
so a path may receive compatible implementation updates. A breaking protocol
change publishes a new CCDP-version path. The host retains old resources for
live ceremonies and the configured compatibility window.

## Response profiles

All resources send their exact media type and
`X-Content-Type-Options: nosniff`. Top-level documents additionally send
`Referrer-Policy: no-referrer` and are not frameable. Document CSP begins with
`default-src 'none'`, `object-src 'none'`, `base-uri 'none'`,
`form-action 'none'`, and `frame-ancestors 'none'`; admits only the exact
deployment-generated entry code, stylesheet, resources, and network origins
required by that document; and uses neither broad schemes nor JavaScript
`'unsafe-inline'` or `'unsafe-eval'`.

### Callback module

Callback is an ES module loaded by an OAuth Bridge callback shell. It uses the
`text/javascript; charset=utf-8` media type, noncredentialed
`Access-Control-Allow-Origin: *`,
and `Cross-Origin-Resource-Policy: cross-origin`. Its path fixes `CCDPVersion`;
request data cannot select module bytes. The OAuth Bridge contract independently
owns the callback document and its CSP.

### Prefetch and Airlock documents

Both are top-level, non-isolated HTML documents with
`Cross-Origin-Opener-Policy: unsafe-none` and no COEP. Prefetch admits only its
same-origin Worker and selected proving resources. Airlock admits only the code
and presentation needed to accept a connection and navigate to Prover.

### Prover document

Prover is a top-level HTML document with
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. Its CSP admits only same-origin
proving resources, toolchain-required `blob:` workers, and the closed external
network origins needed by supported platform pipelines. It begins proving only
after confirming cross-origin isolation, shared memory, and worker support;
there is no weaker fallback.

One response may support multiple platform profiles and OAuth Bridges. CSP is
therefore not browser-enforced compartmentalization between them: compromised
Prover code can use every network class admitted by that response. Stronger
confinement requires distinct responses.

### Worker

Worker is `text/javascript; charset=utf-8` module Service Worker JavaScript.
Prefetch registers the
version-matched `/ccdp/v{CCDPVersion}/worker.js`; its default scope covers the
matching Prefetch, Airlock, and Prover paths. Its response policy admits only
the same-origin implementation and proving resources needed for popup
continuity and asset caching.

## Proving assets

`GET /ccdp/assets/*` is the host's static proving-resource namespace,
not a CCDP API or versioned protocol route. Every browser-fetched proving
resource other than the versioned CCDP resources resolves there. Its suffix has
no protocol-defined structure: versioned CCDP code pins each exact path, and
consumers neither enumerate nor parse the namespace. Asset filenames carry any
artifact and release identity needed to keep those paths immutable. Assets
shared by multiple CCDP versions reuse one URL.

Each asset response:

- has a canonical path with no query, fragment, mutable alias, or redirect;
- serves one immutable byte sequence with the exact media type and `nosniff`;
- uses `Cross-Origin-Resource-Policy: same-origin`; and
- uses `Cache-Control: public, max-age=31536000, immutable`.

An immutable URL is never reused for changed bytes or execution-relevant
metadata. Runtime content hashing is not required. A release-qualified path,
content-addressed path, or build-generated immutable path satisfies the same
contract.

The host may resolve a pinned path from a local asset directory or a configured
remote file. Its startup configuration is an `assetSources` list:

```text
./assets/*
/opt/libid/circuits/*
https://github.com/libid-org/libid-circuits/releases/download/v0.3.0/manifest.json
```

The remote entry illustrates a concrete asset from the
[`libid-circuits` v0.3.0 release](https://github.com/libid-org/libid-circuits/releases/tag/v0.3.0).
A separate asset CDN is unnecessary: the CCDP Host is the stable
browser-facing origin and may itself be deployed through a CDN.

A local source is an absolute path or a path resolved relative to the host
configuration file. It may end in the sole supported wildcard, `/*`, to include
the directory's direct regular files. A remote source is one concrete HTTPS
file URL; wildcard and directory URLs are invalid. The configured URL's final
path segment or local filename becomes its name under `/ccdp/assets/`.

At startup the host expands local sources, fetches remote sources, and builds
one in-memory or local-file catalog. It rejects duplicate names, invalid names,
missing required build assets, non-file local matches, failed fetches, and
non-HTTPS remote redirects before becoming ready. It never redirects the
browser, exposes an upstream URL, lists the catalog, or fetches an asset on a
browser request. A published distribution may supply the complete default
catalog; configuration only selects or supplements its sources.

This source mechanism is private deployment policy. To preserve the immutable
route contract, a configured source must yield the same bytes and metadata
across process restarts; operators therefore use versioned or otherwise
immutable remote files.

The ceremony build pins each platform/version circuit path, the shared
notarization-client paths, Noir and bb.js dependencies, workers, WASM, CRS paths,
and SRS size. Requests, fragments, messages, and application inputs cannot add
or replace them. No browser-visible asset configuration or catalog response
exists.

No shared deployment system with the OAuth Bridge is required; its advertised
platform/version pairs must simply be a subset of those implemented by the
configured CCDP Host and backed by available assets.

The host retains an immutable asset while any supported CCDP implementation or
platform profile references it. Asset revisions do not change `CCDPVersion` or
`PlatformCeremonyVersion` unless their observable protocol or proof semantics
change.
