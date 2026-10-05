/** Diverse arbitrary documents for acceptance and authoring; the renderer has no knowledge of these examples. */
const css = 'section{padding:20px;border:1px solid var(--rich-border);border-radius:var(--rich-radius);background:var(--rich-surface)}form{display:grid;gap:12px}output{display:block;margin-top:12px;color:var(--rich-muted);font-size:13px}svg{display:block;width:100%;height:auto;margin-top:12px}rect{rx:6px}'
const base = { css, fallbackText: 'Open Desktop for this interactive example.', stateSchemaVersion: 1, values: {} }

/** Latest-input form, with SDK persistence and asynchronous results. */
export const formExample = { ...base,
  html: '<section><h2>Trip form</h2><form><label>Destination<input name="destination" value="Hangzhou"></label><label>Budget<input name="budget" value="800"></label><button type="submit" class="rich-primary">Submit plan</button></form><output id="status">Ready</output></section>',
  js: 'rich.bindForm(document.querySelector("form"));rich.onState(s=>document.querySelector("#status").textContent=s.actions.at(-1)?.state||"Ready");window.addEventListener("rich:validation",e=>document.querySelector("#status").textContent=e.detail.code);',
}
/** SVG chart and filtering stay local and never submit to the model. */
export const chartExample = { ...base,
  html: '<section><h2>Local budget chart</h2><label>Category<select id="category"><option value="all">All</option><option value="travel">Travel</option></select></label><svg viewBox="0 0 500 100" role="img" aria-label="Budget bars"><rect data-category="travel" x="0" y="10" width="200" height="25" fill="var(--rich-accent)"/><rect data-category="hotel" x="0" y="55" width="360" height="25" fill="var(--rich-chart-2)"/></svg><output id="count">2 categories</output></section>',
  js: 'document.querySelector("select").onchange=e=>{let count=0;document.querySelectorAll("rect").forEach(r=>{r.style.display=e.target.value==="all"||r.dataset.category===e.target.value?"":"none";if(r.style.display!=="none")count++});document.querySelector("output").textContent=count+" categories"};',
}
/** Animation and a local multi-step interaction do not consume model calls. */
export const animationExample = { ...base,
  css: css + '#dot{width:20px;height:20px;margin:4px 0 16px;border-radius:50%;background:var(--rich-accent);box-shadow:0 0 16px color-mix(in srgb,var(--rich-accent) 60%,transparent)}',
  html: '<section><h2>Local steps and animation</h2><div id="dot"></div><button id="next">Next step</button><output>Step 1</output></section>',
  js: 'let step=1;document.querySelector("#dot").animate([{transform:"translateX(0)"},{transform:"translateX(180px)"}],{duration:1600,iterations:Infinity,direction:"alternate"});document.querySelector("button").onclick=()=>document.querySelector("output").textContent="Step "+(++step);',
}
/** @param name - visible label for an independent draft. @returns arbitrary content with its own local state and persisted input. */
export function independentExample(name: string) {
  return { ...base, css: css + 'form{display:flex;align-items:end;gap:8px}label{flex:1}section{padding:16px}#count{margin-top:12px}output{display:inline;margin-left:10px}', html: `<section><h2>${name}</h2><form><label>Note<input name="note" value=""></label><button type="submit">Submit note</button></form><button id="count">Local count</button><output>0</output></section>`,
    js: 'rich.bindForm(document.querySelector("form"));let n=0;document.querySelector("#count").onclick=()=>document.querySelector("output").textContent=String(++n);' }
}
