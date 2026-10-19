/** Admission safety tests use synthetic service ports; disk qualification lives in the source Loader tests. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { MemoryAdmissionJournal } from '../.build/admission-journal.js'
import { RestrictedDesktopAdapter } from '../.build/desktop-adapter.js'
import { createLinkLab } from './helpers/link-lab.mjs'

test('failed journal claim stops dispatch before the canonical prompt call', async () => {
  const journal = new MemoryAdmissionJournal(4)
  const fault = { claim: async () => { throw new Error('FIXED_CLAIM_WRITE_FAILURE') },
    get: (...args) => journal.get(...args), accept: record => journal.accept(record) }
  const lab = createLinkLab({ journal: fault })
  try {
    await assert.rejects(lab.phone.request('task.submit', { sessionId: lab.sid, requestId: 'write-failure', text: 'Synthetic only' }), /FIXED_CLAIM_WRITE_FAILURE/)
    assert.equal(lab.host.promptCalls, 0)
    assert.equal(lab.host.desktop.admittedTasks, 0)
  } finally { await lab.close() }
})

test('replacing the adapter retains accepted admission without a second prompt call', async () => {
  const journal = new MemoryAdmissionJournal(4), lab = createLinkLab({ journal })
  let replacement
  try {
    const payload = { sessionId: lab.sid, requestId: 'retained-admission', text: 'Synthetic only' }
    const original = await lab.phone.request('task.submit', payload)
    lab.relay.detachDesktop(); await lab.adapter.close()
    replacement = new RestrictedDesktopAdapter(lab.peer.desktopId, lab.host, lab.registry, lab.adapter.config, journal)
    lab.relay.attachDesktop(replacement)
    assert.deepEqual(await lab.phone.request('task.submit', payload), original)
    assert.equal(lab.host.promptCalls, 1)
    await assert.rejects(lab.phone.request('task.submit', { ...payload, text: 'Changed after restart' }), error => error.code === 'id-conflict')
    const foreign = lab.addPhone('other-phone')
    await assert.rejects(foreign.request('task.submit', payload), error => error.code === 'scope-denied')
  } finally { await replacement?.close(); await lab.close() }
})

test('replacing an adapter with an uncertain claim never redispatches when evidence is absent', async () => {
  const journal = new MemoryAdmissionJournal(4), lab = createLinkLab({ journal, beforePrompt: async () => { throw new Error('FIXED_PRE_ADMISSION_FAILURE') } })
  let replacement
  try {
    const payload = { sessionId: lab.sid, requestId: 'uncertain-admission', text: 'Synthetic only' }
    await assert.rejects(lab.phone.request('task.submit', payload), error => error.code === 'unknown-outcome')
    lab.relay.detachDesktop(); await lab.adapter.close()
    replacement = new RestrictedDesktopAdapter(lab.peer.desktopId, lab.host, lab.registry, lab.adapter.config, journal)
    lab.relay.attachDesktop(replacement)
    assert.deepEqual(await lab.phone.request('task.submit', payload), { accepted: false, state: 'unknown', requestId: payload.requestId })
    assert.equal(lab.host.promptCalls, 1)
    assert.equal(lab.host.desktop.admittedTasks, 0)
  } finally { await replacement?.close(); await lab.close() }
})
