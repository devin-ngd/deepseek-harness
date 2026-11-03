"""Append an isolated emulator plugin to the existing desktop profile, preserving every existing byte."""
import pathlib,json,hashlib,shutil,yaml
client=pathlib.Path(__file__).resolve().parent.parent
world=client/'.build/emulator-link'
profile=pathlib.Path('C:/Users/wpdev/.dsh/profiles/desktop')
patch=profile/'cordis.patch.yml'
before=patch.read_bytes()
assert 'harmony-emulator-local-group' not in before.decode('utf-8'),'Emulator plugin already configured'
original=yaml.safe_load(before)
original_creds=pathlib.Path('D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/home/.field-credentials.yaml')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pins={str(p):sha(p) for p in [original_creds,profile/'package.json',profile/'pnpm-lock.yaml']}
target=profile/'node_modules/harmony-emulator-local'
assert not target.exists(),'Refusing to overwrite an existing installed plugin'
target.mkdir()
for name in ['index.mjs','package.json']:shutil.copyfile(world/name,target/name)
extra=[{'insert':[{'id':'harmony-emulator-local-group','name':'cordis:group','group':True,'isolate':{'credentials':True,'authorization':True},'config':[
 {'id':'harmony-emulator-credentials','name':'@deepseek-ai/dsh-credentials-local','config':{'path':str(world/'credentials.yaml').replace('\\','/'),'dshHome':str(world).replace('\\','/'),'watch':False}},
 {'id':'harmony-emulator-authorization','name':'@deepseek-ai/dsh-authorization'},
 {'id':'harmony-emulator-local','name':target.joinpath('index.mjs').as_uri(),'config':{'directory':str(world).replace('\\','/'),'port':17847}}
]}]}]
after=before+b'\n'+yaml.safe_dump(extra,allow_unicode=True,sort_keys=False).encode('utf-8')
assert yaml.safe_load(after)==original+extra
backup=world/'desktop-before.patch.yml';assert not backup.exists();backup.write_bytes(before)
(world/'preservation-before.json').write_text(json.dumps(pins,indent=2)+'\n',encoding='utf-8')
assert patch.read_bytes()==before,'Desktop configuration changed during preparation'
patch.write_bytes(after)
(world/'desktop-configured.json').write_text(json.dumps({'originalPatchSha256':hashlib.sha256(before).hexdigest(),'newPatchSha256':hashlib.sha256(after).hexdigest(),'onlyAppendedGroup':True,'originalFiles':pins},indent=2)+'\n',encoding='utf-8')
print('Installed independent emulator plugin; appended one group, preserved original configuration')
