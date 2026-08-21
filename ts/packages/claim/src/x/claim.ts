// Claim an X name, start to finish, in this tab.
//
// The X circuit commits no contract address, so a proof is not made out to
// anyone by the circuit alone. What makes an attestation the naming
// system's is the notary it came from, and that is which verifier address
// the notary was configured with.
//
// The OAuth leg is driven here in about forty lines: a claim leaves
// nothing behind — one transaction from the address that will hold the
// name — so there is no vault, no job queue, no managed session key.

import { encodeXProof } from '@libid/contracts/identity'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { LINK_CHANNEL, parseLinkMessage } from '../channel.js'
import { newOAuthState, pkceChallenge, randomB64url } from '../oauth.js'
import { runXProver } from './prover.js'

export interface XClaimResult {
  proof: Hex
  handle: string
  userId: string
}

export interface XClaimConfig {
  clientId: string
  notaryUrl: string
  /** Where X sends the browser back. Must be registered with the OAuth app
   *  and must land on the relay page (see relay.ts / the demo's
   *  /zk/x-popup route). */
  redirectUri: string
  /** Same-origin URL of the compiled token circuit JSON. Defaults to
   *  `${origin}/circuits/x_token.json`. */
  circuitUrl?: string
}

/** Open X's consent screen and resolve with the authorization code.
 *
 *  The popup is opened synchronously, before any await: browsers grant the
 *  gesture budget to the click, and an `await` first spends it. Everything
 *  asynchronous happens after, and the popup is navigated when it is
 *  ready. */
function authorize(
  config: XClaimConfig,
  signal: AbortSignal,
): { verifier: string; code: Promise<string> } {
  const jobId = crypto.randomUUID()
  const verifier = randomB64url(32)
  const state = newOAuthState(jobId)
  const popup = window.open('about:blank', '_blank', 'width=600,height=760')

  const code = new Promise<string>((resolve, reject) => {
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
      // The relay re-posts until acked, so answer before doing anything else.
      channel.postMessage({ kind: 'ack', jobId })
      if (msg.kind === 'failed') return done(() => reject(new Error(msg.error)))
      if (msg.kind !== 'oauth_callback') return
      const received = 'code' in msg ? msg.code : undefined
      if (!received) return done(() => reject(new Error('X returned no code')))
      done(() => resolve(received))
    }

    void (async () => {
      try {
        const challenge = await pkceChallenge(verifier)
        const url = new URL('https://x.com/i/oauth2/authorize')
        url.searchParams.set('response_type', 'code')
        url.searchParams.set('client_id', config.clientId)
        url.searchParams.set('redirect_uri', config.redirectUri)
        url.searchParams.set('scope', 'tweet.read users.read')
        url.searchParams.set('state', state)
        url.searchParams.set('code_challenge', challenge)
        url.searchParams.set('code_challenge_method', 'S256')
        if (popup) popup.location.href = url.toString()
        else done(() => reject(new Error('The popup was blocked')))
      } catch (e) {
        done(() => reject(e instanceof Error ? e : new Error(String(e))))
      }
    })()
  })

  return { verifier, code }
}

/** Everything from the consent screen to the encoded proof.
 *
 *  `holder` is the address the proof is made out to, and it must be the one
 *  that sends the claim: that single rule is the whole of the
 *  authorization, and it is why a proof read from the mempool is useless to
 *  anybody else. */
export async function proveXClaim(
  holder: Address,
  config: XClaimConfig,
  onStatus: (status: string) => void,
  signal: AbortSignal,
): Promise<XClaimResult> {
  onStatus('Waiting for X…')
  const { verifier, code } = authorize(config, signal)
  const authorizationCode = await code

  // The session key rides inside the attestation and the circuit's public
  // inputs, where the verifier checks only that the two agree. A claim
  // registers no session, so this is generated here and discarded: nothing
  // outlives the proof.
  const sessionAddr = privateKeyToAccount(generatePrivateKey()).address

  const result = await runXProver({
    notaryUrl: config.notaryUrl,
    code: authorizationCode,
    codeVerifier: verifier,
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    sessionAddr,
    walletAddress: holder,
    circuitUrl: config.circuitUrl,
    signal,
    // The prover reports a phase AND a message, and the message is the
    // useful half: the notarize phase is long and the worker narrates it,
    // so showing only the phase leaves a frozen line for a minute or more
    // and no way to tell progress from a stall.
    onStatus: (phase, message) => {
      if (message) onStatus(message)
      else if (phase === 'notarizing') onStatus('Notarizing the response from X…')
      else if (phase === 'proving-token') onStatus('Proving…')
    },
    // The last look before proving, once `/me` says which account was
    // picked. A claim has nothing to refuse — claiming an account you hold
    // is the whole intent — so it says whose name is being proved, which is
    // worth showing during the slowest step.
    checkIdentity: async ({ handle }) => {
      onStatus(`Proving @${handle}…`)
    },
  })

  const me = result.meAttest
  return {
    handle: me.handle,
    userId: me.user_id,
    // One attestation, not two: a claim does not read the OAuth client id,
    // so it never asks for the `/token` session that carries it.
    proof: encodeXProof({
      proof: result.proof,
      publicInputs: result.publicInputs,
      meAttest: {
        bearerHash: bytesToHex(me.bearer_hash),
        bearerRangeStart: me.bearer_range_start,
        bearerRangeEnd: me.bearer_range_end,
        sentRevealed: bytesToHex(me.sent_revealed),
        sentPrefixEnd: me.sent_prefix_end,
        sentSuffixEnd: me.sent_suffix_end,
        recvRevealed: bytesToHex(me.recv_revealed),
        handle: me.handle,
        userId: me.user_id,
        sessionAddr: me.session_addr as Address,
        timestamp: BigInt(me.timestamp),
        notarySignature: bytesToHex(me.notary_signature),
      },
    }),
  }
}

function bytesToHex(bytes: number[]): Hex {
  return `0x${bytes.map((b) => b.toString(16).padStart(2, '0')).join('')}`
}
