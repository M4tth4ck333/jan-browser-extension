import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hand from '../assets/jan-hand.svg'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function Message({ role, content, onCopy }) {
  const isUser = role === 'user'
  const bubbleBase = isUser ? 'bg-blue-600 text-white' : 'ds-card ds-text'
  return (
    <div className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`${bubbleBase} relative shadow-sm max-w-[80%] rounded-2xl px-3 py-2 text-sm`}>
        <button className="absolute top-1 right-1 text-xs opacity-70 hover:opacity-100" title="Copy" onClick={() => onCopy?.(content)}>📋</button>
        {isUser ? (
          <div className="whitespace-pre-wrap">{content}</div>
        ) : (
          <div className="max-w-none break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              code({ node, inline, className, children, ...props }) {
                const text = String(children || '')
                if (inline) return <code className="px-1 py-0.5 rounded bg-black/20">{text}</code>
                const copyCode = async () => {
                  try { await navigator.clipboard.writeText(text) } catch (_) {}
                }
                return (
                  <div className="relative my-2">
                    <button className="absolute top-1 right-1 text-xs opacity-70 hover:opacity-100" title="Copy code" onClick={copyCode}>📋</button>
                    <pre className="overflow-auto ds-muted-bg p-2 rounded"><code className={className} {...props}>{text}</code></pre>
                  </div>
                )
              }
            }}>
              {content || ''}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  // UI state
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Page/context state
  const [pageData, setPageData] = useState(null)
  const [tabs, setTabs] = useState([])
  const [useContextDefault, setUseContextDefault] = useState(true) // Option A default
  const [useContextThisMsg, setUseContextThisMsg] = useState(true) // Option B per message
  const [selectedTabIds, setSelectedTabIds] = useState([]) // default to current tab later
  const [contextCache, setContextCache] = useState({}) // { [tabId]: pageData }

  // Sessions (history)
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState('')

  const listRef = useRef(null)
  const portRef = useRef(null)
  const [streamingReqId, setStreamingReqId] = useState(null)
  const streamingReqIdRef = useRef(null)
  const sessionsRef = useRef(sessions)
  const activeSessionIdRef = useRef(activeSessionId)

  const copyToClipboard = async (text) => {
    try { await navigator.clipboard.writeText(text) } catch (_) {}
  }

  const stopStreaming = useCallback(async () => {
    const id = streamingReqIdRef.current
    if (!id) return
    try { await chrome.runtime.sendMessage({ type: 'CHAT_COMPLETION_STREAM_STOP', payload: { reqId: id } }) } catch (_) {}
  }, [])

  const scrollToBottom = () => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  // Derived active session (must be before effects that depend on `messages`)
  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId) || null, [sessions, activeSessionId])
  const messages = activeSession?.messages || []

  const isSupportedUrl = (url) => /^https?:\/\//.test(url || '')

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const delay = (ms) => new Promise(res => setTimeout(res, ms))

  const waitForTabComplete = async (tabId, attempts = 10, intervalMs = 300) => {
    for (let i = 0; i < attempts; i++) {
      try {
        const t = await chrome.tabs.get(tabId)
        if (t?.status === 'complete') return true
      } catch (_) { /* ignore */ }
      await delay(intervalMs)
    }
    return false
  }

  const ensureContentScript = async (tabId) => {
    try {
      // quick ping first; if it responds, no need to inject
      const ping = await chrome.tabs.sendMessage(tabId, { type: 'PING' }).catch(() => null)
      if (ping) return true
      // attempt programmatic injection (handles existing tabs after extension reload)
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/content.js']
      })
      // give it a brief moment
      await delay(100)
      return true
    } catch (_) {
      return false
    }
  }

  const sendToTabWithRetry = async (tabId, msg, attempts = 5, intervalMs = 400) => {
    let lastErr
    for (let i = 0; i < attempts; i++) {
      try {
        const resp = await chrome.tabs.sendMessage(tabId, msg)
        return resp
      } catch (e) {
        lastErr = e
        // Try to ensure the content script exists, then retry
        await ensureContentScript(tabId)
        // Receiving end may still be initializing; wait and retry
        await delay(intervalMs)
      }
    }
    throw lastErr || new Error('sendMessage failed')
  }

  const getActiveTab = async () => {
    try {
      // Prefer the active tab in the current window if it is a normal web page
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (active && isSupportedUrl(active.url)) return active
      // Otherwise, pick the first http/https tab in the current window
      const all = await chrome.tabs.query({ currentWindow: true })
      const httpTab = all.find(t => isSupportedUrl(t.url))
      return httpTab || null
    } catch (e) {
      console.warn('getActiveTab failed (missing tabs permission or restricted page?)', e)
      return null
    }
  }

  const isRestrictedUrl = (url = '') => {
    if (!url) return true
    // Chrome/Edge special pages and Chrome Web Store are not scriptable
    if (url.startsWith('chrome://') || url.startsWith('edge://')) return true
    if (url.startsWith('chrome-extension://')) return true
    if (url.startsWith('https://chromewebstore.google.com') || url.startsWith('https://chrome.google.com/webstore')) return true
    // file:// requires extra permission we don't request
    if (url.startsWith('file://')) return true
    return false
  }

  const readPage = useCallback(async () => {
    try {
      const tab = await getActiveTab()
      if (!tab?.id) throw new Error('No active tab')
      if (isRestrictedUrl(tab.url)) {
        throw new Error('This page is restricted. Open a normal http(s) page.')
      }
      await waitForTabComplete(tab.id)
      const resp = await sendToTabWithRetry(tab.id, { type: 'GET_PAGE_CONTENT' })
      if (!resp?.ok) throw new Error(resp?.error || 'Failed to read page')
      setPageData(resp)
      // Default selection: current tab only
      setSelectedTabIds(prev => prev?.length ? prev : [tab.id])
      setContextCache(cc => ({ ...cc, [tab.id]: { ...resp, tabId: tab.id } }))
      return resp
    } catch (e) {
      console.warn('readPage error', e)
      return null
    }
  }, [])

  // Load tabs list
  const refreshTabs = useCallback(async () => {
    try {
      const t = await chrome.tabs.query({ currentWindow: true })
      setTabs(t.filter(tt => tt.id && isSupportedUrl(tt.url)))
    } catch (e) {
      console.warn('refreshTabs failed (missing tabs permission?)', e)
      setTabs([])
    }
  }, [])

  // Sessions persistence
  const loadSessions = useCallback(async () => {
    const { sessions = [], activeSessionId = '' } = await chrome.storage.local.get(['sessions', 'activeSessionId'])
    if (sessions.length === 0) {
      const newId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      const initial = {
        id: newId,
        title: 'New Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          { role: 'assistant', content: 'Hi! I can summarize this page or chat about it. What would you like to do?' }
        ],
        context: { useContextDefault: true, selectedTabIds: [], contextCache: {} },
      }
      setSessions([initial])
      setActiveSessionId(newId)
      await chrome.storage.local.set({ sessions: [initial], activeSessionId: newId })
    } else {
      setSessions(sessions)
      setActiveSessionId(activeSessionId || sessions[0].id)
      const s = (activeSessionId && sessions.find(x => x.id === activeSessionId)) || sessions[0]
      setUseContextDefault(!!s.context?.useContextDefault)
      setSelectedTabIds(s.context?.selectedTabIds || [])
      setContextCache(s.context?.contextCache || {})
    }
  }, [])

  const saveSessions = useCallback(async (nextSessions, nextActiveId) => {
    setSessions(nextSessions)
    if (nextActiveId) setActiveSessionId(nextActiveId)
    await chrome.storage.local.set({ sessions: nextSessions, activeSessionId: nextActiveId ?? activeSessionId })
  }, [activeSessionId])

  // Keep refs in sync with state to avoid stale closures in listeners
  useEffect(() => { sessionsRef.current = sessions }, [sessions])
  useEffect(() => { activeSessionIdRef.current = activeSessionId }, [activeSessionId])
  useEffect(() => { streamingReqIdRef.current = streamingReqId }, [streamingReqId])

  useEffect(() => {
    // Connect a long-lived port for streaming updates
    try {
      const p = chrome.runtime.connect({ name: 'jan-stream' })
      portRef.current = p
      // Register this port with the current supported tab so background can route deltas correctly
      ;(async () => {
        try {
          const t = await getActiveTab()
          if (t?.id) p.postMessage({ type: 'REGISTER_PORT', tabId: t.id })
        } catch (_) {}
      })()
      const onMsg = async (msg) => {
        // Only handle messages for the current streaming request (if any)
        if (!msg) return
        const currentReq = streamingReqIdRef.current
        if (msg.reqId && currentReq && msg.reqId !== currentReq) return
        if (msg.type === 'CHAT_STREAM_BEGIN') {
          // Append empty assistant message to fill as deltas arrive
          const aId = activeSessionIdRef.current
          setSessions(prev => {
            const idx = prev.findIndex(s => s.id === aId)
            if (idx < 0) return prev
            const next = [...prev]
            const s = { ...next[idx], messages: [...next[idx].messages] }
            s.messages.push({ role: 'assistant', content: '' })
            s.updatedAt = Date.now()
            next[idx] = s
            return next
          })
        } else if (msg.type === 'CHAT_STREAM_DELTA') {
          const aId = activeSessionIdRef.current
          const delta = msg.delta || ''
          setSessions(prev => {
            const idx = prev.findIndex(s => s.id === aId)
            if (idx < 0) return prev
            const next = [...prev]
            const s = { ...next[idx], messages: [...next[idx].messages] }
            const last = s.messages[s.messages.length - 1]
            if (last && last.role === 'assistant') {
              last.content = (last.content || '') + delta
              next[idx] = s
              return next
            }
            return prev
          })
        } else if (msg.type === 'CHAT_STREAM_DONE') {
          // Mark updated and persist on done
          const aId = activeSessionIdRef.current
          await new Promise(resolve => {
            setSessions(prev => {
              const idx = prev.findIndex(s => s.id === aId)
              if (idx < 0) { resolve(); return prev }
              const next = [...prev]
              const s = { ...next[idx] }
              s.updatedAt = Date.now()
              next[idx] = s
              resolve()
              return next
            })
          })
          const toSave = sessionsRef.current
          await saveSessions(toSave)
          setStreamingReqId(null)
        } else if (msg.type === 'CHAT_STREAM_ERROR') {
          const aId = activeSessionIdRef.current
          await new Promise(resolve => {
            setSessions(prev => {
              const idx = prev.findIndex(s => s.id === aId)
              if (idx < 0) { resolve(); return prev }
              const next = [...prev]
              const s = { ...next[idx], messages: [...next[idx].messages, { role: 'assistant', content: `Error: ${msg.error}` }] }
              s.updatedAt = Date.now()
              next[idx] = s
              resolve()
              return next
            })
          })
          await saveSessions(sessionsRef.current)
          setStreamingReqId(null)
        }
      }
      p.onMessage.addListener(onMsg)
      // Cleanup on unmount
      return () => {
        try { p.onMessage.removeListener(onMsg) } catch (_) {}
        try { p.disconnect() } catch (_) {}
      }
    } catch (_) { /* ignore */ }

  }, [])

  // Load initial data on mount (separate from the port effect which returns a cleanup)
  useEffect(() => {
    // Do not auto-scrape on mount to avoid errors on restricted pages
    refreshTabs()
    loadSessions()
  }, [refreshTabs, loadSessions])

  // Persist on unload/close of the side panel
  useEffect(() => {
    const persist = () => {
      const ss = sessionsRef.current
      const aId = activeSessionIdRef.current
      try { chrome.storage.local.set({ sessions: ss, activeSessionId: aId }) } catch (_) {}
    }
    window.addEventListener('beforeunload', persist)
    window.addEventListener('pagehide', persist)
    return () => {
      window.removeEventListener('beforeunload', persist)
      window.removeEventListener('pagehide', persist)
    }
  }, [])

  const summarize = useCallback(async (useSelection) => {
    const pd = pageData || (await readPage())
    if (!pd) return
    setBusy(true)
    try {
      const payload = {
        ...pd,
        content: useSelection ? '' : pd.content,
        selection: useSelection ? pd.selection : ''
      }
      // Append to active session
      const idx = sessions.findIndex(s => s.id === activeSessionId)
      const nextSessions = [...sessions]
      const s = nextSessions[idx]
      s.messages = [...s.messages, { role: 'user', content: useSelection ? 'Summarize my selection.' : 'Summarize this page.' }]
      s.updatedAt = Date.now()
      await saveSessions(nextSessions)
      const res = await chrome.runtime.sendMessage({ type: 'SUMMARIZE', payload })
      if (!res?.ok) throw new Error(res?.error || 'Unknown error')
      s.messages = [...s.messages, { role: 'assistant', content: res.summary }]
      s.updatedAt = Date.now()
      await saveSessions(nextSessions)
    } catch (e) {
      const idx = sessions.findIndex(s => s.id === activeSessionId)
      if (idx >= 0) {
        const nextSessions = [...sessions]
        nextSessions[idx].messages = [...nextSessions[idx].messages, { role: 'assistant', content: `Error: ${e.message}` }]
        nextSessions[idx].updatedAt = Date.now()
        await saveSessions(nextSessions)
      }
    } finally {
      setBusy(false)
    }
  }, [pageData, readPage, sessions, activeSessionId, saveSessions])

  const buildContextMessages = (contexts) => {
    if (!contexts || contexts.length === 0) return []
    const parts = contexts.map(c => {
      const head = [c.title ? `Title: ${c.title}` : null, c.url ? `URL: ${c.url}` : null].filter(Boolean).join(' | ')
      const meta = c.metaDescription ? `Meta: ${c.metaDescription}` : ''
      const snippet = (c.selection?.trim() || c.content?.trim() || '').slice(0, 2000)
      return [`[Tab] ${head}`, meta, snippet].filter(Boolean).join('\n')
    }).join('\n\n----\n\n')
    return [
      { role: 'system', content: 'The following context comes from the user\'s selected browser tabs. Use it to answer queries accurately. Do not fabricate URLs.' },
      { role: 'user', content: `Context:\n\n${parts}` }
    ]
  }

  const scrapeSelectedTabs = useCallback(async (tabIds) => {
    const results = []
    for (const id of tabIds) {
      try {
        await waitForTabComplete(id)
        const resp = await sendToTabWithRetry(id, { type: 'GET_PAGE_CONTENT' })
        if (resp?.ok) {
          results.push({ ...resp, tabId: id })
        }
      } catch (_) { /* ignore */ }
    }
    return results
  }, [])

  const rescrapeSelected = useCallback(async () => {
    const ids = selectedTabIds && selectedTabIds.length ? selectedTabIds : []
    if (!ids.length) return
    const scraped = await scrapeSelectedTabs(ids)
    if (scraped.length) {
      const next = { ...contextCache }
      scraped.forEach(r => { next[r.tabId] = r })
      setContextCache(next)
    }
  }, [selectedTabIds, scrapeSelectedTabs, contextCache])

  const sendChat = useCallback(async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    setBusy(true)
    // Append user message to active session
    const sIdx = sessions.findIndex(s => s.id === activeSessionId)
    if (sIdx < 0) return setBusy(false)
    const nextSessions = [...sessions]
    const sess = nextSessions[sIdx]
    sess.messages = [...sess.messages, { role: 'user', content: text }]
    sess.updatedAt = Date.now()
    await saveSessions(nextSessions)
    try {
      // Determine contexts
      const wantContext = useContextThisMsg || useContextDefault
      let contexts = []
      let cache = { ...contextCache }
      const tabsToUse = (selectedTabIds && selectedTabIds.length) ? selectedTabIds : (pageData ? [ (await getActiveTab())?.id ].filter(Boolean) : [])
      if (wantContext) {
        // Scrape missing tabs
        const missing = tabsToUse.filter(id => !cache[id])
        if (missing.length) {
          const scraped = await scrapeSelectedTabs(missing)
          scraped.forEach(r => { cache[r.tabId] = r })
          setContextCache(cache)
        }
        contexts = tabsToUse.map(id => cache[id]).filter(Boolean)
      }
      // Prefer streaming
      const active = nextSessions[sIdx]
      const baseMessages = active.messages
      const msgs = wantContext ? [...buildContextMessages(contexts), ...baseMessages] : baseMessages
      const reqId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      setStreamingReqId(reqId)
      streamingReqIdRef.current = reqId
      const tab = await getActiveTab()
      const ack = await chrome.runtime.sendMessage({ type: 'CHAT_COMPLETION_STREAM_START', payload: { messages: msgs, reqId, tabId: tab?.id } })
      if (!ack?.ok) {
        setStreamingReqId(null)
        throw new Error(ack?.error || 'stream start failed')
      }
    } catch (e) {
      const sIdx2 = sessions.findIndex(s => s.id === activeSessionId)
      if (sIdx2 >= 0) {
        const next = [...sessions]
        next[sIdx2].messages = [...next[sIdx2].messages, { role: 'assistant', content: `Error: ${e.message}` }]
        next[sIdx2].updatedAt = Date.now()
        await saveSessions(next)
      }
    } finally {
      setBusy(false)
    }
  }, [input, sessions, activeSessionId, useContextThisMsg, useContextDefault, contextCache, pageData, selectedTabIds, saveSessions, scrapeSelectedTabs])

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendChat()
    }
  }


  const toggleTab = (id) => {
    setSelectedTabIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const newChat = async () => {
    const newId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
    const s = {
      id: newId,
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [ { role: 'assistant', content: 'New chat created. How can I help?' } ],
      context: { useContextDefault, selectedTabIds, contextCache },
    }
    const next = [s, ...sessions]
    await saveSessions(next, newId)
  }

  const switchSession = async (id) => {
    const s = sessions.find(x => x.id === id)
    if (!s) return
    setActiveSessionId(id)
    setUseContextDefault(!!s.context?.useContextDefault)
    setSelectedTabIds(s.context?.selectedTabIds || [])
    setContextCache(s.context?.contextCache || {})
    await chrome.storage.local.set({ activeSessionId: id })
  }

  const persistContext = useCallback(async () => {
    const idx = sessions.findIndex(s => s.id === activeSessionId)
    if (idx < 0) return
    const next = [...sessions]
    next[idx] = {
      ...next[idx],
      context: { useContextDefault, selectedTabIds, contextCache },
      updatedAt: Date.now(),
    }
    await saveSessions(next)
  }, [sessions, activeSessionId, useContextDefault, selectedTabIds, contextCache, saveSessions])

  useEffect(() => { persistContext() }, [useContextDefault, selectedTabIds, contextCache])

  return (
    <div className="h-screen ds-bg ds-text grid" style={{ gridTemplateColumns: sidebarOpen ? '220px 1fr' : '1fr' }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="border-r ds-border flex flex-col overflow-hidden">
          <div className="p-2 flex items-center justify-between ds-card border-b ds-border">
            <div className="flex items-center gap-2"><img src={Hand} className="h-4 w-4" /> <span className="font-semibold">Jan</span></div>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)}>←</button>
          </div>
          <div className="p-2"><button className="btn w-full" onClick={newChat}>New Chat</button></div>
          <div className="px-2 text-xs ds-muted-text">Chats</div>
          <div className="flex-1 overflow-auto px-2 space-y-1 py-2">
            {sessions.map(s => (
              <button key={s.id} onClick={() => switchSession(s.id)} className={`w-full text-left rounded-md px-2 py-2 border ${s.id === activeSessionId ? 'border-blue-500' : ''}`} style={{ borderColor: s.id === activeSessionId ? '#3b82f6' : 'var(--border)', background: 'var(--card)' }}>
                <div className="text-sm truncate">{s.title || 'Untitled'}</div>
                <div className="text-xs ds-muted-text">{new Date(s.updatedAt).toLocaleTimeString()}</div>
              </button>
            ))}
          </div>
          <div className="p-2 border-t ds-border">
            <div className="text-xs ds-muted-text mb-1">Context Tabs (default: current)</div>
            <div className="max-h-40 overflow-auto space-y-1">
              {tabs.map(t => (
                <label key={t.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={selectedTabIds.includes(t.id)} onChange={() => toggleTab(t.id)} />
                  <span className="truncate" title={t.title}>{t.title}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button className="btn" onClick={refreshTabs}>Refresh</button>
              <button className="btn" onClick={rescrapeSelected} disabled={!selectedTabIds.length}>Scrape</button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <label className="flex items-center gap-2"><input type="checkbox" checked={useContextDefault} onChange={e => setUseContextDefault(e.target.checked)} /> Use context by default</label>
            </div>
          </div>
        </aside>
      )}

      {/* Main column */}
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b ds-border ds-card">
          <div className="flex items-center gap-2">
            {!sidebarOpen && <button className="icon-btn" onClick={() => setSidebarOpen(true)}>☰</button>}
            <img src={Hand} alt="Jan" className="h-5 w-5" />
            <span className="font-semibold">Jan</span>
            <span className="text-sm ds-muted-text">Summarizer & Chat</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => summarize(false)} disabled={busy}>Summarize Page</button>
            <button className="btn" onClick={() => summarize(true)} disabled={busy}>Summarize Selection</button>
            <button className="icon-btn" title="Settings" onClick={() => chrome.runtime.openOptionsPage?.()}>⚙️</button>
          </div>
        </header>

        <main ref={listRef} className="flex-1 overflow-auto p-3 space-y-1">
          {messages.map((m, i) => (
            <Message key={i} role={m.role} content={m.content} onCopy={copyToClipboard} />
          ))}
        </main>

        <footer className="p-3 border-t ds-border ds-card">
          <div className="flex items-end gap-2">
            <textarea
              className="flex-1 resize-none min-h-[44px] max-h-40 rounded-xl ds-muted-bg ds-text p-2 outline-none"
              placeholder={busy ? 'Working…' : 'Ask anything…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy}
            />
            <div className="flex flex-col items-end gap-2">
              <label className="text-xs ds-muted-text flex items-center gap-2">
                <input type="checkbox" checked={useContextThisMsg} onChange={e => setUseContextThisMsg(e.target.checked)} /> Use context this message
              </label>
              {streamingReqId ? (
                <button className="btn" onClick={stopStreaming}>Stop</button>
              ) : (
                <button className="btn" onClick={sendChat} disabled={busy || !input.trim()}>Send</button>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
