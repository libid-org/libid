# `@libid/ceremony` callback architecture

This document defines the browser participant emitted as
`libid-ceremony-callback.js`. The same fixed, non-isolated document runs before
OAuth and at the configured provider callback. It preserves and authenticates
the application opener when available, selects the matching CCDP transport, and
promotes the same popup to the isolated prover without storing a ceremony.

The exact cross-document records and their order are defined by
[CCDP](CCDP.md), with browser-local controls in
[CCDP-MESSAGEPORT.md](CCDP-MESSAGEPORT.md) and opener-severed fallback in
[CCDP-RTC.md](CCDP-RTC.md). The server-owned HTML bootstrap, callback alias, embedded
allowlist, and response headers are defined by the
[server contract](SERVER.md#callback-document-and-configured-alias). Prover
execution is defined in [PROVER.md](PROVER.md). This document
owns only the callback participant's local lifecycle.

## Component boundary

The callback owns:

- classifying its already-cleared input as an initial launch or provider
  callback;
- using `window.opener` for exact callback authentication when it survives;
- starting selected-profile prefetch before OAuth;
- selecting MessagePort or RTC without releasing parameters to signaling;
- handing one in-memory port through the prover Service Worker; and
- script-owned native transition UI, one-shot cleanup, and navigation.

It does not fetch `CeremonyConfig`, import the platform catalog, parse a
platform-specific OAuth result, generate or verify a proof, own an application
Job, persist a checkpoint, or submit any downstream operation. Provider
navigation replaces the initial document, so the callback starts in a fresh
JavaScript heap. Continuity comes from either the authenticated retained
`WindowProxy` or the live ceremony's RTC rendezvous, not callback storage.

## Entrypoint and trusted inputs

The server bootstrap bounds and clears the URL before loading package code,
then calls:

```ts
declare function startCallback(
  oauthReturn: {
    query: string
    fragment: string
  },
  allowedAppOrigins: readonly string[],
): void
```

`oauthReturn` is the exact copied query and fragment, including their leading
delimiter when nonempty. `allowedAppOrigins` is immutable deployment data
embedded by the server. It is never inferred from `Origin`, `Referer`, or URL
input. `startCallback` copies and freezes both inputs before installing listeners.

The callback accepts two closed inputs:

- **Initial launch:** empty query and a launch fragment containing one bounded
  ceremony ID, platform ID, and platform ceremony version.
- **Provider callback:** the bounded raw query and fragment with exactly one
  syntactically valid OAuth `state`, which serializes the ceremony ID.

The callback recognizes only enough callback grammar to find that single routing
value. The application client's selected platform/version client leaf later
classifies success, denial, query/fragment placement, and fields. Unknown,
ambiguous, or malformed input enters a fixed terminal failure state without
releasing the captured value or performing credential-bearing work. The server
bootstrap rejects oversized input before package code runs.

## Two document lifetimes

The callback state machine has two independent browser-document lifetimes:

```text
initial launch
  validate launch -> start prover prefetch -> report readiness -> OAuth navigation

provider callback
  validate OAuth state
    -> authenticate opener and bind MessagePort, or choose RTC fallback
    -> hand the bound transport endpoint or queued return to the Service Worker
    -> navigate the same popup to /prover
```

OAuth navigation destroys all initial-launch memory. No in-memory transition,
IndexedDB record, cookie, or callback binding record connects the two
lifetimes. The application retains the live `Ceremony`, ceremony ID, selected
profile, and popup `WindowProxy` across navigation.

Every local transition is one-shot. A duplicate, stale, out-of-order, wrong
application source, wrong origin, unknown type, or post-terminal message changes
no state.

## Local transitions

| Phase | Accepts and emits | Callback side effect |
|---|---|---|
| Initial launch | valid launch fragment; child `ProverPrefetchingAssets` | bind one `/prover#prefetch(...)` child and forward readiness to the embedded allowed origins; missing profile or child load fails, ordinary fetch failure continues cold |
| MessagePort transport | one OAuth state; `CallbackRequestAuthentication` → `AppAuthenticateOrigin` with one port → `CallbackDeliverParams` | validate exact opener/source/origin/ID, bind MessagePort, deliver the unchanged return, and select `ccdp` handoff |
| RTC transport | local authentication is unavailable or expires | queue the unchanged return on a fresh local port and select `rtc-bootstrap` handoff; send nothing to signaling |
| Prover handoff | `HoldNavigationPort` and one receipt acknowledgement | transfer the selected port to the active worker before replacing this document with `/api/v1/ceremony/prover#ceremonyId` |

Prefetch handles public assets and needs no application reply or timeout. The
callback never constructs the provider URL. After provider return it releases no value
to the application until one transport binds. An absent or severed opener selects
RTC immediately; an otherwise usable opener receives the bounded
`CALLBACK_OPENER_TIMEOUT_MS = 30_000` local-authentication deadline before RTC
selection. A late local reply is inert. Failure to hand the selected port to
the worker clears the return and renders the fixed prover-load failure instead
of navigating.

The callback has no post-navigation platform config, so it cannot validate the
platform, version, client, redirect, PKCE, or proof. The client and prover own
the platform-aware checks. Exact transport binding and navigation handoff remain
in the two CCDP transport documents; execution and visible proving UI remain in
[PROVER.md](PROVER.md).

### Script-owned presentation

The server document contains only an empty mount point. The callback module bundles
its stylesheet and inline libID logo and renders its initial, callback, and
fixed failure views. The bundled logo is static inline vector markup with no
external reference. The callback shell has no proving progress model or activation
button. The callback view lasts only until the acknowledged port handoff; the
top-level prover then owns the visible proving UI.

The callback accepts no application markup or renderer. The clearing bootstrap may
render only a fixed textual load failure after clearing the URL.

A sanitized `AbortCeremony.reason` is diagnostic input to the application, not
arbitrary callback markup.

Terminal cleanup clears retained query and fragment bytes, removes the prover
prefetch child, listeners, and untransferred ports,
severs references which are no longer needed, and attempts to close. If closing
fails, the document renders one fixed safe fallback. No terminal history or
recovery record is written.

## Validation ownership

| Boundary | Owner |
|---|---|
| URL size, clearing order, immutable module root, embedded allowlist, and response policy | server bootstrap and response |
| MessagePort bootstrap shape, order, application source/origin, ceremony continuity, transport selection, and exact port count | callback and MessagePort transport |
| RTC signaling origin, role, one-use ceremony binding, and ICE/DTLS continuity | RTC transport and signaling service |
| Popup `WindowProxy` source or RTC ceremony binding, CCDP version, live ceremony, platform OAuth grammar, provider outcome, and frozen configuration | Ceremony Client |
| Platform/version proving input, credential extraction, isolation, witness, and proof generation | prover and selected platform module |
| Job authority and use of the returned Identity | application composition |

The callback's generic checks are intentionally duplicated at later trust
boundaries where needed. They do not replace the client or prover's
platform-aware validation, and those validators do not grant the callback access
to configuration.

## Compatibility and acceptance

Both transport bindings exact-check `CCDPVersion` before delivering the OAuth
return. An unsupported document restarts with fresh OAuth. Version axes are
defined in [ARCHITECTURE.md](ARCHITECTURE.md#versioning-and-compatibility).

Callback acceptance is covered by [TEST_PLAN.md](TEST_PLAN.md).
