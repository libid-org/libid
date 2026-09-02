# `@libid/ceremony` callback architecture

This document defines the browser participant implemented by the selected CCDP
callback root. The same fixed, non-isolated shell runs before OAuth and at the
configured provider callback. The callback preserves and authenticates the
application opener when available and delegates typed delivery, carrier
selection, and same-popup promotion to the concrete CCDP transport.

The exact cross-document records and their order are defined by
[CCDP](CCDP.md), transport lifecycle in
[CCDP-TRANSPORT.md](CCDP-TRANSPORT.md), browser-local authentication in
[CCDP-CARRIER-MESSAGEPORT.md](CCDP-CARRIER-MESSAGEPORT.md), and opener-severed
fallback in [CCDP-CARRIER-WEBRTC.md](CCDP-CARRIER-WEBRTC.md). The shell, root
filename, URL inputs, and entrypoint call are defined by
[CCDP](CCDP.md#callback-shell); its server-owned deployment values and response
headers are defined by the
[server contract](SERVER.md#callback-document-and-configured-alias). Prover
execution is defined in [PROVER.md](PROVER.md). This document
owns only the callback participant's local lifecycle.

## Component boundary

The callback owns:

- classifying its already-cleared input as an initial launch or provider
  callback;
- starting selected-profile prefetch before OAuth;
- constructing, decoding, and handling its CCDP values; and
- script-owned native transition UI and one-shot cleanup.

The concrete transport owns opener authentication, carrier selection,
cross-document carrier continuity, and popup replacement.

It does not fetch `CeremonyConfig`, import the platform catalog, parse a
platform-specific OAuth result, generate or verify a proof, own an application
Job, persist a checkpoint, or submit any downstream operation. Provider
navigation replaces the initial document, so the callback starts in a fresh
JavaScript heap. Continuity comes from either the authenticated retained
`WindowProxy` or the live ceremony's RTC rendezvous, not callback storage.

## Entrypoint and trusted inputs

`oauthReturn` is the exact copied query and fragment, including their leading
delimiter when nonempty. `allowedAppOrigins` is immutable deployment data
embedded by the server. The CCDP shell passes both to `startCallback`; the
callback copies and freezes them before installing listeners.

The callback accepts the two closed inputs defined by CCDP:

- **Initial launch:** the cleared launch input.
- **Provider callback:** the bounded raw provider return containing one routing
  state.

The callback recognizes only enough callback grammar to find that single routing
value. The application client's selected platform/version client leaf later
classifies success, denial, query/fragment placement, and fields. Unknown,
ambiguous, or malformed input enters a fixed terminal failure state without
releasing the captured value or performing credential-bearing work. The CCDP
bootstrap rejects oversized input before package code runs.

## Two document lifetimes

The callback state machine has two independent browser-document lifetimes:

```text
initial launch
  validate launch -> start prover prefetch -> report readiness -> OAuth navigation

provider callback
  validate OAuth state
    -> create the returned transport endpoint
    -> let it choose MessagePort or WebRTC
    -> preserve carrier continuity and navigate the same popup to /prover
```

OAuth navigation destroys all initial-launch memory. No in-memory transition,
IndexedDB record, cookie, or callback binding record connects the two
lifetimes. The application retains the live `Ceremony`, ceremony ID, selected
profile, and popup `WindowProxy` across navigation.

Every local transition is one-shot. A duplicate, stale, out-of-order, wrong
application source, wrong origin, unknown type, or post-terminal message changes
no state.

## Local transitions

| Lifetime | Accepts and emits | Callback side effect |
|---|---|---|
| Initial launch | valid launch input; child `ProverPrefetchingAssets` | construct the ceremony transport over the opener, bind the CCDP prefetch document, and send readiness through transport; missing profile or child load fails, ordinary fetch failure continues cold |
| Provider return | one OAuth state and `CallbackDeliverParams` | construct a fresh ceremony transport; it exact-binds MessagePort or commits WebRTC without exposing the return to signaling |
| Prover transition | carrier port is preserved | transport replaces this document with the CCDP proof-generation location |

Prefetch handles public assets and needs no application reply or timeout. The
callback never constructs the provider URL. After provider return it releases
no OAuth return to the application until one carrier binds. An absent or severed opener commits
WebRTC immediately; an otherwise usable opener receives the bounded
`CALLBACK_OPENER_TIMEOUT_MS = 30_000` local-authentication deadline before RTC
selection. A late local reply is inert. A failure to preserve the selected
carrier port through the worker clears the return and renders the fixed
prover-load failure instead of navigating.

During initial launch, an already-constructed transport may report an
observable prefetch failure with terminal `AbortCeremony` before carrier
selection; the transport's private connection ID can also bind a real-anchor
source from that abort. After provider return, an observable abort uses the
selected transport. Failure to construct transport has no CCDP path, follows
the [undeliverable-failure rule](METRICS.md#undeliverable-failures), and renders
the fixed failure view.

The callback has no post-navigation platform config, so it cannot validate the
platform, version, client, redirect, PKCE, or proof. The client and prover own
the platform-aware checks. Opaque delivery, carrier selection, and navigation
are defined in [CCDP-TRANSPORT.md](CCDP-TRANSPORT.md). Execution and
visible proving UI remain in [PROVER.md](PROVER.md).

### Script-owned presentation

The server document contains only an empty mount point. The callback module bundles
its stylesheet and inline libID logo and renders its initial, callback, and
fixed failure views. The bundled logo is static inline vector markup with no
external reference. The callback shell has no proving progress model or activation
button. The callback view lasts only until carrier preservation is acknowledged; the
top-level prover then owns the visible proving UI.

The callback accepts no application markup or renderer. The clearing bootstrap may
render only a fixed textual load failure after clearing the URL.

A sanitized `AbortCeremony.reason` is diagnostic input to the application, not
arbitrary callback markup.

Terminal cleanup clears retained query and fragment bytes, removes the prover
prefetch child, listeners, and untransferred ports, and severs references which
are no longer needed. It never closes or navigates the popup; the application
composition owns that window's lifetime. No terminal history or recovery
record is written.

## Validation ownership

| Boundary | Owner |
|---|---|
| URL size, clearing order, immutable module root, and embedded allowlist | CCDP callback shell |
| HTTP response and logging policy | ceremony server |
| MessagePort bootstrap shape, application source/origin, ceremony continuity, carrier selection, and exact port count | concrete transport and MessagePort carrier |
| RTC signaling origin, role, one-use ceremony binding, and ICE/DTLS continuity | concrete transport, WebRTC carrier, and signaling service |
| CCDP shape, direction, order, live ceremony, platform OAuth grammar, provider outcome, and frozen configuration | Ceremony Client and callback/prover participants |
| Platform/version proving input, credential extraction, isolation, witness, and proof generation | prover and selected platform module |
| Job authority and use of the returned Identity | application composition |

The callback's generic checks are intentionally duplicated at later trust
boundaries where needed. They do not replace the client or prover's
platform-aware validation, and those validators do not grant the callback access
to configuration.

## Compatibility and acceptance

The CCDP shell selects the callback root before this participant runs; no
callback message repeats its version. Both carrier bindings independently
exact-match the package's
`TransportVersion` before delivering the OAuth return. An unsupported version
fails before package code loads. Version axes are defined in
[ARCHITECTURE.md](ARCHITECTURE.md#versioning-and-compatibility).

Callback acceptance is covered by [TEST_PLAN.md](TEST_PLAN.md).
