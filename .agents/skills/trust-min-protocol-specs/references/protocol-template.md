# Top-Level Protocol Spec Template

Contents: Front matter and Abstract · Protocol necessity · System Model · Security Properties and accepted boundaries · Flows · Component Map · Conditional economics · Conformance · Security Considerations · Rationale / References · Drafting guidance


Numbering here is authoritative; SKILL.md workflow references
sections by these numbers. Sections 4-6 are the heart: draft them
after the protocol-necessity pass, mark unconfirmed assumptions, and ask the user only about
choices that materially change trust or security guarantees.

```markdown
# {{PROTOCOL_NAME}} Protocol Specification

Status: {{Draft|Review|Final}}   Version: {{VERSION}}   Date: {{DATE}}
Authors: {{AUTHORS}}   Discussion: {{DISCUSSION_URL}}

## 1. Abstract
<!-- TEMPLATE: One paragraph. No requirement keywords, no citations. -->

## 2. Motivation
<!-- TEMPLATE: Why existing approaches are inadequate. Name them, concretely. -->

### 2.1 Protocol Scope and Necessity
<!-- TEMPLATE: Protected outcomes; required guarantees; accepted failures;
explicit non-goals. For every proposed normative mechanism, identify the SP-*,
cross-component interoperability need, authority transition, freshness/finality/recovery rule, or trust-anchor
governance need that requires it. Move implementation, deployment, optional,
and deferred material outside the core protocol. -->

## 3. Terminology and Conventions
<!-- TEMPLATE: BCP 14 paragraph, defined terms, ID scheme note. -->

## 4. System Model

### 4.1 Principals
For each principal, all four lines are mandatory:

**[Principal, e.g., Provider Operator]**
- Knows: [...]
- Can: [...]
- Trusted for: [...]
- NOT trusted for: [explicit exclusions — the trust-minimization
  work happens on this line]

### 4.2 Components
<!-- TEMPLATE: Backend, Verifier Contract, Circuit, Browser Client — each with
the principal that controls it and the failure domains it sits in. -->

### 4.3 Trust Anchors
<!-- TEMPLATE: Per anchor — provider JWKS keys, verifying key, registry roots,
chain consensus: controller; activation; replacement/revocation/expiry;
compromise impact on future and already-committed authority; liveness
dependency. Keep operational runbooks outside the protocol. -->

### 4.4 Failure Domains
<!-- TEMPLATE: Compromised browser, admin key, RPC, sequencer, DNS, supply
chain — each mapped to affected principals/components. Also map shared
operators, hosts, KMSes, keys, network paths, and account-recovery roots that
collapse nominally separate roles or factors. -->

### 4.5 Adversary Model and Assumptions
- Malicious principals in scope / honest-but-curious: [...]
- ASM-PROV-01: [e.g., the Provider signs tokens only under keys in
  its published JWKS]  [unconfirmed?]
- ASM-CHAIN-01: [finality/reorg depth relied on]
- ASM-CHAIN-02: [block timestamp accuracy bound]
- ASM-CHAIN-03: [sequencer censorship/ordering assumptions]
- ASM-CHAIN-04: [RPC trust model for each reading party]
- ASM-CHAIN-05: [contract upgradeability + chain/deployment IDs]
- [network observation assumptions per channel]

### 4.6 Chain Observation Model
<!-- TEMPLATE: One holistic posture, not a field inventory: how reads are
authenticated; coherent snapshot and finality semantics; stale, conflicting,
and unavailable-read behavior; whether negative observations may authorize
destructive local changes. Provider evidence fields belong to each binding. -->

## 5. Security Properties

SP-UNFORGE-01 — Attestation Unforgeability
  Guarantee: [no adversary ... can cause the Verifier Contract to
  accept an Attestation for a Provider Identity it does not
  control, except with negligible probability.]
  Adversary structure: survives [corruption sets, e.g., {User*},
  {Backend Operator}, {Notary Operator}]; fails under [{Provider
  Operator + Governance Administrator}, admin-key domain].
  Depends on: ASM-PROV-01, ASM-CHAIN-05, [...]
  Evidence: [formal proof | reduction | audit | checked invariant |
  model check | supporting conformance tests]

SP-BIND-01 — Session Binding / non-frontrunnability ...
SP-PRIV-01 — Unlinkability ...
SP-LIVE-01 — Liveness / censorship resistance ...
SP-REVOKE-01 — Revocation soundness under key rotation ...

## 6. Enforceable Guarantees and Accepted Boundaries

| Outcome | Classification | Mechanism or assumption | Consequence |
|---|---|---|---|
| [identity authenticity] | protocol-enforced | [proof + verifier] | [guarantee] |
| [human intent] | trusted ceremony / external assumption / not enforced | [trusted display and confirmation, if any] | [accepted phishing or misuse boundary] |

<!-- TEMPLATE: Distinguish cryptographic/protocol enforcement, trusted-client
or user-ceremony enforcement, external/human assumptions, and explicit
non-properties. Specify security-relevant displayed facts and confirmations,
not presentation details. -->

## 7. Protocol Overview (non-normative)
<!-- TEMPLATE: Actors-and-arrows diagram + happy-path narrative. No uppercase
keywords in this section. -->

## 8. Protocol Flows

### 8.1 {{FLOW_NAME}}
Preconditions: {{PRECONDITIONS}}
Steps:
  REQ-FLOW-{{NN}} (upholds {{SP_ID}}): The {{ACTING_COMPONENT}} MUST
  {{ACTION_WITH_NORMATIVE_OWNER_CITATION}}.
Failure handling — per step (timeout, malformed input, invalid
proof, provider error):
  REQ-FLOW-{{NN}} (upholds {{SP_ID}}): The {{RECEIVING_COMPONENT}} MUST
  {{FAILURE_BEHAVIOR_WITH_STABLE_ERROR_ID}}.
State changes: {{STATE_CHANGES}}
Authority-producing transitions only:
  Authorizing evidence: {{EVIDENCE}}
  Validated by: {{COMPONENT}}
  Authoritative effect: {{POSTCONDITION}}
  Atomic/irreversible boundary: {{BOUNDARY}}

## 9. Component Map

| Surface | Document | Owns (interfaces) | Normative owner of shared constructions and semantic rules |
|---|---|---|---|
| Verifier contract | contracts/... | verifyAndRegister, events | chain/deployment domain inputs; on-chain token-time validity checks |
| JWT circuit | circuits/... | statement, witness format | in-circuit parsing rules |
| OIDC binding | bindings/oidc.md | claim profile | Binding Value construction |
| Notary service | services/... | API, transcript handling | transcript commitment format |

Every construction or semantic rule shared across documents appears in exactly
one row's last column. Local rules belong to their containing component spec or
top-level flow and need no Component Map entry.

## 10. Economic and Fee Model (conditional)
<!-- TEMPLATE: Delete this section when the protocol does not charge, sponsor,
escrow, refund, or relay value. Otherwise define payer, charged transition,
refund/settlement behavior, bypass coverage, fee-setting authority,
withholding/griefing effects, and replay/failure interaction. Exclude commercial
pricing and deployment quotas. -->

## 11. Conformance
<!-- TEMPLATE: Roles, profiles, observable criteria, required TEST-* per role —
pattern in shared-conventions.md. -->

## 12. Security Considerations
<!-- TEMPLATE: Base checklist + top-level extensions. Include the pairwise
collusion sanity table labeled non-exhaustive; the authoritative
analysis is the per-SP adversary structures in §5. Require a detailed privacy
analysis only when privacy or unlinkability is an explicit SP-*; otherwise state
the privacy non-goals concisely. -->

## 13. Rationale
<!-- TEMPLATE: Alternatives considered and rejected, logged during drafting. -->

## 14. References
### 14.1 Normative
### 14.2 Informative
```

## Drafting guidance

- A principal with an empty "NOT trusted for" line means the model
  is unfinished.
- If an SP cannot be stated without naming an implementation
  detail, the detail belongs in a component spec; keep the SP
  abstract and cite the component REQ that enforces it.
- Flows cite formats by pointer to the normative owner; duplicated
normative text drifts.
- Do not add a separate authority/state document merely to repeat context.
  State authorizing evidence, validator, authoritative effect, and commit
  boundary inline only for authority-producing transitions.
