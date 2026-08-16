let lastKey = null

function relay(state, defaultTarget, fishSeq) {
  const key = state + '|' + (defaultTarget || '') + '|' + (fishSeq || 0)
  if (key === lastKey) return
  lastKey = key
  console.log('[slackoff][bridge] relay', state, defaultTarget, fishSeq)
  chrome.runtime.sendMessage({ type: 'slackoff/state', state, defaultTarget, fishSeq })
    .catch((e) => console.error('[slackoff][bridge] send failed', e))
}

window.addEventListener('message', (e) => {
  if (e.origin !== window.location.origin) return
  if (e.data?.type === 'dsh-slackoff/state') relay(e.data.state, e.data.defaultTarget, e.data.fishSeq)
})

// 聚焦输入框 → 暂停视频
document.addEventListener('focusin', (e) => {
  const path = e.composedPath ? e.composedPath() : [e.target]
  const el = path[0]
  if (!el || !el.tagName) return
  const tag = el.tagName
  const editable = tag === 'TEXTAREA' || tag === 'INPUT' || el.isContentEditable === true || el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === ''
  console.log('[slackoff][bridge] focusin', tag, 'editable', editable)
  if (editable) {
    chrome.runtime.sendMessage({ type: 'slackoff/user-focus' }).catch((err) => console.error('[slackoff][bridge] user-focus send failed', err))
  }
})

// 兜底轮询（client 插件未装时）
setInterval(async () => {
  try {
    const res = await fetch('/slackoff/state', { cache: 'no-store' })
    const data = await res.json()
    relay(data.state, data.defaultTarget, data.fishSeq)
  } catch (e) { console.error('[slackoff][bridge] poll failed', e) }
}, 500)

console.log('[slackoff][bridge] injected')
