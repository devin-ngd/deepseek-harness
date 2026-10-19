/** Type-only compatibility check against existing Service Definitions; creates no Context or live binding. */
import type SessionController from '@deepseek-ai/dsh-api-session-controller'
import type RichInline from '@deepseek-ai/dsh-experimental-rich-inline'
import type { DesktopServicePorts } from '../src/desktop-adapter.ts'

type Fits<Value extends true> = Value
/** Canonical Session methods remain directly assignable, including cancellation and follow signals. */
export type ProfileSessionPortCompatibility = Fits<(
  Pick<SessionController, 'prompt' | 'cancel' | 'follow'> extends Pick<DesktopServicePorts['session'], 'prompt' | 'cancel' | 'follow'> ? true : false
)>
/** Canonical rich ownership and request/receipt types remain directly assignable; dispose is explicitly awaited by the adapter. */
export type ProfileRichPortCompatibility = Fits<(
  Pick<RichInline, 'mount' | 'snapshot' | 'saveDraft' | 'invoke' | 'status'> extends Pick<DesktopServicePorts['rich'], 'mount' | 'snapshot' | 'saveDraft' | 'invoke' | 'status'> ? true : false
)>
