/** Locale-owned status labels from the shared semantic model. */
@Component
export struct TaskState {
  @Prop status: string = 'idle'
  private label(): Resource {
    switch (this.status) {
      case 'accepted': return $r('app.string.queued')
      case 'running': return $r('app.string.task_running')
      case 'completed': return $r('app.string.completed')
      case 'cancel_requested': return $r('app.string.cancel_requested')
      case 'cancelled': return $r('app.string.cancelled')
      case 'failed': return $r('app.string.task_failed')
      case 'outcome_unknown': return $r('app.string.outcome_unknown')
      case 'pending_confirmation': return $r('app.string.approval_title')
      default: return $r('app.string.task_idle')
    }
  }
  build() { Text(this.label()).id('dsh-task-state').fontSize(14).width('100%') }
}
