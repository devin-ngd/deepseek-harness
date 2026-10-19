/** Inspect only the newly approved isolated profile's own record; never print or copy encrypted/private credential bytes. */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const marker = JSON.parse(await readFile('.build/phase54-active.json', 'utf8')), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), yaml = require('js-yaml'), source = yaml.load(await readFile(join(marker.home, '.field-credentials.yaml'), 'utf8')), identities = [], otherGrants = []
function visit(value) { if (value === null || typeof value !== 'object') return; assert.equal('privatePkcs8' in value, false); if (value.kind === 'grant') { const payload = value.payload; if (payload?.format === 'harmony-desktop-identity/2') { assert.equal(payload.protection, 'windows-dpapi-current-user/1'); assert.equal(typeof payload.protectedPkcs8, 'string'); identities.push({ format: payload.format, protection: payload.protection, fingerprint: 'p256-sha256-' + createHash('sha256').update(Buffer.from(payload.publicSpki, 'base64url')).digest('hex'), ciphertextPresent: true }) } else otherGrants.push({ present: true }) } for (const child of Object.values(value)) visit(child) }
visit(source); assert.equal(identities.length, 1); assert.equal(otherGrants.length, 0)
const report = { schema: 'harmony-real-desktop-identity/1', at: new Date().toISOString(), home: marker.home, alias: marker.identityAlias, identities, grantCount: 0, grantTimerStarted: false, dpapiCreateAndOpenReachedPhoneImportPrompt: true, privateBytesProjected: false, existingDesktopChanged: false, realModels: 0, userProjectOperations: 0 }
await writeFile('evidence/phase56-desktop-identity.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))
