# CCDP MessagePort carrier

This document defines the preferred browser-local carrier used by the concrete
[CCDP transport](CCDP-TRANSPORT.md) while the returned popup retains its
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

The controls below are package-private carrier mechanics, not CCDP messages,
public APIs, extension points, or durable state.

## Boundary

The carrier begins with caller-supplied browser handles, expected origins,
application version, ceremony ID, and cancellation signal. It ends with one
authenticated local `MessagePort` at each endpoint.

Within that boundary it owns:

- validation of browser-stamped `MessageEvent.source` and
  `MessageEvent.origin`;
- one `MessageChannel`, one transfer of its callback endpoint, and the lifetime
  of both local endpoints; and
- adaptation of an accepted port to the transport's typed delivery API.

The transport owns timeout, carrier selection, navigation continuity, and the
logical connection. The caller owns every transported value and its meaning.
The carrier neither interprets those values nor persists or recovers them.

## Failure and security invariants

- Events from another `WindowProxy` are ignored. Before binding, every event
  from the bound source is a handshake attempt and must exact-match its
  browser-stamped origin, `message-port` discriminator, record shape, direction,
  and application version. The callback additionally requires its one-use
  ceremony ID and exactly one transferred port.
- The wildcard-targeted request contains no capability or application-level
  value. The response uses the exact callback origin, transfers only the new
  callback endpoint, and never exposes the client's retained endpoint.
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
  denial, cancellation, or any other ceremony outcome.

## Authentication

Both directions use one carrier-local record:

```ts
interface MessagePortHandshake {
  type: 'message-port'
  applicationVersion: number
  ceremonyId: string | null
}
```

The returned popup sends the record with `ceremonyId: null` and no transferable.
It contains no ceremony ID, OAuth return, or other application-level value. The
application accepts it only from its retained popup source, configured callback
origin, and expected application version.

The application creates one `MessageChannel`, retains one endpoint, and sends
the same record back with the live ceremony ID and the other endpoint as its
only transferable. The popup accepts it only from its exact opener and a
browser-stamped origin in its immutable server-provided allowlist, and only when
the application version and ceremony ID match its current binding and cleared
OAuth state. It rejects a missing or additional port.

The request may use an unrestricted target origin because it contains no
capability or application value. The response targets the exact callback origin.
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

The application starts connecting before provider navigation while the
ceremony endpoint exists only afterward:

```ts
declare function connectApplicationMessagePort(options: {
  popup: WindowProxy
  callbackOrigin: string
  applicationVersion: number
  ceremonyId: string
  signal: AbortSignal
}): Promise<MessagePort>

declare function connectCeremonyMessagePort(options: {
  opener: WindowProxy
  allowedAppOrigins: readonly string[]
  applicationVersion: number
  ceremonyId: string
  signal: AbortSignal
}): Promise<MessagePort>

declare function messagePortCarrier(port: MessagePort): Carrier
```

`connectApplicationMessagePort` installs the exact source/origin listener
synchronously and returns a pending port promise without sending anything. The
application keeps that promise, starts provider navigation, and awaits it only
when it needs the carrier:

```ts
const portPromise = connectApplicationMessagePort(options)
navigateToProvider()
const port = await portPromise
```

After returning from the provider and clearing its URL, the callback calls and
awaits `connectCeremonyMessagePort`. It sends the handshake request; the pending
application operation validates it, creates the channel, sends the response,
and resolves `portPromise` with its retained endpoint. The callback validates
that response and resolves with the transferred endpoint.

Each operation resolves once with its local endpoint. A handshake attempt from
the bound source that fails authentication rejects immediately; abort also
rejects. Both paths remove the window listener and close every reachable port.
The concrete error type is private. `messagePortCarrier` starts the port,
forwards unchanged structured-clone values, and closes idempotently.
