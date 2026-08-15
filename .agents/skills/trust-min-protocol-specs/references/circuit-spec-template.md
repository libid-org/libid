# ZK Circuit Spec Template

Contents: Statement and time model · Public inputs (provenance) · Private inputs · Constraints summary · In-circuit parsing rules · Properties / Parameters · Test vectors · Security Considerations · Drafting guidance


One document per circuit. The Statement is the contract between
cryptography and the rest of the system.

```markdown
# Circuit: [Name]

Proving system: [Groth16 | PLONK | ...]   Curve/field: [...]
Setup: [universal SRS (source) | circuit-specific (provenance)]
Verifier key governance: [cite contract spec + top-level §4.3]

## 1. Statement

The proof attests knowledge of a witness w such that:

  [Precise math/logic. Example shape — note every external
  construction cites its normative owner rather than being
  restated:

   ∃ (jwt, sig, salt, r) :
     JWSVerify(pk ∈ Registry R, jwt, sig) = 1
     ∧ Claim(jwt, "iss") = iss_pub
     ∧ Claim(jwt, "aud") = aud_pub
     ∧ AzpRule(jwt, aud_pub)   [REQ-BOIDC-05E as owned by
         [BINDING-OIDC] §5; enforced here per its validation
         ownership matrix]
     ∧ H_id = Poseidon(Claim(jwt, "sub"), iss_pub, salt)
     ∧ Claim(jwt, "nonce") = BindingValue(addr_pub, eph_pk, r)
         where BindingValue is EXACTLY the construction owned by
         [BINDING-OIDC] §4 (single normative owner; the circuit
         spec does not redefine it, and r is part of the witness
         because §4 includes it in the preimage)
     ∧ Claim(jwt, "exp") = exp_pub
     ∧ Claim(jwt, "iat") = iat_pub]

  Time model: the circuit does not compare against current time —
  a prover cannot know the block.timestamp of an unmined
  transaction. The circuit authenticates exp_pub and iat_pub as
  coming from the signed token; the Verifier Contract compares them
  against block.timestamp on-chain (REQ-BOIDC-05I–05L). If
  revealing exact timestamps is undesirable, use a predictable
  epoch/bucket construction with explicit tolerances and state it
  in [BINDING-OIDC].

Every symbol is defined in §2 or §3. The set of validations
enforced in-circuit (vs by the contract or Backend) is fixed by
the validation ownership matrix in [BINDING-OIDC] §5.1 — the
instantiated Statement implements exactly the validation rows the
matrix assigns to the Circuit, no more, no less (checked in the
audit and self-review passes).

## 2. Public Inputs

| # | Name | Type/encoding | Semantics | Constructed by | Validated by |
|---|------|---------------|-----------|----------------|--------------|
| 0 | iss_pub | [field elt; exact string packing] | issuer | Backend | Verifier Contract vs Registry |
| 1 | aud_pub | [field elt; exact packing] | expected client_id | Verifier Contract from registered config | Verifier Contract |
| 2 | exp_pub | [uint64 seconds] | token expiry (authenticated output) | Prover from token; authenticity constrained in-circuit (REQ-BOIDC-05G) | Verifier Contract vs block.timestamp (REQ-BOIDC-05I) + range check (REQ-BOIDC-05L) |
| 3 | iat_pub | [uint64 seconds] | token issuance (authenticated output) | Prover from token; authenticity constrained in-circuit (REQ-BOIDC-05H) | Verifier Contract bounds (REQ-BOIDC-05J–05K) + range check (REQ-BOIDC-05L) |

The provenance columns are mandatory in this template. A public
input constructed by
the prover and validated by nobody is an unchecked assumption. The
canonical time trap: comparing a prover-supplied "current time"
in-circuit is void (the prover picks it), while making
block.timestamp a proof input is unsound the other way (the prover
cannot know it pre-mining). The correct pattern is authenticate
in-circuit, compare on-chain — exp_pub/iat_pub above. Their
encodings state the integer width ({{INT_WIDTH}} unsigned seconds)
and the Verifier Contract range-checks the field-element-to-integer
conversion to that width (REQ-BOIDC-05L). Exact
encodings (byte order, padding,
field packing, over-field splitting) are specified per input, and
each constructing component produces them bit-for-bit as specified
here (the enforcing REQ IDs live in the owning documents).

## 3. Private Inputs (Witness)
<!-- TEMPLATE: Same table shape, plus max sizes — witness length limits are
normative circuit parameters. -->

## 4. Constraints (semantic summary)
<!-- TEMPLATE: What is checked, grouped by purpose; for each group, the soundness
failure if it were missing. The auditor's map — not gate-by-gate. -->

## 5. In-Circuit Parsing Rules
<!-- TEMPLATE: Mandatory for any external format parsed in-circuit (JWT base64url,
JSON, DER). Byte-precise: claim location (witness index + how it is
verified), base64url decoding constraints, JSON value-boundary
establishment, exclusion of ambiguous encodings (duplicate keys,
escapes, whitespace variants). Circuit parsers are the canonical
home of soundness bugs — over-specify. -->

## 6. Properties
- Completeness: [...]
- Soundness / knowledge-soundness: [with extractor claim if
  applicable; cite the SP-* that rely on it and the ASM-* for the
  proving system]
- Zero-knowledge: [what proof + public inputs reveal by design;
  the correlation surface]

## 7. Parameters and Limits
<!-- TEMPLATE: Max JWT length, claim lengths, tree depths — with failure modes. -->

## 8. Test Vectors
<!-- TEMPLATE: TEST-CIRC-01A full valid vector; per §5 parsing rule, one
adversarial vector it excludes (TEST-CIRC-05A...); one vector per
provenance trap: a proof whose exp_pub mismatches the token's exp
claim (rejected in-circuit per REQ-BOIDC-05G) and a valid proof
whose exp_pub has passed (rejected on-chain per REQ-BOIDC-05I —
cross-cite TEST-VERIF-*). -->

## 9. Security Considerations
<!-- TEMPLATE: Under-constrained-signal review status; witness-generation
nondeterminism; proof malleability and whether the Verifier
Contract accounts for it; trusted-setup compromise impact (cite
ASM-*); field overflow/aliasing in §2 packings. -->
```

## Drafting guidance

- If the Statement exceeds one screen of math, split the circuit
  and compose statements.
- Any construction shared with a binding or contract spec is
  defined once by its normative owner and cited here — never
  restated. Run the reconcile mode if you find two definitions.
