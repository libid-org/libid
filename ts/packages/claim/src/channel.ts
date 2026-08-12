// The single popup ↔ parent transport for the client-side claim flows (X,
// Google). The popup is a pure OAuth relay: it posts `oauth_callback` (or
// `failed`), then closes. The parent runs proving + submit, replying `ack`
// so the relay stops re-posting.
//
// BroadcastChannel is same-origin only, but messages are still treated as
// untrusted input: the envelope is validated here and the on-chain verifiers
// bind proofs to their wallet target so a forged message can't retarget a
// claim.

export const LINK_CHANNEL = 'libid_link'

/** The raw provider callback a relay popup hands to the parent. Exactly one
 *  of `code` (authorization-code flows: X) or `idToken` (implicit id_token
 *  flows: Google) is present. */
export type OAuthCallback = { jobId: string; state: string } & (
  | { code: string }
  | { idToken: string }
)

export type LinkChannelMessage =
  // popup → parent: the relay posts the raw OAuth callback; the parent runs
  // the platform-specific completion. The popup never touches key material
  // or the prover.
  | ({ kind: 'oauth_callback' } & OAuthCallback)
  | { kind: 'failed'; jobId: string; error: string }
  // parent → popup: the parent received the oauth_callback; the relay stops
  // re-posting and closes.
  | { kind: 'ack'; jobId: string }

/** Client claim flows require BroadcastChannel (popup transport) and Web
 *  Crypto digest (PKCE challenge hashing). Check them upfront so an
 *  unsupported browser cannot begin a flow and fail halfway. */
export function clientLinkSupported(): boolean {
  return (
    typeof BroadcastChannel === 'function' &&
    typeof globalThis.crypto?.subtle?.digest === 'function'
  )
}

/** Open the link channel; null when BroadcastChannel is unsupported. */
export function openLinkChannel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(LINK_CHANNEL)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Validate an incoming channel event. BroadcastChannel is same-origin, but
 * other windows may run stale code or post garbage — treat the wire format
 * as untrusted: drop anything malformed and rebuild the message so unknown
 * extra fields don't ride along.
 */
export function parseLinkMessage(data: unknown): LinkChannelMessage | null {
  if (!isRecord(data) || typeof data.jobId !== 'string') return null
  const jobId = data.jobId
  switch (data.kind) {
    case 'oauth_callback':
      if (
        typeof data.state === 'string' &&
        (typeof data.code === 'string') !== (typeof data.idToken === 'string')
      ) {
        return {
          kind: 'oauth_callback',
          jobId,
          state: data.state,
          ...(typeof data.code === 'string'
            ? { code: data.code }
            : { idToken: data.idToken as string }),
        }
      }
      return null
    case 'failed':
      if (typeof data.error === 'string') {
        return { kind: 'failed', jobId, error: data.error }
      }
      return null
    case 'ack':
      return { kind: 'ack', jobId }
    default:
      return null
  }
}

/** Fire-and-forget post on the link channel. */
export function postLinkMessage(message: LinkChannelMessage): void {
  try {
    const bc = new BroadcastChannel(LINK_CHANNEL)
    bc.postMessage(message)
    bc.close()
  } catch {
    /* BroadcastChannel unsupported */
  }
}
