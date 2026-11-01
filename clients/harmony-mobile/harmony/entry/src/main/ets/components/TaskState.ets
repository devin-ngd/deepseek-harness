/** Locale-owned task status labels and tones from the shared semantic model. */
/** @param status - Shared task state. @returns The localized label shown in the footer and session list. */
export function taskLabel(status: string): Resource {
  switch (status) {
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

/** @param status - Shared task state. @returns Status colour; failures and unknown outcomes use the danger tone. */
export function taskTone(status: string): Resource {
  switch (status) {
    case 'accepted':
    case 'running': return $r('app.color.accent')
    case 'completed': return $r('app.color.success')
    case 'cancel_requested':
    case 'pending_confirmation': return $r('app.color.warning')
    case 'failed':
    case 'outcome_unknown': return $r('app.color.danger')
    default: return $r('app.color.text_tertiary')
  }
}

/** `active` comes from the page so one task-state list decides both the spinner and the stop control. */
@Component
export struct TaskState {
  @Prop status: string = 'idle'
  @Prop active: boolean = false
  build() {
    Row({ space: 8 }) {
      if (this.active) {
        LoadingProgress().width(18).height(18).color($r('app.color.accent'))
      } else {
        Row().width(8).height(8).borderRadius(4).backgroundColor(taskTone(this.status))
      }
      Text(taskLabel(this.status)).id('dsh-task-state').fontSize(13).fontColor(taskTone(this.status)).maxLines(2)
    }.alignItems(VerticalAlign.Center)
  }
}
