// Typed notary attestation pollers. Retry policy lives in `pollAttestationUrl`.

interface PollAttestationOptions {
  /** Total polls before giving up (interval × maxAttempts = wall-clock cap). */
  maxAttempts?: number
  /** Consecutive 5xx responses before failing fast. */
  max5xxRetries?: number
  /** Sleep between polls, in ms. */
  intervalMs?: number
  /** Test seam — injected `fetch` for unit tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch
  /** Test seam — sleep function. Defaults to setTimeout-backed Promise. */
  sleepMs?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms))

/** /token attestation wire JSON (matches notary `TokenAttestationWire`). */
export interface TokenAttestationWire {
  bearer_hash: number[]
  bearer_range_start: number
  bearer_range_end: number
  sent_revealed: number[]
  timestamp: number
  notary_signature: number[]
}

/** /me attestation wire JSON (matches notary `MeAttestationWire`). */
export interface MeAttestationWire {
  bearer_hash: number[]
  bearer_range_start: number
  bearer_range_end: number
  sent_revealed: number[]
  sent_prefix_end: number
  sent_suffix_end: number
  recv_revealed: number[]
  handle: string
  user_id: string
  session_addr: string
  timestamp: number
  notary_signature: number[]
}

export async function pollTokenAttestation(
  httpUrl: string,
  sessionId: string,
  options: PollAttestationOptions = {},
): Promise<TokenAttestationWire> {
  return pollAttestationUrl<TokenAttestationWire>(
    `${httpUrl}/zk/proxy/attestation/${sessionId}?session_type=token`,
    sessionId,
    options,
  )
}

export async function pollMeAttestation(
  httpUrl: string,
  sessionId: string,
  params: { handle: string; userId: string; sessionAddr: `0x${string}` },
  options: PollAttestationOptions = {},
): Promise<MeAttestationWire> {
  const url =
    `${httpUrl}/zk/proxy/attestation/${sessionId}?session_type=me` +
    `&handle=${encodeURIComponent(params.handle)}` +
    `&user_id=${encodeURIComponent(params.userId)}` +
    `&session_addr=${encodeURIComponent(params.sessionAddr)}`
  return pollAttestationUrl<MeAttestationWire>(url, sessionId, options)
}

async function pollAttestationUrl<T>(
  url: string,
  sessionId: string,
  options: PollAttestationOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 600
  const max5xxRetries = options.max5xxRetries ?? 5
  const intervalMs = options.intervalMs ?? 200
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleepMs ?? defaultSleep

  let consecutive5xx = 0
  for (let i = 0; i < maxAttempts; i++) {
    const r = await fetchImpl(url)
    if (r.ok) {
      return (await r.json()) as T
    }
    if (r.status === 404) {
      throw new Error(`Notary lost session ${sessionId}`)
    }
    if (r.status >= 500) {
      consecutive5xx += 1
      if (consecutive5xx > max5xxRetries) {
        const body = await r.text().catch(() => '<unreadable>')
        throw new Error(
          `Notary attestation fetch keeps returning ${r.status}: ${body.slice(0, 200)}`,
        )
      }
    } else {
      consecutive5xx = 0
    }
    await sleep(intervalMs)
  }
  throw new Error('Timed out waiting for attestation from notary')
}
