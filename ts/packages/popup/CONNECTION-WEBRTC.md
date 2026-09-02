# WebRTC carrier

This document defines the WebRTC fallback carrier for the
[popup connection](CONNECTION.md) when response policy severs popup opener
authentication. It owns peer establishment and logical-value delivery over one
`RTCDataChannel`.

MessagePort is preferred while the popup retains its opener. WebRTC covers the
case where external response isolation requires an opener-independent path.
The signaling service's exact routes, records, bounds, and implementation are
outside this specification; this document fixes only the connection boundary
and the security properties that contract must preserve.

## Why this carrier exists

The browser-local [MessagePort carrier](CONNECTION-MESSAGEPORT.md) is simpler,
but cannot establish after response isolation severs the popup's opener.
This follows the [HTML COOP model](https://html.spec.whatwg.org/multipage/browsers.html#cross-origin-opener-policies)
and its unresolved [cross-group opener-messaging limitation](https://github.com/whatwg/html/issues/6364).
No known alternative to WebRTC satisfies the connection constraints after that
severance: cross-site operation, current-engine support, mobile suspension, no
application-origin endpoint, no additional window, and direct browser-local
application messages. WebRTC is therefore the available opener-independent
fallback. Its signaling service establishes the peers but never relays
application-level messages. A deployment without TURN accepts that direct ICE
can fail on restrictive networks.

## Topology

The application page and final top-level popup document are the only RTC peers.
A transient popup document never creates an `RTCPeerConnection` when its next
navigation would destroy it. No iframe, worker, or signaling service terminates
the `RTCDataChannel`.

```text
Application connection      Signaling service      Destination popup connection
        |<--- SDP / ICE --------->|<--- SDP / ICE --------->|
        |<========== direct RTCDataChannel =================>|

        ---- signaling through service
        ==== direct browser-to-browser application data
```

The application connection starts one bounded, one-use signaling subscription
before caller-controlled popup navigation. This creates no peer connection,
SDP, ICE candidate, or transported-value record. The application connection
closes it unused when MessagePort wins. When RTC is committed, the destination
popup creates the offer and the application answers.

## Signaling service

The signaling service is a bounded rendezvous, not a carrier. The application
subscribes as answerer and the popup publishes as offerer under the same fresh,
unguessable, one-use connection ID. The ID is the rendezvous
capability; the browser-stamped `Origin` restricts which browser role may present
it but is not a general client credential. The service exact-checks the
application and popup origins. Signaled DTLS fingerprints bind the
resulting channel to the exchanged descriptions but do not independently
authenticate the signaling service. No second nonce is added.

The signaling contract accepts only:

- one application subscription from an allowed application origin;
- one popup offer from the configured popup origin;
- one answer;
- bounded trickled ICE candidate updates from the bound roles; and
- terminal connected, failed, or abandoned cleanup.

The live subscription exact-matches the caller-supplied connection version,
connection ID, and role and lasts only for that connection. Once RTC fallback starts,
offer, answer, and candidate state is transient and is deleted when the
channel opens, either side fails or disconnects, MessagePort wins, or connection
closes.
Signaling records are consumed once and never enter signaling URLs, logs,
analytics, or durable storage.

An honest service is not on the data path and cannot read DTLS-protected framed
values. A compromised service can replace exchanged fingerprints and
man-in-the-middle the channel, but the signaling service belongs to the same
configured server trust boundary that supplies the popup program.
It therefore adds no independent signature or trust system.

The signaling service is selected over the available establishment mechanisms:

| Mechanism | Tradeoff |
| --- | --- |
| Signaling service | Works cross-site, is event-driven, and needs no application-origin endpoint or additional iframe. It carries only bounded SDP and ICE metadata; application messages remain browser-local. |
| Cookie or storage polling | Requires an additional popup-server iframe under the application and works only when application and popup server are same-site. Browser throttling made PoC signaling take more than one second, comparable to a service round trip, while still not covering cross-site deployments. |
| `BroadcastChannel` or shared worker | Cannot reliably cross the origin and storage-partition boundary between application and popup server. |
| Application endpoint or frontend-origin rendezvous page | Can rendezvous the peers, but adds application-specific server or hosting integration that the deployment model excludes. |
| TURN | Solves peer reachability rather than signaling. It relays encrypted DTLS/SCTP packets, placing a service on every packet path and violating the direct browser-local connection constraint, but does not terminate the data channel or read its plaintext. |

The selected path supports cross-site peers without turning the signaling
service into an application-message relay. With STUN only, inability to form a
direct ICE path fails the connection rather than selecting another carrier.

## API

Signaling is private carrier machinery. Both endpoints receive the connection
ID as a connection-construction input before any caller message exists; neither
finds it by inspecting a transported value. The application starts connecting
before popup navigation, and the popup endpoint connects only after connection
commits RTC fallback:

```ts
interface ApplicationWebRTCOptions {
  signalingServiceUrl: string
  stunUrls: readonly string[]
  connectionId: string
  popupOrigin: string
  signal: AbortSignal
}

interface PopupWebRTCOptions {
  signalingServiceUrl: string
  stunUrls: readonly string[]
  connectionId: string
  allowedApplicationOrigins: readonly string[]
  signal: AbortSignal
}

declare function connectApplicationWebRTC(
  options: ApplicationWebRTCOptions,
): Promise<Carrier>

declare function connectPopupWebRTC(
  options: PopupWebRTCOptions,
): Promise<Carrier>
```

Each endpoint closes over its WebRTC options in the optional constructor passed
to `PopupConnection`:

```ts
fallback: signal => connectApplicationWebRTC({
  ...webRTCOptions,
  connectionId,
  popupOrigin,
  signal,
})
```

The popup supplies `connectPopupWebRTC` in the same form with its immutable
allowed application origins. `connectApplicationWebRTC` synchronously starts
the bounded answerer subscription and returns a pending carrier promise. It
creates the answering peer only after a valid offer arrives.
`connectPopupWebRTC` creates the offering peer and data channel, publishes its
offer and candidates, and consumes the answer and remote candidates. Each
resolves with an authenticated carrier only after its local channel opens.
Internally they retain the peer connection and channel and own every signaling
request, trickled candidate update, origin-bound role, timeout, codec, framing,
pressure, and cleanup operation.

The application connection observes and retains the first promise without
awaiting it during popup navigation, so an early failure produces no unhandled
rejection.
MessagePort selection aborts it. Under RTC selection each endpoint awaits its
own operation and exposes only the common carrier API. Abort, carrier closure,
or establishment failure closes every reachable signaling, peer, and channel
resource and releases no transported value. No signaling API or native RTC
resource is exposed to caller protocols or package consumers.

## Peer establishment

The destination popup creates one ordered reliable `RTCDataChannel` and offers;
the application answers. Neither peer sets `maxPacketLifeTime` nor
`maxRetransmits`.

Both use trickle ICE with deployment-configured STUN servers. They send each
local description as soon as it exists and forward candidates as discovered.
Host and mDNS candidates may connect immediately; server-reflexive candidates
provide a mobile path without depending on mDNS resolution or local-network
permission. ICE completion is diagnostic because the channel may open earlier.
The deployment configures no TURN server. Networks whose NAT or firewall prevents a
direct path fail closed; this is an explicit availability tradeoff, not a
connection downgrade or recovery signal.

The selected SDP and DTLS fingerprints are immutable for the connection.
Duplicate signaling records are idempotent; candidate records append only exact
new candidates. Changed descriptions, roles, fingerprints, or accepted
candidates fail. Signaling state is deleted when the channel opens, either side
fails or disconnects, MessagePort wins, or connection closes.

## Message delivery

[`RTCDataChannel.send`](https://www.w3.org/TR/webrtc/#dom-rtcdatachannel-send)
accepts strings and binary buffers, not structured-clone objects. This carrier
therefore owns one dependency-free wire codec in addition to bounded framing,
reassembly, and send-buffer pressure. Its logical value domain is `null`,
booleans, finite numbers other than negative zero, strings, dense arrays, plain
records with enumerable own string-keyed data properties, and `Uint8Array`.
It rejects `undefined`, `bigint`, nonfinite numbers, negative zero, sparse
arrays or arrays with non-index properties, symbol or nonenumerable keys,
accessors, functions, cycles, class instances, `Date`, `Map`, `Set`, raw
`ArrayBuffer`, and other platform objects before sending.

The codec recursively replaces each `Uint8Array` with the exact JSON object
`{"$bytes":"<unpadded-base64url>"}`. `$bytes` is reserved and cannot be an
ordinary record key. It then uses `JSON.stringify` and `TextEncoder` to produce
UTF-8 bytes. JSON is selected because it is built into every target browser and
needs no package; CBOR or MessagePack would reduce byte expansion but add a
dependency or custom codec without changing the protocol boundary. The JSON
encoding is not canonical and is never hashed, signed, or otherwise treated as
proof bytes; only each byte tag's base64url spelling is canonical.

One serialized message is sent completely before the next. The ordered reliable
channel needs only two frame forms:

```text
first:         0x01 | uint32be totalLength | payload
continuation:  0x00 | payload
```

The first frame may complete the message. Otherwise continuation payloads append
until exactly `totalLength` bytes have arrived. The carrier fragments below the
retained peer connection's `RTCSctpTransport.maxMessageSize` and its own bounded
chunk cap, and pauses its bounded send queue using `bufferedAmount` and
`bufferedamountlow`. Ordering and the noninterleaving send queue remove the need
for message IDs, chunk indexes, acknowledgements, or a checksum.

On receipt the channel uses `binaryType = 'arraybuffer'`. The carrier exact-checks
the frame sequence and total length, decodes UTF-8 fatally, parses JSON, restores
exact canonical byte tags to `Uint8Array`, validates the generic value domain,
and gives the resulting `unknown` to the connection. The connection then selects
and calls its registered `MessageType`; the carrier never reads a message
discriminator.

An unexpected start or continuation, incomplete or excess body, oversized
message, invalid UTF-8 or JSON, malformed or noncanonical byte tag, unsupported
value, decode failure, or send-buffer overflow closes the carrier before any
value reaches a handler. The connection functions return the carrier and retain
the native peer and channel privately. There is one connection, with no
reconnection, carrier switch, or message resend.

## Failure and security invariants

- Signaling carries no transported value.
- The application signaling handshake requires an allowed browser-stamped
  `Origin`; the popup handshake requires the exact configured popup origin.
  Origin restricts browser callers but is not accepted as a standalone client
  credential.
- Connection ID is the fresh, unguessable, one-use rendezvous capability. It is
  exact-matched to the live application connection and retired when either carrier
  wins.
- `RTCDataChannel` message encoding and framing are bounded and cannot add a
  value outside its authenticated connection.
- Signaling loss, ICE failure, channel loss, popup closure, or context
  destruction is never a caller result or recovery signal.
- Observable failure clears reachable inputs without selecting another carrier;
  failure may otherwise be silent.

## Connection establishment

This diagram shows the logical RTC fallback establishment; it does not define
the signaling-service wire records or show transported values.

```mermaid
sequenceDiagram
    participant A as Application connection
    participant G as Signaling service
    participant P as Popup connection

    A->>G: Arm one-use subscription
    P->>G: Offer + trickled ICE candidates
    G-->>A: Deliver offer and candidates
    A->>G: Answer + trickled ICE candidates
    G-->>P: Deliver answer and candidates
    P-->>A: Ordered reliable RTCDataChannel opens
    Note over A,G: Delete signaling state
```
