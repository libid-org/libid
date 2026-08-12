// Claim a Google name.
//
// The proof is a SNARK over a Google-signed id_token, and it commits the
// contract that will verify it — so unlike X, where the circuit names
// nobody, this one is minted for a specific verifier. `verifyingContract`
// here is the naming system's Google verifier, and that is the whole of
// what makes the proof ours.
//
// Two things ride in the token itself. The `sub` is the immutable account
// id, which a claim keys on. And the `nonce` is the address the token was
// minted for — the holder — which is why the login has to be started with
// the connected wallet in hand rather than after the fact.

import { encodeGoogleProof } from '@libid/contracts/identity'
import type { Address, Hex } from 'viem'

import { LINK_CHANNEL, parseLinkMessage } from '../channel.js'
import { newOAuthState } from '../oauth.js'
import { proveOidc } from './oidc.js'

export interface GoogleClaimResult {
  proof: Hex
  handle: string
  userId: string
}

export interface GoogleClaimConfig {
  clientId: string
  /** Google's whitelist points at the backend, which serves the static
   *  fragment relay that forwards the token to the app. */
  redirectUri: string
  /** The naming system's Google verifier. The circuit commits it. */
  verifyingContract: Address
  /** EVM chain id of the target deployment. The circuit commits it. */
  chainId: number | bigint
  /** Same-origin URL of the compiled jwt_email circuit JSON. Defaults to
   *  `${origin}/circuits/jwt_email.json`. */
  circuitUrl?: string
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

/** Open Google's consent screen and resolve with the id_token.
 *
 *  The popup opens synchronously, before any await, or the browser spends
 *  the click's gesture budget waiting and blocks it. */
function authorize(
  holder: Address,
  config: GoogleClaimConfig,
  signal: AbortSignal,
): Promise<string> {
  const jobId = crypto.randomUUID()
  const popup = window.open('about:blank', '_blank', 'width=600,height=760')

  return new Promise<string>((resolve, reject) => {
    const channel = new BroadcastChannel(LINK_CHANNEL)
    const done = (fn: () => void) => {
      channel.close()
      signal.removeEventListener('abort', onAbort)
      fn()
    }
    const onAbort = () => {
      popup?.close()
      done(() => reject(new Error('cancelled')))
    }
    signal.addEventListener('abort', onAbort)

    channel.onmessage = ({ data }) => {
      const msg = parseLinkMessage(data)
      if (!msg || msg.jobId !== jobId) return
      channel.postMessage({ kind: 'ack', jobId })
      if (msg.kind === 'failed') return done(() => reject(new Error(msg.error)))
      if (msg.kind !== 'oauth_callback') return
      const token = 'idToken' in msg ? msg.idToken : undefined
      if (!token) return done(() => reject(new Error('Google returned no id_token')))
      done(() => resolve(token))
    }

    const url = new URL(AUTH_URL)
    url.searchParams.set('client_id', config.clientId)
    url.searchParams.set('redirect_uri', config.redirectUri)
    url.searchParams.set('response_type', 'id_token')
    url.searchParams.set('response_mode', 'fragment')
    url.searchParams.set('scope', 'openid email')
    url.searchParams.set('state', newOAuthState(jobId))
    // Packed verbatim in-circuit and compared on chain against a LOWERCASE
    // ascii address — a checksummed one mismatches with WrongAddress.
    url.searchParams.set('nonce', holder.toLowerCase())
    url.searchParams.set('prompt', 'select_account')

    if (popup) popup.location.href = url.toString()
    else done(() => reject(new Error('The popup was blocked')))
  })
}

export async function proveGoogleClaim(
  holder: Address,
  config: GoogleClaimConfig,
  onStatus: (status: string) => void,
  signal: AbortSignal,
): Promise<GoogleClaimResult> {
  onStatus('Waiting for Google…')
  const idToken = await authorize(holder, config, signal)

  onStatus('Proving…')
  const payload = await proveOidc(
    {
      idToken,
      clientId: config.clientId,
      nonce: holder.toLowerCase(),
      chainId: config.chainId,
      verifyingContract: config.verifyingContract,
      circuitUrl: config.circuitUrl,
    },
    signal,
  )

  return {
    handle: payload.email,
    userId: payload.sub,
    proof: encodeGoogleProof({
      honkProof: payload.honkProof,
      publicInputs: payload.publicInputs,
      email: payload.email,
      // The address the token was minted for. Called `sessionKey` because
      // that is the circuit's name for the nonce address, not because it is
      // one.
      sessionKey: holder,
      sub: payload.sub,
    }),
  }
}
