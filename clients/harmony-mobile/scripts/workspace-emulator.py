"""Operate only the approved task-owned blank API26 emulator; never target an existing paired instance."""
import datetime,json,pathlib,subprocess,sys
sys.stdout.reconfigure(encoding='utf-8')
client=pathlib.Path(__file__).resolve().parent.parent
emulator='D:/Program Files/HuaWei/DevEco Studio/tools/emulator/Emulator.exe'
instance_root=client/'.build/workspace-emulator-instances'
name='DSHWorkspaceReview'
image_root='C:/Users/wpdev/AppData/Local/Huawei/Sdk'
mode=sys.argv[1]
commands={
 'create':['-create',name,'-deviceType','Phone','-osVersion','HarmonyOS 7.0.0(26.0.0)','-instancePath',str(instance_root),'-imageRoot',image_root,'-storage','2','-memory','2','-hotBoot','false'],
 'start':['-start',name,'-instancePath',str(instance_root),'-imageRoot',image_root,'-bootMode','coldboot','-hdcPort','16312','-noWindow'],
 'start-window':['-start',name,'-instancePath',str(instance_root),'-imageRoot',image_root,'-bootMode','coldboot','-hdcPort','16312'],
 'list':['-list','-details','-instancePath',str(instance_root)],
 'stop':['-stop',name,'-instancePath',str(instance_root)],
}
if mode not in commands:raise RuntimeError('Select one explicit emulator operation')
if not str(instance_root.resolve()).startswith(str(client.resolve())+str(pathlib.os.sep)):raise RuntimeError('Task directory required')
if mode=='create':
 if instance_root.exists() and any(instance_root.iterdir()):raise RuntimeError('Existing instance data retained; creation refused')
 instance_root.mkdir(parents=True,exist_ok=True)
record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authorization':'批准安装环境核对与隔离模拟器验收','instance':name,'instanceRoot':str(instance_root),'mode':mode,'args':commands[mode],'target':'127.0.0.1:16312','dailyPairingUsed':False,'physicalDeviceUsed':False,'downloadRequested':False}
visible=mode in ['create','start-window']
run=subprocess.Popen([emulator,*commands[mode]],stdin=subprocess.DEVNULL,stdout=None if visible else subprocess.PIPE,stderr=None if visible else subprocess.STDOUT,creationflags=0 if visible else subprocess.CREATE_NO_WINDOW)
record['pid']=run.pid
label=client/'evidence'/('workspace-emulator-'+mode+'-'+str(int(datetime.datetime.now().timestamp()*1000))+'.json')
label.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'record':str(label),'pid':run.pid,'mode':mode}),flush=True)
output=[]
if run.stdout is not None:
 for line in run.stdout:
  text=line.decode('utf-8',errors='replace');output.append(text);print(text.rstrip(),flush=True)
code=run.wait();record.update({'exitCode':code,'output':''.join(output),'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
if mode=='create':
 record['configCreated']=(instance_root/name/'config.ini').is_file()
 if not record['configCreated']:code=1;record['failure']='instance-config-not-created'
label.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
sys.exit(code)
