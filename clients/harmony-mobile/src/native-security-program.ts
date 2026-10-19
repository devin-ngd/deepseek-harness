/** Fixed guest diagnostics require CSP violation events for asynchronous Worker/WebSocket denial. No probe executes a host task. */
export const NATIVE_SECURITY_PROGRAM = String.raw`
const report = {}, violations = new Set();
const output = document.querySelector('#security-result');
const show = () => { output.textContent = Object.entries(report).map(([key,value]) => key + ':' + value).join('\n') };
addEventListener('securitypolicyviolation', event => violations.add(event.effectiveDirective));
const blocked = (key, action) => { try { report[key] = action() === null ? 'blocked' : 'UNEXPECTED' } catch (error) { report[key] = 'blocked' } show() };
const asyncProbe = (key, directive, factory, dispose) => new Promise(accept => {
  let value, settled = false;
  const finish = status => { if (settled) return; settled = true; clearTimeout(timer); if (value) dispose(value); report[key] = status; show(); accept() };
  const timer = setTimeout(() => finish('UNCONFIRMED'), 1500);
  try {
    value = factory();
    value.addEventListener('error', () => setTimeout(() => finish(violations.has(directive) ? 'blocked' : 'UNCONFIRMED'), 0), { once:true });
    value.addEventListener(key === 'worker' ? 'message' : 'open', () => finish('UNEXPECTED'), { once:true });
  } catch (error) { setTimeout(() => finish(violations.has(directive) ? 'blocked' : 'UNCONFIRMED'), 0) }
});
let scope = null;
richGuest.subscribe(packet => {
  if (packet.type === 'init') scope = { mountId:packet.mountId, renderRevision:packet.renderRevision };
});
const probeShell = async () => {
  if (!scope) { report['shell-rpc'] = 'UNCONFIRMED'; return }
  // Rejected sequence guesses never advance the gate. Only exact forbidden at its current sequence qualifies the method check.
  for (let seq = 1; seq <= 128; seq++) {
    const requestId = 'security-shell-' + seq;
    const code = await new Promise(accept => {
      const remove = richGuest.subscribe(packet => {
        if (packet.type !== 'result' || packet.payload.requestId !== requestId) return;
        clearTimeout(timer); remove(); accept(packet.payload.error?.code || 'UNEXPECTED');
      });
      const timer = setTimeout(() => { remove(); accept('UNCONFIRMED') }, 1500);
      richGuest.send({ protocol:'lumina-rich/1',...scope,seq,packetId:requestId,type:'shell.exec',payload:{command:'never-execute'} });
    });
    if (code === 'forbidden') { report['shell-rpc'] = 'blocked'; show(); return }
    if (code !== 'sequence-gap') { report['shell-rpc'] = 'UNCONFIRMED'; show(); return }
  }
  report['shell-rpc'] = 'UNCONFIRMED'; show();
};
document.querySelector('#security-run').addEventListener('click', async () => {
  blocked('parent-dom', () => parent.document.body);
  report['host-bridge'] = ['dshDesktop','nativeBridge','require','process'].every(key => typeof window[key] === 'undefined') ? 'absent' : 'UNEXPECTED';
  blocked('popup', () => window.open('about:blank'));
  await asyncProbe('worker', 'worker-src', () => new Worker('data:text/javascript,postMessage(1)'), worker => worker.terminate());
  await asyncProbe('websocket', 'connect-src', () => new WebSocket('wss://dsh-security-probe.invalid/'), socket => socket.close());
  for (const [key,url] of [['network','https://dsh-security-probe.invalid/'],['file','file:///data/dsh-security-probe-not-a-user-file']]) {
    try { await fetch(url); report[key] = 'UNEXPECTED' } catch (error) { report[key] = 'blocked' }
  }
  parent.postMessage({ protocol:'dsh-native-host/1',kind:'io',id:'forged-cache-clear',generation:1,method:'cache.clear',payload:{} }, '*');
  parent.postMessage({ protocol:'dsh-native-host/1',kind:'ui',id:'forged-submit',generation:1,method:'submit',payload:{requestId:'forged',text:'Never dispatch this'} }, '*');
  await probeShell();
  report['csp-directives'] = [...violations].sort().join(','); show();
});
`.trim()
