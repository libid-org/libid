# MessagePort transport

This document defines the preferred browser-local carrier used by the
[popup transport](TRANSPORT.md) while the returned popup retains its
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
which severs the opener relationship. If that happens before the returned popup
binds the channel, this carrier is unavailable. Once bound, the transport can
preserve the popup's port across its own immediate document replacement.

The controls below are package-private carrier mechanics, not caller messages,
public APIs, extension points, or durable state.

## Boundary

The carrier begins with caller-supplied browser handles, expected origins,
transport version, connection ID, and cancellation signal. It ends with one
authenticated local `MessagePort` at each endpoint.

Within that boundary it owns:

- validation of browser-stamped `MessageEvent.source` and
  `MessageEvent.origin`;
- one `MessageChannel`, one transfer of its popup endpoint, and the lifetime
  of both local endpoints; and
- adaptation of an accepted port to the transport's typed delivery API.

The transport owns timeout, carrier selection, navigation continuity, and the
logical connection. The caller owns every transported value and its meaning.
The carrier neither interprets those values nor persists or recovers them.

## Failure and security invariants

- Events from another `WindowProxy` are ignored. Before binding, every event
  from the bound source is a handshake attempt and must exact-match its
  browser-stamped origin, `message-port` discriminator, record shape, direction,
  and transport version. The popup additionally requires its one-use
  connection ID and exactly one transferred port.
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
- Port loss may be silent. It is a transport failure, never delivery, success,
  denial, cancellation, or any other caller outcome.

## Authentication

Both directions use one carrier-local record:

```ts
interface MessagePortHandshake {
  type: 'message-port'
  transportVersion: TransportVersion
  connectionId: string | null
}
```

The returned popup sends the record with `connectionId: null` and no
transferable. It contains no connection ID or other caller-level value. The
application accepts it only from its retained popup source, configured popup
origin, and expected transport version.

The application creates one `MessageChannel`, retains one endpoint, and sends
the same record back with the live connection ID and the other endpoint as its
only transferable. The popup accepts it only from its exact opener and a
browser-stamped origin in its immutable allowed-origin set, and only when the
transport version and connection ID match its current binding. It rejects a
missing or additional port.

The request may use an unrestricted target origin because it contains no
capability or application value. The response targets the exact popup origin.
Application-level delivery starts only on the authenticated port.

## Message delivery

`messagePortCarrier` passes each logical value directly to
`MessagePort.postMessage`. Native structured clone preserves arrays, plain
records, and `Uint8Array`; this carrier adds no JSON encoding, byte tag,
normalization, or additional copy. Received `MessageEvent.data` remains
`unknown` until transport selects and applies its registered `Decoder`. A
successful decode returns that same received object rather than allocating a
replacement. A `DataCloneError` or `messageerror` closes the carrier. A failed
decode makes transport close it. None releases a value.

## API

The application starts connecting before the popup endpoint is ready:

```ts
declare function connectApplicationMessagePort(options: {
  popup: WindowProxy
  popupOrigin: string
  transportVersion: TransportVersion
  connectionId: string
  signal: AbortSignal
}): Promise<MessagePort>

declare function connectPopupMessagePort(options: {
  opener: WindowProxy
  allowedApplicationOrigins: readonly string[]
  transportVersion: TransportVersion
  connectionId: string
  signal: AbortSignal
}): Promise<MessagePort>

declare function messagePortCarrier<M>(port: MessagePort): Carrier<M>
```

`connectApplicationMessagePort` installs the exact source/origin listener
synchronously and returns a pending port promise without sending anything. The
application keeps that promise across caller-controlled popup navigation and
awaits it only when it needs the carrier:

```ts
const portPromise = connectApplicationMessagePort(options)
navigatePopup(externalUrl)
const port = await portPromise
```

When the popup endpoint is ready, it calls and awaits
`connectPopupMessagePort`. It sends the handshake request; the pending
application operation validates it, creates the channel, sends the response,
and resolves `portPromise` with its retained endpoint. The popup validates
that response and resolves with the transferred endpoint.

Each operation resolves once with its local endpoint. A handshake attempt from
the bound source that fails authentication rejects immediately; abort also
rejects. Both paths remove the window listener and close every reachable port.
The concrete error type is private. `messagePortCarrier` starts the port,
forwards unchanged structured-clone values, and closes idempotently.
