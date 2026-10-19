/** Windows Node-host DPAPI adapter. Private bytes use anonymous pipes, never argv, environment, files or diagnostics. */
import { spawn } from 'node:child_process'
import { join, isAbsolute } from 'node:path'
import type { DesktopSecretProtection } from './secret-protection.ts'
import { SecretProtectionError } from './secret-protection.ts'

/** Explicit host deployment deadline; byte limits below are fixed protocol/security bounds. */
export interface WindowsProtectionSpec { readonly timeoutMs: number }
const maxBytes = 16384
const program = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$inputStream = $null; $outputStream = $null; $inputBytes = $null; $result = $null; $memory = $null; $chunk = $null
$stage = 'assembly'
try {
  Add-Type -AssemblyName System.Security
  $stage = 'input'
  $inputStream = [Console]::OpenStandardInput()
  $memory = [IO.MemoryStream]::new()
  $chunk = [byte[]]::new(1024)
  while (($count = $inputStream.Read($chunk, 0, $chunk.Length)) -gt 0) {
    if ($memory.Length + $count -gt 16384) { throw 'bounded input' }
    $memory.Write($chunk, 0, $count)
  }
  $inputBytes = $memory.ToArray()
  if ($inputBytes.Length -eq 0) { throw 'empty input' }
  $stage = 'binding'
  $entropy = [Convert]::FromBase64String($env:DSH_IDENTITY_BINDING)
  if ($entropy.Length -ne 32) { throw 'binding' }
  $stage = 'crypto'
  if ($env:DSH_IDENTITY_OPERATION -eq 'protect') {
    $result = [Security.Cryptography.ProtectedData]::Protect($inputBytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  } elseif ($env:DSH_IDENTITY_OPERATION -eq 'unprotect') {
    $result = [Security.Cryptography.ProtectedData]::Unprotect($inputBytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  } else { throw 'operation' }
  if ($result.Length -eq 0 -or $result.Length -gt 16384) { throw 'bounded output' }
  $stage = 'output'
  $outputStream = [Console]::OpenStandardOutput()
  $outputStream.Write($result, 0, $result.Length)
  $outputStream.Flush()
} catch {
  $protectionError = $_
  [Console]::Error.WriteLine('IDENTITY_PROTECTION_FAILED:' + $stage)
  exit 1
} finally {
  if ($null -ne $inputBytes) { [Array]::Clear($inputBytes, 0, $inputBytes.Length) }
  if ($null -ne $result) { [Array]::Clear($result, 0, $result.Length) }
  if ($null -ne $chunk) { [Array]::Clear($chunk, 0, $chunk.Length) }
  if ($null -ne $memory) { $buffer = $memory.GetBuffer(); [Array]::Clear($buffer, 0, $buffer.Length); $memory.Dispose() }
  if ($null -ne $inputStream) { $inputStream.Dispose() }
  if ($null -ne $outputStream) { $outputStream.Dispose() }
}
`

/** Current Windows user protection for the headless Node profile; same-user compromise and managed-memory erasure are not prevented. */
export class WindowsCurrentUserProtection implements DesktopSecretProtection {
  readonly kind = 'windows-dpapi-current-user/1' as const
  /** @param spec - explicitly resolved local deadline. No process is started by construction. */
  constructor(private readonly spec: WindowsProtectionSpec) {}
  /** @param plaintext - private key bytes. @param binding - SHA256 of the selected alias/public key. @returns DPAPI ciphertext after the child exits successfully. */
  protect(plaintext: Uint8Array, binding: Uint8Array): Promise<Uint8Array> { return this.run('protect', plaintext, binding) }
  /** @param ciphertext - persisted DPAPI blob. @param binding - identical alias/public key binding. @returns caller-owned private bytes, never logged by this adapter. */
  unprotect(ciphertext: Uint8Array, binding: Uint8Array): Promise<Uint8Array> { return this.run('unprotect', ciphertext, binding) }
  private async run(operation: 'protect' | 'unprotect', input: Uint8Array, binding: Uint8Array): Promise<Uint8Array> {
    if (process.platform !== 'win32' || !process.env.SystemRoot || !isAbsolute(process.env.SystemRoot)) throw new SecretProtectionError('unsupported-platform')
    if (input.length < 1 || input.length > maxBytes || binding.length !== 32) throw new SecretProtectionError('protection-protocol')
    const child = spawn(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(program, 'utf16le').toString('base64')], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot, DSH_IDENTITY_OPERATION: operation, DSH_IDENTITY_BINDING: Buffer.from(binding).toString('base64') },
    })
    const chunks: Buffer[] = []; let count = 0, failed = false, timedOut = false, stderrBytes = 0, stage = 'unknown'
    const timer = setTimeout(() => { timedOut = true; failed = true; child.kill() }, this.spec.timeoutMs)
    child.stdout.on('data', (bytes: Buffer) => { count += bytes.length; if (count > maxBytes) { failed = true; bytes.fill(0); child.kill() } else chunks.push(bytes) })
    child.stderr.on('data', (bytes: Buffer) => { stderrBytes += bytes.length; const marker = /IDENTITY_PROTECTION_FAILED:(assembly|input|binding|crypto|output)/.exec(bytes.toString('ascii')); if (marker) stage = marker[1]!; bytes.fill(0); if (stderrBytes > 4096) { failed = true; child.kill() } })
    child.stdin.on('error', error => { void error; failed = true })
    const completion = new Promise<number | null>(accept => { child.once('error', error => { void error; failed = true }); child.once('close', accept) })
    child.stdin.end(input)
    const code = await completion; clearTimeout(timer)
    try {
      if (failed || code !== 0 || stderrBytes !== 0) throw new SecretProtectionError('protection-failed', { stage, exitCode: code, timedOut })
      if (count < 1 || count > maxBytes) throw new SecretProtectionError('protection-protocol')
      return Buffer.concat(chunks)
    } finally { for (const chunk of chunks) chunk.fill(0) }
  }
}
