/** Closed trusted mobile operations; device binding never grants an arbitrary Host API. */
export const deviceGrantOperations = ['task.submit', 'task.receipt', 'session.cancel', 'session.sync', 'rich.mount', 'rich.snapshot', 'rich.saveDraft', 'rich.invoke', 'rich.status', 'rich.dispose'] as const
