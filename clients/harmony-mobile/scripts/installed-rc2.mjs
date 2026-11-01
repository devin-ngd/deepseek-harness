/** Resolve the exact installed rc.2 Host and rich-inline without starting or changing the app. */
import { installedHost } from './installed-host.mjs'
/** @param root - dependency locator. @returns fixed rc.2/protocol4 public API resolver. */
export const installedRc2 = root => installedHost(root, '0.2.1-rc.2', 'rc2')
