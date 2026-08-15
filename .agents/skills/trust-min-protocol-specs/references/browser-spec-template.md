# Browser Client/Server Protocol Spec Template

Use this template only when browser execution contexts, origins, storage,
messages, credentials, trusted UI, or WebAuthn affect a security property.
Describe browser client and browser-facing server behavior together; split
documents only when independently implemented profiles require it.

```markdown
# Browser Protocol: [Name]

## 1. Role and Security Boundary
<!-- TEMPLATE: Which SP-* or cross-component interoperability needs require this browser protocol. Name what an
embedding application may control and what remains trusted. State browser UI
or user-gesture assumptions only when they authorize an effect. -->

## 2. Conventions and Definitions
<!-- TEMPLATE: Include the BCP 14 paragraph verbatim from
shared-conventions.md. Import suite terminology by reference and define only
browser-local terms here. -->

## 3. Execution Contexts and Origins

| Context | Origin/controller | May access | Prohibited access | Failure domain |
|---|---|---|---|---|
| Application | [...] | [...] | [...] | [...] |
| Broker/frame | [...] | [...] | [...] | [...] |
| Popup/continuation | [...] | [...] | [...] | [...] |
| Callback response | [...] | [...] | [...] | [...] |

<!-- TEMPLATE: Include only security-relevant contexts. State opener/frame
relationships, isolation and storage-partition assumptions, and unsupported
browser states. Do not document component layout or rendering architecture. -->

## 4. Browser-Facing Server Profiles
<!-- TEMPLATE: Per response class: authenticated configuration inputs,
redirect behavior, cache policy, framing/isolation policy, and the minimum CSP
needed to preserve the stated boundary. URLs and response policy are not
authorization unless an explicit requirement says how they are authenticated. -->

## 5. Messages and Context Authentication
<!-- TEMPLATE: For each cross-context message: sender, receiver, exact schema,
source/origin checks, freshness/challenge, replay behavior, and targetOrigin.
Notification and progress channels are explicitly non-authoritative. -->

## 6. Credential, Key, and Durable-State Boundaries
<!-- TEMPLATE: State which context may observe each credential or key; what may
be persisted; authoritative versus advisory records; storage-partition and
eviction consequences. Specify ordering only where crash/replay behavior changes
an SP-* or necessary cross-component behavior. Do not require a particular storage engine unless it is an
interoperability boundary. -->

### 6.1 WebAuthn Profile (conditional)
<!-- TEMPLATE: Delete when WebAuthn is not used. Otherwise specify RP ID,
allowed origins, challenge construction and binding, ceremony type, user
presence and user verification requirements, attestation policy, backup
eligibility/state flag handling, and signature-counter handling. -->

## 7. Protocol Flows
<!-- TEMPLATE: Preconditions, acting context, failure behavior, and state
changes. For each authority-producing transition, state authorizing evidence,
validator, authoritative effect, and atomic/irreversible boundary inline. For a
trusted user ceremony, state the security-relevant facts displayed and the
confirmation required; omit layout and copy. -->

## 8. External Evidence and Chain Observations
<!-- TEMPLATE: Cite the suite-level chain observation model. Cite provider
binding specs for authenticated fields, provenance, freshness, and failure;
never redefine them here. -->

## 9. Conformance
<!-- TEMPLATE: Supported browser properties and profiles; required TEST-*.
Tests cover origin/source spoofing, replay, isolation/partition changes,
credential leakage, crash boundaries, and duplicate execution where relevant. -->

## 10. Security Considerations
<!-- TEMPLATE: Malicious embedding application; clickjacking or untrusted UI;
opener/frame confusion; XSS and response-policy failure; storage compromise and
partitioning; credential URL/history leakage; cancellation after irreversible
work; browser or extension compromise as an explicit failure domain. -->
```

## Drafting guidance

- Browser mechanics are normative only when changing them changes an SP-*,
  necessary cross-component behavior, authority transition, or accepted boundary.
- Describe client and server sides in the same flow so origin and response
  assumptions cannot drift.
- Do not infer success, authorization, or finality from popup closure,
  notifications, progress, or unauthenticated reads.
