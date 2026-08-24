# Common ceremony rules

Part of the [libID protocol specification](libid.md).

## 1. Scope

This document is the normative owner of the constructions shared by two or
more platform ceremonies: the Authorization Digest, OAuth request
serialization, the PKCE construction, notarized-transcript extraction, client
binding, and evidence-time rules. Each platform profile owns its endpoints,
ordered fields, authenticated response locations, canonical user-ID encoding, and
proof-validity rule. The browser protocol owns redirect transport,
persistence, continuation, and application control flow and code composition.

## 2. Terminology

Authorization Digest: The 32-byte value binding one authorization to the
   Authorized Transaction Data that will consume it, constructed as specified
   in §5.

Authorized Transaction Data: Opaque canonical bytes carried in the
   Authorization Digest and decoded by the Identity Integration into one
   transaction's expected arguments.

Authorization Nonce: Fresh 32-byte randomness that makes each Authorization
   Digest unique.

Verifier Dispatcher: The component on the Execution Ledger that every
   Identity Integration calls to verify an OAuth Proof. Its caller names the
   identity platform and Platform Ceremony Version; it selects the LOPPV registered for
   that pair and returns the verified result.
   It is not the party that produces proofs.

Ledger OAuth Platform Proof Verifier (LOPPV): The component on the Execution
   Ledger registered for one identity platform and one Platform Ceremony
   Version. It validates that version's OAuth Proof and returns its verified
   identity outputs. Different Execution Ledgers may use different LOPPV
   implementations for the same Platform Ceremony Version. It obtains
   attestation authenticity from the Notary Service for each attestation its
   Platform Profile requires, which is no attestation at all where that profile
   carries none.

Platform Ceremony Version: The unsigned 16-bit `platformCeremonyVersion`
   selecting one identity platform's immutable Authorization Digest
   construction, OAuth construction, and platform-specific proof statement. It
   identifies no verifier contract, verifier implementation, or mutable
   verifier-authority revision.

Supported Version Set: The identity-platform and Platform Ceremony Version
   pairs a Verifier Dispatcher currently accepts. More than one version of one
   platform can be supported at the same time.

Execution Ledger: The ordered ledger whose canonical state transition consumes
   an OAuth Proof.

Application: A user-facing product that starts Ceremonies and requests
   transactions through an Identity Integration.

Application Deployment: One concrete deployment of an Application: its
   frontend origins, backend services, OAuth client registrations, redirect
   endpoint, and proving assets.

Identity Integrator: The party that deploys or maintains an Identity
   Integration. One Identity Integration can serve multiple Applications and
   Application Deployments.

Identity Integration: The deterministic contract, program, module, or native
   transition handler on the Execution Ledger through which an Identity
   Integrator applies verified identity to application-specific state
   changes. It submits an OAuth Proof for verification and applies the
   Authorized Transaction Data returned to it.

Transaction Author: The Execution Ledger principal whose authenticated authority
   permits the transaction. It can be an account, multisignature contract,
   program, module, or equivalent ledger principal.

Fee Payer: The principal economically charged for a transaction. It can differ
   from the Transaction Author.

Transaction Submitter: The principal that delivers a transaction to the
   Execution Ledger. Delivering a transaction alone grants no transaction
   authority.

Ledger ID: The 32-byte keccak256 of an Execution Ledger's canonical ledger
   identifier. That identifier takes whatever form the ledger gives it — a
   number, a string, or a hash — and the Ledger Profile fixes the exact bytes
   hashed.

Block Time: The Execution Ledger's consensus-provided integer Unix time in
   seconds, bounded by an unsigned 64-bit integer.

Ledger Profile: The normative mapping from one Execution Ledger to its Ledger ID,
   Transaction Author authentication, Block Time, and Authorized Transaction
   Data encoding.

OAuth Proof: The complete input an Identity Integration passes to the Verifier
   Dispatcher for one verification: the identity platform, the Platform Ceremony Version,
   the operation domain, the Authorization Nonce, the
   Authorized Transaction Data, the proof, the platform's attestations, and
   any further value the Platform Profile requires the caller to supply. It is
   neither the Execution Ledger transaction nor the zero-knowledge proof
   alone.

Ceremony: The complete off-chain process that authenticates a user's selected
   identity-platform account through its platform-specific OAuth flow, derives
   its canonical user ID and handle, and locally generates the exact OAuth
   Proof for an Identity Integration. Identity Integration verification and the
   resulting state transition are outside the Ceremony.

Platform Profile: The immutable, independently versioned definition of one
   identity platform's ceremony: its endpoints, ordered request fields,
   revealed ranges, authenticated response locations, proof-validity inputs,
   parameter keys and rules, and, where its Attestation Count is nonzero, its
   attestation protocol and format. A profile whose Attestation Count is zero
   defines neither of those two. Every LOPPV registered for that platform and
   version MUST enforce the same profile, but its implementation and deployment
   are ledger-specific. The Identity Integration holds none of the profile
   constants.

Proving Circuit: The zero-knowledge circuit whose proof a LOPPV
   checks. It proves only what cannot be read from authenticated evidence.

Ceremony Popup: The immutable browser component served at a registered
   redirect URI, which receives an authorization response and delivers it
   across the application's live ceremony channel.

Verifier Governance Process: The authority over the verification path: the
   Verifier Dispatcher's Supported Version Set, each LOPPV's pinned
   constants and trust roots, and the protocol parameters. It is not the
   Identity Integration's governance.

Identity Platform: Google, X, GitHub, or a future source of authenticated
   identity evidence. "Provider" is reserved for the formal OIDC term and for
   the EIP-1193 wallet provider.

Ceremony Client: The browser-side implementation that constructs
   Authorization Digests, performs the required local evidence checks, and
   builds OAuth Proofs and derives their local identity fields.

Notary Service: The role that observes a TLS session and signs the resulting
   attestation, and that answers whether an attestation is authentic. Its
   answer is a single accept-or-reject decision covering its own signature
   over the data it attested, and it charges the Notary Fee for giving
   one. It holds no transcript when it answers: the attested data carries
   the transcript lengths, the revealed ranges, and the range commitments
   inside the bytes it signed, so that signature is what binds them to the
   session it observed. It knows nothing of any Platform Profile: which
   ranges a profile expects, and what the revealed bytes must contain, are
   proof-specific and belong to the LOPPV. A Platform Profile whose
   Attestation Count is nonzero defines the required attestation protocol,
   format, and security properties. The Verifier Governance Process selects
   the exact compatible Notary Service trusted for each supported platform and
   version pair; that mutable selection is not part of the Platform Ceremony
   Version. A profile whose Attestation Count is zero reaches no Notary
   Service. ASM-NOTARY-01 fixes what a selected service's signature is trusted
   for.

Notary Fee: The fixed amount a Notary Service charges for one verification,
   denominated in the Execution Ledger's native asset. One OAuth Proof carries
   one such fee for each attestation its Platform Profile requires, and no
   fee where that profile requires no attestation.

Attestation Count: The number of entries in the closed attestation list a
   Platform Profile fixes under REQ-COMMON-41 — the attestations the LOPPV must
   have verified before it accepts an OAuth Proof. It is derived
   from that list and never stated beside it, so the two cannot disagree. It
   is zero where the platform's evidence is a signed platform token, and two
   for each launch TLSNotary profile.

## 3. Assumptions

- ASM-LEDGER-01:
  The Execution Ledger authenticates the Transaction Author and supplies Block
  Time within tolerance of real time.
- ASM-LEDGER-02:
  The Verifier Dispatcher obtains exactly one canonical Ledger ID: from its
  execution environment where the Execution Ledger exposes one, and from
  immutable deployment configuration where it does not.
- ASM-PROV-01:
  An Identity Platform delivers an authorization response only to a redirect
  URI registered against the requesting client.
- ASM-PROV-02:
  An Identity Platform that received a `code_challenge` rejects a token request
  whose `code_verifier` does not match it.
- ASM-PROV-03:
  An Identity Platform binds an authorization code to the account that approved
  it, and accepts that code exactly once.
- ASM-PROV-04:
  A confidential-client Identity Platform rejects a token request that does not
  carry the registered client secret.
- ASM-PROV-05:
  Google signs ID Tokens with a key published at its JWKS endpoint, and
  includes the requested `nonce` verbatim.
- ASM-PROV-06:
  An Identity Platform emits a well-formed authenticated response in which
  each authoritative field appears exactly once at the JSON location fixed by
  its Platform Profile.
- ASM-PROV-07:
  At the exact token endpoint and method fixed by a Platform Profile, the
  Identity Platform accepts token redemption only under the profile's media
  type and rejects a form body containing more than one decoded occurrence of
  any profile-listed field. Necessity: launch circuits deliberately avoid
  proving the complete form grammar; without this parser property a prover
  could witness one `code` or `code_verifier` while the platform consumes
  another. Evidence: recurring integration probes against each production
  endpoint.
- ASM-NOTARY-01:
  The configured notary key is unforgeable, signs only transcripts it
  observed, and stamps their creation time from a clock within ordinary skew
  of real time. The enforced numeric bound on future skew is REQ-PLAT-09's
  comparison against the current `maxFutureAttestationSkew` parameter, not
  part of this assumption.
- ASM-PROOF-01:
  A proof accepted under the verifier artifact selected for its platform and
  version pair satisfies that Platform Profile's complete proof statement.
  Verifier governance MAY replace an artifact only with one that enforces the
  same statement; changing the statement requires a new Platform Ceremony
  Version.
- ASM-BROWSER-01:
  The Ceremony Client executes unmodified, and the user agent enforces the
  same-origin policy over authorization responses.

## 4. Security properties

The properties below survive a malicious Application Deployment operator under their
cited assumptions. They assume an unmodified Ceremony Client, the selected
verifier artifact, the Identity Integration, and verifier configuration. Compromise of the
applicable
identity-platform signing root, notary key, LOPPV, verifier governance,
browser supply chain, or Execution Ledger invalidates the properties that depend
on it.

- SP-BIND-01:
  Evidence produced by a ceremony discharges only for the Authorized
  Transaction Data committed in its Authorization Digest. Depends on
  ASM-PROV-02, ASM-PROV-05, ASM-PROV-06,
  ASM-PROV-07, ASM-NOTARY-01, ASM-PROOF-01, ASM-LEDGER-01. Evidence:
  conformance tests (supporting, not proving) plus the collision resistance of
  SHA-256 and keccak256.
- SP-CLIENT-01:
  The Ceremony Client rejects evidence issued to an OAuth client other than
  the one fixed by its immutable ceremony profile. Depends on ASM-PROV-04,
  ASM-PROV-05, ASM-PROV-07, ASM-NOTARY-01, ASM-PROOF-01, and ASM-BROWSER-01.
  Evidence: checked invariant in the Ceremony Client, plus conformance tests
  (supporting).
- SP-DELIVERY-01:
  An authorization response for one OAuth client reaches only an origin
  registered to that client, so a site borrowing another deployment's client
  cannot receive its evidence. Depends on ASM-PROV-01, ASM-BROWSER-01.
  Evidence: external audit of the registered redirect URI list, plus
  conformance tests (supporting).
- SP-EXCHANGE-01:
  An attested token exchange redeems the authorization code produced by this
  ceremony and no other. Depends on ASM-PROV-02, ASM-PROV-03, ASM-PROV-07,
  ASM-NOTARY-01, ASM-PROOF-01, ASM-BROWSER-01. Evidence: conformance tests
  (supporting, not proving).
- SP-FRESH-01:
  Evidence older than its authenticated ceiling is rejected. Depends on
  ASM-LEDGER-01, ASM-NOTARY-01, ASM-PROV-05, ASM-PROOF-01. Evidence: checked
  invariant in the LOPPV.
- SP-REPLAY-01:
  Within one Identity Integration deployment, one ceremony authorizes at most
  one authoritative effect. Depends on ASM-LEDGER-01, ASM-LEDGER-02. Evidence:
  checked invariant in the Identity Integration.

## 5. Authorization digest

The Authorization Digest is the single value binding one authorization to the
transaction that will consume it. `U16BE`, `U32BE`, and `U64BE` are
fixed-width unsigned big-endian encodings. `UTF8` emits the exact UTF-8 bytes
of a string.

```text
authorizationPreimage =
    operationDomain                          // 32 bytes
    || U16BE(platformCeremonyVersion)        //  2 bytes
    || ledgerId                               // 32 bytes
    || authorizationNonce                    // 32 bytes
    || U32BE(BYTE_LENGTH(transactionData))   //  4 bytes
    || transactionData                       // variable

authorizationDigest = keccak256(authorizationPreimage)
```

Every field but `transactionData` is fixed width, so the preimage is 102
bytes plus the Authorized Transaction Data.

- REQ-COMMON-01 (upholds SP-BIND-01):
  The Ceremony Client MUST construct every Authorization Digest as the
  keccak256 of exactly the byte concatenation above. The Ceremony Client
  MUST encode `platformCeremonyVersion` in exactly two bytes and the
  Authorized Transaction Data byte length in exactly four bytes, rejecting a
  value which does not fit its field. The Ceremony Client MUST encode
  `operationDomain`, `ledgerId`, and `authorizationNonce` as exactly 32 bytes
  each, with no length prefix. Necessity: only `transactionData` varies in
  length, so every other field is at a fixed offset and the preimage cannot
  be reinterpreted by shifting a boundary.

`operationDomain` is the operation identifier and libID domain separator.

- REQ-COMMON-01A (upholds SP-BIND-01):
  The Identity Integration MUST fix one libID-namespaced ASCII operation-domain string for
  each transaction kind and derive
  `operationDomain = keccak256(UTF8(domainString))`. The Identity Integration MUST NOT assign the same
  operation domain to transaction kinds that can produce different
  authoritative effects. A new operation or a change to one operation's
  transaction-data semantics uses a new domain string, not another digest
  field.

`platformCeremonyVersion` identifies the complete platform ceremony boundary:
this Authorization Digest layout, the platform's OAuth construction, and its
platform-specific proof statement.

- REQ-COMMON-01B (upholds SP-BIND-01):
  The Verifier Dispatcher MUST reject an OAuth Proof whose identity platform and
  `platformCeremonyVersion` pair lies outside its Supported Version Set. A
  change to any part of that boundary bumps the affected platform's version;
  a common Authorization Digest change bumps every affected platform's
  version. A verifier implementation or deployment change which preserves the
  complete boundary does not.

`ledgerId` identifies the Execution Ledger.

- REQ-COMMON-01C (upholds SP-BIND-01, SP-REPLAY-01):
  The Ledger Profile MUST fix the exact canonical identifier of its Execution
  Ledger and the exact bytes that identifier contributes. The Ledger Profile
  MUST derive `ledgerId` as the keccak256 of those bytes, which is 32 bytes
  wide whatever form the identifier took. Necessity: ledgers identify themselves
  incompatibly — a number here, a string there, a genesis hash elsewhere, and
  some too wide for 64 bits — so the digest commits a hash of the identifier
  rather than the identifier itself. The Ledger Profile author MUST ensure
  those canonical bytes differ from every other Execution Ledger on which the
  same operation domains may accept libID OAuth Proofs. This specification
  supplies no global ledger-identifier registry; reusing the bytes forfeits
  cross-ledger replay separation. The application composition MUST select the
  Execution Ledger's Ledger Profile and supply its canonical Ledger ID to the
  Ceremony Client for each ceremony. The Ceremony Client MUST validate and
  commit that exact 32-byte value. Selecting a Ledger Profile is destination
  selection, not proof authority: the Verifier Dispatcher MUST independently take
  the Ledger ID of its digest recomputation from its own Execution Ledger
  environment or immutable deployment configuration. The Verifier Dispatcher MUST
  NOT take the Ledger ID from the OAuth Proof, Authorized Transaction Data, or
  any other caller-controlled input. Necessity: an Application can select a
  destination ledger just as it selects the operation and its transaction data,
  while independent Execution Ledger recomputation makes a proof constructed for
  any other ledger unusable there. Several Execution Ledgers expose no
  intrinsic ledger identifier at execution time, so environment-sourcing
  cannot be required of the browser universally.
- REQ-COMMON-01D (upholds SP-BIND-01, SP-FRESH-01):
  The Ledger Profile MUST define how the Execution Ledger authenticates the
  Transaction Author and supplies Block Time. The Identity Integration MUST obtain both
  from that authenticated environment rather than caller-controlled data.
  Necessity: the ceremony rules must not depend on one execution environment's
  caller or clock.

`authorizationNonce` makes each digest unique and therefore makes the digest
its own replay nullifier.

- REQ-COMMON-01E (upholds SP-REPLAY-01):
  The Ceremony Client MUST draw the 32-byte `authorizationNonce` freshly for
  each ceremony from a cryptographically secure random source.

`transactionData` carries one transaction's arguments as opaque canonical
bytes.

- REQ-COMMON-01F (upholds SP-BIND-01):
  The Ledger Profile and the Identity Integration's protocol MUST fix one exact Authorized
  Transaction Data encoding for each transaction kind. The Identity Integration MUST
  decode `transactionData` into that format and reject trailing bytes,
  noncanonical encodings, and any other argument shape.

Each Platform Profile binds that recomputed digest to its evidence by one of
two methods, chosen by what the platform's authorization can carry:

| Identity platform | Where the Authorization Digest is bound | Who compares it |
|---|---|---|
| Google | Authorization Digest public proof input, carried by the signed OIDC `nonce` | the LOPPV, against the digest recomputed under REQ-COMMON-02 |
| X | revealed `code_verifier` of the notarized token request | the LOPPV, by recomputing that verifier under REQ-COMMON-15A |
| GitHub | revealed `code_verifier` of the notarized token exchange | the LOPPV, by recomputing that verifier under REQ-COMMON-15A |

The X and GitHub circuits expose no Authorization Digest public input, so a
requirement to compare one is unsatisfiable on those paths; Google carries no
`code_verifier`, so the recomputation of REQ-COMMON-15A has nothing to
compare there. Neither method is optional, and no profile uses both.

- REQ-COMMON-02 (upholds SP-BIND-01):
  The Verifier Dispatcher MUST recompute the Authorization Digest from the
  caller-supplied operation domain and Platform Ceremony Version, its observed
  Ledger ID, and the `authorizationNonce` and Authorized Transaction Data
  carried in the OAuth Proof.
- REQ-COMMON-02A (upholds SP-BIND-01):
  Where a Platform Profile exposes the Authorization Digest as a public proof
  input, the LOPPV MUST reject a proof whose Authorization Digest
  public input differs from the digest recomputed under REQ-COMMON-02.
- REQ-COMMON-02B (upholds SP-BIND-01):
  Where a Platform Profile carries the Authorization Digest through the PKCE
  construction of §7 instead, the LOPPV MUST bind that digest by
  the verifier recomputation of REQ-COMMON-15A. The Proving Circuit of such a
  profile MUST NOT expose an Authorization Digest public input.
- REQ-COMMON-02C (upholds SP-BIND-01):
  The Platform Profile MUST bind the Authorization Digest by exactly one of
  the two methods of the table above, never by both and never by neither.
  Necessity: the two methods are complete alternatives, so a profile using
  neither carries evidence nothing has tied to the transaction it was
  authorized for.
- REQ-COMMON-03 (upholds SP-REPLAY-01):
  The Identity Integration MUST record every Authorization Digest it accepts, before
  applying any authoritative effect.
- REQ-COMMON-03A (upholds SP-REPLAY-01):
  The Identity Integration MUST reject an Authorization Digest it has already recorded.
  Necessity: recording belongs to the party the operation authorizes.
  Recording at the Verifier Dispatcher instead would let anyone observing a
  OAuth Proof call the Verifier Dispatcher first, consume the digest, and leave the
  Identity Integration nothing to apply — a denial of service costing the attacker only a
  fee. A digest is spendable once at each Identity Integration that accepts its operation
  domain, and REQ-COMMON-01A leaves domain choice with the Identity Integration that
  lives with that consequence.
- REQ-COMMON-04 (upholds SP-BIND-01):
  The Identity Integration MUST authenticate the Transaction Author under its Ledger Profile
  and enforce the invoked transaction kind's authorization predicate before
  applying any authoritative effect. The Identity Integration MUST NOT treat the Transaction
  Submitter as the Transaction Author unless the Ledger Profile authenticates
  them as the same principal.

The Ceremony remains independent of transaction semantics because it proves
the Authorization Digest rather than interpreting the operation domain or
Authorized Transaction Data. Transaction Author, Fee Payer, and Transaction
Submitter remain separate roles. No platform identifier or user identifier
appears in the digest.

Conformance vector, for `operationDomain =
keccak256(UTF8("libid.claim-identity"))`, `platformCeremonyVersion = 1`,
`ledgerId = keccak256(UTF8("example:1"))`, `authorizationNonce = 0x5555…5555`,
and `transactionData = 0x00010203`:

```text
operationDomain       = 0xcb29bed0428519ef88a3d670e8203db76e06f41aca3e684e2c63b516c9b93e1b
ledgerId               = 0x38064d82f31db40935cc75f2a0d07dcfb448d7c08e7484fc30f5de95484a4066
authorizationPreimage = 0xcb29bed0428519ef88a3d670e8203db76e06f41aca3e684e2c63b516c9b93e1b000138064d82f31db40935cc75f2a0d07dcfb448d7c08e7484fc30f5de95484a406655555555555555555555555555555555555555555555555555555555555555550000000400010203
authorizationDigest   = 0xb318fb559e16a179b853ed2853576cda16032d93b0839bb81a55135d334c0af5
```

Each platform carries the Authorization Digest in the form its authorization
allows: Google as the OIDC `nonce`, X and GitHub through the PKCE construction
in §7.

### 5.1 Verification path

An Identity Integration never verifies a libID proof itself. Verification is four roles
on the Execution Ledger, each answering to the one above it:

```text
Identity Integration          names the platform and version, pays the quoted fees,
                  records the digest, authorizes the transaction it decodes
   |
   v
Verifier Dispatcher    selects the LOPPV for that pair, recomputes the
                  Authorization Digest, hands it and the OAuth Proof down,
                  returns the result
   |
   v
LOPPV checks that platform's fields, verifies the proof under the
                  artifact selected for that pair, then calls the Notary
                  Service once per attestation its profile requires — zero
                  times for a profile carrying none
   |
   v
Notary Service    authenticates one notary signature and charges one fee
                  (X and GitHub only)
```

Only the Identity Integration knows what the transaction means; only the Notary Service
knows whether the notary signed. Everything between them is dispatch and
field checking. The Supported Version Set lives in the Verifier Dispatcher.
The Platform Profile defines every immutable platform constant — endpoints,
revealed ranges, attestation format, validity rules, and parameter keys — and
each ledger's LOPPV enforces that profile. Verifier governance owns the mutable
verifier artifact, Notary Service, trust roots, fees, and parameter values. The
verifier's code and address may differ across ledgers without changing the
Platform Ceremony Version. The Identity Integration holds none of those
constants.

The last hop is conditional. A Platform Profile whose evidence is a signed
platform token reaches no Notary Service at all: Google's Attestation Count
is zero, so its path stops at the LOPPV and costs nothing. X and
GitHub each verify two attestations — a token or token-exchange session and
an identity session — so one OAuth Proof on either path pays two fees.

- REQ-COMMON-05:
  The Identity Integration MUST call the Verifier Dispatcher with the identity platform, the
  Platform Ceremony Version, the OAuth Proof, and the native value the
  quotation of REQ-COMMON-06E returns. That value covers one Notary Fee of
  §9.1 for each attestation the selected profile requires, and is zero where
  its Attestation Count is zero. Necessity: cross-component interoperability
  of one verification entry point serving every Identity Integration.
- REQ-COMMON-05A:
  The Verifier Dispatcher MUST select the LOPPV its Supported Version
  Set registers for that pair. The Verifier Dispatcher MUST NOT accept a
  caller-supplied verifier address. Necessity: a caller-selected verifier
  verifies nothing. Each Execution Ledger selects its own implementation; that
  implementation choice is outside the Platform Ceremony Version.
- REQ-COMMON-05B:
  The Verifier Dispatcher MUST support more than one Platform Ceremony Version of
  one identity platform concurrently. Necessity: concurrent support is what
  lets a deployment run a new version beside the one it replaces while holders
  migrate. When a version leaves the Supported Version Set is the Verifier
  Governance Process's decision under REQ-COMMON-05C, and this specification
  fixes no minimum overlap: a ceremony stranded by a removal is recoverable,
  because its holder can run the ceremony again under a supported version.
- REQ-COMMON-05C:
  The Verifier Governance Process MUST own every addition to and removal from
  the Supported Version Set. Necessity: the set decides which proof statements
  the Execution Ledger accepts, so it is authority, not configuration.
- REQ-COMMON-05D (upholds SP-EXCHANGE-01):
  The LOPPV MUST check every field its Platform Profile assigns to
  it under REQ-COMMON-19E.
  The LOPPV MUST obtain attestation authenticity from the Notary
  Service once for each attestation its Platform Profile requires. The
  LOPPV MUST treat each of those decisions as final. The LOPPV MUST NOT call
  the Notary Service where its Platform Profile
  requires no attestation.
- REQ-COMMON-05E (upholds SP-CLIENT-01):
  The LOPPV MUST return its verified fields: the client
  identifier, the canonical `userId`, the raw handle bytes, and
  `metadataObservedAt`. Necessity: an authenticated `userId`, handle, and
  observation time are what the ceremony exists to produce, and the Identity Integration
  has no other authenticated source for them.
- REQ-COMMON-45 (upholds SP-BIND-01, SP-EXCHANGE-01):
  The LOPPV MUST verify the proof carried in the OAuth Proof under
  the exact verifier artifact the Verifier Governance Process selected for
  the submitted identity platform and Platform Ceremony Version. Different
  Execution Ledgers MAY select different artifacts, but each artifact MUST
  enforce the same proof statement for that version. The LOPPV MUST reject an
  OAuth Proof whose proof does not verify under that
  artifact. The LOPPV MUST NOT accept a caller-supplied artifact,
  verifying key, or externally computed verification result. Necessity:
  ASM-PROOF-01 states what an accepted proof means and presupposes that some
  role performed the acceptance; with no rule placing that work anywhere, no
  role is obliged to run it, and every public input the surrounding rules
  compare is then a number the caller wrote down.
- REQ-COMMON-46 (upholds SP-BIND-01):
  The Verifier Dispatcher MUST pass the digest it recomputed under REQ-COMMON-02,
  together with the complete OAuth Proof, to the LOPPV it
  selected. The LOPPV MUST take the digest that REQ-COMMON-02A
  and REQ-COMMON-15A compare against from that forwarded value and from
  nothing else. Necessity: both of those rules compare something against a
  digest recomputed one hop above them, and a LOPPV left to
  rebuild it or to receive it another way would compare against a digest the
  caller could choose.

The operation domain travels in the OAuth Proof and is authenticated by digest
recomputation rather than trusted: an OAuth Proof naming a domain other than
the one the ceremony committed produces a different digest, which fails
whichever binding check of REQ-COMMON-02A and REQ-COMMON-02B its profile
uses. The Verifier Dispatcher therefore returns the domain it authenticated, and
the Identity Integration decides whether that domain is its own.

- REQ-COMMON-06 (upholds SP-BIND-01):
  The Verifier Dispatcher MUST return the authenticated operation domain, the
  Authorized Transaction Data, and every field REQ-COMMON-05E lists to the
  Identity Integration on acceptance. The Verifier Dispatcher MUST return nothing but the
  rejection on rejection.
- REQ-COMMON-06A (upholds SP-BIND-01):
  The Identity Integration MUST reject a returned operation domain it does not own. The
  Identity Integration MUST select its transaction handler by that domain before decoding
  the Authorized Transaction Data under REQ-COMMON-01F.
- REQ-COMMON-06B:
  The Verifier Dispatcher MUST NOT decode, interpret, or apply the Authorized
  Transaction Data. Necessity: transaction semantics belong to the Identity Integration
  that fixed the operation domain.
- REQ-COMMON-06C (upholds SP-BIND-01):
  The Verifier Dispatcher MUST take the Ledger ID of the digest recomputation of
  REQ-COMMON-02 from the Ledger ID it observes under ASM-LEDGER-02. The Verifier
  Dispatcher MUST NOT read a Ledger ID from the OAuth Proof. The Verifier Dispatcher
  MUST dispatch on the Platform Ceremony Version the OAuth Proof names.
  Necessity: the Execution Ledger the evidence was authorized for and the proof
  statement that verifies it are both bound in the digest, and recomputing
  that digest is the whole check on either; the OAuth Proof carries no Ledger
  ID for anything to compare against, and the dispatched version cannot
  disagree with the submitted one because dispatch reads it from the
  OAuth Proof in the first place.

The Notary Fees of §9.1 are charged at the bottom of this path, so native
value passes down it and stops where the work is done. A path with no
attestation to verify carries no value at all.

- REQ-COMMON-06D:
  The Verifier Dispatcher and the LOPPV MUST each reject a call whose
  native value differs from the value that role currently requires, read from
  the quotation of REQ-COMMON-06E before forwarding. The Verifier Dispatcher MUST
  forward exactly the value the LOPPV requires. The LOPPV MUST deliver exactly
  one Notary Fee with each attestation
  verification its Platform Profile requires, and no value at all where that
  profile requires none. Necessity: exact value at every hop
  needs no refund path, so no partial-failure or reentrancy rule is required
  and no value can be captured in transit.
- REQ-COMMON-06E:
  The Verifier Dispatcher MUST expose a fee quotation for an identity platform and
  Platform Ceremony Version covering the whole verification path, quoting one
  Notary Fee for each attestation that pair's Platform Profile requires and
  zero where it requires none. Necessity: an Identity Integration cannot attach a correct
  fee if quoting requires knowing the path's internal topology, and a profile
  verifying two attestations costs two fees while one verifying none costs
  nothing.

## 6. Canonical OAuth serialization

- REQ-COMMON-07:
  The Implementation MUST serialize each listed parameter tuple with the WHATWG
  `application/x-www-form-urlencoded` serializer, taking UTF-8 input, encoding
  space as `+`, and using uppercase hexadecimal percent escapes. Necessity:
  byte-exact request reproduction across implementations, without which the
  fixed range layout of §9 does not hold. This is a browser-side serialization
  rule; no circuit re-verifies it. The Ceremony Client MUST compare a
  revealed raw form-value range with the exact value bytes this serializer
  emits for the expected unencoded value. The Ceremony Client MUST NOT
  compare that range directly with the unencoded value or apply a second,
  permissive decoder.
- REQ-COMMON-08:
  The Implementation MUST emit each field listed in the platform profile
  exactly once, in the listed order. The Implementation MUST emit no other
  field. Necessity: cross-component interoperability of the transcript
  layout.
- REQ-COMMON-09 (upholds SP-BIND-01):
  The Implementation MUST NOT accept a caller-supplied parameter into a
  serialized authorization or token request.
- REQ-COMMON-10:
  The Implementation MUST send an authorization request's serialization as the
  endpoint query, and a token request's serialization as the body with media
  type `application/x-www-form-urlencoded`. Necessity: cross-component
  interoperability.
- REQ-COMMON-11 (upholds SP-EXCHANGE-01):
  The Implementation MUST NOT follow a redirect on a notarized request.
- REQ-COMMON-29 (upholds SP-DELIVERY-01):
  The Deployment MUST register with each Identity Platform only redirect URIs
  whose origins it controls.
- REQ-COMMON-30 (upholds SP-DELIVERY-01):
  The Ceremony Client MUST forward an authorization response only over a live
  browser channel authenticated to an exact origin in the deployment-configured
  allowed application-origin set. The set MAY contain more than one origin.
- REQ-COMMON-31 (upholds SP-DELIVERY-01):
  The Ceremony Client MUST ignore a forwarding target supplied in the
  redirect request.
- REQ-COMMON-32 (upholds SP-BIND-01, SP-EXCHANGE-01):
  The Deployment MUST run recurring integration probes establishing
  ASM-PROV-07 for every production form-encoded token endpoint. The Deployment
  MUST make the affected Platform Profile ineligible for new ceremonies when
  a probe fails.

The HTTPS authority, method, path, parameter tuple, and authenticated
request and response values carry proof semantics. Header casing and order do
not, unless a platform profile commits them.

Serializer conformance vector:

```text
ordered tuple:
  label        = A B
  redirect_uri = https://redirect.example/oauth/redirect
  state        = _-~

serialized:
label=A+B&redirect_uri=https%3A%2F%2Fredirect.example%2Foauth%2Fredirect&state=_-%7E
```

## 7. PKCE construction

X and GitHub bind the Authorization Digest through S256 PKCE.

```text
verifierHash   = SHA256(authorizationDigest || authorizationNonce)
code_verifier  = BASE64URL_NOPAD(verifierHash)
code_challenge = BASE64URL_NOPAD(SHA256(ASCII(code_verifier)))
```

- REQ-COMMON-12 (upholds SP-BIND-01):
  The Ceremony Client MUST derive `code_verifier` from the exact 64-byte
  concatenation of the Authorization Digest and the same
  `authorizationNonce` committed by that digest, as shown above. A change to
  this construction is a change to the platform ceremony boundary, which bumps
  `platformCeremonyVersion` for every profile that uses it.
- REQ-COMMON-14 (upholds SP-BIND-01):
  For a PKCE profile, the Ceremony Client MUST NOT emit the raw
  `authorizationNonce` before its token exchange completes, as a platform
  parameter, a redirect value, or a log field. Necessity: until the code is
  redeemed, whoever learns the nonce can derive the verifier and redeem an
  intercepted code; afterwards the code is spent and the nonce protects
  nothing.
- REQ-COMMON-15 (upholds SP-BIND-01):
  The Platform Profile MUST reveal the `code_verifier` range of its token
  request.
- REQ-COMMON-15A (upholds SP-BIND-01):
  The LOPPV MUST recompute `code_verifier` from the Authorization
  Digest and the submitted `authorizationNonce`. The LOPPV MUST
  reject an OAuth Proof whose revealed verifier differs byte for byte.
  Necessity: this is what binds the digest to the token exchange. Retargeting
  an attestation to another digest would require a second-preimage of the
  revealed verifier.

The fresh `authorizationNonce` gives each ceremony both a unique Authorization
Digest and an unpredictable `code_verifier`. A new OAuth attempt is a new
ceremony and therefore receives a new nonce, digest, and verifier. The verifier
and nonce are published after the exchange, which is what lets the LOPPV check
this binding itself instead of trusting a proof statement about
values it cannot see. Both verifier and challenge are exactly 43 unpadded
base64url characters.

Conformance vector, using the Authorization Digest of §5 and
`authorizationNonce = 0x5555555555555555555555555555555555555555555555555555555555555555`:

```text
verifierHash   = 0xe6d7810e5e9ccf853beda170795e4f6cc84127f94416fe8b2cd2b3aa70c8e65a
code_verifier  = 5teBDl6cz4U77aFweV5PbMhBJ_lEFv6LLNKzqnDI5lo
code_challenge = c8HLMaJOzc8OUoRYc7AocL5ioAkXVtAOmoGxoSY60IQ
```

## 8. Client binding

The OAuth client that issued the evidence is authenticated evidence in its
own right, and it reaches the Identity Integration through §5.1. The Ceremony Client
also compares it against the exact client fixed by the immutable ceremony
profile before returning the locally derived identity fields. Client admission
is permissionless: any OAuth application can produce acceptable evidence, and
no Execution Ledger registration of clients exists.

Every platform returns the client identifier the same way: its exact
authenticated bytes. How those bytes are authenticated differs, because the
evidence differs.

| Identity platform | Authenticated source | How the LOPPV authenticates the bytes |
|---|---|---|
| Google | signed ID-Token `aud` | the OAuth Proof carries the bytes; the LOPPV hashes them and requires the digest to equal the proof's audience public input |
| X | `client_id` in the notarized token request | the bytes are a revealed range of an attestation the Notary Service accepted |
| GitHub | `client_id` in the notarized token exchange | the bytes are a revealed range of an attestation the Notary Service accepted |

The client identifier is not secret: it appears in every authorization URL the
user's browser follows. The protocol therefore spends nothing to conceal it,
and returns the readable value rather than a digest of it.

- REQ-COMMON-16 (upholds SP-CLIENT-01):
  The LOPPV MUST return the exact authenticated bytes of the
  client identifier. The LOPPV MUST NOT return a digest in their
  place. Necessity: one representation across platforms lets an Identity Integration
  compare, key, and display the identifier without knowing which platform
  produced it.
- REQ-COMMON-16A (upholds SP-CLIENT-01):
  The LOPPV MUST reject an OAuth Proof whose supplied client
  identifier bytes are not authenticated by that platform's evidence, by the
  method its row above fixes. Necessity: bytes a caller supplies and nothing
  checks are the caller's claim, not the platform's.
- REQ-COMMON-16B (upholds SP-CLIENT-01):
  The LOPPV MUST require a client identifier authenticated from a
  form-serialized request to match `[A-Za-z0-9*._-]+`, the serializer's
  nonempty byte-identical ASCII subset. The LOPPV MUST reject any
  other revealed client-identifier bytes. Necessity: the
  LOPPV returns the revealed bytes as the one cross-platform
  client-identifier representation; accepting percent-encoded bytes would
  return the serialization rather than the identifier.

An Identity Integration that wants a fixed-size key derives one itself, as the keccak256 of
the returned bytes. Deriving is cheap and lossless; returning only a digest is
not, because the readable value cannot be recovered from it.
- REQ-COMMON-17 (upholds SP-CLIENT-01):
  The Ceremony Client MUST reject an OAuth Proof whose authenticated
  client identifier differs byte for byte from the client fixed by the
  selected immutable ceremony profile.
- REQ-COMMON-17C (upholds SP-CLIENT-01):
  The Verifier Dispatcher and the LOPPV MUST NOT require the exposed
  client identifier to belong to a registered set. The Identity Integration
  MAY read the exposed client identifier for its
  own semantics. Necessity: client selection is permissionless application
  policy; authoritative transaction permission comes from the Identity Integration's
  Transaction Author predicate over the proof-bound Authorized Transaction
  Data.

Redirect origin, frontend origin, and application authorization remain
browser-local and produce no Execution Ledger effect.

## 9. Notarized transcripts and attestation verification

A proof authenticates bytes, not fields, and three roles check fields in
three disjoint places. The Proving Circuit checks the fields the profile needs
inside evidence that stays hidden — and only those fields, never the whole
template. The LOPPV checks the fields carried in revealed
attestation bytes, which it reads for itself. The Ceremony Client checks the
ceremony state that exists only in the browser and reaches no proof and
produces no Execution Ledger effect. One role's extraction of each field is
the authoritative one — the
Proving Circuit's where the bytes stay hidden, the LOPPV's where
they are revealed. The Ceremony Client may repeat an authoritative extraction
over the same bytes to derive local identity fields from the exact OAuth Proof,
and nothing on the Execution Ledger depends on that repeat. A comparison on an
already-extracted value may happen in a different role again. A JSON string
check matches the full `"field":"` delimiter,
the value, and its closing quote. JSON unsigned integers and booleans use the
typed local matches of REQ-COMMON-19D. A form-field check asserts a field
boundary, the exact ASCII name and `=`, the value, and the next `&` or body end.
Because the authenticated parser outputs satisfy ASM-PROV-06 and ASM-PROV-07,
these local checks provide the required field meaning without the impractical
proving cost of a complete JSON or form parser. Hidden ranges stay behind the
pinned attestation format's range commitments; the circuit links transcripts
through those commitments, and the Authorization Digest is bound by whichever
method of §5 the profile uses.

That limit is deliberate, and is stated here so no reader infers otherwise:
nothing in this specification proves or parses a complete HTTP request
grammar, a complete HTTP response grammar, or a complete JSON document
grammar. A JSON field is matched by its exact delimiter template at an offset
the prover supplies (REQ-COMMON-19, REQ-COMMON-19D), a form field by its own
boundary template (REQ-COMMON-19C), and each committed response range is
anchored by the delimiters its Platform Profile fixes (REQ-COMMON-18A).
Uniqueness of a field inside an authenticated response is ASM-PROV-06 rather
than a scan the Proving Circuit performs; the only duplicate scan in the
protocol is the one REQ-COMMON-19A gives the LOPPV over bytes it
can read.

Disclosure and verification are two separate layers. The Platform Profile
fixes a minimal set of revealed ranges; every other byte stays behind a range
commitment native to its pinned attestation format. These commitments and
openings are verifier inputs, not libID public proof inputs unless a
profile's public-input table explicitly lists one. Separately, the proof
exposes a minimal set of public inputs, which never includes a credential.

- REQ-COMMON-17A (upholds SP-CLIENT-01):
  The Platform Profile MUST list the exact ranges a notarized session reveals.
- REQ-COMMON-17B (upholds SP-CLIENT-01):
  The Implementation MUST redact every byte outside the ranges its profile
  lists.
- REQ-COMMON-18 (upholds SP-EXCHANGE-01):
  The Platform Profile whose Attestation Count is nonzero MUST fix the
  attestation protocol, format, and required security properties. The Verifier
  Governance Process MUST select an exact compatible Notary Service before it
  supports that platform and version pair on an Execution Ledger. The
  Implementation MUST use that format's native commitment for every hidden
  range of such a profile. The Proving Circuit MUST open each hidden range
  whose value that profile checks. A profile whose Attestation Count is zero
  verifies no attestation, so it defines none of those requirements and this
  rule does not reach it.
- REQ-COMMON-38:
  The Platform Profile MUST pin the hash algorithm of every range commitment
  its pinned attestation format carries. The LOPPV MUST reject an
  attestation whose range commitments use any other algorithm. Launch
  profiles pin SHA-256. Necessity: the notarization library's default commit
  algorithm is BLAKE3 while the Proving Circuit computes SHA-256, so a prover
  left on library defaults produces commitments the circuit cannot open.
- REQ-COMMON-44:
  The Implementation MUST draw the blinder of every range commitment
  independently for each notarized session, from a cryptographically secure
  random source. Necessity: one credential committed in two sessions
  therefore has two different commitment values, which is the whole reason
  REQ-PLAT-32 and REQ-PLAT-52 state the circuit's job as opening two
  commitments to one hidden value; a shared blinder would make the two
  commitments equal, make that statement vacuous, and publish a stable
  identifier for the credential.
- REQ-COMMON-18A (upholds SP-EXCHANGE-01):
  The LOPPV MUST check that the revealed ranges and hidden-range
  commitments tile the transcript in the exact layout its profile fixes, with
  each hidden range bounded by revealed anchor bytes, or, where a hidden range
  reaches an end of the transcript, by the signed transcript length of
  REQ-COMMON-36. Necessity: the layout is
  a profile constant, and the Notary Service answers only for its own
  signature over what it observed; a leading or trailing hidden range has no
  revealed byte on one side and the signed length is what closes it.

Tiling accounts for the ranges a layout lists; it cannot see bytes the
layout never mentions. The three rules that follow govern one case only: a
notarized request that commits a credential carried in an HTTP
`Authorization` header. At launch that is the identity session of each
TLSNotary profile, and nothing else — X's `/2/users/me` request and GitHub's
`/user` request. Such a request carries a signed transcript length, covers
that length exactly, and admits exactly one anchored occurrence of the
credential header. The committed range is then the only region the LOPPV
cannot read, and its offset and length follow from the revealed
ranges around it.

A credential committed in a request body is a different case and keeps its
own rules: the profile orders it last under REQ-COMMON-22 and constrains its
charset to exclude a form delimiter, as REQ-PLAT-35 does for GitHub's
`client_secret` in the token exchange. The coverage, uniqueness, and framing
rules below do not reach it, because a form body has no header line to frame
and no `authorization` needle to count.

- REQ-COMMON-35 (upholds SP-EXCHANGE-01):
  For an identity-session request that commits a credential inside an HTTP
  `Authorization` header, the LOPPV MUST require the revealed
  ranges plus the committed range to account for exactly the signed
  transcript length of the request direction, with no gap and no overlap.
  Necessity: a check
  anchored on what a revealed prefix starts and ends with leaves the
  remainder of the request invisible; exact coverage leaves the committed
  range as the only unseen region and makes its offset and length
  derivable from the ranges around it.
- REQ-COMMON-36 (upholds SP-EXCHANGE-01):
  The Notary Service MUST carry the total transcript length of each direction
  of the session it observed in the data it signs. The LOPPV MUST
  take the transcript length used for the coverage check of REQ-COMMON-35
  from those signed lengths and from nothing else.
  Necessity: without a signed length, bytes past the last revealed range are
  invisible, which is what makes a planted-header request pass every
  substring-anchored check.
- REQ-COMMON-39 (upholds SP-EXCHANGE-01):
  For that same identity-session request, the LOPPV MUST
  normalize the revealed request bytes by ASCII-lowercasing them and
  removing every space and horizontal tab. The
  LOPPV MUST leave carriage-return and line-feed bytes in
  place. The LOPPV MUST require exactly one occurrence of the normalized,
  line-anchored credential header needle `\r\nauthorization:bearer` across
  all revealed request bytes, counting the region before the committed
  range and the region after it together. Necessity: HTTP field names and
  the auth-scheme token are case-insensitive and the colon admits optional
  whitespace, so a literal search over raw bytes is evadable; removing only
  bytes absent from the needle can create a spurious match, an over-reject
  which is safe, but can never hide a real one; and keeping CR and LF is
  what makes the needle count header lines rather than any substring, so a
  second genuine `authorization` header is rejected whatever the Identity
  Platform would have done with it.
- REQ-COMMON-40 (upholds SP-EXCHANGE-01):
  For that same identity-session request, the LOPPV MUST require
  the raw transcript bytes immediately before the committed range to be
  exactly `\r\nauthorization: Bearer `,
  and the raw transcript bytes immediately after it to be exactly `\r\n`.
  Necessity: this frames the committed range as one header line's value by
  construction, so the credential literal cannot be hidden inside another
  header's value, and a request with one honest `authorization` header
  cannot commit a range positioned somewhere else. Two fixed comparisons
  at known offsets replace a derived one.
- REQ-COMMON-43 (upholds SP-EXCHANGE-01):
  The LOPPV MUST NOT apply REQ-COMMON-35, REQ-COMMON-39, or
  REQ-COMMON-40 to a credential its Platform Profile commits in a request
  body. The Platform Profile MUST instead order such a credential last under
  REQ-COMMON-22 and constrain its charset to exclude a form delimiter.
  Necessity: GitHub's token exchange commits `client_secret` in a form body,
  so a verifier reading the three rules above as universal would demand a
  CRLF-framed `authorization: Bearer ` prefix around that body range and
  reject every valid exchange.
- REQ-COMMON-19 (upholds SP-EXCHANGE-01):
  The Proving Circuit extracting a JSON string field MUST receive the field's
  offset as a private input supplied by the prover; the circuit performs no
  search. The Proving Circuit MUST assert the full `"field":"` delimiter at
  that offset, the value bytes, the closing quote, and the following structural
  byte fixed by the profile.
- REQ-COMMON-19B (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST constrain the extracted value's charset to exclude
  the closing delimiter. The Proving Circuit MUST assert the whole match lies
  inside the authenticated payload length, not in prover-controlled padding.
  Necessity: without the charset bound a longer witnessed value extends the
  match into the neighboring field; without the bounds check a pattern can be
  planted in zero-padding.
- REQ-COMMON-19D (upholds SP-BIND-01, SP-FRESH-01):
  The Proving Circuit extracting an unsigned JSON integer MUST assert the exact
  `"field":` delimiter, a canonical `0|[1-9][0-9]*` decimal value bounded by
  the profile's integer type, and the following structural byte fixed by the
  profile. The Proving Circuit checking a JSON boolean MUST assert the exact
  `"field":true` or `"field":false` literal required by the profile and its
  following structural byte. The Proving Circuit MUST keep both matches inside
  the authenticated payload length and reject quoted, signed, fractional,
  exponent, leading-zero, padded, or wrong-type alternatives.
- REQ-COMMON-19E (upholds SP-BIND-01):
  The Platform Profile MUST fix, for each field it requires, the authenticated
  bytes that field is read from and the one algorithm that reads them. The
  Platform Profile MUST name exactly one role whose extraction of that field
  is authoritative. The Platform Profile MUST make the Proving Circuit
  authoritative where those bytes stay hidden, and the LOPPV
  authoritative where they are revealed to the Execution Ledger. The Platform
  Profile MUST make the Ceremony Client authoritative only for a field no
  proof statement and no Execution Ledger component reads. The Ceremony Client
  MAY repeat an extraction another role owns, over the same bytes by the same
  algorithm, for display and local checks. The Ceremony Client MUST return
  that repeat only with the exact OAuth Proof whose bytes it read. The
  Ceremony Client MUST discard and rederive the local identity fields if any
  proof, attestation, identity platform, Platform Ceremony Version, or other
  OAuth Proof field changes. The Ceremony Client MUST NOT label those fields
  authoritative before the Identity Integration accepts that OAuth Proof; only
  the Identity Integration's result is authoritative.
  The Platform Profile MUST NOT let a
  proof statement or an Execution Ledger component depend on that repeat. A
  comparison performed on an already-extracted value is not an extraction, and
  the Platform Profile MAY assign it to a different role. Necessity: two
  authoritative extractions of one field are two answers, each side able to
  assume the other checked it; the Ceremony Client's repeat is what lets the
  browser derive the identity the exact OAuth Proof asks the Execution Ledger
  to bind, so allowing the local identity fields and OAuth Proof to diverge
  would reopen the gap where the display names one account and the OAuth Proof
  binds another; and an
  authoritative extraction owned by a role that cannot see the
  bytes is a check nobody performs. The Google audience, extracted in circuit
  and compared on the Execution Ledger, is the ordinary case the comparison
  sentence allows.
- REQ-COMMON-19C (upholds SP-BIND-01, SP-EXCHANGE-01):
  The Proving Circuit extracting a field from an
  `application/x-www-form-urlencoded` request MUST assert that the match begins
  at byte zero or immediately after `&`, followed by the exact ASCII field
  name, `=`, the charset-constrained value, and then `&` or the authenticated
  body end. The circuit does not scan the rest of the body for duplicates;
  that property is ASM-PROV-07.
- REQ-COMMON-19A (upholds SP-EXCHANGE-01):
  The LOPPV extracting a field from revealed attestation bytes
  MUST reject a transcript in which the field's full delimiter matches at
  more than one position. Necessity: an authenticated response value the
  account holder influences, such as a display name, can embed a lookalike
  field.
- REQ-COMMON-20 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST constrain every variable value it opens or
  extracts to the charset the profile states, including values that are never
  disclosed.
- REQ-COMMON-37 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST constrain an opened credential range sent in an
  HTTP header to contain no carriage-return and no line-feed byte, in
  addition to the charset REQ-COMMON-20 already applies. Necessity: the
  committed range is the only region no verifier can see, so a value
  containing CRLF could carry a second header inside it.

Endpoint proof inputs use these canonical byte strings: authority is the
lowercase ASCII TLS server DNS name with no trailing dot, method is the exact
uppercase HTTP method, and path is the origin-form path beginning with `/`
and containing no query. Launch profiles use TCP port 443.

Authority prevents a transcript from an attacker-controlled server from
substituting for the platform; path separates operations on the same server;
method separates operations with different HTTP semantics. All three are
authenticated by the attestation itself, so the LOPPV compares
them against its profile constants and no circuit compiles a platform endpoint
constant.

- REQ-COMMON-21 (upholds SP-BIND-01):
  The Notary Service MUST authenticate the TLS server identity of the
  session it observes. Necessity: the authentication happens where the notary
  holds the session, which is at observation; the verifying side holds no
  transcript.
- REQ-COMMON-21A (upholds SP-BIND-01):
  The LOPPV MUST compare the authenticated authority, and the
  method and path revealed in the request, byte for byte with the profile
  constants it pins.
- REQ-COMMON-21B (upholds SP-EXCHANGE-01):
  The Implementation MUST construct every notarized request with the media type
  and `redirect_uri` from its immutable deployment profile. Neither value is a
  Identity Integration input. Necessity: media type selects the platform's request parser,
  while redirect URI is application delivery configuration rather than
  Execution Ledger identity authority.
- REQ-COMMON-21C (upholds SP-CLIENT-01):
  The Proving Circuit MUST NOT embed a deployment-configured value, including
  a client identifier, client secret, or `redirect_uri`, as a compiled
  constant. Necessity: a compiled deployment value fragments the verifying
  key per deployment.
- REQ-COMMON-22 (upholds SP-EXCHANGE-01):
  The Platform Profile MUST order any redacted credential last in the request
  body.
- REQ-COMMON-22A (upholds SP-CLIENT-01):
  The Proving Circuit MUST NOT expose a client secret, or any value derived
  from one, as a public proof input.

An undisclosed range still reaches the platform. Ordering a credential last
and constraining its charset prevents that credential from injecting a form
delimiter. Range tiling proves that no transcript bytes are omitted, but does
not by itself exclude a second form field inside a revealed or hidden range.
Disclosure makes such bytes auditable but does not constrain their decoded
form semantics. Launch therefore retains ASM-PROV-07 as a soundness dependency
for every form-encoded token request.

### 9.1 Attestation verification and its fee

An attestation is authenticated on the Execution Ledger, not inside the Proving
Circuit. The Notary Service takes attested data and its notary
signature and answers one question: is this attestation authentic. Verifying
is a metered service and carries a fixed fee. A Platform Profile whose
Attestation Count is zero performs none of this and pays nothing; every rule
below governs one attestation a profile does require.

- REQ-COMMON-41:
  The Platform Profile MUST fix the closed list of attestations it requires,
  naming each by the session it covers. Necessity: the number of Notary
  Service calls and the fee quotation of REQ-COMMON-06E both count
  attestations, and a profile leaving that list open fixes neither.
- REQ-COMMON-33 (upholds SP-EXCHANGE-01):
  The Notary Service MUST take the attested data and its notary
  signature and return exactly one accept-or-reject decision covering that
  signature over exactly those bytes. The Notary Service MUST NOT decide
  anything profile-specific. Necessity: the attested data carries the
  transcript lengths, the revealed ranges, and the range commitments inside
  the bytes the notary signed, so the signature is the whole binding to the
  session the notary observed; the verifying side holds no transcript and
  can compare the attested data against nothing.
- REQ-COMMON-33A (upholds SP-EXCHANGE-01):
  The Notary Service MUST reject a signature outside the notary keys it
  currently holds as trusted.
- REQ-COMMON-34:
  The Notary Service MUST charge one fixed Notary Fee
  for each verification. The Notary Service MUST reject a verification
  whose fee was not delivered. Necessity: verification is a metered service,
  and an unpaid verification is unmetered.
- REQ-COMMON-34A:
  The Identity Integration MUST deliver every fee the quotation of REQ-COMMON-06E returns
  in the Execution Ledger's native asset
  over the native value-transfer path its Ledger Profile fixes. Necessity:
  cross-component interoperability without naming one execution environment's
  transfer mechanism.
- REQ-COMMON-34B:
  The Ledger Profile MUST define that native value-transfer path and the unit
  the fee is denominated in. Necessity: the fee is unpayable without both.
- REQ-COMMON-34C:
  The Notary Fee MUST NOT vary with the attested content,
  the Transaction Author, the Fee Payer, or the Transaction Submitter.
  Necessity: a fee that varies by principal or content is selective
  censorship of a permissionless service.
- REQ-COMMON-34D:
  The Notary Service MUST expose its current fee for reading before a
  OAuth Proof is constructed. Necessity: a fee that cannot be read cannot be
  bounded.
- REQ-COMMON-34E:
  The Notary Service MUST reject a verification whose native value differs
  from its current fee. Necessity: the fee is Notary-Service-controlled state
  that can change between constructing a transaction and including it;
  rejecting a mismatch fails the transaction visibly rather than silently
  overcharging the Fee Payer, and leaves no overpayment to refund.
- REQ-COMMON-42:
  The LOPPV MUST deliver the fees of one OAuth Proof's attestation
  verifications so that they all take effect together or none of them does.
  The LOPPV MUST leave no fee delivered once it rejects the
  OAuth Proof. The Ledger Profile MUST define the mechanism by which a rejected
  call leaves no value transferred and no state changed in its Identity
  Integration. Necessity: a profile verifying two attestations pays the first
  before it asks for the second, so a rejection at the second would otherwise
  keep a fee for work the Fee Payer never received.

Fee changes are a liveness dependency, not a soundness one: a raised fee
cannot forge or retarget evidence, but a fee raised without bound stops every
ceremony for that platform until governance selects another Notary
Service.

## 10. Evidence time

- REQ-COMMON-23:
  The Implementation MUST decode every verified timestamp as an integer Unix
  time in seconds bounded by an unsigned 64-bit integer. Necessity:
  cross-component interoperability of authenticated time.
- REQ-COMMON-24 (upholds SP-FRESH-01):
  The Implementation MUST reject a fractional, negative, overflowing, or
  textual timestamp.
- REQ-COMMON-25 (upholds SP-FRESH-01):
  The Implementation MUST take `metadataObservedAt` from the platform-profile
  value. The Implementation MUST NOT infer it from an HTTP `Date` header or a
  local clock.
- REQ-COMMON-25A (upholds SP-FRESH-01):
  The Identity Integration MUST complete an otherwise valid authority operation even when
  its mutable metadata is stale. The Identity Integration MUST update
  mutable metadata and its watermark only when `metadataObservedAt` is strictly
  newer than the stored watermark. The Identity Integration MUST leave both
  unchanged for older or equal evidence, including equal evidence carrying
  conflicting metadata.
- REQ-COMMON-26 (upholds SP-FRESH-01):
  The LOPPV MUST derive `proofValidUntil` from the platform profile's
  authenticated validity input and any current protocol parameter that profile
  names. The LOPPV MUST reject an OAuth Proof where
  `Block Time >= proofValidUntil`.
- REQ-COMMON-27 (upholds SP-FRESH-01):
  The LOPPV MUST NOT accept a caller-supplied validity bound.
- REQ-COMMON-28 (upholds SP-FRESH-01):
  The Implementation MUST perform every timestamp addition and comparison with
  checked arithmetic before narrowing to an unsigned 64-bit integer.

## 11. Conformance

Roles: Ceremony Client, Ceremony Popup, Proving Circuit, Verifier Dispatcher,
LOPPV, Notary Service, Identity Integration. The
Implementation claiming a role MUST pass the vectors covering
the constructions that role implements.

- TEST-COMMON-01 (exercises REQ-COMMON-01, REQ-COMMON-01A, REQ-COMMON-01B, REQ-COMMON-01C, REQ-COMMON-01D, REQ-COMMON-01E, REQ-COMMON-01F, REQ-COMMON-02, REQ-COMMON-02A):
  The §5 digest vector reproduces `authorizationDigest` exactly.
- TEST-COMMON-02 (exercises REQ-COMMON-01A, REQ-COMMON-01F):
  An OAuth Proof carrying a foreign operation domain, or Authorized Transaction
  Data with trailing bytes, a noncanonical encoding, or an argument shape
  other than the transaction kind's exact format, is rejected.
- TEST-COMMON-02A (exercises REQ-COMMON-01C, REQ-COMMON-01D, REQ-COMMON-04):
  A Ceremony Client accepts the canonical Ledger ID selected from either of two
  Ledger Profiles and produces distinct digests; the Verifier Dispatcher accepts the
  proof for its own Ledger Profile and rejects the proof constructed for the
  other, and neither the OAuth Proof nor Authorized Transaction Data can
  override its Ledger ID. Two Ledger Profiles which accept the same operation
  domains are ineligible when they reuse the same canonical identifier bytes;
  the Identity Integration rejects a
  caller-substituted Block Time; and a Transaction Submitter that cannot satisfy
  the transaction kind's Transaction Author predicate.
- TEST-COMMON-03 (exercises REQ-COMMON-03, REQ-COMMON-03A):
  Resubmitting a recorded Authorization Digest is rejected.
- TEST-COMMON-04 (exercises REQ-COMMON-01B, REQ-COMMON-01E):
  Two ceremonies over identical Authorized Transaction Data yield distinct
  digests, and a digest carrying a foreign `platformCeremonyVersion` is
  rejected.
- TEST-COMMON-05 (exercises REQ-COMMON-07, REQ-COMMON-08, REQ-COMMON-10):
  The §6 serializer vector reproduces byte for byte.
- TEST-COMMON-06 (exercises REQ-COMMON-09, REQ-COMMON-11):
  A request carrying an appended caller parameter is rejected, and a redirected
  notarized request is abandoned.
- TEST-COMMON-07 (exercises REQ-COMMON-12, REQ-COMMON-15, REQ-COMMON-15A):
  The §7 PKCE vector reproduces `code_verifier` and `code_challenge` exactly;
  a token attestation that hides its `code_verifier` range is rejected; and a
  OAuth Proof whose `authorizationNonce` does not reproduce the revealed
  verifier from the Authorization Digest is rejected.
- TEST-COMMON-08 (exercises REQ-COMMON-14):
  No artifact, log, or platform parameter emitted before the token exchange
  completes contains the raw `authorizationNonce` of a PKCE profile.
  Verification: inspection of the emitted artifacts.
- TEST-COMMON-09 (exercises REQ-COMMON-16, REQ-COMMON-16A, REQ-COMMON-16B, REQ-COMMON-17, REQ-COMMON-17C, REQ-COMMON-22A):
  The Ceremony Client rejects an OAuth Proof carrying a client identifier
  other than its immutable profile's client, while a proof carrying a client
  identifier registered nowhere remains acceptable to the LOPPV.
  Every platform returns the identifier as exact bytes, never a digest, and a
  OAuth Proof whose supplied bytes its evidence does not authenticate is
  rejected. X and GitHub reject an empty identifier and every identifier byte
  outside `[A-Za-z0-9*._-]` rather than returning a form serialization.
- TEST-COMMON-10 (exercises REQ-COMMON-17A, REQ-COMMON-17B, REQ-COMMON-18, REQ-COMMON-18A, REQ-COMMON-19, REQ-COMMON-19A, REQ-COMMON-19B, REQ-COMMON-19C, REQ-COMMON-19E, REQ-COMMON-20, REQ-COMMON-22):
  An authenticated JSON response carrying a second copy of a templated field
  in its revealed bytes is rejected; a transcript whose
  extraction delimiter matches at two positions in the revealed bytes is
  rejected; a witnessed value containing the closing delimiter, or a pattern
  placed in padding past the payload length, fails to prove; a form-field match
  not bounded by the body start or `&` and the next `&` or body end fails to
  prove; and a transcript whose ranges do not tile the profile layout is
  rejected. A profile naming two authoritative extractions of one field, or
  naming an authoritative extraction by a role that cannot see the bytes, is
  ineligible; a profile whose Ceremony Client repeats an extraction the
  LOPPV owns, and one extracting a field in one role and comparing
  it in another, both stay eligible. Replacing any field of the exact
  OAuth Proof after deriving the local identity fields discards those fields
  and requires derivation from the replacement OAuth Proof. A profile whose
  Attestation Count is nonzero and which defines no attestation protocol,
  format, or required security properties is invalid. A destination ledger
  cannot support it without selecting a compatible Notary Service. A profile
  whose Attestation Count is zero remains valid without either.
- TEST-COMMON-11 (exercises REQ-COMMON-21, REQ-COMMON-21A, REQ-COMMON-21B, REQ-COMMON-21C):
  The LOPPV rejects an authenticated foreign authority, method,
  or path. The request constructor refuses a media type or `redirect_uri`
  differing from its immutable deployment profile. One verifying key serves
  two deployments configured with different clients and redirect URIs.
- TEST-COMMON-12 (exercises REQ-COMMON-23, REQ-COMMON-24, REQ-COMMON-25):
  A fractional, negative, overflowing, or textual timestamp is rejected, and
  an evidence time taken from an HTTP `Date` header or a local clock rather
  than the platform-profile value is rejected.
- TEST-COMMON-13 (exercises REQ-COMMON-25A, REQ-COMMON-26, REQ-COMMON-27, REQ-COMMON-28):
  An OAuth Proof at or after `proofValidUntil` is rejected, a caller-supplied
  validity bound has no effect, and reverse-order older or equal-conflicting
  metadata does not change the newer stored metadata or watermark while the
  otherwise valid authority operation succeeds.
- TEST-COMMON-14 (exercises REQ-COMMON-30, REQ-COMMON-31):
  Each of two configured application origins can complete its own authenticated
  live channel; an unlisted origin is rejected, and a redirect request carrying
  a forwarding target cannot change either result.
- TEST-COMMON-15 (exercises REQ-COMMON-29):
  Every redirect URI registered against each production client resolves to an
  origin the deployment controls. Verification: audit of the platform client
  configuration.
- TEST-COMMON-16 (exercises REQ-COMMON-05, REQ-COMMON-05A, REQ-COMMON-05B, REQ-COMMON-05C, REQ-COMMON-05D, REQ-COMMON-05E, REQ-COMMON-06, REQ-COMMON-06A, REQ-COMMON-06B, REQ-COMMON-06C, REQ-COMMON-06D, REQ-COMMON-06E):
  A platform and version pair outside the Supported Version Set is rejected;
  a caller-supplied verifier address has no effect; two supported versions of
  one platform both verify; an OAuth Proof naming an operation domain other
  than the one the ceremony committed fails digest recomputation; an Identity Integration
  receiving a domain it does not own rejects the result; the recomputation
  takes its Ledger ID from the Verifier Dispatcher's observed environment, so the
  same OAuth Proof presented on another ledger fails it and no caller-supplied
  Ledger ID reaches it; a rejected verification returns no transaction data;
  an accepted verification returns the client identifier; the quotation covers the whole path and quotes one
  Notary Fee for each attestation the selected profile requires; a profile
  whose Attestation Count is zero quotes zero, reaches no Notary Service, and
  moves no value; and a call whose native value differs from the quoted value
  is rejected at every hop.
- TEST-COMMON-17 (exercises REQ-COMMON-33, REQ-COMMON-34B, REQ-COMMON-33A, REQ-COMMON-34, REQ-COMMON-34A, REQ-COMMON-34C, REQ-COMMON-34D, REQ-COMMON-34E):
  An attestation carrying a foreign notary signature is rejected; a
  verification whose fee was not delivered is rejected; the charged fee is
  identical across differing attested content, authors, payers, and
  submitters; the current fee is readable before the OAuth Proof is submitted; and a
  verification whose native value differs from the current fee is
  rejected.
- TEST-COMMON-18 (exercises REQ-COMMON-35, REQ-COMMON-36, REQ-COMMON-39, REQ-COMMON-40, REQ-COMMON-43):
  An identity attestation whose ranges do not sum to the signed request
  transcript length, or whose ranges leave a gap or an overlap, is
  rejected; an attestation carrying no signed total transcript length for
  each direction is rejected; an attestation planting a second
  `authorization` header — literal, differing only by letter case such as
  `AuthoriZation: BEARER`, or padded with spaces or horizontal tabs after
  the colon — is rejected for a duplicate needle occurrence; a planted
  occurrence inside another header's value is not counted, because the
  needle is line-anchored; and an attestation whose committed range is not
  immediately preceded by `\r\nauthorization: Bearer ` and immediately
  followed by `\r\n` in the raw bytes is rejected. Every case above runs on
  an identity-session attestation. A GitHub token-exchange attestation, whose
  only committed credential is the `client_secret` in its form body, passes
  verification with no coverage, needle, or framing check applied to that
  range.
- TEST-COMMON-19 (exercises REQ-COMMON-37, REQ-COMMON-38, REQ-COMMON-44):
  An opened bearer containing a carriage-return or line-feed byte fails to
  prove, and an attestation whose range commitments use an algorithm other
  than the profile's pinned SHA-256 is rejected. The two notarized sessions
  of one ceremony carry different commitment values for the one bearer they
  both commit. Verification: inspection of the emitted attestations for the
  independent-blinder rule.
- TEST-COMMON-20 (exercises REQ-COMMON-02A, REQ-COMMON-02B, REQ-COMMON-02C):
  A Google proof whose Authorization Digest public input differs from the
  recomputed digest is rejected; an X or GitHub OAuth Proof binds the same
  digest through the revealed verifier of REQ-COMMON-15A while its proof
  carries no Authorization Digest public input, and a proof adding one is
  rejected; and a profile binding the digest by neither method is ineligible.
- TEST-COMMON-21 (exercises REQ-COMMON-41, REQ-COMMON-42):
  A profile publishing no attestation list is ineligible; an OAuth Proof on a
  zero-count profile is quoted nothing, charged nothing, and reaches no
  Notary Service; an OAuth Proof on a two-count profile is quoted and charged
  exactly two fees; and an OAuth Proof whose second attestation verification
  rejects leaves no fee delivered for the first.
- TEST-COMMON-22 (exercises REQ-COMMON-45):
  An OAuth Proof whose proof does not verify under the artifact selected for
  its identity platform and Platform Ceremony Version is rejected; a proof
  verifying only under another platform's or another version's artifact is
  rejected; and a caller-supplied artifact, verifying key, or precomputed
  verification result changes no decision.
- TEST-COMMON-23 (exercises REQ-COMMON-46):
  The LOPPV receives the digest the Verifier Dispatcher recomputed
  together with the complete OAuth Proof, and the comparisons of
  REQ-COMMON-02A and REQ-COMMON-15A run against that forwarded digest; a
  LOPPV taking the digest from any other source rejects the
  OAuth Proof.

## 12. Security Considerations

This document enforces SP-BIND-01, SP-CLIENT-01, SP-EXCHANGE-01,
SP-FRESH-01, and SP-REPLAY-01 under the assumptions of §3.

Replay within one Identity Integration deployment is prevented by `authorizationNonce`
and REQ-COMMON-03. Replay across Execution Ledgers whose Ledger Profiles use
distinct canonical identifier bytes is prevented by the Ledger ID in the
digest; a profile collision forfeits that separation. Replay across Platform Ceremony Versions is prevented by
`platformCeremonyVersion`. The digest does not prevent cross-deployment replay
because it binds no Identity Integration identifier. Every Identity Integration transaction
kind therefore defines an authorization predicate over the authenticated
Transaction Author and the proof-bound Authorized Transaction Data. A copied
proof creates no authority for a submitter that cannot satisfy that predicate.

Client binding rejects evidence issued to a client other than the one whose
ceremony the Ceremony Client opened. The check is local because independent
Application Deployments own different OAuth clients. The Identity Integration
authenticates the proof-bound transaction and Transaction Author instead; it
does not maintain an OAuth-client allowlist or admit applications on the
Execution Ledger.

Consent-screen phishing remains outside protocol enforcement. A hostile site
borrowing an honest deployment's OAuth client does not receive its response,
because the Identity Platform delivers it only to that client's registered
redirect URI (ASM-PROV-01). A hostile site using its own client and redirect can
receive evidence from a ceremony the user approves; the proof-bound operation,
Transaction Author authentication, and any composition-owned transaction authorization
contain that case. The ceremony layer defines no extra confirmation page. The
registered redirect URI list and the origins on it are therefore trust-bearing
configuration.

The verification path of §5.1 concentrates authority. An Identity Integration accepts the
Verifier Dispatcher's decision, operation domain, and Authorized Transaction Data
without rechecking them, so a compromised Verifier Dispatcher authorizes arbitrary
transactions at every Identity Integration at once; a compromised LOPPV does
the same for one platform and version; a compromised Notary Service accepts
attestations no notary signed. Their selection is verifier governance, which
is therefore a trust root rather than configuration. The Notary Fees are a
liveness dependency only: they cannot forge evidence, but an unbounded fee
stops every ceremony for the platforms whose profiles carry attestations, and
leaves a profile with no attestation unaffected.

The handle, the platform user identifier, and the client identifier are
published deliberately. A binding exists to be read, and each of these values
is already discoverable from the identity platform, so the protocol treats
none of them as confidential. Only the bearer, the client secret, and the
transcript bytes outside a profile's revealed ranges stay withheld for good.
For a PKCE profile, the raw `authorizationNonce` is withheld until the token
exchange completes, per REQ-COMMON-14. The OAuth Proof publishes it afterwards
as the same nonce already required to recompute the Authorization Digest,
which also lets the LOPPV recompute the revealed `code_verifier`
under REQ-COMMON-15A.

Input validation, denial of service, trust-anchor lifecycle, and browser
origin, storage, and credential boundaries are owned by the browser
specification. Per-platform failure behavior, transports, and trust roots are
owned by the [platform profiles](platform-ceremonies.md).

## 13. References

Normative: [RFC6749], [RFC7636], [RFC7519], [OIDC].

Informative: [RFC9700].
