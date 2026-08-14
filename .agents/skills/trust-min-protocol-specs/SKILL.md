---
name: trust-min-protocol-specs
description: Write, restructure, or audit specifications for trust-minimized protocols spanning smart contracts, ZK circuits, OAuth/OIDC/JWT or TLS bindings, and off-chain services. Use when the surrounding context concerns a cryptographic, decentralized, identity-bridging, cross-domain, or otherwise trust-sensitive protocol and its trust assumptions, adversary model, security properties, cross-component normative behavior, or requirement traceability must be made explicit — in such contexts even when the user just says "write the spec", "define the threat model", "audit this spec", or "spec out this circuit/contract/flow". Do not use for ordinary product or CRUD API specifications with no trust-minimization content.
---

# Trust-Minimized Protocol Specifications

Write specs for protocols where the core design question is *who is trusted for what*. These systems span heterogeneous surfaces — on-chain contracts, ZK circuits, standards-defined identity edges (OIDC, OAuth, JWT, TLS), and off-chain services — and each surface has a native spec tradition. This skill produces a coherent suite: one top-level protocol spec plus component specs per surface, sharing one vocabulary, one requirement-keyword discipline, and one traceability scheme.

## Operating modes

Identify the mode from the request before doing anything else:

- **Create** — draft a new suite (the default flow below).
- **Expand** — add a component spec to an existing suite. Read the top-level spec first; import its terms and IDs; never redefine.
- **Audit** — review an existing spec against this skill's disciplines. Output findings ordered by severity, keyed to the self-review pass and lint checks; do not rewrite unless asked.
- **Reconcile** — detect and fix drift across component specs (duplicated normative constructions, conflicting encodings, dangling IDs). The Component Map's normative-owner column is the arbitration record.
- **Update provider profile** — update the provider appendix first, then run an impact scan over every ASM-*, SP-*, REQ-*, and TEST-* ID referenced by the changed entries (provider changes to algorithms, JWKS behavior, subject identifiers, nonce support, endpoints, response fields, or freshness can invalidate assumptions, circuit constraints, properties, requirements, vectors, and service behavior). Modify dependent documents where semantics changed, then lint the complete suite — never just the one document.

## Spec suite architecture

```
protocol-name/
├── 00-protocol.md        Top-level: system model, flows, security properties
├── 01-terminology.md     Shared definitions + BCP 14 conventions (or a §2 in 00)
├── contracts/            ERC/EIP-style specs per contract or interface
├── circuits/             One spec per circuit: statement, inputs, properties
├── bindings/             Identity-evidence specs (OIDC, OAuth+API, TLSNotary)
├── browser/              Browser client/server protocol when it is a security boundary
├── services/             Backend/notary behavior specs (API contracts, state)
└── scripts/lint_spec.py  Deterministic checks (copied from this skill)
```

For small projects, collapse this into one document with the same section order. Never demote the System Model to an appendix — it leads.

Every document in the suite:

- Uses BCP 14 keywords (uppercase-only-normative per RFC 8174) with the standard conventions paragraph — see `references/shared-conventions.md`.
- Imports terms from the shared terminology section and never redefines them.
- Contains a Security Considerations section. A component spec may delegate items upward, but must list which numbered Security Properties it is responsible for upholding.
- Uses stable identifiers for assumptions (`ASM-*`), security properties (`SP-*`), requirements (`REQ-*`), and test vectors (`TEST-*`), per the scheme in `references/shared-conventions.md`. A security requirement cites the `SP-*` it upholds; another necessary protocol requirement states its `Necessity:` in plain language without inventing another ID type.
- Has exactly one normative owner for every shared construction or semantic rule: nonce preimages, commitment formats, encodings, state transitions, authority decisions, trust policies, and timing rules. The owner specifies it; everyone else cites it. The Component Map records ownership explicitly.

## The top-level protocol spec

Section order — numbering below matches `references/protocol-template.md` exactly:

1. Abstract
2. Motivation — includes **Protocol Scope and Necessity**: protected outcomes, required guarantees, explicit non-goals, and which mechanisms are necessary to obtain them. A detail is normative only when required by a security property, cross-component interoperability, authority transition, freshness/finality/recovery rule, or trust-anchor governance. Package layout, internal APIs, storage-engine choices, UI styling, operational optimizations, and deferred options stay outside the core protocol unless changing them would change one of those items.
3. Terminology and Conventions
4. **System Model** — the heart of the document. Uses a four-part ontology (do not flatten it):
   - **Principals** — humans/organizations with intent: User, Provider Operator, Notary Operator, Governance Administrator. Each gets the four-line trust statement (Knows / Can / Trusted for / NOT trusted for).
   - **Components** — software the principals run or rely on: Backend, Verifier Contract, Circuit, Browser Client. Components don't "collude"; they are compromised, buggy, or misdeployed — model them via failure domains.
   - **Trust anchors** — cryptographic roots: provider signing keys (JWKS), verifying keys, registry roots, chain consensus. Each anchor minimally lists controller, activation, replacement/revocation/expiry, compromise impact on future and already-committed authority, and liveness dependency. Operational runbooks stay outside the protocol.
   - **Failure domains** — compromised browser, admin key, RPC endpoint, sequencer, DNS, supply chain — with which principals/components each takes down. Record shared operators, hosts, KMSes, keys, network paths, and account-recovery roots that collapse nominally separate factors or roles into one compromise domain.
   - **Adversary model** — which principals may be malicious vs honest-but-curious; assumption IDs (`ASM-*`) for everything relied on, including explicit chain assumptions (finality/reorg depth, timestamp accuracy, sequencer censorship, RPC trust, upgradeability, chain/deployment identifiers).
5. **Security Properties** — numbered `SP-*` properties, each stated as a guarantee **under an explicit adversary structure**: which sets of corrupted principals + failed domains the property survives, citing the `ASM-*` IDs it depends on. A property that lists guarantees without assumptions overstates security.
6. **Enforceable Guarantees and Accepted Boundaries** — distinguish what the protocol cryptographically enforces, what only a trusted client/user ceremony enforces, what it assumes from an external system or human action, and what it explicitly does not enforce. Human intent and phishing boundaries belong here when relevant; specify only security-relevant displayed facts and confirmations, not presentation details.
7. Protocol Overview (non-normative)
8. Protocol Flows — per flow: preconditions, steps with the acting party named in each requirement, failure handling at every step, state changes. For every authority-producing transition, state inline the authorizing evidence, validator, successful authoritative effect, and atomic/irreversible boundary. Do not create a separate authority/state document merely to repeat facts clear in the flow.
9. Component Map — surface, document, owned interfaces, and a **Normative owner** column for shared constructions and semantic rules.
10. **Economic and Fee Model (conditional)** — include only when the protocol charges, sponsors, escrows, refunds, or relays value. Define payer, charged transition, refund/settlement behavior, bypass coverage, fee-setting authority, withholding/griefing effects, and interaction with replay and failure. Keep commercial pricing and deployment quotas out.
11. Conformance — which implementation roles can claim conformance, required vs optional profiles, and the `TEST-*` vectors each role must pass.
12. Security Considerations — cross-cutting analysis including the collusion sanity table (see below). Require privacy analysis only when privacy or unlinkability is an explicit `SP-*`; otherwise a concise privacy non-goal is sufficient.
13. Rationale — alternatives considered, logged during drafting.
14. References — normative vs informative.

## Component spec styles

Pick by surface; each has a template in `references/`.

- **Contracts / on-chain interfaces** → `references/contract-spec-template.md` (ERC/EIP style; per-function behavior with revert-level precision; verifier-key governance; who constructs each public input — including token time claims, which the circuit authenticates as public outputs and the contract evaluates against chain time; current block time is never a proof input).
- **ZK circuits** → `references/circuit-spec-template.md` (statement in math; public/private inputs with exact encodings and a **provenance column** saying which component constructs and validates each public input; byte-precise in-circuit parsing rules; completeness/soundness/ZK tied to `SP-*` IDs).
- **Identity evidence bindings** → `references/binding-spec-template.md`. Branch by evidence mechanism, not by provider: (a) OIDC ID Token binding — providers that issue ID Tokens with `nonce` (e.g., Google); (b) OAuth access token + provider API binding — providers without OIDC ID Tokens (e.g., GitHub, X), where identity is proven from an authenticated API response, optionally via TLSNotary; (c) TLSNotary transcript binding. Treating these as one surface with "provider deviations" is a category error that produces unsound specs.
- **Browser client/server protocol** → `references/browser-spec-template.md` when browser execution contexts, origins, storage, messages, credentials, trusted UI, or WebAuthn are security boundaries. Describe both sides and all relevant browsing contexts together; do not split client and server artificially.
- **Backend / notary services** → `references/service-spec-template.md` (state machines; API contracts; data handling and withholding tied to the principal's trust statement).

For on-chain reads, define one suite-level observation posture rather than a field-by-field inventory: authentication mechanism, coherent snapshot/finality semantics, behavior on stale/conflicting/unavailable reads, and whether a negative observation may authorize destructive local change. Each provider binding separately owns its authenticated external fields, provenance, freshness, and failure behavior.

## Requirement keyword discipline (all documents)

- Uppercase keywords only in normative statements; every one names its acting party or component as grammatical subject: "The Backend MUST NOT cache a JWKS response longer than T", "The Verifier Contract MUST reject tokens whose alg is not on the allowlist". Never passive, never "X is REQUIRED" without an actor.
- One requirement per sentence; testable; stable error identifiers.
- Every security requirement cites at least one `SP-*`. Another necessary protocol requirement states `Necessity:` in plain language.
- MUST = interop or security. SHOULD = delegated decision with stated deviation conditions. MAY = genuine option.
- Examples and diagrams are non-normative, marked as such, and free of uppercase keywords.

## Workflow

1. **Run the protocol-necessity pass first.** Identify protected outcomes, required guarantees, explicit non-goals, and accepted failures. Derive the minimum mechanisms needed for them. Reject normative details that have no security-property, cross-component-interoperability, authority-transition, freshness/finality/recovery, or trust-anchor-governance justification.
2. **Draft the System Model, Security Properties, and Enforceable Boundaries first** (top-level §4–§6). Ask the user only about unresolved choices that materially change trust or security guarantees; otherwise proceed and mark assumptions explicitly with `ASM-*` IDs and an "unconfirmed" tag the user can search for. Do not block on confirmation when the user supplied a complete design or asked for an autonomous draft.
3. Draft the top-level spec, then only the component specs required by the necessity pass, usually in dependency order. Read each matching template first. Assign every shared construction or semantic rule a normative owner in the Component Map before writing it anywhere.
4. Maintain the semantic dependency graph `ASM-* → SP-* → REQ-* → TEST-*` while drafting and updating. Track non-security requirements through their plain-language `Necessity:` and `REQ-* → TEST-*` links. Before changing a published ID's meaning, compute its transitive dependents and review each affected assumption, property, requirement, vector, and evidence claim. A clean linter proves structural linkage, not semantic correctness.
5. After each document: run the bundled linter — `python <this-skill-dir>/scripts/lint_spec.py <file>` — and, when creating a new suite, copy the script into the suite's `scripts/` so it travels with the specs. Before completion, lint all suite documents together in ONE invocation so cross-file duplicate-ID, undefined-ID, and traceability checks work. Then run the judgment-based self-review pass in `references/shared-conventions.md`.
6. On the finished suite, run the **adversary-structure check**: every `SP-*` states which corruption sets and shared failure domains it survives, with `ASM-*` citations. Then generate the pairwise collusion table as a sanity check only; label it non-exhaustive in §12.
7. Keep the Rationale log as decisions happen; retrofitted rationale loses the alternatives actually considered.
