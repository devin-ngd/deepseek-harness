/** HDC UI adapter for an already reviewed original phone; import and construction perform no IO. */
import { assessLayout, targetReference } from '../scripts/connection-deployment-lib.mjs'
import { mvpInputArgs } from './mvp-message-flow.mjs'

/**
 * @param {object} options - Bound HDC port, original target/ref, bundle, unique dump prefix, clock and cancellable polling pause.
 * @returns {object} Serial observe/click/input/scroll port; no discovery, service start, connection, installation or retry. The caller owns the HDC command timeout and window deadline.
 */
export function createMvpMessagePhonePort({ hdc, target, targetRef, bundle, dumpPrefix, clock, pause }) {
  if (!/^[A-Za-z0-9_.:-]+$/.test(target) || targetReference(target) !== targetRef || !/^[A-Za-z0-9_.]+$/.test(bundle) || !/^\/data\/local\/tmp\/[A-Za-z0-9_-]{8,80}$/.test(dumpPrefix)) throw Error('invalid MVP phone port target')
  let sequence = 0
  const own = (args, signal) => hdc.run(['-t', target, 'shell', ...args], signal)
  const points = (value, length) => { if (value.length !== length || !value.every(x => /^[0-9]+$/.test(x))) throw Error('invalid MVP UI coordinates'); return value }
  return {
    async observe(signal) {
      const number = ++sequence, pid = (await own(['pidof', bundle], signal)).trim(), faces = []
      if (!/^[1-9][0-9]*$/.test(pid)) throw Error('MVP phone process unavailable')
      const observedAt = clock()
      for (const coverage of ['complete', 'viewport']) {
        const path = dumpPrefix + '-' + number + '-' + coverage + '.json'
        let raw
        try {
          const saved = await own(['uitest', 'dumpLayout', '-b', bundle, ...(coverage === 'complete' ? ['-i'] : ['-m', 'false']), '-p', path], signal)
          if (saved.trim() !== 'DumpLayout saved to:' + path) throw Error('MVP phone layout unavailable')
          raw = await own(['cat', path], signal)
        } finally { await own(['rm', path]) }
        faces.push(assessLayout(JSON.parse(raw), { bundle, coverage }))
      }
      if ((await own(['pidof', bundle], signal)).trim() !== pid) throw Error('MVP phone process changed during observation')
      const [complete, viewport] = faces
      return { pid, window: complete.nodes.find(n => n.type === 'root')?.hostWindowId, sequence: number, observedAt, complete, viewport }
    },
    click: (point, signal) => own(['uitest', 'uiInput', 'click', ...points(point, 2)], signal),
    input: (point, text, signal) => hdc.run(mvpInputArgs(target, point, text), signal),
    scroll: (gesture, signal) => own(['uitest', 'uiInput', 'swipe', ...points(gesture, 4), '500'], signal),
    pause,
  }
}
