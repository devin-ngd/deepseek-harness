/** Browser-only SDK installed before generated code in a disposable isolated guest. */

/** Protocol bound for reported guest height; hosts treat taller documents as invalid. */
export const GUEST_HEIGHT_MAX = 12000

/**
 * Viewport-bounded guest height: taller content keeps a viewport-sized native surface and
 * scrolls inside the guest instead. Native guest surfaces several viewports tall are evicted
 * and re-rastered while the conversation scrolls, which flashes the guest background.
 * @param viewportHeight - host window inner height in CSS pixels.
 * @returns height cap in CSS pixels between 320 and 1400.
 */
export function guestHeightCap(viewportHeight: number): number {
  return Math.max(320, Math.min(1400, Math.round(viewportHeight) - 220))
}

/**
 * Current guest height cap for this host; non-browser hosts keep the protocol bound.
 * @returns height cap in CSS pixels.
 */
export function currentGuestHeightCap(): number {
  return typeof window === 'undefined' ? GUEST_HEIGHT_MAX : guestHeightCap(window.innerHeight)
}

/**
 * Create the SDK bootstrap; the native preload owns the actual channel identity.
 * @param mountId - fresh host mount identity.
 * @param renderRevision - committed executable revision.
 * @param guestPacketBytes - trusted native budget for untrusted outgoing envelopes.
 * @param heightCap - reported height bound; taller content scrolls inside the guest.
 * @returns JavaScript source with no host credentials, path access or conversation history.
 */
export function guestSdk(mountId: string, renderRevision: number, guestPacketBytes = 128 * 1024, heightCap = GUEST_HEIGHT_MAX): string {
  return `(() => {
    'use strict';
    const bridge = window.richGuest;
    if (!bridge) throw new Error('rich guest bridge unavailable');
    const mountId = ${JSON.stringify(mountId)};
    const renderRevision = ${renderRevision};
    const guestPacketBytes = ${guestPacketBytes};
    let heightCap = ${heightCap};
    const clone = value => JSON.parse(JSON.stringify(value));
    let seq = 0, inboundSeq = 0, snapshot = null, stopped = false, timer = null, submitting = null, activePayload = null;
    let saveQueue = Promise.resolve(), submittedValues = null;
    let fields = {}, dirty = new Set();
    let editing = 0;
    const listeners = new Set(), replies = new Map();
    const packet = (type, payload, id = crypto.randomUUID()) => {
      if (stopped) throw new Error('rich content disposed');
      const envelope = { protocol: 'lumina-rich/1', mountId, renderRevision, packetId: id, seq: seq + 1, type, payload };
      if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > guestPacketBytes) throw new Error('RICH_GUEST_PACKET_TOO_LARGE');
      seq++; bridge.send(envelope);
      return id;
    };
    const request = (type, payload) => new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => { replies.delete(id); reject(new Error('transport timeout; query action status before retrying')); }, 15000);
      replies.set(id, { resolve, reject, timeout });
      try { packet(type, payload, id); }
      catch (error) {
        clearTimeout(timeout); replies.delete(id);
        if (error.message !== 'RICH_GUEST_PACKET_TOO_LARGE') { reject(error); return; }
        const receipt = { accepted: false, code: 'RICH_GUEST_PACKET_TOO_LARGE', actionId: null, state: null, draftRevision: snapshot?.draft.draftRevision || 0 };
        resolve(receipt);
      }
    });
    const draft = () => ({ baseRevision: snapshot.draft.draftRevision, stateSchemaVersion: snapshot.draft.stateSchemaVersion, fields: clone(fields), dirty: [...dirty] });
    const notifyFailure = error => {
      const code = error instanceof Error ? error.message : String(error);
      window.dispatchEvent(new CustomEvent('rich:validation', { detail: { accepted: false, code, draftPreserved: true, limitBytes: guestPacketBytes } }));
      if (!stopped) packet('input.error', { code: code.slice(0, 512) });
    };
    const save = () => {
      const captured = clone(fields), capturedDirty = [...dirty];
      const pending = saveQueue.catch(() => {}).then(async () => {
        if (!snapshot) throw new Error('not initialized');
        const receipt = await request('draft.save', { draft: { ...draft(), fields: captured, dirty: capturedDirty } });
        if (!receipt.accepted) throw new Error(receipt.code);
        return receipt;
      });
      saveQueue = pending;
      return pending;
    };
    const stopBridge = bridge.subscribe(envelope => {
      if (stopped || envelope.protocol !== 'lumina-rich/1' || envelope.mountId !== mountId || envelope.renderRevision !== renderRevision || envelope.seq <= inboundSeq) return;
      inboundSeq = envelope.seq;
      if (envelope.type === 'dispose') { stopped = true; if (timer) clearTimeout(timer); for (const waiter of replies.values()) { clearTimeout(waiter.timeout); waiter.reject(new Error('disposed')); } replies.clear(); stopBridge(); return; }
      const body = envelope.payload;
      if (envelope.type === 'theme') {
        document.documentElement.style.colorScheme = body.theme?.mode || 'light dark';
        for (const [name, value] of Object.entries(body.theme?.tokens || {})) document.documentElement.style.setProperty(name, value);
      }
      if (envelope.type === 'viewport') {
        const next = Number(body.heightCap);
        if (Number.isFinite(next)) { heightCap = Math.max(24, Math.min(12000, Math.round(next))); resize(); }
      }
      if (envelope.type === 'prepare.update') {
        document.body.inert = true;
        if (timer) { clearTimeout(timer); timer = null; }
        void save().then(() => packet('update.ready', { requestId: body.requestId }), error => {
          document.body.inert = false; notifyFailure(error); packet('update.ready', { requestId: body.requestId, error: String(error) });
        });
      }
      if (envelope.type === 'update.cancel') document.body.inert = false;
      if (envelope.type === 'init' || envelope.type === 'snapshot') {
        const first = snapshot === null;
        if (!first && (body.snapshot.dataRevision < snapshot.dataRevision || body.snapshot.draft.draftRevision < snapshot.draft.draftRevision)) return;
        snapshot = clone(body.snapshot);
        if (first) { fields = clone(snapshot.draft.fields); dirty = new Set(snapshot.draft.dirty); }
        else if (dirty.size === 0) fields = clone(snapshot.draft.fields);
        if (activePayload && snapshot.actions.some(action => action.actionId === activePayload.actionId && action.terminal)) { activePayload = null; submitting = null; }
        document.documentElement.style.colorScheme = body.theme?.mode || 'light dark';
        for (const [name, value] of Object.entries(body.theme?.tokens || {})) document.documentElement.style.setProperty(name, value);
        for (const callback of listeners) callback(clone(snapshot));
      }
      if (envelope.type === 'result' && activePayload && body.result?.actionId === activePayload.actionId && body.result.terminal) { activePayload = null; submitting = null; }
      if (body.requestId && replies.has(body.requestId)) {
        const waiter = replies.get(body.requestId); replies.delete(body.requestId); clearTimeout(waiter.timeout);
        if (body.error) waiter.reject(new Error(body.error));
        else { if (body.receipt && snapshot) snapshot.draft.draftRevision = body.receipt.draftRevision; waiter.resolve(body.receipt || body.result || body); }
      }
      window.dispatchEvent(new CustomEvent('rich:' + envelope.type, { detail: clone(body) }));
    });
    const sdk = {
      onState(callback) { listeners.add(callback); if (snapshot) callback(clone(snapshot)); return () => listeners.delete(callback); },
      getState() { return snapshot ? clone(snapshot) : null; },
      getDraft() { return clone(fields); },
      setDraft(next, changed = Object.keys(next)) { fields = clone(next); editing++; for (const key of changed) dirty.add(key); if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; if (snapshot) void save().catch(notifyFailure); }, 250); },
      async submit(values = fields, options = {}) {
        if (!snapshot) throw new Error('not initialized');
        if (submitting) { if (JSON.stringify(values) !== JSON.stringify(submittedValues)) throw new Error('ACTION_BUSY_INPUT_PRESERVED'); return submitting; }
        if (timer) { clearTimeout(timer); timer = null; }
        const actionId = options.actionId || crypto.randomUUID();
        const captured = clone(fields), capturedDirty = [...dirty], capturedValues = clone(values), capturedGrants = clone(options.fileGrants ?? snapshot.files.map(file => file.grantId));
        const capturedEditing = editing;
        submittedValues = capturedValues;
        submitting = (async () => {
          await saveQueue.catch(() => {});
          activePayload = { actionId, actionName: 'submit', targetActionId: null, expectedDataRevision: snapshot.dataRevision, values: capturedValues, fileGrants: capturedGrants, draft: { ...draft(), fields: captured, dirty: capturedDirty } };
          const receipt = await request('action.invoke', activePayload);
          if (receipt.accepted && capturedEditing === editing) dirty.clear();
          if (!receipt.accepted) { activePayload = null; submitting = null; notifyFailure(new Error(receipt.code)); }
          return receipt;
        })();
        return submitting;
      },
      retry() { if (!activePayload) throw new Error('no unresolved submission'); submitting = request('action.invoke', clone(activePayload)).then(receipt => { if (!receipt.accepted) { activePayload = null; submitting = null; } return receipt; }); return submitting; },
      status(actionId) { return request('action.status', { actionId }); },
      cancel(actionId) { return request('action.invoke', { actionId: crypto.randomUUID(), actionName: 'cancel', targetActionId: actionId, expectedDataRevision: snapshot.dataRevision, values: {}, fileGrants: [], draft: draft() }); },
      bindForm(form) {
        const read = () => Object.fromEntries([...new FormData(form)].map(([key, value]) => { if (typeof value !== 'string') throw new Error('choose attachments in the trusted host toolbar'); return [key, value]; }));
        const input = () => sdk.setDraft(read());
        const submit = event => { event.preventDefault(); sdk.setDraft(read()); void sdk.submit(read()).catch(notifyFailure); };
        form.addEventListener('input', input); form.addEventListener('submit', submit);
        let restored = false;
        const stopRestore = sdk.onState(() => { if (restored) return; restored = true; for (const [name, value] of Object.entries(fields)) { const control = form.elements.namedItem(name); if (control && 'value' in control && typeof value === 'string') control.value = value; } });
        return () => { form.removeEventListener('input', input); form.removeEventListener('submit', submit); stopRestore(); };
      },
    };
    Object.defineProperty(window, 'rich', { value: Object.freeze(sdk), writable: false, configurable: false });
    let lastResize = -Infinity, resizeTimer = null, lastHeight = -1, tall = false;
    const root = document.querySelector('[data-rich-content-root]') || document.body;
    // Toggling the scrollbar inside the observer callback re-wraps the observed root in the same frame, which Chrome reports as a window error.
    document.documentElement.style.overflowY = 'hidden';
    const resize = () => {
      if (stopped) return;
      const remaining = 100 - (performance.now() - lastResize);
      if (remaining > 0) { if (!resizeTimer) resizeTimer = setTimeout(() => { resizeTimer = null; lastResize = -Infinity; resize(); }, remaining); return; }
      lastResize = performance.now();
      const raw = Math.ceil(Math.max(root.scrollHeight, root.getBoundingClientRect().height));
      if ((raw > heightCap) !== tall) { tall = !tall; setTimeout(() => { if (!stopped) document.documentElement.style.overflowY = tall ? 'auto' : 'hidden'; }, 0); }
      const height = Math.max(24, Math.min(heightCap, raw));
      if (lastHeight < 0 || Math.abs(height - lastHeight) > 1) { lastHeight = height; packet('resize', { height }); }
    };
    new ResizeObserver(resize).observe(root);
    let contentFailed = false;
    const reportFailure = message => {
      if (contentFailed || stopped) return;
      contentFailed = true;
      if (timer) { clearTimeout(timer); timer = null; }
      const report = draftPreserved => { if (!stopped) packet('content.error', { message: String(message).slice(0, 512), draftPreserved }); };
      // Persist current edits before the Host retires this failed guest.
      if (snapshot && dirty.size) void save().then(() => report(false), error => { notifyFailure(error); report(true); });
      else report(false);
    };
    // Browsers raise this for harmless layout feedback loops, including ones caused by generated code's own observers; it is not a code failure.
    window.addEventListener('error', event => { if (!/^ResizeObserver loop/.test(event.message)) reportFailure(event.message); });
    window.addEventListener('unhandledrejection', event => reportFailure(event.reason));
    packet('ready', { sdkVersion: '1', capabilities: ['draft', 'action', 'resize'] });
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!stopped && !contentFailed) packet('render.result', { state: 'rendered' });
    }));
  })();`
}
