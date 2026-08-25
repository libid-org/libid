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

One dual-context `libid-ceremony-prover.js` artifact serves three Window roles
and one ServiceWorker role:

```text
Window
├── prefetch iframe       selects one profile and starts shared fetches
├── coordinator iframe    proves under DIP or relays to the fallback
└── isolated window       proves when the coordinator cannot qualify

ServiceWorker
└── immutable-asset and CRS single flights shared by every Window placement
```

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

Each platform/version module constructs its exact proof object in the prover
and owns the matching runtime validator dispatched by `platforms/index`. The
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
the pinned raw TLSNotary WASM API. Platform-version modules supply their exact
request, response parser, and transcript layout; the adapter owns the shared
session, reveal, reclaimed-channel, attestation-delivery, and
commitment-correlation mechanics. The full boundary, disclosure model, three
browser call sites, and attestation handoff are defined in
[NOTARIZATION.md](NOTARIZATION.md).

## Platform pipelines

The platform modules own witness construction and orchestration; the circuit
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
That release contains the JavaScript wrapper, WASM, and worker bootstrap. The
global `ProverAssets.notarizationClientUrl` selects the immutable client
release. GitHub releases may host the initial asset; moving it to a CDN changes
only deployment configuration. Neither an application nor `AppRequestProof`
selects a notary, circuit, or bb.js version.

### Google

`platforms/google` receives the captured ID Token and frozen client identifier.
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

`platforms/x` performs two browser-owned TLSNotary Proxy sessions:

1. Notarize the fixed `/2/oauth2/token` exchange using the captured code,
   derived code verifier, frozen redirect URI, and client identifier. Reveal
   the profile-owned request and delimiter ranges and commit the returned
   bearer.
2. Use that bearer in the fixed `/2/users/me` request. Reveal the complete
   request framing around its committed bearer plus the identity response's
   canonical `id` and `username` ranges.
3. Build the shared `bearer-link` witness from the private bearer, its length,
   and the two independent 16-byte TLSNotary blinders, then generate the proof.

The token and identity TLS setup may overlap, but the identity request waits for
the token exchange to produce the bearer. The circuit constrains the bearer to
nonempty printable ASCII of at most 128 bytes and exposes exactly the two
32-byte bearer commitments, token first and identity second; Noir flattens them
to 64 bb.js public-input fields. Delivery contains only the proof and the two
attestations in the same token/identity order. Identity fields and the
authorization digest are derived by the Platform Verifier from the verified
attestations and submitted authorization fields, not duplicated as circuit
outputs.

### GitHub

`platforms/github` first sends the captured code and derived verifier to the
fixed server token-exchange route. The server uses its confidential client
secret, performs the token-exchange TLSNotary session, and returns the bounded
access token, token attestation, and `bearerBlinder`: the canonical unpadded
base64url encoding of the token session's exact 16-byte TLSNotary blinder. The
browser exact-validates the selected version's token response, attestation,
request bindings, and bearer opening before using the bearer in its own fixed
`/user` TLSNotary session. That session commits the bearer and reveals the
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
stage; platform modules emit only their version-owned spans.

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
| `x` | `notary-worker-bootstrap` → `notary-wrapper-load` → `notary-wasm-instantiation` → `notary-worker-initialization`; parent `token-session` with `token-session-create` → `token-websocket-connect` → `token-prover-setup` → `token-provider-request` → `token-reveal`; parent `identity-session` with `identity-session-create` → `identity-websocket-connect` → `identity-prover-setup` → `identity-credential-wait` → `identity-provider-request` → `identity-reveal`; then `token-attestation` → `identity-attestation` → `circuit-inputs` |
| `github` | `token-exchange-request` → `token-exchange-validation` → `notary-initialization` → `identity-session` → `identity-attestation` → `circuit-inputs` |

`prover-readiness` covers awaiting selected artifact single flights; downloads
may already have started during prefetch. X's token and identity session spans
may overlap, but `identity-provider-request` waits for the bearer produced by
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

Each closed platform/version module pins its circuit release. The ceremony
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

These exact resource-body counts use the compatible tuple Nargo
`1.0.0-beta.25`, native bb `5.2.0`, and bb.js `5.2.0`, as recorded by
[`libid-circuits v0.3.0`](https://github.com/libid-org/libid-circuits/releases/tag/v0.3.0),
whose target is the source commit pinned above. `oidc_google.json` is 1,312,738
bytes and `bearer_link.json` is 171,956 bytes. The pinned bb.js
`barretenberg-threads.wasm.gz` is 3,071,085 bytes. The pinned Noir runtime adds
3,049,596 bytes of `acvm_js_bg.wasm` and 659,396 bytes of
`noirc_abi_wasm_bg.wasm`; every profile shares these code-owned build assets.
The [`libid-org/notary v0.2.0`](https://github.com/libid-org/notary/releases/tag/v0.2.0)
browser bundle contains a 17,731,662-byte `tlsn_wasm_bg.wasm`.

The circuit release's pinned `bb gates -t evm` produces the measured sizes in
the table, but gate count alone does not determine the deployable SRS floor.
bb.js 5.2 requires compressed SRS input to be a positive multiple of its 4 MiB
verification chunk, so `bearer_link` fails at its mathematical 2^16 ceiling and
has a qualified 2^17 minimum; `oidc_google` requires 2^18. Launch deliberately
uses 2^18 for every profile so one download serves users who link multiple
platforms. This costs X/GitHub-only users 4 MiB and removes per-platform SRS
selection and later cache upgrades. The policy may split if measurements show
that cost matters; doing so does not change `PlatformCeremonyVersion` while the
proof statement and output remain identical.

The CRS bodies are the shared compressed BN254 G1 prefix at 32 bytes per point,
the shared 2^16-point Grumpkin G1 data at 64 bytes per point, and 128 bytes of
BN254 G2 data. These constants are identical on every browser; libID does not
inherit bb.js's generic 2^20 desktop and 2^18 iOS defaults. Circuit release
tooling qualifies the same values with the pinned browser prover and records
them in release metadata so a circuit or bb.js change cannot silently retain an
undersized platform constant. Encoding the size in artifact filenames is
optional and carries no additional authority.

The first ceremony downloads the one shared SRS set. A later ceremony for any
platform reuses it and fetches only missing profile assets. X/GitHub after
Google fetches 17,903,618 bytes of notary WASM and the bearer circuit; Google
after X/GitHub fetches only its 1,312,738-byte circuit.

The counts are before HTTP content encoding and exclude HTML, the root and
worker JavaScript graph, headers, OAuth/notary traffic, and attestations. They
are reproducible heavy-resource subtotals, not a promise about total
transferred bytes. The JavaScript graph does not exist yet and must publish its
own measured size when built.

The pinned bb.js 5.2.0 browser build owns the downloader, compressed 32-byte G1
format, and [`srsSize` constructor option](https://github.com/AztecProtocol/aztec-packages/pull/23419).
The selected build also includes
[Aztec #25290](https://github.com/AztecProtocol/aztec-packages/pull/25290), which
persists the compressed download so `Crs.new()` alone is durable. The compatible
Nargo compiler, native `bb` used to produce the verification key and verifier,
and bb.js prover remain one circuit release and verifier rollout. The selected
bb.js bytes also fix the only CRS origins admitted by the
[prover response policy](SERVER.md#prover-response-policy).

Deployment embeds one global notarization-client URL and one circuit URL for
each closed platform/version. Platform-version code pins the expected digest
for each libID artifact. Noir and Aztec-distributed bb.js code, workers, WASM,
CRS locations, and the shared SRS size remain closed ceremony-build constants.
The deployment neither computes nor configures them and does not copy, slice,
or reimplement the CRS downloader.

X and GitHub use the same immutable circuit URL and the same global
notarization-client URL. Platform modules reject missing, duplicate, additional,
or digest-mismatched profiles before fetching.

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

As soon as those single flights exist or the bounded startup attempt fails,
without waiting for download completion, the prefetch child emits
`ProverPrefetchingAssets`. A later coordinator or prover window resolves the
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

One immutable package release supplies compatible popup, prover, platform,
worker, Noir, and bb.js code. A live prover keeps the modules and embedded
assets it loaded and never resolves `latest` mid-ceremony.

A change to authorization, OAuth grammar, platform proof construction, or
`OAuthProof` assembly increments that platform's `PlatformCeremonyVersion`.
Changing an asset host without changing pinned bytes, tuning prefetch/cache
behavior, or changing the shared SRS fetch policy does not increment the
platform version while the proof statement and output remain identical.
