/// @libid/claim — the browser side of a libID handle claim.
///
/// Three flows, one shape each: open the platform's consent screen, prove
/// control of the account, and return a bind-ready proof made out to the
/// holder address. Submitting the claim (one transaction from the holder)
/// and resolving names are `@libid/contracts`' job; this package produces
/// the proof bytes.
///
/// Static assets the host app must stage at its origin (the repo's
/// harness/stage-assets.sh shows how): the tlsn wasm bundle
/// (/tlsn_wasm.js, /tlsn_wasm_bg.wasm, /spawn.js), the compiled circuits
/// (/circuit/dyaka_noir_token.json for X, /circuits/jwt_email.json for
/// Google — the two paths differ for historical reasons; both are
/// overridable per-call), the noir wasm (/wasm/acvm_js_bg.wasm,
/// /wasm/noirc_abi_wasm_bg.wasm), and the OIDC wasm
/// (/wasm/oidc_noir_wasm.js + _bg.wasm). The X and Google provers also
/// require cross-origin isolation (COOP same-origin + COEP require-corp).

export * from './channel.js'
export { compressPublicKey } from './crypto.js'
export * from './github.js'
export * from './google/claim.js'
export * from './google/oidc.js'
export * from './oauth.js'
export * from './prover/index.js'
export * from './relay.js'
export * from './wallet.js'
export * from './x/claim.js'
export * from './x/poll-attestation.js'
export * from './x/prover.js'
export * from './x/range-finders.js'
export * from './x/witness-token.js'
