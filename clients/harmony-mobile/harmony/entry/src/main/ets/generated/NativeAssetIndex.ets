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
  new NativeAssetEntry('product-rich-document.js', 699324, '64166f5bd21a26854d3acfad947273608a11da0cbb15c94c2d71511ac4d1defd'),
  new NativeAssetEntry('workspace-document.js', 604653, '1281df2ed2de41834a9d922695a8fcff9b0b6eb15f8caa5828a6bc10bec4d292'),
  new NativeAssetEntry('workspace-rich-document.js', 551873, '7c29fc7bc6fb7320b3bb4ec69c3290c188d5cd5038c3f23e6962b1ba9815a71f'),
]
