/** Immutable diagnostic snapshots avoid replacing a file while a Windows status reader holds it. */
import { writeFile, link, unlink } from 'node:fs/promises'
import { join } from 'node:path'

/** One sequential writer per isolated fixture directory; published snapshots remain available to readers. */
export class WorkspaceLivePublisher {
  private sequence = 0
  private previous: string | undefined
  /** @param directory - the fixture's unique, existing output directory. */
  constructor(private readonly directory: string) {}
  /** @param responses - observed replay calls. @param errors - accumulated fixture failures. @returns after publishing a complete snapshot when either value changes. */
  async publish(responses: number, errors: readonly string[]): Promise<void> {
    const state = JSON.stringify({ responses, errors })
    if (state === this.previous) return
    const suffix = String(++this.sequence).padStart(6, '0')
    const temporary = join(this.directory, 'live-next-' + suffix + '.json'), destination = join(this.directory, 'live-' + suffix + '.json')
    await writeFile(temporary, JSON.stringify({ responses, errors, at: new Date().toISOString() }) + '\n', { flag: 'wx' })
    await link(temporary, destination)
    await unlink(temporary)
    this.previous = state
  }
}
