const defaults = { autoControl: true, pip: true }
const $ = (s) => document.querySelector(s)

// 载入设置
chrome.storage.sync.get(defaults).then((v) => {
  for (const k of Object.keys(defaults)) {
    const el = $('[name=' + k + ']')
    if (el) el.checked = v[k]
  }
})

// 自动保存（切换即生效，无需提交按钮）
for (const k of Object.keys(defaults)) {
  $('[name=' + k + ']').addEventListener('change', () => {
    chrome.storage.sync.set({ [k]: $('[name=' + k + ']').checked })
  })
}

// 状态指示：轮询 DSH 的 /video-pet/state
const STATE_LABELS = { thinking: '思考中', tool: '执行工具', awaiting: '等待中', idle: '空闲' }
async function refreshStatus() {
  const stateEl = $('#state')
  const targetEl = $('#target')
  try {
    const res = await fetch('http://127.0.0.1:3080/video-pet/state')
    if (!res.ok) throw new Error('http ' + res.status)
    const s = await res.json()
    stateEl.textContent = STATE_LABELS[s.state] || s.state
    stateEl.className = 'badge ' + (s.state === 'idle' ? '' : 'busy')
    targetEl.textContent = s.defaultTarget || '—'
    targetEl.title = s.defaultTarget || ''
  } catch (e) {
    stateEl.textContent = '未连接'
    stateEl.className = 'badge offline'
    targetEl.textContent = '—'
    targetEl.title = ''
  }
}
refreshStatus()
setInterval(refreshStatus, 3000)
