/// Ceremony profile constants, the protocol parameters governance owns, and
/// the GitHub Token-Exchange Service contract.
///
/// # The namespaced strings are ours, not the specification's
///
/// ceremony-common fixes exactly one literal: `libid.identity.pkce`, in
/// section 7. Every other libID-namespaced string — the platform name
/// each Consumer's operation domain (REQ-COMMON-01A) — is required to exist
/// and required to be pinned, but its bytes are left to the profile author.
///
/// So these are a cross-implementation agreement, not a reading of the
/// specification. A notary emitting one string and a verifier pinning another
/// derives a key nobody trusts and rejects every genuine attestation, with no
/// error that says why. `libid-rs/crates/libid-ceremony/src/profile.rs` and
/// `solidity/contracts/ceremony/CeremonyProfile.sol` carry the same strings.

import { type Hex, keccak256 } from 'viem'

import {
  ALLOW_HYPHEN_GITHUB,
  ALLOW_HYPHEN_GOOGLE,
  ALLOW_HYPHEN_X,
  ALLOW_UNDERSCORE_GITHUB,
  ALLOW_UNDERSCORE_GOOGLE,
  ALLOW_UNDERSCORE_X,
  IS_EMAIL_GITHUB,
  IS_EMAIL_GOOGLE,
  IS_EMAIL_X,
  MAX_LENGTH_GITHUB,
  MAX_LENGTH_GOOGLE,
  MAX_LENGTH_X,
  STRIP_LEADING_AT_GITHUB,
  STRIP_LEADING_AT_GOOGLE,
  STRIP_LEADING_AT_X,
} from '../identity/handleVectors.js'

const tag = (s: string): Hex => keccak256(new TextEncoder().encode(s))

/// How a profile binds the Authorization Digest to its evidence — exactly one
/// of the two, never both and never neither (REQ-COMMON-02C).
export type DigestBinding = 'public-proof-input' | 'revealed-code-verifier'

/// One notarized session of a ceremony.
export interface SessionProfile {
  /// The TLS server name the notary authenticated, lowercase ASCII with no
  /// trailing dot. It reaches the verifier as `authorityId`, never as a
  /// transcript range: the transcript holds it only in a prover-composed
  /// `Host` header, which says nothing about which server answered.
  authority: string
  method: 'GET' | 'POST'
  /// Origin-form path, no query.
  path: string
}

/// The five parameters of platform-ceremonies §2.1a. `isEmail` supersedes the
/// two booleans below it (REQ-PLAT-67); they are stated because REQ-PLAT-72
/// requires a profile to fix all five.
export interface HandleRules {
  maxLength: number
  stripLeadingAt: boolean
  isEmail: boolean
  allowUnderscore: boolean
  allowHyphen: boolean
}

export interface PlatformProfile {
  /// Preimage of `platformId` (REQ-COMMON-55).
  name: string
  platformId: Hex
  /// Launch profiles use 1 (REQ-PLAT-01).
  platformVerifierVersion: number
  digestBinding: DigestBinding
  tokenSession?: SessionProfile
  identitySession?: SessionProfile
  handle: HandleRules
}

/// `google/v1` — authentication-only OIDC. No token exchange, no client
/// secret, no PKCE, no notarized session, and therefore no Notary Fee.
export const GOOGLE_V1: PlatformProfile = {
  name: 'google',
  platformId: tag('google'),
  platformVerifierVersion: 1,
  digestBinding: 'public-proof-input',
  // Read from the generated table, never restated. `handles.json` is the
  // one source; a second copy here would drift and the browser would
  // normalize to a node the chain never writes.
  handle: {
    maxLength: MAX_LENGTH_GOOGLE,
    stripLeadingAt: STRIP_LEADING_AT_GOOGLE,
    isEmail: IS_EMAIL_GOOGLE,
    allowUnderscore: ALLOW_UNDERSCORE_GOOGLE,
    allowHyphen: ALLOW_HYPHEN_GOOGLE,
  },
}

/// `x/v1` — a public client with S256 PKCE and two browser-owned sessions.
export const X_V1: PlatformProfile = {
  name: 'x',
  platformId: tag('x'),
  platformVerifierVersion: 1,
  digestBinding: 'revealed-code-verifier',
  tokenSession: {
    authority: 'api.x.com',
    method: 'POST',
    path: '/2/oauth2/token',
  },
  identitySession: {
    authority: 'api.x.com',
    method: 'GET',
    path: '/2/users/me',
  },
  // Read from the generated table, never restated. `handles.json` is the
  // one source; a second copy here would drift and the browser would
  // normalize to a node the chain never writes.
  handle: {
    maxLength: MAX_LENGTH_X,
    stripLeadingAt: STRIP_LEADING_AT_X,
    isEmail: IS_EMAIL_X,
    allowUnderscore: ALLOW_UNDERSCORE_X,
    allowHyphen: ALLOW_HYPHEN_X,
  },
}

/// `github/v1` — a confidential client, so the exchange runs in the
/// deployment's Token-Exchange Service and that service is the notarized party
/// for the token session. The two sessions have two different authorities.
export const GITHUB_V1: PlatformProfile = {
  name: 'github',
  platformId: tag('github'),
  platformVerifierVersion: 1,
  digestBinding: 'revealed-code-verifier',
  tokenSession: {
    authority: 'github.com',
    method: 'POST',
    path: '/login/oauth/access_token',
  },
  identitySession: {
    authority: 'api.github.com',
    method: 'GET',
    path: '/user',
  },
  // Read from the generated table, never restated. `handles.json` is the
  // one source; a second copy here would drift and the browser would
  // normalize to a node the chain never writes.
  handle: {
    maxLength: MAX_LENGTH_GITHUB,
    stripLeadingAt: STRIP_LEADING_AT_GITHUB,
    isEmail: IS_EMAIL_GITHUB,
    allowUnderscore: ALLOW_UNDERSCORE_GITHUB,
    allowHyphen: ALLOW_HYPHEN_GITHUB,
  },
}

export const LAUNCH_PROFILES = [GOOGLE_V1, X_V1, GITHUB_V1] as const

/// Derived from the session list the profile fixes, never stated beside it
/// (REQ-COMMON-41). Google verifies none and pays nothing; X and GitHub verify
/// two each, so one submission on either path pays two Notary Fees.
export function attestationCount(profile: PlatformProfile): number {
  return (profile.tokenSession ? 1 : 0) + (profile.identitySession ? 1 : 0)
}

/// Governance-owned seconds. The Platform Verifier reads the current value
/// when it verifies; a browser read is advisory only (libid.md, REQ-PARAM-02).
export interface ProtocolParameters {
  proofLifetimeX: bigint
  proofLifetimeGithub: bigint
  maxFutureAttestationSkew: bigint
}

export const LAUNCH_PARAMETERS: ProtocolParameters = {
  proofLifetimeX: 3600n,
  proofLifetimeGithub: 3600n,
  maxFutureAttestationSkew: 300n,
}

// --- GitHub Token-Exchange Service (platform-ceremonies §6.3) ---------------

/// Fixed route on the redirect origin.
export const TOKEN_EXCHANGE_ROUTE = '/oauth/github/token-exchange'

export const MAX_GITHUB_CODE_BYTES = 1024
export const GITHUB_CODE_VERIFIER_LEN = 43
export const MAX_GITHUB_ACCESS_TOKEN_BYTES = 4096
export const MAX_GITHUB_BEARER_OPENING_BYTES = 256
export const MAX_GITHUB_TOKEN_ATTESTATION_BYTES = 2 * 1024 * 1024
/// The whole response body, which a transport bounds before this module ever
/// parses it (REQ-PLAT-39). Exported so a server or a fetch wrapper can apply
/// it; `validateTokenExchangeResponse` bounds the fields, not the envelope.
export const MAX_GITHUB_TOKEN_EXCHANGE_RESPONSE_BYTES = 3 * 1024 * 1024

export interface TokenExchangeRequestV1 {
  schema: 1
  code: string
  codeVerifier: string
}

export interface TokenExchangeResponseV1 {
  schema: 1
  accessToken: string
  /// Canonical unpadded base64url of the attested data.
  tokenAttestation: string
  /// Canonical unpadded base64url of the blinder that opens the committed
  /// bearer range of that attestation.
  ///
  /// Private witness material. It must never enter a submission, a log, or
  /// anything leaving the browser: the opening and the commitment together
  /// reveal the credential the commitment exists to hide (REQ-PLAT-55).
  bearerOpening: string
}

export class TokenExchangeError extends Error {}

/// Bounded parsing, per REQ-PLAT-37, REQ-PLAT-38 and REQ-PLAT-40.
export function validateTokenExchangeRequest(request: TokenExchangeRequestV1): void {
  if (request.schema !== 1) throw new TokenExchangeError(`unknown schema ${request.schema}`)
  if (request.code.length === 0) throw new TokenExchangeError('code is empty')
  if (request.code.length > MAX_GITHUB_CODE_BYTES) {
    throw new TokenExchangeError(`code is ${request.code.length} bytes, over the bound`)
  }
  // Printable ASCII excludes whitespace and control characters.
  if (!/^[\x21-\x7e]+$/.test(request.code)) {
    throw new TokenExchangeError('code carries a byte outside printable ASCII')
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(request.codeVerifier)) {
    throw new TokenExchangeError('codeVerifier must match [A-Za-z0-9_-]{43}')
  }
}

/// Canonical unpadded base64url: the alphabet, and no length a decoder cannot
/// have produced. Four characters carry three bytes, so a remainder of one is
/// unreachable.
const BASE64URL_NOPAD = /^[A-Za-z0-9_-]+$/

/// Bounded parsing, per REQ-PLAT-39.
///
/// The response is checked as strictly as the request. It arrives from the
/// network, and everything downstream of it -- the bearer that goes into a
/// circuit, the attestation a verifier decodes -- assumes the shape stated
/// here. An empty or non-printable `accessToken` fails much later, inside the
/// prover, where the reason is unrecoverable.
export function validateTokenExchangeResponse(response: TokenExchangeResponseV1): void {
  if (response.schema !== 1) throw new TokenExchangeError(`unknown schema ${response.schema}`)
  if (response.accessToken.length === 0) throw new TokenExchangeError('accessToken is empty')
  if (response.accessToken.length > MAX_GITHUB_ACCESS_TOKEN_BYTES) {
    throw new TokenExchangeError('accessToken is over the bound')
  }
  // Non-empty printable ASCII with no CR and no LF (REQ-PLAT-30, REQ-PLAT-36,
  // REQ-COMMON-37). That is also what makes the length above a byte count.
  if (!/^[\x21-\x7e]+$/.test(response.accessToken)) {
    throw new TokenExchangeError('accessToken carries a byte outside printable ASCII')
  }
  requireBase64Url(response.bearerOpening, 'bearerOpening')
  requireBase64Url(response.tokenAttestation, 'tokenAttestation')
  // The bounds are on the DECODED lengths, so base64url expands by 4/3.
  if (decodedLength(response.bearerOpening) > MAX_GITHUB_BEARER_OPENING_BYTES) {
    throw new TokenExchangeError('bearerOpening is over the bound')
  }
  if (decodedLength(response.tokenAttestation) > MAX_GITHUB_TOKEN_ATTESTATION_BYTES) {
    throw new TokenExchangeError('tokenAttestation is over the bound')
  }
}

function requireBase64Url(value: string, field: string): void {
  if (value.length === 0) throw new TokenExchangeError(`${field} is empty`)
  if (!BASE64URL_NOPAD.test(value)) {
    throw new TokenExchangeError(`${field} is not unpadded base64url`)
  }
  if (value.length % 4 === 1) {
    throw new TokenExchangeError(`${field} has a length no encoder produces`)
  }
}

function decodedLength(base64UrlNoPad: string): number {
  const groups = Math.floor(base64UrlNoPad.length / 4)
  const rest = base64UrlNoPad.length - groups * 4
  return groups * 3 + (rest === 0 ? 0 : rest - 1)
}
