/** File-only ZIP assembly and full content verification through the installed Windows compression library. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, readdir, lstat, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
/** @param stage - new owned package directory. @param archive - new archive path, never overwritten. @returns exact file inventory and fully verified archive metadata. */
export async function sealZip(stage, archive) {
  const files = []
  async function scan(directory) { for (const row of await readdir(directory, { withFileTypes: true })) { const path = join(directory, row.name); assert.equal((await lstat(path)).isSymbolicLink(), false); if (row.isDirectory()) await scan(path); else { const bytes = await readFile(path); files.push({ file: path.slice(stage.length + 1).replaceAll('\\','/'), bytes: bytes.length, sha256: hash(bytes) }) } } }
  await scan(stage); files.sort((a,b)=>a.file.localeCompare(b.file)); const manifest = Buffer.from(JSON.stringify(files,null,2)+'\n'); await writeFile(join(stage,'files.sha256.json'),manifest,{flag:'wx'})
  const code = '$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; if(Test-Path -LiteralPath $env:PHASE75_ZIP){throw "Archive exists"}; $z=[IO.Compression.ZipFile]::Open($env:PHASE75_ZIP,[IO.Compression.ZipArchiveMode]::Create); try { Get-ChildItem -LiteralPath $env:PHASE75_STAGE -Recurse -File | ForEach-Object { $n=$_.FullName.Substring($env:PHASE75_STAGE.Length+1).Replace([char]92,[char]47); [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z,$_.FullName,$n,[IO.Compression.CompressionLevel]::Optimal) } } finally {$z.Dispose()}; $z=[IO.Compression.ZipFile]::OpenRead($env:PHASE75_ZIP); try {$rows=Get-Content -LiteralPath ($env:PHASE75_STAGE+"/files.sha256.json") -Raw | ConvertFrom-Json; if($z.Entries.Count-ne($rows.Count+1)){throw "Entry count"}; foreach($r in $rows){$e=$z.GetEntry($r.file);if($null-eq$e-or$e.Length-ne$r.bytes){throw "Entry length"};$s=$e.Open();try{$h=[Security.Cryptography.SHA256]::Create();try{$d=[BitConverter]::ToString($h.ComputeHash($s)).Replace("-","").ToLowerInvariant()}finally{$h.Dispose()}}finally{$s.Dispose()};if($d-ne$r.sha256){throw "Entry hash"}}}finally{$z.Dispose()}'
  const result = spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',code],{env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.SystemRoot,PHASE75_STAGE:stage,PHASE75_ZIP:archive},windowsHide:true,encoding:'utf8',timeout:60000})
  assert.equal(result.status,0,result.stderr); const bytes=await readFile(archive); return {stage,archive:{path:archive,bytes:(await stat(archive)).size,sha256:hash(bytes)},manifestSha256:hash(manifest),filesVerified:files.length,entries:files.length+1}
}
