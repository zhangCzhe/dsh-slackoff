// slackoff: 在页面 MAIN world、document_start 阶段把 shadow root 强制开放。
// 抖音 xgplayer 把 <video> 包在封闭 shadow root 里，ISOLATED 内容脚本的
// el.shadowRoot 对 closed root 恒为 null，导致 findVideo 永远 none。
try {
  const orig = Element.prototype.attachShadow
  if (typeof orig === 'function') {
    Element.prototype.attachShadow = function (init) {
      try {
        if (init && init.mode === 'closed') {
          console.log('[slackoff][shadow] forcing open on a closed attachShadow')
          init = Object.assign({}, init, { mode: 'open' })
        }
      } catch (e) {}
      return orig.call(this, init)
    }
    console.log('[slackoff][shadow] attachShadow patched (force open)')
  }
} catch (e) {
  console.log('[slackoff][shadow] patch failed', e)
}
