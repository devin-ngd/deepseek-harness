/** Fixed phase5 publication exercises real guest form and chart rendering without adapting the replay budget. */
import { authored } from './replay-host.ts'

/** The fixed action identity matches the unchanged second response's settlement; only test-owned authored JS selects it. */
export const mobilePublications = authored.map((content, index) => index === 0 ? { ...content,
  html: '<section class="rich-answer"><h2>移动结果</h2><p>固定回放 · 执行归属：phase5-desktop</p><form><label>标题<input name="title"></label><label>数量<input name="count" type="number"></label><button type="submit">提交固定回放</button></form><output aria-live="polite">等待输入</output><div role="img" aria-label="固定比较图" class="chart"><div style="width:30%">A 3</div><div style="width:70%">B 7</div></div><details><summary>长内容</summary><pre><code>' + 'mobile_long_line_'.repeat(24) + '</code></pre></details></section>',
  css: 'form,label{display:grid;gap:12px}.chart{display:grid;gap:8px;margin:16px 0}.chart div{background:var(--rich-accent);color:var(--rich-accent-ink);padding:8px}output{display:block;margin:16px 0;overflow-wrap:anywhere}summary{min-height:44px}',
  js: 'const form=document.querySelector("form"); for(const input of form.querySelectorAll("input"))input.addEventListener("input",()=>{const values=Object.fromEntries(new FormData(form));rich.setDraft(values,Object.keys(values))}); form.addEventListener("submit",async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form));rich.setDraft(values,Object.keys(values));await rich.submit(values,{actionId:"phase3-action"})});rich.onState(s=>{document.querySelector("output").textContent=s.actions.at(-1)?.state||"等待输入";if(s.draft.fields.title&&!document.querySelector("input[name=title]").value){for(const input of form.querySelectorAll("input"))input.value=s.draft.fields[input.name]||""}})',
  fallbackText: '固定移动表单，比较图 A3/B7，提交状态可查询。',
} : content)
