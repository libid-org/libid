# CCDP Host

This document defines the HTTP and deployment contract for a CCDP Host.
[CCDP](CCDP.md#documents-and-routes) owns the protocol routes, fragments,
execution contexts, roles, navigations, and versions; this document defines how
one host serves those resources and their proving assets. It does not redefine
the protocol.

## Ownership and trust boundary

One CCDP Host serves one canonical HTTPS `ccdpOrigin`. Explicit loopback
development is the only HTTP exception. It serves:

- every versioned CCDP resource required by the CCDP versions it supports; and
- every module, worker, WASM, circuit, and CRS resource fetched by those
  implementations.

The OAuth Bridge separately serves ceremony configuration, the registered
callback shell, and enabled confidential platform endpoints. Requests to the
OAuth Platform, OAuth Bridge, Notary Service, and public platform APIs are
protocol traffic rather than CCDP assets.

The CCDP Host may be the canonical libID deployment or an operator-selected
replacement. Replacing it changes the code-supply-chain authority for Callback
and proof generation.

## Static distribution

The ceremony build emits hostable static responses for each supported CCDP
version: Prefetch, Callback, Airlock, Prover, Worker, and their immutable
browser dependencies and proving assets. It fetches or reads the pinned source
releases, safely extracts any archives, validates the code-declared members,
and lays out the complete `/ccdp/assets/` tree. It also emits the matching
response metadata needed to apply this document's media types, cache rules, and
security headers. On-disk layout and build tooling are not protocol surface.

A CCDP Host consumes that output and maps it to the protocol routes. It may
serve the files from disk, embed them in a binary, or publish them through a
static CDN. Serving the output needs no JavaScript runtime. A host deployment
may run the ceremony build itself, but need not do so when it consumes a
published distribution. The host does not compile, template, import, or execute
ceremony code while handling a request.

## HTTP surface

### Protocol resources

The host implements the exact versioned paths defined by
[CCDP](CCDP.md#documents-and-routes): Callback, Prefetch, Airlock, Prover, and
Worker. Their paths, fragments, roles, and execution contexts remain CCDP
rules.

Prefetch, Airlock, and Prover responses contain their clearing bootstrap and
entry code directly, with no root manifest or second entry-script request. They
may load implementation-private immutable chunks and expose only an empty mount
point to package-owned presentation. Callback remains a separate module because
the OAuth Bridge shell loads the version selected from OAuth `state`.

Each supported path has one request-invariant representation and policy.
Standard conditional caching may return `304 Not Modified`; otherwise query
values, request headers, `Origin`, `Referer`, cookies, and user agent cannot
select different bytes, policy, embedded configuration, or implementation.
Unsupported methods, queries, paths, and CCDP versions fail without fallback or
redirect. The host sets no cookies and serves no unrelated same-origin
application API.

Versioned protocol resources use `Cache-Control: no-cache` and a strong `ETag`
so a path may receive compatible implementation updates. A breaking protocol
change publishes a new CCDP-version path. The host retains old resources for
live ceremonies and the configured compatibility window.

All protocol resources send their exact media type and
`X-Content-Type-Options: nosniff`. Top-level documents additionally send
`Referrer-Policy: no-referrer` and are not frameable. Document CSP begins with
`default-src 'none'`, `object-src 'none'`, `base-uri 'none'`,
`form-action 'none'`, and `frame-ancestors 'none'`; admits only the exact
build-generated entry code, stylesheet, resources, and network origins
required by that document; and uses neither broad schemes nor JavaScript
`'unsafe-inline'` or `'unsafe-eval'`.

Resource-specific rules are:

| Resource | Form | Additional response contract |
|---|---|---|
| Callback | ES module loaded by the OAuth Bridge shell | `text/javascript; charset=utf-8`, noncredentialed `Access-Control-Allow-Origin: *`, and `Cross-Origin-Resource-Policy: cross-origin`. The OAuth Bridge owns the containing document and its CSP. |
| Prefetch | top-level non-isolated HTML | `Cross-Origin-Opener-Policy: unsafe-none` and no COEP. CSP admits only its same-origin Worker and proving resources. |
| Airlock | top-level non-isolated HTML | `Cross-Origin-Opener-Policy: unsafe-none` and no COEP. CSP admits only the code and presentation needed to accept a connection and navigate to Prover. |
| Prover | top-level isolated HTML | `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. CSP admits only same-origin proving resources, toolchain-required `blob:` workers, and the closed external network origins needed by supported platform pipelines. It begins proving only after confirming cross-origin isolation, shared memory, and worker support; there is no weaker fallback. |
| Worker | module Service Worker JavaScript | `text/javascript; charset=utf-8`. Its default scope covers the version-matched Prefetch, Airlock, and Prover paths, and its policy admits only the same-origin implementation and proving resources needed for popup continuity and asset caching. |

One Prover response may support multiple platform profiles and OAuth Bridges.
Its CSP is therefore not browser-enforced compartmentalization between them:
compromised Prover code can use every network class admitted by that response.
Stronger confinement requires distinct responses.

### Proving assets

`GET /ccdp/assets/*` is the host's static proving-resource namespace,
not a CCDP API or versioned protocol route. Every browser-fetched proving
resource other than the versioned CCDP resources resolves there. Its suffix has
no protocol-defined structure: versioned CCDP code pins each exact path, and
protocol code neither enumerates nor parses the namespace. Each path carries
any artifact and release identity needed to remain immutable. Assets
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

The static distribution already contains every path referenced by its code.
The host neither resolves upstream sources nor extracts archives, and browser
requests never list the asset tree, reach an upstream URL, or trigger a remote
fetch. A separate asset CDN is unnecessary: the CCDP Host is the stable
browser-facing origin and may itself be deployed through a CDN.

The ceremony build pins each platform/version circuit path, the shared
notarization-client paths, Noir and bb.js dependencies, workers, WASM, CRS paths,
and SRS size. Requests, fragments, messages, and application inputs cannot add
or replace them. The Host receives no asset-source configuration and exposes no
catalog response.

No shared deployment system with the OAuth Bridge is required; its advertised
platform/version pairs must simply be a subset of those present in the
configured CCDP Host distribution.

The host retains an immutable asset while any supported CCDP implementation or
platform profile references it. Asset revisions do not change `CCDPVersion` or
`PlatformCeremonyVersion` unless their observable protocol or proof semantics
change.
