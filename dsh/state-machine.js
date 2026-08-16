export function createActivityMachine() {
  let runningCount = 0
  let state = 'idle'
  let since = Date.now()
  let toolActive = false
  let approvalPending = false
  let complex = false
  let onlyComplex = false

  function recompute() {
    const next = approvalPending
      ? 'awaiting'
      : toolActive
        ? 'tool'
        : (runningCount > 0 && (!onlyComplex || complex))
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
    setOnlyComplex(v) { onlyComplex = !!v; return recompute() },
    onStatus(status) {
      if (status === 'running') {
        runningCount += 1
        if (!onlyComplex) complex = true
      } else {
        runningCount = Math.max(0, runningCount - 1)
        if (runningCount === 0) complex = false
      }
      return recompute()
    },
    markComplex() { complex = true; return recompute() },
    onToolStart() { toolActive = true; complex = true; return recompute() },
    onToolEnd() { toolActive = false; return recompute() },
    onApprovalStart() { approvalPending = true; return recompute() },
    onApprovalSettled() { approvalPending = false; return recompute() },
    onTurnStopping() {
      toolActive = false
      approvalPending = false
      runningCount = 0
      complex = false
      return recompute()
    },
    snapshot() { return { state, since } },
  }
}
