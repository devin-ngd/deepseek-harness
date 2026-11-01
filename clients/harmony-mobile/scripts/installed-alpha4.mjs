/** Historical alpha.4-only public API resolver; current checks use installed-rc2.mjs. */
import { installedHost } from './installed-host.mjs'
/** @param root - dependency locator. @returns fixed historical alpha.4 resolver. */
export const installedAlpha4 = root => installedHost(root, '0.2.1-alpha.4', 'alpha4')
