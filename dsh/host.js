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
  return async function handler(req, res) {
    let pathname = (req.url || '/').split('?')[0]
    if (pathname.indexOf('/slackoff') === 0) pathname = pathname.slice('/slackoff'.length) || '/'
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
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
    if (pathname === '/control' && req.method === 'POST') {
      let body = {}
      try { body = JSON.parse((await readBody(req)) || '{}') } catch (e) { body = {} }
      if (typeof body.autoControl === 'boolean') config.autoControl = body.autoControl
      if (typeof body.defaultTarget === 'string' && body.defaultTarget.trim()) config.defaultTarget = normalizeUrl(body.defaultTarget)
      if (typeof body.onlyComplex === 'boolean') { config.onlyComplex = body.onlyComplex; machine.setOnlyComplex(config.onlyComplex) }
      const snap = machine.snapshot()
      res.end(JSON.stringify({ ok: true, state: snap.state, since: snap.since, autoControl: config.autoControl, defaultTarget: config.defaultTarget, onlyComplex: config.onlyComplex }))
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

    function configSnapshot() {
      return { targets: config.targets.slice(), defaultTarget: config.defaultTarget, onlyComplex: config.onlyComplex, autoControl: config.autoControl }
    }

    harness.handle('ping', () => { refs.pinged = true; return { ok: true } })
    harness.handle('open-fish', () => { refs.fishSeq += 1; return { ok: true, fishSeq: refs.fishSeq } })
    harness.handle('get-config', () => configSnapshot())
    harness.handle('set-target', (args) => {
      if (args && typeof args.url === 'string' && args.url.trim()) {
        const url = normalizeUrl(args.url)
        config.defaultTarget = url
        if (config.targets.indexOf(url) === -1) config.targets.push(url)
      }
      return configSnapshot()
    })
    harness.handle('add-target', (args) => {
      if (args && typeof args.url === 'string' && args.url.trim()) {
        const url = normalizeUrl(args.url)
        if (config.targets.indexOf(url) === -1) config.targets.push(url)
      }
      return configSnapshot()
    })
    harness.handle('remove-target', (args) => {
      if (args && typeof args.url === 'string') {
        const url = normalizeUrl(args.url)
        config.targets = config.targets.filter((t) => t !== url)
        if (config.targets.length === 0) config.targets = ['https://www.bilibili.com/']
        if (config.defaultTarget === url) config.defaultTarget = config.targets[0]
      }
      return configSnapshot()
    })
    harness.handle('set-only-complex', (args) => {
      if (args && typeof args.value === 'boolean') { config.onlyComplex = args.value; machine.setOnlyComplex(config.onlyComplex) }
      return configSnapshot()
    })

    const dispose = ctx.webServer.register({ kind: 'prefix', path: '/slackoff', handler: createStateHandler(machine, config, refs) })
    ctx.effect(() => { return () => { clearComplexTimer(); dispose() } })
  },
}
