"""Start/stop only the user-selected existing Mate 90 Pro Max; preserve data and use the explicit local HDC server."""
import datetime,json,pathlib,subprocess,sys,os
sys.stdout.reconfigure(encoding='utf-8')
client=pathlib.Path(__file__).resolve().parent.parent
mode=sys.argv[1]
if mode not in ['start','stop']:raise RuntimeError('Select start or stop')
exe='D:/Program Files/HuaWei/DevEco Studio/tools/emulator/Emulator.exe'
args=['-'+mode,'Mate 90 Pro Max','-instancePath','C:/Users/wpdev/AppData/Local/Huawei/Emulator/deployed']
if mode=='start':args+=['-imageRoot','C:/Users/wpdev/AppData/Local/Huawei/Sdk','-bootMode','coldboot']
env={key:os.environ[key] for key in ['PATH','SystemRoot','WINDIR','ComSpec','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP'] if key in os.environ}
env['HDC_SERVER_PORT']='8710'
record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authorization':'可以试一下重新打开模拟器，我有下载镜像，就用那个 Mate 90 Pro Max','args':args,'hdcServerPort':8710,'globalEnvironmentChanged':False,'resetData':False,'pairingAppStarted':False}
path=client/'evidence'/('workspace-mate-'+mode+'-'+str(int(datetime.datetime.now().timestamp()*1000))+'.json')
process=subprocess.Popen([exe,*args],env=env,stdin=subprocess.DEVNULL)
record['pid']=process.pid;path.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'record':str(path),'pid':process.pid,'mode':mode}),flush=True)
code=process.wait();record.update({'exitCode':code,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()});path.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');sys.exit(code)
