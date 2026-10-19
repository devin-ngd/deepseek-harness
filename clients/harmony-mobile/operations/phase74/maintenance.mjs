/** Service/proxy activation has a single cleanup owner and reports unknown restoration separately. */
import { PLAN, dropIn, hash, reviewDrop } from './policy.mjs'
const r = PLAN.relay
/** @param io - exact-path file and argv adapter; production uses the original service only. @returns verified restoration, retaining journals and failed/foreign files. */
export async function restoreMaintenance(io) {
  const errors = []
  try {
    if (await io.exists(r.drop)) {
      reviewDrop(await io.read(r.drop)); await io.command('stop')
      await io.moveDrop(); await io.command('daemon-reload'); await io.command('start')
    } else if (await io.activationAttempted()) {
      await io.command('daemon-reload'); await io.command('start')
    }
  } catch (error) { errors.push({ operation: 'service', code: error.code ?? 'restore-unknown' }) }
  try {
    const current = hash(await io.read(r.nginx))
    if (current === r.candidateNginxSha256) {
      if (hash(await io.read(r.run + '/rollback/nginx.before.conf')) !== r.originalNginxSha256) throw new Error('nginx backup changed')
      await io.restoreNginx(); await io.command('nginx-test'); await io.command('nginx-reload')
    } else if (current !== r.originalNginxSha256) throw new Error('foreign nginx configuration')
  } catch (error) { errors.push({ operation: 'nginx', code: error.code ?? 'restore-unknown' }) }
  try { await io.verifyOriginal() } catch (error) { errors.push({ operation: 'verification', code: error.code ?? 'restore-unknown' }) }
  return { restored: errors.length === 0, errors, journalsPreserved: true, credentialRollback: false }
}
/** @param io - exact-path maintenance adapter. @returns activation or a structured failure with independent cleanup outcome; never retries activation. */
export async function activateMaintenance(io) {
  await io.preflight(); await io.markAttempt()
  try {
    await io.installDrop(dropIn()); await io.command('daemon-reload'); await io.command('stop'); await io.command('start')
    await io.verifyCandidate(); await io.installNginx(); await io.command('nginx-test'); await io.command('nginx-reload'); await io.verifyCandidate()
    return { activated: true, cleanup: null }
  } catch (error) {
    const cleanup = await restoreMaintenance(io)
    return { activated: false, error: { code: error.code ?? 'activation-failed' }, cleanup }
  }
}
