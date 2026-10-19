/** Source-linked rich-inline definitions; scripts/check.mjs resolves the existing checkout. */
export type {
  RichActionStatus, RichDraft, RichInvokeRequest, RichMountValue,
  RichReceipt, RichSaveDraftRequest, RichSnapshot, RichValues,
  RichMountRequest, RichActionRequest, RichMountRequestId,
} from '@deepseek-ai/dsh-experimental-rich-inline/types'
export {
  isRichJson, parseActionRequest, parseInvokeRequest, parseSaveDraftRequest,
} from '@deepseek-ai/dsh-experimental-rich-inline/validate'
export type { Branded } from '@deepseek-ai/dsh-brand'
export type { JsonValue } from '@deepseek-ai/dsh-util-values'
export type {
  SessionPromptRequest, SessionPromptValue, SessionCancelRequest, SessionCancelValue,
  SessionFollowRequest, SessionFollowFrame, SessionWireEvent, SessionEventEntry,
  SessionAssistantStreamFrame, SessionRequestId,
} from '@deepseek-ai/dsh-api-session-controller/types'
