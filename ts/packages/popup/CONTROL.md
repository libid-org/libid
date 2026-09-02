# Popup control

This document defines the control protocol by which an application asks its
connected popup to navigate or close itself.
It is independent of caller protocols: navigation and popup lifetime are
composition decisions, not protocol results.

## Rationale

A popup may become a top-level cross-origin-isolated document. Its COOP policy
may sever the application's `WindowProxy`, so later
`popup.location.replace(...)` and `popup.close()` calls are not reliable.
The isolated popup can still navigate or close itself, and its selected
connection remains usable across the browsing-context-group split. Once direct
`WindowProxy` control is severed, popup control carries the application
decision over that connection and executes it inside the popup. It requires no
app-origin return, second popup, or observation of `WindowProxy.closed`.

## Records

```ts
interface Navigate {
  type: 'navigate'
  url: string
}

interface ClosePopup {
  type: 'close-popup'
}

type PopupControl = Navigate | ClosePopup
```

These discriminators are connection-reserved. They cannot appear in a
composition-owned message union or caller registration.

Each discriminator is its own compatibility boundary. An incompatible shape or
semantic change introduces a new message and decoder rather than a shared
protocol-version field. Unknown controls fail closed.

Both records are application-to-popup only. The receiver exact-validates a
plain record, discriminator, field set, and version before acting. A navigation
URL must equal the serialization of an absolute HTTPS URL with no credentials.
Relative, non-HTTPS, malformed, and noncanonical URLs fail closed. Connection
owns the generic message bound.

## Execution

The application-facing operations are `PopupConnection.navigate(url)` and
`PopupConnection.close()`.

While direct control is available, `navigate` uses the exact retained
`WindowProxy`. After isolation severs it, the application endpoint sends
`Navigate` over the selected connection; the receiving popup stops
accepting controls and calls `location.replace(url)`. Replacement avoids adding
the current document to popup history. It creates no browsing context and does
not promise connection continuity into the destination. The caller commits its
state and clears sensitive inputs before requesting navigation.

While direct control is available, `close` calls `close()` on the exact retained
`WindowProxy`. After isolation severs it, `close` sends `ClosePopup` over the
selected connection. It then closes the logical connection and releases its
local resources. The receiving popup stops accepting controls and calls
`window.close()` on itself. The composition MUST expose and invoke
this operation only for a separate top-level traversable created by
`window.open()` or an activated link. Both creation paths produce a
script-closable traversable, including when the browser presents it as a tab,
and that property survives provider navigation and a COOP browsing-context
group switch. A same-tab or full-page presentation MUST NOT send
`ClosePopup`. This is a window-creation invariant; there is no reliable post-COOP
runtime probe for script closability.

The first accepted popup control is terminal and one-shot. A duplicate,
replay, race loser, unknown control, wrong-direction record, or record on another
connection performs no browser operation. A caller protocol may reject later
values while retaining the connection solely for this one control; popup control
never revives or changes its result.

Neither control message has a remote acknowledgement. Navigation can destroy
the receiver and COOP prevents the application from reliably observing either
browser action. Each promise therefore means only that the direct browser
operation was invoked or the local connection accepted its control for ordered
delivery. The composition must commit the authoritative successor state before
acting and treat connection loss or an unavailable popup as neither success,
cancellation, nor proof of delivery.

## Security boundary

- Only the application endpoint of the selected connection can send a control;
  cookies, URLs, storage, opener state, and caller payload fields cannot
  authorize one.
- The connection binding prevents one concurrent operation from
  controlling another popup.
- Popup control carries no caller credential, result, or durable state.
- A caller-protocol value never selects a destination. Only the independently
  decoded `Navigate` control can do so.
- Failure cleanup remains resource-only and never synthesizes `ClosePopup`
  or calls `window.close()`; only an explicit application-side `close()` does.
