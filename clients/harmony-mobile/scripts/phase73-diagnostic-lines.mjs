/** Retain at most64 fixed native handshake/SDK facts; raw payloads, endpoints and exception messages are omitted. */
export function handshakeMarkers(raw){
  const stages='relay-ready|peer-hello|keys-derived|finished-sent|peer-verified|frame-budget-rejected|handshake-deadline|closed|failure-(?:ready|hello|finished|data):(?:invalid|key-invalid|signature-denied|not-ready|sequence|capacity|closed|decrypt-failed|format|unexpected)',result=[]
  const e2e=new RegExp('(?:^|\\s)DSH_E2E_STAGE=phone-('+stages+')(?=$|\\s)'),crypto=/(?:^|\s)DSH_CRYPTO_STAGE=(agreement-peer-import|agreement-create|agreement-derive|agreement-derived)(?=$|\s)/,failure=/(?:^|\s)DSH_CRYPTO_FAILURE=agreement code=(-?\d{1,10})(?=$|\s)/
  for(const line of raw.split(/\r?\n/)){const stage=e2e.exec(line),sdk=crypto.exec(line),error=failure.exec(line);if(stage)result.push({owner:'phone-e2e',stage:stage[1]});else if(sdk)result.push({owner:'phone-crypto',stage:sdk[1]});else if(error)result.push({owner:'phone-crypto',stage:'agreement-failed',code:Number(error[1])});if(result.length>64)result.shift()}
  return result
}
