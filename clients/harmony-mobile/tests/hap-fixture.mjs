/** Build minimal ZIP/HAP bytes for the unsigned-layout tests; CRC values are not verified by the inspector. */
import { deflateRawSync } from 'node:zlib'

/** Application metadata accepted by `inspectUnsignedHap` for the isolated candidate bundle. */
export const HAP_MODULE = {
  app: { bundleName: 'local.dsh.mobile.offlineproduct', versionName: '0.0.0', versionCode: 1, compileSdkVersion: '26.0.0.105' },
  module: { type: 'entry', requestPermissions: [{ name: 'ohos.permission.INTERNET' }] },
}

/** Pack metadata accepted by `inspectUnsignedHap` for API 26. */
export const HAP_PACK = { summary: { app: { bundleName: 'local.dsh.mobile.offlineproduct' }, modules: [{ apiVersion: { target: 26 } }] } }

/** @param {object} [options] - Metadata overrides. @returns {object[]} Entries for `buildZip`. */
export function hapEntries({ module = HAP_MODULE, pack = HAP_PACK, extra = [] } = {}) {
  return [
    { name: 'module.json', data: JSON.stringify(module) },
    { name: 'pack.info', data: JSON.stringify(pack) },
    { name: 'ets/modules.abc', data: 'bytecode-modules', method: 8 },
    ...extra,
  ]
}

/**
 * Build a stored/deflated ZIP. `gap` inserts unclaimed bytes before the central directory, which
 * is where the observed official HAP signer places its signature block; `trailer` appends bytes
 * after the end-of-central-directory record.
 * @param {object[]} entries - Entry records (`name`, `data`, optional `method`, `flags`, `localName`, `localCompressed`).
 * @param {object} [options] - Layout overrides.
 * @param {number} [options.gap] - Zero bytes inserted before the central directory.
 * @param {string|Buffer} [options.trailer] - Bytes appended after the end-of-central-directory record.
 * @returns {Buffer} ZIP bytes.
 */
export function buildZip(entries, { gap = 0, trailer = null } = {}) {
  const localParts = [], centralParts = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8'), localName = Buffer.from(entry.localName ?? entry.name, 'utf8')
    const raw = Buffer.from(entry.data ?? ''), method = entry.method ?? 0
    const compressed = method === 8 ? deflateRawSync(raw) : raw
    const flags = entry.flags ?? 0x0800
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(entry.localCompressed ?? compressed.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(localName.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, localName, compressed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + localName.length + compressed.length
  }
  const centralBytes = Buffer.concat(centralParts)
  const directoryOffset = offset + gap
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBytes.length, 12)
  eocd.writeUInt32LE(directoryOffset, 16)
  eocd.writeUInt16LE(0, 20)
  const body = Buffer.concat([...localParts, Buffer.alloc(gap), centralBytes, eocd])
  return trailer === null ? body : Buffer.concat([body, Buffer.from(trailer)])
}
