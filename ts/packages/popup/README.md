# @libid/popup

`@libid/popup` connects an application page to one popup browsing context across
origins, external navigation, isolation boundaries, mobile suspension, and
immediate popup-document replacement. It carries caller-defined messages
without owning or naming a caller protocol. One logical connection installs a
fresh carrier in each participating popup document; no MessagePort is retained
through the external OAuth visit.

## API

The public API separates popup lifecycle from communication. The application
creates a `PopupWindow`, then gives it to its connection. The popup document
wraps its current window and does the same:

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

interface Message {
  readonly type: string
}

interface MessageType<M extends Message> {
  readonly type: M['type']
  decode(value: unknown): M
}

interface PopupWindow {
  readonly opened: boolean
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

interface Carrier {
  send(value: Message): void
  on(handler: (value: unknown) => void): () => void
  close(): void
}

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
  connect<M extends Message>(popupWindow: PopupWindow, options: {
    connectionId: string
    popupOrigin: string
    fallback?: CarrierConstructor
    onDiagnostic?: (event: PopupDiagnostic) => void
  }): PopupConnection<M>

  accept<M extends Message>(popupWindow: PopupWindow, options: {
    connectionId: string
    allowedApplicationOrigins: readonly string[]
    fallback?: CarrierConstructor
    onDiagnostic?: (event: PopupDiagnostic) => void
  }): Promise<PopupConnection<M>>
}
```

Omitting `fallback` starts no fallback work. If opener-based connection fails,
the connection terminates with the stable `fallback-unavailable` diagnostic. A
real WebRTC constructor closes over its own signaling and ICE configuration and
is supplied independently in each browser document.

`PopupWindow.open(target)` synchronously attempts
`window.open('about:blank', target)` and returns a wrapper even when the browser
returns no handle. The application connection binds that native-anchor fallback
internally. Its `navigate` leaves a pending native-anchor fallback to the same
activation, uses direct popup control when a handle is available, and uses
connection control after isolation. `PopupWindow.current()` wraps the popup
document, its opener, and its
Service Worker access. The popup-side connection exposes the same operations
for that window but cannot create another popup.

Each message is one class that supplies its transported discriminator and
static decoder:

```ts
class PopupReady implements Message {
  static readonly type = 'popup-ready'
  readonly type = PopupReady.type

  constructor(readonly version: number) {}

  static decode(value: unknown): PopupReady {
    assertPopupReady(value)
    return value
  }
}

type Messages = PopupReady // Add other composition-owned message classes here.

popupConnection.on(PopupReady, ready => {
  // ready is PopupReady
})

popupConnection.send(new PopupReady(1))
```

Higher-level popup logic combines these classes into its own union and supplies
that union to `PopupConnection`. No protocol-wide union becomes part of this
package. Lifecycle controls are consumed internally and never reach caller
handlers.

The caller keeps a real action-specific anchor as a native fallback when
`window.open()` returns no handle. `PopupConnection.connect` synchronously arms
binding before the activation handler returns; see [popup creation and native-anchor
fallback](CONNECTION.md#popup-creation-and-native-anchor-fallback).

See [popup connection](CONNECTION.md) for the complete boundary and lifecycle,
the [MessagePort carrier](CONNECTION-MESSAGEPORT.md) for the preferred path, the
[WebRTC carrier](CONNECTION-WEBRTC.md) for opener-independent fallback, and
[popup control](CONTROL.md) for navigation and closure. Package acceptance is
indexed by the [test plan](TEST_PLAN.md), and its local observability boundary
is defined by [metrics and diagnostics](METRICS.md).

## Browser evolution

MessagePort is preferred while the popup retains its opener. An explicitly
supplied WebRTC implementation defines the opener-independent fallback
boundary; its signaling-service wire contract is outside the current
specification.

[Document-Isolation-Policy](CONNECTION.md#document-isolation-policy-evolution)
can remove top-level isolated-document replacement where browser support and
real-device qualification satisfy the connection constraints.
