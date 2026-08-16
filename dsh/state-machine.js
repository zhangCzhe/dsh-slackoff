export function createActivityMachine() {
  let runningCount = 0
  let state = 'idle'
  let since = Date.now()
  let toolActive = false
  let approvalPending = false

  function recompute() {
    const next = approvalPending
      ? 'awaiting'
      : toolActive
        ? 'tool'
        : runningCount > 0
          ? 'thinking'
          : 'idle'
    if (next !== state) {
      state = next
      since = Date.now()
    }
    return state
  }

  return {
    get state() { return state },
    get since() { return since },
    onStatus(status) {
      if (status === 'running') runningCount += 1
      else runningCount = Math.max(0, runningCount - 1)
      return recompute()
    },
    onToolStart() { toolActive = true; return recompute() },
    onToolEnd() { toolActive = false; return recompute() },
    onApprovalStart() { approvalPending = true; return recompute() },
    onApprovalSettled() { approvalPending = false; return recompute() },
    onTurnStopping() {
      toolActive = false
      approvalPending = false
      runningCount = 0
      return recompute()
    },
    snapshot() { return { state, since } },
  }
}
