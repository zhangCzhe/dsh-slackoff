import { decisionFor } from './decision.js'

const FALLBACK_TARGET = 'https://www.bilibili.com/'
let targetTabId = null
let defaultTarget = FALLBACK_TARGET
let lastAction = null
let opening = false
let lastFishSeq = 0

function normalizeUrl(u) {
  const s = (u || '').trim()
  if (!s) return s
  if (/^https?:\/\//i.test(s)) return s
  return 'https://' + s
}

async function restoreTab() {
  const { videoPetTabId } = await chrome.storage.session.get({ videoPetTabId: null })
  targetTabId = videoPetTabId
}

function setTargetTab(tabId) {
  targetTabId = tabId
  if (tabId != null) chrome.storage.session.set({ videoPetTabId: tabId })
  else chrome.storage.session.remove('videoPetTabId')
}

async function focusPopup(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId)
    await chrome.windows.update(tab.windowId, { focused: true })
  } catch (e) { /* 忽略 */ }
}

async function getRightPosition(width, height) {
  try {
    const displays = await chrome.system.display.getInfo()
    const d = displays[0]
    if (d && d.workArea) {
      return { left: d.workArea.left + d.workArea.width - width - 16, top: d.workArea.top + 16 }
    }
  } catch (e) { /* 忽略 */ }
  return null
}

async function ensureVideoTab(target, canOpen) {
  if (targetTabId != null) {
    try { await chrome.tabs.get(targetTabId); return targetTabId }
    catch { setTargetTab(null) }
  }
  await restoreTab()
  if (targetTabId != null) {
    try { await chrome.tabs.get(targetTabId); return targetTabId }
    catch { setTargetTab(null) }
  }
  if (!canOpen) return null
  if (opening) return null
  opening = true
  try {
    console.log('[slackoff][bg] opening popup', target)
    const winOpts = { type: 'popup', width: 420, height: 640, focused: true }
    const pos = await getRightPosition(420, 640)
    if (pos) { winOpts.left = pos.left; winOpts.top = pos.top }
    const win = await chrome.windows.create(winOpts)
    const tab = await chrome.tabs.create({ windowId: win.id, url: target })
    if (tab?.id != null) setTargetTab(tab.id)
    return targetTabId
  } finally {
    opening = false
  }
}

async function control(action, shouldFocus) {
  const target = normalizeUrl(defaultTarget || FALLBACK_TARGET)
  console.log('[slackoff][bg] control', action, 'target', target)
  const tabId = await ensureVideoTab(target, action === 'play')
  if (tabId == null) return
  if (shouldFocus) await focusPopup(tabId)
  try { await chrome.tabs.sendMessage(tabId, { type: 'slackoff/control', action }) }
  catch (e) { console.error('[slackoff][bg] sendMessage failed', e) }
}

async function openFish() {
  const target = normalizeUrl(defaultTarget || FALLBACK_TARGET)
  const tabId = await ensureVideoTab(target, true)
  if (tabId == null) return
  await focusPopup(tabId)
}

async function pauseExisting() {
  console.log('[slackoff][bg] pauseExisting')
  const target = normalizeUrl(defaultTarget || FALLBACK_TARGET)
  const tabId = await ensureVideoTab(target, false)
  console.log('[slackoff][bg] pauseExisting tabId', tabId)
  if (tabId == null) return
  lastAction = 'pause'
  try { await chrome.tabs.sendMessage(tabId, { type: 'slackoff/control', action: 'pause' }) } catch (e) { console.error('[slackoff][bg] pause send failed', e) }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'slackoff/state') {
    console.log('[slackoff][bg] state msg', msg.state, msg.defaultTarget, 'fishSeq', msg.fishSeq)
    if (typeof msg.defaultTarget === 'string' && msg.defaultTarget.trim()) defaultTarget = normalizeUrl(msg.defaultTarget)
    if (typeof msg.fishSeq === 'number' && msg.fishSeq > lastFishSeq) {
      lastFishSeq = msg.fishSeq
      openFish()
    }
    const action = decisionFor(msg.state)
    const shouldFocus = action === 'play' && lastAction !== 'play'
    lastAction = action
    chrome.storage.sync.get({ autoControl: true }).then(({ autoControl }) => {
      console.log('[slackoff][bg] autoControl', autoControl)
      if (autoControl) control(action, shouldFocus)
    })
  } else if (msg.type === 'slackoff/user-focus') {
    console.log('[slackoff][bg] user-focus received')
    pauseExisting()
  } else if (msg.type === 'slackoff/set-tab') {
    console.log('[slackoff][bg] set-tab', sender.tab?.id)
    if (sender.tab?.id != null) {
      setTargetTab(sender.tab.id)
      if (lastAction) chrome.tabs.sendMessage(sender.tab.id, { type: 'slackoff/control', action: lastAction }).catch(() => {})
    }
  }
  sendResponse({ ok: true })
  return false
})

chrome.alarms.create('slackoff-watchdog', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'slackoff-watchdog' && targetTabId != null) {
    chrome.tabs.get(targetTabId).catch(() => { setTargetTab(null) })
  }
})

console.log('[slackoff][bg] service worker started')
restoreTab()
