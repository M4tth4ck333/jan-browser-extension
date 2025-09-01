// Minimal IndexedDB wrapper + BroadcastChannel to share session context
// Works in Chromium and Firefox without external deps

const DB_NAME = 'jan-ext'
const DB_VERSION = 1
const STORE_SESSION_CTX = 'sessionContext'
const CHANNEL = 'jan-ext-db'

function openDB() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_SESSION_CTX)) {
          db.createObjectStore(STORE_SESSION_CTX, { keyPath: 'sessionId' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error || new Error('idb open error'))
    } catch (e) { reject(e) }
  })
}

async function withStore(mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_SESSION_CTX, mode)
      const store = tx.objectStore(STORE_SESSION_CTX)
      const p = Promise.resolve(fn(store))
      tx.oncomplete = () => resolve(p)
      tx.onerror = () => reject(tx.error || new Error('idb tx error'))
    } catch (e) { reject(e) }
  })
}

export async function getSessionContextDB(sessionId) {
  if (!sessionId) return null
  return withStore('readonly', (store) => new Promise((resolve, reject) => {
    const req = store.get(sessionId)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error || new Error('idb get error'))
  }))
}

export async function setSessionContextDB(sessionId, patch) {
  if (!sessionId) return null
  const now = Date.now()
  const next = await withStore('readwrite', (store) => new Promise((resolve, reject) => {
    const getReq = store.get(sessionId)
    getReq.onsuccess = () => {
      const cur = getReq.result || { sessionId }
      const updated = { ...cur, ...(patch || {}), updatedAt: now }
      const putReq = store.put(updated)
      putReq.onsuccess = () => resolve(updated)
      putReq.onerror = () => reject(putReq.error || new Error('idb put error'))
    }
    getReq.onerror = () => reject(getReq.error || new Error('idb get error'))
  }))
  try {
    const bc = new BroadcastChannel(CHANNEL)
    bc.postMessage({ type: 'sessionContextUpdated', sessionId, data: next })
    bc.close()
  } catch (_) {}
  return next
}

export function subscribeSessionContextDB(sessionId, cb) {
  if (!sessionId) return () => {}
  let closed = false
  const bc = new BroadcastChannel(CHANNEL)
  const onMsg = (ev) => {
    const msg = ev?.data
    if (!msg || msg.type !== 'sessionContextUpdated') return
    if (msg.sessionId !== sessionId) return
    try { cb(msg.data) } catch (_) {}
  }
  try { bc.addEventListener('message', onMsg) } catch (_) { bc.onmessage = onMsg }
  return () => { if (!closed) { try { bc.removeEventListener?.('message', onMsg) } catch (_) {}; try { bc.close() } catch (_) {}; closed = true } }
}

