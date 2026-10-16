/** React component for the DevFlow task status card. */
import { useEffect, useState } from 'react'

export interface TaskSummary {
  taskId: string
  status: string
  revision: number
  attempts: number
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  planned: '已规划',
  ready: '就绪',
  dispatching: '派工中',
  executing: '执行中',
  verifying: '验证中',
  reviewing: '审查中',
  completed: '已完成',
  rework_pending: '待返工',
  cancelled: '已取消',
  failed: '失败',
}

export interface DevflowCardProps {
  sessionId: string | undefined
}

export function DevflowTaskCard({ sessionId }: DevflowCardProps) {
  const [task] = useState<TaskSummary | undefined>(undefined)
  useEffect(() => { void sessionId }, [sessionId])
  if (task === undefined) return null
  const label = STATUS_LABELS[task.status] ?? task.status
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderRadius: '8px',
        background: 'color-mix(in srgb, var(--accent, #3dd0ff) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent, #3dd0ff) 25%, transparent)',
        fontSize: '13px',
      }}
    >
      <strong>DevFlow</strong>
      <span>{label}</span>
      <span style={{ opacity: 0.6 }}>
        · {task.attempts} 次尝试 · rev {task.revision}
      </span>
    </div>
  )
}
