# Popup transport

Part of the [libID protocol specification](libid.md).

Status: proposed normative specification of the browser transport beneath
libID's popup-based protocols.

## 1. Scope

This document is the normative owner of the logical connection between an
application document and a sequence of popup documents: how endpoints are
identified and allowlisted, what a message is, what delivery guarantees a
protocol above may rely on, how navigation and closure behave, what
continuity is guaranteed across popup-document replacement, and how failure
is reported. A protocol layered on this transport cites these rules instead
of restating browser mechanics.

It does not own the wire format of any carrier (the MessagePort handshake,
the Service Worker port keeper, WebRTC signaling), the programming interface
of an implementation, its diagnostic catalog, or any protocol carried over
the connection. Those belong to the implementation, currently
[`@libid/popup`](../ts/packages/popup/README.md), and to the protocols above.

## 2. Terminology

Application Document: The top-level document that creates or adopts the popup
   and holds the long-lived Application Endpoint.

Popup: The one separate top-level browsing context the Application Document
   creates during a user activation, by script or through the same
   activation's anchor. It is script-closable and remains so across
   navigation and a browsing-context-group switch.

Participating Document: A document shown in the Popup which runs a Popup
   Endpoint for the Logical Connection.

Non-participating Document: Any other document shown in the Popup, such as an
   identity-platform consent page.

Logical Connection: One bidirectional channel between the Application
   Endpoint and the current Popup Endpoint, identified by one Connection ID
   and surviving Participating Document replacement.

Connection ID: The caller-supplied identifier of one Logical Connection
   (§5). It correlates endpoints; it is not a capability.

Application Endpoint: The connection endpoint in the Application Document.
   It lives for the Logical Connection and may see several Participating
   Documents.

Popup Endpoint: The connection endpoint in one Participating Document. Each
   Participating Document constructs its own.

Origin Allowlist: The immutable set of origins an endpoint accepts as its
   peer: the Application Endpoint's popup origins and the Popup Endpoint's
   application origins (§6).

Carrier: The native browser channel the Logical Connection currently uses.
   The transport selects one authenticated Carrier per Participating Document;
   Carrier identity is not observable above the transport.

Fallback Carrier: An optional Carrier that does not need the opener
   relationship, supplied by deployment configuration in every document.

Caller Message: A value a protocol above sends over the Logical Connection.

Control: One of the two transport-owned messages, `navigate` and
   `close-popup`, sent only by the Application Endpoint.

Direct Control: The Application Document's ability to navigate or close the
   Popup through its retained window handle while that handle is usable.

Isolation: A Participating Document whose opener policy severs the Popup's
   relationship to the Application Document on load.

Continuity: Preservation of the current Carrier across the replacement of one
   Participating Document by another.

## 3. Assumptions

- ASM-POPUP-01:
  The user agent stamps every cross-document message with the sender's
  origin and source window, and neither can be forged by page script.
- ASM-POPUP-02:
  A browsing-context-group switch caused by an opener policy severs the
  opener relationship in the new document and makes the previously retained
  window handle report closed in the Application Document.
- ASM-POPUP-03:
  A Service Worker serves only documents of its own origin, and a
  Participating Document can reach the active worker whose scope matches its
  URL without being controlled by it.
- ASM-POPUP-04:
  Structured clone preserves plain records, arrays, strings, numbers,
  booleans, and byte arrays across documents without reinterpretation.
- ASM-POPUP-05:
  A popup created by `window.open` or by an activated anchor with a valid
  named target is a separate top-level traversable that script may close,
  whether the user agent presents it as a window or a tab.

## 4. Security properties

The properties below hold against a hostile Non-participating Document, a
hostile document on an origin outside the allowlist holding a reference to either
window, and a hostile peer that learned the Connection ID. They assume an
unmodified implementation and user agent (ASM-POPUP-01).

- SP-POPUP-01:
  Only a document on an origin in the peer's Origin Allowlist becomes an
  endpoint of the Logical Connection, and only after the transport has
  authenticated both browser-stamped origins. Depends on ASM-POPUP-01.
- SP-POPUP-02:
  One Logical Connection binds at most one Popup browsing context. A
  document in another window cannot bind, select, replace, or control it,
  whatever it knows.
- SP-POPUP-03:
  Caller Messages travel only over the authenticated Carrier. No cookie,
  storage, URL, request, or continuity record ever carries one.
- SP-POPUP-04:
  Only the Application Endpoint can navigate or close the Popup through the
  Logical Connection. No Caller Message, URL, or storage value selects a
  destination or closes the Popup.
- SP-POPUP-05:
  Loss of a Carrier, an endpoint, the Popup, or Continuity is never observed
  as delivery, success, denial, cancellation, or recovery by the protocol
  above.
- SP-POPUP-06:
  Knowledge of the Connection ID grants at most denial of progress, and only
  to a document that already holds a reference to an endpoint window.

## 5. Connection identity

- REQ-POPUP-ID-01:
  A Connection ID MUST match the canonical lowercase RFC 4122 UUIDv4 grammar
  `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`.
  An implementation MUST reject any other spelling before any carrier,
  continuity, or signaling work and MUST NOT normalize case or format.
- REQ-POPUP-ID-02:
  The protocol above MUST generate each Connection ID with a
  cryptographically secure random source, MUST use a fresh value for every
  Logical Connection, and MUST NOT reuse a value after failure or closure.
  The transport keeps no durable registry of used values.
- REQ-POPUP-ID-03:
  Every Participating Document of one Logical Connection MUST receive the
  same exact Connection ID. How it reaches the document is owned by the
  protocol above.
- REQ-POPUP-ID-04:
  An implementation MUST use the Connection ID only for correlation and
  authentication of its own controls. It MUST NOT treat possession of the
  ID as authority and MUST NOT expose it to the protocol above through
  transported values.

## 6. Origin allowlists and binding

- REQ-POPUP-ALLOW-01:
  Each endpoint MUST be constructed with a nonempty Origin Allowlist of
  canonical HTTPS origins without duplicates. An empty set or a malformed,
  noncanonical, non-HTTPS, credentialed, or repeated member MUST be rejected
  before any carrier work.
- REQ-POPUP-ALLOW-02:
  An endpoint MUST accept a peer only when the peer's browser-stamped origin
  is a member of its Origin Allowlist, and MUST bind that exact observed origin
  for the life of the resulting Carrier. Sequential Participating Documents
  MAY bind different members.
- REQ-POPUP-ALLOW-03:
  The Application Endpoint MUST accept peer traffic only from the window it
  created or, on the native-anchor path, from the one window whose first
  exact authentication it accepted. The Popup Endpoint MUST accept peer
  traffic only from its opener.
- REQ-POPUP-ALLOW-04:
  A Carrier MUST become selectable only after both endpoints have
  authenticated each other. A mismatch of origin, source, Connection ID,
  transport version, or direction MUST select nothing and release no value.
- REQ-POPUP-ALLOW-05:
  An event that does not carry the transport's own authentication
  discriminator together with this Connection ID is not an authentication
  attempt and MUST be ignored. In particular, a valid attempt for another
  Connection ID and any message a Non-participating Document sends to the
  Application Document MUST NOT affect the Logical Connection.
- REQ-POPUP-ALLOW-06:
  When scripted creation returns no handle, the Application Endpoint MUST
  bind the Popup created by the same activation's anchor only through the
  exact initial authentication of §6, and MUST perform no browser operation
  on the Popup until that binding completes. The anchor MUST carry a valid,
  unique named target and MUST NOT request `noopener` or `noreferrer`.

## 7. Message model

- REQ-POPUP-MSG-01:
  A Caller Message is a plain record with a string `type` of 1 to 64 UTF-16
  code units. The transport reads only `type` for routing and never
  interprets any other field.
- REQ-POPUP-MSG-02:
  The discriminators `navigate` and `close-popup` are reserved for Controls.
  A protocol above MUST NOT send or register either; an implementation MUST
  reject the attempt synchronously.
- REQ-POPUP-MSG-03:
  A protocol above registers, per discriminator, exactly one decoder and
  handler. For each inbound value the transport MUST select the registered
  decoder by `type`, call it exactly once, and deliver the decoded message
  to its handler. Duplicate registration MUST be rejected.
- REQ-POPUP-MSG-04:
  An inbound value that is not a plain record, whose `type` is not a
  registered discriminator, or whose decoder throws MUST fail the Logical
  Connection and reach no handler. The registered set therefore fixes the
  accepted direction of each message; ordering and protocol state remain the
  handler's responsibility.
- REQ-POPUP-MSG-05:
  A protocol above MUST register its handlers before yielding to the event
  loop after obtaining its endpoint. The transport delivers inbound values
  as later tasks and MUST NOT queue a value for a handler registered later.
- REQ-POPUP-MSG-06:
  Sending without a selected Carrier, or after closure, MUST fail
  synchronously. The transport MUST NOT queue Caller Messages outside a
  Carrier.
- REQ-POPUP-MSG-07:
  Values are transported by structured clone. The transport MUST NOT add
  encoding, normalization, or copies for its built-in Carrier, and MUST
  deliver the received object itself to the decoder. A Fallback Carrier MAY
  publish a value-domain and size bound, which the protocol above MUST
  respect.

## 8. Delivery guarantees

- REQ-POPUP-DELIVER-01:
  Over one selected Carrier, Caller Messages are delivered in send order and
  at most once.
- REQ-POPUP-DELIVER-02:
  No Caller Message is delivered before both endpoints have authenticated
  (REQ-POPUP-ALLOW-04), and every Caller Message stays behind that
  authentication on the ordered channel.
- REQ-POPUP-DELIVER-03:
  Sending is not an acknowledgement. The transport provides no delivery
  receipt for Caller Messages or Controls.
- REQ-POPUP-DELIVER-04:
  Background suspension of either document MAY delay delivery. It is not
  success, cancellation, or a reason to select another Carrier; delivery
  after resumption preserves order.
- REQ-POPUP-DELIVER-05:
  Carrier loss MAY be silent. A Caller Message sent into a lost Carrier
  succeeds locally and is lost. The protocol above MUST derive outcomes only
  from messages it receives.

## 9. Lifecycle, navigation, and control

- REQ-POPUP-LIFE-01:
  A Logical Connection has one Application Endpoint and, for each
  Participating Document, a fresh Popup Endpoint. The Popup Endpoint selects
  exactly one Carrier for its document; the Application Endpoint installs
  the Carrier the Popup Endpoint authenticated, replacing any earlier one.
- REQ-POPUP-LIFE-02:
  The Popup Endpoint MUST prefer a preserved Carrier (§10), then the opener
  path, then the Fallback Carrier. An absent or closed opener, or an opener
  that does not answer within the implementation's published deadline,
  commits the fallback. An authentication failure is terminal and MUST NOT
  select a weaker path. Without a Fallback Carrier, an unreachable opener
  fails the Logical Connection.
- REQ-POPUP-CONTROL-01:
  Controls travel from the Application Endpoint to the Popup Endpoint only.
  A Control received by the Application Endpoint MUST fail the Logical
  Connection. Controls carry no Caller Message, credential, or result.
- REQ-POPUP-CONTROL-02:
  The first accepted Control is terminal for the receiving Participating
  Document. A later, duplicate, replayed, unknown, or malformed Control MUST
  perform no browser operation.
- REQ-POPUP-CONTROL-03:
  A navigation destination MUST be the serialization of an absolute HTTPS
  URL without credentials. Both the sender and the receiver MUST reject any
  other value before any browser operation. The transport does not
  interpret the destination.
- REQ-POPUP-CONTROL-04:
  Application-side navigation: with a selected Carrier the Application
  Endpoint MUST send `navigate` over it; without one it MUST use Direct
  Control only while its retained handle is non-null and does not report
  closed; while native-anchor binding is pending it MUST perform no browser
  operation; otherwise it MUST reject.
- REQ-POPUP-CONTROL-05:
  Popup-side navigation acts locally and sends no Control. Either path on
  the popup side MUST prepare Continuity where §10 applies, then replace the
  current document without adding a history entry and without creating a
  browsing context.
- REQ-POPUP-CONTROL-06:
  Closure from the Application Endpoint MUST close the Popup through Direct
  Control while the handle is usable and otherwise send `close-popup` over
  a selected Carrier, then release the Logical Connection. A Popup Endpoint
  receiving `close-popup`, or closing itself, MUST release the connection
  and close its own window. Closure is idempotent.
- REQ-POPUP-CONTROL-07:
  A protocol above MUST invoke closure only for a Popup created as in
  ASM-POPUP-05. A same-tab or full-page presentation MUST NOT be closed
  through the transport; there is no reliable runtime probe for
  closability after Isolation.
- REQ-POPUP-LIFE-03:
  Navigation to a Non-participating Document leaves the Application
  Endpoint without a usable Carrier until the next Participating Document
  authenticates, and the Application Endpoint cannot observe that window.
  Caller Messages and Controls sent meanwhile succeed locally and are lost;
  closure still uses Direct Control while the handle is usable.
- REQ-POPUP-LIFE-04:
  Any navigation of the Popup outside the transport's own operation loses
  the current Carrier. A later Participating Document MAY establish a fresh
  Carrier under the same Logical Connection; nothing is recovered.
- REQ-POPUP-LIFE-05:
  A Participating Document under Isolation has no opener. It MUST obtain its
  Carrier through Continuity (§10) or the Fallback Carrier. A cross-origin
  destination under Isolation therefore requires a Fallback Carrier;
  without one the Logical Connection fails closed.
- REQ-POPUP-LIFE-06:
  Closing the Logical Connection MUST abort every pending authentication,
  continuity, and fallback operation of that connection.

## 10. Continuity

- REQ-POPUP-CONT-01:
  Continuity applies only to a transport-initiated replacement of one
  Participating Document by another on the same origin. The implementation
  MUST publish the bound within which the destination must begin accepting,
  and the destination MUST construct its Popup Endpoint before any other
  network work.
- REQ-POPUP-CONT-02:
  A preserved Carrier is the same authenticated channel: the Application
  Endpoint observes no replacement, no re-authentication occurs, and every
  Caller Message already sent stays in order ahead of later ones.
- REQ-POPUP-CONT-03:
  When the same-origin destination does not resolve the same active
  continuity owner as the source, or the bound expires, the destination
  finds nothing and proceeds as a fresh Participating Document under
  REQ-POPUP-LIFE-02.
- REQ-POPUP-CONT-04:
  A cross-origin replacement, including a cross-site one, MUST NOT attempt
  Continuity. The source Popup Endpoint retires and the destination
  authenticates a fresh Carrier. The Connection ID and the registrations of
  the protocol above are unchanged; REQ-POPUP-LIFE-03 applies until the
  destination authenticates.
- REQ-POPUP-CONT-05:
  If Continuity cannot be prepared for a replacement that requires it, the
  transport MUST reject before navigating and MUST NOT navigate with live
  state.
- REQ-POPUP-CONT-06:
  No Continuity mechanism MAY carry a Caller Message, and none MAY persist
  beyond its bound or across a Non-participating Document.

## 11. Failure semantics

- REQ-POPUP-FAIL-01:
  An observed failure MUST release the endpoint's reachable resources and
  release no later value. It MUST NOT synthesize a Control, close the Popup,
  or select a weaker Carrier.
- REQ-POPUP-FAIL-02:
  An operation the protocol above invoked reports failure through that
  operation. A failure with no invoking operation is reported only through
  the implementation's local diagnostics.
- REQ-POPUP-FAIL-03:
  Diagnostics MUST NOT contain an origin, URL, Connection ID, message
  discriminator, transported value, or raw exception, and MUST NOT leave
  the device through the transport.

## 12. Conformance

Roles: Application Endpoint, Popup Endpoint. An implementation claiming the
transport MUST pass the vectors below for both roles. The reference
implementation's test plan indexes them as the POPUP-API, POPUP-WINDOW,
POPUP-CONTROL, and POPUP-CONNECTION rows; carrier-internal rows are outside
this specification.

- TEST-POPUP-01 (exercises REQ-POPUP-ID-01):
  Uppercase, noncanonical, wrong-version, wrong-variant, and malformed
  Connection IDs are rejected before any carrier work.
- TEST-POPUP-02 (exercises REQ-POPUP-ALLOW-01, REQ-POPUP-ALLOW-02):
  An empty set or a duplicate, non-HTTPS, noncanonical, or credentialed
  member is rejected; a peer on an origin outside the allowlist never becomes
  an endpoint; sequential Participating Documents on two allowlisted origins bind
  under one Logical Connection.
- TEST-POPUP-03 (exercises REQ-POPUP-ALLOW-03, REQ-POPUP-ALLOW-04, REQ-POPUP-ALLOW-05):
  Wrong source, origin, version, or direction selects nothing; a valid
  attempt for another Connection ID and unrelated traffic from the Popup
  are ignored; two concurrent Logical Connections on one page never reject
  each other.
- TEST-POPUP-04 (exercises REQ-POPUP-ALLOW-06):
  With scripted creation blocked, the activation's anchor creates the Popup
  and only the exact initial authentication binds it; `noopener` and an
  origin outside the allowlist never bind.
- TEST-POPUP-05 (exercises REQ-POPUP-MSG-01 to REQ-POPUP-MSG-07):
  Reserved discriminators and duplicate registrations are rejected; the
  decoder runs exactly once and its object is delivered; unknown, malformed,
  and decoder-rejected input fails the connection and reaches no handler;
  sending without a Carrier fails synchronously and queues nothing.
- TEST-POPUP-06 (exercises REQ-POPUP-DELIVER-01 to REQ-POPUP-DELIVER-05):
  Values arrive in order and once; nothing arrives before mutual
  authentication; a closed peer delivers nothing and produces no outcome.
- TEST-POPUP-07 (exercises REQ-POPUP-CONTROL-01 to REQ-POPUP-CONTROL-06, REQ-POPUP-LIFE-06):
  Controls are application-to-popup and one-shot; malformed destinations
  fail before any browser operation; navigation uses the Carrier when
  selected and Direct Control otherwise; closure works directly with a
  usable handle and over the Carrier after Isolation, and is idempotent.
- TEST-POPUP-08 (exercises REQ-POPUP-LIFE-02, REQ-POPUP-LIFE-05):
  A document without opener and without a Fallback Carrier fails closed
  exactly once; an authentication failure never commits the fallback; a
  Fallback Carrier is used only after the opener path is unavailable.
- TEST-POPUP-09 (exercises REQ-POPUP-CONT-01 to REQ-POPUP-CONT-03, REQ-POPUP-LIFE-03):
  In each supported engine, a same-origin replacement into and out of
  Isolation preserves one Carrier within the published bound; a
  Non-participating Document beyond the bound loses it and the next
  Participating Document re-authenticates.
- TEST-POPUP-10 (exercises REQ-POPUP-CONT-04, REQ-POPUP-CONT-05, REQ-POPUP-LIFE-05):
  A cross-site replacement re-authenticates over the opener without
  attempting Continuity; a cross-site destination under Isolation without a
  Fallback Carrier fails closed; a replacement whose Continuity cannot be
  prepared rejects before navigating.

## 13. Security considerations

- The Connection ID appears in the Popup's URL under most protocols above
  and reaches every Non-participating Document the Popup visits. By
  REQ-POPUP-ALLOW-05 such a document can neither bind nor deliver; by
  SP-POPUP-06 the worst it can do is terminate the connection, which it
  could also do by never returning.
- Origin Allowlists are deployment configuration. Listing an origin that
  serves attacker-controlled documents accepts that attacker as a peer; the
  transport cannot distinguish them.
- Direct Control depends on the retained handle reporting closed after a
  browsing-context-group switch (ASM-POPUP-02). An engine that violated this
  would navigate a discarded context, a silent no-op, never a wrong window.
- Continuity hands an authenticated channel to a same-origin worker for a
  bounded time. Any same-origin document that knows the Connection ID could
  claim it within that bound; same-origin documents are already inside the
  trust boundary of the Participating Document.
- Nothing in this transport authenticates the user, the protocol above, or
  the outcome of anything the Popup did; it authenticates only which
  documents are talking.

## 14. Provenance

Each requirement traces to the implementation documents it was extracted
from; those documents keep the mechanics.

| Requirement | Source |
|---|---|
| REQ-POPUP-ID-01 to ID-04 | connection.md, Connection ID |
| REQ-POPUP-ALLOW-01, ADMIT-02 | connection.md, API (`allowedPopupOrigins`, `allowedApplicationOrigins`) |
| REQ-POPUP-ALLOW-03 to ADMIT-05 | message-port.md, Failure and security invariants; Authentication |
| REQ-POPUP-ALLOW-06 | connection.md, Popup creation and native-anchor fallback |
| REQ-POPUP-MSG-01 to MSG-07 | connection.md, `send` and `on` rules; message-port.md, Message delivery |
| REQ-POPUP-DELIVER-01 to DELIVER-05 | connection.md, Failure and security rules; message-port.md, invariants |
| REQ-POPUP-LIFE-01, LIFE-02 | connection.md, Selection |
| REQ-POPUP-CONTROL-01 to CONTROL-07 | control.md, Records; Execution; Security boundary |
| REQ-POPUP-LIFE-03 to LIFE-06 | connection.md, navigate rules; Continuity across navigations |
| REQ-POPUP-CONT-01 to CONT-06 | connection.md, Continuity across navigations; message-port.md, Continuity across navigations |
| REQ-POPUP-FAIL-01 to FAIL-03 | connection.md, Failure and security rules; METRICS.md, Privacy and failure handling |

## 15. References

- HTML Standard, cross-document messaging and message channels.
- HTML Standard, browsing-context-group switches due to
  Cross-Origin-Opener-Policy.
- Service Workers, registration scope and client matching.
- RFC 4122, A Universally Unique IDentifier (UUID) URN Namespace.
