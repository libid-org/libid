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

## Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" throughout this specification are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals,
as shown here.

## Protocol parameters

Protocol parameters are Registry-owned `uint64` values expressed in seconds.
The Registry Governance Process may update a supported parameter and emits its
key, previous value, and new value. The Consuming Contract reads the current
value when it verifies a proof; browser reads are advisory only. Lowering a
parameter may reject an outstanding proof, while raising one may extend an
outstanding proof only within its authenticated platform and trust-root
ceilings.

| Parameter | Launch value | Use |
|---|---:|---|
| `proofLifetime[x]` | 3600 | maximum age of the earlier X token/identity attestation |
| `proofLifetime[github]` | 3600 | maximum age of the earlier GitHub token/identity attestation |
| `googleClockSkewGrace` | 300 | grace added to the signed Google ID-Token expiry |
| `maxFutureAttestationSkew` | 300 | maximum X/GitHub attestation lead over chain time |

- REQ-PARAM-01:
  The Registry Governance Process MUST reject an unknown parameter key and a
  parameter value which is not a canonical `uint64`. The Registry Governance
  Process MUST emit the parameter key, previous value, and new value after a
  successful update. Necessity: independent implementations must read and
  observe one closed parameter set.
- REQ-PARAM-02:
  The Consuming Contract MUST use the current Registry value and checked
  arithmetic whenever a ceremony rule names one of these parameters. The
  Consuming Contract MUST NOT accept a caller-supplied substitute. Necessity:
  callers must not widen proof freshness.
- TEST-PARAM-01 (exercises REQ-PARAM-01, REQ-PARAM-02):
  The launch values reproduce the platform validity vectors; an unknown key,
  caller override, and overflowing calculation fail, while a governance update
  emits the previous and new values and affects subsequent verification.

## Security Considerations

Registry governance can shorten or widen the acceptance window within the
authenticated provider and trust-root ceilings. The linked chapters define the
remaining assumptions, security properties, requirements, and
platform-specific security considerations.

## References

Normative: [RFC2119], [RFC8174].
