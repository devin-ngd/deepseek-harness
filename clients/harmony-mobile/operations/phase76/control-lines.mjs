/** Parse bounded fixed native/desktop control facts; payloads, identifiers and arbitrary exception text never enter the result. */
export function controlMarkers(raw) {
  const phases = 'frame-received|frame-decoded|challenge-validated|identity-validated|sign-started|sign-completed|proof-queued|room-validated|challenge-deadline|trust-deadline|closed|failure-(?:wire|decode|challenge|identity|sign|send|room):(?:format|refused)'
  const control = new RegExp('(?:^|\\s)DSH_CONTROL_STAGE=(phone|desktop)-(' + phases + ') at=(\\d{13})(?=$|\\s)'), io = /(?:^|\s)DSH_CONTROL_IO=phone-(send-started|send-completed|send-failed|receive-failed)(?: code=(-?\d{1,10}))? at=(\d{13})(?=$|\s)/, huks = /(?:^|\s)DSH_HUKS_SIGN_STAGE=(init|update|finish|abort|verify-public-signature|signature-verified) at=(\d{13})(?=$|\s)/, refused = /(?:^|\s)DSH_HUKS_SIGN_REFUSED stage=(init|update|finish|abort|verify-public-signature) code=(unavailable|-?\d{1,10}) at=(\d{13})(?=$|\s)/, socket = /(?:^|\s)DSH_CONNECTION_STAGE=(phone|desktop)-(control|data)-(dial-started|dial-returned|http-upgraded|first-frame|authentication-deadline|socket-closed|message-error|message-budget-rejected) at=(\d{13})(?=$|\s)/, result = []
  for (const line of raw.split(/\r?\n/)) {
    const stage = control.exec(line), native = io.exec(line), key = huks.exec(line), failure = refused.exec(line), connection = socket.exec(line)
    if (stage) result.push({ owner: stage[1] + '-control', stage: stage[2], at: Number(stage[3]) })
    else if (native) result.push({ owner: 'phone-control-io', stage: native[1], at: Number(native[3]), ...(native[2] === undefined ? {} : { code: Number(native[2]) }) })
    else if (key) result.push({ owner: 'phone-huks', stage: key[1], at: Number(key[2]) })
    else if (failure) result.push({ owner: 'phone-huks', stage: 'refused-' + failure[1], at: Number(failure[3]), code: failure[2] === 'unavailable' ? 'unavailable' : Number(failure[2]) })
    else if (connection) result.push({ owner: connection[1] + '-' + connection[2] + '-socket', stage: connection[3], at: Number(connection[4]) })
    if (result.length > 128) result.shift()
  }
  return result
}
