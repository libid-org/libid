// PKCE / OAuth helpers, parent-side. Extracted from dyaka's client flight
// machinery — these four are the whole of what a claim flow needs.

export function b64url(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomB64url(nBytes: number): string {
  return b64url(crypto.getRandomValues(new Uint8Array(nBytes)))
}

/** PKCE S256 code challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  )
}

/** OAuth state round-tripped through the provider: `<jobId>~<random>`. */
export function newOAuthState(jobId: string): string {
  return `${jobId}~${crypto.randomUUID()}`
}
