/** Arbitrary form, table, chart, and animation content for the isolated rich renderer. */
export const submittedRichFields = {
  destination: 'Hangzhou west lake',
  lastKey: 'z',
  departure: { type: 'date', value: '2026-10-02' },
  transport: { type: 'option', id: 'train' },
  places: { type: 'selection', ids: ['west-lake', 'museum'] },
  costs: { type: 'table', columns: [{ id: 'item', label: 'Item', valueType: 'text' }, { id: 'cost', label: 'Cost', valueType: 'decimal' }],
    rows: [{ rowId: 'train-cost', cells: { item: { type: 'text', value: 'Train' }, cost: { type: 'decimal', value: '325.50' } } },
      { rowId: 'hotel-cost', cells: { item: { type: 'text', value: 'Hotel' }, cost: { type: 'decimal', value: '500.00' } } }] },
}

/** Complete content is committed through the model-facing publish tool. */
export const initialRichContent = {
  html: '<section><h2>Trip checklist</h2><form id="trip"><label>Destination <input name="destination" value="Hangzhou"></label><label>Budget <input name="budget" type="number" value="800"></label><button type="submit">Plan trip</button></form><svg viewBox="0 0 120 50" role="img" aria-label="Budget chart"><rect x="10" y="10" width="80" height="30" /></svg><output id="status">Draft</output></section>',
  css: 'section{padding:1rem;color:var(--dsw-ink,CanvasText);background:Canvas}form{display:grid;gap:.75rem}rect{fill:currentColor;animation:pulse 2s infinite alternate}@keyframes pulse{to{opacity:.5}}',
  js: 'window.__richGeneratedScriptExecuted=true;window.rich.onState(state=>{document.getElementById("status").textContent=JSON.stringify(state.values)});window.rich.bindForm(document.getElementById("trip"));',
  fallbackText: 'Trip checklist: destination Hangzhou, budget 800. Interactive scripts require the isolated Desktop renderer.',
  stateSchemaVersion: 1,
  values: { destination: 'Hangzhou', budget: { type: 'decimal', value: '800.00' } },
}

/** Replacement reuses the stable block identity without changing its owning message. */
export const updatedRichContent = {
  ...initialRichContent,
  html: '<section><h2>Trip ready</h2><table><caption>Plan summary</caption><tr><th>Destination</th><td>Hangzhou west lake</td></tr><tr><th>Total</th><td>825.50</td></tr></table><button id="next">Continue</button></section>',
  js: 'window.__richGeneratedScriptExecuted=true;document.getElementById("next").onclick=()=>window.rich.submit({next:true});',
  fallbackText: 'Trip ready: Hangzhou west lake, total 825.50. The original message contains the updated plan.',
  values: { destination: 'Hangzhou west lake', budget: { type: 'decimal', value: '825.50' } },
}
