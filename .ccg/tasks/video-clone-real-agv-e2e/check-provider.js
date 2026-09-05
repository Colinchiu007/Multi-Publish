const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:11202')
  console.log('CONNECTED')

  const contexts = browser.contexts()
  let page = contexts[0].pages()[0]
  await page.goto('http://127.0.0.1:7154/#/create', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  await new Promise(r => setTimeout(r, 3000))

  // 1. Check what userData path the app is using
  const userData = await page.evaluate(() => {
    try {
      return window.electronAPI.getPath?.('userData') || 'getPath not available'
    } catch (e) {
      return 'error: ' + e.message
    }
  })
  console.log('USER_DATA:', userData)

  // 2. Check model provider status for agnes-video
  const providerStatus = await page.evaluate(async () => {
    const api = window.electronAPI
    if (!api?.modelProviderGet) return { error: 'modelProviderGet not available' }
    try {
      const r = await api.modelProviderGet('agnes-video')
      return r
    } catch (e) {
      return { error: e.message }
    }
  })
  console.log('AGNES_VIDEO_PROVIDER:', JSON.stringify(providerStatus, null, 2))

  // 3. List all configured providers
  const allProviders = await page.evaluate(async () => {
    const api = window.electronAPI
    if (!api?.modelProviderList) return { error: 'modelProviderList not available' }
    try {
      const r = await api.modelProviderList()
      return r
    } catch (e) {
      return { error: e.message }
    }
  })
  console.log('ALL_PROVIDERS:', JSON.stringify(allProviders, null, 2))

  // 4. Check store settings
  const storeSettings = await page.evaluate(async () => {
    const api = window.electronAPI
    if (!api?.storeGetSetting) return { error: 'storeGetSetting not available' }
    try {
      const r = await api.storeGetSetting('debug.profile')
      return r
    } catch (e) {
      return { error: e.message }
    }
  })
  console.log('DEBUG_PROFILE_SETTING:', JSON.stringify(storeSettings, null, 2))

  console.log('DONE')
}

main().catch(e => { console.error('ERROR', e.message); process.exit(1) })