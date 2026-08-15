# Identity Evidence Binding Templates (IETF RFC style)

Contents:
- [Mechanism selection](#identity-evidence-binding-templates-ietf-rfc-style)
- [Template A — OIDC ID Token Binding](#template-a--oidc-id-token-binding)
- [Template B — OAuth Access Token + Provider API Binding](#template-b--oauth-access-token--provider-api-binding)
- [Template C — TLSNotary Transcript Binding](#template-c--tlsnotary-transcript-binding)

Branch by EVIDENCE MECHANISM, not by provider. One document per
mechanism actually used. Provider differences within a mechanism go
in that document's provider appendix; a provider that lacks a
mechanism entirely (e.g., GitHub does not issue OIDC ID Tokens in
its OAuth flows) belongs to a different mechanism's document.

| Mechanism | Identity evidence | Typical providers |
|---|---|---|
| A. OIDC ID Token | signed ID Token with nonce | Google, Microsoft, Apple |
| B. OAuth token + provider API | authenticated API response (the token is authorization, not a portable identity assertion) | GitHub, X |
| C. TLSNotary transcript | notarized TLS transcript of A or B traffic | any, when the verifier must not trust the Backend's word |

Fill-slots use {{SENTINEL}} form; the linter fails on any left in an
instantiated document. Common to all three: BCP 14 paragraph;
imported terms; allowlists never denylists; explicit CSRF handling
per [RFC9700]; stable error IDs; atomic requirements (one MUST per
sentence, acting principal/component as grammatical subject).

---

## Template A — OIDC ID Token Binding

```markdown
# {{NAME}} OIDC ID Token Binding

## 1. Introduction
<!-- TEMPLATE: Profiles [OIDC] + [RFC6749] + [RFC7636] + [RFC9700]; does not
modify them. Applies only to providers issuing ID Tokens. -->

## 2. Conventions and Definitions

## 3. Flow Profile
REQ-BOIDC-01 (upholds {{SP_OAUTH_ID}}): The Backend MUST use the authorization code flow with
PKCE [RFC7636].
REQ-BOIDC-02 (upholds {{SP_OAUTH_ID}}): The Backend MUST implement CSRF protection per
[RFC9700] using {{CSRF_MECHANISM}}.
<!-- TEMPLATE: Client model: which principal holds which client_id; confidential
vs public; redirect URI termination. Scopes/claims requested:
exact allowlist. -->

## 4. Binding Value Construction   ** normative owner **

REQ-BOIDC-04 (upholds SP-BIND-01): The Client MUST set the OIDC
nonce parameter [OIDC §3.1.2.1 — nonce is an OIDC concept, not
generic OAuth] to:

   nonce = base64url( H( domain_tag || addr || eph_pk || r ) )

with each component's exact byte encoding and length, H specified,
domain_tag stated here in full, and r a fresh random value of
{{R_BYTES}} bytes retained in the prover witness. This section is
the single normative owner of BindingValue; circuit and contract
specs cite it and do not restate it (editorial suite rule, checked
by the reconcile mode — not a protocol requirement).

## 5. ID Token Validation

### 5.1 Validation ownership matrix (mandatory)

Every validation names its normative owner and the component that
enforces it. Validations enforced by the Backend place the Backend
inside the trust envelope for that check — the System Model must
say so.

| Validation | Normative owner | Enforcing component | Inputs |
|---|---|---|---|
| Signature and algorithm | this doc §5.2 | Circuit | header, payload, signature, registry |
| Issuer | this doc §5.2 | Circuit + contract registry | iss, registry root |
| Audience | this doc §5.2 | Circuit | aud, aud_pub |
| Authorized party | this doc §5.2 | Circuit | azp, audience cardinality |
| Expiry authenticity | this doc §5.2 | Circuit | exp claim, exp_pub |
| Expiry currency | this doc §5.2 | Verifier Contract | exp_pub, block.timestamp |
| Issuance authenticity | this doc §5.2 | Circuit | iat claim, iat_pub |
| Issuance freshness | this doc §5.2 | Verifier Contract | iat_pub, block.timestamp |
| Nonce | this doc §4 | Circuit | nonce, BindingValue |

An instantiated spec names the actual enforcing component in every
requirement below — never a generic "Validating Component" — so the
matrix and the requirements cannot drift while each looks complete.

### 5.2 Validation requirements (atomic — one obligation per ID)

REQ-BOIDC-05A (upholds {{SP_TOKEN_ID}}): The Circuit MUST verify the ID Token signature
against a key in the Registry.
REQ-BOIDC-05B (upholds {{SP_TOKEN_ID}}): The Circuit MUST reject an ID Token whose alg value
is absent from the provider-specific allowlist.
REQ-BOIDC-05C (upholds {{SP_TOKEN_ID}}): The Circuit MUST reject an ID Token whose alg value
is "none".
REQ-BOIDC-05D (upholds {{SP_TOKEN_ID}}): The Circuit MUST constrain the aud claim to contain
the registered client_id represented by aud_pub.
REQ-BOIDC-05E (upholds {{SP_TOKEN_ID}}): The Circuit MUST reject an ID Token that carries
multiple audiences and no azp claim.
REQ-BOIDC-05F (upholds {{SP_TOKEN_ID}}): The Circuit MUST reject an ID Token whose azp claim
is present and not equal to the registered client_id.
<!-- TEMPLATE: OIDC Core phrases the multiple-audience azp check as
"should"; this profile strengthens it to a hard requirement. -->
REQ-BOIDC-05G (upholds {{SP_FRESHNESS_ID}}): The Circuit MUST constrain exp_pub to equal the ID
Token's exp claim.
REQ-BOIDC-05H (upholds {{SP_FRESHNESS_ID}}): The Circuit MUST constrain iat_pub to equal the ID
Token's iat claim.
REQ-BOIDC-05I (upholds {{SP_FRESHNESS_ID}}): The Verifier Contract MUST reject a proof whose
exp_pub is not greater than block.timestamp.
REQ-BOIDC-05J (upholds {{SP_FRESHNESS_ID}}): The Verifier Contract MUST reject a proof when
iat_pub > block.timestamp and iat_pub - block.timestamp exceeds
{{CLOCK_SKEW}} (conditional form — no unchecked subtraction).
REQ-BOIDC-05K (upholds {{SP_FRESHNESS_ID}}): The Verifier Contract MUST reject a proof when
block.timestamp > iat_pub and block.timestamp - iat_pub exceeds
{{MAX_TOKEN_AGE}} (conditional form — no unchecked subtraction).
REQ-BOIDC-05L (upholds {{SP_FRESHNESS_ID}}): Before integer conversion, the Verifier Contract MUST
reject with error INVALID_TOKEN_TIME_RANGE any proof whose exp_pub
or iat_pub lies outside [0, 2^{{INT_WIDTH}} - 1].
<!-- TEMPLATE: state the integer width alongside the encodings in
the circuit spec §2. -->
REQ-BOIDC-06 (upholds {{SP_REVOCATION_ID}}): The Backend MUST NOT cache a JWKS response longer
than {{JWKS_TTL}}. [Rotation-mid-flow behavior.]
<!-- TEMPLATE: If revealing exact exp/iat on-chain is undesirable, define a
predictable epoch/bucket encoding with explicit tolerances here and
adjust 05G–05K accordingly. Per-claim table for remaining claims:
name, required, validation, on-failure error ID. Phrase the
unknown-claim rule with the recipient component as subject. -->

## 6. Provider Appendix (per OIDC provider)
<!-- TEMPLATE: Date-stamped: stable-subject claim choice, alg/JWKS specifics,
nonce echo quirks. Most volatile normative text in the suite. -->

## 7. Error Handling

## 8. Conformance

## 9. Security Considerations

## 10. References
```

---

## Template B — OAuth Access Token + Provider API Binding

```markdown
# {{NAME}} Provider API Binding

## 1. Introduction
<!-- TEMPLATE: For providers WITHOUT OIDC ID Tokens (GitHub, X). The access token
authorizes API calls; identity evidence is the authenticated API
response. -->

## 2. Conventions and Definitions

## 3. Flow Profile
<!-- TEMPLATE: As in A: REQ-BAPI-01 code flow + PKCE [RFC7636]; REQ-BAPI-02 CSRF
per [RFC9700]; token storage/retention rules with the Backend as
subject. -->

## 4. Binding Trust Decision (MANDATORY — choose exactly one)

The OAuth state parameter correlates the authorization response
with the client session and protects against CSRF; it is not
echoed in the authenticated provider API response, so state alone
cannot show an independent verifier that the Provider Identity was
bound to Chain Material. The spec author selects exactly one of the
following paths and records the trust consequence in the System
Model:

(a) Backend-attested binding.
    REQ-BAPI-04A (upholds {{SP_OAUTH_ID}}): The Backend MUST verify the state parameter.
    REQ-BAPI-04B (upholds SP-BIND-01): The Backend MUST attest the
    identity-to-Chain-Material binding.
    Consequence: the Backend is trusted for binding correctness —
    add this to its "Trusted for" line and weaken SP-BIND-01's
    adversary structure accordingly.
(b) Notarized challenge binding. REQ-BAPI-04C (upholds SP-BIND-01): The
    {{TRANSCRIPT_PROVER}} MUST produce a notarized transcript
    (mechanism C) committing to a request that carries the
    BindingValue challenge and to the authenticated provider
    response, per [BINDING-TLSN] §5. Consequence: SP-BIND-01 holds
    under the Notary trust statement.
(c) Other cryptographic binding: {{CONSTRUCTION}} with a stated
    normative owner and adversary structure.
(d) None of the above is implemented. Consequence: this mechanism
    does not provide SP-BIND-01 — state it in Security
    Considerations and in the SP's adversary structure.

## 5. Identity Evidence Profile
REQ-BAPI-05A (upholds {{SP_IDENTITY_ID}}): The Backend MUST obtain identity evidence from
{{EVIDENCE_ENDPOINT}} (the provider's authenticated user endpoint).
REQ-BAPI-05B (upholds {{SP_IDENTITY_ID}}): The Backend MUST NOT treat the access token as an
identity assertion.
REQ-BAPI-05C (upholds {{SP_IDENTITY_ID}}): The Circuit MUST NOT consume the access token as an
identity assertion.
REQ-BAPI-05D (upholds {{SP_IDENTITY_ID}}): The Verifier Contract MUST NOT consume the access
token as an identity assertion.
<!-- TEMPLATE: Request shape; response fields consumed (per-field table: type,
validation, on-failure); fields ignored; response freshness bound. -->

## 6. Provider Appendix
<!-- TEMPLATE: GitHub: no ID Tokens in OAuth flows; stable user id field; rate
limits and error shapes relied on. X: OAuth 2.0 code+PKCE, scopes,
user lookup endpoint. Date-stamped. -->

## 7. Error Handling

## 8. Conformance

## 9. Security Considerations

## 10. References
```

---

## Template C — TLSNotary Transcript Binding

```markdown
# {{NAME}} TLSNotary Binding

## 1. Introduction
<!-- TEMPLATE: Layered over A or B traffic when the Verifier must not trust the
Backend/Client report. Cites the underlying mechanism's document. -->

## 2. Conventions and Definitions

## 3. Notary Protocol Profile
REQ-BTLSN-01 (upholds {{SP_TRANSCRIPT_ID}}): The TLSNotary Client MUST pin TLSNotary version
{{VERSION}} in operating mode {{MODE}}.
REQ-BTLSN-02 (upholds {{SP_TRANSCRIPT_ID}}): The TLSNotary Client MUST use the TLS version
supported by the pinned TLSNotary version, stated here explicitly. [Verify
against the pinned version's documentation — TLSNotary has
documented TLS 1.2 [RFC5246] operation; do not assume TLS 1.3
[RFC8446].]

## 4. Transcript Profile
<!-- TEMPLATE: Exact HTTP request/response ranges committed; redaction rules —
which bytes revealed, which proven-but-hidden; canonicalization. -->
REQ-BTLSN-04 (upholds SP-BIND-01): When implementing path (b) of a mechanism-B binding,
the {{TRANSCRIPT_PROVER}} MUST include the BindingValue challenge
in the committed request.

## 5. Commitment Format   ** normative owner **
<!-- TEMPLATE: Byte-precise format consumed downstream by circuit or contract;
those specs cite this section. -->

## 6. Notary Trust Statement
<!-- TEMPLATE: Cite the Notary Operator's four-line entry in top-level §4.1 and
which SP-* fall under Notary + Provider Operator collusion. -->

## 7. Error Handling

## 8. Conformance

## 9. Security Considerations
<!-- TEMPLATE: Plus notary equivocation. -->

## 10. References
```
