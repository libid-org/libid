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

## Prover configuration

The host embeds the same exact record into Prefetch and Prover:

```ts
interface ProverProfile {
  platformId: PlatformId
  platformCeremonyVersion: PlatformCeremonyVersion
  circuitPath: string
}

interface ProverAssets {
  notarizationClientPath: string
  notaryAddress: string
  profiles: readonly ProverProfile[]
}
```

`circuitPath` and `notarizationClientPath` are canonical root-relative paths
under `/ccdp/assets/`, with no query or fragment. Resolving either against the
current document must retain the exact `ccdpOrigin`. The notarization WASM is a
sibling of `notarizationClientPath`. `notaryAddress` is one canonical external
HTTPS Notary Service origin and is not an asset path.

`profiles` contains exactly one entry for every platform/version pair supported
by that CCDP deployment. X and GitHub may share one circuit path and all
notarized profiles share one notarization-client path. The Prefetch and Prover
implementations exact-validate the record before use. Requests, fragments,
messages, and application inputs cannot add or replace an entry, path, or
Notary Service.

The ceremony build pins Noir, bb.js, their workers and WASM, CRS resource paths,
and SRS size. These are emitted and served by the host but do not appear in
`ProverAssets`.

## Proving assets

`GET /ccdp/assets/*` is the host's static proving-resource namespace,
not a CCDP API or versioned protocol route. Every browser-fetched proving
resource other than the versioned CCDP resources resolves there. The suffix is
implementation-private; a useful layout is
`/ccdp/assets/{artifact}/{release}/{file}`, but consumers never parse it. Assets
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

Deployment may obtain source bytes from an upstream release, local file, or CDN
build input. It validates and publishes them at CCDP-origin paths before making
a profile available. Upstream locations are never embedded into browser
configuration or fetched by the browser. No shared deployment system with the
OAuth Bridge is required; its advertised platform/version pairs must simply be
a subset of those available from the configured CCDP Host.

The host retains an immutable asset while any supported CCDP implementation or
platform profile references it. Asset revisions do not change `CCDPVersion` or
`PlatformCeremonyVersion` unless their observable protocol or proof semantics
change.
