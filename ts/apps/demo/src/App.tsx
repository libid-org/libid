// The naming system, end to end, in one page of buttons.
//
// Connect a wallet, log in to a platform, and the account is bound to that
// address. Reading needs no wallet at all — a name resolves for anyone
// with an RPC, which is the point of the thing.

import { proveGitHubClaim, proveGoogleClaim, proveXClaim } from '@libid/claim'
import {
  bindCall,
  PLATFORM_GITHUB_DOMAIN,
  PLATFORM_GOOGLE_DOMAIN,
  PLATFORM_X_DOMAIN,
  platformId,
  primaryName,
  resolveHandle,
  resolveId,
  type NamesReader,
} from '@libid/contracts/identity'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPublicClient, http, type Address, type Hex, type PublicClient } from 'viem'

import { useWallet, type Wallet } from './wallet.js'

const NAMES_ADDRESS = (import.meta.env.VITE_IDENTITY_NAMES_ADDRESS ?? '') as Address
const RPC_URL = import.meta.env.VITE_RPC_URL ?? 'http://127.0.0.1:8545'
const BACKEND_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8722'
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? '31337')
const X_CLIENT_ID = import.meta.env.VITE_X_CLIENT_ID ?? ''
const X_NOTARY_URL = import.meta.env.VITE_NOTARY_WS_URL ?? 'http://127.0.0.1:7048'
const GMAIL_CLIENT_ID = import.meta.env.VITE_GMAIL_CLIENT_ID ?? ''
const GOOGLE_VERIFIER = (import.meta.env.VITE_GOOGLE_IDENTITY_VERIFIER ?? '') as Address

type PlatformKey = 'github' | 'x' | 'google'

interface PlatformEntry {
  key: PlatformKey
  label: string
  domain: string
  /** Null when the flow is wired; a sentence when it is not. */
  unavailable: string | null
}

// GitHub first-class: it is the flow the harness boots end to end.
const PLATFORMS: PlatformEntry[] = [
  { key: 'github', label: 'GitHub', domain: PLATFORM_GITHUB_DOMAIN, unavailable: null },
  {
    key: 'x',
    label: 'X',
    domain: PLATFORM_X_DOMAIN,
    unavailable: X_CLIENT_ID ? null : 'Set VITE_X_CLIENT_ID — the OAuth consent needs it.',
  },
  {
    key: 'google',
    label: 'Google',
    domain: PLATFORM_GOOGLE_DOMAIN,
    // The circuit commits the contract that will verify, so the address has
    // to be known before the token is minted.
    unavailable: GOOGLE_VERIFIER
      ? GMAIL_CLIENT_ID
        ? null
        : 'Set VITE_GMAIL_CLIENT_ID — the OAuth consent needs it.'
      : 'Set VITE_GOOGLE_IDENTITY_VERIFIER — the token is minted for it.',
  },
]

export function App() {
  const wallet = useWallet()
  const [platform, setPlatform] = useState<PlatformKey>('github')

  const selected = PLATFORMS.find((p) => p.key === platform) ?? PLATFORMS[0]
  const id = useMemo(() => platformId(selected.domain), [selected.domain])

  const reader = useMemo<NamesReader | null>(() => {
    if (!NAMES_ADDRESS) return null
    return {
      client: createPublicClient({ transport: http(RPC_URL) }) as unknown as PublicClient,
      address: NAMES_ADDRESS,
    }
  }, [])

  if (!reader) {
    return (
      <main>
        <h1>libID claim demo</h1>
        <p>
          Set <code>VITE_IDENTITY_NAMES_ADDRESS</code> and reload — <code>harness/boot.sh</code>{' '}
          writes the env file for you.
        </p>
      </main>
    )
  }

  return (
    <main>
      <header>
        <h1>libID claim demo</h1>
        <p className="muted">
          {NAMES_ADDRESS} on {RPC_URL}
        </p>
      </header>

      <nav>
        {PLATFORMS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPlatform(p.key)}
            className={p.key === platform ? 'active' : ''}
          >
            {p.label}
          </button>
        ))}
      </nav>

      <Claim platform={selected} platformId={id} reader={reader} wallet={wallet} />
      <Resolve reader={reader} platform={id} />
    </main>
  )
}

function Claim({
  platform,
  platformId: id,
  reader,
  wallet,
}: {
  platform: PlatformEntry
  platformId: Hex
  reader: NamesReader
  wallet: Wallet
}) {
  const [status, setStatus] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publish, setPublish] = useState(true)
  const [running, setRunning] = useState(false)
  // Notarizing and proving take tens of seconds with long quiet stretches,
  // so a running clock is what separates "still working" from "stuck".
  const [elapsed, setElapsed] = useState(0)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!running) return
    const started = Date.now()
    setElapsed(0)
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [running])

  const run = useCallback(async () => {
    if (!wallet.address) return
    const controller = new AbortController()
    abort.current = controller
    setRunning(true)
    setError(null)
    setClaimed(null)
    try {
      const holder = wallet.address
      const result =
        platform.key === 'google'
          ? await proveGoogleClaim(
              holder,
              {
                clientId: GMAIL_CLIENT_ID,
                // Google's whitelist points at the backend, which serves the
                // static relay that forwards the token back here.
                redirectUri: `${BACKEND_URL}/auth/gmail/callback`,
                verifyingContract: GOOGLE_VERIFIER,
                chainId: CHAIN_ID,
              },
              setStatus,
              controller.signal,
            )
          : platform.key === 'x'
            ? await proveXClaim(
                holder,
                {
                  clientId: X_CLIENT_ID,
                  notaryUrl: X_NOTARY_URL,
                  // The OAuth app registers one redirect and every caller
                  // has to name it; the vite server rewrites it to the
                  // relay page.
                  redirectUri: `${window.location.origin}/zk/x-popup`,
                },
                setStatus,
                controller.signal,
              )
            : await proveGitHubClaim(holder, BACKEND_URL, setStatus, controller.signal)

      setStatus('Signing…')
      const hash = await wallet.send(bindCall(reader.address, id, result.proof, publish))
      setStatus(`Sent ${hash.slice(0, 10)}…`)

      // Read it back rather than trusting the send: a claim that wrote the
      // wrong key would still have produced a receipt.
      const owner = await resolveId(reader, id, result.userId)
      if (owner?.toLowerCase() !== holder.toLowerCase()) {
        throw new Error('The transaction landed, but the name does not resolve to you.')
      }
      setClaimed(result.handle)
      setStatus(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus(null)
    } finally {
      abort.current = null
      setRunning(false)
    }
  }, [platform.key, id, publish, reader, wallet])

  if (platform.unavailable) {
    return (
      <section>
        <h2>Claim</h2>
        <p className="muted">{platform.unavailable}</p>
      </section>
    )
  }

  return (
    <section>
      <h2>Claim</h2>

      {!wallet.address ? (
        <div>
          <button
            type="button"
            onClick={() => void wallet.connect()}
            disabled={!wallet.available || wallet.connecting}
          >
            {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
          </button>
          {!wallet.available && (
            <p className="muted">
              No injected wallet and no dev key. The name is held by whatever address signs, so one
              is needed to claim — reading needs none.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="muted">
            The name will be held by <code>{wallet.address}</code>
            {wallet.kind === 'dev-key' ? ' (dev key)' : ''}.
          </p>
          <label>
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />{' '}
            Publish the handle on chain
          </label>
          <div className="row">
            <button type="button" onClick={() => void run()} disabled={running}>
              {running ? 'Working…' : `Claim my ${platform.label} handle`}
            </button>
            {running && (
              <button type="button" className="muted" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            )}
          </div>
        </>
      )}

      {status && (
        <p className="muted">
          {status}
          {running && ` — ${elapsed}s`}
        </p>
      )}
      {claimed && (
        <p>
          <strong>{claimed}</strong> now resolves to your wallet.
        </p>
      )}
      {(error ?? wallet.error) && <pre>{error ?? wallet.error}</pre>}
    </section>
  )
}

function Resolve({ reader, platform }: { reader: NamesReader; platform: Hex }) {
  const [query, setQuery] = useState('')
  const [out, setOut] = useState<string | null>(null)

  const run = useCallback(async () => {
    const value = query.trim()
    if (!value) return
    try {
      // An address looks up a name; anything else is a handle or an id, and
      // both are worth trying — a caller rarely knows which one they hold.
      if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
        const name = await primaryName(reader, value as Address, platform)
        setOut(name ? `${value} published ${name}` : 'no published name')
        return
      }
      const byHandle = await resolveHandle(reader, platform, value)
      if (byHandle) {
        setOut(`${value} → ${byHandle}`)
        return
      }
      const byId = await resolveId(reader, platform, value)
      setOut(byId ? `id ${value} → ${byId}` : 'nobody has proved that')
    } catch (e) {
      // An unconfigured platform reverts rather than answering "nobody",
      // which is the distinction worth surfacing.
      setOut(e instanceof Error ? e.message : String(e))
    }
  }, [reader, platform, query])

  return (
    <section>
      <h2>Resolve</h2>
      <div className="row">
        <input
          placeholder="handle, account id, or 0x address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run()}
        />
        <button type="button" onClick={() => void run()}>
          Look up
        </button>
      </div>
      {out && <pre>{out}</pre>}
    </section>
  )
}
