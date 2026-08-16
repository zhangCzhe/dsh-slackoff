const SITE_SELECTORS = {
  // 站点专用选择器在前，裸 'video' 兜底在后 —— 避免抓到预加载/隐藏的占位 <video>
  'bilibili.com': ['.bpx-player-video-wrap video', '#bilibili-player video', 'video'],
  'douyin.com': [
    '.xgplayer video',
    '.xgplayer-container video',
    'video.xg-video-container',
    '.playerContainer video',
    '#playerContainer video',
    '.xg-video-container',
    'video',
  ],
  'youtube.com': ['.html5-video-player video', 'video'],
}
const FALLBACK = ['video']

function siteKeyFor(hostname) {
  for (const key of Object.keys(SITE_SELECTORS)) {
    if (hostname === key || hostname.endsWith('.' + key)) return key
  }
  return null
}

export function selectVideoElement(root, hostname) {
  const key = siteKeyFor(hostname)
  const list = (key ? SITE_SELECTORS[key] : []).concat(FALLBACK)
  for (const sel of list) {
    let el = null
    try { el = root.querySelector(sel) } catch (e) { el = null }
    if (!el) continue
    if (el.tagName === 'VIDEO') return el
    if (el.querySelector) {
      const v = el.querySelector('video')
      if (v) return v
    }
  }
  return null
}
