# Common ceremony rules

Part of the [libID protocol specification](libid.md).

## 1. Scope

This document is the normative owner of the constructions shared by two or
more platform ceremonies: the Authorization Digest, OAuth request
serialization, the PKCE construction, notarized-transcript extraction, client
binding, and evidence-time rules. Each platform profile owns its endpoints,
ordered fields, authenticated response locations, canonical user-ID encoding, and
proof-validity ceiling. The browser protocol owns redirect transport,
persistence, continuation, and application control flow and code composition.

## 2. Terminology

Authorization Digest: The 32-byte value binding one authorization to the
   Authorized Transaction Data that will consume it, constructed as specified
   in §5.

Authorized Transaction Data: Opaque canonical bytes carried in the
   Authorization Digest and decoded by the Consumer into one transaction's
   expected arguments.

Authorization Nonce: Fresh 32-byte randomness that makes each Authorization
   Digest unique.

Proof Verifier: The component on the Consumer Chain that every Consumer calls
   to verify a libID proof. Its caller names the identity platform and the Platform Verifier
   Version; it selects the Platform Verifier registered for that pair and
   returns the verified result. It is not the party that produces proofs.

Platform Verifier: The component on the Consumer Chain registered for one
   identity platform and one Platform Verifier Version. It checks that platform's
   fields and obtains attestation authenticity from the Notary Service.

Platform Verifier Version: The unsigned 16-bit version of one identity
   platform's proof statement. It is not a version of the ceremony process or
   a mutable verifier-authority revision.

Supported Version Set: The identity-platform and Platform Verifier Version
   pairs a Proof Verifier currently accepts. More than one version of one
   platform can be supported at the same time.

Consumer Chain: The chain whose canonical state transition consumes a libID
   proof.

Consumer: The deterministic contract, program, module, or native transition
   handler on the Consumer Chain that submits a libID proof for verification
   and applies the Authorized Transaction Data it gets back.

Transaction Author: The Consumer-Chain principal whose authenticated authority
   permits the transaction. It can be an account, multisignature contract,
   program, module, or equivalent chain principal.

Fee Payer: The principal economically charged for a transaction. It can differ
   from the Transaction Author.

Transaction Submitter: The principal that delivers a transaction to the
   Consumer Chain. Submission alone grants no transaction authority.

Chain ID: The 32-byte keccak256 of a Consumer Chain's canonical chain
   identifier. That identifier takes whatever form the chain gives it — a
   number, a string, or a hash — and the Chain Profile fixes the exact bytes
   hashed.

Block Time: The Consumer Chain's consensus-provided integer Unix time in
   seconds, bounded by an unsigned 64-bit integer.

Chain Profile: The normative mapping from one Consumer Chain to its Chain ID,
   Transaction Author authentication, Block Time, and Authorized Transaction
   Data encoding.

Submission: The complete input a Consumer passes to the Proof Verifier for
   one verification: the identity platform, the Platform Verifier Version, the
   operation domain, the Authorization Nonce, the Authorized Transaction Data,
   the proof, the platform's attestations, `pkceNonce` where the profile uses
   the PKCE construction of §7, and any further value the Platform Profile
   requires the caller to supply.

Platform Ceremony: The complete operation that turns one platform
   authorization into a locally verified claim.

Platform Profile: The immutable, independently versioned definition of one
   identity platform's ceremony: its endpoints, ordered request fields,
   revealed ranges, authenticated response locations, pinned Notary Service
   and attestation format, and proof-validity inputs. Its constants are fixed
   in the Platform Verifier registered for that platform and version, not in
   the Consumer.

Proving Circuit: The zero-knowledge circuit whose proof a Platform Verifier
   checks. It proves only what cannot be read from authenticated evidence.

Redirect Runtime: The immutable browser code served at a registered redirect
   URI, which receives an authorization response and hands it to the Canonical
   Runtime.

Verifier Governance Process: The authority over the verification path: the
   Proof Verifier's Supported Version Set, each Platform Verifier's pinned
   constants and trust roots, and the protocol parameters. It is not the
   Consumer's governance.

Identity Platform: Google, X, GitHub, or a future source of authenticated
   identity evidence. "Provider" is reserved for the formal OIDC term and for
   the EIP-1193 wallet provider.

Token-Exchange Service: The confidential-client component that performs a
   token exchange requiring a client secret, inside a notarized TLS session,
   and returns the resulting attestation.

Canonical Runtime: The immutable browser release that constructs
   Authorization Digests, verifies attestations, and builds proofs.

Notary Service: The role that observes a TLS session and signs the resulting
   attestation, and that answers whether an attestation is authentic. Its
   answer is a single accept-or-reject decision covering its own signature,
   the transcript commitment, and whether the revealed bytes and range
   openings match that transcript, and it charges the Notary Fee for giving
   one. It knows nothing of any Platform Profile: which ranges a profile
   expects, and what the revealed bytes must contain, are proof-specific and
   belong to the Platform Verifier. A Platform Profile pins the exact Notary
   Service and the attestation format it accepts. ASM-NOTARY-01 fixes what
   its signature is trusted for.

Notary Fee: The fixed amount a Notary Service charges for one verification,
   denominated in the Consumer Chain's native asset.

## 3. Assumptions

- ASM-CHAIN-01:
  The Consumer Chain authenticates the Transaction Author and supplies Block
  Time within tolerance of real time.
- ASM-CHAIN-02:
  The Consumer obtains exactly one canonical Chain ID: from its execution
  environment where the Consumer Chain exposes one, and from immutable
  deployment configuration where it does not.
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
  A proof accepted under a profile's selected verifier artifact satisfies
  that profile's complete proof statement. Verifier governance does not
  replace an artifact without selecting a new profile or verifier revision.
- ASM-BROWSER-01:
  The Canonical Runtime executes unmodified, and the user agent enforces the
  same-origin policy over authorization responses.

## 4. Security properties

The properties below survive a malicious application operator and, where
present, a malicious Token-Exchange Service under their cited assumptions. They
assume an unmodified Canonical Runtime, the selected verifier artifact, the
Consumer, and verifier configuration. Compromise of the applicable
identity-platform signing root, notary key, proof verifier, verifier governance,
browser supply chain, or Consumer Chain invalidates the properties that depend
on it.

- SP-BIND-01:
  Evidence produced by a ceremony discharges only for the Authorized
  Transaction Data committed in its Authorization Digest. Depends on
  ASM-PROV-02, ASM-PROV-05, ASM-PROV-06,
  ASM-PROV-07, ASM-NOTARY-01, ASM-PROOF-01, ASM-CHAIN-01. Evidence:
  conformance tests (supporting, not proving) plus the collision resistance of
  SHA-256 and keccak256.
- SP-CLIENT-01:
  The Canonical Runtime rejects evidence issued to an OAuth client other than
  the one fixed by its immutable ceremony profile. Depends on ASM-PROV-04,
  ASM-PROV-05, ASM-PROV-07, ASM-NOTARY-01, ASM-PROOF-01, and ASM-BROWSER-01.
  Evidence: checked invariant in the Canonical Runtime, plus conformance tests
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
  ASM-CHAIN-01, ASM-NOTARY-01, ASM-PROV-05, ASM-PROOF-01. Evidence: checked
  invariant in the Platform Verifier.
- SP-REPLAY-01:
  Within one Consumer deployment, one ceremony authorizes at most
  one authoritative effect. Depends on ASM-CHAIN-01, ASM-CHAIN-02. Evidence:
  checked invariant in the Consumer.

## 5. Authorization digest

The Authorization Digest is the single value binding one authorization to the
transaction that will consume it. `U16BE` and `U32BE` are fixed-width unsigned
big-endian encodings. `UTF8` emits the exact UTF-8 bytes of a string.

```text
authorizationPreimage =
    operationDomain                          // 32 bytes
    || U16BE(platformVerifierVersion)        //  2 bytes
    || chainId                               // 32 bytes
    || authorizationNonce                    // 32 bytes
    || U32BE(BYTE_LENGTH(transactionData))   //  4 bytes
    || transactionData                       // variable

authorizationDigest = keccak256(authorizationPreimage)
```

Every field but `transactionData` is fixed width, so the preimage is 102
bytes plus the Authorized Transaction Data.

- REQ-COMMON-01 (upholds SP-BIND-01):
  The Canonical Runtime MUST construct every Authorization Digest as the
  keccak256 of exactly the byte concatenation above. The Canonical Runtime
  MUST encode `platformVerifierVersion` in exactly two bytes and the
  Authorized Transaction Data byte length in exactly four bytes, rejecting a
  value which does not fit its field. The Canonical Runtime MUST encode
  `operationDomain`, `chainId`, and `authorizationNonce` as exactly 32 bytes
  each, with no length prefix. Necessity: only `transactionData` varies in
  length, so every other field is at a fixed offset and the preimage cannot
  be reinterpreted by shifting a boundary.

`operationDomain` is the operation identifier and libID domain separator.

- REQ-COMMON-01A (upholds SP-BIND-01):
  The Consumer MUST fix one libID-namespaced ASCII operation-domain string for
  each transaction kind and derive
  `operationDomain = keccak256(UTF8(domainString))`. The Consumer MUST NOT assign the same
  operation domain to transaction kinds that can produce different
  authoritative effects. A new operation or a change to one operation's
  transaction-data semantics uses a new domain string, not another digest
  field.

`platformVerifierVersion` identifies the complete proof statement accepted by
the selected Platform Verifier, including this Authorization Digest layout.

- REQ-COMMON-01B (upholds SP-BIND-01):
  The Proof Verifier MUST reject a submission whose identity platform and
  `platformVerifierVersion` pair lies outside its Supported Version Set. A
  platform-proof change bumps that platform's version; a common Authorization
  Digest change bumps every affected platform's version. An implementation
  change which preserves the complete accepted statement does not.

`chainId` identifies the Consumer Chain.

- REQ-COMMON-01C (upholds SP-BIND-01, SP-REPLAY-01):
  The Chain Profile MUST fix the exact canonical identifier of its Consumer
  Chain and the exact bytes that identifier contributes. The Chain Profile
  MUST derive `chainId` as the keccak256 of those bytes, which is 32 bytes
  wide whatever form the identifier took. Necessity: chains identify themselves
  incompatibly — a number here, a string there, a genesis hash elsewhere, and
  some too wide for 64 bits — so the digest commits a hash of the identifier
  rather than the identifier itself. The Consumer MUST obtain that
  Chain ID from its execution environment where the Consumer Chain exposes a
  chain identity to a deployed program, and from immutable deployment
  configuration where it does not. The Consumer MUST NOT take the Chain ID
  from Authorized Transaction Data or any other caller-controlled input.
  Necessity: several Consumer Chains expose no chain identity at execution
  time, so environment-sourcing cannot be required universally; what must hold
  everywhere is that a caller cannot choose it.
- REQ-COMMON-01D (upholds SP-BIND-01, SP-FRESH-01):
  The Chain Profile MUST define how the Consumer Chain authenticates the
  Transaction Author and supplies Block Time. The Consumer MUST obtain both
  from that authenticated environment rather than caller-controlled data.
  Necessity: the ceremony rules must not depend on one execution environment's
  caller or clock.

`authorizationNonce` makes each digest unique and therefore makes the digest
its own replay nullifier.

- REQ-COMMON-01E (upholds SP-REPLAY-01):
  The Canonical Runtime MUST draw the 32-byte `authorizationNonce` freshly for
  each ceremony from a cryptographically secure random source.

`transactionData` carries one transaction's arguments as opaque canonical
bytes.

- REQ-COMMON-01F (upholds SP-BIND-01):
  The Chain Profile and Consumer protocol MUST fix one exact Authorized
  Transaction Data encoding for each transaction kind. The Consumer MUST
  decode `transactionData` into that format and reject trailing bytes,
  noncanonical encodings, and any other argument shape.

- REQ-COMMON-02 (upholds SP-BIND-01):
  The Proof Verifier MUST recompute the Authorization Digest from the
  caller-supplied operation domain and Platform Verifier Version, its observed
  Chain ID, and the `authorizationNonce` and Authorized Transaction Data
  carried in the submission.
- REQ-COMMON-02A (upholds SP-BIND-01):
  The Proof Verifier MUST reject a proof whose Authorization Digest public
  input differs from the digest it recomputed.
- REQ-COMMON-03 (upholds SP-REPLAY-01):
  The Consumer MUST record every Authorization Digest it accepts, before
  applying any authoritative effect.
- REQ-COMMON-03A (upholds SP-REPLAY-01):
  The Consumer MUST reject an Authorization Digest it has already recorded.
  Necessity: recording belongs to the party the operation authorizes.
  Recording at the Proof Verifier instead would let anyone observing a
  submission call the Proof Verifier first, consume the digest, and leave the
  Consumer nothing to apply — a denial of service costing the attacker only a
  fee. A digest is spendable once at each Consumer that accepts its operation
  domain, and REQ-COMMON-01A leaves domain choice with the Consumer that
  lives with that consequence.
- REQ-COMMON-04 (upholds SP-BIND-01):
  The Consumer MUST authenticate the Transaction Author under its Chain Profile
  and enforce the invoked transaction kind's authorization predicate before
  applying any authoritative effect. The Consumer MUST NOT treat the Transaction
  Submitter as the Transaction Author unless the Chain Profile authenticates
  them as the same principal.

The Platform Ceremony remains reusable because it proves the Authorization
Digest rather than interpreting the operation domain or Authorized Transaction
Data. Transaction Author, Fee Payer, and Transaction Submitter remain separate
roles. No platform identifier or user identifier appears in the digest.

Conformance vector, for `operationDomain =
keccak256(UTF8("libid.claim-identity"))`, `platformVerifierVersion = 1`,
`chainId = keccak256(UTF8("example:1"))`, `authorizationNonce = 0x5555…5555`,
and `transactionData = 0x00010203`:

```text
operationDomain       = 0xcb29bed0428519ef88a3d670e8203db76e06f41aca3e684e2c63b516c9b93e1b
chainId               = 0x38064d82f31db40935cc75f2a0d07dcfb448d7c08e7484fc30f5de95484a4066
authorizationPreimage = 0xcb29bed0428519ef88a3d670e8203db76e06f41aca3e684e2c63b516c9b93e1b000138064d82f31db40935cc75f2a0d07dcfb448d7c08e7484fc30f5de95484a406655555555555555555555555555555555555555555555555555555555555555550000000400010203
authorizationDigest   = 0xb318fb559e16a179b853ed2853576cda16032d93b0839bb81a55135d334c0af5
```

Each platform carries the Authorization Digest in the form its authorization
allows: Google as the OIDC `nonce`, X and GitHub through the PKCE construction
in §7.

### 5.1 Verification path

A Consumer never verifies a libID proof itself. Verification is four roles
on the Consumer Chain, each answering to the one above it:

```text
Consumer          names the platform and version, pays any fee, records the
                  digest, authorizes the transaction it decodes
   |
   v
Proof Verifier    selects the Platform Verifier for that pair, recomputes the
                  Authorization Digest, returns the result
   |
   v
Platform Verifier checks that platform's fields and the proof statement
   |
   v
Notary Service    authenticates the notary signature and charges the fee
```

Only the Consumer knows what the transaction means; only the Notary Service
knows whether the notary signed. Everything between them is dispatch and
field checking. The Supported Version Set lives in the Proof Verifier, and
every platform constant — endpoints, revealed ranges, trust roots, parameters
— lives in the Platform Verifier registered for that platform and version.
The Consumer holds none of them.

- REQ-COMMON-05:
  The Consumer MUST call the Proof Verifier with the identity platform, the
  Platform Verifier Version, the submission, and the Notary Fee of §9.1.
  Necessity: cross-component interoperability of one verification entry point
  serving every Consumer.
- REQ-COMMON-05A:
  The Proof Verifier MUST select the Platform Verifier its Supported Version
  Set registers for that pair. The Proof Verifier MUST NOT accept a
  caller-supplied verifier address. Necessity: a caller-selected verifier
  verifies nothing.
- REQ-COMMON-05B:
  The Proof Verifier MUST support more than one Platform Verifier Version of
  one identity platform concurrently. Necessity: a version migration must not
  strand outstanding ceremonies or halt claiming.
- REQ-COMMON-05C:
  The Verifier Governance Process MUST own every addition to and removal from
  the Supported Version Set. Necessity: the set decides which proof statements
  the chain accepts, so it is authority, not configuration.
- REQ-COMMON-05D (upholds SP-EXCHANGE-01):
  The Platform Verifier MUST check every field its Platform Profile requires.
  The Platform Verifier MUST obtain attestation authenticity from the
  Notary Service. The Platform Verifier MUST treat that decision as
  final.
- REQ-COMMON-05E (upholds SP-CLIENT-01):
  The Platform Verifier MUST return its verified fields: the client
  identifier, the canonical `userId`, the raw handle bytes, and
  `metadataObservedAt`. Necessity: an authenticated `userId`, handle, and
  observation time are what the ceremony exists to produce, and the Consumer
  has no other authenticated source for them.

The operation domain travels in the submission and is authenticated by digest
recomputation rather than trusted: a submission naming a domain other than
the one the ceremony committed produces a different digest and fails
REQ-COMMON-02A. The Proof Verifier therefore returns the domain it
authenticated, and the Consumer decides whether that domain is its own.

- REQ-COMMON-06 (upholds SP-BIND-01):
  The Proof Verifier MUST return the authenticated operation domain, the
  Authorized Transaction Data, and every field REQ-COMMON-05E lists to the
  Consumer on acceptance. The Proof Verifier MUST return nothing but the
  rejection on rejection.
- REQ-COMMON-06A (upholds SP-BIND-01):
  The Consumer MUST reject a returned operation domain it does not own. The
  Consumer MUST select its transaction handler by that domain before decoding
  the Authorized Transaction Data under REQ-COMMON-01F.
- REQ-COMMON-06B:
  The Proof Verifier MUST NOT decode, interpret, or apply the Authorized
  Transaction Data. Necessity: transaction semantics belong to the Consumer
  that fixed the operation domain.
- REQ-COMMON-06C (upholds SP-BIND-01):
  The Proof Verifier MUST reject a submission whose Chain ID differs from the
  one it observes, or whose Platform Verifier Version differs from the one it
  dispatched on. Necessity: both are bound in the digest, so a mismatch means
  the evidence was authorized for another chain or another proof statement.

The Notary Fee of §9.1 is charged at the bottom of this
path, so native value passes down it and any excess returns to the Consumer.

- REQ-COMMON-06D:
  The Proof Verifier and the Platform Verifier MUST each reject a call whose
  native value differs from the value that role currently requires, read from
  the quotation of REQ-COMMON-06E before forwarding. The Proof Verifier and
  the Platform Verifier MUST each forward exactly the value the role they
  invoke requires. Necessity: exact value at every hop
  needs no refund path, so no partial-failure or reentrancy rule is required
  and no value can be captured in transit.
- REQ-COMMON-06E:
  The Proof Verifier MUST expose a fee quotation for an identity platform and
  Platform Verifier Version covering the whole verification path. Necessity: a
  Consumer cannot attach a correct fee if quoting requires knowing the path's
  internal topology.

## 6. Canonical OAuth serialization

- REQ-COMMON-07:
  The Implementation MUST serialize each listed parameter tuple with the WHATWG
  `application/x-www-form-urlencoded` serializer, taking UTF-8 input, encoding
  space as `+`, and using uppercase hexadecimal percent escapes. Necessity:
  byte-exact request reproduction across implementations, without which the
  fixed range layout of §9 does not hold. This is a runtime serialization
  rule; no circuit re-verifies it.
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
  The Canonical Runtime MUST forward an authorization response only to the
  compiled application origin.
- REQ-COMMON-31 (upholds SP-DELIVERY-01):
  The Canonical Runtime MUST ignore a forwarding target supplied in the
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
PKCE_DOMAIN    = keccak256("libid.identity.pkce")
pkceBinding    = PKCE_DOMAIN || authorizationDigest || pkceNonce
verifierHash   = SHA256(pkceBinding)
code_verifier  = BASE64URL_NOPAD(verifierHash)
code_challenge = BASE64URL_NOPAD(SHA256(ASCII(code_verifier)))
```

- REQ-COMMON-12 (upholds SP-BIND-01):
  The Canonical Runtime MUST derive `code_verifier` from `PKCE_DOMAIN`, the
  Authorization Digest, and `pkceNonce` as shown above. `PKCE_DOMAIN` carries
  no version: the Authorization Digest already binds
  `platformVerifierVersion`, and a change to this construction is a change to
  the proof statement, which bumps that version and its Platform Verifier.
- REQ-COMMON-13 (upholds SP-BIND-01):
  The Canonical Runtime MUST draw `pkceNonce` freshly per authorization
  attempt from a cryptographically secure random source. Necessity: the nonce
  becomes public at submission, so a nonce reused across attempts of one
  Authorization Digest would publish the verifier of an earlier attempt whose
  code may still be live.
- REQ-COMMON-14 (upholds SP-BIND-01):
  The Canonical Runtime MUST NOT emit `pkceNonce` before its token exchange
  completes, as a platform parameter, a redirect value, or a log field.
  Necessity: until the code is redeemed, whoever learns the nonce can derive
  the verifier and redeem an intercepted code; afterwards the code is spent
  and the nonce protects nothing.
- REQ-COMMON-15 (upholds SP-BIND-01):
  The Platform Profile MUST reveal the `code_verifier` range of its token
  request. The Consumer MUST carry `pkceNonce` in the submission.
- REQ-COMMON-15A (upholds SP-BIND-01):
  The Platform Verifier MUST recompute `code_verifier` from the Authorization
  Digest and the submitted `pkceNonce`. The Platform Verifier MUST reject a
  submission whose revealed verifier differs byte for byte. Necessity: this is what binds the
  digest to the token exchange. Retargeting an attestation to another digest
  would require a second-preimage of the revealed verifier.

A fresh `pkceNonce` per attempt gives a retry of the same Authorization Digest
a distinct verifier, and keeps `code_verifier` unpredictable to anyone holding
only the public digest for as long as that matters — until the code is
redeemed. The verifier and the nonce are published afterwards, which is what
lets the Platform Verifier check this binding itself instead of trusting a
proof statement about values it cannot see. Both verifier and challenge are exactly 43 unpadded
base64url characters. `PKCE_DOMAIN` separates this hash from any other
construction over the same digest; it costs nothing, because a 64-byte and a
96-byte preimage both occupy two SHA-256 blocks.

Conformance vector, for the Authorization Digest of §5 and
`pkceNonce = 0x4444444444444444444444444444444444444444444444444444444444444444`:

```text
PKCE_DOMAIN    = 0x3961dfe56cd0f2d94e72a15b96df889fbb46968cdb37518830fc0077b0730a01
verifierHash   = 0x88c493361ea0424467046958d5cd0c50eb03ecc08ee06f02ee9875fe0219b392
code_verifier  = iMSTNh6gQkRnBGlY1c0MUOsD7MCO4G8C7ph1_gIZs5I
code_challenge = BhFqYIY1YnHafYOrrblUswFnjxFF97UvGjSgqugPQvA
```

## 8. Client binding

The OAuth client that issued the evidence is authenticated evidence in its
own right, and it reaches the Consumer through §5.1. The Canonical Runtime
also compares it against the exact client fixed by the immutable ceremony
profile before constructing a verified claim. Client admission is
permissionless: any OAuth application can produce acceptable evidence, and no
Consumer-Chain registration of clients exists.

Every platform returns the client identifier the same way: its exact
authenticated bytes. How those bytes are authenticated differs, because the
evidence differs.

| Identity platform | Authenticated source | How the Platform Verifier authenticates the bytes |
|---|---|---|
| Google | signed ID-Token `aud` | the submission carries the bytes; the Platform Verifier hashes them and requires the digest to equal the proof's audience public input |
| X | `client_id` in the notarized token request | the bytes are a revealed range of an attestation the Notary Service accepted |
| GitHub | `client_id` in the notarized token exchange | the bytes are a revealed range of an attestation the Notary Service accepted |

The client identifier is not secret: it appears in every authorization URL the
user's browser follows. The protocol therefore spends nothing to conceal it,
and returns the readable value rather than a digest of it.

- REQ-COMMON-16 (upholds SP-CLIENT-01):
  The Platform Verifier MUST return the exact authenticated bytes of the
  client identifier. The Platform Verifier MUST NOT return a digest in their
  place. Necessity: one representation across platforms lets a Consumer
  compare, key, and display the identifier without knowing which platform
  produced it.
- REQ-COMMON-16A (upholds SP-CLIENT-01):
  The Platform Verifier MUST reject a submission whose supplied client
  identifier bytes are not authenticated by that platform's evidence, by the
  method its row above fixes. Necessity: bytes a caller supplies and nothing
  checks are the caller's claim, not the platform's.

A Consumer that wants a fixed-size key derives one itself, as the keccak256 of
the returned bytes. Deriving is cheap and lossless; returning only a digest is
not, because the readable value cannot be recovered from it.
- REQ-COMMON-17 (upholds SP-CLIENT-01):
  The Canonical Runtime MUST reject a proof whose client identifier differs
  byte for byte from the client fixed by the selected immutable ceremony
  profile.
- REQ-COMMON-17C (upholds SP-CLIENT-01):
  The Proof Verifier and the Platform Verifier MUST NOT require the exposed
  client identifier to belong to a registered set. The Consumer MAY read the exposed client identifier for its
  own semantics. Necessity: client selection is permissionless application
  policy; authoritative transaction permission comes from the Consumer's
  Transaction Author predicate over the proof-bound Authorized Transaction
  Data.

Redirect origin, frontend origin, and application authorization remain
browser-local and produce no Consumer-Chain effect.

## 9. Notarized transcripts and attestation verification

A proof authenticates bytes, not fields. The Proving Circuit is responsible
for checking the fields the profile needs — and only those fields, never the
whole template. A JSON string check matches the full `"field":"` delimiter,
the value, and its closing quote. JSON unsigned integers and booleans use the
typed local matches of REQ-COMMON-19D. A form-field check asserts a field
boundary, the exact ASCII name and `=`, the value, and the next `&` or body end.
Because the authenticated parser outputs satisfy ASM-PROV-06 and ASM-PROV-07,
these local checks provide the required field meaning without the impractical
proving cost of a complete JSON or form parser. Hidden ranges stay behind the
pinned attestation format's range commitments; the circuit links transcripts
through those commitments and binds the Authorization Digest.

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
  The Platform Profile MUST pin the exact Notary Service and the attestation
  format it accepts. The Implementation MUST use that format's native
  commitment for every hidden range. The Proving Circuit MUST open each hidden
  range whose value the profile checks. A profile pinning neither is
  ineligible.
- REQ-COMMON-38:
  The Platform Profile MUST pin the hash algorithm of every range commitment
  its pinned attestation format carries. The Platform Verifier MUST reject an
  attestation whose range commitments use any other algorithm. Launch
  profiles pin SHA-256. Necessity: the notarization library's default commit
  algorithm is BLAKE3 while the Proving Circuit computes SHA-256, so a prover
  left on library defaults produces commitments the circuit cannot open.
- REQ-COMMON-18A (upholds SP-EXCHANGE-01):
  The Platform Verifier MUST check that the revealed ranges and hidden-range
  commitments tile the transcript in the exact layout its profile fixes, with
  each hidden range bounded by revealed anchor bytes. Necessity: the layout is
  a profile constant, and the Notary Service answers only for its own
  signature over what it observed.

Tiling accounts for the ranges a layout lists; it cannot see bytes the
layout never mentions. A notarized request that commits a credential range
therefore carries a signed transcript length, covers that length exactly,
and admits exactly one anchored occurrence of the credential header. The
committed range is then the only region the Platform Verifier cannot read,
and its offset and length follow from the revealed ranges around it.

- REQ-COMMON-35 (upholds SP-EXCHANGE-01):
  For a notarized request whose Platform Profile commits a credential
  range, the Platform Verifier MUST require the revealed ranges plus the
  committed range to account for exactly the signed transcript length of
  the request direction, with no gap and no overlap. Necessity: a check
  anchored on what a revealed prefix starts and ends with leaves the
  remainder of the request invisible; exact coverage leaves the committed
  range as the only unseen region and makes its offset and length
  derivable from the ranges around it.
- REQ-COMMON-36 (upholds SP-EXCHANGE-01):
  The Notary Service MUST sign, in each attestation, the total transcript
  length of each direction of the session it observed. The Platform Verifier
  MUST take the transcript length used for the coverage check of
  REQ-COMMON-35 from that signed value and from nothing else. Necessity:
  without a signed length, bytes past the last revealed range are
  invisible, which is what makes a planted-header request pass every
  substring-anchored check.
- REQ-COMMON-39 (upholds SP-EXCHANGE-01):
  The Platform Verifier MUST normalize the revealed request bytes by
  ASCII-lowercasing them and removing every space and horizontal tab. The
  Platform Verifier MUST leave carriage-return and line-feed bytes in
  place. The Platform
  Verifier MUST require exactly one occurrence of the normalized,
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
  The Platform Verifier MUST require the raw transcript bytes immediately
  before the committed range to be exactly `\r\nauthorization: Bearer `,
  and the raw transcript bytes immediately after it to be exactly `\r\n`.
  Necessity: this frames the committed range as one header line's value by
  construction, so the credential literal cannot be hidden inside another
  header's value, and a request with one honest `authorization` header
  cannot commit a range positioned somewhere else. Two fixed comparisons
  at known offsets replace a derived one.
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
- REQ-COMMON-19C (upholds SP-BIND-01, SP-EXCHANGE-01):
  The Proving Circuit extracting a field from an
  `application/x-www-form-urlencoded` request MUST assert that the match begins
  at byte zero or immediately after `&`, followed by the exact ASCII field
  name, `=`, the charset-constrained value, and then `&` or the authenticated
  body end. The circuit does not scan the rest of the body for duplicates;
  that property is ASM-PROV-07.
- REQ-COMMON-19A (upholds SP-EXCHANGE-01):
  The Platform Verifier extracting a field from revealed attestation bytes
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
authenticated by the attestation itself, so the Platform Verifier compares
them against its profile constants and no circuit compiles a platform endpoint
constant.

- REQ-COMMON-21 (upholds SP-BIND-01):
  The Notary Service MUST authenticate the TLS server identity of the
  session it verifies.
- REQ-COMMON-21A (upholds SP-BIND-01):
  The Platform Verifier MUST compare the authenticated authority, and the
  method and path revealed in the request, byte for byte with the profile
  constants it pins.
- REQ-COMMON-21B (upholds SP-EXCHANGE-01):
  The Implementation MUST construct every notarized request with the media type
  and `redirect_uri` from its immutable deployment profile. Neither value is a
  Consumer input. Necessity: media type selects the platform's request parser,
  while redirect URI is application delivery configuration rather than
  Consumer-Chain identity authority.
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

An attestation is authenticated on the Consumer Chain, not inside the Proving
Circuit. The Notary Service takes attested data and its notary
signature and answers one question: is this attestation authentic. Verifying
is a metered service and carries a fixed fee.

- REQ-COMMON-33 (upholds SP-EXCHANGE-01):
  The Notary Service MUST take attested data and its notary signature and
  return exactly one accept-or-reject decision covering that signature, the
  transcript commitment, and whether the revealed bytes and range openings
  match the transcript. The Notary Service MUST NOT decide anything
  profile-specific.
- REQ-COMMON-33A (upholds SP-EXCHANGE-01):
  The Notary Service MUST reject a signature outside the notary keys it
  currently holds as trusted.
- REQ-COMMON-34:
  The Notary Service MUST charge one fixed Notary Fee
  for each verification. The Notary Service MUST reject a verification
  whose fee was not delivered. Necessity: verification is a metered service,
  and an unpaid verification is unmetered.
- REQ-COMMON-34A:
  The Consumer MUST deliver that fee in the Consumer Chain's native asset
  over the native value-transfer path its Chain Profile fixes. Necessity:
  cross-component interoperability without naming one execution environment's
  transfer mechanism.
- REQ-COMMON-34B:
  The Chain Profile MUST define that native value-transfer path and the unit
  the fee is denominated in. Necessity: the fee is unpayable without both.
- REQ-COMMON-34C:
  The Notary Fee MUST NOT vary with the attested content,
  the Transaction Author, the Fee Payer, or the Transaction Submitter.
  Necessity: a fee that varies by principal or content is selective
  censorship of a permissionless service.
- REQ-COMMON-34D:
  The Notary Service MUST expose its current fee for reading before a
  submission is constructed. Necessity: a fee that cannot be read cannot be
  bounded.
- REQ-COMMON-34E:
  The Notary Service MUST reject a verification whose native value differs
  from its current fee. Necessity: the fee is Notary-Service-controlled state
  that can change between constructing a transaction and including it;
  rejecting a mismatch fails the transaction visibly rather than silently
  overcharging the Fee Payer, and leaves no overpayment to refund.

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
  The Consumer MUST complete an otherwise valid authority operation even when
  its mutable metadata is stale. The Consumer MUST update
  mutable metadata and its watermark only when `metadataObservedAt` is strictly
  newer than the stored watermark. The Consumer MUST leave both
  unchanged for older or equal evidence, including equal evidence carrying
  conflicting metadata.
- REQ-COMMON-26 (upholds SP-FRESH-01):
  The Platform Verifier MUST derive `proofValidUntil` from the platform profile's
  authenticated validity input and any current protocol parameter that profile
  names. The Platform Verifier MUST reject a submission where
  `Block Time >= proofValidUntil`.
- REQ-COMMON-27 (upholds SP-FRESH-01):
  The Platform Verifier MUST NOT accept a caller-supplied validity bound.
- REQ-COMMON-28 (upholds SP-FRESH-01):
  The Implementation MUST perform every timestamp addition and comparison with
  checked arithmetic before narrowing to an unsigned 64-bit integer.

## 11. Conformance

Roles: Canonical Runtime, Redirect Runtime, Token-Exchange Service, Proving
Circuit, Proof Verifier, Platform Verifier, Notary Service, Consumer. The
Implementation claiming a role MUST pass the vectors covering
the constructions that role implements.

- TEST-COMMON-01 (exercises REQ-COMMON-01, REQ-COMMON-01A, REQ-COMMON-01B, REQ-COMMON-01C, REQ-COMMON-01D, REQ-COMMON-01E, REQ-COMMON-01F, REQ-COMMON-02, REQ-COMMON-02A):
  The §5 digest vector reproduces `authorizationDigest` exactly.
- TEST-COMMON-02 (exercises REQ-COMMON-01A, REQ-COMMON-01F):
  A submission carrying a foreign operation domain, or Authorized Transaction
  Data with trailing bytes, a noncanonical encoding, or an argument shape
  other than the transaction kind's exact format, is rejected.
- TEST-COMMON-02A (exercises REQ-COMMON-01C, REQ-COMMON-01D, REQ-COMMON-04):
  The Consumer rejects an empty, malformed, or caller-substituted Chain ID; a
  caller-substituted Block Time; and a Transaction Submitter that cannot satisfy
  the transaction kind's Transaction Author predicate.
- TEST-COMMON-03 (exercises REQ-COMMON-03, REQ-COMMON-03A):
  Resubmitting a recorded Authorization Digest is rejected.
- TEST-COMMON-04 (exercises REQ-COMMON-01B, REQ-COMMON-01E):
  Two ceremonies over identical Authorized Transaction Data yield distinct
  digests, and a digest carrying a foreign `platformVerifierVersion` is
  rejected.
- TEST-COMMON-05 (exercises REQ-COMMON-07, REQ-COMMON-08, REQ-COMMON-10):
  The §6 serializer vector reproduces byte for byte.
- TEST-COMMON-06 (exercises REQ-COMMON-09, REQ-COMMON-11):
  A request carrying an appended caller parameter is rejected, and a redirected
  notarized request is abandoned.
- TEST-COMMON-07 (exercises REQ-COMMON-12, REQ-COMMON-13, REQ-COMMON-15, REQ-COMMON-15A):
  The §7 PKCE vector reproduces `code_verifier` and `code_challenge` exactly;
  a token attestation that hides its `code_verifier` range is rejected; and a
  submission whose `pkceNonce` does not reproduce the revealed verifier from
  the Authorization Digest is rejected.
- TEST-COMMON-08 (exercises REQ-COMMON-14):
  No artifact, log, or platform parameter emitted before the token exchange
  completes contains `pkceNonce`. Verification: inspection of the emitted
  artifacts.
- TEST-COMMON-09 (exercises REQ-COMMON-16, REQ-COMMON-16A, REQ-COMMON-17, REQ-COMMON-17C, REQ-COMMON-22A):
  The Canonical Runtime rejects a proof carrying a client identifier other
  than its immutable profile's client, while a proof carrying a client
  identifier registered nowhere remains acceptable to the Platform Verifier.
  Every platform returns the identifier as exact bytes, never a digest, and a
  submission whose supplied bytes its evidence does not authenticate is
  rejected.
- TEST-COMMON-10 (exercises REQ-COMMON-17A, REQ-COMMON-17B, REQ-COMMON-18, REQ-COMMON-18A, REQ-COMMON-19, REQ-COMMON-19A, REQ-COMMON-19B, REQ-COMMON-19C, REQ-COMMON-20, REQ-COMMON-22):
  An authenticated JSON response carrying a second copy of a templated field
  in its revealed bytes is rejected; a transcript whose
  extraction delimiter matches at two positions in the revealed bytes is
  rejected; a witnessed value containing the closing delimiter, or a pattern
  placed in padding past the payload length, fails to prove; a form-field match
  not bounded by the body start or `&` and the next `&` or body end fails to
  prove; and a transcript whose ranges do not tile the profile layout is
  rejected. A profile that pins no Notary Service or no attestation format is
  ineligible.
- TEST-COMMON-11 (exercises REQ-COMMON-21, REQ-COMMON-21A, REQ-COMMON-21B, REQ-COMMON-21C):
  The Platform Verifier rejects an authenticated foreign authority, method,
  or path. The request constructor refuses a media type or `redirect_uri`
  differing from its immutable deployment profile. One verifying key serves
  two deployments configured with different clients and redirect URIs.
- TEST-COMMON-12 (exercises REQ-COMMON-23, REQ-COMMON-24, REQ-COMMON-25):
  A fractional, negative, overflowing, or textual timestamp is rejected, and
  an evidence time taken from an HTTP `Date` header or a local clock rather
  than the platform-profile value is rejected.
- TEST-COMMON-13 (exercises REQ-COMMON-25A, REQ-COMMON-26, REQ-COMMON-27, REQ-COMMON-28):
  A submission at or after `proofValidUntil` is rejected, a caller-supplied
  validity bound has no effect, and reverse-order older or equal-conflicting
  metadata does not change the newer stored metadata or watermark while the
  otherwise valid authority operation succeeds.
- TEST-COMMON-14 (exercises REQ-COMMON-30, REQ-COMMON-31):
  A redirect request carrying a forwarding target forwards to the
  compiled application origin instead.
- TEST-COMMON-15 (exercises REQ-COMMON-29):
  Every redirect URI registered against each production client resolves to an
  origin the deployment controls. Verification: audit of the platform client
  configuration.
- TEST-COMMON-16 (exercises REQ-COMMON-05, REQ-COMMON-05A, REQ-COMMON-05B, REQ-COMMON-05C, REQ-COMMON-05D, REQ-COMMON-05E, REQ-COMMON-06, REQ-COMMON-06A, REQ-COMMON-06B, REQ-COMMON-06C, REQ-COMMON-06D, REQ-COMMON-06E):
  A platform and version pair outside the Supported Version Set is rejected;
  a caller-supplied verifier address has no effect; two supported versions of
  one platform both verify; a submission naming an operation domain other
  than the one the ceremony committed fails digest recomputation; a Consumer
  receiving a domain it does not own rejects the result; a foreign Chain ID
  and a version other than the dispatched one are each rejected; a rejected
  verification returns no transaction data; an accepted verification returns
  the client identifier; the quotation covers the whole path; and a call
  whose native value differs from the quoted value is rejected at every
  hop.
- TEST-COMMON-17 (exercises REQ-COMMON-33, REQ-COMMON-34B, REQ-COMMON-33A, REQ-COMMON-34, REQ-COMMON-34A, REQ-COMMON-34C, REQ-COMMON-34D, REQ-COMMON-34E):
  An attestation carrying a foreign notary signature is rejected; a
  verification whose fee was not delivered is rejected; the charged fee is
  identical across differing attested content, authors, payers, and
  submitters; the current fee is readable before submission; and a
  verification whose native value differs from the current fee is
  rejected.
- TEST-COMMON-18 (exercises REQ-COMMON-35, REQ-COMMON-36, REQ-COMMON-39, REQ-COMMON-40):
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
  followed by `\r\n` in the raw bytes is rejected.
- TEST-COMMON-19 (exercises REQ-COMMON-37, REQ-COMMON-38):
  An opened bearer containing a carriage-return or line-feed byte fails to
  prove, and an attestation whose range commitments use an algorithm other
  than the profile's pinned SHA-256 is rejected.

## 12. Security Considerations

This document enforces SP-BIND-01, SP-CLIENT-01, SP-EXCHANGE-01,
SP-FRESH-01, and SP-REPLAY-01 under the assumptions of §3.

Replay within one Consumer deployment is prevented by `authorizationNonce`
and REQ-COMMON-03. Replay across Consumer Chains is prevented by the Chain ID
in the digest. Replay across Platform Verifier Versions is prevented by
`platformVerifierVersion`. The digest does not prevent cross-deployment replay
because it binds no Consumer identifier. Every Consumer transaction
kind therefore defines an authorization predicate over the authenticated
Transaction Author and the proof-bound Authorized Transaction Data. A copied
proof creates no authority for a submitter that cannot satisfy that predicate.

Client binding rejects evidence issued to a client other than the one whose
ceremony the Canonical Runtime opened. The check is local because independent
application deployments own different OAuth clients. The Consumer
authenticates the proof-bound transaction and Transaction Author instead; it
does not maintain an OAuth-client allowlist or admit applications on the
Consumer Chain.

Consent-screen phishing remains outside protocol enforcement. A hostile site
borrowing an honest deployment's OAuth client does not receive its response,
because the Identity Platform delivers it only to that client's registered
redirect URI (ASM-PROV-01). A hostile site using its own client and redirect can
receive evidence from a ceremony the user approves; the proof-bound operation,
Transaction Author authentication, and any composition-owned transaction authorization
contain that case. The ceremony layer defines no extra confirmation page. The
registered redirect URI list and the origins on it are therefore trust-bearing
configuration.

The verification path of §5.1 concentrates authority. A Consumer accepts the
Proof Verifier's decision, operation domain, and Authorized Transaction Data
without rechecking them, so a compromised Proof Verifier authorizes arbitrary
transactions at every Consumer at once; a compromised Platform Verifier does
the same for one platform and version; a compromised Notary Service accepts
attestations no notary signed. Their selection is verifier governance, which
is therefore a trust root rather than configuration. The Notary Fee is a
liveness dependency only: it cannot forge evidence, but an unbounded fee stops
every ceremony for that platform.

The handle, the platform user identifier, and the client identifier are
published deliberately. A binding exists to be read, and each of these values
is already discoverable from the identity platform, so the protocol treats
none of them as confidential. Only the bearer, the client secret,
`pkceNonce`, and the transcript bytes outside a profile's revealed ranges are
withheld.

Input validation, denial of service, trust-anchor lifecycle, and browser
origin, storage, and credential boundaries are owned by the browser
specification. Per-platform failure behavior, transports, and trust roots are
owned by the [platform profiles](platform-ceremonies.md).

## 13. References

Normative: [RFC6749], [RFC7636], [RFC7519], [OIDC].

Informative: [RFC9700].
