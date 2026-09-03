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

CCDP also owns Callback behavior. The OAuth Bridge serves its stable ingress
shell and same-origin versioned implementation only because the registered
OAuth redirect URI must terminate on the bridge origin.

## Browser resources and routes

Before launch, the Application freezes the CCDP origin, redirect URI,
platform authorization URL, ceremony ID, platform ID, and platform ceremony
version. CCDP uses these concrete browser resources and routes:

| Resource | Served by | Browser context | Route | Responsibility and lifetime |
|---|---|---|---|---|
| Prefetch | CCDP Host | ceremony popup, top-level and non-isolated | `${ccdpOrigin}/ccdp/v{CCDPVersion}/prefetch` | accepts the Application connection and starts selected-profile asset fetching |
| Authorization | OAuth Platform | ceremony popup | frozen `platformAuthorizationUrl` | renders platform login/consent and returns to `redirectUri`; it is not a CCDP participant |
| Returned Callback | OAuth Bridge | ceremony popup, top-level and non-isolated | frozen `redirectUri` | delivers the OAuth-platform return and navigates to the Prover |
| Prover | CCDP Host | ceremony popup, top-level and COOP/COEP-isolated | `${ccdpOrigin}/ccdp/v{CCDPVersion}/prover` | receives the validated OAuth result, exposes visible progress, and generates the proof |
| Worker | CCDP Host | module Service Worker shared by Prefetch and Prover | `${ccdpOrigin}/ccdp/v{CCDPVersion}/worker.js` | preserves popup MessagePorts across same-origin navigation and owns asset/CRS single flights and caches |

The **ceremony popup** is a reusable browsing context, not an actor or document.
It sequentially contains Prefetch → Authorization → Callback → Prover.
Navigation creates a new JavaScript heap each time; no participant relies on
document-local state surviving it. These origins may all be cross-site, and
same-site placement grants no protocol authority.

The document sections below define each fragment's full field set. Internal
fragments use URL-search-parameter encoding after `#`. Producers emit each
named field exactly once in the displayed order.
Receivers require the exact field set, reject duplicates, and otherwise do not
depend on parameter order. Ceremony IDs are lowercase UUIDv4 values.
Platform IDs use the exact identifiers defined by the selected platform
profile; platform ceremony versions are unsigned 16-bit integers.

The Prefetch and Prover routes have no query. Their fragments never reach the
CCDP Host and are copied and cleared before rendering, storage, or network
use. Their versioned paths select the CCDP implementation directly. No OAuth
return, credential, proof input, or proof is placed in an internal fragment.
The OAuth-platform-mandated query on `redirectUri` is the only protocol
exception.

CCDP is connection-neutral. It defines which document runs at each location,
which participant initiates each navigation, what each message means, and their
order. Each recipient validates its permitted inbound messages and enforces
direction and state before acting.

## Version

This document defines CCDP version `1`. The version appears in the CCDP Host
paths and OAuth `state`. Version `1` selects matching Callback code, CCDP Host
documents and Worker, fragment grammars, navigation order, and message
semantics. A message does not repeat the version selected before its document
loads. The OAuth bridge API and popup connection controls are independently
versioned.

Version 1 has these deployed resources:

| Resource | Location |
|---|---|
| Callback implementation | `/ccdp/v1/callback.js` on the OAuth Bridge |
| Prefetch document | `/ccdp/v1/prefetch` on the CCDP Host |
| Prover document | `/ccdp/v1/prover` on the CCDP Host |
| Shared module Service Worker | `/ccdp/v1/worker.js` on the CCDP Host |

A later CCDP version substitutes its decimal version in these paths. The
Callback shell imports its versioned implementation; the CCDP Host documents
execute theirs directly. Internal bundle names are not protocol surface. The
Prefetch and Prover documents and Worker share the CCDP origin.

## Browser documents

The OAuth Bridge's configured callback path and the CCDP Host's versioned
Prefetch and Prover paths serve CCDP browser documents, not JSON API routes.
Each response is request-invariant and contains one CSP-authorized inline
bootstrap and one empty mount point. Before storage, rendering, error reporting,
or subsequent network use, the bootstrap bounds and copies its URL input,
clears it with `history.replaceState`, and exact-validates the grammar below.
Malformed or oversized input runs no protocol code and renders only a fixed
failure after clearing.

### Callback shell

The OAuth bridge serves the callback shell at one developer-configurable
path whose default is `/auth/callback`. Every enabled OAuth application
registers its absolute URL as its `redirect_uri`. It is not an HTTP redirect
and does not encode a CCDP version.

The callback bootstrap accepts only the bounded OAuth-platform-defined query
and fragment containing exactly one OAuth `state` in the form
`v<version>.<ceremonyId>`, whose version selects
`/ccdp/v{CCDPVersion}/callback.js`.

The selected platform ceremony version owns the exact platform authorization
and return grammar. The authorization request uses the frozen `redirectUri`
and OAuth `state` `v1.<ceremonyId>`: the version selects the Callback namespace,
and the lowercase UUIDv4 suffix remains the popup connection ID. `redirectUri`
is the exact absolute configured callback URL for that platform; its default
path is `/auth/callback` and does not change between CCDP versions.

It bounds the combined raw query and fragment to
`MAX_OAUTH_RETURN_BYTES = 32 KiB`, preserves the leading `?` and `#` when
nonempty, and clears both. It parses no platform-specific return field beyond
locating the single routing state. The shell passes the copied query and
fragment plus the selected version's deployment-controlled inputs to that
implementation.
Application origins and CCDP origin are immutable deployment data, never
derived from `Origin`, `Referer`, or URL input.
Shell-to-implementation invocation is outside CCDP and is not a protocol
message. Google
credentials remain in the fragment and therefore never reach the bridge;
OAuth-platform-mandated query parameters are the only credential-bearing URL
exception.

### Prefetch and Prover documents

The CCDP Host serves two versioned, request-invariant documents:

- `/ccdp/v{CCDPVersion}/prefetch#ceremonyId=<uuid>&platformId=<id>&ceremonyVersion=<uint>`
  is top-level and non-isolated so it can accept the initial popup connection;
- `/ccdp/v{CCDPVersion}/prover#ceremonyId=<uuid>` is top-level and
  COOP/COEP-isolated for proof generation.

The path selects both CCDP version and document role; no fragment field repeats
either. Each response contains its clearing bootstrap and entry code directly,
so no root map, standardized root filename, or second entry-script request
exists. It may load implementation-private immutable chunks and proving assets.
The two documents have different isolation headers but the same deployment
inputs and empty mount point.

`GET /ccdp/v{CCDPVersion}/worker.js` serves the same-origin module Service Worker registered
by Prefetch. It composes temporary MessagePort continuity with asset and CRS
single flights and caches for the later Prover. The route is required; whether
its bytes are an on-disk file, generated output, or embedded in the CCDP Host
binary is not part of CCDP.

The CCDP Host may serve the latest implementation compatible with a CCDP
version at these paths. Prefetch and Prover responses use normal HTTP
cache revalidation, including an ETag, while implementation-private
content-addressed assets remain long-lived and immutable. A breaking change
uses a new CCDP-version path.

The OAuth Bridge applies the same compatible-update and cache-revalidation
policy to `/ccdp/v{CCDPVersion}/callback.js`. Its stable Callback shell admits
only versions in its deployment-owned supported set.

With `allowedApplicationOrigins: '*'`, the Prefetch and Prover accept any valid
browser-observed HTTPS Application origin and pin that exact origin and source
for each carrier. The Application exact-authenticates the configured CCDP Host.
Open admission there grants only public asset prefetch and processing of
the connecting Application's own proof request; neither document receives an
OAuth return directly from the platform. The returned Callback
exact-authenticates the Application against the OAuth Bridge's deployment
allowlist before releasing that return.
Asset caching and popup-connection construction are outside CCDP.

## End-to-end sequence

```mermaid
sequenceDiagram
    participant A as Application
    participant F as Prefetch document
    participant O as OAuth Platform
    participant C as Callback document
    participant P as Top-level prover

    A->>F: Open popup at prefetch fragment
    Note over A,F: Popup connection acceptance and prefetch start
    F-->>A: ProverPrefetchingAssets
    A->>O: Navigate popup away to platformAuthorizationUrl
    O->>C: Return same popup to redirectUri
    Note over C: Clear return and select Callback implementation by state version
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
available for the returned Callback to reconnect.

### 2. OAuth-platform authorization and return

The OAuth Platform owns the popup until it navigates to the frozen `redirectUri`.
That route serves the request-invariant callback shell. Its
inline bootstrap bounds and clears both URL components, extracts exactly one
`v<version>.<ceremonyId>` state, and imports the matching
`/ccdp/v{CCDPVersion}/callback.js` implementation after checking its closed
supported-version map. Unknown or malformed versions fail before the
implementation loads. This replaces the module import the page already
requires; it adds no document navigation.

```ts
interface CallbackDeliverParams {
  type: 'callback-deliver-params'
  oauthReturn: {
    query: string
    fragment: string
  }
}
```

The callback creates this message from the bounded query and fragment copied by
its clearing bootstrap. It extracts the ceremony ID suffix from the state and
does not classify approval, denial, OAuth transport, or platform fields.

On the successful path, `CallbackDeliverParams` is the first CCDP message after
OAuth-platform return and reaches the application only through the authenticated
popup connection. The `Callback` prefix records its creator even when
connection continuity delivers it after callback replacement.

The Application uses the live ceremony already bound to that connection and
its platform/version rules to exact-validate response location, fields, state,
OAuth client, redirect, success, and OAuth-platform denial. A stale,
replayed, retired, or post-reload delivery changes no live state.

### 3. Prover activation and application decision

The returned callback delivers `CallbackDeliverParams`, then asks its accepted
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
