# `@libid/ceremony` popup architecture

This document defines the browser participant emitted as
`libid-ceremony-popup.js`. The same fixed, non-isolated document runs before
OAuth and at the configured provider callback. It preserves and authenticates
the application opener, transfers one CCDP port, and runs one qualified prover
iframe or promotes the same popup to the isolated prover without storing a
ceremony.

The exact cross-document records and their order are defined by
[CCDP](CCDP.md). The server-owned HTML bootstrap, callback alias, embedded
allowlist, and response headers are defined by the
[server contract](SERVER.md#popup-document-and-callback-alias). Prover
placement and execution are defined in [PROVER.md](PROVER.md). This document
owns only the popup participant's local lifecycle.

## Component boundary

The popup owns:

- classifying its already-cleared input as an initial launch or provider
  callback;
- retaining `window.opener` until exact callback authentication;
- starting selected-profile prefetch before OAuth;
- authenticating a returned callback before releasing its parameters;
- selecting one prover placement and handing off one application
  `MessagePort`; and
- script-owned native transition UI, one-shot cleanup, and navigation.

It does not fetch `CeremonyConfig`, import the platform catalog, parse a
platform-specific OAuth result, generate or verify a proof, own an application
Job, persist a checkpoint, or submit any downstream operation. Provider
navigation replaces the initial document, so the callback starts in a fresh
JavaScript heap. Continuity comes from the retained application `WindowProxy`
and CCDP authentication, not popup storage.

## Entrypoint and trusted inputs

The server bootstrap bounds and clears the URL before loading package code,
then calls:

```ts
declare function startPopup(
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
input. `startPopup` copies and freezes both inputs before installing listeners.

The popup accepts two closed inputs:

- **Initial launch:** empty query and a launch fragment containing one bounded
  ceremony ID, platform ID, and platform ceremony version.
- **Provider callback:** the bounded raw query and fragment with exactly one
  syntactically valid OAuth `state`, which serializes the ceremony ID.

The popup recognizes only enough callback grammar to find that single routing
value. The application client's selected platform/version client leaf later
classifies success, denial, query/fragment placement, and fields. Unknown,
ambiguous, or malformed input enters a fixed terminal failure state without
releasing the captured value or performing credential-bearing work. The server
bootstrap rejects oversized input before package code runs.

## Two document lifetimes

The popup state machine has two independent browser-document lifetimes:

```text
initial launch
  validate launch -> start prover prefetch -> report readiness -> OAuth navigation

provider callback
  load one prover iframe -> inspect placement -> authenticate opener -> bind port
    -> release OAuth return -> transfer port to the iframe, or
       hand it to the Service Worker and navigate the same popup
```

OAuth navigation destroys all initial-launch memory. No in-memory transition,
IndexedDB record, cookie, or callback binding record connects the two
lifetimes. The application retains the live `Ceremony`, ceremony ID, selected
profile, and popup `WindowProxy` across navigation.

Every local transition is one-shot. A duplicate, stale, out-of-order, wrong
application source, wrong origin, unknown type, or post-terminal message changes
no state.

## Local transitions

| Phase | Accepts and emits | Popup side effect |
|---|---|---|
| Initial launch | valid launch fragment; child `ProverPrefetchingAssets` | bind one `/prover#prefetch(...)` child and forward readiness to the embedded allowed origins; missing profile or child load fails, ordinary fetch failure continues cold |
| Prover placement | one child `ProverPlacement` | accept one same-server-origin result in the active placement phase; otherwise keep the child credential-free for automatic top-level promotion |
| Callback authentication | one OAuth state; `PopupRequestAuthentication` → `AppAuthenticateOrigin` with one port → `PopupDeliverParams` | validate exact opener/source/origin/ID, bind the port, and release the unchanged return through it |
| Prover handoff | direct `DeliverProverPort`, or `HoldProverPort` → `ProverPortHeld` | transfer the bound port to the qualified child, or to the active worker before replacing this document with `/api/v1/ceremony/prover#ceremonyId` |

Prefetch handles public assets and needs no application reply or timeout. The
popup never constructs the provider URL. After callback it releases no value
until authentication succeeds and placement is known. The shared
`REDIRECT_OPENER_TIMEOUT_MS = 30_000` setup deadline clears the return and
renders the fixed prover-load failure for missing placement, or severs the
opener and renders the fixed unapproved-application result for missing valid
authentication.

The popup has no post-navigation platform config, so it cannot validate the
platform, version, client, redirect, PKCE, or proof. The client and prover own
the platform-aware checks. Exact port binding and handoff remain in
[CCDP](CCDP.md); execution and visible proving UI remain in
[PROVER.md](PROVER.md).

### Script-owned presentation

The server document contains only an empty mount point. The popup module bundles
its stylesheet and inline libID logo and renders its initial, callback, and
fixed failure views. The bundled logo is static inline vector markup with no
external reference. The popup shell has no proving progress model or activation
button. On the iframe path, the full-size child owns the visible proving UI; on
the top-level path, the callback view lasts only until the acknowledged port
handoff.

The popup accepts no application markup or renderer. The clearing bootstrap may
render only a fixed textual load failure after clearing the URL.

A sanitized `AbortCeremony.reason` is diagnostic input to the application, not
arbitrary popup markup.

Terminal cleanup clears retained query and fragment bytes, removes the prover
prefetch or untransferred placement child, listeners, and untransferred ports,
severs references which are no longer needed, and attempts to close. If closing
fails, the document renders one fixed safe fallback. No terminal history or
recovery record is written.

## Validation ownership

| Boundary | Owner |
|---|---|
| URL size, clearing order, immutable module root, embedded allowlist, and response policy | server bootstrap and response |
| CCDP bootstrap shape, order, application source/origin, ceremony continuity, and exact port count | popup |
| Popup source, server origin, CCDP version, live ceremony, platform OAuth grammar, provider outcome, and frozen configuration | Ceremony Client |
| Platform/version proving input, credential extraction, isolation, witness, and proof generation | prover and selected platform module |
| Job authority and use of the returned Identity | application composition |

The popup's generic checks are intentionally duplicated at later trust
boundaries where needed. They do not replace the client or prover's
platform-aware validation, and those validators do not grant the popup access
to configuration.

## Compatibility and acceptance

The client checks the returned popup's `CCDPVersion` before releasing its
ceremony ID; an unsupported document restarts with fresh OAuth. Version axes
are defined in [ARCHITECTURE.md](ARCHITECTURE.md#versioning-and-compatibility).

Popup acceptance is covered by [TEST_PLAN.md](TEST_PLAN.md).
