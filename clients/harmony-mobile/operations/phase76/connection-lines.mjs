/** Extract bounded content-free native connection markers; raw messages, endpoints and capability material are never returned. */
export function connectionMarkers(raw) {
  const records = []
  for (const line of raw.split(/\r?\n/)) {
    const stage = /(?:^|\s)DSH_CONNECTION_STAGE=(phone|desktop)-(control|data)-(dial-started|dial-returned|http-upgraded|first-frame|authentication-deadline|socket-closed)(?=$|\s)/.exec(line)
    const failure = /(?:^|\s)DSH_CONNECTION_FAILURE=(phone|desktop)-(control|data)-socket-error code=(-?\d{1,10})(?: http=([1-5][0-9]{2}|0))?(?=$|\s)/.exec(line)
    if (stage) records.push({ role: stage[1], plane: stage[2], stage: stage[3] })
    else if (failure) records.push({ role: failure[1], plane: failure[2], stage: 'socket-error', code: Number(failure[3]), ...(failure[4] === undefined ? {} : { httpStatus: Number(failure[4]) }) })
    if (records.length > 64) records.shift()
  }
  return records
}
