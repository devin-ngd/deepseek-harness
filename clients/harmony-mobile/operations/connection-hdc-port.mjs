// @ts-check
/** Shell-free HDC execution. Abort and timeout request termination; completion always waits for child close. */
import { spawn } from 'node:child_process'

/**
 * Bind the already installed HDC executable and server without starting a service.
 * @param {object} options - Explicit execution limits.
 * @param {string} options.file - Installed HDC executable.
 * @param {string} options.server - Existing local server.
 * @param {number} options.timeoutMs - Per-command termination deadline.
 * @param {number} options.maxBytes - Maximum stdout/stderr bytes retained locally.
 * @param {typeof spawn} [options.spawnProcess] - Process creation port; tests inject an owned child.
 * @param {{after(ms: number, callback: () => void): () => void}} [options.scheduler] - Command timeout owner; tests inject a clock.
 * @returns {{run(args: string[], signal?: AbortSignal): Promise<string>}} Port rejects after process close on cancellation, timeout, overflow or failure; it never retries.
 */
export function createHdcUiPort({ file, server, timeoutMs, maxBytes, spawnProcess = spawn, scheduler = { after(ms, callback) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } } }) {
  if (![timeoutMs, maxBytes].every(value => Number.isSafeInteger(value) && value > 0)) throw Error('invalid HDC UI command limits')
  return { run(args, signal) {
    if (signal?.aborted) return Promise.reject(Error('HDC UI action cancelled'))
    return new Promise((resolve, reject) => {
      const child = spawnProcess(file, ['-p', '-s', server, ...args], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
      /** @type {Buffer[]} */
      const output = []
      /** @type {Buffer[]} */
      const errors = []
      let bytes = 0, failed = false, terminationRequested = false
      const terminate = () => { failed = true; if (!terminationRequested) { terminationRequested = true; child.kill() } }
      const stopTimer = scheduler.after(timeoutMs, terminate)
      /** @param {Buffer} chunk @param {boolean} stderr */
      const append = (chunk, stderr) => {
        bytes += chunk.length
        if (bytes > maxBytes) { terminate(); return }
        if (stderr) errors.push(chunk); else output.push(chunk)
      }
      child.stdout.on('data', chunk => append(chunk, false)); child.stderr.on('data', chunk => append(chunk, true))
      child.on('error', error => { void error; failed = true })
      signal?.addEventListener('abort', terminate, { once: true })
      child.once('close', code => {
        stopTimer(); signal?.removeEventListener('abort', terminate)
        const text = Buffer.concat(output).toString('utf8'), errorText = Buffer.concat(errors).toString('utf8')
        if (failed || code !== 0 || /\[Fail\]|\[Error\]/.test(text + errorText)) reject(Error('HDC UI action outcome unknown; inspect before retry'))
        else resolve(text)
      })
      if (signal?.aborted) terminate()
    })
  } }
}
