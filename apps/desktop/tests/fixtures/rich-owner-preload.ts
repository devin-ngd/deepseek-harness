/** Isolated test carrier uses the shipped owner bridge, not a substitute transport. */
import { contextBridge } from 'electron'
import { createDesktopRichBridge } from '../../src/preload-rich-owner.ts'
contextBridge.exposeInMainWorld('testRich', createDesktopRichBridge())
