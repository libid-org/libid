# `@libid/ceremony` architecture

`@libid/ceremony` runs an identity-proof ceremony in the browser. An
application supplies an operation to authorize; the package obtains and proves
platform identity evidence, then returns a locally checked identity preview and
the proof-bearing `OAuthProof` for a Consumer (the downstream proof verifier)
to verify.

This document defines the package boundary, public application API and
configuration, result lifecycle, and platform prover implementation and assets.
The package's browser protocol is defined separately in [CCDP.md](CCDP.md).
The integrating server's routes, deployment inputs, and response policy are
defined in [SERVER.md](SERVER.md). These documents are implementation
architecture, not part of the normative protocol specification.

The normative libID specification owns the proof statement and authorization
encoding. See the
[common ceremony rules](../../../specs/ceremony-common.md) and
[identity-platform ceremonies](../../../specs/platform-ceremonies.md)
for their exact content. Together, this document, CCDP, and the server contract
otherwise stand alone; application job storage and all post-ceremony effects
are outside their scope.
Package acceptance requirements are indexed by [TEST_PLAN.md](TEST_PLAN.md).

The specification's **Ceremony Client** role maps to this package's closed
client, popup, prover, and platform implementation as a whole. Its
**Ceremony Popup** is `libid-ceremony-popup.js`. This architecture uses the
concrete component names below and defines no additional wrapper module or kind.

## System boundary

One ceremony turns an application-owned operation into a locally checked
identity preview and the exact proof-bearing `OAuthProof`:

```text
CeremonyClient.new inputs
    │
    ▼
application-side client ── OAuth ── libid-ceremony-popup.js ── libid-ceremony-prover.js
    │                                                   │
    └────────────────────── Identity ◀─────────────────┘
```

The ceremony owns authorization construction, OAuth, callback handling,
isolated proving, sanitized progress, proof delivery, and local evidence
validation. It does not own application jobs, wallet keys or policy,
Registry calls, connectors, transaction submission, finality, React UI, or a
server status service.

External-wallet and native libID wallet compositions use the same ceremony.
They encode their operation into opaque `transactionData` before the ceremony
and interpret it only after the ceremony returns `Identity`. A native wallet
may run key preparation before the ceremony and wallet confirmation afterward;
those sessions do not extend the browser message protocol.

The application origin owns the durable operation record, called the Job. One
application-scoped `CeremonyClient` owns its live ceremonies, retained popups,
and the in-memory ceremony-ID routing table. The client, redirect, and prover
keep credentials, witnesses, and the generated proof only in memory. The
application origin is an authority boundary: it supplies the operation domain
and transaction data, so compromising it already permits authorizing a
different operation. The ceremony does not attempt to hide its transient OAuth
result from other scripts executing in that origin. If the application does
not assemble and commit the delivered result before the live channel is lost,
the ceremony restarts with fresh OAuth. Downstream application work may remain
resumable independently.

## Ceremony Cross-Document Protocol

The browser ceremony spans contexts which cannot share memory: the application,
OAuth popup/callback, and isolated prover placement. They communicate through
the package-owned Ceremony Cross-Document Protocol (CCDP), whose document
lifecycle also coordinates the prover service worker.

[CCDP.md](CCDP.md) owns the execution-context rationale, topology and routes,
exact `CCDPMessage` union and sequence, redirect ingress, prover fallback,
cross-document progress and cancellation, prefetch/cache coordination, browser
response policy, and `CCDPVersion` compatibility. This document retains the
package and public application contracts which initiate and consume that
protocol.

## Package composition

Launch publishes one `@libid/ceremony` package:

```text
@libid/ceremony
├── protocol    pure records, codecs, authorization, proof assembly, wire version
├── client      CeremonyConfig fetch, application-side API, and orchestration
├── popup       source entrypoint for libid-ceremony-popup.js
├── prover      source entrypoint for libid-ceremony-prover.js, workers, WASM, and prefetch
└── platforms   versioned browser OAuth, progress, witness, and proving modules
```

`protocol` is the pure leaf imported by the client, popup, prover, platform
implementations, and native-wallet confirmation. It performs no browser,
storage, network, or cryptographic proof-verification work. It owns the closed
`OAuthProof` construction and local evidence-validation helpers so the
application client and native wallet use the same implementation. `popup` and `prover` are build entrypoints, not
separately versioned packages. They emit `libid-ceremony-popup.js`,
`libid-ceremony-prover.js`, and immutable worker/WASM assets from one compatible
package release. The prover artifact runs in both Window and ServiceWorker
contexts: its Window branch runs prefetch, coordinates proving, and executes the
active prover placement, while its ServiceWorker branch owns the shared asset
single flight and cache.

Server implementations are outside the package. `platforms/github` implements
only the normative browser-side token request/response codecs and
validation; the integrating server implements the required confidential
endpoint.

The dependency direction is closed:

```text
ceremony/{client,popup,prover,platforms}
                     │
                     ▼
            ceremony/protocol

client ────────────────> ceremony
wallet ────────────────> ceremony/protocol
wallet-client ─────────> client + ceremony + wallet/protocol
```

`ceremony` never imports the client job store or either wallet composition.
The compositions adapt cancellation, progress projection, and the final
Identity commit around `proveUserIdentity()`. No generic plugin, caller-selected platform
module, validator, or finalizer exists.

The package-facing API surface is:

| Export or entrypoint | Contract |
|---|---|
| `@libid/ceremony/protocol` | closed records, exact codecs and validators, authorization and `OAuthProof` construction, local evidence decoding, `CCDPMessage`, and `CCDPVersion` |
| `@libid/ceremony/client` | immutable supported/enabled platform discovery, application-scoped `CeremonyClient`, `CeremonyConfig` fetch, and stateful `Ceremony` orchestration |
| `@libid/ceremony/popup` | browser entrypoint which emits `libid-ceremony-popup.js` and exposes `startPopup(oauthReturn, allowedAppOrigins)` to the cleared redirect document |
| `@libid/ceremony/prover` | dual-context browser entrypoint which emits `libid-ceremony-prover.js`; its Window branch accepts CCDP and its ServiceWorker branch owns asset-prefetch single flights |

The API below and the [CCDP records](CCDP.md#closed-message-union)
are the launch surface.
Implementation-private helpers may change without changing authority or wire
behavior.

## Application integration

### Client lifecycle

An application creates one client for one configured server:

```ts
import {
  createCeremonyClient,
  supportedPlatforms,
} from '@libid/ceremony/client'

const ceremonies = await createCeremonyClient({
  server: 'https://identity.example',
})
```

This is an application-owned instance, not a package-global singleton. Client
creation fetches and exact-validates `CeremonyConfig`; a configured platform is
enabled only when the installed package has a closed implementation and at
least one advertised ceremony version in common.
The package has one closed platform/version catalog. `PlatformId` and the
immutable public `supportedPlatforms` list derive from its keys; no second
platform union or list exists:

```ts
const platformCeremonyVersions = {
  google: [1],
  x: [1],
  github: [1],
} as const satisfies Record<string, readonly PlatformCeremonyVersion[]>

export type PlatformId = keyof typeof platformCeremonyVersions
export const supportedPlatforms: readonly PlatformId[] = Object.freeze(
  Object.keys(platformCeremonyVersions) as PlatformId[],
)

interface CeremonyClient {
  readonly enabledPlatforms: readonly PlatformId[]
  new: (
    ceremonyId: string,
    input: {
      chainId: Uint8Array
      platformId: PlatformId
      operationDomain: Uint8Array
      transactionData: Uint8Array
    },
  ) => Promise<Ceremony>
}

const jobId = crypto.randomUUID()
const ceremony = await ceremonies.new(jobId, {
  chainId,
  platformId,
  operationDomain,
  transactionData,
})
```

Adding a platform or local ceremony version changes this catalog and its closed
implementation together. There is no mutable registration API. A configured
platform is enabled only when its catalog entry and validated `CeremonyConfig`
entry have a version in common; each Ceremony freezes the selected version.

`enabledPlatforms` is the immutable intersection of `supportedPlatforms` and
the exact platform keys in validated `CeremonyConfig` that have at least one
ceremony version in common with the installed implementation. Catalog order is
stable discovery order, not a product ranking; applications may present
another order. Neither array contains OAuth clients, ceremony versions, server
configuration, or display metadata.

The composition selects a Chain Profile and operation per ceremony and supplies
their exact 32-byte `chainId` and `operationDomain` hashes with bounded
`transactionData`. During `new`, the client exact-validates and copies both
hashes without deriving or interpreting them, then treats `transactionData` as
opaque. It requires the selected platform to be enabled by validated
`CeremonyConfig`, chooses the newest locally preferred ceremony version also
advertised for that platform, generates a fresh 32-byte authorization nonce,
computes the authorization digest, and freezes all of those values before
constructing OAuth or allowing provider navigation.

`CeremonyClient.new(ceremonyId, input)` accepts a plain string which must be a
lowercase UUIDv4. A composition normally generates one value and calls it
`jobId` in its Job API and `ceremonyId` in this API. The equality is a
composition invariant, not a shared branded type. The identifier is not chain
authorization, but its unpredictability and one-use handling provide browser
continuity: the initial popup discloses it to the initiating app, the
post-OAuth popup withholds it, and `AppAuthenticateOrigin` must return it.

`new` chooses the platform ceremony version, generates a fresh authorization
nonce, derives the code verifier by the normative Proof Key for Code Exchange
(PKCE) construction where required, and constructs the authorization request
with `state=ceremonyId`, registers that ID to this live `Ceremony`, and returns
only after its navigation data is ready. OAuth `state` is a provider-facing
serialization of `ceremonyId`, not a second identifier:

```ts
interface CeremonyNavigation {
  href: string   // /api/v1/ceremony/popup#launch(ceremonyId, platformId, ceremonyVersion)
  target: string
}

interface Ceremony {
  readonly navigation: CeremonyNavigation

  onEvent(listener: (event: CeremonyEvent) => void): () => void
  proveUserIdentity(options?: { expectedPopup: WindowProxy }): Promise<IdentityResult>
  cancel(): Promise<void>
}
```

The caller owns launch UI and invokes `window.open`; the ceremony package never
renders an anchor or chooses between launch paths. `navigation.target` is a
unique, non-reserved browsing-context name. The caller renders an
action-specific real anchor from `navigation.href` and `navigation.target`,
attempts `window.open('about:blank', navigation.target)` synchronously, and
prevents native navigation only if it receives a usable handle. It passes that
handle once as `expectedPopup`. If no handle is returned, it omits
`expectedPopup` and leaves the same activation's real-anchor navigation
untouched.

The scripted path is primary and PoC-qualified; the qualified mobile browsers
did not reject it. The real anchor is a hedge against an unqualified browser or
embedding policy returning `null`, not a claim that a launch target is known to
require it.

`expectedPopup` is a channel-authority input, not UI configuration. When
present, `proveUserIdentity()` immediately navigates that `WindowProxy` to
`navigation.href` and exact-matches the first popup message against it. When
absent, the package opens or navigates nothing; the real anchor reaches the
same URL and the client binds its browser-stamped `MessageEvent.source` after
matching `ProverPrefetchingAssets`'s ceremony ID, platform ID, and ceremony version
to the live Ceremony. Both paths then
retain the same source through OAuth. There is no nullable popup value or
mutable `setPopup` API.

```ts
function activate(event: MouseEvent) {
  const expectedPopup = window.open(
    'about:blank',
    ceremony.navigation.target,
  )
  if (expectedPopup) event.preventDefault()
  void ceremony.proveUserIdentity(
    expectedPopup ? { expectedPopup } : undefined,
  )
}
```

`proveUserIdentity()` parses the callback's OAuth `state` as a ceremony ID and
claims that ID once in its owning client's live map, sends the minimal proving
inputs, validates the provider return, performs exchange and proving,
constructs the non-authoritative identity preview and OAuth proof, and resolves
with an accepted `IdentityResult`. A valid ceremony-bound provider denial
resolves with a denied `IdentityResult`; popup closure, malformed return,
invalid proving input, isolation failure, and proving failure are ordinary
ceremony failures, not denial.

The Job is already committed before `proveUserIdentity()` and remains the
composition's current ceremony state while the call runs. Progress may update
its advisory projection, but no pre-proving authority CAS or ceremony callback
exists. The final composition-owned Job CAS is the authority boundary: if
cancellation, expiry, or another transition retired the Job, a late Identity
cannot commit.

`cancel()` is best-effort browser cleanup and is called only after the
composition retires its Job. Losing the application document loses the
in-memory ceremony map and therefore requires fresh OAuth, as already
required by the no-ceremony-recovery launch scope.

### Server configuration

The integrating server exposes the exact `CeremonyConfig` and origin-controlled
fetch defined in [SERVER.md](SERVER.md#public-configuration). The
application-scoped client fetches it once with native `fetch` and validates it
through `@libid/ceremony/protocol`; there is no configuration module. Popup and
prover do not fetch it.

The client freezes the selected platform, ceremony version, client ID, and
redirect URI in the live Ceremony. `AppRequestProof` carries those values; the popup
applies its existing opener-origin validation and closed platform/version
dispatch without fetching configuration again.

## Result and lifecycle

```ts
interface Identity {
  oauthProof: OAuthProof
  platformId: PlatformId
  clientId: string
  userId: string
  handle: string
  metadataObservedAt: number
  authorizationDigest: Uint8Array
}

type IdentityResult =
  | { status: 'accepted'; identity: Identity }
  | { status: 'denied' }

```

`PlatformCeremonyVersion` is an unsigned 16-bit integer selected by the ceremony client
from the versions advertised in ceremony configuration, never by the caller. It
versions one platform's complete ceremony semantics: authorization-digest
construction, OAuth request and return handling, platform proof construction,
and assembly of the final `OAuthProof`. It does not version a chain, Registry,
or verifier contract; multiple chain-specific Consumers may accept the same
ceremony output.
`authorizationNonce` is exactly 32 cryptographically random bytes. For X and
GitHub it also supplies the secret input to PKCE and is not exposed before the
token exchange completes. Exact authorization encoding is delegated to the
normative ceremony specification.

`OAuthProof` is the exact closed normative record: proof, attestations, and the
public authorization fields the Consumer will verify. Its platform-specific
shape is not redefined here.
`@libid/ceremony/protocol`
checks that exact `OAuthProof` against the live Ceremony's retained
authorization fields, derives
the identity preview from locally validated platform evidence, enforces the
platform's canonical encodings and configured client, and
returns `Identity` with the same `OAuthProof`. The client constructs it from
those retained fields and the proof and attestations returned by the prover.
The ceremony exact-matches the
internal ceremony ID, platform, and recomputed authorization digest before
resolving `proveUserIdentity()`. `status: 'accepted'` means the selected parser
classified the provider parameters as success and local checks succeeded; only Consumer
acceptance makes Identity authoritative. Callers cannot supply or override
Identity fields.

The live `Ceremony` privately retains its ID, copied operation inputs, selected
platform and ceremony version, authorization nonce and digest, OAuth client and
redirect, derived code verifier, and popup. A restart creates a fresh Ceremony
with a fresh nonce, digest, and verifier. After proof acceptance, the Job may
store the accepted `IdentityResult` and its public `OAuthProof` fields. Before
acceptance, no Job or IndexedDB index stores the authorization nonce or digest,
code verifier, provider credential, or private witness. No separate OAuth-state
value or pre-proof checkpoint is ever persisted.

The ceremony receives no action kind, job revision, chain RPC, Registry client,
wallet key, threshold, fee, connector, transaction submitter, database,
`CryptoKey`, or arbitrary callback. Its output contains the exact `OAuthProof`
but no credential, private witness, wallet signature, fee quote, or transaction
submission capability.

All records are exact-shape validated. `metadataObservedAt` is a nonnegative
safe integer; fractions, infinities, `NaN`, and overflow fail. Ceremony IDs are
lowercase RFC 4122 UUIDv4 values generated with `crypto.randomUUID()` and are
serialized unchanged as OAuth `state`. The code verifier is derived by the
normative PKCE construction. Derived hashes are exact 32-byte `Uint8Array`
values. Unknown fields, aliases, coercions, and
noncanonical encodings fail before use.

## Prover implementation

The prover selects one closed platform/version pipeline. Each pipeline consumes
the immutable release artifacts defined under
[deployment assets and shared toolchain](#deployment-assets-and-shared-toolchain),
then returns only the proof and attestations required by the application-side
assembly.

### Platform pipelines

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

All three pipelines use one proving engine. The platform module builds the
closed Noir input map, the Noir ACIR virtual machine (ACVM) runtime solves the
witness, and the circuit-compatible
[Aztec bb.js](https://github.com/AztecProtocol/aztec-packages/tree/v5.2.0/barretenberg/ts/bb.js)
release generates an UltraHonk proof. bb.js returns raw proof bytes and an
ordered flat array of field-valued public inputs inside the prover. The prover
discards that internal array after generation and returns only the proof and
attestations. The Consumer verification path reconstructs the exact public
inputs from the OAuth proof's authenticated fields and attestations; the
browser does not duplicate the circuit ABI or verify the generated proof.

X and GitHub additionally use the browser TLSNotary bundle built by the
[`libid-org/notary` build script](https://github.com/libid-org/notary/blob/e0ce1f1e0bedcde54740d1af70d4eaf9b439a9fb/scripts/build-tlsn-wasm.sh)
and published in [`libid-org/notary` releases](https://github.com/libid-org/notary/releases).
That release contains the JavaScript wrapper, WASM, and worker bootstrap. The
global `ProverAssets.notarizationClientUrl` selects the immutable client
release. GitHub releases may host the initial asset; moving it to a CDN changes
only deployment configuration. Neither an application nor `AppRequestProof`
selects a notary, circuit, or bb.js version.

#### Google

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
with an empty attestation list. The Ceremony Client derives the local identity
preview and OAuth-proof fields from its retained ID Token, frozen client
identifier, and the JWK selected by `kid`; only Consumer verification makes
them authoritative.

#### X

`platforms/x` performs two browser-owned TLSNotary Proxy sessions:

1. Notarize the fixed `/2/oauth2/token` exchange using the captured code,
   derived code verifier, frozen redirect URI, and client identifier. Reveal
   the profile-owned request and delimiter ranges and commit the returned bearer.
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
authorization digest are authenticated by the attestations and Platform
Verifier, not duplicated as circuit outputs.

#### GitHub

`platforms/github` first sends the captured code and derived verifier to the
fixed server token-exchange route. The server uses its confidential client
secret, performs the token-exchange TLSNotary session, and returns the bounded
access token, token attestation, and `bearerBlinder`: the canonical unpadded
base64url encoding of the token session's exact 16-byte TLSNotary blinder. The
browser validates that response and blinder before using the
bearer in its own fixed `/user` TLSNotary session, which commits the bearer and
reveals the canonical `id` and `login` ranges.

The module then runs the same `bearer-link` circuit with the token-exchange and
identity blinders. Its public-input count and order are identical to X: 64
fields representing token commitment then identity commitment. Delivery
contains only the proof and the two attestations in token-exchange/identity
order.
GitHub-specific server exchange and transcript construction therefore remain
platform code; no GitHub-specific proving circuit or proving engine exists.

### Platform-specific progress

Each profile emits this closed, ordered sequence after `AppRequestProof`. The common
stage and event envelope are defined under
[progress, cancellation, and recovery](#progress-cancellation-and-recovery).

| Profile | Platform-step codes |
|---|---|
| `google` | `prover-readiness` → `token-decoding` → `signing-key-fetch` → `signing-key-selection` → `circuit-inputs` → `witness` → `proof` |
| `x` | `prover-readiness` → `notary-initialization` → `token-session` → `token-attestation` → `identity-session` → `identity-attestation` → `circuit-inputs` → `witness` → `proof` |
| `github` | `prover-readiness` → `token-exchange-request` → `token-exchange-validation` → `notary-initialization` → `identity-session` → `identity-attestation` → `circuit-inputs` → `witness` → `proof` |

`prover-readiness` covers awaiting the selected artifact single flights after
`AppRequestProof`; those downloads may already have started during prefetch. Google
then decodes the ID Token, fetches and selects its JWK, and constructs the
closed circuit inputs. X exposes initialization of the browser notary client,
each notarized session, and each resulting attestation separately. GitHub
exposes the start of its one server request and local validation of the complete
response, but no fictional server-internal progress; its browser-owned identity
session remains separate. `circuit-inputs` ends when the complete closed Noir
input map exists, `witness` covers ACVM execution and constraint solving, and
`proof` covers bb.js proof generation.

For each code, the platform module emits `started`, followed by `completed`
before starting the next code or `failed` immediately before AbortCeremony. A cache hit
still emits the same sequence. OAuth, isolation, delivery, and preview
construction are represented elsewhere and do not add platform steps.

### Shared prover toolchain

The integrating server embeds the exact `ProverAssets` catalog defined in
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
whose target is the source commit pinned below. `oidc_google.json` is 1,312,738
bytes and `bearer_link.json` is 171,956 bytes. The pinned bb.js
`barretenberg-threads.wasm.gz` is 3,071,085 bytes. The pinned Noir runtime adds
3,049,596 bytes of `acvm_js_bg.wasm` and 659,396 bytes of
`noirc_abi_wasm_bg.wasm`; every profile shares these code-owned build assets.
The [`libid-org/notary v0.2.0`](https://github.com/libid-org/notary/releases/tag/v0.2.0)
browser bundle contains a 17,731,662-byte `tlsn_wasm_bg.wasm`; commits between
that tag and the source link below do not change the bundle.

The circuit release's pinned `bb gates -t evm` produces the measured sizes in
the table, but gate count alone does not determine the deployable SRS floor.
bb.js 5.2 requires compressed SRS input to be a positive multiple of its 4 MiB
verification chunk, so `bearer_link` fails at its mathematical 2^16 ceiling and
has a qualified 2^17 minimum; `oidc_google` requires 2^18. Launch deliberately
uses 2^18 for every profile so one download serves users who link multiple
platforms. This costs X/GitHub-only users 4 MiB and removes per-platform SRS
selection and later cache upgrades. The policy may split if measurements show
that cost matters; doing so does not change `PlatformCeremonyVersion` while the
proof statement and output remain identical. The CRS column is therefore the shared compressed BN254
G1 prefix at 32 bytes per point, the shared 2^16-point Grumpkin G1 data at 64
bytes per point, and 128 bytes of BN254 G2 data. These constants are identical
on every browser; libID does not inherit
bb.js's generic 2^20 desktop and 2^18 iOS defaults. Circuit release tooling
qualifies the same values with the pinned browser prover and records them in
release metadata so a circuit or bb.js change cannot silently retain an
undersized platform constant; encoding the
size in artifact filenames is optional and carries no additional authority.

The first ceremony downloads the one shared SRS set. A later ceremony for any
platform reuses it and fetches only missing profile assets. X/GitHub after
Google fetches 17,903,618 bytes of notary WASM and the bearer circuit; Google
after X/GitHub fetches only its 1,312,738-byte circuit.

The counts are before HTTP content encoding and exclude HTML, the root and
worker JavaScript graph, headers, OAuth/notary traffic, and attestations. They
are therefore reproducible heavy-resource subtotals, not a promise about total
transferred bytes. The JavaScript graph does not exist yet and must publish its
own measured size when built.

Importing bb.js or fetching its prover WASM does not fetch the CRS. bb.js loads
the CRS only while initializing `Barretenberg.new()`, before
`generateProof()`. [Cross-document prefetch](CCDP.md#prefetch-and-shared-caching)
starts that work before prover initialization and makes it survive navigation.

The pinned bb.js 5.2.0 browser build owns the downloader, compressed 32-byte G1
format, and [`srsSize` constructor option](https://github.com/AztecProtocol/aztec-packages/pull/23419).
The selected build also includes [Aztec #25290](https://github.com/AztecProtocol/aztec-packages/pull/25290),
which persists the compressed download so `Crs.new()` alone is durable. That
fix changes cache behavior, not the resource-body counts above. The compatible
Nargo compiler, native `bb` used to produce the verification key and verifier,
and `bb.js` prover remain one circuit release and verifier rollout. The shared
size prevents a later platform from expanding and refetching the cache.
The selected bb.js bytes also fix its primary and fallback CRS origins, which
are the only CRS origins admitted by the
[prover response policy](SERVER.md#prover-response-policy).

Deployment embeds one global notarization-client URL and one circuit URL
for each closed platform/version. Platform-version code pins the expected
digest for each libID artifact. Noir and Aztec-distributed bb.js code, workers,
WASM, CRS locations, and the shared SRS size remain closed ceremony-build
constants. The deployment neither computes nor configures them and does not
copy, slice, or reimplement the CRS downloader.

X and GitHub use the same immutable circuit URL and the same global
notarization-client URL. Platform modules reject missing, duplicate, additional,
or digest-mismatched profiles before fetching. Canonical-URL single flights and
the separate CRS cache are defined under
[prefetch and shared caching](CCDP.md#prefetch-and-shared-caching).

## Progress, cancellation, and recovery

```ts
type CeremonyStage =
  | 'authorization'
  | 'oauth-validation'
  | 'proof-generation'

interface PlatformStep {
  code: string
  status: 'started' | 'completed' | 'failed'
}

interface CeremonyEvent {
  stage: CeremonyStage
  platformStep: PlatformStep | null
  timestamp: number
}
```

The application-side `Ceremony` client owns the common stage. It enters
`authorization` when `proveUserIdentity()` starts, `oauth-validation` when an
authenticated `PopupDeliverParams` selects the live Ceremony, and
`proof-generation` immediately before it sends `AppRequestProof`.
`proof-generation` includes prover isolation selection, any fallback
**Continue proving** activation, platform steps, proof delivery, and immediate
`Identity` construction. The client publishes these transitions from its own
control flow; no popup lifecycle message or platform-step inference changes the
common stage.

Each platform-ceremony-version module owns its ordered step catalog beside the
code which performs it; it cannot select a common stage. The client otherwise
does not interpret that catalog. Neither common-stage nor platform-step events
contain operation inputs, outputs, credentials, identities, witnesses, proofs,
raw exceptions, or raw service errors.

`CeremonyEvent` is advisory. The application may project it into broader Job
progress, but confirmation, submission, and finality remain outside this
package. [CCDP progress and cancellation](CCDP.md#progress-cancellation-and-recovery)
defines timestamp ownership, authenticated cross-document relay, delivery
ordering, cancellation propagation, and failure behavior.

## Versioning and compatibility

`PlatformCeremonyVersion` versions one platform's authorization digest, OAuth
grammar, progress catalog, circuit, witness, proof pieces, and final
`OAuthProof` assembly. `PlatformConfig.ceremonyVersions` advertises what the
deployment can execute; the client selects its newest locally preferred member
of that set, and every live ceremony pins it. Chain-specific contract and
Registry versions are outside this boundary and independently decide which
ceremony outputs they accept.

The launch protocol intentionally does not split digest, OAuth, proof, and
output-shape versions. A proof change normally changes the assembled
`OAuthProof`; a rare compatible internal change does not justify another
public compatibility axis. One package release may retain older platform-version
validators during its compatibility window.

[`CCDPVersion`](CCDP.md#protocol-version) independently versions the browser
message protocol. Local Job schema versioning remains owned by the client
store; deployment route and asset versioning remain release concerns. A Job
which has already committed Identity has left the ceremony and remains usable
under its composition's own compatibility rules.
