# CCDP transport

This document defines a package-private transport which establishes a
bidirectional communication channel between two browser documents, moves
opaque values, selects a carrier, and preserves a transferable native resource
across document navigation.

The launch-optimized shape is an ordinary browser tab running the application
and one adjacent popup. The two documents may be cross-origin and cross-site.

```text
Application tab                              Ceremony popup
https://app.example                          https://ceremony.example
┌──────────────────────┐   carrier   ┌──────────────────────┐
│ CCDPTransport.client │<===========>│ CCDPTransport.popup  │
└──────────────────────┘             └──────────────────────┘
```

## Operating constraints

The transport must:

- work when its documents are cross-origin or cross-site;
- continue when an intervening document or destination isolation policy severs
  the documents' initial browsing-context relationship;
- require no transport route, script, or server endpoint on the client origin;
- use no additional window beyond the existing popup;
- preserve ordered bidirectional values across Safari, Firefox, and Chromium
  without browser or user-agent detection;
- release no carrier-delivered value until that carrier authenticates both
  endpoints;
- never expose transported values through carrier establishment, rendezvous,
  cookies, durable storage, request data, or URLs; and
- allow the popup to cross an external document and enter an isolated document
  without requiring another user action or recovering its opener.

## Boundary

Transport owns:

- connection-ID and caller-supplied compatibility-tag binding;
- the retained popup navigation handle;
- opaque ordered delivery;
- selection and ownership of exactly one authenticated carrier;
- native carrier resources and cross-document continuity; and
- one-shot closure and race resolution.

Transport does not know value types, codecs, directions, ordering, route
meanings, or caller state. Callers construct, decode, and handle every value.

## Failure and security rules

- One transport accepts one popup source, one carrier selection, and one
  cross-document continuation.
- An unauthenticated carrier cannot be selected or release a transported value.
- Each carrier exact-checks its native endpoint identity and authentication
  controls before binding or releasing a value.
- Carriers cannot inspect, add, remove, or classify transported values.
- Carrier establishment and rendezvous carry no transported value.
- Wrong, stale, duplicate, replayed, or post-close values change no state.
- Carrier, endpoint, continuity mechanism, or browser context loss is never
  successful delivery or recovery.
- Observable failure closes reachable transport resources; the caller decides
  its outcome.

## API

The module has one long-lived client endpoint and a fresh popup endpoint for
each popup document. Constructors receive only the browser resources available
to that endpoint; their records contain no route or protocol-state name.

```ts
const clientTransport = CCDPTransport.client(clientResources)
const popupTransport = CCDPTransport.popup(popupResources)
```

Both resource records include the same numeric `compatibilityTag`. Transport
exact-matches it in private carrier and navigation controls but never interprets
it. The caller owns its meaning and lifecycle.

A popup endpoint constructed from `window.opener` and an immutable target-origin
set can send an opaque value over `WindowProxy`. A caller-supplied popup handle
is bound by the client constructor. Without one, the client explicitly binds a
source:

```ts
clientTransport.bindPopup(accept: (value: unknown) => boolean): Promise<void>
```

`bindPopup` considers only values from the configured remote origin and commits
the browser-stamped source of the first value accepted by the caller predicate.
Transport never interprets the value, and rejected candidates bind nothing.
This admits a navigation source only; it neither authenticates nor selects a
carrier, and the candidate remains untrusted caller input.

Navigation destroys the popup endpoint; the client endpoint retains its bound
source and any idle signaling subscription.

Both endpoints expose the same opaque delivery operations:

```ts
transport.send(value: unknown): void
transport.onMessage(handler: (value: unknown) => void): () => void
transport.navigatePopup(url: string): Promise<void>
transport.close(): void
```

`send` accepts an opaque value into the current physical path; it is not a
delivery acknowledgement. `onMessage` exposes an untrusted value to the caller
and returns an unsubscribe function. Transport does not inspect a discriminator
or dispatch a protocol handler. `close` is idempotent and sends no delivery
result.

`navigatePopup` accepts a caller-selected opaque URL. It never parses, builds,
or branches on that URL:

- the client endpoint navigates its exact retained `WindowProxy` directly; or
- the popup endpoint first preserves its carrier port, awaits worker ownership,
  and then replaces its current document.

The transport decides between those operations from the native resource it
owns, never from the URL. A popup endpoint without the required carrier port
rejects rather than navigating and losing live state.

## Carriers

A carrier is a transport-internal adapter from one native browser communication
resource to the common `send`, `onMessage`, and `close` operations. It owns
endpoint authentication, establishment, and delivery mechanics. Each carrier
defines the endpoint identities it accepts and returns its native resource only
after authenticating both sides.

Transport selects and owns the resulting authenticated carrier. A carrier does
not interpret transported values, choose another carrier, or navigate a
document.

The browser-local [MessagePort carrier](CCDP-CARRIER-MESSAGEPORT.md) and
opener-independent [WebRTC carrier](CCDP-CARRIER-WEBRTC.md) are the two
implementations.

### Native resources

Carrier setup returns its natural browser resource:

```ts
authenticateMessagePort(/* binding inputs */): Promise<MessagePort>
establishWebRTC(/* signaling inputs */): Promise<RTCDataChannel>
```

Transport adapts either resource to the same internal delivery operations:

```ts
interface Carrier {
  send(value: unknown): void
  onMessage(handler: (value: unknown) => void): () => void
  close(): void
}

messagePortCarrier(port: MessagePort): Carrier
webRTCCarrier(channel: RTCDataChannel): Carrier
```

The adapters do not own navigation policy. Transport retains each native
resource and invalidates its adapter when ownership moves or closes.

### Selection

A fresh popup endpoint chooses one physical path:

1. A usable retained opener completes the MessagePort carrier's exact
   source/origin authentication. Its native result is a `MessagePort`.
2. An absent, severed, invalid, or timed-out opener commits WebRTC fallback.
   There is no WebRTC carrier yet because the next document navigation would
   destroy it. Transport creates a local `MessageChannel` and queues the first
   opaque outbound value on one endpoint.

MessagePort has priority until fallback commits. The client accepts the first
valid selection; late authentication, signaling, or values from another path
are inert. A selected path never migrates after failure.

In the MessagePort path, `send` uses the selected native port. In fallback, it
queues one value on the transport-owned local port. Transport neither identifies
nor parses that value.

Only MessagePort is transferable:

- transport preserves a selected MessagePort as the active carrier resource;
- WebRTC fallback uses a transport-created `MessageChannel` only to carry the
  queued value to the destination document; and
- an established `RTCDataChannel` is never handed across navigation.

The destination endpoint consumes the fallback value, establishes WebRTC
through the pre-armed signaling subscription, adapts the resulting
`RTCDataChannel`, and forwards that unchanged value first.

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

These are observations, not guaranteed browser contracts. Launch uses one
conservative `CARRIER_CLAIM_TIMEOUT_MS = 5_000` across engines, below the
observed WebKit boundary. Transport does not sniff the user agent or select a
browser-specific deadline. Suspension, process loss, memory pressure, or
expiry may still break continuity; failure is terminal and never selects a
weaker path.

### PortKeeper API

`PortKeeper` is the transport's package-private continuity component. It
encapsulates Service Worker communication, temporary ownership, event lifetime,
the claim deadline, one-use transfer, and cleanup. It neither reads the port nor
interprets its purpose.

```ts
declare class PortKeeper {
  constructor(
    registration: ServiceWorkerRegistration,
    compatibilityTag: number,
  )

  keep(
    ceremonyId: string,
    purpose: string,
    port: MessagePort,
  ): Promise<void>

  claim(ceremonyId: string): Promise<{
    purpose: string
    port: MessagePort
  }>
}
```

The constructor fixes the active registration and caller-owned compatibility
tag for both operations. `keep` resolves only after the worker owns the exact
port, after which transport may replace the source document. `claim` atomically
returns and removes the unchanged purpose and port before the destination loads
caller code or uses the network. For MessagePort, the returned port is the
selected carrier endpoint. For WebRTC fallback, it contains the one queued
value used before the destination establishes its data channel.

The two acknowledged calls are necessary because the worker must own the port
before the source document destroys itself and the destination document does
not yet exist. The Service Worker record and control-message encoding are
implementation details. Compatibility tag, ceremony ID, purpose bounds,
transferable count, duplicate ownership, expiry, and one-use claim are checked
before ownership changes. Wrong, missing, expired, duplicate, replayed, or
post-terminal calls reject and close every reachable port. Worker loss or a
failed `keep` acknowledgement prevents navigation with live state. No
`BroadcastChannel`, cookie, IndexedDB record, request, or URL carries the port,
purpose, or queued value.

## Versioning

Transport has no independently negotiated version. Its caller supplies one
numeric compatibility tag, which transport exact-matches without assigning
semantics. Compatible releases may change internal framing, ICE policy, worker
controls, or equivalent browser mechanics without changing that contract. If
transport later evolves independently, the same field can carry its version
without changing transport mechanics.
