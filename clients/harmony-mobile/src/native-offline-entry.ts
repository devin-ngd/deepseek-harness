/** Offline HAP bootstrap selects synthetic services only; no network provider is imported. */
import { bindNativeDocument } from './native-document.ts'
import { NativeOfflineHost } from './native-host.ts'
import { nativeBootstrapPolicy } from './native-policy.ts'
bindNativeDocument(raw => { const policy = nativeBootstrapPolicy(raw); return { policy, create: (io, frame, publish) => new NativeOfflineHost(io, policy, publish, frame) } })
