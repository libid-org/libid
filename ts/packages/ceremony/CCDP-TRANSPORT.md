# CCDP transport

This document defines the package-private transport used by the Ceremony
Cross-Document Protocol (CCDP). It authenticates one ceremony, moves opaque
values, selects a carrier after OAuth, and preserves the popup-side native
resource across callback-to-prover navigation.

[CCDP.md](CCDP.md) defines message shapes, directions, ordering, and handling.
The [MessagePort](CCDP-CARRIER-MESSAGEPORT.md) and
[WebRTC](CCDP-CARRIER-WEBRTC.md) documents define the two post-OAuth carriers.

## Boundary

Transport owns:

- browser-stamped source and origin checks;
- ceremony and CCDP-version binding;
- the retained popup `WindowProxy`;
- opaque ordered delivery;
- MessagePort-first selection and WebRTC fallback;
- native carrier resources and navigation handoff; and
- one-shot closure and race resolution.

Transport does not know CCDP message types, codecs, directions, ordering,
platforms, OAuth fields, prefetch behavior, or route meanings. Callback,
prover, and client logic construct, decode, and handle every value outside
transport.

## API

The application constructs one client transport for the ceremony. Each
callback or prover document constructs a fresh popup transport from the browser
resources available in that document. Their package-private resource records
contain no semantic phase or route name.

```ts
const clientTransport = CCDPTransport.client(clientResources)
const popupTransport = CCDPTransport.popup(popupResources)
```

`clientResources` includes the configured callback origin, optional
caller-supplied popup handle, and a participant-owned
`acceptInitial(value: unknown): boolean` predicate. The constructor installs
the initial listener. It commits only the browser-stamped source of a value from
that origin which the predicate accepts; a supplied handle must also match.
Transport never interprets the value, and rejected candidates bind nothing.

Both endpoints expose the same opaque delivery operations:

```ts
transport.send(value: unknown): void
transport.onMessage(handler: (value: unknown) => void): () => void
transport.navigatePopup(url: string): Promise<void>
transport.close(): void
```

`send` accepts an already validated CCDP value into the current physical path;
it is not a delivery acknowledgement. `onMessage` exposes an untrusted value to
the participant's CCDP decoder and returns an unsubscribe function. Transport
does not inspect a message discriminator or dispatch a protocol handler.
`close` is idempotent and sends no ceremony result.

`navigatePopup` accepts a caller-selected opaque URL. It never parses, builds,
or branches on that URL:

- the client endpoint navigates its exact retained `WindowProxy` directly; or
- the popup endpoint first hands off its owned navigation port, awaits worker
  ownership, and then replaces its current document.

The transport decides between those operations from the native resource it
owns, not from a phase or URL. A popup endpoint without the required navigation
port rejects rather than navigating and losing live state.

## Initial callback

The initial callback constructs its popup transport from `window.opener` and
the immutable allowed application origins. Its selected-profile prover child
starts prefetch. Once dispatch settles, callback logic constructs
`ProverPrefetchingAssets` and calls `send`; transport delivers that opaque value
over `WindowProxy` with exact configured target origins. Transport neither
executes prefetch nor identifies the value.

The client transport accepts a candidate only from the configured callback
origin. Its constructor-supplied predicate delegates exact
`ProverPrefetchingAssets` validation to the Ceremony Client and commits the
browser-stamped source only when that predicate accepts the live ceremony's
record. A supplied scripted-open handle must already equal that source;
real-anchor launch learns the source here. The client then asks transport to
navigate the retained popup to the frozen provider URL.

Provider navigation destroys the initial popup transport. The client transport
retains the bound popup source and its idle WebRTC signaling subscription.
There is no private bootstrap record or pre-OAuth MessagePort.

## Carrier selection after OAuth

The returned callback clears its URL, extracts only the ceremony ID needed for
routing, and constructs `CallbackDeliverParams` outside transport. Transport
then chooses one physical path:

1. A usable retained opener completes the MessagePort carrier's exact
   source/origin authentication. Its native result is a `MessagePort`.
2. An absent, severed, invalid, or timed-out opener commits WebRTC fallback.
   There is no WebRTC carrier yet because callback-to-prover navigation would
   destroy it. Transport creates a local `MessageChannel` and queues the opaque
   callback value on one endpoint.

MessagePort has priority until fallback commits. The client accepts the first
valid selection; late authentication, signaling, or values from another path
are inert. A selected path never migrates after failure.

In the MessagePort path, `send(CallbackDeliverParams)` uses the selected native
port. In fallback, the same call queues the value on the transport-owned local
port. Transport neither identifies nor parses that value.

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
  callback-to-prover navigation payload;
- WebRTC fallback uses a transport-created `MessageChannel` only to carry the
  queued callback value to the future prover; and
- an established `RTCDataChannel` is never handed across navigation.

The final prover consumes the fallback value, establishes WebRTC through the
pre-armed signaling subscription, adapts the resulting `RTCDataChannel`, and
forwards that unchanged value first.

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
is the peer endpoint of the local channel containing the queued callback value.
The exact purpose literals and contents remain transport-private; the worker
handoff treats both as opaque.

The callback participant resolves the active prover
`ServiceWorkerRegistration` and supplies it as a browser resource. Transport
contains no worker scope or route constant. `navigatePopup` performs:

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
transfer and replaces the callback only after acknowledgement.

The clearing top-level prover bootstrap resolves the same registration and
claims before package import or network use:

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
before the callback destroys itself and the destination prover does not yet
exist. Ceremony ID, purpose bounds, transferable count, duplicate ownership,
expiry, and one-use claim are checked before ownership changes. Wrong, missing,
expired, duplicate, replayed, or post-terminal calls reject and close every
reachable port. Worker loss or a failed acknowledgement prevents navigation
with live state. No `BroadcastChannel`, cookie, IndexedDB record, request, or
URL carries the port, purpose, or queued value.

## Failure and security rules

- One live ceremony accepts one popup source, one carrier selection, one
  callback value, and one proof attempt.
- Window controls exact-check browser-stamped source and origin before binding
  or releasing a value.
- Carriers cannot inspect, add, remove, or classify CCDP values.
- Signaling carries no CCDP value.
- Wrong, stale, duplicate, replayed, or post-terminal values change no state.
- Carrier, popup, worker, or context loss is never success, denial,
  cancellation, or recovery.
- Observable failure rejects the live ceremony and clears reachable inputs;
  unobservable loss may strand it until caller cancellation.

## Sequence

```mermaid
sequenceDiagram
    participant A as Client transport
    participant C0 as Initial callback
    participant O as OAuth provider
    participant C1 as Returned callback transport
    participant P as Prover transport

    C0-->>A: ProverPrefetchingAssets through popup transport
    Note over A: Constructor predicate validates; client transport binds source
    A->>C0: navigatePopup(provider URL)
    C0->>O: Replace popup
    O-->>C1: Return authorization result
    alt MessagePort carrier
        C1-->>A: Opaque CallbackDeliverParams
        C1->>P: Hand off native MessagePort and replace popup
    else WebRTC fallback
        C1->>P: Hand off queued-value port and replace popup
        Note over A,P: Establish WebRTC carrier
        P-->>A: Opaque CallbackDeliverParams
    end
    A-->>P: Opaque AppRequestProof or AppCancelCeremony
    P-->>A: Opaque progress, proof, or abort
```

## Versioning

`CCDPVersion` covers initial source binding, carrier authentication, navigation
continuity, and CCDP values. Carriers and same-release worker controls have no
separately negotiated version. Compatible releases may change internal framing,
ICE policy, worker controls, or equivalent browser mechanics without changing
the opaque transport contract.
