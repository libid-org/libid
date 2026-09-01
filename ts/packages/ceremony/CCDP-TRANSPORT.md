# CCDP transport

This document defines the package-private transport used by the Ceremony
Cross-Document Protocol (CCDP). It establishes a bidirectional communication
channel between two browser documents, moves opaque values, selects a carrier,
and preserves a transferable native resource across document navigation.

[CCDP.md](CCDP.md) defines message shapes, directions, ordering, and handling.
The [MessagePort](CCDP-CARRIER-MESSAGEPORT.md) and
[WebRTC](CCDP-CARRIER-WEBRTC.md) documents define the two carriers.

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
- ceremony and CCDP-version binding;
- the retained popup `WindowProxy`;
- opaque ordered delivery;
- MessagePort-first selection and WebRTC fallback;
- native carrier resources and navigation handoff; and
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

When the caller does not supply a `WindowProxy`, the client explicitly binds
one:

```ts
clientTransport.bindPopup(accept: (value: unknown) => boolean): Promise<void>
```

It considers only values from the configured remote origin and commits the
browser-stamped source of the first value accepted by the caller predicate.
Transport never interprets the value, and rejected candidates bind nothing. A
caller-supplied popup handle is instead bound by the constructor.

Both endpoints expose the same opaque delivery operations:

```ts
transport.send(value: unknown): void
transport.onMessage(handler: (value: unknown) => void): () => void
transport.navigatePopup(url: string): Promise<void>
transport.close(): void
```

`send` accepts an opaque value into the current physical path;
it is not a delivery acknowledgement. `onMessage` exposes an untrusted value to
the participant's CCDP decoder and returns an unsubscribe function. Transport
does not inspect a discriminator or dispatch a protocol handler. `close` is
idempotent and sends no delivery result.

`navigatePopup` accepts a caller-selected opaque URL. It never parses, builds,
or branches on that URL:

- the client endpoint navigates its exact retained `WindowProxy` directly; or
- the popup endpoint first hands off its owned navigation port, awaits worker
  ownership, and then replaces its current document.

The transport decides between those operations from the native resource it
owns, never from the URL. A popup endpoint without the required navigation port
rejects rather than navigating and losing live state.

## WindowProxy path

A popup endpoint constructed from `window.opener` and an immutable target-origin
set can send an opaque value over `WindowProxy`. The client endpoint accepts a
candidate only from its configured remote origin. `bindPopup` commits the
browser-stamped source only after the caller-supplied predicate accepts the
value. A caller-supplied handle is bound during construction instead.

Navigation destroys that popup endpoint. The client endpoint retains the bound
source and any idle signaling subscription. No private bootstrap record or
MessagePort is required for this path.

## Carrier selection

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

## Native carrier resources

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

Only MessagePort is transferable:

- a selected MessagePort is both the active carrier resource and the
  source-to-destination navigation payload;
- WebRTC fallback uses a transport-created `MessageChannel` only to carry the
  queued value to the destination document; and
- an established `RTCDataChannel` is never handed across navigation.

The destination endpoint consumes the fallback value, establishes WebRTC
through the pre-armed signaling subscription, adapts the resulting
`RTCDataChannel`, and forwards that unchanged value first.

## Navigation port handoff

Transport records exactly one popup-side navigation payload after carrier
selection:

```ts
interface NavigationPayload {
  purpose: string
  port: MessagePort
}
```

For MessagePort, this is the selected popup endpoint. For WebRTC fallback, it
is the peer endpoint of the local channel containing the queued value.
The exact purpose literals and contents remain transport-private; the worker
handoff treats both as opaque.

The caller resolves the active `ServiceWorkerRegistration` and supplies it as a
browser resource. Transport contains no worker scope or route constant.
`navigatePopup` performs:

```ts
async function holdNavigationPort(
  registration: ServiceWorkerRegistration,
  ceremonyId: string,
  purpose: string,
  port: MessagePort,
): Promise<void>
```

The hold transfers the payload and a fresh receipt port to the worker. It
resolves only after the worker accepts one holder for the exact ceremony ID in
its short-lived in-memory map. Transport clears its local ownership only after
transfer and replaces the source document only after acknowledgement.

The destination document resolves the same registration and claims before
package import or network use:

```ts
async function claimNavigationPort(
  registration: ServiceWorkerRegistration,
  ceremonyId: string,
): Promise<NavigationPayload>
```

The worker atomically removes the holder and returns the unchanged purpose and
port. Receipt ports close after their replies. The worker extends each handling
event through its reply, keeps no durable record, and never reads queued port
values.

The two acknowledged calls are necessary because the worker must own the port
before the source document destroys itself and the destination document does
not yet exist. Ceremony ID, purpose bounds, transferable count, duplicate
ownership, expiry, and one-use claim are checked before ownership changes. Wrong, missing,
expired, duplicate, replayed, or post-terminal calls reject and close every
reachable port. Worker loss or a failed acknowledgement prevents navigation
with live state. No `BroadcastChannel`, cookie, IndexedDB record, request, or
URL carries the port, purpose, or queued value.

## Failure and security rules

- One transport accepts one popup source, one carrier selection, and one
  navigation handoff.
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

`CCDPVersion` covers source binding, carrier authentication, navigation
continuity, and opaque delivery. Carriers and same-release worker controls have
no separately negotiated version. Compatible releases may change internal
framing, ICE policy, worker controls, or equivalent browser mechanics without
changing the transport contract.
