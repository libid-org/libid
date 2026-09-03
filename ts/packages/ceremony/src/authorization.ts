/// The Authorization Digest of ceremony-common section 5, and the PKCE
/// construction of section 7 that carries it.
///
/// This mirrors `solidity/contracts/ceremony/CeremonyAuthorization.sol` and
/// `libid-rs/crates/libid-ceremony` byte for byte. The runtime builds the
/// digest before the ceremony starts and the Proof Verifier rebuilds it from
/// the submission; the two must agree or nothing verifies, so the same
/// published vectors pin all three implementations.

import { concat, type Hex, keccak256, numberToBytes, sha256, toHex } from 'viem'

/// Fixed part of the preimage: 32 + 2 + 32 + 32 + 4.
export const PREIMAGE_FIXED_LEN = 102

/// Both the verifier and the challenge are this many unpadded base64url
/// characters.
export const PKCE_LEN = 43

/// Carries no version of its own: the digest already binds
/// `platformVerifierVersion`, and a change to this construction changes the
/// proof statement, which bumps that version (REQ-COMMON-12).
export const PKCE_DOMAIN_STRING = 'libid.identity.pkce'

export interface AuthorizationPreimage {
  /// `keccak256` of the Consumer's libID-namespaced operation-domain string.
  operationDomain: Hex
  platformVerifierVersion: number
  /// `keccak256` of the bytes the chain's own identifier contributes, never
  /// the identifier itself: chains name themselves incompatibly, and some too
  /// wide for 64 bits (REQ-COMMON-01C).
  chainId: Hex
  authorizationNonce: Hex
  transactionData: Hex
}

/// Derive an operation domain from its string.
///
/// The Consumer fixes one libID-namespaced ASCII string per transaction kind.
/// A new operation, or a change to one operation's transaction-data meaning,
/// takes a new string rather than another digest field (REQ-COMMON-01A).
export function operationDomain(domainString: string): Hex {
  return keccak256(new TextEncoder().encode(domainString))
}

/// Derive a chain id from the exact bytes its Chain Profile fixes.
///
/// The digest commits a HASH of the chain's identifier rather than the
/// identifier itself, because chains name themselves incompatibly and some too
/// wide for 64 bits (REQ-COMMON-01C).
export function chainId(identifierBytes: Uint8Array | Hex): Hex {
  return keccak256(identifierBytes)
}

/// The chain id of an EVM chain, exactly as `CeremonyProofVerifier.chainId()`
/// computes it.
///
/// `keccak256(abi.encode(block.chainid))` — the identifier's 32-byte
/// big-endian encoding, hashed. Deriving it any other way builds a digest the
/// chain recomputes differently, and the whole submission then fails on the
/// `code_verifier` comparison after both Notary Fees have been charged, with
/// nothing in the error saying why. So the one form that matches is spelled
/// out here rather than left to each caller.
export function evmChainId(id: bigint | number): Hex {
  const value = BigInt(id)
  if (value < 0n || value > 2n ** 256n - 1n) {
    throw new Error(`chain id ${id} does not fit a uint256`)
  }
  return keccak256(numberToBytes(value, { size: 32 }))
}

/// `PKCE_DOMAIN`.
export function pkceDomain(): Hex {
  return keccak256(new TextEncoder().encode(PKCE_DOMAIN_STRING))
}

function requireBytes(value: Hex, want: number, field: string): Uint8Array {
  const bytes = hexToBytes(value)
  if (bytes.length !== want) {
    throw new Error(`${field} must be ${want} bytes, got ${bytes.length}`)
  }
  return bytes
}

function hexToBytes(value: Hex): Uint8Array {
  const body = value.startsWith('0x') ? value.slice(2) : value
  if (body.length % 2 !== 0) throw new Error(`odd-length hex: ${value}`)
  const out = new Uint8Array(body.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16)
  return out
}

/// Build the preimage of section 5, exactly.
///
/// Only the transaction data varies in length, so every other field sits at a
/// fixed offset and no boundary can be shifted to reinterpret one
/// authorization as another (REQ-COMMON-01).
export function authorizationPreimage(input: AuthorizationPreimage): Hex {
  const { platformVerifierVersion: version } = input
  if (!Number.isInteger(version) || version < 0 || version > 0xffff) {
    throw new Error(`platformVerifierVersion ${version} does not fit two bytes`)
  }
  const transactionData = hexToBytes(input.transactionData)
  if (transactionData.length > 0xffffffff) {
    throw new Error(`transaction data does not fit the four-byte length field`)
  }

  return concat([
    toHex(requireBytes(input.operationDomain, 32, 'operationDomain')),
    toHex(version, { size: 2 }),
    toHex(requireBytes(input.chainId, 32, 'chainId')),
    toHex(requireBytes(input.authorizationNonce, 32, 'authorizationNonce')),
    toHex(transactionData.length, { size: 4 }),
    toHex(transactionData),
  ])
}

/// The Authorization Digest.
export function authorizationDigest(input: AuthorizationPreimage): Hex {
  return keccak256(authorizationPreimage(input))
}

/// `SHA256(PKCE_DOMAIN || authorizationDigest || pkceNonce)`.
export function verifierHash(digest: Hex, pkceNonce: Hex): Hex {
  return sha256(
    concat([
      pkceDomain(),
      toHex(requireBytes(digest, 32, 'authorizationDigest')),
      toHex(requireBytes(pkceNonce, 32, 'pkceNonce')),
    ]),
  )
}

/// `BASE64URL_NOPAD(verifierHash)` — the 43 ASCII bytes the token request
/// reveals, which REQ-COMMON-15A has the Platform Verifier recompute and
/// compare byte for byte.
///
/// `pkceNonce` is drawn freshly per authorization attempt: it becomes public
/// at submission, so reusing one across attempts of a single digest publishes
/// the verifier of an earlier attempt whose code may still be live
/// (REQ-COMMON-13).
export function codeVerifier(digest: Hex, pkceNonce: Hex): string {
  return base64UrlNoPad(hexToBytes(verifierHash(digest, pkceNonce)))
}

/// `BASE64URL_NOPAD(SHA256(ASCII(codeVerifier)))` — the S256 challenge.
export function codeChallenge(verifier: string): string {
  return base64UrlNoPad(hexToBytes(sha256(toHex(new TextEncoder().encode(verifier)))))
}

const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/// Encode bytes as unpadded base64url.
///
/// Written out rather than routed through `btoa`, which is padded, base64 not
/// base64url, and absent from some runtimes this package must run in.
export function base64UrlNoPad(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 3 <= bytes.length; i += 3) {
    const [b0, b1, b2] = [bytes[i]!, bytes[i + 1]!, bytes[i + 2]!]
    out += B64URL_ALPHABET[b0 >> 2]
    out += B64URL_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)]
    out += B64URL_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)]
    out += B64URL_ALPHABET[b2 & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const b0 = bytes[i]!
    out += B64URL_ALPHABET[b0 >> 2]
    out += B64URL_ALPHABET[(b0 & 3) << 4]
  } else if (rest === 2) {
    const [b0, b1] = [bytes[i]!, bytes[i + 1]!]
    out += B64URL_ALPHABET[b0 >> 2]
    out += B64URL_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)]
    out += B64URL_ALPHABET[(b1 & 15) << 2]
  }
  return out
}
