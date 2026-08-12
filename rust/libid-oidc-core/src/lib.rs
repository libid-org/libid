//! Shared logic for building Noir circuit inputs from a Google ID token.
//!
//! Used by both the native CLI (`oidc-noir-cli`) and the WASM wrapper
//! (`oidc-noir-wasm`) consumed by the in-browser SPA.
//!
//! Everything is deterministic and byte-exact — given the same JWT, JWK, and
//! session address, you get the same Prover inputs whether you compile this
//! crate to native or to wasm32.

use anyhow::{
    Context,
    Result,
};
use base64::{
    engine::general_purpose::URL_SAFE_NO_PAD,
    Engine as _,
};
use num_bigint::BigUint;
use sha2::{
    Digest,
    Sha256,
};

// ---- circuit-bound constants ----------------------------------------------
pub const SIGNING_INPUT_MAX: usize = 1280;
pub const PAYLOAD_JSON_MAX: usize = 768;
pub const EMAIL_MAX: usize = 62;
pub const NONCE_MAX: usize = 62;
pub const SUB_MAX: usize = 31;
pub const AUDIENCE_MAX: usize = 128;
pub const NUM_LIMBS: usize = 18;
pub const RSA_BITS: usize = 2048;
// noir-bignum v0.10 Barrett overflow bits (was 4 in v0.6).
pub const BARRETT_OVERFLOW_BITS: usize = 6;

// ---- public types ---------------------------------------------------------

/// A parsed Google ID token with everything the circuit needs.
#[derive(Debug, Clone)]
pub struct ParsedJwt {
    pub header_b64: String,
    pub payload_b64: String,
    pub signing_input: String,
    pub payload_json_bytes: Vec<u8>,
    pub kid: String,
    pub email: String,
    pub email_verified: bool,
    pub nonce: String,
    pub sub: String,
    pub audience: String,
    pub exp: u64,
    pub signature: BigUint, // raw signature as a bigint
    pub email_offset: usize,
    pub nonce_offset: usize,
    pub sub_offset: usize,
    pub email_verified_offset: usize,
    pub iss_offset: usize,
    pub aud_offset: usize,
    pub exp_offset: usize,
    pub exp_len: usize,
}

/// Inputs for the `jwt_email` Noir circuit, ready to serialize.
#[derive(Debug, Clone)]
pub struct ProverInputs {
    pub signing_input: Vec<u8>,
    pub signing_input_len: usize,
    pub header_b64_len: usize,
    pub payload_json: Vec<u8>,
    pub payload_json_len: usize,
    pub email_offset: usize,
    pub nonce_offset: usize,
    pub sub_offset: usize,
    pub email_verified_offset: usize,
    pub exp_offset: usize,
    pub exp_len: usize,
    pub iss_offset: usize,
    pub aud_offset: usize,
    pub email_bytes: Vec<u8>,
    pub email_len: usize,
    pub nonce_bytes: Vec<u8>,
    pub nonce_len: usize,
    pub sub_bytes: Vec<u8>,
    pub sub_len: usize,
    pub audience_bytes: Vec<u8>,
    pub audience_len: usize,
    pub signature: Vec<BigUint>, // 18 limbs
    pub redc: Vec<BigUint>,      // 18 limbs
    pub modulus: Vec<BigUint>,   // 18 limbs
    pub email_packed: [BigUint; 2],
    pub nonce_packed: [BigUint; 2],
    pub sub_packed: [BigUint; 1],
    pub exp: u64,
    /// Full SHA-256(client_id), split into two big-endian 128-bit values.
    pub audience_hash: [BigUint; 2],
    /// Deployment binding (pass-through pub inputs): the EVM chain id and the
    /// Registry address the proof targets. The verifier asserts these equal
    /// `block.chainid` / `msg.sender`, scoping the proof to one deployment.
    pub chain_id: u64,
    pub registry_addr: [u8; 20],
}

#[derive(thiserror::Error, Debug)]
pub enum CoreError {
    #[error("invalid JWT structure: {0}")]
    BadJwt(String),
    #[error("missing/invalid claim: {0}")]
    MissingClaim(String),
    #[error("input too large: {0}")]
    TooLarge(String),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

// ---- public API -----------------------------------------------------------

/// Decode a JWT and pre-compute every offset, claim, and packed value the
/// circuit needs. Doesn't do any RSA work — returns enough info to fetch the
/// matching JWK separately.
pub fn parse_jwt(
    id_token: &str,
    expected_nonce: &str,
    expected_audience: &str,
) -> Result<ParsedJwt> {
    anyhow::ensure!(!expected_audience.is_empty(), "expected audience is empty");
    anyhow::ensure!(
        expected_audience.is_ascii(),
        "expected audience must be ASCII"
    );
    anyhow::ensure!(
        expected_audience.len() <= AUDIENCE_MAX,
        "audience exceeds AUDIENCE_MAX={AUDIENCE_MAX}"
    );
    let parts: Vec<&str> = id_token.split('.').collect();
    anyhow::ensure!(parts.len() == 3, "JWT must have 3 parts");
    let (header_b64, payload_b64, sig_b64) = (parts[0], parts[1], parts[2]);
    let signing_input = format!("{header_b64}.{payload_b64}");

    let header_bytes = URL_SAFE_NO_PAD.decode(header_b64)?;
    let header_json: serde_json::Value = serde_json::from_slice(&header_bytes)?;
    anyhow::ensure!(
        header_json["alg"].as_str() == Some("RS256"),
        "alg must be RS256"
    );
    let kid = header_json["kid"]
        .as_str()
        .context("no `kid` in header")?
        .to_string();

    let payload_json_bytes = URL_SAFE_NO_PAD.decode(payload_b64)?;
    let payload: serde_json::Value = serde_json::from_slice(&payload_json_bytes)?;
    let email = payload["email"]
        .as_str()
        .context("no `email` claim — was the email scope granted?")?
        .to_string();
    let email_verified = payload["email_verified"].as_bool().unwrap_or(false);
    anyhow::ensure!(email_verified, "email_verified is false");

    let returned_nonce = payload["nonce"]
        .as_str()
        .context("no `nonce` claim in JWT")?
        .to_string();
    anyhow::ensure!(
        returned_nonce == expected_nonce,
        "nonce mismatch: expected {expected_nonce}, got {returned_nonce}"
    );

    let sub = payload["sub"]
        .as_str()
        .context("no `sub` claim in JWT")?
        .to_string();
    anyhow::ensure!(sub.len() <= SUB_MAX, "sub exceeds SUB_MAX={SUB_MAX}");

    let audience = payload["aud"]
        .as_str()
        .context("no string `aud` claim in JWT")?
        .to_string();
    anyhow::ensure!(
        audience == expected_audience,
        "audience mismatch: expected {expected_audience}, got {audience}"
    );

    // ---- offsets in payload JSON ----
    let find = |needle: &[u8]| -> Result<usize> {
        payload_json_bytes
            .windows(needle.len())
            .position(|w| w == needle)
            .with_context(|| {
                format!("pattern not found: {:?}", std::str::from_utf8(needle))
            })
    };

    let email_offset = find(format!(r#""email":"{email}""#).as_bytes())?;
    let nonce_offset = find(format!(r#""nonce":"{returned_nonce}""#).as_bytes())?;
    let sub_offset = find(format!(r#""sub":"{sub}""#).as_bytes())?;
    let email_verified_offset = find(b"\"email_verified\":true")?;
    let iss_offset = find(b"\"iss\":\"https://accounts.google.com\"")?;
    let aud_offset = find(format!(r#""aud":"{audience}""#).as_bytes())?;

    // ---- exp claim ----
    let exp_offset = find(b"\"exp\":")?;
    let exp_digits_start = exp_offset + 6;
    let mut exp_len = 0usize;
    while exp_digits_start + exp_len < payload_json_bytes.len()
        && payload_json_bytes[exp_digits_start + exp_len].is_ascii_digit()
    {
        exp_len += 1;
    }
    anyhow::ensure!(exp_len > 0, "`exp` value has no digits");
    let exp: u64 = std::str::from_utf8(
        &payload_json_bytes[exp_digits_start..exp_digits_start + exp_len],
    )?
    .parse()
    .context("exp not parseable as u64")?;

    // ---- signature ----
    let sig_bytes = URL_SAFE_NO_PAD.decode(sig_b64)?;
    anyhow::ensure!(sig_bytes.len() == 256, "signature must be 256 bytes");
    let signature = BigUint::from_bytes_be(&sig_bytes);

    Ok(ParsedJwt {
        header_b64: header_b64.to_string(),
        payload_b64: payload_b64.to_string(),
        signing_input,
        payload_json_bytes,
        kid,
        email,
        email_verified,
        nonce: returned_nonce,
        sub,
        audience,
        exp,
        signature,
        email_offset,
        nonce_offset,
        sub_offset,
        email_verified_offset,
        iss_offset,
        aud_offset,
        exp_offset,
        exp_len,
    })
}

/// Combine a parsed JWT with its matching JWK modulus to build everything the
/// Noir circuit needs.
pub fn build_prover_inputs(
    jwt: &ParsedJwt,
    jwk_n_b64url: &str,
    chain_id: u64,
    registry_addr: [u8; 20],
) -> Result<ProverInputs> {
    let n = BigUint::from_bytes_be(&URL_SAFE_NO_PAD.decode(jwk_n_b64url)?);
    anyhow::ensure!(
        n.bits() <= RSA_BITS as u64 && n.bits() > (RSA_BITS - 8) as u64,
        "modulus is not ~2048 bits"
    );

    // Barrett redc parameter, formula per noir-bignum v0.10:
    //   redc = floor(2^(2*MOD_BITS + BARRETT_OVERFLOW_BITS) / n)
    let redc = (BigUint::from(1u8) << (2 * RSA_BITS + BARRETT_OVERFLOW_BITS)) / &n;

    let n_limbs = split_into_limbs(&n, NUM_LIMBS);
    let redc_limbs = split_into_limbs(&redc, NUM_LIMBS);
    let sig_limbs = split_into_limbs(&jwt.signature, NUM_LIMBS);

    // Signing input padded to fixed size.
    let signing_input_bytes = jwt.signing_input.as_bytes();
    if signing_input_bytes.len() > SIGNING_INPUT_MAX {
        anyhow::bail!(
            "signing input is {} bytes, exceeds SIGNING_INPUT_MAX={SIGNING_INPUT_MAX}",
            signing_input_bytes.len()
        );
    }
    if jwt.payload_json_bytes.len() > PAYLOAD_JSON_MAX {
        anyhow::bail!(
            "payload JSON is {} bytes, exceeds PAYLOAD_JSON_MAX={PAYLOAD_JSON_MAX}",
            jwt.payload_json_bytes.len()
        );
    }
    if jwt.email.len() > EMAIL_MAX {
        anyhow::bail!("email exceeds EMAIL_MAX={EMAIL_MAX}");
    }
    if jwt.nonce.len() > NONCE_MAX {
        anyhow::bail!("nonce exceeds NONCE_MAX={NONCE_MAX}");
    }
    if jwt.sub.len() > SUB_MAX {
        anyhow::bail!("sub exceeds SUB_MAX={SUB_MAX}");
    }
    if jwt.audience.len() > AUDIENCE_MAX {
        anyhow::bail!("audience exceeds AUDIENCE_MAX={AUDIENCE_MAX}");
    }

    let mut signing_input = vec![0u8; SIGNING_INPUT_MAX];
    signing_input[..signing_input_bytes.len()].copy_from_slice(signing_input_bytes);
    let mut payload_json = vec![0u8; PAYLOAD_JSON_MAX];
    payload_json[..jwt.payload_json_bytes.len()].copy_from_slice(&jwt.payload_json_bytes);
    let mut email_bytes = vec![0u8; EMAIL_MAX];
    email_bytes[..jwt.email.len()].copy_from_slice(jwt.email.as_bytes());
    let mut nonce_bytes = vec![0u8; NONCE_MAX];
    nonce_bytes[..jwt.nonce.len()].copy_from_slice(jwt.nonce.as_bytes());
    let mut sub_bytes = vec![0u8; SUB_MAX];
    sub_bytes[..jwt.sub.len()].copy_from_slice(jwt.sub.as_bytes());
    let mut audience_bytes = vec![0u8; AUDIENCE_MAX];
    audience_bytes[..jwt.audience.len()].copy_from_slice(jwt.audience.as_bytes());

    let email_packed = pack_62_bytes(&email_bytes);
    let nonce_packed = pack_62_bytes(&nonce_bytes);
    let sub_packed = [pack_31_bytes(&sub_bytes)];
    let audience_digest = Sha256::digest(jwt.audience.as_bytes());
    let audience_hash = [
        BigUint::from_bytes_be(&audience_digest[..16]),
        BigUint::from_bytes_be(&audience_digest[16..]),
    ];

    let header_b64_len = jwt.header_b64.len();

    Ok(ProverInputs {
        signing_input_len: signing_input_bytes.len(),
        signing_input,
        header_b64_len,
        payload_json_len: jwt.payload_json_bytes.len(),
        payload_json,
        email_offset: jwt.email_offset,
        nonce_offset: jwt.nonce_offset,
        sub_offset: jwt.sub_offset,
        email_verified_offset: jwt.email_verified_offset,
        exp_offset: jwt.exp_offset,
        aud_offset: jwt.aud_offset,
        exp_len: jwt.exp_len,
        iss_offset: jwt.iss_offset,
        email_len: jwt.email.len(),
        email_bytes,
        nonce_len: jwt.nonce.len(),
        nonce_bytes,
        sub_len: jwt.sub.len(),
        sub_bytes,
        audience_len: jwt.audience.len(),
        audience_bytes,
        signature: sig_limbs,
        redc: redc_limbs,
        modulus: n_limbs,
        email_packed,
        nonce_packed,
        sub_packed,
        exp: jwt.exp,
        audience_hash,
        chain_id,
        registry_addr,
    })
}

// ---- helpers --------------------------------------------------------------

/// Split an N-bit big number into 120-bit limbs, little-endian.
pub fn split_into_limbs(n: &BigUint, num_limbs: usize) -> Vec<BigUint> {
    let mask = (BigUint::from(1u8) << 120) - BigUint::from(1u8);
    (0..num_limbs).map(|i| (n >> (120 * i)) & &mask).collect()
}

/// Pack 31 bytes big-endian into a single Field-fitting BigUint.
pub fn pack_31_bytes(bytes: &[u8]) -> BigUint {
    let mut acc = BigUint::from(0u8);
    for &b in bytes.iter().take(31) {
        acc = acc * BigUint::from(256u32) + BigUint::from(b);
    }
    acc
}

/// Pack a 62-byte zero-padded buffer into [Field; 2].
pub fn pack_62_bytes(buf: &[u8]) -> [BigUint; 2] {
    [pack_31_bytes(&buf[0..31]), pack_31_bytes(&buf[31..62])]
}

/// keccak256 of the 18 modulus limbs each rendered as a 32-byte big-endian
/// word, matching how `Registry.sol` derives `modulusHash` from the
/// proof's first 18 public inputs.
pub fn compute_modulus_hash(modulus: &BigUint) -> [u8; 32] {
    let limbs = split_into_limbs(modulus, NUM_LIMBS);
    let mut buf = Vec::with_capacity(NUM_LIMBS * 32);
    for limb in &limbs {
        let mut bytes = [0u8; 32];
        let lb = limb.to_bytes_be();
        bytes[32 - lb.len()..].copy_from_slice(&lb);
        buf.extend_from_slice(&bytes);
    }
    let mut out = [0u8; 32];
    inline_keccak::keccak256(&buf, &mut out);
    out
}

// ---- TOML serialization (used by CLI) -------------------------------------

impl ProverInputs {
    /// Render as a Prover.toml string for `nargo execute`.
    pub fn to_prover_toml(&self) -> String {
        let mut o = String::new();
        let push = |o: &mut String, k: &str, v: String| {
            o.push_str(&format!("{k} = {v}\n"));
        };
        let bytes = |bs: &[u8]| -> String {
            let parts: Vec<String> = bs.iter().map(|b| b.to_string()).collect();
            format!("[{}]", parts.join(", "))
        };
        let limbs = |ls: &[BigUint]| -> String {
            let parts: Vec<String> = ls
                .iter()
                .map(|l| format!("\"0x{}\"", l.to_str_radix(16)))
                .collect();
            format!("[{}]", parts.join(", "))
        };

        push(
            &mut o,
            "signing_input_len",
            self.signing_input_len.to_string(),
        );
        push(&mut o, "header_b64_len", self.header_b64_len.to_string());
        push(
            &mut o,
            "payload_json_len",
            self.payload_json_len.to_string(),
        );
        push(&mut o, "email_len", self.email_len.to_string());
        push(&mut o, "email_offset", self.email_offset.to_string());
        push(&mut o, "nonce_len", self.nonce_len.to_string());
        push(&mut o, "nonce_offset", self.nonce_offset.to_string());
        push(&mut o, "sub_len", self.sub_len.to_string());
        push(&mut o, "sub_offset", self.sub_offset.to_string());
        push(&mut o, "audience_len", self.audience_len.to_string());
        push(
            &mut o,
            "email_verified_offset",
            self.email_verified_offset.to_string(),
        );
        push(&mut o, "exp_offset", self.exp_offset.to_string());
        push(&mut o, "exp_len", self.exp_len.to_string());
        push(&mut o, "exp", format!("\"{}\"", self.exp));
        push(&mut o, "iss_offset", self.iss_offset.to_string());
        push(&mut o, "aud_offset", self.aud_offset.to_string());
        push(&mut o, "chain_id", format!("\"{}\"", self.chain_id));
        push(
            &mut o,
            "registry_addr",
            format!("\"0x{}\"", hex::encode(self.registry_addr)),
        );
        push(&mut o, "email_packed", limbs(&self.email_packed));
        push(&mut o, "nonce_packed", limbs(&self.nonce_packed));
        push(&mut o, "sub_packed", limbs(&self.sub_packed));
        push(&mut o, "audience_hash", limbs(&self.audience_hash));
        push(&mut o, "signing_input", bytes(&self.signing_input));
        push(&mut o, "payload_json", bytes(&self.payload_json));
        push(&mut o, "email_bytes", bytes(&self.email_bytes));
        push(&mut o, "nonce_bytes", bytes(&self.nonce_bytes));
        push(&mut o, "sub_bytes", bytes(&self.sub_bytes));
        push(&mut o, "audience_bytes", bytes(&self.audience_bytes));
        push(&mut o, "signature", limbs(&self.signature));
        push(&mut o, "modulus", limbs(&self.modulus));
        push(&mut o, "redc", limbs(&self.redc));
        o
    }

    /// Render as a noir_js-compatible JSON object (hex strings for numerics,
    /// arrays of byte numbers for byte arrays).
    pub fn to_noir_js_json(&self) -> serde_json::Value {
        let limb_hex = |l: &BigUint| format!("0x{}", l.to_str_radix(16));
        serde_json::json!({
            "signing_input": self.signing_input,
            "signing_input_len": self.signing_input_len.to_string(),
            "header_b64_len": self.header_b64_len.to_string(),
            "payload_json": self.payload_json,
            "payload_json_len": self.payload_json_len.to_string(),
            "email_offset": self.email_offset.to_string(),
            "nonce_offset": self.nonce_offset.to_string(),
            "sub_offset": self.sub_offset.to_string(),
            "email_verified_offset": self.email_verified_offset.to_string(),
            "exp_offset": self.exp_offset.to_string(),
            "exp_len": self.exp_len.to_string(),
            "iss_offset": self.iss_offset.to_string(),
            "aud_offset": self.aud_offset.to_string(),
            "chain_id": self.chain_id.to_string(),
            "registry_addr": format!("0x{}", hex::encode(self.registry_addr)),
            "email_bytes": self.email_bytes,
            "email_len": self.email_len.to_string(),
            "nonce_bytes": self.nonce_bytes,
            "nonce_len": self.nonce_len.to_string(),
            "sub_bytes": self.sub_bytes,
            "sub_len": self.sub_len.to_string(),
            "audience_bytes": self.audience_bytes,
            "audience_len": self.audience_len.to_string(),
            "signature": self.signature.iter().map(limb_hex).collect::<Vec<_>>(),
            "redc": self.redc.iter().map(limb_hex).collect::<Vec<_>>(),
            "modulus": self.modulus.iter().map(limb_hex).collect::<Vec<_>>(),
            "email_packed": self.email_packed.iter().map(limb_hex).collect::<Vec<_>>(),
            "nonce_packed": self.nonce_packed.iter().map(limb_hex).collect::<Vec<_>>(),
            "sub_packed": self.sub_packed.iter().map(limb_hex).collect::<Vec<_>>(),
            "audience_hash": self.audience_hash.iter().map(limb_hex).collect::<Vec<_>>(),
            "exp": self.exp.to_string(),
        })
    }
}

// ---- session keypair (Ethereum address from secp256k1) --------------------
// Kept here so both CLI and WASM can derive addresses identically.

/// Derive a 20-byte Ethereum address from a secp256k1 uncompressed public key
/// (65 bytes: `0x04 || X || Y`).
pub fn pubkey_to_eth_address(uncompressed_pubkey: &[u8]) -> [u8; 20] {
    use sha3_keccak::Keccak256;
    assert_eq!(uncompressed_pubkey.len(), 65);
    assert_eq!(uncompressed_pubkey[0], 0x04);
    let mut hash = [0u8; 32];
    Keccak256::digest_into(&uncompressed_pubkey[1..], &mut hash);
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&hash[12..]);
    addr
}

/// Format a 20-byte address as `0x` + 40 lowercase hex chars.
pub fn format_eth_address(addr: &[u8; 20]) -> String {
    format!("0x{}", hex::encode(addr))
}

// Tiny wrapper to avoid pulling in a full hash crate; Keccak256 is implemented
// inline in a sub-module so we don't depend on tiny-keccak (which is
// optional; we let the calling crate supply the hash).
mod sha3_keccak {
    pub struct Keccak256;
    impl Keccak256 {
        pub fn digest_into(input: &[u8], out: &mut [u8; 32]) {
            // Minimal Keccak-f[1600] using an external crate to avoid
            // re-implementing here — `tiny-keccak` is brought in by the
            // CLI/WASM crates, but we re-export the function via a feature
            // flag to keep this lib lean.
            //
            // To keep oidc-noir-core dependency-free (so it builds cleanly
            // for wasm32 with no glue), we delegate to the inline impl:
            super::inline_keccak::keccak256(input, out);
        }
    }
}

mod inline_keccak {
    // Small Keccak-256 implementation (tiny-keccak public domain port,
    // pared down to the minimum needed). About 90 lines.
    const RC: [u64; 24] = [
        0x0000000000000001,
        0x0000000000008082,
        0x800000000000808a,
        0x8000000080008000,
        0x000000000000808b,
        0x0000000080000001,
        0x8000000080008081,
        0x8000000000008009,
        0x000000000000008a,
        0x0000000000000088,
        0x0000000080008009,
        0x000000008000000a,
        0x000000008000808b,
        0x800000000000008b,
        0x8000000000008089,
        0x8000000000008003,
        0x8000000000008002,
        0x8000000000000080,
        0x000000000000800a,
        0x800000008000000a,
        0x8000000080008081,
        0x8000000000008080,
        0x0000000080000001,
        0x8000000080008008,
    ];
    const RHO: [u32; 24] = [
        1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39,
        61, 20, 44,
    ];
    const PI: [usize; 24] = [
        10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9,
        6, 1,
    ];

    fn keccakf(s: &mut [u64; 25]) {
        for &rc in RC.iter() {
            let mut bc = [0u64; 5];
            for x in 0..5 {
                bc[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
            }
            for x in 0..5 {
                let t = bc[(x + 4) % 5] ^ bc[(x + 1) % 5].rotate_left(1);
                for y in 0..5 {
                    s[x + y * 5] ^= t;
                }
            }
            let mut t = s[1];
            for j in 0..24 {
                let pj = PI[j];
                let tmp = s[pj];
                s[pj] = t.rotate_left(RHO[j]);
                t = tmp;
            }
            for y in 0..5 {
                let mut bc = [0u64; 5];
                for x in 0..5 {
                    bc[x] = s[x + y * 5];
                }
                for x in 0..5 {
                    s[x + y * 5] = bc[x] ^ ((!bc[(x + 1) % 5]) & bc[(x + 2) % 5]);
                }
            }
            s[0] ^= rc;
        }
    }

    pub fn keccak256(input: &[u8], out: &mut [u8; 32]) {
        let mut state = [0u64; 25];
        let rate = 136;
        let mut buf = [0u8; 200];
        let mut p = input;
        while p.len() >= rate {
            buf[..rate].copy_from_slice(&p[..rate]);
            for i in 0..(rate / 8) {
                let mut w = [0u8; 8];
                w.copy_from_slice(&buf[i * 8..i * 8 + 8]);
                state[i] ^= u64::from_le_bytes(w);
            }
            keccakf(&mut state);
            p = &p[rate..];
        }
        let len = p.len();
        buf[..len].copy_from_slice(p);
        // Keccak (not SHA-3) padding: 0x01 ... 0x80
        buf[len] = 0x01;
        buf[(len + 1)..rate].fill(0);
        buf[rate - 1] |= 0x80;
        for i in 0..(rate / 8) {
            let mut w = [0u8; 8];
            w.copy_from_slice(&buf[i * 8..i * 8 + 8]);
            state[i] ^= u64::from_le_bytes(w);
        }
        keccakf(&mut state);
        for i in 0..4 {
            let w = state[i].to_le_bytes();
            out[i * 8..i * 8 + 8].copy_from_slice(&w);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NONCE: &str = "0x1111111111111111111111111111111111111111";
    const CLIENT_ID: &str = "123-example.apps.googleusercontent.com";

    fn unsigned_test_jwt(audience: &str) -> String {
        let header = serde_json::json!({ "alg": "RS256", "kid": "test-key" });
        let payload = serde_json::json!({
            "iss": "https://accounts.google.com",
            "aud": audience,
            "sub": "123456789012345678901",
            "email": "alice@example.com",
            "email_verified": true,
            "nonce": NONCE,
            "exp": 4_102_444_800_u64,
        });
        format!(
            "{}.{}.{}",
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&header).unwrap()),
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap()),
            URL_SAFE_NO_PAD.encode([0_u8; 256]),
        )
    }

    #[test]
    fn binds_runtime_audience_and_exposes_canonical_hash() {
        let jwt = parse_jwt(&unsigned_test_jwt(CLIENT_ID), NONCE, CLIENT_ID).unwrap();
        let mut modulus = [0_u8; 256];
        modulus[0] = 0x80;
        let inputs =
            build_prover_inputs(&jwt, &URL_SAFE_NO_PAD.encode(modulus), 1, [0_u8; 20])
                .unwrap();

        assert_eq!(inputs.audience_len, CLIENT_ID.len());
        assert_eq!(
            inputs.audience_hash[0].to_str_radix(16),
            "c2e35624116098f096170b2daa0d2f12"
        );
        assert_eq!(
            inputs.audience_hash[1].to_str_radix(16),
            "ee25ef22070a1d4aee9fcff8c0d40612"
        );
    }

    #[test]
    fn rejects_mismatched_audience() {
        let error = parse_jwt(&unsigned_test_jwt(CLIENT_ID), NONCE, "other-client")
            .unwrap_err()
            .to_string();
        assert!(error.contains("audience mismatch"), "{error}");
    }
}
