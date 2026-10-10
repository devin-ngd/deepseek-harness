/** Keyless real-Electron negative tests through the shipped guest manager and isolated preloads. */
import { app, BrowserWindow, ipcMain, protocol, type WebContents } from 'electron'
import { createServer } from 'node:http'
import { writeFile, mkdir } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { DesktopRichGuests } from '../../src/rich-guests.ts'
import { DesktopBrowserGuests } from '../../src/browser-guests.ts'
import { DESKTOP_IPC } from '../../src/ipc.ts'
import { runRichCopyChecks } from './rich-copy-checks.ts'

protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }])

const outputArgument = process.argv.find(argument => argument.startsWith('--rich-native-output='))?.slice('--rich-native-output='.length)
if (outputArgument === undefined || !isAbsolute(outputArgument)) throw new Error('rich-native-runner requires its absolute private output directory')
const output: string = outputArgument
app.setPath('userData', join(output, 'profile'))
app.on('child-process-gone', (_event, details) => { console.error('native fixture child process gone', details) })
console.log('native fixture stage: argument parsed')
const results: { name: string; passed: boolean; detail: unknown }[] = []
const hits: string[] = []
const check = (name: string, condition: boolean, detail: unknown): void => {
  results.push({ name, passed: condition, detail })
  if (!condition) throw new Error(name)
}
const delay = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })
const deadline = async <T>(promise: Promise<T>, ms = 4000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { reject(new Error('native test deadline')) }, ms) })]) }
  finally { clearTimeout(timer) }
}
const receiver = createServer((request, response) => { hits.push(request.url ?? ''); response.end('local-test-receiver') })
const guests: WebContents[] = []
let window: BrowserWindow | undefined
let manager: DesktopRichGuests | undefined
// Electron's ESM loader waits for entry evaluation before signalling appCodeLoaded.
// Keep the ready-dependent work outside that module evaluation.
async function run(): Promise<void> {
  try {
    await mkdir(output, { recursive: true })
    console.log('native fixture stage: output ready')
    await new Promise<void>((resolve) => { receiver.listen(0, '127.0.0.1', resolve) })
    console.log('native fixture stage: receiver listening')
    const address = receiver.address()
    if (address === null || typeof address === 'string') throw new Error('native test receiver unavailable')
    const destination = `http://127.0.0.1:${address.port}/sink`
    await deadline(app.whenReady(), 10000)
    console.log('native fixture stage: app ready')
    manager = new DesktopRichGuests(join(output, 'preload-rich.cjs'))
    window = new BrowserWindow({ show: false, width: 1000, height: 800,
      webPreferences: { preload: join(output, 'rich-owner-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: true } })
    const owner = window.webContents
    owner.on('render-process-gone', (_event, details) => { console.error('native fixture owner renderer gone', details) })
    owner.on('did-fail-load', (_event, code, description) => { console.error('native fixture owner load failed', code, description) })
    console.log('native fixture stage: owner created')
    const browser = new DesktopBrowserGuests(() => undefined, manager)
    browser.bind(window, () => () => {})
    owner.on('did-attach-webview', (_event, guest) => { guests.push(guest) })
    const trusted = (event: Electron.IpcMainInvokeEvent): void => {
      if (event.sender !== owner || event.senderFrame !== owner.mainFrame) throw new Error('untrusted test carrier')
    }
    ipcMain.handle(DESKTOP_IPC.richAcquire, (event, value: unknown) => { trusted(event); return manager?.acquire(owner, value) })
    ipcMain.handle(DESKTOP_IPC.richSend, (event, id: unknown, value: unknown) => { trusted(event); return manager?.send(owner, id, value) })
    ipcMain.handle(DESKTOP_IPC.richRelease, (event, id: unknown) => { trusted(event); return manager?.release(owner, id) })
    ipcMain.on(DESKTOP_IPC.richBootstrap, (event) => { event.returnValue = manager?.bootstrap(event) })
    ipcMain.handle(DESKTOP_IPC.richCopy, (event, value: unknown) => manager?.copy(event, value))
    ipcMain.on(DESKTOP_IPC.richFromGuest, (event, value: unknown) => { manager?.receive(event, value) })
    await deadline(window.loadURL('data:text/html,' + encodeURIComponent('<!doctype html><body><section id="messages"></section><script>window.packets=[];window.reservations=[];window.ticks=0;setInterval(()=>ticks++,40);window.mount=async request=>{const r=await testRich.acquire(request);reservations.push(r);testRich.subscribe(r.lease,packet=>packets.push({lease:r.lease,packet}));const message=document.createElement("section");message.dataset.chatMessage="assistant";const view=document.createElement("webview");view.setAttribute("name",r.lease);view.setAttribute("partition",r.partition);view.setAttribute("src",r.src);view.style.cssText="width:600px;height:450px";message.append(view);messages.append(message);return r};</script>')))
    console.log('native fixture stage: owner loaded')
    const evalOwner = async <T>(source: string): Promise<T> => deadline(owner.executeJavaScript(source) as Promise<T>)
    const waitPackets = async (type: string): Promise<Record<string, unknown>[]> => {
      for (let i = 0; i < 80; i++) {
        const values = await evalOwner<Record<string, unknown>[]>(`packets.filter(entry=>entry.packet.type===${JSON.stringify(type)})`)
        if (values.length > 0) return values
        await delay(50)
      }
      throw new Error('no native packet: ' + type + ' ' + JSON.stringify({ guests: guests.map(item => ({ destroyed: item.isDestroyed(), url: item.isDestroyed() ? '' : item.getURL() })), owner: await evalOwner('({scrollY, packets, count:document.querySelectorAll("webview").length})') }))
    }
    const normalJs = `const send=packet=>richGuest.send(packet);richGuest.subscribe(packet=>{if(packet.type==='ping')send({type:'pong',token:packet.token});if(packet.type==='loop'){send({type:'loopStarted'});while(true){}}});let storage;try{storage=localStorage.getItem('native-test')}catch{storage='denied'}send({type:'ready',node:typeof require,process:typeof process,host:typeof dshDesktop,storage,randomUUID:typeof crypto.randomUUID,rtc:typeof RTCPeerConnection});document.getElementById('submit').addEventListener('click',()=>send({type:'submitted',value:document.getElementById('entry').value}));window.dropSeen=false;window.addEventListener('drop',()=>{dropSeen=true});fetch(${JSON.stringify(destination + '?fetch')}).catch(()=>{});const image=new Image();image.src=${JSON.stringify(destination + '?image')};document.body.append(image);try{new WebSocket(${JSON.stringify(destination.replace('http:', 'ws:') + '?ws')})}catch{};try{window.open(${JSON.stringify(destination + '?popup')})}catch{};try{navigator.mediaDevices.getUserMedia({audio:true}).catch(()=>{})}catch{};setTimeout(()=>location.assign(${JSON.stringify(destination + '?navigation')}),150);`
    const request = { mountId: 'native-one', mountNonce: 'native-test-nonce-0000000000001',
      copy: { text: 'Copy this section', image: 'Copy image', copied: 'Copied', failed: 'Could not copy' },
      html: '<div class="card"><h2>Rich native fixture</h2><svg width="200" height="60"><path d="M0 50L80 20L160 40" stroke="blue" fill="none"/></svg><input id="entry" value="last character"><button id="submit">Submit</button><input id="file" type="file"></div>',
      css: '.card{padding:24px;border-radius:16px;background:linear-gradient(120deg,#eef,#efe)}', js: normalJs }
    const reservation = await evalOwner<{ lease: string; partition: string; src: string }>(`mount(${JSON.stringify(request)})`)
    console.log('native fixture stage: first mount reserved')
    const ready = await waitPackets('ready')
    const guest = guests[0]
    if (guest === undefined) throw new Error('guest did not attach')
    const readyPacket = (ready[0] as { packet: Record<string, unknown> }).packet
    check('native guest has no Node or application API, and no host storage', readyPacket.node === 'undefined' && readyPacket.process === 'undefined' && readyPacket.host === 'undefined' && readyPacket.storage === null, readyPacket)
    check('secure custom document exposes UUID but no WebRTC constructor', readyPacket.randomUUID === 'function' && readyPacket.rtc === 'undefined', readyPacket)
    check('guest renderer differs from trusted owner', owner.getOSProcessId() > 0 && guest.getOSProcessId() > 0 && owner.getOSProcessId() !== guest.getOSProcessId(), { owner: owner.getOSProcessId(), guest: guest.getOSProcessId() })
    check('rich content resides in a chat message', await evalOwner('document.querySelectorAll("section[data-chat-message] webview").length===1'), reservation)
    await evalOwner(`testRich.send(${JSON.stringify(reservation.lease)},{type:'ping',token:'same-mount'})`)
    const pong = await waitPackets('pong')
    check('host and content exchange JSON on the same lease', (pong[0] as { lease: string; packet: { token: string } }).lease === reservation.lease && (pong[0] as { packet: { token: string } }).packet.token === 'same-mount', pong)
    await guest.executeJavaScript("document.getElementById('submit').click()", true)
    const submitted = await waitPackets('submitted')
    check('arbitrary generated DOM event returns current input', (submitted[0] as { packet: { value: string } }).packet.value === 'last character', submitted)
    await delay(500)
    check('no network, navigation or popup reaches receiver', hits.length === 0 && guest.getURL().startsWith('dsh-app://dsh-rich-'), { hits, urlPrefix: guest.getURL().slice(0, 40) })
    await guest.executeJavaScript("document.getElementById('file').showPicker()", true).catch(() => {})
    await delay(150)
    check('native file chooser yields no files', await guest.executeJavaScript("document.getElementById('file').files.length===0") as boolean, {})
    const ownFile = join(output, 'drag-fixture.txt')
    await writeFile(ownFile, 'native fixture only')
    await guest.debugger.sendCommand('Input.dispatchDragEvent', { type: 'dragEnter', x: 100, y: 100, data: { items: [], files: [ownFile], dragOperationsMask: 1 } })
    await guest.debugger.sendCommand('Input.dispatchDragEvent', { type: 'dragOver', x: 100, y: 100, data: { items: [], files: [ownFile], dragOperationsMask: 1 } })
    await guest.debugger.sendCommand('Input.dispatchDragEvent', { type: 'drop', x: 100, y: 100, data: { items: [], files: [ownFile], dragOperationsMask: 1 } })
    check('isolated guard prevents generated drop handler receiving a file', await guest.executeJavaScript('dropSeen===false') as boolean, {})
    // Chromium routes native Tab and Enter through the active visible widget.
    window.show()
    window.focus()
    await runRichCopyChecks(guest, check)
    const secondReservation = await evalOwner<{ lease: string; partition: string }>(`mount(${JSON.stringify({ ...request, mountId: 'native-two', js: "richGuest.send({type:'secondReady'})" })})`)
    await waitPackets('secondReady')
    const second = guests[1]
    check('blocks have distinct partitions and renderer processes', second !== undefined && secondReservation.partition !== reservation.partition && second.getOSProcessId() !== guest.getOSProcessId(), { partitions: [reservation.partition, secondReservation.partition], pids: [guest.getOSProcessId(), second?.getOSProcessId()] })
    await owner.capturePage().then(image => writeFile(join(output, 'native-chat.png'), image.toPNG()))
    const before = await evalOwner<number>('ticks')
    await evalOwner(`testRich.send(${JSON.stringify(reservation.lease)},{type:'loop'})`)
    await waitPackets('loopStarted')
    await delay(150)
    check('trusted renderer remains responsive during guest infinite loop', await evalOwner<number>('ticks') > before, {})
    const started = Date.now()
    await deadline(manager.release(owner, reservation.lease), 2000)
    check('main kills and destroys infinite loop guest without affecting other blocks', guest.isDestroyed() && !owner.isDestroyed() && second !== undefined && !second.isDestroyed() && Date.now() - started < 2000, { elapsed: Date.now() - started })
    await manager.release(owner, secondReservation.lease)
    check('second block releases normally', second?.isDestroyed() === true, {})
    await evalOwner(`mount(${JSON.stringify({ ...request, mountId: 'native-rate-limit', js: "for(let i=0;i<110;i++)richGuest.send({type:'spam',i})" })})`)
    const limited = await waitPackets('native.error')
    const rateGuest = guests[2]
    await delay(150)
    check('packet flood gives a visible native error and terminates only its guest',
      limited.some(item => (item as { packet: { code: string } }).packet.code === 'RICH_PACKET_RATE_LIMIT')
      && rateGuest?.isDestroyed() === true && !owner.isDestroyed(), limited)
    const firstReloadGuest = guests.length
    for (const [mountId, js] of [['native-reload-loop', "richGuest.send({type:'reloadReady'});setTimeout(()=>{while(true){}},50)"],
      ['native-reload-idle', "richGuest.send({type:'reloadReady'})"]]) await evalOwner(`mount(${JSON.stringify({ ...request, mountId, js })})`)
    for (let i = 0; i < 80 && (await evalOwner<number>('packets.filter(entry=>entry.packet.type==="reloadReady").length')) < 2; i++) await delay(50)
    await delay(150)
    const reloadGuests = guests.slice(firstReloadGuest)
    const reloadPids = reloadGuests.map(item => item.getOSProcessId())
    const reloaded = new Promise<void>((resolve) => { owner.once('did-finish-load', () => { resolve() }) })
    owner.reload()
    await deadline(reloaded)
    for (let i = 0; i < 100 && app.getAppMetrics().some(metric => reloadPids.includes(metric.pid)); i++) await delay(20)
    check('owner reload closes looping and idle guests, ends their renderer processes and keeps the owner usable',
      reloadGuests.length === 2 && reloadGuests.every(item => item.isDestroyed()) && reloadPids.every(pid => pid > 0)
      && !app.getAppMetrics().some(metric => reloadPids.includes(metric.pid)) && await evalOwner<boolean>('typeof mount==="function"'), { reloadPids })
  } catch (error) {
    results.push({ name: 'runner error', passed: false, detail: error instanceof Error ? error.stack : String(error) })
  } finally {
    const passed = results.length > 0 && results.every(result => result.passed)
    await writeFile(join(output, 'native-results.json'), JSON.stringify({ passed, electron: process.versions.electron, chromium: process.versions.chrome, results }, null, 2))
    for (const guest of guests) if (!guest.isDestroyed()) guest.close({ waitForBeforeUnload: false })
    window?.destroy()
    receiver.close()
    app.exit(passed ? 0 : 1)
  }
}

void run().catch((error: unknown) => {
  // Reporting or cleanup failures must also terminate this owner-local test.
  console.error('native fixture could not finish', error)
  app.exit(1)
})
