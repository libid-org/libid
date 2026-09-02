# @libid/popup

`@libid/popup` owns one popup browsing context from creation or adoption through
navigation and closure. It connects that popup to an application page across
origins, external navigation, isolation boundaries, mobile suspension, and
popup-document replacement, carrying caller-defined messages without owning or
naming the caller protocol.

The detailed design is split into the [popup connection](docs/connection.md),
its [MessagePort](docs/message-port.md) and [WebRTC](docs/webrtc.md) carriers,
and [popup control](docs/control.md).
Acceptance is indexed by the [test plan](TEST_PLAN.md), while
[metrics and diagnostics](METRICS.md) defines local observability.

## API

### Open the popup

The application creates a lifecycle object during the user activation. It then
constructs the connection before deciding whether to suppress the action's
native navigation:

```ts
const popupWindow = PopupWindow.open(anchor.target)
const connection = PopupConnection.connect<Messages>(popupWindow, {
  connectionId,
  popupOrigin,
  fallback,
  onDiagnostic,
})

void connection.navigate(anchor.href)
if (popupWindow.opened) event.preventDefault()
```

`PopupWindow.open(target)` synchronously attempts
`window.open('about:blank', target)` and returns a wrapper even when the browser
returns no handle. In that case the connection binds the popup created by the
same action's real anchor. See [popup creation and native-anchor
fallback](docs/connection.md#popup-creation-and-native-anchor-fallback).

```ts
interface PopupWindow {
  readonly opened: boolean
  navigate(url: string): Promise<void>
  close(): Promise<void>
}

declare const PopupWindow: {
  open(target: string): PopupWindow
  current(): PopupWindow
}
```

`PopupWindow.current()` wraps the current popup document, its opener, and its
Service Worker access. It adopts the existing popup and cannot create another
one.

### Connect from the popup

Each participating popup document accepts its side of the same logical
connection:

```ts
const popupWindow = PopupWindow.current()
const connection = await PopupConnection.accept<Messages>(popupWindow, {
  connectionId,
  allowedApplicationOrigins,
  fallback,
  onDiagnostic,
})
```

`PopupConnection` retains a usable carrier for as long as possible and may
preserve, transfer, or replace it transparently across document changes. If no
carrier can continue or be established, the logical connection fails closed.

```ts
interface PopupConnection<M extends Message> {
  send(message: M): void
  on<N extends M>(
    message: MessageType<N>,
    handler: (message: N) => void,
  ): () => void
  navigate(url: string): Promise<void>
  close(): Promise<void>
}
```

`navigate` and `close` control the same popup directly while possible and over
the connection after isolation. `close` releases both the connection and popup.

### Define and exchange messages

Each caller-owned message class supplies its discriminator and decoder:

```ts
interface Message {
  readonly type: string
}

interface MessageType<M extends Message> {
  readonly type: M['type']
  decode(value: unknown): M
}

class PopupReady implements Message {
  static readonly type = 'popup-ready'
  readonly type = PopupReady.type

  constructor(readonly version: number) {}

  static decode(value: unknown): PopupReady {
    assertPopupReady(value)
    return value
  }
}

type Messages = PopupReady

connection.on(PopupReady, ready => {
  // ready is PopupReady
})

connection.send(new PopupReady(1))
```

Higher-level popup logic combines these classes into its own union and supplies
that union to `PopupConnection`. Lifecycle controls remain internal and never
reach caller handlers.

### Diagnostics

Both connection constructors accept an optional local diagnostic sink:

```ts
interface PopupDiagnostic {
  readonly code: string
  readonly timestamp: number
  readonly durationMs?: number
  readonly count?: number
}
```

### Fallback carrier

The optional fallback is a carrier constructor supplied independently in every
participating document:

```ts
type CarrierConstructor = (signal: AbortSignal) => Promise<Carrier>

interface Carrier {
  send(value: Message): void
  on(handler: (value: unknown) => void): () => void
  close(): void
}
```

Omitting it starts no fallback work. If opener-based connection fails, the
connection terminates with the stable `fallback-unavailable` diagnostic. The
WebRTC application constructor closes over its own signaling and ICE
configuration. Its popup-side factory eagerly consumes package-owned navigation
metadata and returns the later constructor without starting RTC. Callers do not
manage carrier selection, replacement, or lifetime.
