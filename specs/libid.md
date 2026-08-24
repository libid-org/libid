# libID protocol specification

Status: proposed normative libID protocol specification.

This is the required entrypoint for the libID protocol specification. The
linked documents form one normative specification and are not independent
specifications.

## Identity ceremonies

- [Common ceremony rules](ceremony-common.md) define the constructions and
  invariants shared by every identity platform.
- [Identity-platform ceremonies](platform-ceremonies.md) define the launch
  profiles for Google, X, and GitHub.

## System model and specification ownership

libID turns an identity-platform authorization into a proof that an Identity
Integration applies to one proof-bound transaction:

```text
User -> Application Deployment -> Ceremony Client -> Identity Platform
                                     |
                                     v
                               Proving Circuit -> Identity Integration
                                                     |
                                                     v
                                             Verifier Dispatcher
                                                     |
                             Ledger OAuth Platform Proof Verifier (LOPPV)
                                                     |
                                               Notary Service
                                               (X and GitHub,
                                                once per attestation)
```

An Identity Integrator deploys or maintains the Identity Integration.
Application Deployments use it and may be operated independently.

The Identity Integration never verifies evidence itself. It calls the
Verifier Dispatcher, which selects the LOPPV registered for
the named identity platform and Platform Ceremony Version, which in turn obtains
attestation authenticity from the Notary Service once for each attestation
that profile carries. Google carries none, so its path reaches no Notary
Service and pays no fee; X and GitHub carry two each. The result travels
back as an accept-or-reject decision plus the authenticated operation domain,
Authorized Transaction Data, and client identifier. The Identity Integration
decides what that transaction means.
[Common §5.1](ceremony-common.md#51-verification-path) owns this path.

An Application Deployment operator controls its frontend, redirect deployment,
OAuth clients, and GitHub Token Service, but is not trusted to choose identity
fields, change the proof-bound operation, or widen proof validity. The identity
platform controls the authenticated account response. The notary authenticates
X/GitHub transcripts and their creation times. Verifier governance selects
accepted verifier artifacts, trust roots, and protocol parameters. The
Execution Ledger authenticates the Transaction Author and supplies its Ledger ID
and Block Time.

| Principal | Knows and can | Trusted for | Not trusted for |
|---|---|---|---|
| User | chooses an account and authorizes an operation | human intent | parsing or cryptographic verification |
| Application Deployment operator | configures clients and deployment assets; starts or withholds work | deployment availability and declared configuration | identity fields, proof target, or proof validity |
| Identity Integrator | deploys or maintains an Identity Integration and its operation domains | application-specific transaction semantics | proof authenticity outside the Verifier Dispatcher's result |
| Identity-platform operator | authenticates accounts and issues signed or TLS-authenticated responses | the `ASM-PROV-*` behavior the selected profile cites | the proof-bound transaction or Transaction Author |
| Notary operator | operates the X/GitHub attestation key and observes sessions | `ASM-NOTARY-01` | user intent or transaction authorization |
| Verifier governance administrator | activates verifier artifacts, trust roots, parameters, and the Supported Version Set | correct authority lifecycle | user consent |

The principal trust roots are Google's active signing moduli, the active
X/GitHub notary keys, the selected LOPPV artifacts, the Verifier
Dispatcher, the LOPPVs it selects, Verifier
governance, and Execution Ledger consensus. The Verifier Dispatcher is the most concentrated of these: every
Identity Integration takes its accept-or-reject decision, operation domain, and
Authorized Transaction Data from that one component, so its compromise
authorizes arbitrary transactions at every Identity Integration at once. A compromised
LOPPV does the same for one platform and version, because it is
the role that verifies the proof and binds the digest. Replacing or retiring a root stops future
acceptance after the change takes effect; it does not undo bindings or sessions
already committed. Loss of an Application Deployment is a liveness failure.
Compromise of the Ceremony Client build or its supply chain defeats local
client and operation construction. Compromise of a platform signing root, notary key, or
selected LOPPV can mint future evidence for the affected profiles.
Compromise of Verifier governance can change every accepted root and verifier.

| Subject | Single normative owner |
|---|---|
| Authorization Digest, PKCE, extraction, client binding, evidence time | [Common ceremony rules](ceremony-common.md) |
| Ledger ID, Transaction Author, Block Time, and transaction-data encoding | Identity Integration's Ledger Profile |
| Platform endpoints, fields, trust roots, and proof projections | [Identity-platform ceremonies](platform-ceremonies.md) |
| Redirect transport, interruption behavior, and UI control flow | browser architecture |
| Transaction dispatch and author authentication | Identity Integration protocol |
| Verification dispatch, replay recording, trust roots, and version governance | [Common ceremony rules](ceremony-common.md) |

The linked ceremony chapters specify the ceremony layer. The browser and
Identity Integration specifications do not redefine its proof fields or security
assumptions. A profile is implementable only when its exact proving artifacts
are published. It is usable on a destination ledger only while that ledger's
Verifier Governance Process selects a conforming verifier artifact and, where
required, a compatible Notary Service.

## Enforceable guarantees and accepted boundaries

The LOPPV enforces the proof-bound operation — comparing the
Authorization Digest public input on Google, recomputing the revealed
`code_verifier` on X and GitHub (REQ-COMMON-02A, REQ-COMMON-15A) — verifies
the proof under the artifact selected for the submitted platform and version
(REQ-COMMON-45), and enforces authenticated freshness. Proof-field provenance
is the signed ID Token on Google and the revealed attestation bytes on X and
GitHub; the Proving Circuit proves only what cannot be read from that
evidence, which is Google's signature relation and, on X and GitHub, that one
hidden bearer opens both sessions' commitments. The Identity Integration enforces replay
rejection by recording every Authorization Digest it accepts before applying
an effect (REQ-COMMON-03, REQ-COMMON-03A). The Ceremony Client
locally enforces the selected OAuth client and redirect profile. The protocol
assumes the named identity-platform parser,
PKCE, delivery, notary, browser, verifier-soundness, and ledger behaviors. It
does not enforce human understanding of a platform consent screen, prevent
cross-deployment presentation of the same proof, or make mutable display
metadata authoritative.

Collusion sanity check — non-exhaustive: application plus a malicious
identity-platform operator defeats identity authenticity for that platform but
not Authorization Digest binding; any pair containing compromised
Verifier governance, a selected verifier, or the applicable platform/notary
trust root inherits that single-root compromise. This does not model adaptive or
three-party compromise, shared key custody, browser supply-chain compromise, or
Execution Ledger failure.

## Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" throughout this specification are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals,
as shown here.

## Protocol parameters

Protocol parameters are governance-owned unsigned 64-bit values expressed in
seconds, read where they are enforced.
The Verifier Governance Process may update a supported parameter and emits its
key, previous value, and new value. The LOPPV reads the current
value when it verifies a proof; browser reads are advisory only. Lowering a
parameter may reject an outstanding proof, while raising one may extend an
outstanding X/GitHub proof. Current trust-root membership remains required.

| Parameter | Launch value | Use |
|---|---:|---|
| `proofLifetime[x]` | 3600 | maximum age of the X token attestation |
| `proofLifetime[github]` | 3600 | maximum age of the GitHub token-exchange attestation |
| `maxFutureAttestationSkew` | 300 | maximum X/GitHub attestation lead over Block Time |

- REQ-PARAM-01:
  The Verifier Governance Process MUST reject an unknown parameter key and a
  parameter value which is not a canonical unsigned 64-bit integer. The
  Verifier Governance Process MUST emit the parameter key, previous value, and
  new value after a successful update. Necessity: independent implementations
  must read and observe one closed parameter set.
- REQ-PARAM-02:
  The LOPPV MUST use the current governance value and checked
  arithmetic whenever a ceremony rule names one of these parameters. The
  LOPPV MUST NOT accept a caller-supplied substitute. Necessity:
  callers must not widen proof freshness.
- TEST-PARAM-01 (exercises REQ-PARAM-01, REQ-PARAM-02):
  The launch values reproduce the platform validity vectors; an unknown key,
  caller override, and overflowing calculation fail, while a governance update
  emits the previous and new values and affects subsequent verification.

## Security Considerations

Verifier governance can shorten or widen the X/GitHub acceptance window. Every
proof still requires a currently active trust root, and Google remains bounded
by its signed expiry. The linked chapters define the remaining assumptions,
security properties, requirements, and platform-specific security
considerations.

## References

Normative: [RFC2119], [RFC8174].
