# libID ceremony specification

Status: proposed normative identity-platform ceremony specification.

This is the required entrypoint for the libID ceremony specification. The
linked chapters form one normative specification and are not independent
documents:

- [Common ceremony rules](ceremony-common.md) define the constructions and
  invariants shared by every identity platform.
- [Identity-platform ceremonies](platform-ceremonies.md) define the launch
  profiles for Google, X, and GitHub.

## Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this specification are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals,
as shown here.

## Security Considerations

The linked chapters define the suite's assumptions, security properties,
requirements, and platform-specific security considerations. This entrypoint
introduces no additional protocol mechanism.

## References

Normative: [RFC2119], [RFC8174].
