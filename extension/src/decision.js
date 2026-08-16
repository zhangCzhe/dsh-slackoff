export function decisionFor(state) {
  return (state === 'thinking' || state === 'tool') ? 'play' : 'pause'
}

export function createDecisionLatch() {
  let last = null
  return function next(action) {
    if (action === last) return null
    last = action
    return action
  }
}
