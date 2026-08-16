import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectVideoElement } from '../extension/src/selectors.js'

function fakeRoot(selectorToElement) {
  return { querySelector: (sel) => selectorToElement[sel] ?? null }
}

test('prefers a direct <video>', () => {
  const video = { tagName: 'VIDEO' }
  assert.equal(selectVideoElement(fakeRoot({ 'video': video }), 'www.bilibili.com'), video)
})

test('falls back to bilibili player container selector', () => {
  const video = { tagName: 'VIDEO' }
  assert.equal(selectVideoElement(fakeRoot({ '.bpx-player-video-wrap video': video }), 'www.bilibili.com'), video)
})

test('returns null when no video found', () => {
  assert.equal(selectVideoElement(fakeRoot({}), 'unknown.example'), null)
})
