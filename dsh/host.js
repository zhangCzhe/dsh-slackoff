import { createActivityMachine } from './state-machine.js'

export async function readBody(req) {
  const parts = []
  let total = 0
  for await (const chunk of req) {
    const b = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
    parts.push(b)
    total += b.length
  }
  const merged = new Uint8Array(total)
  let off = 0
  for (const p of parts) { merged.set(p, off); off += p.length }
  return new TextDecoder().decode(merged)
}

export function normalizeUrl(u) {
  const s = (u || '').trim()
  if (!s) return s
  if (/^https?:\/\//i.test(s)) return s
  return 'https://' + s
}

export function createStateHandler(machine, config, refs) {
  function configSnapshot() {
    return { targets: config.targets.slice(), defaultTarget: config.defaultTarget, onlyComplex: config.onlyComplex, autoControl: config.autoControl }
  }
  async function readJson(req) {
    let body = {}
    try { body = JSON.parse((await readBody(req)) || '{}') } catch (e) { body = {} }
    return body
  }
  return async function handler(req, res) {
    let pathname = (req.url || '/').split('?')[0]
    if (pathname.indexOf('/slackoff') === 0) pathname = pathname.slice('/slackoff'.length) || '/'
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')

    // 活动状态：摸鱼小窗 / 浏览器扩展轮询
    if (pathname === '/state' && req.method === 'GET') {
      const snap = machine.snapshot()
      res.end(JSON.stringify({
        state: snap.state,
        since: snap.since,
        autoControl: config.autoControl,
        defaultTarget: config.defaultTarget,
        onlyComplex: config.onlyComplex,
        clientPinged: refs.pinged,
        fishSeq: refs.fishSeq,
      }))
      return
    }

    // 旧的控制端点（浏览器扩展仍使用）
    if (pathname === '/control' && req.method === 'POST') {
      const body = await readJson(req)
      if (typeof body.autoControl === 'boolean') config.autoControl = body.autoControl
      if (typeof body.defaultTarget === 'string' && body.defaultTarget.trim()) config.defaultTarget = normalizeUrl(body.defaultTarget)
      if (typeof body.onlyComplex === 'boolean') { config.onlyComplex = body.onlyComplex; machine.setOnlyComplex(config.onlyComplex) }
      const snap = machine.snapshot()
      res.end(JSON.stringify({ ok: true, state: snap.state, since: snap.since, autoControl: config.autoControl, defaultTarget: config.defaultTarget, onlyComplex: config.onlyComplex }))
      return
    }

    // 客户端 RPC over HTTP
    // 说明：本插件以「静态 npm 插件」形式加载（profile node_modules 符号链接），
    // 静态插件的 host.apply(ctx, config) 运行在真实 host realm，没有动态插件沙箱里的
    // harness 全局，也不存在 harness.handle / host.call 的 Client→Host RPC 通道。
    // 因此客户端（client.js）原本通过 host.call(...) 调用的方法，统一改走这里暴露的 HTTP 端点。
    if (pathname === '/ping' && req.method === 'POST') {
      refs.pinged = true
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (pathname === '/open-fish' && req.method === 'POST') {
      refs.fishSeq += 1
      res.end(JSON.stringify({ ok: true, fishSeq: refs.fishSeq }))
      return
    }
    if (pathname === '/get-config' && (req.method === 'POST' || req.method === 'GET')) {
      res.end(JSON.stringify(configSnapshot()))
      return
    }
    if (pathname === '/set-target' && req.method === 'POST') {
      const body = await readJson(req)
      if (body && typeof body.url === 'string' && body.url.trim()) {
        const url = normalizeUrl(body.url)
        config.defaultTarget = url
        if (config.targets.indexOf(url) === -1) config.targets.push(url)
      }
      res.end(JSON.stringify(configSnapshot()))
      return
    }
    if (pathname === '/add-target' && req.method === 'POST') {
      const body = await readJson(req)
      if (body && typeof body.url === 'string' && body.url.trim()) {
        const url = normalizeUrl(body.url)
        if (config.targets.indexOf(url) === -1) config.targets.push(url)
      }
      res.end(JSON.stringify(configSnapshot()))
      return
    }
    if (pathname === '/remove-target' && req.method === 'POST') {
      const body = await readJson(req)
      if (body && typeof body.url === 'string') {
        const url = normalizeUrl(body.url)
        config.targets = config.targets.filter((t) => t !== url)
        if (config.targets.length === 0) config.targets = ['https://www.bilibili.com/']
        if (config.defaultTarget === url) config.defaultTarget = config.targets[0]
      }
      res.end(JSON.stringify(configSnapshot()))
      return
    }
    if (pathname === '/set-only-complex' && req.method === 'POST') {
      const body = await readJson(req)
      if (body && typeof body.value === 'boolean') { config.onlyComplex = body.value; machine.setOnlyComplex(config.onlyComplex) }
      res.end(JSON.stringify(configSnapshot()))
      return
    }

    res.writeHead(404)
    res.end(JSON.stringify({ error: 'not found' }))
  }
}

export default {
  inject: ['webServer', 'timer'],
  apply(ctx, rawConfig) {
    const config = Object.assign({
      autoControl: true,
      defaultTarget: 'https://www.bilibili.com/',
      targets: ['https://www.bilibili.com/', 'https://www.douyin.com/', 'https://www.youtube.com/'],
      onlyComplex: false,
      complexThresholdMs: 20000,
    }, rawConfig || {})
    if (!Array.isArray(config.targets)) config.targets = ['https://www.bilibili.com/']
    const refs = { pinged: false, fishSeq: 0 }
    const machine = createActivityMachine()
    machine.setOnlyComplex(config.onlyComplex)
    let complexTimer = null
    function clearComplexTimer() { if (complexTimer) { complexTimer(); complexTimer = null } }

    ctx.on('agent/status', (p) => {
      machine.onStatus(p.status)
      if (p.status === 'running' && config.onlyComplex) {
        clearComplexTimer()
        complexTimer = ctx.timer.timeout(() => { complexTimer = null; machine.markComplex() }, config.complexThresholdMs)
      }
      if (p.status === 'idle') clearComplexTimer()
    })
    ctx.on('tools/pre-execute', async (_e, next) => { clearComplexTimer(); machine.onToolStart(); try { return await next() } catch (e) { machine.onToolEnd(); throw e } })
    ctx.on('tools/result', () => { machine.onToolEnd() })
    ctx.on('approval/request', async (_r, next) => { machine.onApprovalStart(); try { return await next() } finally { machine.onApprovalSettled() } })
    ctx.on('agent/turn-stopping', () => { clearComplexTimer(); machine.onTurnStopping() })
    ctx.on('agent/disposed', () => { clearComplexTimer(); machine.onTurnStopping() })

    const dispose = ctx.webServer.register({ kind: 'prefix', path: '/slackoff', handler: createStateHandler(machine, config, refs) })
    ctx.effect(() => { return () => { clearComplexTimer(); dispose() } })
  },
}
