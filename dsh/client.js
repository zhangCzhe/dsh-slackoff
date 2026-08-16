export default {
  inject: ['slots'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    let enabled = true
    slots.inject('sidebar.footer.action', () =>
      slots.register({ name: 'sidebar.footer.action', id: 'video-pet-toggle', order: 1000 }, () => {
        const el = document.createElement('button')
        el.type = 'button'
        el.id = 'video-pet-toggle'
        el.textContent = '⏸ 视频伴侣'
        el.title = '开/关 AI 间隙视频'
        el.classList.add('on')
        el.addEventListener('click', () => {
          enabled = !enabled
          el.textContent = enabled ? '⏸ 视频伴侣' : '▶ 视频伴侣'
          el.classList.toggle('on', enabled)
        })
        return el
      }),
    )

    const ac = new AbortController()
    const tick = async () => {
      if (!enabled) return
      try {
        const res = await fetch('/video-pet/state', { signal: ac.signal, cache: 'no-store' })
        const data = await res.json()
        window.postMessage({ type: 'dsh-video-pet/state', state: data.state }, window.location.origin)
      } catch { /* 端点未就绪，静默 */ }
    }
    void tick()
    const timer = setInterval(tick, 500)
    ctx.effect(() => () => { ac.abort(); clearInterval(timer) })
  },
}
