/** Test carrier for the real chat composition, using the shipped native rich bridge. */
import { contextBridge } from 'electron'
import { createDesktopRichBridge } from '../../src/preload-rich-owner.ts'
contextBridge.exposeInMainWorld('dshDesktop', { protocolVersion: 1, rich: createDesktopRichBridge() })
