"""Control only the loopback emulator and task-owned local handoff files."""
import json,pathlib,subprocess,sys,shlex,re,time
sys.stdout.reconfigure(encoding='utf-8')
client=pathlib.Path(__file__).resolve().parent.parent
world=client/'.build/emulator-link'
hdc='D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe'
bundle='local.dsh.mobile.offlineproduct'
def call(args):
 p=subprocess.run([hdc,'-p','-s','127.0.0.1:8710','-t','127.0.0.1:5555',*args],capture_output=True,timeout=60)
 try:out=p.stdout.decode('utf-8')
 except UnicodeDecodeError:out=p.stdout.decode('gb18030')
 if p.returncode or '[Fail]' in out or '[Error]' in out:raise RuntimeError(out[:400])
 return out.strip()
def shell(*args):return call(['shell',' '.join(shlex.quote(str(v)) for v in args)])
def layout():
 path='/data/local/tmp/dsh-emulator-link-layout.json'
 shell('uitest','dumpLayout','-b',bundle,'-p',path)
 tree=json.loads(shell('cat',path));nodes=[]
 def walk(n):
  if isinstance(n,dict):
   if 'attributes' in n:nodes.append(n['attributes'])
   for v in n.values():walk(v)
  elif isinstance(n,list):
   for v in n:walk(v)
 walk(tree);return nodes
def select(key,value):
 nodes=[n for n in layout() if n.get(key)==value and n.get('visible')=='true' and n.get('enabled')=='true']
 if len(nodes)!=1:raise RuntimeError('Expected one enabled visible '+key+'='+value+', found '+str(len(nodes)))
 b=[int(v) for v in re.findall(r'\d+',nodes[0]['bounds'])];return (b[0]+b[2])//2,(b[1]+b[3])//2
mode=sys.argv[1]
if mode in ['offer','confirm','status','test-session','binding','connect']:
 operation={'offer':'offer','confirm':'confirm','status':'status','test-session':'create-test-session','binding':'binding','connect':'connect'}[mode]
 v={'seq':int(time.time()*1000),'operation':operation}
 if mode=='offer':v['phone']=json.loads((world/'phone-public.json').read_text(encoding='utf-8'))
 if mode=='confirm':v['reply']=json.loads((world/'phone-reply.json').read_text(encoding='utf-8'))
 p=world/'request.json';tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(v),encoding='utf-8');tmp.replace(p)
 deadline=time.monotonic()+30
 while time.monotonic()<deadline:
  try:r=json.loads((world/'response.json').read_text(encoding='utf-8'))
  except (FileNotFoundError,ValueError):time.sleep(.2);continue
  if r['seq']==v['seq']:
   if not r['ok']:raise RuntimeError(r['error'])
   if mode in ['offer','confirm','binding']:(world/('offer.json' if mode=='offer' else 'binding.json')).write_text(json.dumps(r['value']),encoding='utf-8')
   print(json.dumps({'operation':operation,'state':r['state'],'ok':True,'value':r['value'] if mode not in ['offer','confirm','binding'] else '[public JSON saved]'},ensure_ascii=False));break
  time.sleep(.2)
 else:raise RuntimeError('Desktop response timed out')
elif mode=='layout':
 for n in layout():
  if n.get('visible')=='true' and (n.get('text') or n.get('hint') or n.get('id')):
   d={k:n.get(k) for k in ['id','type','text','hint','enabled','bounds']}
   if 'publicSpki' in (d.get('text') or '') or 'PublicSpki' in (d.get('text') or ''):d['text']='[public JSON]'
   print(json.dumps(d,ensure_ascii=False))
elif mode=='click':
 x,y=select(sys.argv[2],sys.argv[3]);print(shell('uitest','uiInput','click',x,y))
elif mode=='check':
 nodes=layout();labels=[n for n in nodes if n.get('text')==sys.argv[2] and n.get('visible')=='true'];assert len(labels)==1
 lb=[int(v) for v in re.findall(r'\d+',labels[0]['bounds'])];matched=[]
 for n in nodes:
  if n.get('type')!='Checkbox' or n.get('visible')!='true':continue
  b=[int(v) for v in re.findall(r'\d+',n['bounds'])];cy=(b[1]+b[3])//2
  if lb[1]-30<=cy<=lb[3]+30:matched.append((n,(b[0]+b[2])//2,cy))
 assert len(matched)==1
 n,x,y=matched[0];print('Already checked' if n.get('checked')=='true' else shell('uitest','uiInput','click',x,y))
elif mode=='scroll':
 direction=sys.argv[2]
 print(shell('uitest','uiInput','swipe',1290,2400 if direction=='down' else 800,1290,800 if direction=='down' else 2400,600))
elif mode=='text':
 x,y=select('hint',sys.argv[2]);value=pathlib.Path(sys.argv[3]).read_text(encoding='utf-8') if sys.argv[3].endswith('.json') else sys.argv[3]
 print(shell('uitest','uiInput','inputText',x,y,value))
elif mode=='clear':
 x,y=select('hint',sys.argv[2]);shell('uitest','uiInput','click',x,y)
 print(shell('uitest','uiInput','keyEvent',2072,2017));print(shell('uitest','uiInput','keyEvent',2055))
elif mode=='verify-draft':
 values=[n.get('text','') for n in layout() if n.get('id')=='product-composer']
 assert values==[sys.argv[2]],'Draft differs from the intended complete message; nothing sent'
 print('Complete draft matches; no message sent')
elif mode=='extract':
 found=[]
 for n in layout():
  try:v=json.loads(n.get('text',''))
  except (ValueError,TypeError):continue
  if not isinstance(v,dict):continue
  wanted=v.get('schema')=='harmony-device-binding-reply/1' if sys.argv[2]=='phone-reply.json' else v.get('identityAlias')=='dsh-emulator'
  if isinstance(v,dict) and wanted:found.append(v)
 if len(found)!=1:raise RuntimeError('Expected one public identity/reply; found '+str(len(found)))
 path=world/sys.argv[2];path.write_text(json.dumps(found[0],ensure_ascii=False)+'\n',encoding='utf-8');print('Saved public JSON to',path.name)
elif mode=='verify-offer':
 v=json.loads((world/'offer.json').read_text(encoding='utf-8'));nodes=layout()
 inputs=[json.loads(n['text']) for n in nodes if n.get('hint')=='桌面公开挑战 JSON']
 assert inputs==[v],'Shown offer differs from task-owned desktop offer'
 texts={n.get('text') for n in nodes}
 assert v['registration']['desktopCredentialId'] in texts and v['registration']['credentialId'] in texts
 assert v['registration']['identityAlias']=='dsh-emulator' and v['registration']['audience']=='localhost'
 print('Exact offer and both public fingerprints match')
elif mode=='offer-input':
 v=json.loads((world/'offer.json').read_text(encoding='utf-8'))
 for n in layout():
  if n.get('hint')=='桌面公开挑战 JSON':
   raw=n['text'];(world/'observed-offer.txt').write_text(raw,encoding='utf-8')
   try:d=json.loads(raw);print(json.dumps({'length':len(raw),'matches':d==v}))
   except ValueError as error:print(json.dumps({'length':len(raw),'error':str(error),'around':raw[max(0,error.pos-40):error.pos+40]}))
elif mode=='verify-binding':
 v=json.loads((world/'binding.json').read_text(encoding='utf-8'));nodes=layout()
 values=[json.loads(n['text']) for n in nodes if n.get('hint')=='公开配对配置']
 assert values==[v],'Shown binding differs from verified desktop binding'
 assert v['identityAlias']=='dsh-emulator' and v['scope']=={'kind':'all-visible-sessions','profileId':'desktop'}
 texts={n.get('text') for n in nodes};assert v['desktopCredentialId'] in texts and v['credentialId'] in texts
 print('Exact independent binding, scope and public fingerprints match')
elif mode=='install':
 hap=client/'.build/native-controls-emulator-local/entry/build/default/outputs/default/entry-default-unsigned.hap'
 print(call(['install','-r',str(hap)]));print(shell('aa','start','-b',bundle,'-m','entry','-a','EntryAbility'))
elif mode=='forward':print(call(['rport','tcp:18081','tcp:17847']))
elif mode=='request':
 v=json.loads(sys.argv[2]);p=world/'request.json';tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(v),encoding='utf-8');tmp.replace(p)
 deadline=time.monotonic()+30
 while time.monotonic()<deadline:
  try:r=json.loads((world/'response.json').read_text(encoding='utf-8'))
  except (FileNotFoundError,ValueError):time.sleep(.2);continue
  if r['seq']==v['seq']:print(json.dumps(r,ensure_ascii=False));break
  time.sleep(.2)
 else:raise RuntimeError('Desktop response timed out')
elif mode=='shot':
 path='/data/local/tmp/dsh-emulator-link.png';shell('snapshot_display','-f',path);print(call(['file','recv',path,str(world/sys.argv[2])]))
elif mode=='log':
 pid=shell('pidof',bundle);assert pid.isdigit()
 raw=shell('hilog','-P',pid,'-x');lines=[l for l in raw.splitlines() if re.search(r'DSH_(CONNECTION|CONTROL|E2E|HUKS|AUTOCONNECT)',l)]
 (world/'native-connect.log').write_text('\n'.join(lines)+'\n',encoding='utf-8');print('\n'.join(lines[-65:]))
elif mode=='restart':
 print(shell('aa','force-stop',bundle));print(shell('aa','start','-b',bundle,'-m','entry','-a','EntryAbility'))
elif mode=='verify-messages':
 nodes=layout();texts=[n.get('text','') for n in nodes]
 result={'at':time.time(),'connected':'已连接电脑' in texts,'desktopMarkerNodes':sum('DESKTOP_LINK_OK_1102' in t for t in texts),'emulatorMarkerNodes':sum('EMULATOR_LINK_OK_1102' in t for t in texts),'completed':any(n.get('id')=='dsh-task-state' and n.get('text')=='已完成' for n in nodes),'errorVisible':any(n.get('id')=='product-error' and n.get('visible')=='true' for n in nodes),'draftEmpty':all(n.get('text','')=='' for n in nodes if n.get('id')=='product-composer')}
 result['passed']=result['connected'] and result['completed'] and not result['errorVisible'] and result['desktopMarkerNodes']==2 and result['emulatorMarkerNodes']==2
 path=world/(sys.argv[2] if len(sys.argv)>2 else 'message-validation.json');path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
 assert result['passed'],result
elif mode=='observe-stability':
 nodes=layout();texts=[n.get('text','') for n in nodes]
 result={'at':time.time(),'pid':shell('pidof',bundle),'connected':'已连接电脑' in texts,'conversationOpen':any(n.get('id')=='product-composer' and n.get('visible')=='true' for n in nodes),'composerEnabled':any(n.get('id')=='product-composer' and n.get('enabled')=='true' for n in nodes),'task':[n.get('text') for n in nodes if n.get('id')=='dsh-task-state'],'errors':[t for t in texts if t.startswith('错误代码：')],'draftEmpty':all(n.get('text','')=='' for n in nodes if n.get('id')=='product-composer'),'markers':{key:sum(key in t for t in texts) for key in ['EMULATOR_STABLE_START_1102','EMULATOR_STABLE_AFTER_1102','DESKTOP_STABLE_AFTER_1102','EMULATOR_FINAL_OK_1102','CREATE_STABLE_OK_1102']}}
 path=client/'.build/emulator-stability/live-observations.jsonl';path.parent.mkdir(parents=True,exist_ok=True)
 with path.open('a',encoding='utf-8') as output:output.write(json.dumps(result,ensure_ascii=False)+'\n')
 print(json.dumps(result,ensure_ascii=False))
else:raise RuntimeError('Unknown operation')
