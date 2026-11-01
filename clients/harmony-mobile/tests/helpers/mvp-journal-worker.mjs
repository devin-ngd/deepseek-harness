/** Synthetic journal race worker; only writes under the parent-provided temporary test directory. */
import { mvpMessageJournal } from '../../operations/mvp-message-journal.mjs'
try { await mvpMessageJournal(process.argv[2]).begin({ marker: 'synthetic_race' }); process.stdout.write('claimed') }
catch (error) { if (error.code !== 'EEXIST') throw error; process.stdout.write('exists') }
