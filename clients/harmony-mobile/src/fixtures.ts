/** Shared synthetic rich block; no model-generated or user-session content. */
import { id } from './protocol.ts'
import type { RichSnapshot } from './upstream.ts'

/**
 * Build a detached current rich-inline snapshot for a fixture session.
 * @param sessionId - owning synthetic session.
 * @returns editable form/chart baseline without grants or historical actions.
 */
export function richFixture(sessionId: RichSnapshot['scope']['sessionId']): RichSnapshot {
  const blockId = id<'rich-inline-block'>('demo-form')
  return {
    protocol: 'lumina-rich/1',
    scope: { sessionId, messageId: id<'MessageId'>('demo-message'), blockId, renderRevision: 1 },
    manifest: {
      blockId, renderRevision: 1, stateSchemaVersion: 1,
      html: '<section class="rich-answer"><h2>合成桌面任务</h2><p>仅使用固定数据；提交不会执行真实命令。</p><form class="rich-form"><label>计划名称<input name="title" value="离线演示" /></label><label>数量<input name="count" type="number" value="3" /></label><button class="rich-primary" type="submit">提交演示表单</button></form><output aria-live="polite">等待提交</output><div role="img" aria-label="固定数据柱状图" class="chart"><div style="width:30%">A 3</div><div style="width:70%">B 7</div></div></section>',
      css: '.rich-answer{padding:16px;max-width:720px;margin:auto}.rich-form{display:grid;gap:16px}.rich-form label{display:grid;gap:8px}input,button{min-height:44px;font:inherit;max-width:100%;box-sizing:border-box}.chart{display:grid;gap:8px;margin-top:16px}.chart div{background:var(--rich-accent);color:var(--rich-accent-ink);padding:8px}output{display:block;overflow-wrap:anywhere;margin-top:16px}@media(prefers-reduced-motion:reduce){*{animation:none!important}}',
      js: "rich.bindForm(document.querySelector('form')); rich.onState(s => { document.querySelector('output').textContent = s.actions.at(-1)?.state || '等待提交'; });",
      fallbackText: '合成桌面任务：表单与固定数据图。演示不执行真实任务。',
      contentHash: '23858d70f31ec5376da7ecb94d92d007da79c39b1a996c9d4d860aaec1277701',
    },
    pendingManifest: null, readOnly: false, dataRevision: 1,
    values: {}, draft: { draftRevision: 0, stateSchemaVersion: 1, fields: { title: '离线演示', count: '3' }, dirty: [] },
    archivedDrafts: [], actions: [], files: [],
  }
}
