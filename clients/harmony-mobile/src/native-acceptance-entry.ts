/** Compiled-only acceptance face. App installation/start still requires a new explicit bounded approval. */
import { bindNativeDocument } from './native-document.ts'
import { nativeReplayBootstrap } from './native-replay-policy.ts'
import { observeNativeGeneration } from './native-acceptance-probe.ts'

bindNativeDocument(raw => nativeReplayBootstrap(raw,observeNativeGeneration))
