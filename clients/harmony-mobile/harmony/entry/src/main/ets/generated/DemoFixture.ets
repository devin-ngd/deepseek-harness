/** Generated fixed presentation data; run node scripts/assets.mjs. */
export class DemoRow {
  constructor(public sessionId: string, public title: string) {}
}
export const demoRows: DemoRow[] = [
  new DemoRow("mock-session-a", "表单任务"),
  new DemoRow("mock-session-b", "独立会话"),
]
export const demoResult: string = "固定演示已完成。执行归属：mock-desktop。"
