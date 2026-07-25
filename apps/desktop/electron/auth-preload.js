/**
 * Auth Preload — WebContentsView 内嵌浏览器的预加载脚本
 * 用于在第三方页面安全执行凭证提取
 */
const { contextBridge } = require('electron')

const MAX_INDEXED_DATABASES = 8
const MAX_INDEXED_STORES = 16
const MAX_INDEXED_ENTRIES = 64
const MAX_VALUE_DEPTH = 6
const INDEXED_DB_KEY_FIELD = '__multi_publish_indexeddb_key__'

function toJsonSafe(value, depth = 0) {
  if (depth > MAX_VALUE_DEPTH) return undefined
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_INDEXED_ENTRIES)
      .map(item => toJsonSafe(item, depth + 1))
      .filter(item => item !== undefined)
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return undefined
  const result = {}
  for (const key of Object.keys(value).slice(0, MAX_INDEXED_ENTRIES)) {
    const normalized = toJsonSafe(value[key], depth + 1)
    if (normalized !== undefined) result[key] = normalized
  }
  return result
}

function readStore(db, storeName) {
  return new Promise(resolve => {
    let transaction
    try {
      transaction = db.transaction(storeName, 'readonly')
    } catch (_) {
      resolve({})
      return
    }
    let store
    try { store = transaction.objectStore(storeName) } catch (_) { resolve([]); return }
    const result = []
    let count = 0
    const cursor = store.openCursor()
    cursor.onsuccess = () => {
      const current = cursor.result
      if (!current || count >= MAX_INDEXED_ENTRIES) {
        resolve(result)
        return
      }
      const key = toJsonSafe(current.key)
      const value = toJsonSafe(current.value)
      if (key !== undefined && value !== undefined) {
        result.push({ [INDEXED_DB_KEY_FIELD]: key, value })
      }
      count += 1
      current.continue()
    }
    cursor.onerror = () => resolve(result)
  })
}

async function readDatabase(name) {
  return new Promise(resolve => {
    let request
    try { request = indexedDB.open(name) } catch (_) { resolve({}); return }
    request.onerror = () => resolve({})
    request.onupgradeneeded = () => {
      try { request.transaction.abort() } catch (_) { /* ignore */ }
      resolve({})
    }
    request.onsuccess = async () => {
      const db = request.result
      try {
        const stores = {}
        for (const storeName of Array.from(db.objectStoreNames).slice(0, MAX_INDEXED_STORES)) {
          stores[storeName] = await readStore(db, storeName)
        }
        resolve(stores)
      } catch (_) {
        resolve({})
      } finally {
        try { db.close() } catch (_) { /* ignore */ }
      }
    }
  })
}

contextBridge.exposeInMainWorld('__auth_helper__', {
  getLocalStorage: () => {
    const result = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key.startsWith('__') || key === 'devtools') continue
      // eslint-disable-next-line no-unused-vars
      try { result[key] = localStorage.getItem(key) } catch (e) { /* ignore */ }
    }
    return result
  },
  getIndexedDB: async () => {
    if (!window.indexedDB || typeof indexedDB.databases !== 'function') return {}
    try {
      const databases = await indexedDB.databases()
      const result = {}
      for (const item of databases.slice(0, MAX_INDEXED_DATABASES)) {
        if (!item || typeof item.name !== 'string' || !item.name) continue
        result[item.name] = await readDatabase(item.name)
      }
      return result
    } catch (_) {
      return {}
    }
  },
  getPageInfo: () => ({
    title: document.title,
    url: window.location.href,
    cookies: document.cookie,
  }),
})
