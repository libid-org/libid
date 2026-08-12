// Google OIDC proof pipeline (parent-side).
//
//   proveOidc() — parse the Google ID token relayed from the popup, fetch
//   JWKS, build prover inputs in WASM, and generate the UltraHonk proof in
//   a Web Worker.
//
// This runs in the PARENT; the popup is a pure relay (see relay.ts). The
// deployment target (chain id + verifying contract) is EXPLICIT here: the
// circuit commits both, and the verifier compares the commitment against
// itself, so a proof is only spendable where it was minted for.

import { type RawProof, WorkerProver } from '../prover/index.js'

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'

/** Proof produced in the parent, ready to encode for the claim. */
export interface OidcProofPayload {
  email: string
  /** Immutable Google account id — claims key on this, not the email. */
  sub: string
  /** OIDC nonce the token was minted with (the holder address, lowercase). */
  nonce: string
  honkProof: `0x${string}`
  publicInputs: `0x${string}`[]
}

/** The wasm-pack `--target web` bundle for libid-oidc-wasm, loaded
 *  dynamically from the app origin (staged by the harness's
 *  stage-assets.sh / rust/build-oidc-wasm.sh). */
interface OidcWasm {
  default: (wasmUrl?: string) => Promise<unknown>
  build_prover_inputs: (
    idToken: string,
    jwkN: string,
    nonce: string,
    clientId: string,
    chainId: bigint,
    verifyingContract: string,
  ) => unknown
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  return new Uint8Array(bin.split('').map((c) => c.charCodeAt(0)))
}

function bytesToHexRaw(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

/** Read the selected Google identity before loading the proving stack. */
export function readOidcIdentity(
  idToken: string,
  clientId: string,
): { email: string; sub: string } {
  const [, payloadB64] = idToken.split('.')
  if (!payloadB64) throw new Error('Google returned a malformed ID token')
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64))) as {
    aud?: unknown
    email?: unknown
    sub?: unknown
  }
  if (payload.aud !== clientId) throw new Error('Google token audience mismatch')
  if (typeof payload.email !== 'string' || !payload.email) {
    throw new Error('Google token is missing an email')
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Google token is missing an account id')
  }
  return { email: payload.email, sub: payload.sub }
}

export interface OidcProveArgs {
  idToken: string
  clientId: string
  /** OIDC nonce the token was minted with. For a claim this is the holder
   *  address, LOWERCASE ascii — the circuit packs it verbatim and the
   *  contract compares against the lowercase caller. */
  nonce: string
  /** EVM chain id of the target deployment; bound into the proof and
   *  checked == block.chainid on-chain. */
  chainId: number | bigint
  /** The contract that will verify this proof. The circuit commits it —
   *  a proof minted for one verifier is unspendable at any other. */
  verifyingContract: `0x${string}`
  /** Same-origin URL of the compiled jwt_email circuit JSON. Defaults to
   *  `${origin}/circuits/jwt_email.json`. */
  circuitUrl?: string
  /** Same-origin URL of the libid-oidc-wasm JS bundle. Defaults to
   *  `${origin}/wasm/oidc_noir_wasm.js` (with `_bg.wasm` next to it). */
  wasmUrl?: string
}

/** Build the Google identity proof from an id_token. */
export async function proveOidc(
  args: OidcProveArgs,
  signal?: AbortSignal,
): Promise<OidcProofPayload> {
  signal?.throwIfAborted()
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const circuitUrl = args.circuitUrl ?? `${origin}/circuits/jwt_email.json`
  const wasmJsUrl = args.wasmUrl ?? `${origin}/wasm/oidc_noir_wasm.js`

  const [headerB64, payloadB64] = args.idToken.split('.')
  if (!headerB64 || !payloadB64) throw new Error('Google returned a malformed ID token')
  const headerJson = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64))) as {
    kid: string
  }
  const payload = readOidcIdentity(args.idToken, args.clientId)

  // The bindings are a build artifact staged at the app origin, so they are
  // dynamically imported rather than bundled — same pattern as the tlsn
  // wasm. Init with an EXPLICIT `_bg.wasm` URL: the no-arg default resolves
  // relative to import.meta.url, which is fine here, but explicit keeps the
  // staging contract visible.
  const wasm = (await import(/* webpackIgnore: true */ /* @vite-ignore */ wasmJsUrl)) as OidcWasm
  await wasm.default(wasmJsUrl.replace(/\.js$/, '_bg.wasm'))

  const jwksResp = await fetch(JWKS_URL)
  if (!jwksResp.ok) throw new Error(`JWKS fetch failed: ${jwksResp.status}`)
  const jwks = (await jwksResp.json()) as {
    keys: Array<{ kid: string; n: string }>
  }
  const jwk = jwks.keys.find((k) => k.kid === headerJson.kid)
  if (!jwk) throw new Error('kid not in JWKS — Google rotated, sign in again')

  // chain_id + the verifying contract are bound into the proof and checked
  // on-chain, so it can't be replayed against another deployment sharing
  // the VK — nor against a different consumer of the same circuit.
  const inputs = wasm.build_prover_inputs(
    args.idToken,
    jwk.n,
    args.nonce,
    args.clientId,
    BigInt(args.chainId),
    args.verifyingContract,
  )

  const prover = new WorkerProver(circuitUrl)
  let raw: RawProof
  try {
    raw = await prover.prove(inputs as Record<string, unknown>, signal)
  } finally {
    prover.destroy()
  }

  const honkProof = `0x${bytesToHexRaw(raw.proof)}` as `0x${string}`
  const publicInputs = raw.publicInputs.map((p) =>
    p.startsWith('0x') ? p : `0x${p}`,
  ) as `0x${string}`[]

  return {
    email: payload.email,
    sub: payload.sub,
    nonce: args.nonce,
    honkProof,
    publicInputs,
  }
}
