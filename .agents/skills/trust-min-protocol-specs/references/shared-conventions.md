# Shared Conventions

Contents: BCP 14 conventions paragraph · Stable identifier and traceability scheme · Terminology section pattern · System-model ontology · Commonly cited references · Security Considerations checklist · Conformance section pattern · Self-review pass · Adversary-structure check and collusion sanity table


Material used by every document in the spec suite.

## BCP 14 conventions paragraph (include verbatim)

```
The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.
```

## Stable identifier scheme

Every assumption, security property, requirement, and test vector
carries an ID, defined exactly once and cited everywhere else:

- `ASM-<SCOPE>-<NN>`   assumptions        (ASM-CHAIN-01, ASM-PROV-02)
- `SP-<NAME>-<NN>`     security properties (SP-UNFORGE-01, SP-BIND-01)
- `REQ-<DOC>-<NN><L>?` requirements; an optional UPPERCASE letter
  suffix marks atomic splits of a numbered group (REQ-BOIDC-05A).
  The same optional suffix is permitted for every ID type.
- `TEST-<DOC>-<NN><L>` test vectors       (TEST-BINDING-07A)

Template fill-slots use the sentinel form {{NAME}}; block drafting
guidance uses HTML comments `<!-- TEMPLATE: ... -->`. The linter
fails an instantiated document that retains either (E2/E5). Short
inline bracket hints (e.g., inside tables and long example blocks)
are NOT machine-checked — removing them on instantiation is part
of the judgment-based self-review, so E2/E5 passing does not by
itself certify complete instantiation.

Rules:
- IDs are immutable once published; retain each retired definition as
  `<ID>: Withdrawn.` and never reuse it. Withdrawn IDs remain reserved and
  duplicate-checked, but have no active parent, evidence, dependent, or test
  obligations.
- Load-bearing requirements cite the SP they uphold:
  "REQ-BINDING-07 (upholds SP-BIND-01): The Backend MUST ...".
- Every security REQ cites at least one SP parent. A necessary non-security REQ
  states `Necessity:` in plain language instead of introducing another ID type.
- Every TEST cites the REQ or REQs it exercises. Every externally observable
  REQ has at least one TEST. A non-observable requirement without a TEST states
  `Verification:` with its formal proof, audit, checked invariant, model check,
  or inspection method.
- Every SP cites the ASM IDs it depends on. A property without
  assumption citations overstates security.
- Evidence model — tests demonstrate conformance; they do not prove
  cryptographic properties:
  - every externally observable REQ-* has at least one TEST-*;
  - every SP-* lists its Evidence: one or more of formal proof,
    reduction argument, external audit, checked invariant, model
    check, conformance tests — with tests marked "supporting, not
    proving" for soundness/unforgeability/privacy claims.

The maintained dependency graph is:

```text
ASM-* -> SP-* -> REQ-* -> TEST-*
```

Before changing a published ID's meaning, review every transitive dependent.
The linter checks structural links and orphans; the author still judges whether
the linked text remains semantically correct.

## Terminology section pattern

Hanging list, one term per entry, ordered by first use; terms
Capitalized when used in their defined sense:

```
Attestation:  A signed or proven statement binding a Provider
   Identity to Chain Material.
Provider Identity:  The (issuer, subject) pair asserted by an OAuth
   Provider — via an OIDC ID Token or an authenticated provider API
   response, per the applicable binding.
Chain Material:  The on-chain address or ephemeral public key that
   an Attestation binds to.
Binding Value:  The value that ties an authorization session to
   specific Chain Material; constructed as specified by its
   normative owner (see Component Map).
```

## System-model ontology (use in every top-level spec)

- **Principals** — humans/orgs with intent (User, Provider Operator,
  Notary Operator, Governance Administrator). Only principals get
  trust statements and appear in collusion analysis.
- **Components** — software (Backend, Verifier Contract, Circuit,
  Browser Client). Components fail or are compromised; model via
  failure domains, and attribute intent to the principal controlling
  them.
- **Trust anchors** — cryptographic roots (provider JWKS keys,
  verifying key, registry roots, chain consensus), each with controller,
  activation, replacement/revocation/expiry, compromise impact on future and
  already-committed authority, and liveness dependency.
- **Failure domains** — compromised browser, admin key, RPC,
  sequencer, DNS, supply chain — each mapped to affected
  principals/components. Include shared operators, hosts, KMSes, keys, network
  paths, and account-recovery roots that collapse nominally separate roles or
  factors.

Statements like "the contract colludes with the provider" are
ill-formed under this ontology; write "the Governance Administrator
(holding the contract admin key) colludes with the Provider
Operator" or "admin-key failure domain + malicious Provider
Operator".

## Commonly cited references

```
[RFC2119]  Bradner, S., "Key words for use in RFCs to Indicate
           Requirement Levels", BCP 14, RFC 2119, March 1997.
[RFC8174]  Leiba, B., "Ambiguity of Uppercase vs Lowercase in
           RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.
[RFC6749]  Hardt, D., Ed., "The OAuth 2.0 Authorization Framework",
           RFC 6749, October 2012.
[RFC7636]  Sakimura, N., Ed., Bradley, J., and N. Agarwal, "Proof
           Key for Code Exchange by OAuth Public Clients", RFC 7636,
           September 2015.
[RFC7519]  Jones, M., Bradley, J., and N. Sakimura, "JSON Web Token
           (JWT)", RFC 7519, May 2015.
[RFC7515]  JWS.  [RFC7517]  JWK.
[RFC8446]  Rescorla, E., "TLS 1.3", RFC 8446, August 2018.
[RFC5246]  TLS 1.2 (cite when the pinned TLSNotary version operates
           over TLS 1.2 — verify against the pinned version's docs).
[RFC9700]  Lodderstedt, T., et al., "Best Current Practice for
           OAuth 2.0 Security", BCP 240, RFC 9700, January 2025.
[OIDC]     Sakimura, N., et al., "OpenID Connect Core 1.0".
           (nonce is defined HERE, not in OAuth 2.0.)
[EIP-1]    "EIP Purpose and Guidelines", eips.ethereum.org/EIPS/eip-1.
```

Verify numbers and metadata against source sites before publication.

## Security Considerations checklist (base)

State explicitly when an item is out of scope for a document and
which document owns it.

- Adversary-structure reference: which SP-* this component enforces,
  under which ASM-*
- Input validation: behavior for every malformed-input class
- Authentication and authorization per interface
- CSRF for browser-mediated flows (RFC 9700 requires explicit
  handling; relying on PKCE alone is conditional on confirmed
  server support)
- Replay: within session, across sessions, across deployments and
  chains (domain-separation values stated by their normative owner)
- Denial of service; trust-anchor lifecycle; downgrade
- Enforceable boundary: protocol-enforced vs trusted-client/user-ceremony vs
  external/human assumption vs explicitly unenforced
- Browser origin/context, credential, storage, and trusted-UI boundaries when
  browser behavior upholds an SP-*
- Economic withholding, griefing, bypass, settlement, and refund behavior when
  the protocol charges, sponsors, escrows, refunds, or relays value

Top-level extensions: provider key rotation & JWKS caching windows,
front-running of on-chain submissions, proof malleability,
consent-screen phishing, notary equivocation, cross-chain replay,
shared-factor collapse,
chain assumptions (ASM-CHAIN-*: finality, timestamps, sequencer,
RPC, upgradeability).

## Conformance section pattern (every document)

- Roles that can claim conformance (e.g., Prover, Verifier
  Contract, Backend, Wallet Client)
- Required vs optional profiles per role
- Observable conformance criteria (behavior a test can check)
- The TEST-* vectors each role must pass

## Self-review pass (judgment checks — run after the linter)

1. Actor quality: each uppercase keyword's grammatical subject is
   the correct acting principal/component (the linter only checks
   that *some* subject exists).
2. Defined terms used only in their defined sense; no synonyms.
3. Normative/informative reference split correct.
4. Every parsed field has specified invalid-value behavior.
5. Every security REQ cites an SP parent; another necessary REQ states
   `Necessity:`. Every TEST cites its REQ. Every
   externally observable REQ has a TEST; a non-observable REQ states another
   verification method. Every SP cites its ASM dependencies and declares its evidence (formal proof,
   reduction argument, external audit, checked invariant, model
   check, or supporting conformance tests — tests support, they do
   not prove).
6. Shared constructions and semantic rules appear in exactly one document
   (their normative owner); everywhere else is a citation.
7. Security Considerations addresses the checklist or delegates
   each skipped item to a named document.
8. Every authority-producing transition states authorizing evidence, validator,
   authoritative effect, and atomic/irreversible boundary inline. Do not demand
   a separate authority/state document when the flow already says this.
9. The protocol-necessity pass can justify every normative mechanism. Internal
   implementation, deployment optimization, optional, and deferred material is
   outside the core protocol.

## Adversary-structure check and collusion sanity table (suite level)

Primary: every SP-* states the corruption sets (principals) and failure domains
it survives, citing ASM-*. For threshold or multi-provider claims, identify the
actual compromise domains and shared custody/recovery dependencies rather than
equating nominal factors with independent factors.

Secondary sanity check: generate the pairwise principal-collusion
table and verify each pair maps to a stated outcome in some SP or
an explicit out-of-scope note. Label the table "sanity check —
non-exhaustive": it does not cover threshold compromise, adaptive
corruption, one organization operating multiple principals, shared
infrastructure or key custody, chain/sequencer/RPC failure, or
collusions of three or more principals. Those live in the
adversary structures themselves.
