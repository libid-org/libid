# `@libid/ceremony` popup architecture

This document defines the browser participant emitted as
`libid-ceremony-popup.js`. The same fixed, non-isolated document runs before
OAuth and at the configured provider callback. It preserves the application
opener, owns the visible ceremony surface, and coordinates an isolated prover
without storing a ceremony.

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
- retaining `window.opener` and exact browser channel bindings;
- starting selected-profile prefetch before OAuth;
- authenticating a returned callback before releasing its parameters;
- creating and binding the post-callback prover coordinator;
- relaying valid CCDP messages without interpreting platform proofs; and
- script-owned native UI, one-shot transitions, cleanup, and best-effort closure.

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
classifies success, denial, transport placement, and fields. Unknown,
ambiguous, or malformed input enters a fixed terminal failure state without
releasing the captured value or performing credential-bearing work. The server
bootstrap rejects oversized input before package code runs.

## Two document lifetimes

The popup state machine has two independent browser-document lifetimes:

```text
initial launch
  validate launch -> start prover prefetch -> report readiness -> OAuth navigation

provider callback
  request opener authentication -> release OAuth return -> await app decision
    -> cancel, or coordinate proving -> deliver proof / abort
```

OAuth navigation destroys all initial-launch memory. No in-memory transition,
IndexedDB record, cookie, or callback binding record connects the two
lifetimes. The application retains the live `Ceremony`, ceremony ID, selected
profile, and popup `WindowProxy` across navigation.

Every local transition is one-shot. A duplicate, stale, out-of-order,
wrong-source, wrong-origin, unknown-type, or post-terminal message changes no
state.

## Local transitions

| Phase | Accepts and emits | Popup side effect |
|---|---|---|
| Initial launch | valid launch fragment; child `ProverPrefetchingAssets` | bind one `/prover#prefetch(...)` child and forward readiness to the embedded allowed origins; missing profile or child load fails, ordinary fetch failure continues cold |
| Callback authentication | one OAuth state; `PopupRequestAuthentication` → `AppAuthenticateOrigin` → `PopupDeliverParams` | create `/api/v1/ceremony/prover#ceremonyId`, validate exact opener/source/origin/ID, then bind that one-shot channel and release the unchanged return |
| Application decision | `AppCancelCeremony` or byte-matching `AppRequestProof` | clean up, or forward the request once to the bound coordinator |
| Isolation fallback | coordinator `ProverRequestIsolation` | show a real **Continue proving** anchor; the coordinator binds the user-opened window and forwards its retained request |
| Active proving | `ProverNotifyEvent`, `ProverDeliverProof`, `AbortCeremony`, or `AppCancelCeremony` | validate and relay generic records; proof/abort is terminal and cancellation is best effort |

Prefetch handles public assets and needs no application reply or timeout. The
popup never constructs the provider URL. After callback it releases no value
until authentication succeeds; failure or
`REDIRECT_OPENER_TIMEOUT_MS = 30_000` clears the return, severs the opener, and
renders the fixed unapproved-application result.

The popup has no post-navigation platform config, so it cannot validate the
platform, version, client, redirect, PKCE, or proof. It only byte-matches the
echoed OAuth return and validates CCDP. The client and prover own the two
platform-aware checks. Exact message ordering and fallback binding remain in
[CCDP](CCDP.md); execution remains in [PROVER.md](PROVER.md).

Progress is advisory and forwarded unchanged. Late output is ignored after a
terminal transition, and popup closure alone is never a result.

### Script-owned presentation

The server document contains only an empty mount point. The popup module bundles
its stylesheet and inline libID logo and renders every view.

Every package-rendered popup view displays the libID logo. The bundled logo is
static inline vector markup with no external reference. During active proving,
the popup displays exactly one primary proving affordance:

- an accessibly labelled milestone-progress bar while a qualified prover is
  working; or
- the real **Continue proving** button while user activation is required to
  open the isolated prover window.

The validated platform label is inserted as text and its monotonic progress is
the bar target. Before the first event the UI shows **Preparing proof** with an
empty shimmer; proof delivery alone reaches 100%. The renderer neither invents
progress nor presents it as an ETA.

The button replaces the bar until activation. Afterwards popup and visible
fallback render the same forwarded labels and progress; neither owns another
percentage model.

The popup accepts no application markup or renderer. The clearing bootstrap may
render only a fixed textual load failure after clearing the URL.

### Slow-proving guidance

The visible proving surface starts a local monotonic timer when active proving
starts. On the DIP path this is when the popup dispatches `AppRequestProof`; a
subsequent `ProverRequestIsolation` stops that timer while the UI waits for user
activation. On the fallback path the popup restarts it when the user activates
**Continue proving**, and the isolated prover window starts its own timer when
it receives `AppRequestProof`.

If proving remains active after `SLOW_PROVING_HINT_MS = 15_000`, the loading
view adds a nonblocking **Still proving** notice. It says that Vanadium users may
optionally allow JavaScript JIT for this site through site controls and
permissions for faster proving, while keeping the current window open and
continuing to wait. The hint does not claim JIT is the cause, user-agent sniff,
request a permission, navigate, reload, cancel, or weaken proving. Enabling a
site permission may help a later attempt; reloading the current one loses its
one-shot ceremony.

The timer and notice are presentation only. They emit no CCDP message or public
`CeremonyEvent`, change no timeout, and do not affect proof authority. Success,
failure, cancellation, or teardown removes the timer and notice.

A sanitized `AbortCeremony.reason` is diagnostic input to the application, not
arbitrary popup markup.

Terminal cleanup clears retained query and fragment bytes, removes the prover
child, listeners, and channels, severs references which are no longer needed,
and attempts to close. If closing fails, the document renders one fixed safe
fallback. No terminal history or recovery record is written.

## Validation ownership

| Boundary | Owner |
|---|---|
| URL size, clearing order, immutable module root, embedded allowlist, and response policy | server bootstrap and response |
| CCDP shape, direction, order, source, origin, phase, ceremony continuity, and echoed OAuth-return bytes | popup |
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
