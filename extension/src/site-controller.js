import { selectVideoElement } from './selectors.js'
import { createDecisionLatch } from './decision.js'

let latch = createDecisionLatch()
let video = null
let pendingAction = null
let pipEnabled = true
let lastScan = 0
let playWaitTimer = null

console.log('[slackoff][site] injected', location.hostname)

chrome.storage.sync.get({ pip: true }).then(({ pip }) => { pipEnabled = pip })

// ── 强制所有导航都发生在当前小窗内 ─────────────────────────────
document.addEventListener('click', (e) => {
  let el = e.target
  while (el && el !== document && el.tagName !== 'A') el = el.parentElement
  if (!el || el.tagName !== 'A') return
  if (el.getAttribute('target') === '_blank' || el.target === '_blank') {
    const href = el.href
    if (!href) return
    e.preventDefault()
    e.stopPropagation()
    window.location.href = href
  }
}, true)

try {
  const s = document.createElement('script')
  s.textContent = 'window.__vpOrigOpen = window.open; window.open = function(u){ if (typeof u === "string" && u) { window.location.href = u; return null } return window.__vpOrigOpen.apply(window, arguments) };'
  ;(document.head || document.documentElement).appendChild(s)
  s.remove()
} catch (err) { /* CSP 拦截则忽略 */ }

// 诊断用：把命中的 <video> 的关键状态打出来
function describeVideo(v) {
  if (!v) return 'null'
  const parent = v.parentElement
  return JSON.stringify({
    tag: v.tagName,
    cls: v.className || '',
    parent: parent ? (parent.className || parent.tagName) : '',
    paused: v.paused,
    ready: v.readyState,
    muted: v.muted,
    src: (v.currentSrc || v.src || '').slice(0, 90),
  })
}

function frameDiagnostics() {
  const iframes = Array.from(document.querySelectorAll('iframe')).map((f) => {
    let u = ''
    try { u = f.src || f.getAttribute('src') || '' } catch (e) {}
    return u.slice(0, 70)
  })
  return JSON.stringify({
    videos: document.querySelectorAll('video').length,
    iframes: iframes.length,
    iframeSrcs: iframes.slice(0, 5),
  })
}

// 抖音 feed 播放器在页面可见时才加载源（否则是 src 为空的 precreate 占位）
function videoHasSource(v) {
  if (!v) return false
  try { return !!(v.currentSrc || v.src) || v.readyState > 0 } catch (e) { return false }
}

// 兜底：点击播放器自带播放按钮（对 xgplayer/部分站点有效；抖音需要可信手势，作用有限）
function clickPlayUI(root) {
  const sels = [
    '.douyin-player-play',
    '.xgplayer-play',
    '.xgplayer-start',
    '.xgplayer-icon-play',
    '[class*="douyin-player"] [class*="play"]',
    '[class*="xgplayer"] [class*="play"]',
  ]
  for (const sel of sels) {
    let el = null
    try { el = root.querySelector(sel) } catch (e) { el = null }
    if (el) {
      console.log('[slackoff][site] clickPlayUI', sel)
      el.click()
      return true
    }
  }
  return false
}

function doPlay(retry) {
  if (!video) return
  const p = video.play()
  if (!p || !p.then) return
  p.then(() => {
    console.log('[slackoff][site] play ok paused=' + video.paused)
    if (pipEnabled) video.requestPictureInPicture().catch(() => {})
  }).catch((err) => {
    console.log('[slackoff][site] play failed', err && err.name)
    if (err && err.name === 'NotAllowedError') {
      // 无手势：静音自动播放是被允许的唯一路径
      try { video.muted = true } catch (e) {}
      video.play()
        .then(() => {
          console.log('[slackoff][site] play ok (muted)')
          if (pipEnabled) video.requestPictureInPicture().catch(() => {})
        })
        .catch(() => clickPlayUI(document))
    } else if (err && err.name === 'AbortError' && retry < 6) {
      // 源正在加载/被 seek 打断，稍后重试
      setTimeout(() => doPlay(retry + 1), 600)
    } else {
      clickPlayUI(document)
    }
  })
}

function tryPlay() {
  if (!video) return
  if (playWaitTimer) { clearInterval(playWaitTimer); playWaitTimer = null }
  if (videoHasSource(video)) { doPlay(0); return }
  // precreate 占位：轮询等待源加载（最多约 10s）
  let attempts = 0
  playWaitTimer = setInterval(() => {
    attempts++
    if (!video) { clearInterval(playWaitTimer); playWaitTimer = null; return }
    if (videoHasSource(video)) { clearInterval(playWaitTimer); playWaitTimer = null; doPlay(0); return }
    if (attempts >= 20) {
      clearInterval(playWaitTimer); playWaitTimer = null
      console.log('[slackoff][site] no source after wait')
      clickPlayUI(document)
    }
  }, 500)
}

function apply(action) {
  if (!video) return
  const next = latch(action)
  if (next === null) return
  if (next === 'play') {
    tryPlay()
  } else {
    if (playWaitTimer) { clearInterval(playWaitTimer); playWaitTimer = null }
    video.pause()
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {})
  }
}

// 深度搜索（含 shadow DOM）查找 <video>
function findVideoDeep(root, hostname, depth) {
  if (!root || depth > 8) return null
  let v = selectVideoElement(root, hostname)
  if (v) return v
  const all = root.querySelectorAll('*')
  for (const el of all) {
    if (el.shadowRoot) {
      v = findVideoDeep(el.shadowRoot, hostname, depth + 1)
      if (v) return v
    }
  }
  return null
}

function findVideo(force) {
  const now = Date.now()
  if (!force && now - lastScan < 500) return
  lastScan = now
  const found = findVideoDeep(document, location.hostname, 0)
  console.log('[slackoff][site] findVideo', found ? 'FOUND ' + describeVideo(found) : 'none ' + frameDiagnostics())
  if (found !== video) {
    video = found
    latch = createDecisionLatch()
    if (found && pendingAction) {
      const a = pendingAction
      pendingAction = null
      apply(a)
    }
  }
}

// 持续观察：video 被替换/摘除，或仍是「无源占位」（抖音 precreate）时重扫，
// 以捕获用户点击后新出现的带源真实播放器（如 xg-video-container）
const mo = new MutationObserver(() => {
  if (!video || !video.isConnected || !videoHasSource(video)) findVideo()
})
mo.observe(document.documentElement, { childList: true, subtree: true })

// 懒加载兜底：无源时周期性重扫
setInterval(() => {
  if (!video || !videoHasSource(video)) findVideo(true)
}, 2000)

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'slackoff/control') {
    console.log('[slackoff][site] control', msg.action)
    pendingAction = msg.action
    if (!video) findVideo(true)
    else apply(msg.action)
  }
  sendResponse({ ok: true })
  return false
})

findVideo(true)

chrome.runtime.sendMessage({ type: 'slackoff/set-tab' }).catch(() => {})
