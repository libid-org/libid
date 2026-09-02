# `@libid/ceremony` callback architecture

This document defines the browser participant implemented by the selected CCDP
callback root. The same fixed, non-isolated shell runs before OAuth and at the
configured provider callback. The callback accepts the application connection
and delegates typed delivery and same-popup navigation to `@libid/popup`.

The exact cross-document records and their order are defined by
[CCDP](CCDP.md), while popup connection lifecycle, authentication, carrier
selection, and continuity are defined by
[`@libid/popup`](../popup/README.md). The shell, root
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

`@libid/popup` owns endpoint authentication, carrier selection,
cross-document connection continuity, and popup replacement.

It does not fetch `CeremonyConfig`, import the platform catalog, parse a
platform-specific OAuth result, generate or verify a proof, own an application
Job, persist a checkpoint, or submit any downstream operation. Provider
navigation replaces the initial document, so the callback starts in a fresh
JavaScript heap. The caller-supplied logical popup connection owns continuity;
callback storage does not.

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
    -> accept the returned popup connection
    -> deliver the OAuth return
    -> navigate the same connection to /prover
```

OAuth navigation destroys all initial-launch memory. No in-memory transition,
IndexedDB record, cookie, or callback binding record connects the two
lifetimes. The application retains the live `Ceremony`, ceremony ID, selected
profile, and logical popup connection across navigation.

Every local transition is one-shot. A duplicate, stale, out-of-order, wrong
application source, wrong origin, unknown type, or post-terminal message changes
no state.

## Local transitions

| Lifetime | Accepts and emits | Callback side effect |
|---|---|---|
| Initial launch | valid launch input; child `ProverPrefetchingAssets` | accept the popup connection, bind the prefetch child, and forward readiness; missing profile or child load fails, ordinary fetch failure continues cold |
| Provider return | one OAuth state and `CallbackDeliverParams` | accept the popup connection and deliver the unchanged return |
| Prover transition | delivered `CallbackDeliverParams` | ask the popup connection to replace this document with the CCDP proof-generation location |

Prefetch handles public assets and needs no application reply or timeout. The
callback never constructs the provider URL. After provider return it releases
no OAuth return until `PopupConnection.accept` succeeds. Carrier deadlines,
selection, and fallback are popup-package concerns. A connection-continuity
failure clears the return and renders the fixed prover-load failure instead of
navigating.

During initial launch, an accepted connection may report an observable
prefetch failure with terminal `AbortCeremony`. After provider return, an
observable abort uses the accepted connection. Failure to accept a connection
has no CCDP path, follows
the [undeliverable-failure rule](METRICS.md#undeliverable-failures), and renders
the fixed failure view.

The callback has no post-navigation platform config, so it cannot validate the
platform, version, client, redirect, PKCE, or proof. The client and prover own
the platform-aware checks. Opaque delivery, carrier selection, and navigation
are defined by [`@libid/popup`](../popup/README.md). Execution and
visible proving UI remain in [PROVER.md](PROVER.md).

### Script-owned presentation

The server document contains only an empty mount point. The callback module bundles
its stylesheet and inline libID logo and renders its initial, callback, and
fixed failure views. The bundled logo is static inline vector markup with no
external reference. The callback shell has no proving progress model or activation
button. The callback view lasts only until connection navigation is accepted; the
top-level prover then owns the visible proving UI.

The callback accepts no application markup or renderer. The clearing bootstrap may
render only a fixed textual load failure after clearing the URL.

A sanitized `AbortCeremony.reason` is diagnostic input to the application, not
arbitrary callback markup.

Terminal cleanup clears retained query and fragment bytes, removes the prover
prefetch child and ceremony listeners, and severs references which are no
longer needed. It never closes or navigates the popup; the application
composition owns that window's lifetime. No terminal history or recovery
record is written.

## Validation ownership

| Boundary | Owner |
|---|---|
| URL size, clearing order, immutable module root, and embedded allowlist | CCDP callback shell |
| HTTP response and logging policy | ceremony server |
| Application source/origin, connection ID/version, carrier selection, and continuity | `@libid/popup` |
| CCDP shape, direction, order, live ceremony, platform OAuth grammar, provider outcome, and frozen configuration | Ceremony Client and callback/prover participants |
| Platform/version proving input, credential extraction, isolation, witness, and proof generation | prover and selected platform module |
| Job authority and use of the returned Identity | application composition |

The callback's generic checks are intentionally duplicated at later trust
boundaries where needed. They do not replace the client or prover's
platform-aware validation, and those validators do not grant the callback access
to configuration.

## Compatibility and acceptance

The CCDP shell selects the callback root before this participant runs; no
callback message repeats its version. The accepted popup connection
independently exact-matches its private `ConnectionVersion`. An unsupported
CCDP version fails before package code loads. Version axes are defined in
[ARCHITECTURE.md](ARCHITECTURE.md#versioning-and-compatibility).

Callback acceptance is covered by [TEST_PLAN.md](TEST_PLAN.md).
