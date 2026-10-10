/** Real Electron window for the Loader-composed chat acceptance suite; model substitution stays in the Host. */
import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { DesktopRichGuests } from '../../src/rich-guests.ts'
import { DesktopBrowserGuests } from '../../src/browser-guests.ts'
import { DESKTOP_IPC } from '../../src/ipc.ts'

protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true,
} }])
const argument = process.argv.find(value => value.startsWith('--rich-chat-output='))?.slice('--rich-chat-output='.length)
if (argument === undefined || !isAbsolute(argument)) throw new Error('absolute rich chat fixture directory required')
const output: string = argument
const launch: unknown = JSON.parse(readFileSync(join(output, 'launch.json'), 'utf8'))
const url = typeof launch === 'object' && launch !== null && 'url' in launch ? launch.url : undefined
if (typeof url !== 'string' || new URL(url).hostname !== '127.0.0.1') throw new Error('only the owned loopback Host is supported')
const hostUrl: string = url
app.setPath('userData', join(output, 'profile'))
app.commandLine.appendSwitch('lang', 'en-US')

async function run(): Promise<void> {
  const manager = new DesktopRichGuests(join(output, 'preload-rich.cjs'))
  const window = new BrowserWindow({ title: 'Rich inline acceptance — deterministic model', show: true, width: 1280, height: 1000,
    webPreferences: { preload: join(output, 'rich-chat-preload.cjs'), nodeIntegration: false,
      sandbox: true, contextIsolation: true, webSecurity: true, webviewTag: true } })
  const owner = window.webContents
  new DesktopBrowserGuests(() => hostUrl, manager).bind(window, () => () => {})
  const trusted = (event: Electron.IpcMainInvokeEvent): void => {
    if (event.sender !== owner || event.senderFrame !== owner.mainFrame) throw new Error('untrusted chat fixture carrier')
  }
  ipcMain.handle(DESKTOP_IPC.richAcquire, (event, value: unknown) => { trusted(event); return manager.acquire(owner, value) })
  ipcMain.handle(DESKTOP_IPC.richSend, (event, lease: unknown, packet: unknown) => { trusted(event); manager.send(owner, lease, packet) })
  ipcMain.handle(DESKTOP_IPC.richRelease, (event, lease: unknown) => { trusted(event); return manager.release(owner, lease) })
  ipcMain.on(DESKTOP_IPC.richBootstrap, (event) => { event.returnValue = manager.bootstrap(event) })
  ipcMain.handle(DESKTOP_IPC.richCopy, (event, value: unknown) => manager.copy(event, value))
  ipcMain.on(DESKTOP_IPC.richFromGuest, (event, value: unknown) => {
    try { manager.receive(event, value) } catch (error) { console.error('Rejected rich fixture packet', error) }
  })
  owner.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => { if (mainFrame) manager.releaseAll(owner) })
  window.on('closed', () => { manager.releaseAll(owner) })
  await window.loadURL(hostUrl)
}
app.on('window-all-closed', () => { app.quit() })
void app.whenReady().then(run).catch((error: unknown) => { console.error(error); app.exit(1) })
