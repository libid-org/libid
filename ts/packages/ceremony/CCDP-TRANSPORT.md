# CCDP transport

This document defines a package-private transport which establishes a
bidirectional communication channel between two browser documents, moves
caller-defined values, selects a carrier, and preserves a transferable native
resource across document navigation.

```ts
type TransportVersion = 1
```

`TransportVersion` exact-matches the transport's private authentication,
carrier, signaling, framing, and continuity controls. It does not version or
describe any caller protocol.

The topology is an ordinary browser tab running the application and one
adjacent popup. The two documents may be cross-origin and cross-site.

```text
Application tab                              Ceremony popup
https://app.example                          https://ceremony.example
┌───────────────────────────┐ carrier ┌────────────────────────┐
│ CCDPTransport.application │<=======>│ CCDPTransport.ceremony │
└───────────────────────────┘         └────────────────────────┘
```

## Operating constraints

The transport must:

- connect the application tab and popup across origins or sites;
- preserve one logical connection while the popup crosses an external document,
  loses its initial browsing-context relationship, and enters an isolated
  document;
- require no transport-owned route, standalone script, or server endpoint on
  the application origin;
- require no additional top-level browsing context beyond the existing popup
  and no second user action;
- keep active ceremony work in the visible popup without requiring the
  application tab to remain visible or continuously scheduled;
- carry application-level messages directly between the two browser endpoints;
  no server relays or stores them or terminates their channel; and
- provide ordered bidirectional delivery across WebKit, Gecko, and Chromium on
  Android, iOS, Linux, macOS, and Windows, including when mobile browsers show
  only the popup and suspend the application tab, without browser-specific
  protocol branches or user-agent detection.

## Boundary

Transport owns:

- one logical connection bound to the caller-supplied connection ID and
  transport version;
- the popup navigation handle;
- selection and ownership of one authenticated carrier;
- ordered delivery and continuity across popup document replacement;
  and
- one-shot selection, navigation, transport closure, cleanup, and race
  resolution.

Carriers own endpoint authentication, establishment, physical serialization
where required, native framing, resource cleanup, and delivery mechanics. Each
caller-registered `Decoder` owns one message's structural decoding and routing
discriminator.
Callers own the permitted decoder set, protocol order, navigation destinations,
route meanings, state transitions, and outcomes. Transport invokes decoding and
dispatch but does not interpret the resulting message.

## Failure and security rules

- A carrier is selectable only after it authenticates both endpoints.
- One transport admits at most one popup source, one carrier, and one
  cross-document continuation; losing races are inert.
- Before carrier selection, authenticated WindowProxy delivery wraps an opaque
  caller value in a private control exact-bound to the transport's connection
  ID and transport version. After selection, application-level messages
  travel only over the selected end-to-end carrier. Rendezvous and continuity
  controls carry none; neither do cookies, durable storage, request data, or
  URLs.
- A carrier may validate its generic value domain, bounds, and framing but
  cannot inspect a message discriminator or interpret, classify, synthesize, or
  alter its meaning.
- Wrong, stale, duplicate, replayed, or post-close control messages cannot bind,
  select, reopen, or mutate transport. The registered `Decoder` validates
  structure; callers validate protocol state and order.
- Carrier, endpoint, continuity mechanism, or browser-context loss is never
  delivery, success, cancellation, or recovery.
- Background suspension may delay delivery but is not success, cancellation,
  or a reason to select another carrier; delivery after resumption preserves
  order.
- An observed failure closes reachable resources and releases no later value;
  the caller determines the outcome.

## API

The module has one long-lived application endpoint and a fresh ceremony
endpoint for each popup document. Factories receive only the browser resources
available to that endpoint:

```ts
const applicationTransport = CCDPTransport.application<Message>(
  applicationResources,
)

const ceremonyTransport = await CCDPTransport.ceremony<Message>(
  ceremonyResources,
)
```

`application` installs direct navigation over its retained `WindowProxy` and
never constructs a `PortKeeper`. `ceremony` is asynchronous. When its browser
resources include an active Service Worker registration, it privately
constructs a keeper and attempts `claim` for the connection ID before selecting
a new carrier. A matching entry restores its native port; no entry leaves the
fresh endpoint to use its available opener or signaling resources normally.

These are construction-specific implementations of the same API, not a public
role field or a branch performed for each operation. Callers never supply a
keeper, continuity purpose, route, or phase.

Both resource records include the same ceremony ID and `transportVersion`.
The ceremony ID is the caller-supplied connection ID;
transport uses it for authentication, continuity, and private signaling without
recovering it from transported values. Transport exact-matches both values in
private carrier and navigation controls but assigns neither caller-level
semantics.

A ceremony endpoint constructed from `window.opener` and an immutable
target-origin set can send an opaque value over `WindowProxy` before carrier
selection. Transport wraps it with its exact connection ID and transport
version; these fields are private control metadata and never enter the caller
value. The application endpoint validates and removes that control before
decoding or exposing the value.

A caller-supplied popup handle is bound by the application factory. Without
one, the application explicitly binds a source:

```ts
applicationTransport.bindPopup(
  accept: (value: unknown) => boolean,
): Promise<void>
```

`bindPopup` considers only controls with the exact connection ID and transport
version from the configured remote origin, then commits the browser-stamped
source of the first decoded value accepted by the caller predicate. Controls
for another connection are unrelated and bind nothing. Transport never
interprets the caller value. This admits a navigation source only; it does not
select a carrier, and the value remains untrusted caller input.

Navigation destroys the ceremony endpoint; the application endpoint retains
its bound source and any idle signaling subscription.

Both endpoints expose the same typed delivery and dispatch operations:

```ts
interface Decoder<M> {
  readonly type: string
  decode(value: unknown): M
}

interface Transport<M> {
  send(message: M): void
  on<N extends M>(
    decoder: Decoder<N>,
    handler: (message: N) => void,
  ): () => void
  navigatePopup(url: string): Promise<void>
  close(): void
}
```

`send` accepts a message from the transport's closed caller-owned type and is
not a delivery acknowledgement. Transport does not revalidate trusted local
input.

`on` registers one decoder and handler by `decoder.type` and returns an
unsubscribe function. Duplicate registrations reject. For each inbound carrier
value, transport reads only a bounded string `type` from a plain record, selects
the registered decoder, calls it exactly once, and invokes that handler. An
unknown or unregistered type, malformed routing discriminator, or thrown decode
closes the transport and delivers no message. The registered set therefore
enforces participant direction without hardcoding protocol types in transport;
the handler still enforces state and order.

`close` is idempotent, sends no delivery result, and releases only transport
resources. It never calls `WindowProxy.close()` or otherwise controls popup
lifetime.

`navigatePopup` accepts a caller-selected opaque URL. It never parses, builds,
or branches on that URL:

- the application endpoint navigates its exact retained `WindowProxy` directly;
  or
- the ceremony endpoint internally calls `keep` for its carrier port, awaits
  worker ownership, and then replaces its current document.

The factory installs the appropriate operation from the native resource it
owns, never from the URL. A ceremony endpoint without the required carrier port
rejects rather than navigating and losing live state. The application endpoint
has no keeper, including a no-op implementation.

## Carriers

A carrier is a transport-internal adapter from native browser communication
resources to the common `send`, `on`, and `close` operations. It owns endpoint
authentication, establishment, delivery mechanics, and its nontransferable
native resources. Each carrier defines the endpoint identities it accepts and
returns an adapter only after authenticating both sides.

Transport selects and owns the resulting authenticated carrier. A carrier does
not interpret transported values, choose another carrier, or navigate a
document.

The browser-local [MessagePort carrier](CCDP-CARRIER-MESSAGEPORT.md) and
opener-independent [WebRTC carrier](CCDP-CARRIER-WEBRTC.md) are the two
implementations.

### Carrier API

Each carrier module owns construction of its native browser resource and adapts
it to the same transport-internal delivery operations:

```ts
interface Carrier<M> {
  send(value: M): void
  on(handler: (value: unknown) => void): () => void
  close(): void
}
```

`M` is the caller's closed outbound message type, so local sends are checked at
compile time without making the carrier understand the protocol. Received
values remain `unknown`: they crossed a remote browser boundary and become `M`
only after transport selects and runs the registered `Decoder`.

The adapter does not own navigation policy. Transport retains a transferable
`MessagePort` only when navigation moves ownership; the WebRTC carrier retains
and closes its own peer and channel.

### Selection

A fresh ceremony endpoint chooses one physical path:

1. A usable retained opener completes the MessagePort carrier's exact
   source/origin authentication. Its native result is a `MessagePort`.
2. An absent, severed, invalid, or timed-out opener commits WebRTC fallback.
   There is no WebRTC carrier yet because the next document navigation would
   destroy it. Transport creates a local `MessageChannel` and queues the first
   opaque outbound value on one endpoint.

MessagePort has priority until fallback commits. The application endpoint
accepts the first valid selection; late authentication, signaling, or values
from another path are inert. A selected path never migrates after failure.

In the MessagePort path, `send` uses the selected native port. In fallback, it
queues one value on the transport-owned local port. Transport neither identifies
nor parses that value.

Only MessagePort is transferable:

- transport preserves a selected MessagePort as the active carrier resource;
- WebRTC fallback uses a transport-created `MessageChannel` only to carry the
  queued value to the destination document; and
- an established `RTCDataChannel` is never handed across navigation.

The destination endpoint consumes the fallback value, establishes the WebRTC
carrier through the already-started signaling subscription, and forwards that
unchanged value first.

## Carrier continuity across document navigation

Carrier continuity means that the logical transport remains usable after the
popup replaces one document with another. It does not preserve the old
JavaScript heap or an `RTCDataChannel`.

Replacing a popup document normally destroys its side of the communication
channel together with its JavaScript heap. Any live `MessagePort` owned only by
that document becomes unreachable, while the destination document does not
exist yet and therefore cannot receive it directly. Carrier continuity gives
the port a temporary same-origin owner across that gap:

```text
source document          Service Worker          destination document
      |                         |                           |
      |--- keep(port) --------->|                           |
      |<-- ownership accepted --|                           |
      |--- navigate --------------------------------------->|
      |                         |<-------- claim(port) ------|
      |                         |-------- port ------------->|
```

The source navigates only after the worker acknowledges ownership. The
destination claims before loading caller code or using the network. For the
MessagePort carrier, this preserves the already authenticated channel without
repeating its handshake. For WebRTC fallback, it preserves the single queued
value until the destination establishes the data channel. Both paths avoid
another popup, user action, or data relay.

This is a short in-memory continuity bridge, not persistence or recovery.
Worker loss breaks continuity; no later document can reconstruct or resume the
channel.

### Timing assumptions and browser limits

The bridge covers only the immediate callback-to-prover replacement. After the
worker acknowledges preservation, the source starts navigation immediately and
the destination claims in its clearing bootstrap before package import or
network use. It never holds a port across OAuth, user interaction, wallet
confirmation, or an intentional background wait.

The `keep` handler uses `event.waitUntil()` to keep its message event active
until the port is claimed or its short deadline expires. Its acknowledgement
therefore confirms worker ownership but does not end the event. `claim`
atomically transfers the port and settles that event. The Service Worker
lifetime model remains event-based: registrations persist, but a worker heap
may be terminated when no event is pending or under abnormal resource pressure.

There is no portable browser-specific minimum lifetime. The PoC observed:

| Browser engine | Empirical hold result |
|---|---|
| Chromium | More than 60 seconds; the upper boundary was not found. |
| Firefox | Approximately 60 seconds. |
| Playwright WebKit | Seven seconds succeeded and eight seconds lost the port. |

These are observations, not guaranteed browser contracts. Transport uses one
conservative `CARRIER_CLAIM_TIMEOUT_MS = 5_000` across engines, below the
observed WebKit boundary. Transport does not sniff the user agent or select a
browser-specific deadline. Suspension, process loss, memory pressure, or
expiry may still break continuity; failure is terminal and never selects a
weaker path.

### Internal PortKeeper API

`PortKeeper` is the transport's package-private continuity component. It
encapsulates Service Worker communication, temporary ownership, event lifetime,
the claim deadline, one-use transfer, and cleanup. It neither reads the port nor
interprets its purpose.

```ts
declare class PortKeeper {
  constructor(
    registration: ServiceWorkerRegistration,
    transportVersion: TransportVersion,
  )

  keep(
    ceremonyId: string,
    purpose: string,
    port: MessagePort,
  ): Promise<void>

  claim(ceremonyId: string): Promise<{
    purpose: string
    port: MessagePort
  } | null>
}
```

The constructor fixes the active registration and transport version for both
operations. `keep` resolves only after the worker owns the exact
port, after which transport may replace the source document. `claim` atomically
returns and removes the unchanged purpose and port, or returns `null` when no
entry exists. `null` authenticates and selects nothing; popup construction
continues with its available browser resources. For MessagePort, a returned port
is the selected carrier endpoint. For WebRTC fallback, it contains the one
queued value used before the destination establishes its data channel.

The two acknowledged calls are necessary because the worker must own the port
before the source document destroys itself and the destination document does
not yet exist. The Service Worker record and control-message encoding are
implementation details. Transport version, ceremony ID, purpose bounds,
transferable count, duplicate ownership, expiry, and one-use claim are checked
before ownership changes. A malformed, mismatched, duplicate, or post-terminal
record rejects and closes every reachable port; absence is the sole `null`
result. Worker loss or a failed `keep` acknowledgement prevents navigation with
live state. No `BroadcastChannel`, cookie, IndexedDB record, request, or URL
carries the port, purpose, or queued value.

## Versioning

The package supplies one `TransportVersion` to both endpoints; there is no
runtime negotiation. Compatible implementation changes keep the version.
Breaking private authentication, carrier, signaling, framing, or continuity
controls increment it independently of every caller protocol.
