# MessagePort carrier

This document defines the preferred browser-local carrier used by the
[popup connection](connection.md) while the returned popup retains its
application opener.

`MessagePort` is the simplest carrier for this job. One `window.postMessage`
exchange authenticates browser-stamped source and origin and transfers one end
of a `MessageChannel`; the entangled ports then provide ordered structured-clone
delivery without framing, signaling, or a server. These are standard browser
primitives defined by the HTML Standard's [cross-document messaging](https://html.spec.whatwg.org/multipage/web-messaging.html#crossDocumentMessages)
and [message-channel](https://html.spec.whatwg.org/multipage/web-messaging.html#message-channels)
sections.

Its limitation is establishment under isolation. `window.postMessage` requires
a live `WindowProxy`, while Cross-Origin-Opener-Policy can cause a
[browsing-context-group switch](https://html.spec.whatwg.org/multipage/browsers.html#coop-bcg-switch)
which severs the opener relationship. If that happens before a returned popup
document binds its channel, this carrier is unavailable for that document. Each
participating popup document either claims a preserved port or establishes a
fresh one. Connection retains a usable port for as long as possible and may
preserve it across repeated participating-document replacements. If the port
cannot continue across a document change, connection transparently establishes
another carrier or fails closed.

The controls below are package-private carrier mechanics, not caller messages,
public APIs, extension points, or durable state.

## Boundary

The carrier begins with connection-supplied browser handles, expected origins,
connection version, connection ID, and internal cancellation signal. It ends with one
authenticated local `MessagePort` at each endpoint.

Within that boundary it owns:

- validation of browser-stamped `MessageEvent.source` and
  `MessageEvent.origin`;
- one `MessageChannel`, one transfer of its popup endpoint, and the lifetime
  of both local endpoints;
- preservation of an authenticated port across immediate participating-document
  replacement; and
- adaptation of an accepted port to the connection's typed delivery API.

The connection owns carrier selection, the decision to navigate, and the
logical connection. The caller owns every transported value and its meaning.
The carrier neither interprets those values nor persists or recovers them.

## Failure and security invariants

- Events from another `WindowProxy` are ignored after binding. Before native
  fallback binding, every matching-origin event is a handshake attempt and must exact-match its
  browser-stamped origin, `message-port` discriminator, record shape, direction,
  connection version, and connection ID. The popup additionally requires
  exactly one transferred port.
- The wildcard-targeted request contains no capability or application-level
  value. The response uses the exact popup origin, transfers only the new popup
  endpoint, and never exposes the application's retained endpoint.
- Any handshake attempt which fails those checks rejects the binding and closes
  every reachable port. An accepted handshake removes its window listener;
  later window traffic is inert.
- After binding, possession of the entangled port authenticates the peer.
  Application-level values travel only over that port; the carrier preserves
  their order and shape without interpreting them.
- Abort, timeout, `messageerror`, port closure, or browser-context destruction
  closes reachable resources and releases no later value. There is no
  reconnect, resend, or recovery inside this carrier.
- Port loss may be silent. It is a connection failure, never delivery, success,
  denial, cancellation, or any other caller outcome.

## Authentication

Both directions use one carrier-local record:

```ts
interface MessagePortHandshake {
  type: 'message-port'
  connectionVersion: ConnectionVersion
  connectionId: string
}
```

The returned popup sends the record with its connection ID and no transferable.
The ID is public correlation, not a capability or caller-level value. The
application accepts it only from its retained popup source, or binds the
browser-stamped source once in the native-anchor fallback, and only when the
configured popup origin, connection version, and connection ID exact-match.

The application creates one `MessageChannel`, retains one endpoint, and sends
the same record back with the live connection ID and the other endpoint as its
only transferable. The popup accepts it only from its exact opener and a
browser-stamped origin in its immutable allowed-origin set, and only when the
connection version and connection ID match its current binding. It rejects a
missing or additional port.

The request may use an unrestricted target origin because it contains no
capability or application value. The response targets the exact popup origin.
Application-level delivery starts only on the authenticated port.

## Message delivery

`messagePortCarrier` passes each logical value directly to
`MessagePort.postMessage`. Native structured clone preserves arrays, plain
records, and `Uint8Array`; this carrier adds no JSON encoding, byte tag,
normalization, or additional copy. Received `MessageEvent.data` remains
`unknown` until the connection selects and applies its registered `MessageType`.
A successful decode returns that same received object rather than allocating a
replacement. A `DataCloneError` or `messageerror` closes the carrier. A failed
decode makes the connection close it. None releases a value.

## Continuity across navigations

Replacing a popup document normally destroys its side of the communication
channel together with its JavaScript heap. A live `MessagePort` owned only by
that document becomes unreachable, while the destination document does not yet
exist and cannot receive it directly. The carrier gives the port a temporary
same-origin Service Worker owner across that gap:

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
destination claims before loading caller code or using the network. This
preserves the already authenticated port without repeating its handshake.
`PortKeeper` never receives an RTC resource, substitute carrier, or caller
value.

This is a short in-memory continuity bridge, not persistence or recovery.
Worker loss breaks continuity; no later document can reconstruct or resume the
channel.

### Timing assumptions and browser limits

For every participating-document replacement, the bridge must complete within
its bounded interval. The same logical connection may use it repeatedly. After
the worker acknowledges preservation, the source starts navigation immediately
and the destination claims in its clearing bootstrap before package import or
network use. It never holds a port while an unrelated document, user
interaction, or intentional background wait owns the popup; a later
participating document establishes a replacement carrier.

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

These are observations, not guaranteed browser contracts. The carrier uses one
conservative `CARRIER_CLAIM_TIMEOUT_MS = 5_000` across engines, below the
observed WebKit boundary. It does not sniff the user agent or select a
browser-specific deadline. Suspension, process loss, memory pressure, or expiry
may still break continuity; failure is terminal and never selects a weaker
path.

### Internal PortKeeper API

`PortKeeper` is the carrier's package-private continuity component. It
encapsulates Service Worker communication, temporary ownership, event lifetime,
the claim deadline, one-use transfer, and cleanup. It neither reads the port nor
interprets its purpose.

```ts
declare class PortKeeper {
  constructor(
    registration: ServiceWorkerRegistration,
    connectionVersion: ConnectionVersion,
  )

  keep(
    connectionId: string,
    purpose: string,
    port: MessagePort,
  ): Promise<void>

  claim(connectionId: string): Promise<{
    purpose: string
    port: MessagePort
  } | null>
}
```

The constructor fixes the active registration and connection version for both
operations. `keep` resolves only after the worker owns the exact port, after
which connection may replace the source document. `claim` atomically returns
and removes the unchanged purpose and port, or returns `null` when no entry
exists. `null` authenticates and selects nothing; popup construction continues
with its available browser resources. A returned port is the selected carrier
endpoint.

The two acknowledged calls are necessary because the worker must own the port
before the source document destroys itself and the destination document does
not yet exist. The Service Worker record and control-message encoding are
implementation details. Connection version, connection ID, purpose bounds,
transferable count, duplicate ownership, expiry, and one-use claim are checked
before ownership changes. A malformed, mismatched, duplicate, or post-terminal
record rejects and closes every reachable port; absence is the sole `null`
result. Worker loss or a failed `keep` acknowledgement prevents navigation with
live state. No `BroadcastChannel`, cookie, IndexedDB record, request, or URL
carries the port or purpose.

## API

The application starts connecting before the popup endpoint is ready:

```ts
declare function connectApplicationMessagePort(options: {
  popupWindow: PopupWindow
  popupOrigin: string
  connectionVersion: ConnectionVersion
  connectionId: string
  signal: AbortSignal
}): Promise<MessagePort>

declare function connectPopupMessagePort(options: {
  opener: WindowProxy
  allowedApplicationOrigins: readonly string[]
  connectionVersion: ConnectionVersion
  connectionId: string
  signal: AbortSignal
}): Promise<MessagePort>

declare function messagePortCarrier(port: MessagePort): Carrier
```

`connectApplicationMessagePort` installs its listener synchronously and returns
a pending port promise for one popup document without sending anything. When `PopupWindow` retained a
handle it requires that exact source. Otherwise it internally binds
`PopupWindow` to the source of the first handshake that exact-matches the configured popup origin,
connection version, and connection ID. When a document change cannot preserve
the current port, the connection closes it and synchronously creates the next
pending operation before navigating. This replacement is private connection
machinery; callers continue using the same `PopupConnection`.

When the popup endpoint is ready, it calls and awaits
`connectPopupMessagePort`. It sends the handshake request; the pending
application operation validates it, creates the channel, sends the response,
and resolves `portPromise` with its retained endpoint. The popup validates
that response and resolves with the transferred endpoint.

Each operation resolves once with its local endpoint. A later participating
document repeats the operation under the same logical connection. A handshake attempt from
the retained or newly bound source that fails authentication rejects
immediately; abort also rejects. Both paths remove the window listener and
close every reachable port.
The concrete error type is private. `messagePortCarrier` starts the port,
forwards unchanged structured-clone values, and closes idempotently.
