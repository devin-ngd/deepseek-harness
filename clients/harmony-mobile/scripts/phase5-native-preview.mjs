/** Prepare inert ArkWeb preview from the actual admitted loopback publication; this does not run ArkWeb. */
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { richThemeCss, canonicalRichJson } from '../.build/upstream-domain.js'
import { verifyRichContent } from '../.build/rich-renderer.js'
const report = JSON.parse(await readFile('evidence/phase5-network.json', 'utf8'))
if (!report.listenerClosed || report.counts.realCalls !== 0 || report.modelRequests !== 4 || report.uploadExtensionCalls !== 0) throw new Error('Completed guarded phase5 report required')
const snapshot = report.phone.domainView.rich[0]
if (!snapshot || !await verifyRichContent(snapshot)) throw new Error('Verified canonical rich publication required')
const m = snapshot.manifest, raw = 'harmony/entry/src/main/resources/rawfile/'
await writeFile(raw + 'phase5-rich-preview.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; object-src 'none'"><style>${richThemeCss({ theme: 'dark', accent: 'auto' })}\n${m.css}\nhtml,body{margin:0;max-width:100%;overflow-wrap:anywhere}*{box-sizing:border-box}input,button{min-height:44px;max-width:100%}pre{overflow:auto;max-width:100%}</style></head><body>${m.html}</body></html>\n`)
await writeFile(raw + 'phase5-mounted-snapshot.json', JSON.stringify(snapshot, null, 2) + '\n')
await writeFile(raw + 'phase5-preview-source.json', JSON.stringify({ source: 'phase5-network.json; canonical rich mount from actual guarded services', contentHash: createHash('sha256').update(canonicalRichJson({ html: m.html, css: m.css, js: m.js, stateSchemaVersion: m.stateSchemaVersion })).digest('hex'), renderer: 'inert HTML/CSS only; native scripts disabled', arkTsCompiled: false, arkWebQualified: false }, null, 2) + '\n')
console.log('PASS: inert native preview from actual admitted phase5 rich publication; no guest execution or credentials')
