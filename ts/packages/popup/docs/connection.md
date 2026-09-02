# Popup connection

This document defines the popup connection architecture. A `PopupWindow`
owns one popup from creation through closure. A `PopupConnection` composes over it,
establishes a bidirectional channel to an application page, moves caller-defined
values, selects one carrier for each participating popup document, and preserves
a transferable native resource across participating-document replacement. It is not a generic
document-to-document abstraction.

`PopupConnection` represents one logical connection. It retains a usable
carrier for as long as possible and may preserve, transfer, or replace that
carrier transparently across document changes. Carrier identity, count, and
lifetime are not API guarantees. If no carrier can continue or be established,
the logical connection fails closed.

```ts
type ConnectionVersion = 1
```

`ConnectionVersion` exact-matches the connection's private authentication,
carrier, signaling, framing, and continuity controls. It does not version or
describe any caller protocol.

### Connection ID

`connectionId` is a caller-supplied string with this exact canonical lowercase
RFC 4122 UUIDv4 grammar:

```text
^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

The caller generates it with a cryptographically secure random-number
generator, normally `crypto.randomUUID()`. It must be fresh for every logical
popup connection and must never be reused, including after failure or closure.
Every participating document in that logical connection receives the same
exact value.

Connection constructors validate the grammar before starting carrier,
continuity, or signaling work. They do not normalize uppercase or other UUID
spellings. Freshness is a caller invariant: the package keeps no durable reuse
registry.

The topology is an ordinary browser tab running the application and one
adjacent popup. The application and popup may be cross-origin and cross-site.

```text
Application tab                              Popup
https://app.example                          https://popup.example
┌────────────────────────────┐ carrier ┌────────────────────────┐
│ PopupConnection.connect    │<=======>│ PopupConnection.accept │
└────────────────────────────┘         └────────────────────────┘
```

## Operating constraints

The connection must:

- connect the application tab and popup across origins or sites;
- preserve one logical connection while the popup crosses an external document,
  loses its initial browsing-context relationship, and enters an isolated
  document;
- require no connection-owned route, standalone script, or server endpoint on
  the application origin;
- require no additional top-level browsing context beyond the existing popup
  and no second user action;
- keep active work in the visible popup without requiring the application tab
  to remain visible or continuously scheduled;
- carry application-level messages directly between the two browser endpoints;
  no server relays or stores them or terminates their channel; and
- provide ordered bidirectional delivery across WebKit, Gecko, and Chromium on
  Android, iOS, Linux, macOS, and Windows, including when mobile browsers show
  only the popup and suspend the application tab, without browser-specific
  protocol branches or user-agent detection.

## Boundary

`PopupWindow` owns:

- popup creation, native-anchor adoption, its retained handle, direct
  navigation, and direct closure on the application side; and
- the current window, its opener, and Service Worker access on the popup side.

`PopupConnection` owns:

- one logical connection bound to the caller-supplied connection ID and
  connection version;
- composition over an injected `PopupWindow` and connected navigation and
  closure;
- selection and ownership of one authenticated carrier;
- ordered delivery and continuity across popup document replacement;
  and
- one active carrier at a time, carrier replacement after external navigation,
  navigation, connection closure, cleanup, and race resolution.

Carriers own endpoint authentication, establishment, physical serialization
where required, native framing, resource cleanup, and delivery mechanics. Each
caller-registered `MessageType` owns one message's structural decoding and
routing discriminator. Callers own the permitted message set, protocol order,
navigation destinations, route meanings, state transitions, and outcomes. The
connection invokes decoding and dispatch but does not interpret the resulting
message.

## Failure and security rules

- A carrier is selectable only after it authenticates both endpoints.
- One connection admits at most one popup browsing context and one active
  carrier. Each participating popup document authenticates and selects its own
  carrier; stale carriers and losing races are inert.
- Application-level messages travel only over the active end-to-end carrier.
  Rendezvous and continuity
  controls carry none; neither do cookies, durable storage, request data, or
  URLs.
- A carrier may validate its generic value domain, bounds, and framing but
  cannot inspect a message discriminator or interpret, classify, synthesize, or
  alter its meaning.
- Wrong, stale, duplicate, replayed, or post-close control messages cannot bind,
  select, reopen, or mutate connection. The registered `MessageType` validates
  structure; callers validate protocol state and order.
- Carrier, endpoint, continuity mechanism, or browser-context loss is never
  delivery, success, cancellation, or recovery.
- Background suspension may delay delivery but is not success, cancellation,
  or a reason to select another carrier; delivery after resumption preserves
  order.
- An observed failure closes reachable resources and releases no later value;
  the caller determines the outcome.

## API

The module has one long-lived application endpoint and a fresh popup endpoint
for each popup document. `PopupWindow` factories capture the endpoint's browser
resources; connection constructors receive only that injectable wrapper and
authentication inputs:

```ts
const openedWindow = PopupWindow.open(anchor.target)
const applicationConnection = PopupConnection.connect<Messages>(openedWindow, {
  connectionId,
  popupOrigin,
  fallback,
  onDiagnostic,
})

const currentWindow = PopupWindow.current()
const popupConnection = await PopupConnection.accept<Messages>(currentWindow, {
  connectionId,
  allowedApplicationOrigins,
  fallback,
  onDiagnostic,
})
```

Messages are caller-owned classes registered independently. The connection
requires unique discriminators but defines no protocol namespace, closed union,
or caller message type.

`PopupWindow.open(target)` creates the application-side lifecycle object and
synchronously attempts `window.open('about:blank', target)`.
`PopupConnection.connect` composes over that exact object, synchronously arms
fallback binding, and never accepts a caller-supplied `WindowProxy`. It never
constructs a `PortKeeper`. `PopupWindow.current()` captures the popup document,
its opener, and its package-owned Service Worker registration.
`PopupConnection.accept` composes over that object. When an active registration is
available, it privately constructs a keeper and attempts `claim` for the
connection ID before selecting a new carrier. A matching entry restores its
native port; no entry leaves the fresh endpoint to use its available opener or
signaling resources normally.

There is no public role field or per-operation role branch. Callers never
supply a keeper, continuity purpose, route, or phase.

Both endpoint records include the same caller-supplied connection ID. The
package supplies `ConnectionVersion` internally. Connection uses the ID for
authentication, continuity, and private signaling without recovering it from
transported values. It exact-matches both values in private carrier and
navigation controls but assigns neither caller-level semantics. The connection
ID lives for the logical connection; individual carrier attempts do not consume
it.

A popup endpoint constructed from `PopupWindow.current()` and an immutable
target-origin set sends the MessagePort carrier's private handshake before
carrier selection. For that carrier, its connection ID and connection version
are correlation metadata, not capabilities or caller values; WebRTC additionally
uses the connection ID as its rendezvous capability. The application endpoint
validates and consumes the control without exposing it to caller code.

`PopupWindow.open(target)` binds a returned handle privately. When the browser
returns no handle, `PopupConnection.connect` listens for the popup created by the
native anchor. It considers only the expected initial private control with the exact
connection ID and connection version from the configured popup origin. After
exact validation it internally calls
`PopupWindow.bind(MessageEvent.source)` once.
Wrong source, origin, ID, version, direction, or initial control rejects the
connection. `bind` is package-internal and never accepts or interprets a caller
message. `PopupWindow.opened` is initially true only when scripted creation
returned a handle and becomes true after successful fallback binding.

When a document change cannot preserve the popup endpoint's current carrier,
the connection retains its logical state and bound popup browsing context while
it prepares a replacement. An active WebRTC carrier privately asks the
application endpoint to start the next one-use signaling round and waits for its
readiness before the popup navigates. The next participating popup document
calls `accept` and installs the selected carrier under the same logical
connection. These mechanics are transparent to the caller.

### Popup creation and native-anchor fallback

The caller renders an action-specific anchor with the destination URL and a
unique nonreserved target. On activation it lets the package attempt popup
creation and synchronously arms fallback binding before the handler returns:

```ts
function activate(event: MouseEvent) {
  const anchor = event.currentTarget as HTMLAnchorElement
  const popupWindow = PopupWindow.open(anchor.target)
  const connection = PopupConnection.connect(popupWindow, {
    connectionId,
    popupOrigin,
  })

  void connection.navigate(anchor.href)
  if (popupWindow.opened) event.preventDefault()
}
```

`PopupWindow.open(target)` is one-shot and always attempts
`window.open('about:blank', target)`.
When the browser returns a usable handle, `PopupWindow` retains the exact
`WindowProxy` and the caller prevents native anchor navigation; only a later
`navigate(url)` chooses
the destination. When creation returns `null`, the caller leaves the same
activation's native anchor navigation untouched and `navigate` performs no
browser operation while that binding is pending. The application connection
binds only the popup whose initial private control authenticates for this
connection ID and configured origin.

The anchor must use that same unique nonreserved target rather than `_blank` and
must not request `noopener` or `noreferrer`: the MessagePort fallback needs its
opener relationship long enough to authenticate and transfer the carrier port.

The anchor is a compatibility hedge for an environment or embedding policy
which rejects scripted popup creation, not a second user flow. It must exist
before activation so the fallback proceeds in the same tap. Both paths use the
same target and create one script-closable top-level traversable. The scripted
path exposes `popup.closed` as an advisory signal; before fallback binding no
handle exists to observe. Closure is never delivery, cancellation, or another
caller-protocol outcome.

The application lifecycle object and both connection endpoints expose:

```ts
interface Message {
  readonly type: string
}

interface MessageType<M extends Message> {
  readonly type: M['type']
  decode(value: unknown): M
}

interface PopupWindow {
  readonly opened: boolean

  // Package-internal; PopupConnection.connect calls it after exact validation.
  bind(source: WindowProxy): void

  navigate(url: string): Promise<void>
  close(): Promise<void>
}

interface PopupConnection<M extends Message> {
  send(message: M): void
  on<N extends M>(
    message: MessageType<N>,
    handler: (message: N) => void,
  ): () => void
  navigate(url: string): Promise<void>
  close(): Promise<void>
}

type CarrierConstructor = (signal: AbortSignal) => Promise<Carrier>

interface PopupDiagnostic {
  readonly code: string
  readonly timestamp: number
  readonly durationMs?: number
  readonly count?: number
}

declare const PopupWindow: {
  open(target: string): PopupWindow
  current(): PopupWindow
}

declare const PopupConnection: {
  connect<M extends Message>(
    popupWindow: PopupWindow,
    options: {
      connectionId: string
      popupOrigin: string
      fallback?: CarrierConstructor
      onDiagnostic?: (event: PopupDiagnostic) => void
    },
  ): PopupConnection<M>

  accept<M extends Message>(
    popupWindow: PopupWindow,
    options: {
      connectionId: string
      allowedApplicationOrigins: readonly string[]
      fallback?: CarrierConstructor
      onDiagnostic?: (event: PopupDiagnostic) => void
    },
  ): Promise<PopupConnection<M>>
}
```

`PopupConnection` owns internal cancellation for each carrier attempt and for
the whole logical connection. Carrier selection, pending handshakes, signaling,
and race losers use those signals; `close()` aborts all of that work.
Cancellation machinery is not part of the public API.

`fallback` constructs one ordinary `Carrier` and is not another connection
abstraction. `connect` invokes a supplied constructor immediately so an
opener-independent carrier can arm signaling before navigation; it retains the
promise without producing an unhandled rejection. `accept` invokes its supplied
constructor only after MessagePort becomes unavailable. A carrier module may
perform synchronous, networkless destination bootstrap while producing that
constructor; in particular, the popup-side WebRTC factory consumes its private
navigation metadata before `accept` begins carrier selection. Connection passes
only its internal abort signal; the constructor closes over every
carrier-specific option. MessagePort selection aborts the current attempt's
pending fallback.
Before direct external navigation, the application starts a fresh fallback
attempt. Before popup-side navigation destroys an active WebRTC carrier, that
carrier privately requests and awaits the same preparation from the application
endpoint. Connection closure aborts every attempt.
If no constructor was supplied when fallback becomes necessary, connection
records stable code `fallback-unavailable` and closes.

`onDiagnostic` receives sanitized local events from construction onward. It is
advisory, may throw without affecting connection behavior, and initiates no
package-owned network or durable-storage work. Its data rules and measurement
catalog are defined by [metrics and diagnostics](../METRICS.md).

Higher-level popup logic supplies its composition-owned message union to
`PopupConnection<M>` and registers the union's classes and handlers.
Connection-owned lifecycle controls are decoded and consumed internally and
never reach caller handlers.

The transported implementation type is private:

```ts
type WireMessage<M extends Message> = M | PopupControl
```

Public `send` and `on` expose only `M`. `navigate` and `close` create the
controls. Their discriminators are reserved; sending or registering a caller
message with either discriminator rejects.

On the popup side, `navigate` coordinates carrier continuity and replaces the
current document, preserving or replacing the carrier internally as needed;
`close` closes the current popup and connection. Neither can create another
browsing context. On the application side, the same operations delegate to
`PopupWindow` for direct control or use the control messages described below
after isolation. Callers never manage carrier reconnection.

`send` accepts the composition-owned union `M` and is not a delivery
acknowledgement. Apart from rejecting reserved control discriminators, the
connection does not revalidate trusted local input.

`on` registers one message class and handler by `message.type` and returns an
unsubscribe function. Duplicate registrations reject. For each inbound carrier
value, the connection reads only a bounded string `type` from a plain record,
selects the registered `MessageType`, calls `decode` exactly once, and invokes
that handler. An unknown or unregistered type, malformed routing discriminator,
or thrown decode closes the connection and delivers no message. The registered
set therefore enforces participant direction without hardcoding protocol types
in the connection; the handler still enforces state and order.

`navigate` and `close` are application-endpoint controls defined by
[popup control](control.md). They use the exact retained `WindowProxy` while it
is available; after isolation severs direct control, they send their control
messages over the selected connection. `close` is idempotent and closes both
the logical connection and its popup. Internal failure cleanup releases
resources without invoking this operation or controlling popup lifetime.

`navigate` accepts a caller-selected opaque URL. It does not select the route or
interpret caller-owned fields:

- while direct control remains available, the application endpoint closes the
  current carrier, arms the next carrier attempt, and navigates its exact
  retained `WindowProxy`;
- after isolation severs direct control, the application endpoint sends
  `Navigate`; and
- the receiving popup preserves a transferable carrier or privately prepares a
  replacement for a non-transferable WebRTC carrier, then replaces its current
  document.

For WebRTC replacement, connection gives the caller-selected target unchanged
to the carrier's package-private preparation hook and navigates only to the
prepared target returned by that hook. Connection does not inspect or construct
the carrier's private navigation metadata. The destination's popup-side WebRTC
factory copies, validates, and clears that metadata before `accept` races its
returned constructor against MessagePort. Invalid metadata or preparation
rejects popup construction before carrier selection; preparation failure closes
the connection without navigation.

The first form may cross an arbitrary external document and wait for user
interaction because no native carrier is retained across that gap. The next
participating document establishes a new carrier. The connected form may
preserve a transferable port across the bounded replacements defined below.

The factory installs the appropriate operation from the native resource it
owns, never from the URL. A popup endpoint without the required carrier port
rejects rather than navigating and losing live state. The application endpoint
has no keeper, including a no-op implementation.

## Carriers

A carrier is a connection-internal adapter from native browser communication
resources to the common `send`, `on`, and `close` operations. It owns endpoint
authentication, establishment, delivery mechanics, and its nontransferable
native resources. Each carrier defines the endpoint identities it accepts and
returns an adapter only after authenticating both sides.

Connection selects and owns the resulting authenticated carrier for the current
popup document. A carrier does not interpret transported values, choose another
carrier, or navigate a document.

The browser-local [MessagePort carrier](message-port.md) is built in.
An explicitly supplied [WebRTC carrier](webrtc.md) constructor
provides the opener-independent fallback.

MessagePort is preferred while the popup retains its opener. WebRTC defines the
opener-independent fallback boundary when supplied; its exact signaling-service
contract is outside this specification.

### Carrier API

Each carrier module owns construction of its native browser resource and adapts
it to the same connection-internal delivery operations:

```ts
interface Carrier {
  send(value: Message): void
  on(handler: (value: unknown) => void): () => void
  close(): void
}

declare const prepareNavigation: unique symbol
declare const onReplacement: unique symbol

interface NavigationCarrier extends Carrier {
  [prepareNavigation](target: string): Promise<string>
  [onReplacement](handler: (carrier: Promise<Carrier>) => void): () => void
}
```

Local sends satisfy the base `Message` shape without making the carrier
understand the protocol. Received values remain `unknown`: they crossed a
remote browser boundary and become a concrete message only after the connection
selects and runs the registered `MessageType`.

The adapter does not own navigation policy. Connection retains a transferable
`MessagePort` only when navigation moves ownership; the WebRTC carrier retains
and closes its own peer and channel.

The two symbol-keyed hooks are package-private RTC lifecycle hooks, not caller
messages or public controls. On the selected application carrier, connection
registers one `onReplacement` handler and retains the authenticated carrier
promise it receives. On the popup carrier, connection calls
`prepareNavigation` with the caller-selected target and navigates only to the
prepared target it resolves. The RTC carrier internally starts and authenticates
the exact next signaling round, adds its private navigation metadata, and
reports the resulting replacement carrier without exposing any of those
mechanics to connection. The fresh popup-side WebRTC factory consumes that
metadata before selection. Each endpoint installs the resolved carrier for the
same logical connection. Any hook, constructor, timeout, metadata, or replacement
failure closes without navigation or caller delivery.

Only a carrier implementing both exact symbol-keyed functions supports this
path. MessagePort implements neither and uses `PortKeeper`. Callers cannot
invoke, register, or replace either hook.

### Selection

A fresh popup endpoint chooses one physical path for that document:

1. A usable retained opener completes the MessagePort carrier's exact
   source/origin authentication. Its native result is a `MessagePort`.
2. An absent, severed, invalid, or timed-out opener commits the configured
   fallback constructor and waits for its authenticated `Carrier`. The default
   unavailable fallback instead terminates.

Connection first attempts MessagePort. If the opener path is unavailable, it
commits the configured fallback. The application endpoint accepts the first
valid selection for that popup document; late authentication, signaling, or
values from another path are inert. An unexpected failed active carrier never
retries or migrates. A controlled document replacement may install a fresh
carrier under the same logical connection only after its replacement path is
prepared.

`send` always uses the selected authenticated carrier. Only MessagePort is
transferable: connection may preserve its selected native port, while an
established `RTCDataChannel` is never handed across navigation. WebRTC
replacement establishes a fresh authenticated carrier in the destination
through the already-armed exact signaling round.

## Continuity across navigations

Carrier continuity means that the logical connection can preserve one active
carrier while the popup replaces one participating document with another. It
does not preserve the old JavaScript heap or an `RTCDataChannel`. A current
carrier which cannot survive a document change is replaced transparently.

A transferable carrier may preserve its authenticated native resource across
an immediate participating-document replacement. A nontransferable carrier
instead prepares its replacement before navigation and installs it after the
destination authenticates. The caller observes neither mechanism and cannot
recover from continuity loss.

The [MessagePort carrier](message-port.md)
owns transferable-port preservation, its Service Worker bridge, timing, and
failure rules. The [WebRTC carrier](webrtc.md#private-navigation-preparation)
owns fresh-round preparation for its nontransferable data channel.

## Document-Isolation-Policy evolution

[Document-Isolation-Policy (DIP)](https://wicg.github.io/document-isolation-policy/)
can isolate a popup-owned cross-origin iframe without applying COOP/COEP to its
whole frame chain. With interoperable support, a non-isolated popup document
could retain its ordinary opener connection while isolated work runs in that
iframe. That would remove the top-level document replacement and its
connection-continuity machinery. It would not protect against an external page
which itself severs the opener with COOP, so the opener-independent carrier
remains a separate fallback.

DIP support is tracked by the [Chrome documentation](https://developer.chrome.com/blog/document-isolation-policy),
[Mozilla standards position](https://github.com/mozilla/standards-positions/issues/1074),
[Firefox implementation](https://bugzilla.mozilla.org/show_bug.cgi?id=2063367),
and [WebKit standards position](https://github.com/WebKit/standards-positions/issues/399).

Reconsider the popup topology only after Gecko and WebKit ship compatible
behavior and real-device tests confirm cross-origin isolation, shared-memory
WASM threads, cross-origin iframe messaging, asset policy, and mobile lifecycle
behavior. Without that qualification, top-level isolated work uses connection
continuity.

## Versioning

The package supplies one `ConnectionVersion` to both endpoints; there is no
runtime negotiation. Compatible implementation changes keep the version.
Breaking private authentication, carrier, signaling, framing, or continuity
controls increment it independently of every caller protocol.
