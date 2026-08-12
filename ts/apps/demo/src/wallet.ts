// The demo's signer: an injected wallet when the browser has one, and a
// dev-mode local key when it does not — the harness writes anvil account #4
// into VITE_DEV_PRIVATE_KEY so the manual test needs no extension.
//
// The React hook lives here, not in @libid/claim: the library is
// framework-free and this file is the few lines a consumer writes on top.

import {
  connectedAccount,
  injectedProvider,
  requestAccount,
  sendInjectedCall,
  watchAccount,
} from '@libid/claim'
import { useCallback, useEffect, useState } from 'react'
import { type Address, createWalletClient, type Hex, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const DEV_KEY = (import.meta.env.VITE_DEV_PRIVATE_KEY ?? '') as Hex | ''
const RPC_URL = import.meta.env.VITE_RPC_URL ?? 'http://127.0.0.1:8545'

// `?dev` in the URL forces the dev-key signer even when the browser has an
// injected wallet — for driving the harness test in a profile whose wallet
// extension would otherwise capture the connect flow.
const FORCE_DEV_KEY = DEV_KEY !== '' && new URLSearchParams(window.location.search).has('dev')

export interface Wallet {
  /** Null until connected. Everything on the page that writes needs it. */
  address: Address | null
  available: boolean
  connecting: boolean
  /** 'injected' | 'dev-key' once connected. */
  kind: 'injected' | 'dev-key' | null
  error: string | null
  connect: () => Promise<void>
  /** Send one call and return its hash. Throws if nothing is connected. */
  send: (call: { to: Address; data: Hex }) => Promise<Hex>
}

export function useWallet(): Wallet {
  const [address, setAddress] = useState<Address | null>(null)
  const [kind, setKind] = useState<Wallet['kind']>(null)
  const [available, setAvailable] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const provider = FORCE_DEV_KEY ? null : injectedProvider()
    setAvailable(provider !== null || DEV_KEY !== '')
    if (!provider) return

    // Already-authorized accounts, without prompting.
    void connectedAccount(provider)
      .then((first) => {
        if (first) {
          setAddress(first)
          setKind('injected')
        }
      })
      .catch(() => {})

    // A claim is made out to ONE address. If the user switches accounts
    // mid-flow the proof in hand names the old one, so the page must notice
    // rather than send a transaction that reverts NotProofTarget.
    return watchAccount(provider, (first) => {
      setAddress(first)
      setKind(first ? 'injected' : null)
    })
  }, [])

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      const provider = FORCE_DEV_KEY ? null : injectedProvider()
      if (provider) {
        setAddress(await requestAccount(provider))
        setKind('injected')
        return
      }
      if (DEV_KEY) {
        setAddress(privateKeyToAccount(DEV_KEY).address)
        setKind('dev-key')
        return
      }
      setError('No injected wallet, and no VITE_DEV_PRIVATE_KEY dev fallback.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setConnecting(false)
    }
  }, [])

  const send = useCallback(
    async (call: { to: Address; data: Hex }): Promise<Hex> => {
      if (!address) throw new Error('No wallet connected')
      if (kind === 'injected') {
        const provider = injectedProvider()
        if (!provider) throw new Error('The injected wallet disappeared')
        return sendInjectedCall(provider, address, call)
      }
      if (kind === 'dev-key' && DEV_KEY) {
        const account = privateKeyToAccount(DEV_KEY)
        const client = createWalletClient({ account, transport: http(RPC_URL) })
        return client.sendTransaction({
          account,
          to: call.to,
          data: call.data,
          chain: null,
          kzg: undefined,
        })
      }
      throw new Error('No wallet connected')
    },
    [address, kind],
  )

  return { address, available, connecting, kind, error, connect, send }
}
