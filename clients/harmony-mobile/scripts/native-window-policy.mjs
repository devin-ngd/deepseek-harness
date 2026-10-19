/** Finite acceptance policy; no SDK, filesystem mutation, listener, credential or device operation exists here. */
/** Structured failures separate retryable observations from unsafe or unknown effects. */
export class NativeAcceptanceFailure extends Error {
  /** @param code - stable local identity. @param disposition - allowed continuation. @param options - retained local cause. */
  constructor(code,disposition='stop',options){super(code,options);this.code=code;this.disposition=disposition}
}
/** @param expected - exact source-owned checkpoint text. @param ports - scoped layout/swipe/sleep callers. @param policy - finite scroll count and original window budget. @returns exact native Text evidence; wrong or absent text never qualifies. */
export async function observeNativeCheckpointText(expected,ports,policy){
  if(typeof expected!=='string'||!expected.startsWith('DSH read checkpoint ')||expected.length>256||!Number.isSafeInteger(policy.maxScrolls)||policy.maxScrolls<0||policy.maxScrolls>4)throw new NativeAcceptanceFailure('checkpoint-observation-config-invalid')
  for(let scrolls=0;;scrolls++){
    policy.budget.requireTime()
    const nodes=await ports.layout(),found=nodes.find(node=>node.attributes.type==='Text'&&(node.attributes.text===expected||node.attributes.originalText===expected))
    if(found)return{attributes:found.attributes,scrolls}
    if(scrolls>=policy.maxScrolls)throw new NativeAcceptanceFailure('checkpoint-text-not-observed','case-observation')
    const lists=nodes.filter(node=>node.attributes.type==='List'&&node.attributes.visible==='true'&&node.attributes.enabled==='true'&&node.attributes.scrollable==='true')
    if(lists.length!==1)throw new NativeAcceptanceFailure('checkpoint-list-not-confirmed','case-observation')
    const match=/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(lists[0].attributes.bounds)
    if(!match)throw new NativeAcceptanceFailure('checkpoint-list-bounds-invalid','case-observation')
    const[left,top,right,bottom]=match.slice(1).map(Number)
    if(right-left<60||bottom-top<120)throw new NativeAcceptanceFailure('checkpoint-list-bounds-invalid','case-observation')
    await ports.swipe(Math.floor((left+right)/2),bottom-30,Math.floor((left+right)/2),top+30)
    await ports.sleep(policy.pauseMs)
  }
}
/** @param output - SDK diagnostic text, never an instruction. @param readOnly - whether repetition has no application effect. @returns a stable failure; lock/permission/authentication cannot trigger a settings change. */
export function sdkFailure(output,readOnly){
  if(/10106102|screen is locked|screen locked/i.test(output))return new NativeAcceptanceFailure('screen-not-ready','block')
  if(/permission denied|authentication|unauthorized|(?:Error Code|code)\s*[:=]\s*201\b/i.test(output))return new NativeAcceptanceFailure('permission-or-authentication-required','block')
  if(readOnly&&/target.*(?:offline|not found|not connected)|no target|connection (?:lost|closed|refused)|device.*offline/i.test(output))return new NativeAcceptanceFailure('read-transport-unavailable','retry-read')
  return new NativeAcceptanceFailure(readOnly?'sdk-read-failed':'sdk-effect-outcome-unknown',readOnly?'stop':'reconcile')
}
/** Anchors both UTC and monotonic limits. Recreating a step or changing the wall clock cannot extend a driver's persisted deadline. */
export class NativeWindowClock {
  /** @param lease - original forward timestamps. @param anchor - create-only driver anchor. @param clock - explicit wall/monotonic functions. */
  constructor(lease,anchor,clock){
    const started=Date.parse(lease.startedAt),expires=Date.parse(lease.expiresAt),cleanup=Date.parse(lease.cleanupAt),driver=Date.parse(anchor.startedAt),deadline=Date.parse(anchor.deadline)
    if(![started,expires,cleanup,driver,deadline].every(Number.isFinite)||lease.maximumMs!==1800000||expires-started!==1800000||cleanup!==expires-180000||anchor.leaseStartedAt!==lease.startedAt||deadline!==Math.min(cleanup,driver+1200000))throw new NativeAcceptanceFailure('window-anchor-invalid')
    this.clock=clock;this.deadline=deadline;this.monoDeadline=clock.monotonic()+Math.max(0,deadline-clock.wall())
  }
  /** @returns bounded remaining scenario time; zero stops dependent work while cleanup remains permitted. */
  remaining(){return Math.max(0,Math.min(this.deadline-this.clock.wall(),this.monoDeadline-this.clock.monotonic()))}
  /** Reject scenario work after either time limit; this method does not prevent cleanup. */
  requireTime(){if(this.remaining()<=0)throw new NativeAcceptanceFailure('window-deadline')}
}
/** @param originalLease - absent before a first window, or the unchanged resumed lease. @param clock - explicit wall/monotonic functions. @returns a ten-minute preparation budget clipped to the original cleanup reserve; it cannot authorize a forward after either cutoff. */
export function nativePreparationBudget(originalLease,clock){
  const started=clock.wall(),cutoff=originalLease?Date.parse(originalLease.cleanupAt):started+600000
  if(!Number.isFinite(cutoff))throw new NativeAcceptanceFailure('window-anchor-invalid')
  const wallDeadline=Math.min(started+600000,cutoff),monoDeadline=clock.monotonic()+Math.max(0,wallDeadline-started)
  return{requireTime(){if(clock.wall()>=wallDeadline||clock.monotonic()>=monoDeadline)throw new NativeAcceptanceFailure('prewindow-deadline')},wallDeadline,monoDeadline}
}
/** @param operation - read-only SDK/status/artifact observation. @param policy - bounded attempts, pause and time owner. @param record - independent retry evidence sink. @returns the confirmed observation; unknown/safety failures reject without retry. */
export async function retryNativeRead(operation,policy,record){
  if(!Number.isInteger(policy.attempts)||policy.attempts<1||policy.attempts>3)throw new NativeAcceptanceFailure('retry-policy-invalid')
  for(let attempt=1;attempt<=policy.attempts;attempt++){
    policy.budget.requireTime()
    try{return await operation()}catch(error){
      record({attempt,code:error instanceof NativeAcceptanceFailure?error.code:'unexpected',retryable:error instanceof NativeAcceptanceFailure&&error.disposition==='retry-read'})
      if(!(error instanceof NativeAcceptanceFailure)||error.disposition!=='retry-read'||attempt===policy.attempts)throw error
      const pause=Math.min(policy.pauseMs,policy.budget.remaining());if(pause<=0)policy.budget.requireTime();await policy.sleep(pause)
    }
  }
  throw new NativeAcceptanceFailure('retry-policy-invalid')
}
/** @param execute - one scenario with explicit side effects; it is never automatically replayed. @param reconcile - read-only result check after an observation/effect uncertainty. @returns failed/observed/blocked result and whether independent cases may continue. */
export async function reconcileNativeCase(execute,reconcile){
  try{await execute();return{passed:true,continue:true,reconciled:false}}
  catch(error){
    if(!(error instanceof NativeAcceptanceFailure)||!['retry-read','reconcile','case-observation'].includes(error.disposition))return{passed:false,continue:false,error,reconciled:false}
    const evidence=await reconcile(error)
    return{passed:Boolean(evidence.behaviorConfirmed)&&!evidence.proofMissing,continue:evidence.safeToContinue===true,error,reconciled:true,evidence}
  }
}
/** @param cases - independently resettable read-only fault scenarios. @param ports - confirmed isolation reset, one execution and unchanged time budget. @returns every pass/fail/blocked result; a failed case is never replayed or changed to a pass by later recovery. */
export async function runIsolatedNativeCases(cases,ports){
  const results=[],now=ports.now??(()=>new Date().toISOString())
  let blockedBy
  for(const scenario of cases){
    const row={name:scenario.name,began:now(),passed:false,executed:false,status:'blocked'}
    if(blockedBy){results.push({...row,completedAt:now(),error:blockedBy,stage:'blocked'});continue}
    try{ports.budget.requireTime();row.resetEvidence=await ports.reset(scenario)}
    catch(error){blockedBy=error instanceof Error?error.message:'reset-outcome-unknown';results.push({...row,completedAt:now(),error:blockedBy,stage:'reset'});continue}
    try{
      ports.budget.requireTime();row.executed=true;row.evidence=await ports.execute(scenario)
      results.push({...row,completedAt:now(),passed:true,status:'passed',error:null,stage:'observation'})
    }catch(error){
      const code=error instanceof NativeAcceptanceFailure?error.code:error instanceof Error?error.message:'case-outcome-unknown'
      results.push({...row,completedAt:now(),status:row.executed?'failed':'blocked',error:code,stage:'observation'})
      if(error instanceof NativeAcceptanceFailure&&(error.disposition==='block'||['window-deadline','window-anchor-invalid'].includes(error.code)))blockedBy=code
    }
  }
  return{passed:results.length===cases.length&&results.every(row=>row.passed),results}
}
/** @param operations - independent owned cleanup actions. @returns every outcome; one failure never prevents the rest. */
export async function settleNativeCleanup(operations){
  const outcomes=[]
  for(const operation of operations){try{outcomes.push({name:operation.name,ok:true,result:await operation.run()})}catch(error){outcomes.push({name:operation.name,ok:false,error:error instanceof Error?error.message:'unknown'})}}
  return outcomes
}
/** @param state - published private fixture readiness and endpoint. @param acknowledgement - counters acknowledged after that publication. @param sequence - exact requested control id. @returns one live status; stale generations or absent fields fail without repeating a command. */
export function nativeControlStatus(state,acknowledgement,sequence){
  const invalid=()=>new NativeAcceptanceFailure('service-status-not-confirmed')
  if(!state||!acknowledgement||typeof state.ready!=='boolean'||typeof state.url!=='string'||typeof state.sessionId!=='string'||!Number.isSafeInteger(sequence)||acknowledgement.seq!==sequence||typeof state.instance!=='string'||state.instance!==acknowledgement.instance||state.mode!==acknowledgement.mode||!['create','reopen'].includes(acknowledgement.mode))throw invalid()
  let url
  try{url=new URL(state.url)}catch(error){throw invalid()}
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw invalid()
  const count=value=>Number.isSafeInteger(value)&&value>=0,replay=acknowledgement.counts?.replay
  if(!count(acknowledgement.counts?.realCalls)||!count(acknowledgement.promptCalls)||!count(acknowledgement.uploadCalls)||!Array.isArray(replay)||replay.length!==1||!count(replay[0]?.calls)||!count(replay[0]?.expectedCalls)||!count(acknowledgement.carrier?.follows)||!Array.isArray(acknowledgement.faults?.consumed)||!acknowledgement.faults.consumed.every(value=>typeof value==='string'))throw invalid()
  return{...acknowledgement,ready:state.ready,url:state.url,sessionId:state.sessionId,cancelReady:state.cancelReady}
}
/** @param proof - prewindow and live lease evidence. @returns admitted app PID after every precondition is checked; this does not start any resource. */
export function nativeWindowPreconditions(proof){
  const{lease,active,marker,ready,state,now,hapSha}=proof
  const port=Number(new URL(state.url).port),rule='tcp:18081 tcp:'+port
  if(marker.instance!=='DSHOfflineAPI26'||marker.emulatorStartedByTask!==true||marker.verifiedActualProcess!==true||marker.netreplayInitiallyAbsent!==true||!['127.0.0.1:5555','127.0.0.1:16311'].includes(marker.target))throw new NativeAcceptanceFailure('resource-ownership-unverified')
  if(ready.schema!=='native-prewindow-ready/1'||ready.target!==marker.target||ready.hapSha256!==hapSha||ready.api!==26||!ready.coreReady||!ready.appForeground||!ready.screenReady||!ready.connectControlReady||!Number.isSafeInteger(ready.appPid)||ready.appPid<1||now-Date.parse(ready.checkedAt)<0||now-Date.parse(ready.checkedAt)>60000)throw new NativeAcceptanceFailure('prewindow-app-not-ready','block')
  if(lease.rule!==rule||active.rule!==rule||active.active!==true||!active.tasks.includes(marker.target)||!active.tasks.includes(rule))throw new NativeAcceptanceFailure('forward-mapping-unverified')
  const url=new URL(state.url)
  if(url.hostname!=='127.0.0.1'||url.protocol!=='http:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash||!state.ready||state.counts.realCalls!==0||state.uploadCalls!==0||state.counts.replay[0]?.expectedCalls!==4||state.counts.replay[0]?.calls!==0||state.promptCalls!==0||state.serviceRemainingMs<1380000)throw new NativeAcceptanceFailure('prewindow-service-not-ready','block')
  return ready.appPid
}
