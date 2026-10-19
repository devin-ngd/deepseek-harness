/** Finite startup ordering only. Wake precedes launch; a remaining lock or permission failure rejects without settings changes or retries. */
/** @param device - owned SDK command caller. @param hap - previously verified sealed unsigned artifact. @returns after the SDK accepts app launch; this does not establish document readiness or any native scenario. */
export async function startNativeReplayApp(device,hap){
  if((await device('shell','param','get','const.ohos.apiversion')).trim()!=='26')throw Error('Actual emulator API differs')
  await device('install',hap)
  await device('shell','power-shell','wakeup')
  await device('shell','aa','start','-b','local.dsh.mobile.netreplay','-a','EntryAbility')
}
