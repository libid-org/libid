# Common ceremony rules

Part of the [libID protocol specification](libid.md).

## 1. Scope

This document is the normative owner of the constructions shared by two or
more platform ceremonies: the claim digest, OAuth request serialization, the
PKCE construction, notarized-transcript extraction, client binding, and
evidence-time rules. Each platform profile owns its endpoints, ordered
fields, authenticated response locations, canonical user-ID encoding, and
proof-validity ceiling. The browser protocol owns redirect transport,
persistence, continuation, and caller control flow and code composition.

## 2. Terminology

Claim Digest: The 32-byte value binding one authorization to the call data
   that will consume it, constructed as specified in §5.

Call Data: Opaque bytes carried in the Claim Digest and decoded by the
   consuming contract into that operation's expected arguments.

Claim Random: Fresh 32-byte randomness that makes each Claim Digest unique.

Protocol Version: The libID protocol revision a ceremony ran under, fixing its
   digest layout, binding construction, and evidence rules.

Platform Ceremony: The complete operation that turns one platform
   authorization into a locally verified claim.

Identity Platform: Google, X, GitHub, or a future source of authenticated
   identity evidence. "Provider" is reserved for the formal OIDC term and for
   the EIP-1193 wallet provider.

Token-Proof Service: The confidential-client component that performs and
   proves a token exchange requiring a client secret.

Canonical Runtime: The immutable browser release that constructs claim
   digests, verifies attestations, and builds proofs.

## 3. Assumptions

- ASM-CHAIN-01:
  The Consuming Contract observes an authentic `msg.sender` and a block
  timestamp within tolerance of real time.
- ASM-CHAIN-02:
  Each deployment is reachable under exactly one chain identifier, and that
  identifier is observable on chain.
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
- ASM-NOTARY-01:
  The configured notary key signs only transcripts it observed.
- ASM-BROWSER-01:
  The Canonical Runtime executes unmodified, and the user agent enforces the
  same-origin policy over authorization responses.

## 4. Security properties

- SP-BIND-01:
  Evidence produced by a ceremony discharges only for the Call Data committed
  in its Claim Digest. Depends on ASM-PROV-02, ASM-PROV-05, ASM-CHAIN-01.
  Evidence: conformance tests (supporting, not proving) plus the collision
  resistance of SHA-256 and keccak256.
- SP-CLIENT-01:
  The Canonical Runtime rejects evidence issued to an OAuth client other than
  the one fixed by its immutable ceremony profile. Depends on ASM-PROV-04,
  ASM-PROV-05, ASM-NOTARY-01, and ASM-BROWSER-01. Evidence: checked invariant
  in the Canonical Runtime, plus conformance tests (supporting).
- SP-DELIVERY-01:
  An authorization response for one OAuth client reaches only an origin
  registered to that client, so a site borrowing another deployment's client
  cannot receive its evidence. Depends on ASM-PROV-01, ASM-BROWSER-01.
  Evidence: external audit of the registered redirect URI list, plus
  conformance tests (supporting).
- SP-EXCHANGE-01:
  An attested token exchange redeems the authorization code produced by this
  ceremony and no other. Depends on ASM-PROV-03, ASM-NOTARY-01, ASM-BROWSER-01.
  Evidence: conformance tests (supporting, not proving).
- SP-FRESH-01:
  Evidence older than its authenticated ceiling is rejected. Depends on
  ASM-CHAIN-01, ASM-NOTARY-01, ASM-PROV-05. Evidence: checked invariant in the
  Consuming Contract.
- SP-REPLAY-01:
  One ceremony authorizes at most one authoritative effect. Depends on
  ASM-CHAIN-01, ASM-CHAIN-02. Evidence: checked invariant in the consuming
  contract.

## 5. Claim digest

The Claim Digest is the single value binding one authorization to the
operation that will consume it.

```text
claimDigest = keccak256(abi.encode(
  operationDomain, // bytes32
  version,         // uint16
  chainId,         // uint256
  claimRandom,     // bytes32
  callData         // bytes
))
```

- REQ-COMMON-01 (upholds SP-BIND-01):
  The Canonical Runtime MUST construct every Claim Digest as the keccak256 of
  the ABI encoding of exactly `operationDomain` as `bytes32`, `version` as
  `uint16`, `chainId` as `uint256`, `claimRandom` as `bytes32`, and `callData`
  as `bytes`, in that order and with no other input.
- REQ-COMMON-01A (upholds SP-BIND-01):
  The Consuming Entrypoint MUST fix one ASCII operation-domain string, derive
  `operationDomain = keccak256(bytes(domainString))`, and fix one exact
  canonical ABI shape for `callData`. The Consuming Entrypoints MUST NOT share
  an operation domain when they can produce different authoritative effects.
- REQ-COMMON-02 (upholds SP-BIND-01):
  The Consuming Contract MUST recompute the Claim Digest from the immutable
  operation domain and protocol version of the entrypoint being invoked, the
  chain identifier it observes, and the `claimRandom` and `callData` supplied
  in the submission.
- REQ-COMMON-02A (upholds SP-BIND-01):
  The Consuming Contract MUST reject a proof whose Claim Digest public input
  differs from the digest it recomputed.
- REQ-COMMON-03 (upholds SP-BIND-01):
  The Consuming Contract MUST decode `callData` into the argument format of the
  entrypoint being invoked. The Consuming Contract MUST reject trailing bytes,
  noncanonical encodings, and call data it cannot decode into that exact
  format.
- REQ-COMMON-04 (upholds SP-REPLAY-01):
  The Canonical Runtime MUST draw `claimRandom` from a cryptographically secure
  random source, freshly for each ceremony.
- REQ-COMMON-05 (upholds SP-REPLAY-01):
  The Consuming Contract MUST record every Claim Digest it accepts.
- REQ-COMMON-05A (upholds SP-REPLAY-01):
  The Consuming Contract MUST reject a Claim Digest it has already recorded.
- REQ-COMMON-06 (upholds SP-BIND-01):
  The Consuming Contract MUST reject a submission whose `version` differs from
  the protocol version that contract implements.

`operationDomain` is the operation identifier and protocol separator. Each
consuming entrypoint fixes one domain string, and no two entrypoints that can
produce different authoritative effects may share it. A further libID
operation takes a new domain string, not a new digest field. The Platform
Ceremony remains reusable because it proves the resulting Claim Digest rather
than interpreting the operation domain or call data.

`version` is the libID protocol version the ceremony ran under: it fixes the
digest layout, the binding construction, and the evidence rules the ceremony
followed. It is bound into the digest so evidence produced under one protocol
version cannot be presented under another, and it is carried in the submission
call data so a registry can route to the deployment implementing it.

`callData` carries the operation's arguments as opaque bytes. The profile for
each consuming entrypoint fixes their exact ABI types and validation. A name
claim encodes the holder address; an operation that installs a session key
encodes that key alongside it. The digest layout does not change between
operations.

`claimRandom` makes each digest unique, which is what allows the digest
itself to serve as the replay nullifier. No platform identifier and no user
identifier appear in the digest or in the nullifier derived from it.

Conformance vector, for `operationDomain =
keccak256("libid.claim-identity")`, `version = 1`, `chainId = 1`,
`claimRandom = 0x5555…5555`, and `callData = abi.encode(address
0x5bb76b0f81f028de363150602cc6d0ca929e3c31)`:

```text
operationDomain = 0xcb29bed0428519ef88a3d670e8203db76e06f41aca3e684e2c63b516c9b93e1b
callData    = 0x0000000000000000000000005bb76b0f81f028de363150602cc6d0ca929e3c31
claimDigest = 0xbbc7bfcce62d070cc25d7ba04ce8820da8f4e5c92f5e63a2bd403940c84ab625
```

Each platform carries the Claim Digest in the form its authorization allows:
Google as the OIDC `nonce`, X and GitHub through the PKCE construction in §7.

## 6. Canonical OAuth serialization

- REQ-COMMON-07:
  The Implementation MUST serialize each listed parameter tuple with the WHATWG
  `application/x-www-form-urlencoded` serializer, taking UTF-8 input, encoding
  space as `+`, and using uppercase hexadecimal percent escapes. Necessity:
  byte-exact request reproduction across implementations, without which a
  notarized transcript cannot be matched against a template.
- REQ-COMMON-08:
  The Implementation MUST emit each field listed in the platform profile
  exactly once, in the listed order. The Implementation MUST emit no other
  field. Necessity: cross-component interoperability of the transcript
  template.
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
pkceBinding    = abi.encode(PKCE_V1, claimDigest, pkceNonce)
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
verifierHash   = 0x8732837fdb4664f0c5103c6d5cb1b916349d43216527811a8c4515e2132f3d94
code_verifier  = hzKDf9tGZPDFEDxtXLG5FjSdQyFlJ4EajEUV4hMvPZQ
code_challenge = YdTXrtdSCJvd5UpsW2wS13-XwSe7kJ5OE7Ex6J_AWks
```

## 8. Client binding

The OAuth client that issued the evidence is a public proof input, and the
Canonical Runtime compares it against the exact client fixed by the immutable
ceremony profile before constructing a verified claim. Different application
deployments may use different OAuth clients without changing Registry or
verifier admission.

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
  The Consuming Contract MUST NOT accept or reject evidence based on an
  application OAuth client identifier. Necessity: client selection and
  authentication are local ceremony policy, not Registry admission.

Redirect origin, frontend origin, and application authorization remain
browser-local and produce no on-chain effect.

## 9. Notarized-transcript extraction

A proof over a TLSNotary transcript authenticates bytes, not fields. These
rules apply wherever a party that composes a request also proves over it.

Disclosure and verification are two separate layers. The Platform Profile
fixes a minimal set of revealed ranges; every other byte in a profile-listed
structured region is redacted, yet still proven against that region's template
as a private witness. Separately, the proof exposes a minimal set of public
inputs, which never includes a credential.

- REQ-COMMON-17A (upholds SP-CLIENT-01):
  The Platform Profile MUST list the exact ranges a notarized session reveals.
- REQ-COMMON-17B (upholds SP-CLIENT-01):
  The Implementation MUST redact every byte outside the ranges its profile
  lists.
- REQ-COMMON-18 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST take each complete profile-listed structured request
  region as a private witness. For a launch token request, that region is the
  complete form body. The Proving Circuit MUST assert equality with the
  region's template, allowing a bounded hole only where the profile lists a
  variable value.
- REQ-COMMON-19 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST locate a field by its full delimiter in the
  template. The Proving Circuit MUST NOT locate a field by searching for a bare
  field name.
- REQ-COMMON-20 (upholds SP-EXCHANGE-01):
  The Proving Circuit MUST constrain every variable value to the charset the
  profile states, including values that are never disclosed.

Endpoint proof inputs use these canonical byte strings: authority is the
lowercase ASCII TLS server DNS name with no trailing dot, method is the exact
uppercase HTTP method, and path is the origin-form path beginning with `/`
and containing no query. Launch profiles use TCP port 443.

Authority prevents a transcript from an attacker-controlled server from
substituting for the platform; path separates operations on the same server;
method separates operations with different HTTP semantics. Exposing these
authenticated values and comparing them in the contract avoids compiling
platform endpoint constants into each circuit without weakening the binding.

- REQ-COMMON-21 (upholds SP-BIND-01):
  The Proving Circuit MUST expose the authenticated TLS server authority,
  request method, and request path as public proof inputs. The Proving Circuit
  MUST bind those values to the notarized session and request. The Proving
  Circuit MUST NOT require them to equal profile constants.
- REQ-COMMON-21A (upholds SP-BIND-01):
  The Consuming Contract MUST compare every authenticated authority, method,
  and path byte for byte with the selected platform profile.
- REQ-COMMON-21B (upholds SP-EXCHANGE-01):
  The Implementation MUST construct every notarized request with the media type
  and `redirect_uri` from its immutable deployment profile. Neither value is a
  contract input. Necessity: media type selects the platform's request parser,
  while redirect URI is application delivery configuration rather than
  on-chain identity authority.
- REQ-COMMON-22 (upholds SP-EXCHANGE-01):
  The Platform Profile MUST order any redacted credential last in the request
  body.
- REQ-COMMON-22A (upholds SP-CLIENT-01):
  The Proving Circuit MUST NOT expose a client secret, or any value derived
  from one, as a public proof input.

An undisclosed range still reaches the platform. Ordering it last, and
constraining its charset so it cannot contain a field delimiter, prevents a
prover hiding a second copy of a field behind it.

## 10. Evidence time

- REQ-COMMON-23:
  The Implementation MUST decode every verified timestamp as an integer Unix
  time in seconds represented as `uint64`. Necessity: cross-component
  interoperability of authenticated time.
- REQ-COMMON-24 (upholds SP-FRESH-01):
  The Implementation MUST reject a fractional, negative, overflowing, or
  textual timestamp.
- REQ-COMMON-25 (upholds SP-FRESH-01):
  The Implementation MUST take `metadataObservedAt` from the platform-profile
  value. The Implementation MUST NOT infer it from an HTTP `Date` header or a
  local clock.
- REQ-COMMON-26 (upholds SP-FRESH-01):
  The Consuming Contract MUST derive `proofValidUntil` from the profile's
  authenticated platform time and the current protocol parameters. The
  Consuming Contract MUST reject a submission where
  `block.timestamp >= proofValidUntil`.
- REQ-COMMON-27 (upholds SP-FRESH-01):
  The Consuming Contract MUST NOT accept a caller-supplied validity bound.
- REQ-COMMON-28 (upholds SP-FRESH-01):
  The Implementation MUST perform every timestamp addition and comparison with
  checked arithmetic before narrowing to `uint64`.

## 11. Conformance

Roles: Canonical Runtime, Token-Proof Service, Proving Circuit, Consuming
Contract. The Implementation claiming a role MUST pass the vectors covering
the constructions that role implements.

- TEST-COMMON-01 (exercises REQ-COMMON-01, REQ-COMMON-01A, REQ-COMMON-02, REQ-COMMON-02A):
  The §5 digest vector reproduces `claimDigest` exactly.
- TEST-COMMON-02 (exercises REQ-COMMON-03):
  A submission carrying a foreign operation domain, or call data with trailing
  bytes, a noncanonical encoding, or an argument shape other than the
  entrypoint's exact format, is rejected.
- TEST-COMMON-03 (exercises REQ-COMMON-05, REQ-COMMON-05A):
  Resubmitting a recorded Claim Digest is rejected.
- TEST-COMMON-04 (exercises REQ-COMMON-04, REQ-COMMON-06):
  Two ceremonies over identical call data yield distinct digests, and a digest
  carrying a foreign `version` is rejected.
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
  The Canonical Runtime rejects a proof carrying a client identifier other than
  its immutable profile's client, while two application deployments using
  different clients remain acceptable to the same Consuming Contract.
- TEST-COMMON-10 (exercises REQ-COMMON-17A, REQ-COMMON-17B, REQ-COMMON-18, REQ-COMMON-19, REQ-COMMON-20, REQ-COMMON-22):
  A transcript carrying a second copy of a templated field, placed inside or
  after an undisclosed range, is rejected.
- TEST-COMMON-11 (exercises REQ-COMMON-21, REQ-COMMON-21A, REQ-COMMON-21B):
  The Consuming Contract rejects an authenticated foreign authority, method, or
  path. The request constructor refuses a media type or `redirect_uri`
  differing from its immutable deployment profile.
- TEST-COMMON-12 (exercises REQ-COMMON-23, REQ-COMMON-24, REQ-COMMON-25):
  A fractional, negative, overflowing, or textual timestamp is rejected.
- TEST-COMMON-13 (exercises REQ-COMMON-26, REQ-COMMON-27, REQ-COMMON-28):
  A submission at or after `proofValidUntil` is rejected, and a caller-supplied
  validity bound has no effect.
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

Replay across ceremonies is prevented by `claimRandom` and REQ-COMMON-05.
Replay across chains is prevented by `chainId` in the digest. Replay across
protocol versions is prevented by `version`. The digest binds no registry
address: a proof carrying the same call data cannot be redirected, because
every binding entrypoint requires the proof-bound target to equal the
authenticated caller, so a copied proof creates no authority for its copier.
The Consuming Contract MUST authenticate an equivalent authorization of the
target at any entrypoint that does not authenticate the caller directly.

Client binding rejects evidence issued to a client other than the one whose
ceremony the Canonical Runtime opened. The check is local because independent
application deployments own different OAuth clients. The Consuming Contract
authenticates the proof-bound operation and caller instead; it does not maintain
an OAuth-client allowlist or admit applications on chain.

Consent-screen phishing remains outside protocol enforcement. A hostile site
borrowing an honest deployment's OAuth client does not receive its response,
because the Identity Platform delivers it only to that client's registered
redirect URI (ASM-PROV-01). A hostile site using its own client and redirect can
receive evidence from a ceremony the user approves; the proof-bound operation,
caller authentication, and canonical post-proof confirmation contain that
case. The registered redirect URI list and the origins on it are therefore
trust-bearing configuration.

Input validation, denial of service, trust-anchor lifecycle, and browser
origin, storage, and credential boundaries are owned by the browser
specification. Per-platform failure behavior, transports, and trust roots are
owned by the [platform profiles](platform-ceremonies.md).

## 13. References

Normative: [RFC6749], [RFC7636], [RFC7519], [OIDC].

Informative: [RFC9700].
