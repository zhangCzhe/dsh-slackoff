import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createActivityMachine } from '../dsh/state-machine.js'
import { createStateHandler } from '../dsh/host.js'

function mockReq(method, path, body) {
  return {
    method,
    url: path,
    [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(body) },
  }
}

function mockRes() {
  const res = { status: 200, headers: {}, body: '' }
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.writeHead = (s) => { res.status = s }
  res.end = (b) => { res.body = String(b) }
  return res
}

test('GET /video-pet/state returns snapshot + config', async () => {
  const machine = createActivityMachine()
  machine.onStatus('running')
  const handler = createStateHandler(machine, () => ({ autoControl: true, defaultTarget: 'https://x' }))
  const res = mockRes()
  await handler(mockReq('GET', '/video-pet/state'), res)
  const json = JSON.parse(res.body)
  assert.equal(json.state, 'thinking')
  assert.equal(json.autoControl, true)
})

test('GET /video-pet/state exposes exactly the whitelisted fields', async () => {
  const machine = createActivityMachine()
  machine.onStatus('running')
  const handler = createStateHandler(machine, () => ({ autoControl: true, defaultTarget: 'https://x', injected: 'SECRET' }))
  const res = mockRes()
  await handler(mockReq('GET', '/video-pet/state'), res)
  const json = JSON.parse(res.body)
  assert.deepEqual(Object.keys(json).sort(), ['autoControl', 'defaultTarget', 'since', 'state'])
  assert.equal(json.injected, undefined)
})

test('POST /video-pet/control toggles autoControl', async () => {
  const config = { autoControl: true, defaultTarget: 'https://x' }
  const handler = createStateHandler(createActivityMachine(), () => config)
  const res = mockRes()
  await handler(mockReq('POST', '/video-pet/control', JSON.stringify({ autoControl: false })), res)
  assert.equal(config.autoControl, false)
  assert.equal(JSON.parse(res.body).autoControl, false)
})

test('unknown path -> 404', async () => {
  const handler = createStateHandler(createActivityMachine(), () => ({}))
  const res = mockRes()
  await handler(mockReq('GET', '/video-pet/nope'), res)
  assert.equal(res.status, 404)
})

test('GET /state also works when prefix is stripped', async () => {
  const machine = createActivityMachine()
  machine.onStatus('running')
  const handler = createStateHandler(machine, () => ({ autoControl: true, defaultTarget: 'https://x' }))
  const res = mockRes()
  await handler(mockReq('GET', '/state'), res)
  assert.equal(JSON.parse(res.body).state, 'thinking')
})
