# `@libid/popup` test plan

These tests qualify popup lifecycle, connection, carriers, continuity, and
control independently of any protocol transported by the package.

## API and message delivery

| ID | Assertion |
|---|---|
| POPUP-API-001 | A caller-defined message union is accepted by `PopupConnection<M>` without entering package-owned source, and `send` rejects the reserved `navigate` and `close-popup` discriminators. |
| POPUP-API-002 | `on` registers one class per discriminator, rejects duplicates, calls its static `decode` exactly once, returns the same decoded object, and unsubscribes only that handler. |
| POPUP-API-003 | Unknown, unregistered, malformed, or decoder-rejected input closes the connection and reaches no caller handler. |
| POPUP-API-004 | Concurrent connections keep message registrations, native resources, controls, and delivery isolated by connection ID. |

## Popup window and control

| ID | Assertion |
|---|---|
| POPUP-WINDOW-001 | `PopupWindow.open(target)` synchronously attempts one named `about:blank` popup and retains the returned `WindowProxy`; it creates no second browsing context. |
| POPUP-WINDOW-002 | When scripted opening returns `null`, the same activation's real anchor retains its navigation, and only an exact initial source/origin/version/connection binding marks the wrapper opened. |
| POPUP-WINDOW-003 | `_blank`, `noopener`, `noreferrer`, delayed synthetic activation, a wrong source, and an opaque sandbox origin cannot bind the native-anchor path. |
| POPUP-WINDOW-004 | Popup presentation as a window or tab changes no connection, storage, recovery, or control rule; `closed` remains advisory and never becomes a result. |
| POPUP-CONTROL-001 | While native-anchor binding is pending, `navigate` performs no browser operation and leaves the same activation's default navigation intact. Before isolation with a retained handle, `navigate` and `close` act on that popup directly and emit no control message. |
| POPUP-CONTROL-002 | After direct control is severed, `navigate` sends one exact canonical-HTTPS `Navigate` and invokes replacement only after carrier continuity is preserved or prepared; malformed, credentialed, noncanonical, relative, non-HTTPS, and unpreparable navigations fail before browser navigation. |
| POPUP-CONTROL-003 | After direct control is severed, `close` sends one `ClosePopup`, closes local resources, and is idempotent; only a package-created script-closable popup accepts it. |
| POPUP-CONTROL-004 | Controls are application-to-popup, one-shot per receiving document, unacknowledged, connection-bound, and private; wrong-direction, duplicate, replayed, unknown, and post-terminal controls perform no browser operation. `Navigate` may continue the logical connection in its destination, while `ClosePopup` terminates it. |

## Carrier authentication and selection

| ID | Assertion |
|---|---|
| POPUP-CONNECTION-001 | A carrier becomes selectable only after it authenticates both browser endpoints; origin, source, connection ID, connection version, and direction mismatches release no caller value. |
| POPUP-CONNECTION-002 | The popup selects the path for each participating document; the application never runs an independent first-promise-wins race. MessagePort becomes selectable on the application only after the popup's exact port acknowledgement. An absent, severed, or timed-out opener commits fallback, while an authentication failure is terminal. Installing a new document's authenticated carrier atomically closes the obsolete carrier; a failed active carrier never initiates fallback by itself. |
| POPUP-CONNECTION-003 | One logical connection survives repeated participating-document replacements: `navigate` preserves a usable carrier when possible and otherwise replaces it transparently; callers never manage carrier identity, count, lifetime, or reconnection. If no carrier can continue or be established, the connection fails closed. |
| POPUP-CONNECTION-004 | `connect` invokes a supplied fallback constructor exactly once with the connection-lifetime signal and observes its promise without awaiting it; `accept` invokes its constructor once only after MessagePort becomes unavailable. The constructor returns only an authenticated `Carrier`; connection creates no substitute `MessageChannel` and queues no caller value outside that carrier. MessagePort selection retains the unused application fallback. Direct external navigation arms only a fresh document-local MessagePort operation; popup-side navigation from RTC uses its package-private lifecycle hooks to prepare the target and retain a pending replacement before navigating, then installs only its authenticated result. Connection closure aborts every pending operation. |
| POPUP-CONNECTION-005 | Without a fallback constructor, successful MessagePort use emits no fallback diagnostic; fallback selection records exactly one sanitized `fallback-unavailable` failure and closes. |
| POPUP-CONNECTION-006 | Carrier loss, endpoint loss, popup closure, background suspension, and continuity loss are never delivery, cancellation, success, or recovery. Resumed delivery preserves order. |
| POPUP-CONNECTION-007 | Both constructors accept an exact lowercase RFC 4122 UUIDv4 `connectionId` and reject uppercase, noncanonical, malformed, wrong-version, and wrong-variant strings before carrier, keeper, or signaling work. Caller integration generates a different `crypto.randomUUID()` value for every logical connection and never reuses a retired value. |

## MessagePort and navigation continuity

| ID | Assertion |
|---|---|
| POPUP-PORT-001 | The popup initiates one private handshake; the application exact-checks source, origin, connection ID, connection version, and direction before transferring exactly one `MessagePort`. The popup validates the response and echoes the same handshake record over the ordered port. Only an exact final acknowledgement resolves the application operation and makes MessagePort selectable; missing, malformed, duplicate, or mismatched acknowledgement selects nothing. |
| POPUP-PORT-002 | The selected port carries ordered, nonduplicated structured-clone values. Delivery performs no serialization or allocation before the registered message decoder. |
| POPUP-KEEPER-001 | `keep` acknowledges only after the worker owns one exact purpose-tagged port; navigation begins only after that acknowledgement, and `claim` atomically transfers and removes it. |
| POPUP-KEEPER-002 | Duplicate, stale, expired, mismatched-version, mismatched-ID, malformed, or post-terminal keep/claim operations fail and close every reachable port; absence is the sole `null` claim. |
| POPUP-KEEPER-003 | Chromium, Firefox, and WebKit real or qualified emulation preserve the port across immediate same-origin document replacement below the common five-second deadline; no port or keeper survives a non-participating external document or unbounded wait, and expiry, worker termination, suspension, and process loss fail without recovery. |
| POPUP-KEEPER-004 | Continuity preserves an authenticated MessagePort unchanged. WebRTC and caller values never enter `PortKeeper`; it stores no caller value in a URL, request, cookie, IndexedDB, or other durable record. |

## WebRTC fallback

| ID | Assertion |
|---|---|
| POPUP-RTC-001 | The application constructor starts bounded one-use answerer round zero before the first popup navigation and keeps it armed across any number of MessagePort-selected documents until consumed, failed, abandoned, or connection closure. The destination popup constructor creates the offerer only after fallback selection. Each RTC replacement creates fresh peers, offer, answer, and ICE state under the same logical connection ID and exactly incremented round. |
| POPUP-RTC-002 | Signaling exact-checks endpoint origins, connection version, connection ID, unsigned 32-bit round, and role on every record; at most one round per connection ID is live, and its records are bounded, one-use, transient, and contain no caller message. Delayed offers, answers, candidates, and cleanup from round N are rejected after round N+1 starts. |
| POPUP-RTC-003 | Both peers use trickle ICE with configured STUN and one ordered reliable data channel without requiring mDNS, local-network permission, ICE gathering completion, or TURN. Direct-path failure closes the carrier. |
| POPUP-RTC-004 | The codec round-trips its closed JSON/`Uint8Array` value domain. Invalid UTF-8, JSON, byte tags, frame order or length, sparse or unsupported values, oversize, and buffer overflow reach no connection decoder. |
| POPUP-RTC-005 | MessagePort selection leaves an unused application answerer round armed and creates no popup peer. Abort, signaling failure, ICE failure, unexpected data-channel loss, or connection closure deletes the current round and closes every reachable peer and channel without reconnecting or resending. Only a fresh participating popup document or controlled RTC navigation may select or prepare an RTC carrier. |
| POPUP-RTC-006 | An RTC carrier exposes both exact package-private lifecycle symbols and no public navigation API. Popup-side `prepareNavigation(target)` sends `PrepareNavigation`; the selected application carrier internally starts exactly current round plus one, reports only its pending authenticated carrier through the one registered `onReplacement` handler, and sends `NavigationReady(nextRound)` only after its subscription is armed. The popup carrier returns the target with its private fragment field, after which connection may navigate and later install only the authenticated replacement carrier. Before `PopupConnection.accept`, the destination's popup WebRTC factory copies and clears the field and returns the later constructor without signaling. MessagePort selection therefore leaves no package field and starts no popup RTC peer. No round reaches connection, and neither lifecycle hook nor private control reaches `PopupControl`, caller handlers, the generic carrier value stream, or a MessagePort carrier. |
| POPUP-RTC-007 | Missing where required, duplicate, misplaced, malformed, noncanonical, negative, fractional, out-of-range, stale, unexpected, skipped, repeated, or overflowing navigation rounds fail without signaling, caller delivery, or browser navigation. Round metadata grants no authority without the exact connection ID. |
| POPUP-RTC-008 | Preparing and consuming `__libid_popup=rtc1.<round>.<had-fragment>` round-trips targets with no fragment, an empty fragment, ordinary fields, duplicate fields, preserved field order, mixed percent-escape spelling, encoded separators, and trailing separators without changing one caller byte. A caller-owned raw `__libid_popup` component rejects before navigation; invalid destination metadata clears the fragment and rejects before carrier selection. |

## Browser qualification

| ID | Assertion |
|---|---|
| POPUP-BROWSER-001 | Chromium, Gecko, and WebKit qualification covers Android, iOS, Linux, macOS, and Windows, including foreground popup work while the application tab is hidden or suspended. |
| POPUP-BROWSER-002 | Real-device qualification covers popup blocking, native-anchor fallback, browser promotion between popup and tab, background suspension, process eviction, and isolation severing the opener. Emulator-only results do not satisfy the corresponding real-device gate. |

## Diagnostics

| ID | Assertion |
|---|---|
| POPUP-DIAGNOSTIC-001 | Every emitted diagnostic contains only its stable package code, monotonic-derived timestamp, and any code-defined finite nonnegative duration or count; privacy-forbidden values and raw exceptions never reach the callback or console. |
| POPUP-DIAGNOSTIC-002 | A rejecting caller operation reports through rejection and the optional callback. An otherwise undeliverable asynchronous failure emits one sanitized `console.error` and optional callback event without network reporting, durable storage, retry, or caller result. Callback or console failure is inert. |
| POPUP-DIAGNOSTIC-003 | `fallback-unavailable` is absent when MessagePort succeeds and emitted exactly once only when fallback is selected without a constructor. An early supplied-constructor rejection remains observed and silent unless its path is selected. |
