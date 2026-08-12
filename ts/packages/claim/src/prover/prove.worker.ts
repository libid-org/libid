// Worker-hosted noir witness-gen + bb.js UltraHonk proving.
//
// The one trick that makes noir_js work in a worker: initialize its acvm/abi
// WASM with an EXPLICIT same-origin absolute URL. `Noir.init()` otherwise
// calls the no-arg wasm-bindgen init, which falls back to
// `new URL('acvm_js_bg.wasm', import.meta.url)` — and under a bundled
// worker that base is a blob/opaque origin, so the fetch 404s. Pre-initing
// the (noir_js-shared) instances here caches them, so `Noir.init()` becomes
// a no-op and never hits the broken path.
import initACVM from '@noir-lang/acvm_js'
import initAbi from '@noir-lang/noirc_abi'

type Circuit = { bytecode: string; abi: unknown; [k: string]: unknown }

type Booted = {
  noir: import('@noir-lang/noir_js').Noir
  api: Awaited<ReturnType<typeof import('@aztec/bb.js')['Barretenberg']['new']>>
  backend: import('@aztec/bb.js').UltraHonkBackend
}

type PreloadMsg = {
  type: 'preload'
  circuitUrl: string
  acvmUrl: string
  abiUrl: string
}
type ProveMsg = { type: 'prove'; inputs: Record<string, unknown> }
type InMsg = PreloadMsg | ProveMsg

/** The worker global, typed to what this file touches. `lib: WebWorker` is
 *  not loadable next to `DOM`, so narrow by hand. */
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<InMsg>) => void) | null
  postMessage: (message: unknown) => void
}

let booted: Promise<Booted> | null = null

async function boot(msg: PreloadMsg): Promise<Booted> {
  await Promise.all([
    initACVM({ module_or_path: msg.acvmUrl }),
    initAbi({ module_or_path: msg.abiUrl }),
  ])
  const [{ Noir }, { Barretenberg, UltraHonkBackend }, resp] = await Promise.all([
    import('@noir-lang/noir_js'),
    import('@aztec/bb.js'),
    fetch(msg.circuitUrl),
  ])
  if (!resp.ok) throw new Error(`Failed to load circuit ${msg.circuitUrl}`)
  const circuit = (await resp.json()) as Circuit
  const threads = Math.max(navigator.hardwareConcurrency ?? 1, 1)
  // biome-ignore lint/suspicious/noExplicitAny: noir_js's CompiledCircuit type is structurally identical
  const noir = new Noir(circuit as any)
  const api = await Barretenberg.new({ threads })
  const backend = new UltraHonkBackend(circuit.bytecode, api)
  return { noir, api, backend }
}

ctx.onmessage = async (event: MessageEvent<InMsg>) => {
  const msg = event.data
  try {
    if (msg.type === 'preload') {
      booted = boot(msg)
      await booted
      ctx.postMessage({ type: 'ready' })
      return
    }
    if (msg.type === 'prove') {
      if (!booted) throw new Error('prover was not preloaded')
      const { noir, api, backend } = await booted
      const { witness } = await noir.execute(msg.inputs as Parameters<typeof noir.execute>[0])
      // `verifierTarget: 'evm'` selects the ZK-Honk + keccak transcript the
      // on-chain verifiers (X and OIDC) expect. Both platforms use it.
      const { proof, publicInputs } = await backend.generateProof(witness, {
        verifierTarget: 'evm',
      })
      await api.destroy()
      const bytes = proof instanceof Uint8Array ? proof : new Uint8Array(proof as number[])
      ctx.postMessage({ type: 'result', proof: bytes, publicInputs })
    }
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
