/** Explicit emulator acceptance entry: real fixed-replay BFF through native private bytes; no mock service or browser fetch. */
import { bindNativeDocument } from './native-document.ts'
import { nativeReplayBootstrap } from './native-replay-policy.ts'

bindNativeDocument(nativeReplayBootstrap)
