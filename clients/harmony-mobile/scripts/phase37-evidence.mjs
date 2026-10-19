/** Seal observed nonsecret inventory and official installed signing metadata only; never reconnects, reads user signing material, generates keys or writes deployed configuration. */
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const inventoryScripts = ['phase37-remote-inventory.py', 'phase37-proxy-fields.py', 'phase37-final-public-metadata.py']
const report = {
  observedOn: '2026-10-13', scope: 'explicit human-approved readonly dhome inventory', ssh: { alias: 'dhome', hostname: '8.210.203.110', user: 'devin', port: 22, batchMode: true, strictHostKeyChecking: true, updateHostKeys: false, forwardAgent: false, passwordRequested: false, hostTrustRequested: false },
  inventoryConnections: 3, uploads: 0, sudo: 0, mutations: 0, credentialContentsRead: false, environmentOrJournalDumped: false,
  system: { os: 'Ubuntu 24.04.4 LTS', versionId: '24.04', kernel: '6.8.0-63-generic', architecture: 'x86_64', uid: 1001, user: 'devin', home: '/home/devin', homeMode: '0750', node: 'v22.22.2', nodePath: '/usr/bin/node', dshInCurrentPath: false, nginxVersion: '1.24.0 (Ubuntu)', nginxPath: '/usr/sbin/nginx', dockerPath: '/usr/bin/docker' },
  services: { nginx: 'active/running', caddy: 'not-found', apache2: 'not-found', httpd: 'not-found', traefik: 'not-found' },
  listeners: { tcp80: ['0.0.0.0', '[::]'], tcp443: ['0.0.0.0', '[::]'], udp443: [], proposedLoopback17846: [], processOwnerVisible: false, probeConnectionsMade: false },
  nginx: { enabledEntries: ['devinhome', 'codexbar-usage'], confDEntries: [], inspectedOnlySelectedFields: true, sites: [
    { source: '/etc/nginx/sites-enabled/devinhome', target: '/etc/nginx/sites-available/devinhome', serverNames: ['devinho.me', 'www.devinho.me'], proxyAuthorities: ['http://127.0.0.1:8080', 'http://127.0.0.1:3000'], certificatePath: '/etc/letsencrypt/live/devinho.me/fullchain.pem', privateKeyPath: '/etc/letsencrypt/live/devinho.me/privkey.pem', certificateOrKeyBytesRead: false, certificatePathStat: 'PermissionError', privateKeyPathStat: 'PermissionError' },
    { source: '/etc/nginx/sites-enabled/codexbar-usage', serverNames: ['usage.devinho.me'], selectedFields: ['server_name', 'listen'] }
  ], proposedServerNameSeenInSelectedFields: false, completeConfigOrDnsConflictAbsenceClaimed: false },
  directories: { '/srv/dsh-harmony-relay': 'absent', '/opt/dsh-harmony-relay': 'absent', '/home/devin/dsh-harmony-relay': 'absent', '/etc/caddy': 'absent', '/srv': 'root:root 0755', '/opt': 'root:root 0755' },
  proposalOnly: { directory: '/home/devin/dsh-harmony-relay', publicWss: 'wss://dsh.devinho.me/harmony/relay/v1', upstream: 'http://127.0.0.1:17846', launcher: 'approved isolated dsh profile only', createsPersistentCredential: false, executed: false, outstanding: ['isolated runtime/profile and package install', 'DNS/TLS certificate coverage/renewal', 'nginx new-vhost diff and privilege approval', 'service start/resource/log limits', 'phone signing/device trust/installation', 'real key lifecycle and public-key/signature interoperability', 'short-lived room provisioning activation and synthetic read-only grant'] },
  scriptHashes: Object.fromEntries(await Promise.all(inventoryScripts.map(async name => [name, sha(await readFile('.build/' + name))]))),
  evidenceSource: 'Three completed noninteractive SSH tool outputs, filtered by these exact scripts; structured transcription, no repeated access.'
}
await writeFile('evidence/phase37-dhome-readonly.json', JSON.stringify(report, null, 2) + '\n')
const schemaSource = 'D:/Program Files/HuaWei/DevEco Studio/tools/hvigor/hvigor-ohos-plugin/res/schemas/ohos-project-build-profile-schema.json', bytes = await readFile(schemaSource), schema = JSON.parse(bytes.toString('utf8'))
function findSigning(value) { if (value === null || typeof value !== 'object') return; if (value.properties?.signingConfigs?.items) return value.properties.signingConfigs.items; for (const child of Object.values(value)) { const found = findSigning(child); if (found) return found } }
const signing = findSigning(schema); if (!signing) throw new Error('Installed signing schema absent')
await writeFile('evidence/phase37-signing-schema.json', JSON.stringify({ source: schemaSource, sha256: sha(bytes), installedIde: '26.0.0.851', installedSdk: '26.0.0.105/API26', requiredConfigFields: signing.required, requiredMaterialFieldNames: signing.properties.material.required, signingAlgorithm: signing.properties.material.properties.signAlg.enum, productType: signing.properties.type.enum, fieldsAreSchemaNamesOnly: true, userSigningMaterialRead: false, signingPerformed: false, deviceConnected: false, accountInspected: false, onlineBodyVerified: false, officialUiEvidence: 'phase36-signing-source.json' }, null, 2) + '\n')
console.log('PASS: filtered readonly inventory and official signing schema recorded; no credentials, server changes or signing')
