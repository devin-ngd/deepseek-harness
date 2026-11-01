/** Read-only acceptance polling. Connecting is never a failure; a bounded observation timeout is not an application terminal result. */
export async function waitForConnectionTerminal(observe, {clock, deadline, maxObservations}) {
 if(typeof observe!=='function'||typeof clock!=='function'||!Number.isSafeInteger(deadline)||!Number.isSafeInteger(maxObservations)||maxObservations<1)throw Error('connection observation policy denied')
 let connectingSeen=false,last
 for(let count=1;count<=maxObservations;count++){
  if(clock()>=deadline)return {outcome:'observation-timeout',observations:count-1,last}
  last=await observe()
  if(!['connecting','connected','disconnected','blocked','closed'].includes(last.state))throw Error('connection observation state denied')
  if(last.state==='connected')return {outcome:'connected',observations:count,last}
  if(last.state==='connecting')connectingSeen=true
  else if(last.state==='blocked'||last.state==='closed'||last.diagnostic!==undefined||connectingSeen)return {outcome:'failed',observations:count,last}
 }
 return {outcome:'observation-timeout',observations:maxObservations,last}
}
