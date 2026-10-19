#!/bin/sh
# Extract only the40 SHA-pinned public deployment files and test inactive startup/owned-state durability.
set -eu
umask 077
cd /home/devin/harmony-relay/phase69-successor
test "$(sha256sum phase70-relay-deploy.zip | cut -d ' ' -f1)" = 636660ce815cf2acded358192e1e3ef32466b90378bdb66ff443bf798d16ca18
test "$(sha256sum phase70-relay-files.json | cut -d ' ' -f1)" = eafe0c41ec6590d84362bf20523a74133a90a25fe910eee9f5829a43b826e395
test ! -e server.mjs
python3 - <<'PY'
import pathlib,zipfile,hashlib,json,stat
root=pathlib.Path.cwd().resolve()
expected={x['file']:x for x in json.load(open('phase70-relay-files.json'))}
assert len(expected)==40
with zipfile.ZipFile('phase70-relay-deploy.zip') as archive:
    actual={entry.filename for entry in archive.infolist() if not entry.is_dir()}
    assert actual==set(expected)
    for entry in archive.infolist():
        if entry.is_dir(): continue
        assert not stat.S_ISLNK(entry.external_attr>>16)
        assert entry.filename.startswith('relay/')
        target=(root/entry.filename[len('relay/'):]).resolve()
        assert target.is_relative_to(root) and not target.exists()
        data=archive.read(entry)
        assert len(data)==expected[entry.filename]['bytes']
        assert hashlib.sha256(data).hexdigest()==expected[entry.filename]['sha256']
        target.parent.mkdir(parents=True,exist_ok=True)
        with open(target,'xb') as output: output.write(data)
print('verified_public_files=40')
PY
node server.mjs --config config.disabled.json
node --input-type=module - <<'JS'
import fs from 'node:fs';import assert from 'node:assert/strict';import {createStandaloneRelay} from './server.mjs';
assert.equal(createStandaloneRelay({enabled:false}),undefined);
const a='state/.phase70-durability.pending',b='state/.phase70-durability.complete',fd=fs.openSync(a,'wx',0o600);fs.writeSync(fd,'public-only-preflight/1\n');fs.fsyncSync(fd);fs.closeSync(fd);fs.renameSync(a,b);const dir=fs.openSync('state','r');fs.fsyncSync(dir);fs.closeSync(dir);assert.equal(fs.readFileSync(b,'utf8'),'public-only-preflight/1\n');
const base=JSON.parse(fs.readFileSync('config.enabled.example.json','utf8'));fs.writeFileSync('field.active.json',JSON.stringify({...base,nativeOrigin:'networkkit-v1',broker:{enabled:false}},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({disabledImport:true,disabledStartup:true,directoryFsync:true,atomicRename:true,probeBrokerEnabled:false,livePairConfigured:false,grantCreated:false}));
JS
sha256sum server.mjs harmony-relay.service.drop-in.proposal relay.nginx.conf.proposal
