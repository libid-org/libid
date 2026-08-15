# Contract / On-Chain Interface Spec Template (ERC/EIP style)

Contents: Preambles (public EIP/ERC vs internal) · Interface and public input construction · Behavior · Trust anchor governance · Test Cases / Conformance · Security Considerations · Drafting guidance


Two preambles — pick one. Only Core, Networking, Interface, or ERC
are valid Standards Track categories per EIP-1; "Internal" is not,
so internal specs use the second preamble, not a bent EIP one. The
outer fence uses four backticks so nested fences render.

Public EIP/ERC submission preamble:

````markdown
---
eip: {{EIP_NUMBER}}
title: {{TITLE_MAX_44_CHARS}}
description: {{DESCRIPTION_MAX_140_CHARS}}
author: {{AUTHORS}}
discussions-to: {{DISCUSSION_URL}}
status: Draft
type: Standards Track
category: {{Core|Networking|Interface|ERC}}
created: {{DATE}}
requires: {{EIP_DEPS}}
---
````

Internal EIP-style preamble:

````markdown
---
title: {{TITLE}}
description: {{DESCRIPTION}}
author: {{AUTHORS}}
status: Draft
doc-id: {{ORG_DOC_ID}}
created: {{DATE}}
requires: {{INTERNAL_DOC_DEPS}}
---
````

Body (both variants):

````markdown
## Abstract
## Motivation
## Specification

<!-- TEMPLATE: BCP 14 paragraph. -->

### Interface

The interface makes the secure path natural: caller-supplied inputs
exclude every contract-derived value, so a malicious caller cannot
even attempt to supply them.

```solidity
interface I{{NAME}} {
    event AttestationRegistered(bytes32 indexed idCommitment, address indexed subject);

    /// callerInputs excludes contract-derived public inputs
    /// (chain/deployment identifiers); the
    /// contract assembles the full public-input vector internally.
    function verifyAndRegister(
        Proof calldata proof,
        CallerInputs calldata callerInputs
    ) external returns (bytes32 attestationId);
}
```

### Public input construction

For EVERY public input the proof is verified against, state which
component constructs it and which validates it (mirror of the
circuit spec's provenance columns).

Time validity: the Verifier Contract enforces REQ-BOIDC-05I–05L
(owned by [BINDING-OIDC] §5.2 — cite, do not restate): it compares
the circuit-authenticated exp_pub and iat_pub against
block.timestamp (per ASM-CHAIN-02). The contract never takes a
"current time" from calldata and never puts block.timestamp into
the proof's public inputs — a prover cannot know the timestamp of
an unmined transaction.

REQ-VERIF-02A (upholds SP-UNFORGE-01): The Verifier Contract MUST
assemble the full public-input vector internally, appending
contract-derived values (chain and deployment identifiers) to
callerInputs.
REQ-VERIF-02B (upholds SP-UNFORGE-01): The Verifier Contract MUST NOT read chain or
deployment identifiers from calldata.

### Behavior

For EVERY function, in order:
1. Input validation — each check in the order performed, exact
   custom error on failure. Reverts are normative; validation ORDER
   is normative when it affects which revert fires.
2. State reads and checks (nullifier lookups, registry membership).
3. State writes, exactly.
4. Events emitted, with exact fields; state when the contract
   emits each event and when it does not (event requirements name
   the contract as subject).
5. Return values.

### Trust anchor governance
<!-- TEMPLATE: Who can update verifying keys, JWKS roots, registries; timelocks;
which SP-* an admin-key compromise breaks — cite System Model
§4.3–§4.4 rather than restating. -->

## Rationale
## Backwards Compatibility
<!-- TEMPLATE: Storage layout if upgradeable; interface changes; migration. -->

## Test Cases
<!-- TEMPLATE: TEST-VERIF-01A valid proof accepted; one TEST-VERIF-{{NN}}{{L}}
per revert path with exact inputs and expected error; a replay
vector; a vector with a
valid proof whose exp_pub has passed (revert per REQ-BOIDC-05I); a
vector whose exp_pub or iat_pub equals 2^{{INT_WIDTH}} (revert with
INVALID_TOKEN_TIME_RANGE per REQ-BOIDC-05L); a vector attempting caller-supplied chain
identifiers (revert per REQ-VERIF-02B); boundary values around
{{CLOCK_SKEW}}, {{MAX_TOKEN_AGE}}, and 2^{{INT_WIDTH}} - 1. Vectors are
normative unless marked otherwise. -->

## Reference Implementation (non-normative)

## Conformance
<!-- TEMPLATE: Which roles claim conformance; required TEST-* per role. -->

## Security Considerations
<!-- TEMPLATE: Mandatory. Reentrancy per external call; access control per
function; admin powers and their trust cost (cite failure domains);
griefing and gas DoS; front-running of registration and its
interaction with SP-BIND-01; proof malleability at the verifier
boundary; cross-chain/cross-deployment replay and the
domain-separation values (cite their normative owner). -->

## Copyright
Public EIP/ERC variant — use exactly:
Copyright and related rights waived via [CC0](/LICENSE).
Internal variant: {{ORG_LICENSE_LINE}}
````

## Drafting guidance

- Anything the contract trusts (verifying key, registry root,
  oracle) is a Trust Anchor in the top-level §4.3; if absent there,
  add it there first.
- For ecosystem adoption, keep the ERC standalone: no references to
  your backend or circuits except via the proof/public-input format.
