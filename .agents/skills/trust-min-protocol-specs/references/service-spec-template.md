# Service Spec Template (Backend / Notary / Off-chain components)

```markdown
# Service: [Name]

## 1. Role and Trust Statement
<!-- TEMPLATE: This service is a Component (System Model §4.2) controlled by
{{PRINCIPAL}}. Cite that principal's four-line entry canonically
(top-level §4.1, version {{PROTOCOL_SPEC_VERSION}}); if a copy is
included for readability, mark it "non-normative snapshot of
§4.1 as of version {{PROTOCOL_SPEC_VERSION}}". List the failure
domains this service sits in (§4.4); every normative requirement
below exists to keep the service inside that envelope. -->

## 2. Conventions

## 3. State Machine
[Enumerated states; per transition: trigger, guards, side effects,
terminal states. REQ-SVC-NN (upholds {{SP_ID}}): The [Service] MUST [ignore | reject
with error E | queue] event [X] arriving in state [S] — specified
per event, never left implicit.]

## 4. API
Per endpoint: method/path; authn (how the caller is identified);
authz (which principals may call); request schema per field with
on-invalid behavior and error ID; every error response with stable
codes; idempotency key, window, replay semantics; rate limits
(normative where DoS-weighted).

## 5. Data Handling
- Stored: [per datum — what, why, retention. REQ-SVC-NN (upholds
  SP-PRIV-01): The Backend MUST NOT persist raw access or ID
  tokens beyond flow completion.]
- Observed but not stored: [transient knowledge — must be a subset
  of the controlling principal's "Knows" line]
- Withholding power: [what the service can censor or delay; cite
  the SP-LIVE-* affected and the user's recourse path]

## 6. External Dependencies
<!-- TEMPLATE: Providers, chains (via which RPC trust model — cite ASM-CHAIN-04),
notaries: each with timeout, retry, failure behavior. REQ-SVC-NN (upholds {{SP_ID}}): The
{{SERVICE}} MUST NOT allow a dependency failure to silently degrade
any SP-*; where a failure degrades liveness, the spec says so and
names the SP. -->

## 7. Conformance
<!-- TEMPLATE: Roles, profiles, required TEST-SVC-*. -->

## 8. Security Considerations
<!-- TEMPLATE: Base checklist plus: REQ-SVC-NN (upholds {{SP_PRIVACY_ID}}): The [Service] MUST NOT write
tokens or Binding Value preimages to logs; SSRF on provider URLs;
custody of the service's OAuth client secret and signing keys;
insider threat within the stated envelope; monitoring signals for
envelope violations. -->
```

## Drafting guidance

- Trust minimization most often silently fails here: any capability
  implemented but absent from the controlling principal's "Can"
  line, or any datum retained but absent from "Knows", requires
  updating the System Model FIRST. The top-level spec leads.
- Stable enumerated error codes everywhere; clients and monitors
  are implemented against them.
