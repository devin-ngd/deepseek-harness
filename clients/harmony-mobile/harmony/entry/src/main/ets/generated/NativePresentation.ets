/** Generated from SemanticPhone and shared MessageWindow(20); no independent ArkTS reducer. */
export class NativeMessage {
  id: string
  role: string
  text: string
  hasRich: boolean
  hasImage: boolean
  imageWidth: number
  imageHeight: number
  constructor(id: string, role: string, text: string, hasRich: boolean, hasImage: boolean, imageWidth: number, imageHeight: number) {
    this.id = id
    this.role = role
    this.text = text
    this.hasRich = hasRich
    this.hasImage = hasImage
    this.imageWidth = imageWidth
    this.imageHeight = imageHeight
  }
}
export class NativeView {
  desktopId: string
  task: string
  connection: string
  error: string
  readOnly: boolean
  messages: NativeMessage[]
  hasMore: boolean
  totalMessages: number
  offline: boolean
  constructor(desktopId: string, task: string, connection: string, error: string, readOnly: boolean, messages: NativeMessage[], hasMore: boolean, totalMessages: number, offline: boolean) {
    this.desktopId = desktopId
    this.task = task
    this.connection = connection
    this.error = error
    this.readOnly = readOnly
    this.messages = messages
    this.hasMore = hasMore
    this.totalMessages = totalMessages
    this.offline = offline
  }
}
export class NativeSession {
  sessionId: string
  title: string
  project: string
  views: NativeView[]
  constructor(sessionId: string, title: string, project: string, views: NativeView[]) {
    this.sessionId = sessionId
    this.title = title
    this.project = project
    this.views = views
  }
}
export const phase5Sessions: NativeSession[] = [
  new NativeSession("phase3-session", "表单与任务回放", "合成项目", [new NativeView("phase5-desktop", "running", "connected", "", false, [new NativeMessage("1db49592-4a9a-4d7b-92f7-1f8a24f225eb", "user", "Show the fixed replay mobile forms.", false, false, 0, 0), new NativeMessage("3d7b29ff-280a-4662-81ee-9d616a26d479", "assistant", "\n\n", true, false, 0, 0)], false, 2, false), new NativeView("phase5-desktop", "running", "disconnected", "", false, [new NativeMessage("1db49592-4a9a-4d7b-92f7-1f8a24f225eb", "user", "Show the fixed replay mobile forms.", false, false, 0, 0), new NativeMessage("3d7b29ff-280a-4662-81ee-9d616a26d479", "assistant", "\n\n", true, false, 0, 0)], false, 2, false), new NativeView("phase5-desktop", "pending_confirmation", "connected", "", false, [new NativeMessage("1db49592-4a9a-4d7b-92f7-1f8a24f225eb", "user", "Show the fixed replay mobile forms.", false, false, 0, 0), new NativeMessage("3d7b29ff-280a-4662-81ee-9d616a26d479", "assistant", "\n\n", true, false, 0, 0)], false, 2, false)]),
  new NativeSession("phase5-empty", "空会话", "合成项目", [new NativeView("phase5-desktop", "idle", "connected", "", false, [], false, 0, false), new NativeView("phase5-desktop", "idle", "disconnected", "", false, [], false, 0, false), new NativeView("phase5-desktop", "idle", "disconnected", "", false, [], false, 0, false)]),
  new NativeSession("phase6-long-cache", "100 条历史与离线恢复", "合成项目", [new NativeView("phase5-desktop", "idle", "connected", "", false, [new NativeMessage("native-history-80", "user", "合成历史消息 80", false, false, 0, 0), new NativeMessage("native-history-81", "user", "合成历史消息 81", false, false, 0, 0), new NativeMessage("native-history-82", "user", "合成历史消息 82", false, false, 0, 0), new NativeMessage("native-history-83", "user", "合成历史消息 83", false, false, 0, 0), new NativeMessage("native-history-84", "user", "合成历史消息 84", false, false, 0, 0), new NativeMessage("native-history-85", "user", "合成历史消息 85", false, false, 0, 0), new NativeMessage("native-history-86", "user", "合成历史消息 86", false, false, 0, 0), new NativeMessage("native-history-87", "user", "合成历史消息 87", false, false, 0, 0), new NativeMessage("native-history-88", "user", "合成历史消息 88", false, false, 0, 0), new NativeMessage("native-history-89", "user", "合成历史消息 89", false, false, 0, 0), new NativeMessage("native-history-90", "user", "合成历史消息 90", false, false, 0, 0), new NativeMessage("native-history-91", "user", "合成历史消息 91", false, false, 0, 0), new NativeMessage("native-history-92", "user", "合成历史消息 92", false, false, 0, 0), new NativeMessage("native-history-93", "user", "合成历史消息 93", false, false, 0, 0), new NativeMessage("native-history-94", "user", "合成历史消息 94", false, false, 0, 0), new NativeMessage("native-history-95", "user", "合成历史消息 95", false, false, 0, 0), new NativeMessage("native-history-96", "user", "合成历史消息 96", false, false, 0, 0), new NativeMessage("native-history-97", "user", "合成历史消息 97", false, false, 0, 0), new NativeMessage("native-history-98", "user", "合成历史消息 98", false, false, 0, 0), new NativeMessage("native-history-99", "user", "合成历史消息 99", false, true, 24, 16)], false, 100, false), new NativeView("phase5-desktop", "idle", "disconnected", "", true, [new NativeMessage("native-history-80", "user", "合成历史消息 80", false, false, 0, 0), new NativeMessage("native-history-81", "user", "合成历史消息 81", false, false, 0, 0), new NativeMessage("native-history-82", "user", "合成历史消息 82", false, false, 0, 0), new NativeMessage("native-history-83", "user", "合成历史消息 83", false, false, 0, 0), new NativeMessage("native-history-84", "user", "合成历史消息 84", false, false, 0, 0), new NativeMessage("native-history-85", "user", "合成历史消息 85", false, false, 0, 0), new NativeMessage("native-history-86", "user", "合成历史消息 86", false, false, 0, 0), new NativeMessage("native-history-87", "user", "合成历史消息 87", false, false, 0, 0), new NativeMessage("native-history-88", "user", "合成历史消息 88", false, false, 0, 0), new NativeMessage("native-history-89", "user", "合成历史消息 89", false, false, 0, 0), new NativeMessage("native-history-90", "user", "合成历史消息 90", false, false, 0, 0), new NativeMessage("native-history-91", "user", "合成历史消息 91", false, false, 0, 0), new NativeMessage("native-history-92", "user", "合成历史消息 92", false, false, 0, 0), new NativeMessage("native-history-93", "user", "合成历史消息 93", false, false, 0, 0), new NativeMessage("native-history-94", "user", "合成历史消息 94", false, false, 0, 0), new NativeMessage("native-history-95", "user", "合成历史消息 95", false, false, 0, 0), new NativeMessage("native-history-96", "user", "合成历史消息 96", false, false, 0, 0), new NativeMessage("native-history-97", "user", "合成历史消息 97", false, false, 0, 0), new NativeMessage("native-history-98", "user", "合成历史消息 98", false, false, 0, 0), new NativeMessage("native-history-99", "user", "合成历史消息 99", false, true, 24, 16)], false, 100, true), new NativeView("phase5-desktop", "idle", "disconnected", "", true, [new NativeMessage("native-history-80", "user", "合成历史消息 80", false, false, 0, 0), new NativeMessage("native-history-81", "user", "合成历史消息 81", false, false, 0, 0), new NativeMessage("native-history-82", "user", "合成历史消息 82", false, false, 0, 0), new NativeMessage("native-history-83", "user", "合成历史消息 83", false, false, 0, 0), new NativeMessage("native-history-84", "user", "合成历史消息 84", false, false, 0, 0), new NativeMessage("native-history-85", "user", "合成历史消息 85", false, false, 0, 0), new NativeMessage("native-history-86", "user", "合成历史消息 86", false, false, 0, 0), new NativeMessage("native-history-87", "user", "合成历史消息 87", false, false, 0, 0), new NativeMessage("native-history-88", "user", "合成历史消息 88", false, false, 0, 0), new NativeMessage("native-history-89", "user", "合成历史消息 89", false, false, 0, 0), new NativeMessage("native-history-90", "user", "合成历史消息 90", false, false, 0, 0), new NativeMessage("native-history-91", "user", "合成历史消息 91", false, false, 0, 0), new NativeMessage("native-history-92", "user", "合成历史消息 92", false, false, 0, 0), new NativeMessage("native-history-93", "user", "合成历史消息 93", false, false, 0, 0), new NativeMessage("native-history-94", "user", "合成历史消息 94", false, false, 0, 0), new NativeMessage("native-history-95", "user", "合成历史消息 95", false, false, 0, 0), new NativeMessage("native-history-96", "user", "合成历史消息 96", false, false, 0, 0), new NativeMessage("native-history-97", "user", "合成历史消息 97", false, false, 0, 0), new NativeMessage("native-history-98", "user", "合成历史消息 98", false, false, 0, 0), new NativeMessage("native-history-99", "user", "合成历史消息 99", false, true, 24, 16)], false, 100, true)]),
]
