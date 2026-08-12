// Claim a GitHub name.
//
// GitHub is the strict platform and the simplest one to drive: no circuit,
// no proving in this tab. The backend runs the notarized exchange and
// returns the proof, so this opens the consent screen, waits, and encodes
// what comes back.
//
// The one thing that matters is `link_wallet`. Without it the backend mints
// a proof carrying the zero sentinel — the shape a wallet registration
// needs — and `IdentityNames` refuses a claim naming nobody. With it, the
// proof is made out to the address that will hold the name, which is also
// the address that has to send the claim.

import { encodeGitHubProof, type TlsProof } from '@libid/contracts/identity'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { compressPublicKey } from './crypto.js'

export interface GitHubClaimResult {
  proof: Hex
  handle: string
  userId: string
}

/** What the backend returns. Only the fields a claim needs are named; the
 *  response carries more. */
interface VerifyResponse {
  user: { username: string; id: string }
  registration_proof: {
    domain: string
    endpoint: string
    tls_proof: {
      notarySignature: Hex
      backendSignature: Hex
      userAddress: Address
      walletAddress: Address
      domainHash: Hex
      clientRandom: Hex
      serverRandom: Hex
      serverEphemeralKey: Hex
      transcriptRoot: Hex
      timestamp: string | number
      domainPath: Hex[]
      usernamePath: Hex[]
      endpointPath: Hex[]
      idPath: Hex[]
    }
  }
}

const ZERO = '0x0000000000000000000000000000000000000000'

export async function proveGitHubClaim(
  holder: Address,
  backendUrl: string,
  onStatus: (status: string) => void,
  signal: AbortSignal,
): Promise<GitHubClaimResult> {
  onStatus('Starting…')

  // The challenge is keyed on a session public key: secp256k1, compressed,
  // and hex WITHOUT the `0x` — the backend hex-decodes the string as it
  // arrives, so a prefix is two bytes of garbage and the wrong curve is
  // rejected outright.
  //
  // A name claim never uses the session this identifies, so the key is
  // generated here and dropped.
  const pubkey = compressPublicKey(privateKeyToAccount(generatePrivateKey()).publicKey).slice(2)

  const challengeResponse = await fetch(`${backendUrl}/auth/github/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pubkey, link_wallet: holder }),
    signal,
  })
  if (!challengeResponse.ok) {
    throw new Error(`challenge failed: ${await challengeResponse.text()}`)
  }
  const { challenge, auth_url: authUrl } = (await challengeResponse.json()) as {
    challenge: string
    auth_url: string
  }

  window.open(authUrl, '_blank', 'width=600,height=760')
  onStatus('Waiting for GitHub…')

  const verify = await poll(backendUrl, challenge, signal)
  const tls = verify.registration_proof.tls_proof

  if (tls.walletAddress.toLowerCase() === ZERO) {
    throw new Error(
      'The backend returned a registration proof, which names nobody. It did not receive link_wallet.',
    )
  }
  if (tls.walletAddress.toLowerCase() !== holder.toLowerCase()) {
    throw new Error(`The proof is made out to ${tls.walletAddress}, not the connected wallet.`)
  }

  const proof: TlsProof = {
    ...tls,
    timestamp: BigInt(tls.timestamp),
  }

  return {
    handle: verify.user.username,
    userId: verify.user.id,
    proof: encodeGitHubProof({
      tls: proof,
      domain: verify.registration_proof.domain,
      handle: verify.user.username,
      userId: verify.user.id,
      endpoint: verify.registration_proof.endpoint,
    }),
  }
}

/** 202 while the notarized exchange is still running, 200 when it is done. */
async function poll(
  backendUrl: string,
  challenge: string,
  signal: AbortSignal,
): Promise<VerifyResponse> {
  const deadline = Date.now() + 5 * 60_000
  for (;;) {
    if (signal.aborted) throw new Error('cancelled')
    if (Date.now() > deadline) throw new Error('timed out waiting for GitHub')
    await new Promise((r) => setTimeout(r, 2000))

    const response = await fetch(`${backendUrl}/auth/github/result/${challenge}`, { signal })
    if (response.status === 202) continue
    if (response.ok) return (await response.json()) as VerifyResponse
    throw new Error(`the login failed (${response.status}): ${await response.text()}`)
  }
}
