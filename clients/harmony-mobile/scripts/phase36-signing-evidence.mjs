/** Inspect fixed official IDE UI labels only; no account, profile, certificate, key, password or signing operation is accessed. */
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const source = 'D:/Program Files/HuaWei/DevEco Studio/plugins/openharmony/project-mgmt-view/static/js/main.js', bytes = await readFile(source), text = bytes.toString('utf8')
const labels = [...text.matchAll(/Mw\.set\("(signing[^"\n]+)","([^"\n]*)"\)/g)].filter(match => /auto|manual|certificate|profile|key store|signature|signing/i.test(match[2])).slice(0, 30).map(match => ({ key: match[1], label: match[2] }))
const report = { source, sha256: createHash('sha256').update(bytes).digest('hex'), product: 'installed official DevEco 26.0.0.851 static UI', labels, onlineGuide: 'https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-signing', onlineBodyVerified: false, onlineFailure: 'official page timed out; no other site substituted', signingPerformed: false, accountRead: false, certificateRead: false, generatedKey: false }
await writeFile('evidence/phase36-signing-source.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(labels.filter(x => /auto|manual|signature|signing/i.test(x.label)).slice(0, 12)))
