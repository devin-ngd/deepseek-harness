/** Exclusive per-window action journal; construction does not create a directory or open a device. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** @param {string} directory - Caller-created private directory for this one approved window. @returns {object} Async journal. Failed writes stop dependent actions; existing claims are never removed or reused. */
export function mvpMessageJournal(directory) {
  let observation = 0
  const write = (name, value) => writeFile(join(directory, name), JSON.stringify(value) + '\n', { flag: 'wx' })
  const action = key => { if (!['send1', 'send2', 'stop'].includes(key)) throw Error('invalid MVP action'); return key }
  return {
    begin: plan => write('flow.claim.json', { state: 'started-not-sent', plan }),
    claim: key => write(action(key) + '.issuing.json', { state: 'issuing-outcome-unknown' }),
    issued: key => write(action(key) + '.issued.json', { state: 'UI-click-acknowledged-not-model-acceptance' }),
    observe: value => write('observation-' + ++observation + '.json', value),
    complete: value => write('complete.json', value),
  }
}
