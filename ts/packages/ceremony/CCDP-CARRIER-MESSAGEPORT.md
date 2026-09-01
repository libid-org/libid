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

The carrier owns:

- exact popup/application authentication from browser-stamped source and
  origin;
- creation and one-use transfer of one `MessageChannel` endpoint;
- adaptation of the resulting port to opaque ordered delivery; and
- cleanup when binding fails or is cancelled.

It does not inspect transported values, select another carrier, navigate a
document, persist data, or recover a connection. Navigation continuity belongs
to the CCDP transport.

## Authentication

Both directions use one carrier-local record:

```ts
interface MessagePortHandshake {
  type: 'message-port'
  compatibilityTag: number
  ceremonyId: string | null
}
```

The returned popup sends the record with `ceremonyId: null` and no transferable.
It contains no ceremony ID, OAuth return, or other application-level value. The
application accepts it only from its retained popup source, configured callback
origin, and expected compatibility tag.

The application creates one `MessageChannel`, retains one endpoint, and sends
the same record back with the live ceremony ID and the other endpoint as its
only transferable. The popup accepts it only from its exact opener and a
browser-stamped origin in its immutable server-provided allowlist, and only when
the compatibility tag and ceremony ID match its current binding and cleared
OAuth state. It rejects a missing or additional port.

The request may use an unrestricted target origin because it contains no
capability or application value. The response targets the exact callback origin.
Application-level delivery starts only on the authenticated port.

## API and timing

The endpoints have different operations because the client is armed before
provider navigation while the returned callback exists only afterward:

```ts
declare function armClientMessagePort(options: {
  popup: WindowProxy
  callbackOrigin: string
  compatibilityTag: number
  ceremonyId: string
  signal: AbortSignal
}): Promise<MessagePort>

declare function bindCallbackMessagePort(options: {
  opener: WindowProxy
  allowedAppOrigins: readonly string[]
  compatibilityTag: number
  ceremonyId: string
  signal: AbortSignal
}): Promise<MessagePort>

declare function messagePortCarrier(port: MessagePort): Carrier
```

The application starts `armClientMessagePort` before provider navigation. It
installs the exact source/origin listener and leaves the returned promise pending
without sending anything. The provider-return callback calls
`bindCallbackMessagePort` only after its first script clears the URL and extracts
the one ceremony ID. That operation sends the handshake request and waits for
the authenticated port response. The initial prefetch document calls neither
operation.

Each operation resolves once with its local endpoint or rejects without a
carrier. Aborting removes its window listener and closes every reachable port.
`messagePortCarrier` starts the port, forwards unchanged structured-clone values,
and closes idempotently.

## Failure and security invariants

- Both handshake directions exact-check source, origin, record shape, and
  compatibility tag against the current binding.
- The popup also exact-checks the one-use ceremony ID and transferred-port
  count before accepting ownership.
- Wrong, missing, duplicate, replayed, late, or aborted handshakes release no
  application-level value and leave no carrier.
- Port delivery preserves ordered nonduplicated values without decoding them.
- Port closure or context destruction may be silent; neither is a ceremony
  outcome or recovery signal.
