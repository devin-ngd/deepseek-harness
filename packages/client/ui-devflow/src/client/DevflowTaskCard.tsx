/** React component for the DevFlow task status card. */
import { useEffect, useState } from 'react'

export interface TaskSummary {
  taskId: string
  status: string
  revision: number
  attempts: number
}

export interface DevflowCardProps {
  sessionId: string | undefined
}

const STATUS_TONE: Record<string, { color: string; label: string }> = {
  ready: { color: 'var(--positive, #22c55e)', label: '就绪' },
  executing: { color: 'var(--accent, #3dd0ff)', label: '执行中' },
  verifying: { color: '#eab308', label: '验证中' },
  reviewing: { color: '#8b5cf6', label: '审查中' },
  completed: { color: 'var(--positive, #22c55e)', label: '已完成' },
  rework_pending: { color: '#f97316', label: '待返工' },
  cancelled: { color: 'var(--muted, #888)', label: '已取消' },
  failed: { color: 'var(--danger, #ef4444)', label: '失败' },
}

function StatusDot({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? { color: 'var(--accent, #3dd0ff)', label: status }
  return (
    <span
      aria-label={tone.label}
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: tone.color,
        flexShrink: 0,
      }}
    />
  )
}

export function DevflowTaskCard({ sessionId }: DevflowCardProps) {
  const [task] = useState<TaskSummary | undefined>(undefined)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [sessionId])

  if (!mounted) return null

  const containerStyle: Record<string, string | number> = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 12px',
    borderRadius: '8px',
    background: 'color-mix(in srgb, var(--accent, #3dd0ff) 6%, transparent)',
    border: '1px solid color-mix(in srgb, var(--accent, #3dd0ff) 20%, transparent)',
    fontSize: '12.5px',
    lineHeight: 1.5,
    maxWidth: '480px',
  }

  if (task === undefined) {
    return (
      <div style={containerStyle}>
        <StatusDot status='ready' />
        <strong style={{ fontSize: '11px', letterSpacing: '0.5px' }}>DEVFLOW</strong>
        <span style={{ opacity: 0.7 }}>就绪 · 在对话中说「创建 devflow 任务」开始</span>
      </div>
    )
  }

  const tone = STATUS_TONE[task.status] ?? { color: 'var(--accent, #3dd0ff)', label: task.status }
  return (
    <div style={containerStyle}>
      <StatusDot status={task.status} />
      <strong style={{ fontSize: '11px', letterSpacing: '0.5px' }}>DEVFLOW</strong>
      <span>{tone.label}</span>
      <span style={{ opacity: 0.6 }}>
        · {task.attempts} 次尝试 · rev {task.revision} · {task.taskId.slice(0, 16)}
      </span>
    </div>
  )
}
