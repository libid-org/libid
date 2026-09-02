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
navigation controls but assigns neither caller-level semantics.

A popup endpoint constructed from `PopupWindow.current()` and an immutable
target-origin set sends the MessagePort carrier's private handshake before
carrier selection. Its connection ID and connection version are correlation
metadata, not capabilities or caller values. The application endpoint validates
and consumes that control without exposing it to caller code.

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
the connection closes that carrier, synchronously arms a replacement attempt,
and retains its bound popup browsing context and any idle fallback subscription.
The next participating popup document calls `accept` and installs the selected
carrier under the same logical connection. These mechanics are transparent to
the caller.

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
constructor only after MessagePort becomes unavailable. Connection passes only
its internal abort signal; the constructor closes over every carrier-specific
option. MessagePort selection aborts the current attempt's pending fallback.
Before direct external navigation starts the next carrier attempt, the
application invokes the supplied constructor again so opener-independent
signaling is armed before the provider visit. Connection closure aborts it.
If no constructor was supplied when fallback becomes necessary, connection
records stable code `fallback-unavailable` and closes.

`onDiagnostic` receives sanitized local events from construction onward. It is
advisory, may throw without affecting connection behavior, and initiates no
package-owned network or durable-storage work. Its data rules and measurement
catalog are defined by [metrics and diagnostics](METRICS.md).

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
[popup control](CONTROL.md). They use the exact retained `WindowProxy` while it
is available; after isolation severs direct control, they send their control
messages over the selected connection. `close` is idempotent and closes both
the logical connection and its popup. Internal failure cleanup releases
resources without invoking this operation or controlling popup lifetime.

`navigate` accepts a caller-selected opaque URL. It never parses or builds
that URL:

- while direct control remains available, the application endpoint closes the
  current carrier, arms the next carrier attempt, and navigates its exact
  retained `WindowProxy`;
- after isolation severs direct control, the application endpoint sends
  `Navigate`; and
- the receiving popup calls `keep` for its carrier port, awaits worker
  ownership, and replaces its current document.

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

The browser-local [MessagePort carrier](CONNECTION-MESSAGEPORT.md) is built in.
An explicitly supplied [WebRTC carrier](CONNECTION-WEBRTC.md) constructor
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
```

Local sends satisfy the base `Message` shape without making the carrier
understand the protocol. Received values remain `unknown`: they crossed a
remote browser boundary and become a concrete message only after the connection
selects and runs the registered `MessageType`.

The adapter does not own navigation policy. Connection retains a transferable
`MessagePort` only when navigation moves ownership; the WebRTC carrier retains
and closes its own peer and channel.

### Selection

A fresh popup endpoint chooses one physical path for that document:

1. A usable retained opener completes the MessagePort carrier's exact
   source/origin authentication. Its native result is a `MessagePort`.
2. An absent, severed, invalid, or timed-out opener commits the configured
   fallback. With WebRTC, there is no carrier yet because the next document
   navigation would destroy it. Connection creates a local `MessageChannel`
   and queues the first opaque outbound value on one endpoint. The default
   unavailable fallback instead terminates before navigation.

Connection first attempts MessagePort. If the opener path is unavailable, it
commits the configured fallback. The application endpoint accepts the first
valid selection for that popup document; late authentication, signaling, or
values from another path are inert. A failed active carrier never migrates, but
a later participating document selects a fresh carrier under the same logical
connection.

In the MessagePort path, `send` uses the selected native port. In fallback, it
queues one value on the connection-owned local port. Connection neither identifies
nor parses that value.

Only MessagePort is transferable:

- connection preserves a selected MessagePort as the active carrier resource;
- WebRTC fallback uses a connection-created `MessageChannel` only to carry the
  queued value to the destination document; and
- an established `RTCDataChannel` is never handed across navigation.

The destination endpoint consumes the fallback value, establishes the WebRTC
carrier through the already-started signaling subscription, and forwards that
unchanged value first.

## Carrier continuity across document navigation

Carrier continuity means that the logical connection can preserve one active
carrier while the popup replaces one participating document with another. It
does not preserve the old JavaScript heap or an `RTCDataChannel`. A current
carrier which cannot survive a document change is replaced transparently.

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

These are observations, not guaranteed browser contracts. Connection uses one
conservative `CARRIER_CLAIM_TIMEOUT_MS = 5_000` across engines, below the
observed WebKit boundary. Connection does not sniff the user agent or select a
browser-specific deadline. Suspension, process loss, memory pressure, or
expiry may still break continuity; failure is terminal and never selects a
weaker path.

### Internal PortKeeper API

`PortKeeper` is the connection's package-private continuity component. It
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
operations. `keep` resolves only after the worker owns the exact
port, after which connection may replace the source document. `claim` atomically
returns and removes the unchanged purpose and port, or returns `null` when no
entry exists. `null` authenticates and selects nothing; popup construction
continues with its available browser resources. For MessagePort, a returned port
is the selected carrier endpoint. For WebRTC fallback, it contains the one
queued value used before the destination establishes its data channel.

The two acknowledged calls are necessary because the worker must own the port
before the source document destroys itself and the destination document does
not yet exist. The Service Worker record and control-message encoding are
implementation details. Connection version, connection ID, purpose bounds,
transferable count, duplicate ownership, expiry, and one-use claim are checked
before ownership changes. A malformed, mismatched, duplicate, or post-terminal
record rejects and closes every reachable port; absence is the sole `null`
result. Worker loss or a failed `keep` acknowledgement prevents navigation with
live state. No `BroadcastChannel`, cookie, IndexedDB record, request, or URL
carries the port, purpose, or queued value.

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
