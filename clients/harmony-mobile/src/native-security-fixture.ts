/** Fixed native ArkWeb negative fixture, deliberately separate from a task/action success case. */
import type { RichSnapshot } from './upstream.ts'
import { NATIVE_SECURITY_PROGRAM } from './native-security-program.ts'

/** @param previous - existing synthetic block identity. @returns next hashed publication for native isolation probes. */
export function nativeSecurityManifest(previous: RichSnapshot['manifest']): RichSnapshot['manifest'] {
  return { ...previous, renderRevision: previous.renderRevision + 1, html: "<section><h2>原生隔离负例</h2><p>固定测试代码；不会执行宿主任务。</p><button id=\"security-run\">运行隔离自检</button><pre id=\"security-result\" aria-live=\"polite\">等待自检</pre></section>", css: "section{padding:12px}button{min-height:44px}pre{white-space:pre-wrap;font-size:14px}", js: NATIVE_SECURITY_PROGRAM, stateSchemaVersion: 1, contentHash: "db3583fab1c87462088e9e897de91ce0074319533f13975b9fd4dd5c5a792821", fallbackText: '原生隔离自检仅显示固定负例结果，不执行任务。' }
}
