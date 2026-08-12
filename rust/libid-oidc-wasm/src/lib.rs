//! Browser-side input building. Compiled via `wasm-pack build --target web`.
//! JS calls `build_prover_inputs(id_token, jwk_n_b64url, expected_nonce, expected_client_id)` and
//! gets back a JS object ready to feed straight into noir_js.

use libid_oidc_core::{
    build_prover_inputs as core_build,
    parse_jwt as core_parse,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;

// serde_wasm_bindgen by default serializes maps as JS Map objects, but
// noir_js wants plain JS objects. Use this serializer everywhere we hand
// data back to JS.
fn js_serializer() -> serde_wasm_bindgen::Serializer {
    serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true)
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

/// Returns the noir_js-compatible inputs JSON for a Google ID token.
/// `id_token`: the raw three-part JWT string from Google.
/// `jwk_n_b64url`: the `n` field from the matching JWK (base64url, no padding).
/// `expected_nonce`: the OIDC nonce sent during auth (i.e. the session address).
/// `expected_client_id`: the app's Google OAuth client id (the expected JWT `aud`).
/// `chain_id`: target EVM chain id (bound into the proof, checked == block.chainid).
/// `registry_addr`: target Registry address `0x..` (bound, checked == msg.sender).
#[wasm_bindgen]
pub fn build_prover_inputs(
    id_token: &str,
    jwk_n_b64url: &str,
    expected_nonce: &str,
    expected_client_id: &str,
    chain_id: u64,
    registry_addr: &str,
) -> Result<JsValue, JsError> {
    let addr = parse_addr20(registry_addr)?;
    let jwt = core_parse(id_token, expected_nonce, expected_client_id).map_err(jserr)?;
    let inputs = core_build(&jwt, jwk_n_b64url, chain_id, addr).map_err(jserr)?;
    let json = inputs.to_noir_js_json();
    json.serialize(&js_serializer())
        .map_err(|e| JsError::new(&format!("{e}")))
}

/// Parse a `0x`-prefixed (or bare) 40-hex-char address into 20 bytes.
fn parse_addr20(s: &str) -> Result<[u8; 20], JsError> {
    let h = s
        .strip_prefix("0x")
        .or_else(|| s.strip_prefix("0X"))
        .unwrap_or(s);
    let bytes = hex::decode(h)
        .map_err(|e| JsError::new(&format!("bad registry_addr hex: {e}")))?;
    if bytes.len() != 20 {
        return Err(JsError::new("registry_addr must be 20 bytes"));
    }
    let mut out = [0u8; 20];
    out.copy_from_slice(&bytes);
    Ok(out)
}

/// Returns the parsed JWT claims (email, kid, exp, …) without doing the
/// full input build. Useful for the SPA to decide whether to even fetch JWKS.
#[wasm_bindgen]
pub fn parse_id_token(
    id_token: &str,
    expected_nonce: &str,
    expected_client_id: &str,
) -> Result<JsValue, JsError> {
    let jwt = core_parse(id_token, expected_nonce, expected_client_id).map_err(jserr)?;
    let v = serde_json::json!({
        "kid": jwt.kid,
        "email": jwt.email,
        "nonce": jwt.nonce,
        "sub": jwt.sub,
        "exp": jwt.exp,
        "email_verified": jwt.email_verified,
        "audience": jwt.audience,
    });
    v.serialize(&js_serializer())
        .map_err(|e| JsError::new(&format!("{e}")))
}

fn jserr<E: std::fmt::Display>(e: E) -> JsError {
    JsError::new(&format!("{e}"))
}
