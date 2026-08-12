// Main-thread driver for the worker-hosted UltraHonk prover.
//
// Spawn early (e.g. in parallel with an OAuth/TLSN round-trip) so the worker
// boots noir + bb.js while the network is busy; then `prove()` when the
// witness inputs are ready. Proving never blocks the spawning document's
// main thread.

/** Same-origin URLs the app must stage the acvm/abi WASM at (the harness's
 *  stage-assets.sh does this; see the worker for why an explicit absolute
 *  URL is required). Overridable per-prover for apps that stage elsewhere. */
export interface ProverWasmUrls {
  acvmUrl: string
  abiUrl: string
}

function defaultWasmUrls(): ProverWasmUrls {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return {
    acvmUrl: `${origin}/wasm/acvm_js_bg.wasm`,
    abiUrl: `${origin}/wasm/noirc_abi_wasm_bg.wasm`,
  }
}

export interface RawProof {
  proof: Uint8Array
  publicInputs: string[]
}

/** A booting prover backed by a Web Worker. */
export class WorkerProver {
  private worker: Worker
  private ready: Promise<void>

  constructor(circuitUrl: string, wasmUrls: ProverWasmUrls = defaultWasmUrls()) {
    this.worker = new Worker(new URL('./prove.worker.js', import.meta.url), {
      type: 'module',
    })
    const { acvmUrl, abiUrl } = wasmUrls
    this.ready = new Promise((resolve, reject) => {
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type === 'ready') {
          this.worker.removeEventListener('message', onMsg)
          resolve()
        } else if (e.data?.type === 'error') {
          this.worker.removeEventListener('message', onMsg)
          reject(new Error(e.data.error))
        }
      }
      this.worker.addEventListener('message', onMsg)
    })
    this.worker.postMessage({ type: 'preload', circuitUrl, acvmUrl, abiUrl })
  }

  /** Generate a proof. Waits for the preload to finish first. Returns raw
   *  bytes + string public inputs — callers format to their on-chain shape. */
  async prove(inputs: Record<string, unknown>, signal?: AbortSignal): Promise<RawProof> {
    await this.ready
    signal?.throwIfAborted()
    return new Promise<RawProof>((resolve, reject) => {
      const cleanup = () => {
        this.worker.removeEventListener('message', onMsg)
        signal?.removeEventListener('abort', onAbort)
      }
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type === 'result') {
          cleanup()
          resolve({ proof: e.data.proof, publicInputs: e.data.publicInputs })
        } else if (e.data?.type === 'error') {
          cleanup()
          reject(new Error(e.data.error))
        }
      }
      // Aborting terminates the worker; a terminated worker never posts back,
      // so the pending prove() would otherwise hang forever.
      const onAbort = () => {
        cleanup()
        this.destroy()
        reject(new DOMException('Proving aborted', 'AbortError'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.worker.addEventListener('message', onMsg)
      this.worker.postMessage({ type: 'prove', inputs })
    })
  }

  destroy() {
    this.worker.terminate()
  }
}
