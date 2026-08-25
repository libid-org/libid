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
- fixed native UI, one-shot transitions, cleanup, and best-effort closure.

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
value. The application client's selected platform/version module later
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

## Initial launch and prefetch

After exact-validating the already-cleared launch fragment copy, the popup
creates one `/api/v1/ceremony/prover#prefetch(...)` child for the selected
platform and version. It binds that exact child `WindowProxy` and the configured
server origin. When the child emits `ProverPrefetchingAssets`, the popup
forwards the record unchanged to `window.opener`, targeting only the embedded
allowed application origins.

Prefetch handles public assets and needs no application reply. The initial
popup neither learns nor stores an authoritative application origin. A missing
prover profile, invalid launch record, or prover-document load failure prevents
OAuth. Ordinary registration, cache, or fetch failure only loses the latency
optimization and follows the cold proving path; the popup adds no prefetch
timeout.

The Ceremony Client authenticates the forwarded readiness message and then
navigates the retained popup to the frozen provider authorization URL. The
popup does not construct or validate that URL.

## Callback authentication and result custody

The returned popup extracts exactly one bounded ceremony ID from OAuth `state`,
creates and binds one fresh same-origin prover coordinator iframe with an empty
fragment, and sends `PopupRequestAuthentication` to `window.opener` using only
the embedded allowed origins, never `*`. The coordinator receives no OAuth
input yet. The popup exposes neither the ID nor the OAuth return at this point.
The application validates the exact popup source, configured server origin,
and CCDP version, then returns its retained ID in `AppAuthenticateOrigin`.

The popup accepts that response only from `window.opener`, requires the
browser-stamped origin to be a member of `allowedAppOrigins`, and exact-matches
the supplied ID to the captured state. It then binds that exact source and
origin for the rest of the document lifetime and sends the unchanged query and
fragment once in `PopupDeliverParams`.

If authentication does not complete within
`REDIRECT_OPENER_TIMEOUT_MS = 30_000`, or the source, origin, or ID is invalid,
the popup clears the captured return, severs the opener, and renders the fixed
unapproved-application result. It sends no callback value and performs no
navigation with it. This prevents one allowed application from receiving
another application's returned credentials without requiring durable popup
state.

## Application decision and proof coordination

After delivery, the popup accepts one application decision:

- `AppCancelCeremony` clears the return, removes children and listeners, and
  attempts to close; or
- `AppRequestProof` must carry the bound ceremony ID and byte-exact OAuth return
  plus a valid generic CCDP envelope.

The popup deliberately cannot validate platform, ceremony version, client ID,
redirect URI, PKCE, or platform-return semantics. It has no launch record or
configuration after provider navigation. The authenticated Ceremony Client
selects those values and the prover repeats the selected platform/version
validation before credential use.

For proof dispatch, the popup forwards the accepted `AppRequestProof` once to
the already-bound coordinator. A qualified DIP iframe proves in place.
Otherwise the coordinator sends `ProverRequestIsolation`, and the popup renders
a real **Continue proving** anchor to the COOP-isolated prover-window URL. It
never opens that window without user activation.

The coordinator, not the popup, binds the fallback window over the scoped
same-origin channel and forwards the retained request. The popup only hosts the
activation surface and continues to relay the coordinator's valid upstream
messages. Exact fallback placement and message ordering remain CCDP rules;
worker, cache, isolation, and proof behavior remain prover rules.

## Relay, UI, and cleanup

While proof generation is active, the popup forwards valid
`ProverNotifyEvent`, `ProverDeliverProof`, and `AbortCeremony` records from the
bound coordinator to the authenticated application unchanged. It does not
interpret platform steps or narrow the structured-clone proof. Proof delivery
and technical abort are terminal. Progress is advisory and missing progress
does not change authority.

After proof dispatch, `AppCancelCeremony` is forwarded to reachable proving
work before local teardown. Cancellation and worker termination are best
effort; late output is ignored after the popup becomes terminal. Popup closure
alone never means success, denial, cancellation, or failure.

The popup renders only fixed native DOM owned by the package. It accepts no
application HTML, component, stylesheet, script URL, callback value, proof
value, or raw exception as markup. The launch UI is limited to fixed waiting,
**Continue proving**, failure, and close-fallback states. A sanitized
`AbortCeremony.reason` is diagnostic input to the application, not arbitrary
popup markup.

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

The popup, client, and prover are artifacts of one `@libid/ceremony` release and
share one `CCDPVersion`. A breaking popup wire or ordering change increments
that version. Because OAuth may return after a deployment update, the client
checks the returned popup version before releasing its ceremony ID. An
unsupported returned document fails closed and the ceremony restarts with
fresh OAuth.

Popup acceptance is covered by the browser, OAuth, CSP, and protocol rows in
[TEST_PLAN.md](TEST_PLAN.md). Tests exercise both scripted and real-anchor
launches, allowed-origin sets, URL clearing, source/origin confusion, callback
authentication timeout, duplicate and out-of-order messages, DIP and isolated
fallback placements, cancellation, terminal cleanup, and fixed safe UI.
