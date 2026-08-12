// The address that will hold the name, and the only signer a claim needs.
//
// A claim is one transaction from one address: the proof states the address
// it was made out to, and `IdentityNames` requires that address to be the
// caller. So there is nothing here to manage — no session key, no vault, no
// account model. Framework-free on purpose: a React (or any other) hook is a
// consumer-side few lines over these three functions.

import { type Address, createWalletClient, custom, type Hex } from 'viem'

/** `window.ethereum`, typed to what a claim calls. Injected wallets are not
 *  a dependency of this library, so nothing imports a connector: the three
 *  methods below are the whole surface. */
export interface InjectedProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

export function injectedProvider(): InjectedProvider | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { ethereum?: InjectedProvider }).ethereum ?? null
}

/** Already-authorized accounts, without prompting. `eth_accounts` returns
 *  empty rather than asking — that is the difference from
 *  `eth_requestAccounts`. */
export async function connectedAccount(provider: InjectedProvider): Promise<Address | null> {
  const accounts = (await provider.request({ method: 'eth_accounts' })) as Address[]
  return accounts[0] ?? null
}

/** Prompt the wallet for access and return the selected account. */
export async function requestAccount(provider: InjectedProvider): Promise<Address | null> {
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as Address[]
  return accounts[0] ?? null
}

/** Watch for account switches. A claim is made out to ONE address: if the
 *  user switches mid-flow the proof in hand names the old one, so the page
 *  must notice rather than send a transaction that reverts NotProofTarget.
 *  Returns an unsubscribe. */
export function watchAccount(
  provider: InjectedProvider,
  onChange: (address: Address | null) => void,
): () => void {
  const handler = (...args: unknown[]) => {
    const [first] = (args[0] as Address[] | undefined) ?? []
    onChange(first ?? null)
  }
  provider.on?.('accountsChanged', handler)
  return () => provider.removeListener?.('accountsChanged', handler)
}

/** Send one call from `address` through the injected provider and return
 *  its hash. */
export async function sendInjectedCall(
  provider: InjectedProvider,
  address: Address,
  call: { to: Address; data: Hex },
): Promise<Hex> {
  const client = createWalletClient({ account: address, transport: custom(provider) })
  // `chain` and `kzg` are required by the signature and meaningless for a
  // plain call — the same overload covers blob transactions.
  return client.sendTransaction({
    account: address,
    to: call.to,
    data: call.data,
    chain: null,
    kzg: undefined,
  })
}
