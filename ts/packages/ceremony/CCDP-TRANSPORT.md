# CCDP transport

This document defines a package-private transport which establishes a
bidirectional communication channel between two browser documents, moves
opaque values, selects a carrier, and preserves a transferable native resource
across document navigation.

## Operating constraints

The transport must:

- work when its documents are cross-origin or cross-site;
- continue when an intervening document or destination isolation policy severs
  `window.opener`, its retained `WindowProxy`, transferred ports, or the
  browsing-context group;
- require no transport route, script, or server endpoint on the client origin;
- use no additional window beyond the existing popup;
- preserve ordered bidirectional values across Safari, Firefox, and Chromium
  without browser or user-agent detection;
- keep the normal MessagePort path browser-local and use the signaling service
  only to establish the WebRTC fallback;
- never send transported values through signaling, cookies, durable storage,
  request data, or URLs; and
- allow the popup to cross an external document and enter an isolated document
  without requiring another user action or recovering its opener.

The signaling service is a bounded control-plane fallback, not a data relay. It
may delay or prevent connection establishment but never receives the values
carried by the resulting channel.

## Boundary

Transport owns:

- browser-stamped source and origin checks;
- connection-ID and caller-supplied compatibility-tag binding;
- the retained popup `WindowProxy`;
- opaque ordered delivery;
- MessagePort-first selection and WebRTC fallback;
- native carrier resources and cross-document continuity; and
- one-shot closure and race resolution.

Transport does not know value types, codecs, directions, ordering, route
meanings, or caller state. Callers construct, decode, and handle every value.

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
resource to the common `send`, `onMessage`, and `close` operations. Transport
selects and owns the carrier; the carrier owns only establishment and delivery
mechanics. It does not interpret values, choose another carrier, or navigate a
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
      |--- preserve(port) ----->|                           |
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

The preserve handler uses `event.waitUntil()` to keep its message event active
until the continuation is claimed or its short deadline expires. A preserve
acknowledgement therefore confirms worker ownership but does not end the event.
Claim atomically transfers the continuation and settles that event. The Service
Worker lifetime model remains event-based: registrations persist, but a worker
heap may be terminated when no event is pending or under abnormal resource
pressure.

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

### Payload

Transport records exactly one popup-side carrier continuation after selection:

```ts
interface CarrierContinuation {
  purpose: string
  port: MessagePort
}
```

For MessagePort, this is the selected popup endpoint. For WebRTC fallback, it
is the peer endpoint of the local channel containing the queued value.
The exact purpose literals and contents remain transport-private; the worker
bridge treats both as opaque.

An active `RTCDataChannel` cannot be transferred. The WebRTC path therefore
preserves only the local `MessagePort` containing its queued first value; the
destination establishes the data channel after claiming it.

### Preserve and claim

The caller resolves the active `ServiceWorkerRegistration` and supplies it as a
browser resource. Transport contains no worker scope or route constant.
`navigatePopup` performs:

```ts
async function preserveCarrierPort(
  registration: ServiceWorkerRegistration,
  compatibilityTag: number,
  ceremonyId: string,
  purpose: string,
  port: MessagePort,
): Promise<void>
```

The preserve operation transfers the continuation and a fresh receipt port to
the worker. It resolves only after the worker accepts one continuation for the
exact ceremony ID in its short-lived in-memory map. Transport clears its local
ownership only after transfer and replaces the source document only after
acknowledgement.

The destination document resolves the same registration and claims before
package import or network use:

```ts
async function claimCarrierPort(
  registration: ServiceWorkerRegistration,
  compatibilityTag: number,
  ceremonyId: string,
): Promise<CarrierContinuation>
```

The worker atomically removes the continuation and returns the unchanged
purpose and port. Receipt ports close after their replies. The preserve event
stays extended until this claim or expiry; the claim event stays extended
through its reply. The worker keeps no durable record and never reads queued
port values.

The two acknowledged calls are necessary because the worker must own the port
before the source document destroys itself and the destination document does
not yet exist. Compatibility tag, ceremony ID, purpose bounds, transferable
count, duplicate ownership, expiry, and one-use claim are checked before
ownership changes. Wrong, missing, expired, duplicate, replayed, or
post-terminal calls reject and close every reachable port. Worker loss or a
failed acknowledgement prevents navigation with live state. No
`BroadcastChannel`, cookie, IndexedDB record, request, or URL carries the port,
purpose, or queued value.

## Failure and security rules

- One transport accepts one popup source, one carrier selection, and one
  carrier continuation.
- Window controls exact-check browser-stamped source and origin before binding
  or releasing a value.
- Carriers cannot inspect, add, remove, or classify transported values.
- Signaling carries no transported value.
- Wrong, stale, duplicate, replayed, or post-close values change no state.
- Carrier, popup, worker, or context loss is never successful delivery or
  recovery.
- Observable failure closes reachable transport resources; the caller decides
  its outcome.

## Versioning

Transport has no independently negotiated version. Its caller supplies one
numeric compatibility tag, which transport exact-matches without assigning
semantics. Compatible releases may change internal framing, ICE policy, worker
controls, or equivalent browser mechanics without changing that contract. If
transport later evolves independently, the same field can carry its version
without changing transport mechanics.
