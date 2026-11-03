"""Resume the configured local emulator link without replacing pairing or sending messages."""
import pathlib,subprocess,sys,json
sys.stdout.reconfigure(encoding='utf-8')
client=pathlib.Path(__file__).resolve().parent.parent
control=client/'emulator-dev/control.py'
hdc='D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe'
def run(args):
 p=subprocess.run(args,capture_output=True,timeout=45)
 try:out=p.stdout.decode('utf-8')
 except UnicodeDecodeError:out=p.stdout.decode('gb18030')
 if p.returncode or '[Fail]' in out or '[Error]' in out:raise RuntimeError(out[:400])
 return out.strip()
prefix=[hdc,'-p','-s','127.0.0.1:8710','-t','127.0.0.1:5555']
rows=run(prefix+['fport','ls'])
if 'tcp:18081 tcp:17847' not in rows:
 if 'tcp:18081' in rows:raise RuntimeError('Port 18081 is already forwarded elsewhere; retained')
 run(prefix+['rport','tcp:18081','tcp:17847'])
status=json.loads(run([sys.executable,str(control),'status']))
if status['state']=='unpaired':raise RuntimeError('Local emulator pairing has not been completed')
if status['state']=='bound':run([sys.executable,str(control),'connect'])
pid=run(prefix+['shell','pidof local.dsh.mobile.offlineproduct'])
if not pid:run(prefix+['shell','aa start -b local.dsh.mobile.offlineproduct -m entry -a EntryAbility'])
print('Local emulator transport prepared; pairing reused, no model message sent. Check the app connection state.')
