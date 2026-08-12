// Minimal secp256k1 point compression. The identity backend keys its GitHub
// challenge on a compressed session public key; viem hands us the
// uncompressed SEC1 form (0x04 || X || Y), and compression is pure byte
// arithmetic — the parity of Y picks the prefix.

export function compressPublicKey(publicKey: `0x${string}`): `0x${string}` {
  const hex = publicKey.slice(2)
  if (hex.length !== 130 || !hex.startsWith('04')) {
    throw new Error('Invalid uncompressed secp256k1 public key')
  }
  const x = hex.slice(2, 66)
  const yLastByte = Number.parseInt(hex.slice(-2), 16)
  return `0x${yLastByte % 2 === 0 ? '02' : '03'}${x}` as `0x${string}`
}
