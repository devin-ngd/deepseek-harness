/** Dependency-injected prewindow readiness; importing this module performs no SDK or network action. */
import {NativeAcceptanceFailure,retryNativeRead} from './native-window-policy.mjs'
import {startNativeReplayApp} from './native-app-startup.mjs'

/** @param ports - owned SDK/status/layout callers. @param policy - explicit bounded preparation lifetime and confirmed HAP identity. @returns a readiness record only after normal startup, private document readiness and actual foreground controls. */
export async function prepareNativeReadiness(ports,policy){
  if(policy.forwardExists)throw new NativeAcceptanceFailure('preparation-must-precede-forward')
  const retries=[]
  const read=operation=>retryNativeRead(operation,{attempts:3,pauseMs:policy.pauseMs,budget:policy.budget,sleep:ports.sleep},row=>retries.push(row))
  await startNativeReplayApp(ports.device,policy.hapPath)
  const pid=await read(async()=>{
    const value=(await ports.device('shell','pidof','local.dsh.mobile.netreplay')).trim()
    if(value==='')throw new NativeAcceptanceFailure('app-not-yet-running','retry-read')
    if(!/^[1-9]\d*$/.test(value))throw new NativeAcceptanceFailure('app-pid-ambiguous')
    return Number(value)
  })
  await read(async()=>{if(!(await ports.appLog(pid)).includes('DSH native core ready'))throw new NativeAcceptanceFailure('native-document-not-yet-ready','retry-read')})
  const layout=await read(()=>ports.appLayout())
  const nodes=[];const visit=value=>{for(const node of value){nodes.push(node);if(node.children)visit(node.children)}};visit(layout)
  const root=nodes.find(node=>node.attributes?.bundleName==='local.dsh.mobile.netreplay'),connect=nodes.filter(node=>node.attributes?.id==='dsh-acceptance-connect')
  if(!root||root.attributes.visible!=='true'||connect.length!==1||connect[0].attributes.visible!=='true'||connect[0].attributes.enabled!=='true'||connect[0].attributes.type!=='Button')throw new NativeAcceptanceFailure('screen-or-foreground-not-ready','block')
  const status=await read(()=>ports.serviceStatus())
  if(!status.ready||status.counts.realCalls!==0||status.uploadCalls!==0||status.promptCalls!==0||status.counts.replay[0]?.calls!==0||status.counts.replay[0]?.expectedCalls!==4||status.serviceRemainingMs<1380000)throw new NativeAcceptanceFailure('service-prewindow-not-ready','block')
  return{schema:'native-prewindow-ready/1',checkedAt:new Date(ports.wall()).toISOString(),target:policy.target,hapSha256:policy.hapSha256,api:26,appPid:pid,coreReady:true,appForeground:true,screenReady:true,connectControlReady:true,serviceStatus:status,retries,settingsChanged:false,authenticationAttempted:false,forwardCreated:false}
}
