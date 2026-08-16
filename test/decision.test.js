import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decisionFor, createDecisionLatch } from '../extension/src/decision.js'

test('thinking and tool map to play', () => {
  assert.equal(decisionFor('thinking'), 'play')
  assert.equal(decisionFor('tool'), 'play')
})

test('awaiting and idle map to pause', () => {
  assert.equal(decisionFor('awaiting'), 'pause')
  assert.equal(decisionFor('idle'), 'pause')
})

test('latch emits only on flip', () => {
  const next = createDecisionLatch()
  assert.equal(next('play'), 'play')
  assert.equal(next('play'), null)
  assert.equal(next('pause'), 'pause')
  assert.equal(next('pause'), null)
  assert.equal(next('play'), 'play')
})
