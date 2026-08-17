# Common ceremony rules

Part of the [libID protocol specification](libid.md).

## 1. Scope

This document is the normative owner of the constructions shared by two or
more platform ceremonies: the claim digest, OAuth request serialization, the
PKCE construction, notarized-transcript extraction, client binding, and
evidence-time rules. Each platform profile owns its endpoints, ordered
fields, authenticated response locations, canonical user-ID encoding, and
proof-validity ceiling. The browser protocol owns redirect transport,
persistence, continuation, and application control flow and code composition.

## 2. Terminology

Claim Digest: The 32-byte value binding one authorization to the Authorized
   Transaction Data that will consume it, constructed as specified in §5.

Authorized Transaction Data: Opaque canonical bytes carried in the Claim
   Digest and decoded by the Consumer into one transaction's expected
   arguments.

Claim Random: Fresh 32-byte randomness that makes each Claim Digest unique.

Platform Verifier: The on-chain contract selected for one identity platform
   that verifies a Platform Verifier Version.

Platform Verifier Version: The unsigned 16-bit version of the proof statement
   accepted by the selected Platform Verifier. It is not a version of the
   ceremony process or a mutable verifier-authority revision.

Consumer Chain: The chain whose canonical state transition consumes a libID
   proof.

Consumer: The deterministic contract, program, module, or native transition
   handler on the Consumer Chain that verifies a libID proof and applies its
   Authorized Transaction Data.

Transaction Author: The Consumer-Chain principal whose authenticated authority
   permits the transaction. It can be an account, multisignature contract,
   program, module, or equivalent chain principal.

Fee Payer: The principal economically charged for a transaction. It can differ
   from the Transaction Author.

Transaction Submitter: The principal that delivers a transaction to the
   Consumer Chain. Submission alone grants no transaction authority.

Chain ID: The canonical nonempty ASCII identifier fixed by a Consumer Chain's
   Chain Profile.

Block Time: The Consumer Chain's consensus-provided integer Unix time in
   seconds, bounded by an unsigned 64-bit integer.

Chain Profile: The normative mapping from one Consumer Chain to its Chain ID,
   Transaction Author authentication, Block Time, and Authorized Transaction
   Data encoding.

Platform Ceremony: The complete operation that turns one platform
   authorization into a locally verified claim.

Identity Platform: Google, X, GitHub, or a future source of authenticated
   identity evidence. "Provider" is reserved for the formal OIDC term and for
   the EIP-1193 wallet provider.

Token-Proof Service: The confidential-client component that performs and
   proves a token exchange requiring a client secret.

Canonical Runtime: The immutable browser release that constructs claim
   digests, verifies attestations, and builds proofs.

Attestation Verifier: The exact TLSNotary attestation format and verifier
   artifact pinned by a Platform Profile. It authenticates the notary
   signature, transcript commitment, disclosure ranges, and creation time.

## 3. Assumptions

- ASM-CHAIN-01:
  The Consumer Chain authenticates the Transaction Author and supplies Block
  Time within tolerance of real time.
- ASM-CHAIN-02:
  The Consumer observes exactly one canonical Chain ID supplied by its Consumer
  Chain.
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
  observed, and signs their creation time no more than
  `maxFutureAttestationSkew` ahead of real time.
- ASM-PROOF-01:
  A proof accepted under a profile's selected verifier artifact satisfies
  that profile's complete proof statement. Registry governance does not
  replace an artifact without selecting a new profile or verifier revision.
- ASM-BROWSER-01:
  The Canonical Runtime executes unmodified, and the user agent enforces the
  same-origin policy over authorization responses.

## 4. Security properties

The properties below survive a malicious application operator and, where
present, a malicious Token-Proof Service under their cited assumptions. They
assume an unmodified Canonical Runtime, the selected verifier artifact, the
Consumer, and Registry configuration. Compromise of the applicable
identity-platform signing root, notary key, proof verifier, Registry governance,
browser supply chain, or Consumer Chain invalidates the properties that depend
on it.

- SP-BIND-01:
  Evidence produced by a ceremony discharges only for the Authorized
  Transaction Data committed in its Claim Digest. Depends on ASM-PROV-02,
  ASM-PROV-05, ASM-PROV-06,
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
  invariant in the Consumer.
- SP-REPLAY-01:
  Within one Consumer deployment, one ceremony authorizes at most
  one authoritative effect. Depends on ASM-CHAIN-01, ASM-CHAIN-02. Evidence:
  checked invariant in the Consumer.

## 5. Claim digest

The Claim Digest is the single value binding one authorization to the
transaction that will consume it. `U16BE` and `U32BE` are fixed-width unsigned
big-endian encodings. `UTF8` emits the exact UTF-8 bytes of a string.

```text
CLAIM_DIGEST_V1 = keccak256(UTF8("libid.claim-digest.v1"))

claimPreimage =
    CLAIM_DIGEST_V1
    || U16BE(platformVerifierVersion)
    || U16BE(BYTE_LENGTH(UTF8(chainId)))
    || UTF8(chainId)
    || operationDomain
    || claimRandom
    || U32BE(BYTE_LENGTH(transactionData))
    || transactionData

claimDigest = keccak256(claimPreimage)
```

- REQ-COMMON-01 (upholds SP-BIND-01):
  The Canonical Runtime MUST construct every Claim Digest as the keccak256 of
  exactly the byte concatenation above. The Canonical Runtime MUST encode
  `platformVerifierVersion` in exactly two bytes, the Chain ID byte length in
  exactly two bytes, and the Authorized Transaction Data byte length in
  exactly four bytes. The Canonical Runtime MUST reject a value which does not
  fit its fixed-width field.
- REQ-COMMON-01A (upholds SP-BIND-01):
  The Consumer MUST fix one ASCII operation-domain string for each transaction
  kind and derive `operationDomain = keccak256(UTF8(domainString))`. The
  Consumer MUST fix one exact canonical Authorized Transaction Data format for
  that kind. The Consumer MUST NOT assign the same operation domain to
  transaction kinds that can produce different authoritative effects.
- REQ-COMMON-01B (upholds SP-BIND-01, SP-REPLAY-01):
  The Chain Profile MUST fix one canonical Chain ID containing a globally
  domain-separated namespace and reference. The Chain Profile MUST require the
  exact ASCII grammar `[a-z0-9-]{3,16}:[A-Za-z0-9._-]{1,64}`. The Consumer MUST
  obtain that Chain ID from the Consumer Chain rather than Authorized
  Transaction Data or another caller-controlled input.
- REQ-COMMON-01C (upholds SP-BIND-01, SP-FRESH-01):
  The Chain Profile MUST define how the Consumer Chain authenticates the
  Transaction Author, supplies Block Time, and canonically encodes Authorized
  Transaction Data. The Consumer MUST obtain the Transaction Author and Block
  Time from that authenticated environment rather than caller-controlled data.
  Necessity: the ceremony rules must not depend on one execution environment's
  caller, clock, or transaction encoding.
- REQ-COMMON-02 (upholds SP-BIND-01):
  The Consumer MUST recompute the Claim Digest from the immutable operation
  domain, the Platform Verifier Version accepted by the selected Platform
  Verifier, its observed Chain ID, and the `claimRandom` and Authorized
  Transaction Data supplied in the submission.
- REQ-COMMON-02A (upholds SP-BIND-01):
  The Consumer MUST reject a proof whose Claim Digest public input differs from
  the digest it recomputed.
- REQ-COMMON-03 (upholds SP-BIND-01):
  The Consumer MUST decode Authorized Transaction Data into the argument format
  of the transaction kind being invoked. The Consumer MUST reject trailing
  bytes, noncanonical encodings, and data it cannot decode into that exact
  format.
- REQ-COMMON-04 (upholds SP-REPLAY-01):
  The Canonical Runtime MUST draw `claimRandom` from a cryptographically secure
  random source, freshly for each ceremony.
- REQ-COMMON-05 (upholds SP-REPLAY-01):
  The Consumer MUST record every Claim Digest it accepts.
- REQ-COMMON-05A (upholds SP-REPLAY-01):
  The Consumer MUST reject a Claim Digest it has already recorded.
- REQ-COMMON-06 (upholds SP-BIND-01):
  The Consumer MUST reject a submission whose `platformVerifierVersion`
  differs from the version accepted by the selected Platform Verifier.
- REQ-COMMON-06A (upholds SP-BIND-01):
  The Consumer MUST authenticate the Transaction Author under its Chain Profile
  and enforce the invoked transaction kind's authorization predicate before
  applying any authoritative effect. The Consumer MUST NOT treat the
  Transaction Submitter as the Transaction Author unless the Chain Profile
  authenticates them as the same principal.

`operationDomain` is the operation identifier and protocol separator. Each
Consumer transaction kind fixes one domain string, and no two kinds that can
produce different authoritative effects share it. A further libID transaction
takes a new domain string, not a new digest field. The Platform Ceremony remains
reusable because it proves the resulting Claim Digest rather than interpreting
the operation domain or Authorized Transaction Data.

`platformVerifierVersion` identifies the proof statement accepted by the
selected Platform Verifier. It is bound into the digest so evidence produced
for one version cannot be presented under another, and it is carried in the
submission so the Consumer can require the exact version selected for that
identity platform. `CLAIM_DIGEST_V1` separately versions this digest layout.

`transactionData` carries one transaction's arguments as opaque bytes. The
consumer protocol fixes their exact canonical encoding and validation. A name
claim can encode its Transaction Author; a transaction that installs a session
key encodes that key alongside it. The digest layout does not change between
transaction kinds.

Transaction Author, Fee Payer, and Transaction Submitter are separate roles. A
consumer protocol can require the Transaction Author to pay a fee, but that
policy does not make the submitter authoritative or change the Claim Digest
layout.

`claimRandom` makes each digest unique, which is what allows the digest
itself to serve as the replay nullifier. No platform identifier and no user
identifier appear in the digest or in the nullifier derived from it.

Conformance vector, for `operationDomain =
keccak256(UTF8("libid.claim-identity"))`, `platformVerifierVersion = 1`, `chainId =
"example:1"`, `claimRandom = 0x5555…5555`, and `transactionData =
0x00010203`:

```text
CLAIM_DIGEST_V1 = 0xa8699d8cc7e915bfb8736b8eb063b4a474222ed61a0fcd438d96e867157d0339
operationDomain = 0xcb29bed0428519ef88a3d670e8203db76e06f41aca3e684e2c63b516c9b93e1b
claimPreimage    = 0xa8699d8cc7e915bfb8736b8eb063b4a474222ed61a0fcd438d96e867157d0339000100096578616d706c653a31cb29bed0428519ef88a3d670e8203db76e06f41aca3e684e2c63b516c9b93e1b55555555555555555555555555555555555555555555555555555555555555550000000400010203
claimDigest      = 0xc6fdbd8afe88e9137e8d4d5c821095cee12d7803689a61c4ba204f4c3ccd9d4c
```

Each platform carries the Claim Digest in the form its authorization allows:
Google as the OIDC `nonce`, X and GitHub through the PKCE construction in §7.

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

X and GitHub bind the Claim Digest through S256 PKCE.

```text
PKCE_V1        = keccak256("libid.identity.pkce.v1")
pkceBinding    = PKCE_V1 || claimDigest || pkceNonce
verifierHash   = SHA256(pkceBinding)
code_verifier  = BASE64URL_NOPAD(verifierHash)
code_challenge = BASE64URL_NOPAD(SHA256(ASCII(code_verifier)))
```

- REQ-COMMON-12 (upholds SP-BIND-01):
  The Canonical Runtime MUST derive `code_verifier` from `PKCE_V1`, the Claim
  Digest, and `pkceNonce` as shown above.
- REQ-COMMON-13 (upholds SP-BIND-01):
  The Canonical Runtime MUST draw `pkceNonce` freshly per authorization attempt
  from a cryptographically secure random source.
- REQ-COMMON-14 (upholds SP-BIND-01):
  The Canonical Runtime MUST NOT emit `pkceNonce` as a platform parameter, a
  public proof output, a redirect value, or a log field.
- REQ-COMMON-15 (upholds SP-BIND-01):
  The Proving Circuit MUST recompute `code_verifier` from the public Claim
  Digest and the private `pkceNonce`. The Proving Circuit MUST assert byte
  equality with the verifier in the attested request.

A fresh `pkceNonce` per attempt gives a retry of the same Claim Digest a
distinct verifier. Both verifier and challenge are exactly 43 unpadded
base64url characters.

Conformance vector, for the Claim Digest of §5 and
`pkceNonce = 0x4444444444444444444444444444444444444444444444444444444444444444`:

```text
PKCE_V1        = 0x8e444e2acbb12cd1aa318b8613d3628d4ce9f16212d44ccf6fd27810c86bd552
verifierHash   = 0xe5987b44783a301eeabbb01afec8bced2c67f980062a061d2622281293576677
code_verifier  = 5Zh7RHg6MB7qu7Aa_si87Sxn-YAGKgYdJiIoEpNXZnc
code_challenge = HbLDrNUWkmbx1diMiwo8zH18rM94_vSgQnHQZoYpf6U
```

## 8. Client binding

The OAuth client that issued the evidence is a public proof input. The
Canonical Runtime compares it against the exact client fixed by the immutable
ceremony profile before constructing a verified claim. Client admission is
permissionless: any OAuth application can produce acceptable evidence, and no
Consumer-Chain registration of clients exists.

| Identity platform | Authenticated source of the client identifier |
|---|---|
| Google | signed ID-Token `aud` |
| X | `client_id` in the notarized token request |
| GitHub | `client_id` in the notarized token exchange |

- REQ-COMMON-16 (upholds SP-CLIENT-01):
  The Proving Circuit MUST expose the authenticated client identifier as a
  public proof input so the Canonical Runtime can check it locally.
- REQ-COMMON-17 (upholds SP-CLIENT-01):
  The Canonical Runtime MUST reject a proof whose client identifier differs
  byte for byte from the client fixed by the selected immutable ceremony
  profile.
- REQ-COMMON-17C (upholds SP-CLIENT-01):
  The Verifier MUST NOT require the exposed client identifier to belong to a
  registered set. The Consumer MAY read the exposed client identifier for its
  own semantics. Necessity: client selection is permissionless application
  policy; authoritative transaction permission comes from the Consumer's
  Transaction Author predicate over the proof-bound Authorized Transaction
  Data.

Redirect origin, frontend origin, and application authorization remain
browser-local and produce no Consumer-Chain effect.

## 9. Notarized-transcript extraction

A proof authenticates bytes, not fields. The Proving Circuit is responsible
for checking the fields the profile needs — and only those fields, never the
whole template. A JSON string check matches the full `"field":"` delimiter,
the value, and its closing quote. JSON unsigned integers and booleans use the
typed local matches of REQ-COMMON-19D. A form-field check asserts a field
boundary, the exact ASCII name and `=`, the value, and the next `&` or body end.
Because the authenticated parser outputs satisfy ASM-PROV-06 and ASM-PROV-07,
these local checks provide the required field meaning without the impractical
proving cost of a complete JSON or form parser. Hidden ranges stay behind the
pinned Attestation Verifier's range commitments; the circuit links transcripts
through those commitments and binds the Claim Digest.

Disclosure and verification are two separate layers. The Platform Profile
fixes a minimal set of revealed ranges; every other byte stays behind a range
commitment native to its pinned Attestation Verifier. These commitments and
openings are verifier inputs, not final libID public proof inputs unless a
profile's public-input table explicitly lists one. Separately, the proof
exposes a minimal set of public inputs, which never includes a credential.

- REQ-COMMON-17A (upholds SP-CLIENT-01):
  The Platform Profile MUST list the exact ranges a notarized session reveals.
- REQ-COMMON-17B (upholds SP-CLIENT-01):
  The Implementation MUST redact every byte outside the ranges its profile
  lists.
- REQ-COMMON-18 (upholds SP-EXCHANGE-01):
  The Platform Profile MUST pin an exact Attestation Verifier artifact and its
  format. The Implementation MUST use that format's native commitment for
  every hidden range. The Proving Circuit MUST open each hidden range whose
  value the profile checks. A profile without a published verifier artifact
  digest is ineligible.
- REQ-COMMON-18A (upholds SP-EXCHANGE-01):
  The Attestation Verifier MUST check that the revealed ranges and hidden-range
  commitments tile the transcript in the exact layout the profile fixes, with
  each hidden range bounded by revealed anchor bytes.
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
  The Consumer extracting a field from revealed attestation bytes
  MUST reject a transcript in which the field's full delimiter matches at
  more than one position. Necessity: an authenticated response value the
  account holder influences, such as a display name, can embed a lookalike
  field.
- REQ-COMMON-20 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST constrain every variable value it opens or
  extracts to the charset the profile states, including values that are never
  disclosed.

Endpoint proof inputs use these canonical byte strings: authority is the
lowercase ASCII TLS server DNS name with no trailing dot, method is the exact
uppercase HTTP method, and path is the origin-form path beginning with `/`
and containing no query. Launch profiles use TCP port 443.

Authority prevents a transcript from an attacker-controlled server from
substituting for the platform; path separates operations on the same server;
method separates operations with different HTTP semantics. Exposing these
authenticated values and comparing them in the Consumer avoids compiling
platform endpoint constants into each circuit without weakening the binding.

- REQ-COMMON-21 (upholds SP-BIND-01):
  The Proving Circuit MUST expose the authenticated TLS server authority,
  request method, and request path as public proof inputs. The Proving Circuit
  MUST bind those values to the notarized session and request. The Proving
  Circuit MUST NOT require them to equal profile constants.
- REQ-COMMON-21A (upholds SP-BIND-01):
  The Consumer MUST compare every authenticated authority, method,
  and path byte for byte with the selected platform profile.
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
not prove the complete grammar of hidden bytes or exclude a second form field;
request soundness additionally depends on ASM-PROV-07.

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
  The Consumer MUST derive `proofValidUntil` from the platform profile's
  authenticated validity input and any current protocol parameter that profile
  names. The Consumer MUST reject a submission where
  `Block Time >= proofValidUntil`.
- REQ-COMMON-27 (upholds SP-FRESH-01):
  The Consumer MUST NOT accept a caller-supplied validity bound.
- REQ-COMMON-28 (upholds SP-FRESH-01):
  The Implementation MUST perform every timestamp addition and comparison with
  checked arithmetic before narrowing to an unsigned 64-bit integer.

## 11. Conformance

Roles: Canonical Runtime, Token-Proof Service, Proving Circuit, Consumer. The
Implementation claiming a role MUST pass the vectors covering
the constructions that role implements.

- TEST-COMMON-01 (exercises REQ-COMMON-01, REQ-COMMON-01A, REQ-COMMON-01B, REQ-COMMON-02, REQ-COMMON-02A):
  The §5 digest vector reproduces `claimDigest` exactly.
- TEST-COMMON-02 (exercises REQ-COMMON-03):
  A submission carrying a foreign operation domain, or Authorized Transaction
  Data with trailing bytes, a noncanonical encoding, or an argument shape
  other than the transaction kind's exact format, is rejected.
- TEST-COMMON-02A (exercises REQ-COMMON-01B, REQ-COMMON-01C, REQ-COMMON-06A):
  The Consumer rejects an empty, malformed, or caller-substituted Chain ID; a
  caller-substituted Block Time; and a Transaction Submitter that cannot satisfy
  the transaction kind's Transaction Author predicate.
- TEST-COMMON-03 (exercises REQ-COMMON-05, REQ-COMMON-05A):
  Resubmitting a recorded Claim Digest is rejected.
- TEST-COMMON-04 (exercises REQ-COMMON-04, REQ-COMMON-06):
  Two ceremonies over identical Authorized Transaction Data yield distinct
  digests, and a digest carrying a foreign `platformVerifierVersion` is
  rejected.
- TEST-COMMON-05 (exercises REQ-COMMON-07, REQ-COMMON-08, REQ-COMMON-10):
  The §6 serializer vector reproduces byte for byte.
- TEST-COMMON-06 (exercises REQ-COMMON-09, REQ-COMMON-11):
  A request carrying an appended caller parameter is rejected, and a redirected
  notarized request is abandoned.
- TEST-COMMON-07 (exercises REQ-COMMON-12, REQ-COMMON-13, REQ-COMMON-15):
  The §7 PKCE vector reproduces `code_verifier` and `code_challenge` exactly.
- TEST-COMMON-08 (exercises REQ-COMMON-14):
  No ceremony artifact, log, or public input contains `pkceNonce`.
  Verification: inspection of the emitted artifacts.
- TEST-COMMON-09 (exercises REQ-COMMON-16, REQ-COMMON-17, REQ-COMMON-17C, REQ-COMMON-22A):
  The Canonical Runtime rejects a proof carrying a client identifier other
  than its immutable profile's client, while a proof carrying a client
  identifier registered nowhere remains acceptable to the Verifier.
- TEST-COMMON-10 (exercises REQ-COMMON-17A, REQ-COMMON-17B, REQ-COMMON-18, REQ-COMMON-18A, REQ-COMMON-19, REQ-COMMON-19A, REQ-COMMON-19B, REQ-COMMON-19C, REQ-COMMON-20, REQ-COMMON-22):
  An authenticated JSON response carrying a second copy of a templated field,
  placed inside or after an undisclosed range, is rejected; a transcript whose
  extraction delimiter matches at two positions in the revealed bytes is
  rejected; a witnessed value containing the closing delimiter, or a pattern
  placed in padding past the payload length, fails to prove; a form-field match
  not bounded by the body start or `&` and the next `&` or body end fails to
  prove; and a transcript whose ranges do not tile the profile layout is
  rejected. A profile without an exact published Attestation Verifier artifact
  digest is ineligible.
- TEST-COMMON-11 (exercises REQ-COMMON-21, REQ-COMMON-21A, REQ-COMMON-21B, REQ-COMMON-21C):
  The Consumer rejects an authenticated foreign authority, method,
  or path. The request constructor refuses a media type or `redirect_uri`
  differing from its immutable deployment profile. One verifying key serves
  two deployments configured with different clients and redirect URIs.
- TEST-COMMON-12 (exercises REQ-COMMON-23, REQ-COMMON-24, REQ-COMMON-25):
  A fractional, negative, overflowing, or textual timestamp is rejected.
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

## 12. Security Considerations

This document enforces SP-BIND-01, SP-CLIENT-01, SP-EXCHANGE-01,
SP-FRESH-01, and SP-REPLAY-01 under the assumptions of §3.

Replay within one Consumer deployment is prevented by `claimRandom` and
REQ-COMMON-05. Replay across Consumer Chains is prevented by the Chain ID in
the digest. Replay across Platform Verifier Versions is prevented by
`platformVerifierVersion`. The digest does not prevent cross-deployment replay
because it binds no Consumer or Registry identifier. Every Consumer transaction
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

Input validation, denial of service, trust-anchor lifecycle, and browser
origin, storage, and credential boundaries are owned by the browser
specification. Per-platform failure behavior, transports, and trust roots are
owned by the [platform profiles](platform-ceremonies.md).

## 13. References

Normative: [RFC6749], [RFC7636], [RFC7519], [OIDC].

Informative: [RFC9700].
