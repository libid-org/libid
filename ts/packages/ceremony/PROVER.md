# `@libid/ceremony` prover architecture

This document defines the prover subsystem emitted by
`@libid/ceremony/prover`: its input/output boundary, closed platform pipelines,
progress steps, release assets, proving toolchain, service-worker prefetch and
cache behavior, and worker graph.

The package API and result lifecycle are defined in
[ARCHITECTURE.md](ARCHITECTURE.md). Cross-document placement and messages are
defined by [CCDP.md](CCDP.md). The integrating server's prover route, embedded
`ProverAssets`, and response headers are defined in [SERVER.md](SERVER.md).
TLSNotary sessions, transcript disclosure, and attestation delivery are defined
in [NOTARIZATION.md](NOTARIZATION.md).
Normative proof relations and authorization semantics remain in the
[common ceremony rules](../../../specs/ceremony-common.md) and
[identity-platform ceremonies](../../../specs/platform-ceremonies.md).

## Component boundary

One dual-context `libid-ceremony-prover.js` artifact serves one prover document
and its ServiceWorker. The document is instantiated in sequential browser
placements:

```text
Before OAuth
└── /api/v1/ceremony/prover#prefetch(...)
    ephemeral iframe starts selected-profile fetches
             │
             └── parent navigates to OAuth; this iframe is destroyed

After OAuth
└── /api/v1/ceremony/prover#<ceremonyId>
    fresh iframe joins the same fetches and either
    ├── proves under DIP, or
    └── coordinates /api/v1/ceremony/prover#<ceremonyId>
        isolated top-level fallback window

Shared ServiceWorker
└── immutable-asset and CRS single flights survive document replacement
```

These are modes of one document and Window entrypoint: the prefetch grammar is
explicit, while a bare ID uses iframe versus top-level placement to distinguish
coordinator from fallback. OAuth navigation prevents reuse of the first iframe;
the ServiceWorker and browser caches preserve its fetch work.

After the server bootstrap clears the URL, the Window branch starts through the
single internal entrypoint defined by the [server contract](SERVER.md#prover-document).
The same root evaluated as a ServiceWorker installs only its cache handlers and
does not enter CCDP or a platform pipeline.

The prover consumes one exact `AppRequestProof` after CCDP has authenticated
the live ceremony and chosen a placement. It returns only bounded platform
steps, one exact platform proof delivery, or a sanitized technical failure.

The prover does not receive the operation domain, chain ID, transaction data,
authorization nonce, or expected Authorization Digest. Google exposes the
signed token nonce as a proof public input; X and GitHub expose the attested
code verifier. The Consumer verification path matches that binding to the
Authorization Digest it recomputes from `OAuthProof`.

The prover does not assemble or verify `OAuthProof`, construct `Identity`, call
a Consumer, or persist credential-bearing state. The Ceremony Client combines
the selected delivery variant with its retained ceremony fields and derives the
locally checked, non-authoritative preview. Prover inputs, workers, witnesses,
and outputs are cleared after delivery, `AbortCeremony`, failure, or context
destruction.

### Proof delivery boundary

Google delivers its proof bytes, the exact signed audience, subject, email and
expiry, and the selected JWK modulus as `GoogleProofV1`. It delivers no
attestation.
The Ceremony Client exact-matches that client identifier to the live Ceremony
and adds the common authorization fields to assemble `OAuthProof<'google'>`.
The Google adapter flattens the named values into the circuit's 56 public-input
fields only at the verifier/transaction-encoding boundary; the Ceremony Client
does not verify the proof.

For X, `ProverDeliverProof.proof` is `XProofV1`; for GitHub it is `GitHubProofV1`.
Each independently contains exactly the `bearer-link` proof bytes and two
attestations ordered token session then identity session.
Each attestation preserves the byte-exact attested-data serialization and its
associated signature as produced by the pinned notary client. The signature
covers exactly those attested-data bytes, including server identity, evidence
time, transcript lengths, reveals, and commitments. The prover does not
normalize or reserialize the attested data, project selected fields into
sidecars, or accept a caller-supplied replacement.

The link circuit's two 32-byte bearer commitments are public inputs to the
circuit, ordered token then identity. They are not fields in `XProofV1`,
`GitHubProofV1`, or the assembled `OAuthProof`: the prover discards bb.js's
flattened public-input array, and the Platform Verifier reconstructs the two
values from the corresponding verified attestations before checking the proof.
The circuit proves only that one hidden bearer opens both commitments; PKCE
binds the token exchange to the Authorization Digest outside the circuit.

The platform delivery-to-output mapping is closed, but CCDP treats `proof` as
an unknown structured-clone value:

| Platform | Prover delivery | Ceremony Client additions | OAuth proof |
|---|---|---|---|
| Google | `GoogleProofV1 { honkProof, clientId, userId, email, tokenExpiresAt, signingKeyModulus }` | common fields | `OAuthProof<'google'>` with ceremony version `1` |
| X | `XProofV1 { honkProof, tokenAttestation, identityAttestation }` | common fields | `OAuthProof<'x'>` with ceremony version `1` |
| GitHub | `GitHubProofV1 { honkProof, tokenAttestation, identityAttestation }` | common fields | `OAuthProof<'github'>` with ceremony version `1` |

Each platform/version `prover` leaf constructs its exact proof object. Its
side-effect-free `types` leaf owns the matching runtime validator dispatched by
`platforms/index`. The
validator is selected from the live Ceremony's platform and ceremony version,
not from a discriminator inside the nested value. It rejects unknown fields, malformed arrays and bytes, and
profile-bound violations, then returns a typed `ProverDeliverProof`. CCDP never
changes when another platform proof type is added.

The common fields are platform ID, platform ceremony version, operation domain,
authorization nonce, and transaction data. The
exact records are defined in the
[package architecture](ARCHITECTURE.md#result-and-lifecycle). The Ceremony
Client adds no chain ID, Authorization Digest, identity sidecar, code verifier,
evidence-time sidecar, verifier address, or verification-key field.

The platform pipelines request the profile's exact reveals and commitments.
Attestation authenticity, authority, method and path, request grammar,
transcript tiling, bearer framing, identity extraction, and evidence time are
authoritative Platform Verifier checks over those signed bytes, not additional
prover outputs. GitHub repeats the token-session subset specified below as a
local precondition before using a server-returned bearer; that repeat does not
make browser acceptance authoritative.

## Browser notarization

X and GitHub use `prover/notarization`, one internal TypeScript adapter over
the pinned raw TLSNotary WASM API. Platform-version prover leaves supply their exact
request, response parser, and transcript layout; the adapter owns the shared
session, reveal, reclaimed-channel, attestation-delivery, and
commitment-correlation mechanics. The full boundary, disclosure model, three
browser call sites, and attestation handoff are defined in
[NOTARIZATION.md](NOTARIZATION.md).

## Platform pipelines

The platform-version prover leaves own witness construction and orchestration; the circuit
repository owns the exact proof relation and ABI. Launch uses these artifacts:

| Profile | Circuit | Returned attestations |
|---|---|---|
| `google` | [`oidc-google`](https://github.com/libid-org/libid-circuits/blob/91bc3446eeaa50ab2056d88dd9941374aa4fa34c/circuits/oidc-google/src/main.nr) | none |
| `x` | [`bearer-link`](https://github.com/libid-org/libid-circuits/blob/91bc3446eeaa50ab2056d88dd9941374aa4fa34c/circuits/bearer-link/src/main.nr) | token, identity |
| `github` | the same `bearer-link` artifact | token exchange, identity |

Those links pin the current launch source snapshot. Deployment consumes the
matching compiled Abstract Circuit Intermediate Representation (ACIR), circuit
ABI, and manifest from a
[`libid-circuits` release](https://github.com/libid-org/libid-circuits/releases),
not source or an application-selected URL. A profile is available when the
ceremony package and its matching circuit release are deployed. Whether a
chain-specific Consumer accepts the resulting `OAuthProof` is independent.

All pipelines use one proving engine. The platform module builds the closed
Noir input map, the Noir ACIR virtual machine (ACVM) runtime solves the witness,
and the circuit-compatible
[Aztec bb.js](https://github.com/AztecProtocol/aztec-packages/tree/v5.2.0/barretenberg/ts/bb.js)
release generates an UltraHonk proof. bb.js returns raw proof bytes and an
ordered flat array of field-valued public inputs. Google delivers the proof and
its named semantic public values, not that flattened array. X and GitHub deliver
the proof but not the array because their Platform Verifiers reconstruct its two
semantic commitments from the submitted attestations. The browser does not
verify the generated proof or define a second circuit ABI.

X and GitHub additionally use the browser TLSNotary bundle built by the
[`libid-org/notary` build script](https://github.com/libid-org/notary/blob/e0ce1f1e0bedcde54740d1af70d4eaf9b439a9fb/scripts/build-tlsn-wasm.sh)
and published in [`libid-org/notary` releases](https://github.com/libid-org/notary/releases).
The browser distribution exposes `tlsn_wasm.js` and its sibling
`tlsn_wasm_bg.wasm`; the worker bootstrap is embedded in the module. The global
`ProverAssets.notarizationClientUrl` selects the immutable JavaScript module,
and the prover derives the WASM URL by replacing only its final path component
with `tlsn_wasm_bg.wasm`. Each remains a normal, independently cached response;
the browser never downloads or unpacks a release archive. GitHub releases may
host the initial pair; moving the same pinned bytes to a CDN changes only
deployment configuration. Neither an application nor `AppRequestProof` selects
a notary, circuit, or bb.js version.

### Google

`platforms/google/1/prover` receives the captured ID Token and frozen client identifier.
It obtains the JSON Web Key (JWK) selected by the token's `kid` from Google's
JSON Web Key Set (JWKS) endpoint and constructs the `oidc_google` input map:

- private witness: JSON Web Token (JWT) signing input and payload bytes with
  their lengths, checked-claim offsets and lengths, raw email/`sub`/`aud` bytes,
  RSA signature, and the RSA reduction witness;
- public inputs, in circuit order: 32 authorization-digest bytes, two fields
  containing `SHA256(aud)`, one packed `sub` field, two packed email fields,
  `exp`, and eighteen RSA-modulus limbs.

The semantic groups flatten to exactly 56 bb.js public-input fields. The module
derives the candidate authorization digest from the signed nonce; the circuit
re-encodes it as the exact unpadded base64url nonce and verifies the RS256
signature and signed claims. The module then generates one proof and returns it
with the exact signed audience, subject, email and expiry plus the selected JWK
modulus as `GoogleProofV1`, with no attestation or flattened public-input array. The
Ceremony Client exact-validates their shape, matches the audience to its
retained client identifier, and derives the local identity preview without
verifying the Honk proof. Only Consumer verification makes the fields
authoritative.

### X

`platforms/x/1/prover` performs two browser-owned TLSNotary Proxy sessions:

1. Notarize the fixed `/2/oauth2/token` exchange using the captured code,
   derived code verifier, frozen redirect URI, and client identifier. Reveal
   the profile-owned request and delimiter ranges and commit the returned
   bearer.
2. Use that bearer in the fixed `/2/users/me` request. Reveal the complete
   request framing around its committed bearer plus the identity response's
   canonical `id` and `username` ranges.
3. Build the shared `bearer-link` witness from the private bearer, its length,
   and the two independent 16-byte TLSNotary blinders, then generate the proof.

Token notarization completes before identity notarization starts because its
request requires the returned bearer. The circuit constrains the bearer to
nonempty printable ASCII of at most 128 bytes and exposes exactly the two
32-byte bearer commitments, token first and identity second; Noir flattens them
to 64 bb.js public-input fields. Delivery contains only the proof and the two
attestations in the same token/identity order. Identity fields and the
authorization digest are derived by the Platform Verifier from the verified
attestations and submitted authorization fields, not duplicated as circuit
outputs.

### GitHub

`platforms/github/1/prover` first sends the captured code and derived verifier to the
fixed server token-exchange route. The server uses its confidential client
secret, performs the token-exchange TLSNotary session, and returns the bounded
access token, token attestation, and `bearerOpening`: the canonical unpadded
base64url encoding of the token session's exact 16-byte TLSNotary blinder. The
browser exact-validates the selected version's token response, attestation
encoding and correlation, request bindings, and bearer opening before using
the bearer in its own fixed `/user` TLSNotary session. Local verification of
the notary signature is optional defense in depth; the downstream Platform
Verifier remains authoritative. That session commits the bearer and reveals the
canonical `id` and `login` ranges. The server route itself is defined in
[SERVER.md](SERVER.md#github-token-endpoint).

The module then runs the same `bearer-link` circuit with the token-exchange and
identity blinders. Its public-input count and order are identical to X: 64
fields representing token commitment then identity commitment. Delivery
contains only the proof and the two attestations in token-exchange/identity
order. GitHub-specific server exchange and transcript construction therefore
remain platform code; no GitHub-specific proving circuit or proving engine
exists.

## Platform progress

Each profile owns a closed catalog of advisory diagnostic spans after
`AppRequestProof`. The Ceremony Client owns the common `proof-generation`
stage; platform-version prover leaves emit only their version-owned spans. Each
catalog entry also owns one bounded user-facing label. Labels describe current
work, such as **Loading proving assets**, **Connecting to notary**, **Preparing
proof inputs**, or **Generating proof**; they never contain a credential,
identity, URL, caller value, raw exception, or raw service error.

Every profile includes these spans:

- readiness: parent `prover-readiness`, with `asset-prefetch` and `runtime-load`
  children which may overlap;
- proof engine: `proof-worker-bootstrap` → `proof-wasm-load` →
  `proof-circuit-load` → `proof-backend-initialization` → `witness` → `proof` →
  `proof-backend-destroy`.

Profiles add these spans before the proof engine:

| Profile | Platform-step codes |
|---|---|
| `google` | `token-decoding` → `signing-key-fetch` → `signing-key-selection` → `circuit-inputs` |
| `x` | `notary-worker-bootstrap` → `notary-wrapper-load` → `notary-wasm-instantiation` → `notary-worker-initialization`; parent `token-session` with `token-session-create` → `token-websocket-connect` → `token-prover-setup` → `token-provider-request` → `token-reveal`; then parent `identity-session` with `identity-session-create` → `identity-websocket-connect` → `identity-prover-setup` → `identity-provider-request` → `identity-reveal`; then `token-attestation` → `identity-attestation` → `circuit-inputs` |
| `github` | `token-exchange-request` → `token-exchange-validation` → `notary-initialization` → `identity-session` → `identity-attestation` → `circuit-inputs` |

`prover-readiness` covers awaiting selected artifact single flights; downloads
may already have started during prefetch. X's token and identity session spans
are sequential because the identity session requires the bearer produced by
the token session. GitHub exposes its one server request and local validation
of the complete response, but no fictional server-internal progress.

On a successful run, each code emits `started` once and `completed` once. On
any run, every started span emits exactly one terminal `completed` or `failed`;
a failure does not invent later spans. Message order preserves that per-span
lifecycle and the parent/dependency rules above; unrelated spans may overlap
and therefore have no total order. A cache hit emits the same lifecycle. OAuth,
isolation, delivery, and preview construction are represented elsewhere and do
not add platform steps. Events remain credential-free; implementations may
derive durations from their prover-stamped timestamps.

Each leaf span has one nonnegative presentation weight based initially on
measured typical duration for that platform/version. Parent spans have zero
weight so nested and parallel work is not counted twice. Leaf weights form one
positive closed total. Every emitted event carries
`progress = 0.95 * completedWeight / totalWeight`; a `started` event changes the
label and shimmer but retains the last completed weight, while a `completed`
event advances the monotonic target. Parallel completion order therefore cannot
move progress backwards. `ProverDeliverProof`, outside `PlatformStep`, alone
makes the renderer show `1`.

Weights improve the rough visual distribution of milestones but make no time
or completion guarantee. The renderer does not make the bar creep between
events. Updating labels or weights is presentation tuning; changing codes or
their causal lifecycle remains a platform-ceremony-version change.

### Visible prover presentation

The coordinator iframe renders no competing ceremony UI. When the prover runs
as the user-visible isolated window, its root module renders the same persistent
libID logo, milestone-progress bar and labels, and local 15-second slow-proving
notice defined by the [popup presentation](POPUP.md#script-owned-presentation)
and [slow-proving guidance](POPUP.md#slow-proving-guidance). This keeps the
active window authoritative for progress when relay is missed. The UI is
package-owned and adds no prover message, proof timeout, or result state.

## Shared toolchain and assets

The integrating server embeds the exact `ProverAssets` value defined in
[SERVER.md](SERVER.md#embedded-prover-assets). It contains only configurable
libID-owned circuit and notarization-client release locations; a ceremony
fetches only its selected platform/version profile.

The ceremony package pins the compatible Noir and bb.js dependencies in code.
Their JavaScript is part of the prover build; whether the build emits one
`libid-ceremony-prover.js` file or immutable companion chunks is not deployment
configuration. The build likewise owns every toolchain worker, WASM, and common
reference string (CRS) location. A deployer cannot replace those dependencies
through `ProverAssets`.

Each closed platform/version prover leaf pins its circuit release. The ceremony
package pins one launch-wide structured reference string size,
`SRS_SIZE = 2 ** 18`; SRS size is code, not deployment data:

| Profile | Configurable libID assets | Measured circuit size | Pinned BN254 SRS size |
|---|---|---:|---:|
| `x` | shared notarization client and `bearer-link` circuit descriptor | 42,006 | 262,144 (2^18) points |
| `github` | the same two shared artifacts as X | 42,006 | 262,144 (2^18) points |
| `google` | `oidc_google` circuit descriptor | 179,443 | 262,144 (2^18) points |

The pinned current-circuit heavy-resource subtotal is:

| Profile | Non-CRS artifact bodies | Pinned CRS bodies | Known heavy subtotal |
|---|---:|---:|---:|
| `google` | 8,092,815 bytes (7.72 MiB) | 12,583,040 bytes (12.00 MiB) | 20,675,855 bytes (19.72 MiB) |
| `x` or `github` | 24,683,695 bytes (23.54 MiB) | 12,583,040 bytes (12.00 MiB) | 37,266,735 bytes (35.54 MiB) |

These resource-body counts use Nargo `1.0.0-beta.25`, native bb `5.2.0`, and
bb.js `5.2.0`, as recorded by
[`libid-circuits v0.3.0`](https://github.com/libid-org/libid-circuits/releases/tag/v0.3.0),
whose target is the source commit pinned above. `oidc_google.json` is 1,312,738
bytes and `bearer_link.json` is 171,956 bytes. The pinned bb.js
`barretenberg-threads.wasm.gz` is 3,071,085 bytes. The pinned Noir runtime adds
3,049,596 bytes of `acvm_js_bg.wasm` and 659,396 bytes of
`noirc_abi_wasm_bg.wasm`; every profile shares these code-owned build assets.
The [`libid-org/notary v0.2.0`](https://github.com/libid-org/notary/releases/tag/v0.2.0)
browser bundle contains a 17,731,662-byte `tlsn_wasm_bg.wasm`.

Gate count alone does not determine the deployable SRS floor. bb.js 5.2's 4 MiB
verification chunks make `bearer_link` require at least 2^17 despite its 2^16
mathematical ceiling; `oidc_google` requires 2^18. Launch pins 2^18 for every
profile so one download serves multi-platform users, at a 4 MiB cost for an
X/GitHub-only user. Split it only if measurements justify the extra selection
and cache-upgrade paths.

The first ceremony downloads the one shared SRS set. A later ceremony for any
platform reuses it and fetches only missing profile assets. X/GitHub after
Google fetches 17,903,618 bytes of notary WASM and the bearer circuit; Google
after X/GitHub fetches only its 1,312,738-byte circuit.

The counts are before HTTP content encoding and exclude HTML, the root and
worker JavaScript graph, headers, OAuth/notary traffic, and attestations. They
are reproducible heavy-resource subtotals, not a promise about total
transferred bytes. The JavaScript graph does not exist yet and must publish its
own measured size when built.

The pinned bb.js 5.2.0 build owns the compressed CRS downloader and
[`srsSize` option](https://github.com/AztecProtocol/aztec-packages/pull/23419),
and includes
[Aztec #25290](https://github.com/AztecProtocol/aztec-packages/pull/25290), which
persists `Crs.new()` downloads. Its bytes also fix the only CRS origins admitted
by the [prover response policy](SERVER.md#prover-response-policy).

Deployment configures one notarization-client module URL and one circuit URL
per closed platform/version; code pins their digests and resolves the notary
WASM sibling. Noir, bb.js, workers, CRS URLs, and SRS size remain build
constants. X and GitHub share the same notary and circuit URLs.

## Prefetch and cache lifecycle

Every ceremony attempts consent-overlapped prover prefetch. It is fixed
behavior, not configuration or action input. The initial popup loads the fixed
prover document, whose Window branch registers its own deployed
`libid-ceremony-prover.js` module URL as a module service worker and asks it to
start only the selected platform/version profile's artifact single flights.
There is no separate prefetch route, artifact, or mode flag.

The prover bootstrap exact-validates its server-embedded `ProverAssets`. For
prefetch, its Window branch accepts only the closed, cleared profile selected by
the bootstrap fragment, adds the global notarization client only when the
closed platform implementation requires it, and combines those entries with
the toolchain assets pinned by the prover build. Neither fragment nor message
can supply an asset URL.

The ServiceWorker branch contains no OAuth or application state. It owns each
selected immutable asset fetch from the first byte, keys ordinary artifact
single flights by canonical URL, starts the fixed launch bb.js CRS loaders—
`Crs.new(SRS_SIZE)` and `GrumpkinCrs.new(2 ** 16)`—as curve-specific single
flights, rejects a manifest conflict, and extends the initiating worker event
through completion. Those loaders use bb.js's fixed CRS endpoints and IndexedDB
cache. Merely importing bb.js is not CRS prefetch.

Its package-private prefetch call is an implementation detail, not a CCDP
message or exported ceremony API. The worker intercepts only exact immutable
asset requests admitted by the active build/profile manifest. It leaves every
other request to the browser unchanged: ceremony routes, the GitHub token
exchange, platform APIs, OAuth navigation, HTML, and configuration are never
cached, rewritten, or synthesized by this worker.

As soon as the registration/start attempt settles, without waiting for download
completion, the prefetch child emits `ProverPrefetchingAssets`. Registration or
startup failure records no weaker mode and leaves proving on the identical cold
path. A later coordinator or prover window resolves the
same profile using the exact `AppRequestProof` platform/version. Ordinary asset
requests join an in-flight fetch or read the completed Cache Storage entry. It
asks the service worker to finish or restart the fixed CRS single flights;
`Barretenberg.new({ srsSize: SRS_SIZE })` then reads the resulting bb.js
IndexedDB cache before proof generation.

A later ceremony reuses every repeated artifact URL and the same CRS entries;
only missing profile assets are fetched. OAuth navigation therefore neither
restarts shared work nor downloads unrelated profiles. DIP iframe and
top-level-window proving remain in the same origin and service-worker scope, so
both placements reuse the same fetches and caches after COOP severs the
fallback window's opener.

A new document reconnects to the worker rather than awaiting a Promise owned
by a destroyed prefetch document. Worker termination after completion is
harmless because ordinary responses live in Cache Storage and completed CRS
data lives in bb.js's IndexedDB cache; no separate durable completion marker
exists.

Registration, fetch, eviction, quota, or unsupported-worker failure changes
latency only. A missing or malformed selected profile fails before OAuth;
ordinary prefetch failure follows the identical selected-profile cold fetch
path and never weakens isolation, worker count, or verification. Warm state is
never a ceremony checkpoint.

## Worker and network isolation

The exact prover document and asset headers are defined by the
[server contract](SERVER.md#prover-response-policy). The byte-identical prover
response admits the deployment-fixed union of exact origins required by enabled
profiles. This is not browser-enforced cross-profile compartmentalization: a
compromised prover root module can reach any origin in that union. Stronger
confinement would require a platform-specific response or isolated worker which
alone receives the credential; it is not part of the launch deployment.

Because a worker cannot directly load a cross-origin worker URL, the prover may
create only a local `blob:` bootstrap which imports the fixed immutable worker
module and installs the same fixed bridge for nested workers. The worker graph
admits only the deployment manifest's libID-asset origins and exact code-pinned
toolchain origins. Direct cross-origin worker construction, an unknown nested
worker, opaque or partial fetches, mutable aliases, and an unisolated or
single-threaded fallback fail closed.

The DIP iframe and COOP-isolated window run the same multithreaded prover
configuration. Placement changes CCDP transport, not platform semantics,
workers, cache policy, or proof output.

## Compatibility

A live prover pins its loaded modules and assets. Proof-semantic changes use
`PlatformCeremonyVersion`; host, cache, and equivalent SRS-fetch changes do not.
All version axes are defined in
[ARCHITECTURE.md](ARCHITECTURE.md#versioning-and-compatibility).
