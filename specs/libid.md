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

libID turns an identity-platform authorization into a proof that a Consumer
applies to one proof-bound transaction:

```text
User -> Identity Platform -> Canonical Runtime -> Proving Circuit -> Consumer
                                  |
                                  +-> Token-Proof Service (GitHub only)
```

The application operator controls its frontend, redirect deployment, OAuth
clients, and any Token-Proof Service, but is not trusted to choose identity
fields, change the proof-bound operation, or widen proof validity. The identity
platform controls the authenticated account response. The notary authenticates
X/GitHub transcripts and their creation times. Registry governance selects
accepted verifier artifacts, trust roots, and protocol parameters. The
Consumer Chain authenticates the Transaction Author and supplies its Chain ID
and Block Time.

| Principal | Knows and can | Trusted for | Not trusted for |
|---|---|---|---|
| User | chooses an account and authorizes an operation | human intent | parsing or cryptographic verification |
| Application operator | configures clients and deployment assets; starts or withholds work | deployment availability and declared configuration | identity fields, proof target, or proof validity |
| Identity-platform operator | authenticates accounts and issues signed or TLS-authenticated responses | the `ASM-PROV-*` behavior the selected profile cites | the proof-bound transaction or Transaction Author |
| Notary operator | operates the X/GitHub attestation key and observes sessions | `ASM-NOTARY-01` | user intent or transaction authorization |
| Registry governance administrator | activates verifier artifacts, trust roots, and parameters | correct authority lifecycle | user consent |

The principal trust roots are Google's active signing moduli, the active
X/GitHub notary keys, the selected proof-verifier artifacts, Registry
governance, and Consumer Chain consensus. Replacing or retiring a root stops future
acceptance after the change takes effect; it does not undo bindings or sessions
already committed. Loss of an application deployment is a liveness failure.
Compromise of the browser release or its supply chain defeats local client and
operation construction. Compromise of a platform signing root, notary key, or
selected proof verifier can mint future evidence for the affected profiles.
Compromise of Registry governance can change every accepted root and verifier.

| Subject | Single normative owner |
|---|---|
| Claim digest, PKCE, extraction, client binding, evidence time | [Common ceremony rules](ceremony-common.md) |
| Chain ID, Transaction Author, Block Time, and transaction-data encoding | consumer protocol Chain Profile |
| Platform endpoints, fields, trust roots, and proof projections | [Identity-platform ceremonies](platform-ceremonies.md) |
| Redirect transport, persistence, resume, and UI control flow | browser protocol |
| Transaction dispatch, author authentication, replay storage, and trust-root governance | consumer protocol |

The linked ceremony chapters specify the ceremony layer. The browser and
consumer protocol specifications do not redefine its proof fields or security
assumptions. A profile is implementable only when its exact proving
and attestation verifier artifacts are published and selected by the consumer
protocol.

## Enforceable guarantees and accepted boundaries

Circuits and Consumers enforce proof-field provenance, the
proof-bound operation, per-deployment replay rejection, and authenticated
freshness. The Canonical Runtime locally enforces the selected OAuth client and
redirect profile. The protocol assumes the named identity-platform parser,
PKCE, delivery, notary, browser, verifier-soundness, and chain behaviors. It
does not enforce human understanding of a platform consent screen, prevent
cross-deployment presentation of the same proof, or make mutable display
metadata authoritative.

Collusion sanity check — non-exhaustive: application plus Token-Proof Service
control can withhold but cannot retarget valid evidence; application plus a
malicious identity-platform operator defeats identity authenticity for that
platform but not Claim-Digest binding; any pair containing compromised Registry
governance, a selected verifier, or the applicable platform/notary trust root
inherits that single-root compromise. This does not model adaptive or
three-party compromise, shared key custody, browser supply-chain compromise, or
Consumer Chain failure.

## Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" throughout this specification are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals,
as shown here.

## Protocol parameters

Protocol parameters are Registry-owned unsigned 64-bit values expressed in
seconds.
The Registry Governance Process may update a supported parameter and emits its
key, previous value, and new value. The Consumer reads the current
value when it verifies a proof; browser reads are advisory only. Lowering a
parameter may reject an outstanding proof, while raising one may extend an
outstanding X/GitHub proof. Current trust-root membership remains required.

| Parameter | Launch value | Use |
|---|---:|---|
| `proofLifetime[x]` | 3600 | maximum age of the X token-exchange attestation |
| `proofLifetime[github]` | 3600 | maximum age of the GitHub token-exchange attestation |
| `maxFutureAttestationSkew` | 300 | maximum X/GitHub attestation lead over chain time |

- REQ-PARAM-01:
  The Registry Governance Process MUST reject an unknown parameter key and a
  parameter value which is not a canonical unsigned 64-bit integer. The
  Registry Governance Process MUST emit the parameter key, previous value, and
  new value after a successful update. Necessity: independent implementations
  must read and observe one closed parameter set.
- REQ-PARAM-02:
  The Consumer MUST use the current Registry value and checked arithmetic
  whenever a ceremony rule names one of these parameters. The Consumer MUST
  NOT accept a caller-supplied substitute. Necessity:
  callers must not widen proof freshness.
- TEST-PARAM-01 (exercises REQ-PARAM-01, REQ-PARAM-02):
  The launch values reproduce the platform validity vectors; an unknown key,
  caller override, and overflowing calculation fail, while a governance update
  emits the previous and new values and affects subsequent verification.

## Security Considerations

Registry governance can shorten or widen the X/GitHub acceptance window. Every
proof still requires a currently active trust root, and Google remains bounded
by its signed expiry. The linked chapters define the remaining assumptions,
security properties, requirements, and platform-specific security
considerations.

## References

Normative: [RFC2119], [RFC8174].
