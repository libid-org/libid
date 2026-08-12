// The popup side of the claim flows: a pure provider-callback bounce.
// Parse an authorization code from the query or an ID token from the
// fragment, post the handoff on the libid_link channel, retry until the
// parent acks, then close. No wallet, no prover — a consent-only throwaway
// window.
//
// Path-agnostic: the jobId (the `state` prefix) tells the parent which flow
// this callback belongs to, so ANY route rewritten to the relay page works
// (/zk/x-popup for X, /auth/gmail/callback for Google's fragment relay).

import { type LinkChannelMessage, openLinkChannel, parseLinkMessage } from './channel.js'

/** The two messages the popup ever posts (an `ack` is inbound-only). */
export type RelayPayload = Extract<LinkChannelMessage, { kind: 'oauth_callback' | 'failed' }>

export interface OAuthRelayResult {
  status: string
  /** Absent when there's nothing to hand off (missing params). */
  payload?: RelayPayload
}

/**
 * Pure: turn a callback query string into a status line + the message to
 * relay. The parent resolves the platform from the jobId it minted — the
 * wire carries none.
 */
export function parseOAuthRelay(search: string): OAuthRelayResult {
  const params = new URLSearchParams(search)
  const state = params.get('state')
  const jobId = state?.split('~', 1)[0]
  const error = params.get('error')

  if (error) {
    return {
      status: 'Sign-in failed — you can close this window.',
      payload: jobId
        ? { kind: 'failed', jobId, error: params.get('error_description') || error }
        : undefined,
    }
  }

  const code = params.get('code')
  const idToken = params.get('id_token')
  if (!(state && jobId && (code || idToken)) || Boolean(code) === Boolean(idToken)) {
    return { status: 'Missing sign-in parameters — you can close this window.' }
  }

  return {
    status: 'Completing sign-in…',
    payload: {
      kind: 'oauth_callback',
      jobId,
      state,
      ...(code ? { code } : { idToken: idToken as string }),
    },
  }
}

/** Select the provider response and erase Google's JWT fragment immediately.
 *  `gmailCallbackPath` is the path the backend's fragment relay lands on. */
export function readOAuthCallbackLocation(
  current: Pick<Location, 'pathname' | 'search' | 'hash'>,
  browserHistory: Pick<History, 'replaceState'>,
  gmailCallbackPath = '/auth/gmail/callback',
): string {
  if (current.pathname !== gmailCallbackPath) return current.search
  const params = current.hash.slice(1)
  if (current.hash) {
    browserHistory.replaceState(null, '', current.pathname + current.search)
  }
  return params
}

/** Minimal transport the relay needs — a real BroadcastChannel satisfies it. */
export type RelayChannel = Pick<BroadcastChannel, 'postMessage' | 'close' | 'onmessage'>

/**
 * Post `payload` and re-post every second until the parent acks the same
 * job, then close. Returns a stop() (also invoked on ack). DOM-free so the
 * retry/ack/close loop is unit-testable with a mock channel + fake timers.
 */
export function runRelay(
  channel: RelayChannel,
  payload: RelayPayload,
  onAck: () => void,
): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval>
  const stop = () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    channel.close()
  }
  channel.onmessage = ({ data }: MessageEvent) => {
    const msg = parseLinkMessage(data)
    if (msg?.kind !== 'ack' || msg.jobId !== payload.jobId) return
    stop()
    onAck()
  }
  const post = () => {
    if (stopped) return
    try {
      channel.postMessage(payload)
    } catch {
      /* transient — retried on the next tick */
    }
  }
  post()
  timer = setInterval(post, 1_000)
  return stop
}

/** Wire the relay into a real document: read the location, show a status
 *  line, and run the ack loop. Call this from the relay page's entry. */
export function startRelay(statusEl: { textContent: string | null }): void {
  const { status, payload } = parseOAuthRelay(readOAuthCallbackLocation(location, history))
  statusEl.textContent = status
  if (!payload) return

  const channel = openLinkChannel()
  if (!channel) {
    statusEl.textContent = 'Unable to contact the app — you can close this window.'
    return
  }

  const stop = runRelay(channel, payload, () => {
    statusEl.textContent = 'You can close this window.'
    window.close()
  })
  addEventListener('pagehide', stop, { once: true })
}
