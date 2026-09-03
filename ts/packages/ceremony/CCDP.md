# Ceremony Cross-Document Protocol (CCDP)

This document defines the closed browser protocol across the Application,
Prefetch, Callback, and isolated Prover. It owns ceremony locations, navigations,
messages, ordering, and compatibility. Authorization, platform-proof, and
final-proof semantics are defined by the normative
[common ceremony](../../../specs/ceremony-common.md) and
[platform ceremony](../../../specs/platform-ceremonies.md) specifications.

An authenticated, ordered, bidirectional popup connection carries CCDP
messages unchanged. CCDP requires that connection but does not prescribe its
implementation.

## Actors and origins

An actor is an operator or external system. An origin is the exact
scheme/host/port authority used by browser security checks. A site is only the
browser's schemeful registrable-domain grouping: same-site actors may remain
cross-origin and do not gain authority over each other.
`Application` denotes both the actor and its top-level browser document when
the distinction is immaterial.

| Actor | Browser authority | Responsibility |
|---|---|---|
| Application | application origin | hosts the application document, owns the operation and ceremony state, and drives the protocol |
| OAuth Bridge | OAuth bridge origin | publishes ceremony configuration, hosts the callback document, owns OAuth registrations, and performs enabled confidential OAuth exchanges |
| CCDP Host | CCDP origin | owns and hosts the versioned Prefetch, Prover, and Worker implementations and proving assets; it may be the canonical libID deployment or an operator-selected replacement |
| OAuth Platform | OAuth-platform origin set | hosts authorization/login documents and issues the OAuth return |
| Notary Service | configured notary network origin | participates in TLS notarization and hosts no ceremony browser document |

The Application, OAuth Bridge, and CCDP Host may be operated together or
independently and may be same-origin, same-site, or cross-site. CCDP assumes
none of those relationships. Browser authority is always established against
an exact origin. In particular, the CCDP Host is not a wallet: both
external-wallet and native-wallet compositions consume the same independently
hosted CCDP boundary.

CCDP owns Callback behavior. The OAuth Bridge owns the registered callback
document and shell, then dynamically loads CCDP's same-origin Callback module
because the registered OAuth redirect URI must terminate on the bridge origin.

## Documents and Routes

### Prefetch `GET /prefetch`

**Parameters**

| Name | Location | Contract |
|---|---|---|
| `ceremonyId` | fragment | lowercase UUIDv4 |
| `platformId` | fragment | exact identifier from the selected platform profile |
| `ceremonyVersion` | fragment | unsigned 16-bit platform ceremony version |

| Property | Contract |
|---|---|
| Host and context | CCDP Host; versioned, request-invariant, top-level, and non-isolated ceremony-popup document |
| Lifecycle | Accepts the initial Application connection, registers the Worker, dispatches prefetch for the exact fragment-selected platform profile, emits `ProverPrefetchingAssets`, and is then navigated away to the OAuth Platform. It receives no authorization URL, OAuth return, or proof input. |
| Response policy | `Content-Type: text/html`; `X-Content-Type-Options: nosniff`; `Cache-Control: no-cache`; strong `ETag`; `Referrer-Policy: no-referrer`; `Cross-Origin-Opener-Policy: unsafe-none`; no COEP; and `frame-ancestors 'none'`. CSP denies by default and admits only resources required by the closed Prefetch implementation. |

### Authorization `GET platformAuthorizationUrl`

The complete frozen URL is opaque to CCDP. The selected platform ceremony
version owns its parameters.

| Property | Contract |
|---|---|
| Host and context | Selected OAuth Platform; top-level ceremony-popup document |
| Lifecycle | After Prefetch reports readiness, the Application navigates the popup here. The OAuth Platform owns login and consent, then returns approval or denial to the exact frozen `redirectUri`, where Callback begins. No CCDP participant runs and no CCDP message or popup connection is exposed to this document. |
| Response policy | Controlled entirely by the OAuth Platform. CCDP assumes nothing about its markup, scripts, headers, or origin transitions; it may sever the opener or browsing-context group. Callback reconnects without assuming direct window continuity. The selected platform ceremony version owns authorization request and return semantics. |

### Callback `GET /callback.js`

This module has no URL parameters. The OAuth Bridge shell supplies its
already-cleared callback input and deployment configuration.

| Property | Contract |
|---|---|
| Host and context | Same-origin module dynamically loaded by the OAuth Bridge's top-level, non-isolated callback shell |
| Lifecycle | Accepts the Application connection, locates the single routing `state` in the already-cleared return, emits `CallbackDeliverParams`, and asks the connection to replace the same popup with the Prover. It installs no Service Worker, retains no state across navigation, and does not classify the platform result, prefetch, load platform configuration, prove, verify, persist a checkpoint, or close the popup. |
| Response policy | The OAuth Bridge contract alone defines the shell, registered `redirectUri`, URL clearing, version selection, response policy, and module invocation. |
| Presentation and cleanup | Renders fixed transition and failure views with an inline libID logo and accepts no Application markup or renderer. Terminal cleanup clears retained OAuth-return bytes, removes listeners, and releases unneeded references. Failure before connection acceptance is rendered locally and cannot release the return; observable failure after acceptance uses `AbortCeremony`. |

### Prover `GET /prover`

**Parameters**

| Name | Location | Contract |
|---|---|---|
| `ceremonyId` | fragment | lowercase UUIDv4 |

| Property | Contract |
|---|---|
| Host and context | CCDP Host; versioned, request-invariant, top-level, COOP/COEP-isolated ceremony-popup document |
| Lifecycle | Clears and validates its fragment, accepts the continuing Application connection, consumes one exact `AppRequestProof`, and emits only `ProverNotifyEvent`, `ProverDeliverProof`, or `AbortCeremony`. [PROVING.md](PROVING.md) defines proof-generation pipelines, assets, notarization, and caching. |
| Response policy | `Content-Type: text/html`; `X-Content-Type-Options: nosniff`; `Cache-Control: no-cache`; strong `ETag`; `Referrer-Policy: no-referrer`; `Cross-Origin-Opener-Policy: same-origin`; and `Cross-Origin-Embedder-Policy: require-corp`. CSP denies by default and admits only the exact inline entry code, Worker, `blob:`, WebAssembly, styles, toolchain resources, and network classes required by the closed implementation. Proving starts only after confirming cross-origin isolation, shared memory, and worker support; there is no weaker fallback. |
| Presentation and cleanup | Renders a persistent inline libID logo and one accessible milestone progress bar. It begins at **Preparing proof**, advances only from valid platform events, and reaches 100% only on proof delivery. After `SLOW_PROVING_HINT_MS = 15_000`, it adds a nonblocking **Still proving** notice which may suggest enabling JavaScript JIT in Vanadium site controls. It accepts no Application markup or renderer, presents no ETA, and clears inputs, workers, timers, and listeners without closing or navigating the popup. |

### Worker `GET /worker.js`

This route has no parameters.

| Property | Contract |
|---|---|
| Host and context | CCDP Host; same-origin module Service Worker registered by Prefetch |
| Lifecycle | Composes temporary MessagePort continuity with asset and CRS single flights and caches for the later Prover. |
| Response policy | Module Service Worker JavaScript media type; `X-Content-Type-Options: nosniff`; `Cache-Control: no-cache`; strong `ETag`; and policies compatible with the isolated Prover and its controlled scope. Whether its bytes are an on-disk file, generated output, or embedded in the CCDP Host binary is not part of CCDP. |

### Common

#### Paths and versions

The CCDP routes above are relative to `/ccdp/v{CCDPVersion}`. Prefetch, Prover,
and Worker resolve against `ccdpOrigin`; Callback resolves against the OAuth
Bridge origin. Authorization is the external frozen `platformAuthorizationUrl`,
not a CCDP route.

Before launch, the Application freezes the CCDP origin, redirect URI, platform
authorization URL, ceremony ID, platform ID, and platform ceremony version.
This document defines `CCDPVersion = 1`. The version also appears in OAuth
`state` and selects matching Callback code, CCDP Host documents and Worker,
fragment grammars, navigation order, and message semantics. A message does not
repeat the version selected before its participant runs. The OAuth Bridge API
and popup connection controls are independently versioned.

A later CCDP version substitutes its decimal version in the common path. The
OAuth Bridge dynamically loads the matching Callback module; the CCDP Host
documents execute their implementations directly. Internal bundle names are
not protocol surface. The Prefetch and Prover documents and Worker share the
CCDP origin.

The Prefetch and Prover paths select both CCDP version and document role. Each
response contains its clearing bootstrap and entry code directly, so no root
map, standardized root filename, or second entry-script request exists. Either
may load implementation-private immutable chunks, and both provide only an
empty mount point to their entry code.

The CCDP Host may serve the latest implementation compatible with a CCDP
version at these paths. Prefetch, Prover, and Worker responses use normal HTTP
cache revalidation, including an ETag, while implementation-private
content-addressed assets remain long-lived and immutable. A breaking change
uses a new CCDP-version path.

#### Popup and fragment model

The **ceremony popup** is a reusable browsing context, not an actor or document.
It sequentially contains Prefetch → Authorization → Callback → Prover.
Navigation creates a new JavaScript heap each time; no participant relies on
document-local state surviving it. These origins may all be cross-site, and
same-site placement grants no protocol authority.

Internal fragments use URL-search-parameter encoding after `#`. Producers emit
each named field exactly once in the displayed order. Receivers require the
exact field set, reject duplicates, and otherwise do not depend on parameter
order.

The Prefetch and Prover routes have no query. Their fragments never reach the
CCDP Host and are copied and cleared before rendering, storage, or network use.
No OAuth return, credential, proof input, or proof is placed in an internal
fragment. The OAuth-platform-mandated query on `redirectUri` is the only
protocol exception.

CCDP is connection-neutral. It defines which document runs at each location,
which participant initiates each navigation, what each message means, and their
order. Each recipient validates its permitted inbound messages and enforces
direction and state before acting.

#### Origin policy

With `allowedApplicationOrigins: '*'`, the Prefetch and Prover accept any valid
browser-observed HTTPS Application origin and pin that exact origin and source
for each carrier. The Application exact-authenticates the configured CCDP Host.
Open admission there grants only public asset prefetch and processing of the
connecting Application's own proof request; neither document receives an OAuth
return directly from the platform. Callback exact-authenticates the Application
against the OAuth Bridge's deployment allowlist before releasing that return.
Asset caching and popup-connection construction are outside CCDP.

## End-to-end sequence

```mermaid
sequenceDiagram
    participant A as Application
    participant F as Prefetch document
    participant O as OAuth Platform
    participant C as Callback
    participant P as Top-level prover

    A->>F: Open popup at prefetch fragment
    Note over A,F: Popup connection acceptance and prefetch start
    F-->>A: ProverPrefetchingAssets
    A->>O: Navigate popup away to platformAuthorizationUrl
    O->>C: Return to redirectUri; Bridge invokes Callback
    Note over C: Receive the cleared OAuth return
    C-->>A: CallbackDeliverParams over popup connection
    C->>P: Continue connection and navigate to prover + prove fragment
    Note over C,P: The prover replaces callback in the same popup
    alt Application does not proceed
        A-->>P: AppCancelCeremony
    else Application requests proof
        A-->>P: AppRequestProof
        loop Zero or more progress events
            P-->>A: ProverNotifyEvent
        end
        alt Technical failure
            P-->>A: AbortCeremony
        else Proof generated
            P-->>A: ProverDeliverProof
        end
    end
```

Popup-connection mechanics and URL clearing are omitted from the diagram but
are required at the transitions below.

## Protocol phases

### 1. Launch and prefetch

On user activation, the Application opens one named popup at the Prefetch
location and establishes its connection. An
implementation may use scripted opening or preserve the same activation's
real-anchor navigation when scripted opening is unavailable.

After clearing and validating the prefetch fragment, the Prefetch document
accepts the popup connection and dispatches exactly one selected-profile
prefetch. It reports readiness only after connection acceptance:

```ts
interface ProverPrefetchingAssets {
  type: 'prover-prefetching-assets'
}
```

`ProverPrefetchingAssets` is delivered directly through the accepted popup
connection. It states that prefetch for the selected public
profile has been dispatched; it does not promise that downloads completed and
grants no authority. The Prefetch already received and validated the selected
profile through its cleared fragment; echoing it would compare the Application
with its own values.

After readiness, the Application navigates the retained popup away to the
frozen `platformAuthorizationUrl` without sending that URL through the current
carrier. The Prefetch therefore never learns the authorization request. The
navigation retires the Prefetch carrier; the Application endpoint remains
available for Callback to reconnect.

### 2. OAuth-platform authorization and return

The OAuth Platform owns the popup until it navigates to the frozen `redirectUri`.
The OAuth Bridge's shell captures and clears the OAuth return, selects the CCDP
version from `state`, and invokes `/ccdp/v{CCDPVersion}/callback.js`. The
[OAuth Bridge contract](OAUTH_BRIDGE.md#callback-document) exclusively defines
those ingress mechanics.

```ts
interface CallbackDeliverParams {
  type: 'callback-deliver-params'
  oauthReturn: {
    query: string
    fragment: string
  }
}
```

Callback creates this message from the bounded query and fragment supplied by
the bridge shell. It extracts the ceremony ID suffix from `state` and does not
classify approval, denial, OAuth transport, or platform fields.

On the successful path, `CallbackDeliverParams` is the first CCDP message after
OAuth-platform return and reaches the Application only through the authenticated
popup connection. The `Callback` prefix records its creator even when
connection continuity delivers it after Callback replacement.

The Application uses the live ceremony already bound to that connection and
its platform/version rules to exact-validate response location, fields, state,
OAuth client, redirect, success, and OAuth-platform denial. A stale,
replayed, retired, or post-reload delivery changes no live state.

### 3. Prover activation and application decision

Callback delivers `CallbackDeliverParams`, then asks its accepted
popup connection to navigate to the exact proof-generation location. The
connection owns immediate cross-document continuity.

The isolated top-level prover clears its fragment and accepts the same logical
popup connection before handling CCDP. No callback value enters a URL or
signaling record.

The Application classifies the already-delivered OAuth return using the live
ceremony's selected platform/version. It either cancels or sends one proof
request to the active prover:

```ts
interface AppRequestProof {
  type: 'app-request-proof'
  platformId: string
  platformCeremonyVersion: number
  clientId: string
  redirectUri: string
  oauthReturn: {
    query: string
    fragment: string
  }
  codeVerifier: string | null
}
```

A malformed result rejects the ceremony. A valid OAuth-platform denial resolves
`{ status: 'denied' }` and sends `AppCancelCeremony`. A valid acceptance creates
one `AppRequestProof` from the selected platform/version, frozen client ID and
redirect, derived code verifier, and unchanged OAuth return.

`platformId` is the supported platform identifier selected at launch, and
`platformCeremonyVersion` is the same unsigned 16-bit version selected there.
Both must match the active Prover profile exactly.

The application origin is trusted for this transient input: it already
supplies the operation being authorized. The Application retains the authorization
nonce; only its derived code verifier crosses this boundary. No authorization
digest, operation field, separate OAuth state, Job revision, composition kind,
wallet state, connector, or carrier kind enters the request.

For GitHub, the prover derives the fixed OAuth bridge token route from the
origin of this frozen `redirectUri`. No second bridge origin or endpoint field
enters CCDP or the prover document.

The Prover validates the CCDP record and then applies the exact selected
platform/version rules before credential use. The Callback and popup connection
have no platform configuration and cannot perform that second validation. The
one-shot ceremony accepts no duplicate request or late result.

### 4. Proof execution

```ts
interface ProverNotifyEvent {
  type: 'prover-notify-event'
  platformStep: {
    code: string
    label: string
    status: 'started' | 'completed' | 'failed'
    progress: number
  }
  timestamp: number
}

interface ProverDeliverProof {
  type: 'prover-deliver-proof'
  proof: unknown
}
```

After `AppRequestProof`, the prover sends zero or more bounded progress records
followed by one proof, unless the run aborts. `proof` is the exact value defined
by the selected platform ceremony version. CCDP treats it as opaque; adding a
platform does not change this record.

`platformStep.code` is selected from the platform ceremony version's closed
step set. `platformStep.label` is nonempty display text of at most 96 UTF-8
bytes without control characters. `platformStep.status` records the step's
lifecycle transition. `platformStep.progress` is finite, monotonic, and in
`[0, 1)`. `timestamp` is the Prover's finite nonnegative
`performance.timeOrigin + performance.now()` value in milliseconds; it permits
same-browser ordering and duration diagnostics but grants no authority.
Progress is advisory.

### 5. Terminal control and failure

```ts
interface AppCancelCeremony {
  type: 'app-cancel-ceremony'
}

interface AbortCeremony {
  type: 'abort-ceremony'
  reason: string
}
```

`AppCancelCeremony` is the parameterless downstream command for explicit user
cancellation, valid OAuth-platform denial, invalid callback classification, or
retired application authority. Reachable proving work clears queued input; no
acknowledgement or platform-specific cancel path exists. Callback and prover
never close or navigate the popup in response.

`AbortCeremony` is the upstream technical-failure message created by callback or
prover code. Its reason is a bounded sanitized diagnostic string, not a stable
code or raw exception. Exact reason enums may emerge from implementation
experience. The Application rejects the live ceremony for every observable
abort. It requires an accepted popup connection. Popup-connection construction
or acceptance failure has no CCDP path and remains a local failure.

## Direction and ordering

The following table is the complete CCDP version-1 message set.

| Message | Created by | Received by | Valid position and cardinality |
|---|---|---|---|
| `ProverPrefetchingAssets` | Prefetch | application | exactly once through the accepted popup connection before OAuth-platform navigation |
| `CallbackDeliverParams` | callback | application | exactly once after OAuth-platform return and popup-connection acceptance, before the application decision |
| `AppRequestProof` | application | active prover | exactly once after an accepted callback result; starts proving |
| `AppCancelCeremony` | application | active callback or prover endpoint | at most once before another terminal message; makes later messages inert and requests downstream cleanup |
| `ProverNotifyEvent` | prover | application | zero or more after `AppRequestProof` and before a terminal message |
| `ProverDeliverProof` | prover | application | at most once after `AppRequestProof`; ends the prover run |
| `AbortCeremony` | callback or prover | application | at most once after popup-connection acceptance for an observable technical failure before another terminal message |

Messages outside these directions or positions are invalid. Cancellation,
proof delivery, and abort make later messages inert even when they race in
transit. Every recipient requires a plain record with the exact fields, types,
and bounds defined here. Unknown fields, coercion, normalization, defaults, and
unrecognized discriminators are invalid. The selected platform/version rules
validate the opaque `proof` payload separately.

## Shared invariants

- One live ceremony accepts one prefetch readiness and one
  `CallbackDeliverParams`.
- No CCDP message reaches the application before popup connection acceptance.
- The popup connection authenticates before any OAuth return reaches the
  application and does not interpret or alter message meaning.
- Unknown, malformed, replayed, out-of-order, wrong-direction, or post-terminal
  values change no state.
- No CCDP message carries ceremony ID, CCDP version, or popup-connection
  version. Popup-connection ownership supplies correlation and its private
  version; the loaded route supplies CCDP version.
- Prefetch, Callback, and Prover accept only the locations and fragments defined
  above; received CCDP values never select a navigation destination.
- Progress remains advisory and cannot authorize, cancel, or complete a
  ceremony.
- Connection state, navigation, popup closure, and progress are never a ceremony
  result.
- The Application owns popup lifetime after every terminal outcome; Callback,
  Prover, and ceremony cleanup never close the connection.
- Cancellation and context-loss cleanup are best effort.
- No ceremony recovery, durable browser checkpoint, or migration to another
  popup connection exists.

## Versioning and compatibility

The Application selects the CCDP version in the Prefetch path and carries the
same version through OAuth `state`. The Callback selects its versioned
implementation from that state, and the later Prover navigation uses the
matching versioned path.
Fragments and CCDP messages do not repeat the version.

Compatible implementation changes keep the version. A breaking navigation
order, message shape, direction, ordering, or validation rule increments the
CCDP version, publishes new CCDP Host paths and Worker, and adds the Callback
version to the bridge shell's closed supported-version map. Old resources remain available for live
ceremonies and a compatibility window. Compatible implementations may change
internal chunks without changing CCDP.

Platform Ceremony Version remains independent and versions one platform's
authorization, OAuth, proof, and output semantics. The popup-connection
protocol independently versions its private controls. The OAuth Bridge API
namespace is also independent.
