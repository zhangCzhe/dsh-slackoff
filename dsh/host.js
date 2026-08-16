import { createActivityMachine } from './state-machine.js'

const DEFAULT_CONFIG = { autoControl: true, defaultTarget: '' }

// 独立导出便于单测；不依赖 DSH 运行时。
export function createStateHandler(machine, getConfig) {
  return async function handler(req, res) {
    const url = new URL(req.url ?? '/', 'http://dsh.local')
    let pathname = url.pathname
    if (pathname.startsWith('/video-pet')) pathname = pathname.slice('/video-pet'.length) || '/'
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    if (pathname === '/state' && req.method === 'GET') {
      const { state, since } = machine.snapshot()
      const { autoControl, defaultTarget } = getConfig()
      res.end(JSON.stringify({ state, since, autoControl, defaultTarget }))
      return
    }
    if (pathname === '/control' && req.method === 'POST') {
      const chunks = []
      for await (const c of req) chunks.push(c)
      let body = {}
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { body = {} }
      const config = getConfig()
      if (typeof body.autoControl === 'boolean') config.autoControl = body.autoControl
      const { state, since } = machine.snapshot()
      const { autoControl, defaultTarget } = config
      res.end(JSON.stringify({ ok: true, state, since, autoControl, defaultTarget }))
      return
    }
    res.writeHead(404)
    res.end(JSON.stringify({ error: 'not found' }))
  }
}

export default {
  inject: ['webServer'],
  apply(ctx, rawConfig) {
    const config = { ...DEFAULT_CONFIG, ...rawConfig }
    const machine = createActivityMachine()

    // 权威运行/空闲信号（忽略 session-start，避免与 status 重复计数）
    ctx.on('agent/status', (payload) => { machine.onStatus(payload.status) })
    // 工具跨度：waterfall，只观察不拦截
    ctx.on('tools/pre-execute', async (_exec, next) => {
      machine.onToolStart()
      try { return await next() }
      catch (e) { machine.onToolEnd(); throw e }
    })
    ctx.on('tools/result', () => { machine.onToolEnd() })
    // 询问用户：next() 决议期间处于 awaiting，决议后复位
    ctx.on('approval/request', async (_req, next) => {
      machine.onApprovalStart()
      try { return await next() } finally { machine.onApprovalSettled() }
    })
    // 回合关闭：整体复位
    ctx.on('agent/turn-stopping', () => { machine.onTurnStopping() })
    ctx.on('agent/disposed', () => { machine.onTurnStopping() })

    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: '/video-pet',
      handler: createStateHandler(machine, () => config),
    })
    ctx.effect(() => dispose)
  },
}
