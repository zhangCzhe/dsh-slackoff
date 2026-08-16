import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createActivityMachine } from '../dsh/state-machine.js'

test('idle by default', () => {
  assert.equal(createActivityMachine().state, 'idle')
})

test('status running -> thinking', () => {
  const m = createActivityMachine()
  assert.equal(m.onStatus('running'), 'thinking')
})

test('tool beats thinking', () => {
  const m = createActivityMachine()
  m.onStatus('running')
  assert.equal(m.onToolStart(), 'tool')
})

test('awaiting beats tool', () => {
  const m = createActivityMachine()
  m.onStatus('running')
  m.onToolStart()
  assert.equal(m.onApprovalStart(), 'awaiting')
})

test('tool end returns to thinking while still running', () => {
  const m = createActivityMachine()
  m.onStatus('running')
  m.onToolStart()
  assert.equal(m.onToolEnd(), 'thinking')
})

test('status idle -> idle', () => {
  const m = createActivityMachine()
  m.onStatus('running')
  assert.equal(m.onStatus('idle'), 'idle')
})

test('turn-stopping resets everything', () => {
  const m = createActivityMachine()
  m.onStatus('running')
  m.onToolStart()
  m.onApprovalStart()
  assert.equal(m.onTurnStopping(), 'idle')
})

test('runningCount floors at zero', () => {
  const m = createActivityMachine()
  assert.equal(m.onStatus('idle'), 'idle')
})

test('since only changes when state flips', () => {
  const m = createActivityMachine()
  m.onStatus('running')
  const s1 = m.since
  m.onToolStart()
  m.onToolEnd()
  m.onStatus('running')
  assert.equal(m.since, s1)
})
