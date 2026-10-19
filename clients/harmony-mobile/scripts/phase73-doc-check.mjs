/** Check current private-client navigation, metadata, linked evidence and exact trailing newlines. */
import assert from 'node:assert/strict'
import { readFile, writeFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
const files=['README.md','README.zh.md','docs/phase73-data-channel-repair.md','docs/acceptance.md','docs/tasks.md'],reports=[]
for(const file of files){const text=await readFile(file,'utf8');assert.match(text,/[^\n]\n$/);assert.equal(text.includes('\ufffd'),false);let links=0;for(const match of text.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)/g)){if(/^[a-z]+:/.test(match[1]))continue;await access(resolve(dirname(file),match[1]));links++}if(file.includes('phase73-data-channel')){assert.match(text,/kind: reference/);assert.match(text,/## Summary/);assert.match(text,/原生工厂/);assert.match(text,/FIFO/);assert.match(text,/不能被宣布为现场唯一根因/)}reports.push({file,relativeLinksChecked:links})}
await writeFile('evidence/phase73-focused-docs.json',JSON.stringify({at:new Date().toISOString(),passed:true,reports},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,files:reports.length,links:reports.reduce((n,r)=>n+r.relativeLinksChecked,0)}))
