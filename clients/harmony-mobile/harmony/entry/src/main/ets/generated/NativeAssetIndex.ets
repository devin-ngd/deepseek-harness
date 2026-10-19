/** HAP-owned resource allowlist; generated from local sources, never from guest paths. */
export class NativeAssetEntry {
  name: string
  bytes: number
  sha256: string
  constructor(name: string, bytes: number, sha256: string) { this.name = name; this.bytes = bytes; this.sha256 = sha256 }
}
export const nativeAssets: NativeAssetEntry[] = [
  new NativeAssetEntry("native-offline-core.js", 805617, "c4b0e41d0b07fc8bd64cc61688baaae3c9a27aa75922f91633202c45e998db82"),
  new NativeAssetEntry("native-policy.json", 1446, "f6b7091a48823d9b0e91d25496b7d32760978f9e49cd6fa9de463af3920187e0"),
  new NativeAssetEntry("native-runtime-placeholder.html", 161, "a2cbf89341fda82f3fe093009d8843473efa908656873ebae624e55deb67f11c"),
  new NativeAssetEntry('product-rich-document.js', 651849, '1e025a8b143699a8f987cc5fa57a0498892dd47df4c02773e2e13bb21f6fd386'),
]
