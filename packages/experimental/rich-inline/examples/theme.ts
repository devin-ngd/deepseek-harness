/** Theme examples are ordinary HTML fragments, not a set of supported component types. */
export const themedAnswer = {
  key: 'theme-answer',
  html: `<article class="rich-answer"><header><p class="rich-eyebrow">日常问答 · 主题示例</p><h1>把复杂回答，整理成清楚的下一步</h1><p class="rich-muted">先给结论，再提供依据和操作步骤。</p></header>
<section class="rich-section"><h2>先从一个小目标开始</h2><p class="rich-lead">把今天最重要的一件事写清楚，给它留出一段不受打扰的时间。</p><p class="rich-muted">长回答可以按需展开；简短回答不必堆叠卡片和图表。</p></section>
<section class="rich-section"><h3>一个可执行的顺序</h3><ol class="rich-steps"><li><strong>明确结果</strong><br><span class="rich-muted">用一句话描述完成后会有什么变化。</span></li><li><strong>安排时间</strong><br><span class="rich-muted">把复杂任务拆成一个能开始的小动作。</span></li><li><strong>检查进展</strong><br><span class="rich-muted">结束时记录结果，再决定下一步。</span></li></ol></section>
<details class="rich-section"><summary>展开一个记录模板</summary><pre><code>目标：完成一件重要的小事
下一步：一个可执行的动作
完成后：记录结果和剩余问题</code></pre></details></article>`,
  css: '', js: '', fallbackText: '先明确结果，再安排时间，最后检查进展。', stateSchemaVersion: 1,
}

export const themedComparison = {
  key: 'theme-comparison',
  html: `<header><p class="rich-eyebrow">对比与列表 · 主题示例</p><h1>选择合适的表达方式</h1><p class="rich-muted">表格用于比较同一组维度；卡片用于少量独立选项。</p></header>
<div class="rich-table-wrap" tabindex="0" aria-label="表达方式对比，可横向滚动"><table><thead><tr><th>输出形式</th><th>适合内容</th><th>阅读重点</th></tr></thead><tbody><tr><td><strong>结论 + 分节</strong></td><td>解释、分析、研究摘要</td><td>先读结论，再看论据</td></tr><tr><td><strong>比较表格</strong></td><td>多个方案的共同维度</td><td>差异、取舍、适用条件</td></tr><tr><td><strong>步骤列表</strong></td><td>操作流程、计划、排错</td><td>顺序、依赖和完成条件</td></tr><tr><td><strong>表单或图表</strong></td><td>需要输入或探索的数据</td><td>明确的反馈和状态</td></tr></tbody></table></div>
<section class="rich-section rich-grid"><article class="rich-card"><span class="rich-badge">阅读</span><h3>信息层次</h3><p class="rich-muted">标题、正文、辅助信息的大小和颜色保持稳定。</p></article><article class="rich-card"><span class="rich-badge">交互</span><h3>适度控制</h3><p class="rich-muted">只在有用时增加筛选、展开和输入控件。</p></article></section>`,
  css: '', js: '', fallbackText: '解释用分节，比较用表格，流程用步骤，需要探索时用交互。', stateSchemaVersion: 1,
}

export const themedForm = {
  key: 'theme-form',
  html: `<header><p class="rich-eyebrow">表单与反馈 · 主题示例</p><h1>安排一次专注工作</h1><p class="rich-muted">此示例在本地预览设置，不向 Agent 提交。</p></header>
<form id="focus-form" class="rich-stack"><div class="rich-form"><label>任务名称<input name="task" placeholder="例如：整理项目资料" required maxlength="80"></label><label>专注时长<select name="minutes"><option value="25">25 分钟</option><option value="45">45 分钟</option><option value="60">60 分钟</option></select></label></div><label><input type="checkbox" name="quiet" checked> 暂时关闭干扰提醒</label><div class="rich-actions"><button type="submit" class="rich-primary">预览安排</button><button type="reset">重置</button></div></form>
<section id="plan" class="rich-section rich-callout rich-success" role="status" hidden></section>
<p class="rich-section rich-muted">输入有清晰标签，键盘可操作；主要按钮与次要按钮保持一致的层次。</p>`,
  css: '',
  js: 'const form=document.getElementById(\'focus-form\'),plan=document.getElementById(\'plan\');form.onsubmit=e=>{e.preventDefault();const data=new FormData(form);plan.textContent=\'已准备：\'+data.get(\'task\')+\' · \'+data.get(\'minutes\')+\' 分钟\'+(data.get(\'quiet\')?\' · 安静模式\':\'\');plan.hidden=false;};form.onreset=()=>{plan.hidden=true;};',
  fallbackText: '填写任务和时长，预览专注安排；此示例仅在本地运行。', stateSchemaVersion: 1,
}

export const themedChart = {
  key: 'theme-chart',
  html: `<header><p class="rich-eyebrow">数据与动态内容 · 主题示例</p><h1>观察一组示例数据</h1><p class="rich-muted">确定性演示数据，用于检查样式与本地交互。</p></header>
<div class="rich-grid"><article class="rich-card"><span class="rich-muted">展示条目</span><div class="rich-value" id="chart-total">3</div><span class="rich-badge">示例数据</span></article><article class="rich-card"><span class="rich-muted">当前视图</span><div class="rich-value" id="chart-view">全部</div><span class="rich-badge">本地筛选</span></article></div>
<section class="rich-section"><div class="rich-row"><h3>任务分布</h3><div class="rich-tabs" role="group" aria-label="筛选示例条目"><button id="chart-all" aria-pressed="true">全部</button><button id="chart-large" aria-pressed="false">较多</button></div></div><figure class="rich-card chart" role="img" aria-label="示例条形图：阅读 8、整理 5、写作 3"><div class="bar" data-value="8"><span>阅读</span><span class="track"><span></span></span><b>8</b></div><div class="bar" data-value="5"><span>整理</span><span class="track"><span></span></span><b>5</b></div><div class="bar" data-value="3"><span>写作</span><span class="track"><span></span></span><b>3</b></div></figure><p class="rich-muted">图表使用主题色；筛选不请求模型。</p></section>
<div class="rich-row rich-section"><span class="rich-muted"><span id="theme-pulse" aria-hidden="true"></span>动态状态示例</span><button id="chart-motion" aria-pressed="false">暂停动画</button></div>`,
  css: '.chart{display:grid;gap:14px;margin-top:12px}.bar{display:grid;grid-template-columns:3em 1fr 2em;align-items:center;gap:14px;color:var(--rich-muted);font-size:13px}.bar b{text-align:end;font-variant-numeric:tabular-nums}.track{height:10px;border-radius:999px;background:var(--rich-surface-raised);overflow:hidden}.track span{display:block;height:100%;border-radius:inherit;background:var(--rich-accent)}[data-value="8"] .track span{width:100%}[data-value="5"] .track span{width:62.5%;background:var(--rich-chart-2)}[data-value="3"] .track span{width:37.5%;background:var(--rich-chart-3)}#theme-pulse{display:inline-block;width:8px;height:8px;margin-inline-end:8px;border-radius:50%;background:var(--rich-accent);animation:theme-pulse 1.4s ease-in-out infinite alternate}@keyframes theme-pulse{to{opacity:.3;transform:scale(.7)}}',
  js: 'function filter(large){document.querySelectorAll(\'.bar\').forEach(row=>row.toggleAttribute(\'hidden\',large&&Number(row.dataset.value)<5));document.getElementById(\'chart-total\').textContent=large?\'2\':\'3\';document.getElementById(\'chart-view\').textContent=large?\'较多\':\'全部\';document.getElementById(\'chart-all\').setAttribute(\'aria-pressed\',String(!large));document.getElementById(\'chart-large\').setAttribute(\'aria-pressed\',String(large));}document.getElementById(\'chart-all\').onclick=()=>filter(false);document.getElementById(\'chart-large\').onclick=()=>filter(true);document.getElementById(\'chart-motion\').onclick=e=>{const paused=e.currentTarget.getAttribute(\'aria-pressed\')!==\'true\';e.currentTarget.setAttribute(\'aria-pressed\',String(paused));e.currentTarget.textContent=paused?\'恢复动画\':\'暂停动画\';document.getElementById(\'theme-pulse\').style.animationPlayState=paused?\'paused\':\'running\';};',
  fallbackText: '示例数据：阅读 8、整理 5、写作 3，可在本地筛选并暂停动画。', stateSchemaVersion: 1,
}

/** Ordinary publications cover common forms without duplicating the built-in stylesheet. */
export const themeExamples = [themedAnswer, themedComparison, themedForm, themedChart]
