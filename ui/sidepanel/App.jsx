import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.min.css'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Button } from '../components/ui/button.jsx'
import { Textarea } from '../components/ui/textarea.jsx'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import * as Popover from '@radix-ui/react-popover'
import { User as UserIcon, Send, Copy as CopyIcon, Bot, X as XIcon, Plus as PlusIcon, RefreshCw as RefreshIcon, Check as CheckIcon, Search as SearchIcon, Settings as SettingsIcon, Sun as SunIcon, Moon as MoonIcon, Laptop as LaptopIcon, Trash2 as TrashIcon } from 'lucide-react'
import { Input } from '../components/ui/input.jsx'

function Message({ role, content, ts, isFirst, isLast, onCopy }) {
  const isUser = role === 'user'
  // Bubble for user; assistant will be clean typography (no bubble)
  const radius = [
    'rounded-2xl',
    !isFirst ? (isUser ? 'rounded-tr-md' : 'rounded-tl-md') : '',
    !isLast ? (isUser ? 'rounded-br-md' : 'rounded-bl-md') : ''
  ].filter(Boolean).join(' ')
  const sanitizeSchema = useMemo(() => ({
    ...defaultSchema,
    attributes: {
      ...defaultSchema.attributes,
      code: [...(defaultSchema.attributes?.code || []), ['className']],
      pre: [...(defaultSchema.attributes?.pre || []), ['className']],
      span: [...(defaultSchema.attributes?.span || []), ['className']],
      a: [ ...(defaultSchema.attributes?.a || []), ['target'], ['rel'] ],
    },
  }), [])
  const formatTime = (t) => {
    if (!t) return ''
    try {
      const d = new Date(t)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  return (
    <div className={`w-full ${isUser ? 'justify-end' : 'justify-start'} mb-1 flex`}>
      <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`hidden sm:flex shrink-0 h-6 w-6 rounded-full bg-muted text-muted-foreground items-center justify-center ${isLast ? '' : 'invisible'}`}>
          {isUser ? <UserIcon size={14} /> : <Bot size={14} />}
        </div>
        <div className={`${isUser ? `group pastel-grad pastel-fore relative max-w-[100%] sm:max-w-[75%] ${radius} px-3 py-2 text-sm` : 'group relative max-w-[100%] sm:max-w-[75%]'}`}>
          {isUser ? (
            <div className="whitespace-pre-wrap">{content}</div>
          ) : (
            <div className="max-w-none break-words ai-typography">
              {(content && String(content).trim().length > 0) ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[[rehypeSanitize, sanitizeSchema], rehypeHighlight]}
                  components={{
                    code({ node, inline, className, children, ...props }) {
                      const text = String(children || '')
                      if (inline) return <code className="px-1 py-0.5 rounded ds-muted-bg">{text}</code>
                      const copyCode = async () => { try { await navigator.clipboard.writeText(text) } catch (_) {} }
                      return (
                        <div className="relative my-2">
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <Button variant="ghost" size="icon" className="absolute top-1 right-1" onClick={copyCode} aria-label="Copy code">
                                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 7a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V7zm-4 4V6a2 2 0 0 1 2-2h7v2H7v5H5zm4 5h7V7h-7v9z"/></svg>
                              </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content sideOffset={6} className="text-xs ds-card ds-text border ds-border rounded px-2 py-1">Copy code</Tooltip.Content>
                          </Tooltip.Root>
                          <pre className="overflow-auto bg-card border ds-border p-2 rounded"><code className={className} {...props}>{text}</code></pre>
                        </div>
                      )
                    }
                  }}
                >
                  {content || ''}
                </ReactMarkdown>
              ) : (
                <div className="inline-flex items-center gap-2 text-sm ds-muted-text">
                  <span className="spinner" aria-hidden="true" />
                  <span>Thinking…</span>
                </div>
              )}
            </div>
          )}
          {!isUser ? (
            <div className="mt-3 pt-2 border-t ds-border flex justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onCopy?.(content)} aria-label="Copy">
                <CopyIcon size={14} className="mr-1" /> Copy
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  // UI state
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tabPickerOpen, setTabPickerOpen] = useState(false)
  const [tabQuery, setTabQuery] = useState('')
  // Theme: 'system' | 'light' | 'dark'
  const [themePref, setThemePref] = useState('system')
  const mqRef = useRef(null)

  // Page/context state
  const [pageData, setPageData] = useState(null)
  const [tabs, setTabs] = useState([])
  const [useContextDefault, setUseContextDefault] = useState(true) // Option A default
  const [useContextThisMsg, setUseContextThisMsg] = useState(true) // Option B per message
  const [selectedTabIds, setSelectedTabIds] = useState([]) // default to current tab later
  const [contextCache, setContextCache] = useState({}) // { [tabId]: pageData }
  const [tabSessionMap, setTabSessionMap] = useState({}) // { [tabId]: sessionId }
  const [selectionText, setSelectionText] = useState('')

  // Sessions (history)
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [sessionTitle, setSessionTitle] = useState('')

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
    try { el.scrollTop = el.scrollHeight } catch (_) {}
  }

  // Derived active session (must be before effects that depend on `messages`)
  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId) || null, [sessions, activeSessionId])
  const filteredTabs = useMemo(() => {
    const q = tabQuery.trim().toLowerCase()
    if (!q) return tabs
    return tabs.filter(t => (t.title || '').toLowerCase().includes(q) || String(t.id).includes(q))
  }, [tabs, tabQuery])
  const messages = activeSession?.messages || []

  const isSupportedUrl = (url) => /^https?:\/\//.test(url || '')

  // Open a Google search for the given query (or current input)
  const openGoogleSearch = (q) => {
    const query = (q ?? input ?? '').trim()
    if (!query) return
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`
    try {
      if (chrome?.tabs?.create) {
        chrome.tabs.create({ url })
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Theme application helpers
  const getSystemDark = () => {
    try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches } catch { return false }
  }
  const applyTheme = useCallback((pref) => {
    const root = document.documentElement
    const effectiveDark = pref === 'dark' ? true : (pref === 'light' ? false : getSystemDark())
    try {
      if (effectiveDark) root.classList.add('dark')
      else root.classList.remove('dark')
    } catch (_) {}
  }, [])

  // Load theme pref and react to changes
  useEffect(() => {
    (async () => {
      try {
        const { themePref: saved } = await chrome.storage.sync.get(['themePref'])
        const pref = saved || 'system'
        setThemePref(pref)
        applyTheme(pref)
      } catch (_) {
        applyTheme('system')
      }
    })()
  }, [applyTheme])

  // Respond to system theme changes when on 'system'
  useEffect(() => {
    try {
      if (mqRef.current) { mqRef.current.onchange = null; mqRef.current = null }
      if (themePref === 'system' && window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        mqRef.current = mq
        mq.onchange = () => applyTheme('system')
      }
    } catch (_) {}
    applyTheme(themePref)
    return () => { try { if (mqRef.current) mqRef.current.onchange = null } catch (_) {} }
  }, [themePref, applyTheme])

  const cycleTheme = () => {
    const order = ['system', 'light', 'dark']
    const idx = order.indexOf(themePref)
    const next = order[(idx + 1) % order.length]
    setThemePref(next)
    try { chrome.storage.sync.set({ themePref: next }) } catch (_) {}
  }

  // React live to changes from Options page
  useEffect(() => {
    const handler = (changes, area) => {
      try {
        if (area === 'sync' && changes?.themePref) {
          const next = changes.themePref.newValue || 'system'
          setThemePref(next)
        }
      } catch (_) {}
    }
    try { chrome.storage.onChanged.addListener(handler) } catch (_) {}
    return () => { try { chrome.storage.onChanged.removeListener(handler) } catch (_) {} }
  }, [])

  const delay = (ms) => new Promise(res => setTimeout(res, ms))

  // Per-tab session mapping helpers
  const loadTabSessionMap = useCallback(async () => {
    try {
      const { tabSessionMap: saved = {} } = await chrome.storage.local.get(['tabSessionMap'])
      setTabSessionMap(saved || {})
      return saved || {}
    } catch (_) {
      setTabSessionMap({})
      return {}
    }
  }, [])

  const setTabSessionForTab = useCallback(async (tabId, sessionId) => {
    try {
      const next = { ...(tabSessionMap || {}), [tabId]: sessionId }
      setTabSessionMap(next)
      await chrome.storage.local.set({ tabSessionMap: next })
    } catch (_) {}
  }, [tabSessionMap])

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
        title: 'Jan',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          { role: 'assistant', content: 'Hi! I can summarize this page or chat about it. What would you like to do?', ts: Date.now() }
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
      setSessionTitle(s.title)
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
            s.messages.push({ role: 'assistant', content: '', ts: Date.now() })
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
              const s = { ...next[idx], messages: [...next[idx].messages, { role: 'assistant', content: `Error: ${msg.error}`, ts: Date.now() }] }
              s.updatedAt = Date.now()
              next[idx] = s
              resolve()
              return next
            })
          })
          await saveSessions(sessionsRef.current)
          setStreamingReqId(null)
        } else if (msg.type === 'SELECTION_UPDATED') {
          const s = String(msg.selection || '')
          setSelectionText(s)
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

  // Load per-tab session map on mount
  useEffect(() => { loadTabSessionMap() }, [loadTabSessionMap])

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

  // Ensure the side panel follows the current tab: re-register port and switch to that tab's mapped session
  useEffect(() => {
    const onActivated = async (activeInfo) => {
      try {
        const t = await chrome.tabs.get(activeInfo.tabId)
        if (!t?.id || !isSupportedUrl(t.url)) return
        // Keep tabs list fresh
        refreshTabs()
        // Route streaming to the newly active tab
        try { if (portRef.current) portRef.current.postMessage({ type: 'REGISTER_PORT', tabId: t.id }) } catch (_) {}
        // Switch to the session mapped to this tab, if any
        const map = await loadTabSessionMap()
        const sid = map[t.id]
        if (sid && sid !== activeSessionIdRef.current && sessionsRef.current.find(s => s.id === sid)) {
          await switchSession(sid)
        }
      } catch (_) {}
    }
    try { chrome.tabs.onActivated.addListener(onActivated) } catch (_) {}
    return () => { try { chrome.tabs.onActivated.removeListener(onActivated) } catch (_) {} }
  }, [refreshTabs, loadTabSessionMap])

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
      s.messages = [...s.messages, { role: 'user', content: useSelection ? 'Summarize my selection.' : 'Summarize this page.', ts: Date.now() }]
      s.updatedAt = Date.now()
      await saveSessions(nextSessions)
      const res = await chrome.runtime.sendMessage({ type: 'SUMMARIZE', payload })
      if (!res?.ok) throw new Error(res?.error || 'Unknown error')
      s.messages = [...s.messages, { role: 'assistant', content: res.summary, ts: Date.now() }]
      s.updatedAt = Date.now()
      await saveSessions(nextSessions)
    } catch (e) {
      const idx = sessions.findIndex(s => s.id === activeSessionId)
      if (idx >= 0) {
        const nextSessions = [...sessions]
        nextSessions[idx].messages = [...nextSessions[idx].messages, { role: 'assistant', content: `Error: ${e.message}`, ts: Date.now() }]
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
      return `[Tab] ${head}\n${[meta, snippet].filter(Boolean).join('\n')}`
    }).join('\n\n----\n\n')
    return [
      { role: 'system', content: `You have additional context from selected browser tabs. Use it only if relevant.\n\n${parts}` }
    ]
  }

  const buildGoogleMessages = (serp) => {
    if (!serp || !serp.ok) return []
    const data = serp.data || {}
    const lines = []
    if (data.answerBox) {
      lines.push(`Answer box:\n${data.answerBox.trim().slice(0, 800)}`)
    }
    const results = Array.isArray(data.results) ? data.results.slice(0, 5) : []
    results.forEach((r, i) => {
      const title = (r?.title || '').trim()
      const url = (r?.url || '').trim()
      const snip = (r?.snippet || '').trim()
      lines.push(`${i + 1}. ${title}${url ? `\n${url}` : ''}${snip ? `\n${snip}` : ''}`)
    })
    if (!lines.length) return []
    const header = data.query ? `Fresh Google results for: "${data.query}"` : 'Fresh Google results'
    return [{ role: 'system', content: `${header}\n\n${lines.join('\n\n')}` }]
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
    sess.messages = [...sess.messages, { role: 'user', content: text, ts: Date.now() }]
    sess.updatedAt = Date.now()
    if (!sessionTitle) {
      setSessionTitle(text)
      nextSessions[sIdx].title = text
    }
    await saveSessions(nextSessions)
    try {
      // Determine contexts
      const wantContext = useContextThisMsg || useContextDefault
      let contexts = []
      let cache = { ...contextCache }
      const activeTab = await getActiveTab()
      const tabsToUse = (selectedTabIds && selectedTabIds.length) ? selectedTabIds : [activeTab?.id].filter(Boolean)
      if (tabsToUse.length) {
        // Always re-scrape targeted tabs to keep content fresh in cache
        const scraped = await scrapeSelectedTabs(tabsToUse)
        scraped.forEach(r => { cache[r.tabId] = r })
        setContextCache(cache)
        // Persist the refreshed context into the active session
        const idxCtx = nextSessions.findIndex(s => s.id === activeSessionId)
        if (idxCtx >= 0) {
          const updated = { ...nextSessions[idxCtx], context: { useContextDefault, selectedTabIds: tabsToUse, contextCache: cache } }
          nextSessions[idxCtx] = updated
          await saveSessions(nextSessions)
        }
        if (wantContext) contexts = tabsToUse.map(id => cache[id]).filter(Boolean)
      }
      // Prefer streaming
      const active = nextSessions[sIdx]
      const baseMessages = active.messages
      const msgs = wantContext ? [...buildContextMessages(contexts), ...baseMessages] : baseMessages
      const reqId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      setStreamingReqId(reqId)
      streamingReqIdRef.current = reqId
      const tab = activeTab || await getActiveTab()
      // Ensure background routes stream messages to this UI by re-registering the port with the active tab
      try { if (tab?.id && portRef.current) portRef.current.postMessage({ type: 'REGISTER_PORT', tabId: tab.id }) } catch (_) {}
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

  const askWithGoogle = useCallback(async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    setBusy(true)
    const sIdx = sessions.findIndex(s => s.id === activeSessionId)
    if (sIdx < 0) return setBusy(false)
    const nextSessions = [...sessions]
    const sess = nextSessions[sIdx]
    sess.messages = [...sess.messages, { role: 'user', content: text, ts: Date.now() }]
    sess.updatedAt = Date.now()
    if (!sessionTitle) {
      setSessionTitle(text)
      nextSessions[sIdx].title = text
    }
    await saveSessions(nextSessions)
    try {
      // Get Google SERP
      let serp = null
      try {
        serp = await chrome.runtime.sendMessage({ type: 'GOOGLE_SEARCH_AND_SCRAPE', payload: { query: text, closeTab: true } })
      } catch (_) { serp = null }
      const googleMsgs = buildGoogleMessages(serp)
      // Determine contexts (tabs)
      const wantContext = useContextThisMsg || useContextDefault
      let contexts = []
      let cache = { ...contextCache }
      const activeTab = await getActiveTab()
      const tabsToUse = (selectedTabIds && selectedTabIds.length) ? selectedTabIds : [activeTab?.id].filter(Boolean)
      if (tabsToUse.length) {
        // Always re-scrape targeted tabs to keep content fresh in cache
        const scraped = await scrapeSelectedTabs(tabsToUse)
        scraped.forEach(r => { cache[r.tabId] = r })
        setContextCache(cache)
        // Persist refreshed context into the active session
        const idxCtx = nextSessions.findIndex(s => s.id === activeSessionId)
        if (idxCtx >= 0) {
          const updated = { ...nextSessions[idxCtx], context: { useContextDefault, selectedTabIds: tabsToUse, contextCache: cache } }
          nextSessions[idxCtx] = updated
          await saveSessions(nextSessions)
        }
        if (wantContext) contexts = tabsToUse.map(id => cache[id]).filter(Boolean)
      }
      const active = nextSessions[sIdx]
      const baseMessages = active.messages
      const prepended = [
        ...googleMsgs,
        ...(wantContext ? buildContextMessages(contexts) : [])
      ]
      const msgs = prepended.length ? [...prepended, ...baseMessages] : baseMessages
      const reqId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      setStreamingReqId(reqId)
      streamingReqIdRef.current = reqId
      const tab = activeTab || await getActiveTab()
      try { if (tab?.id && portRef.current) portRef.current.postMessage({ type: 'REGISTER_PORT', tabId: tab.id }) } catch (_) {}
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
  }, [input, sessions, activeSessionId, sessionTitle, useContextThisMsg, useContextDefault, contextCache, pageData, selectedTabIds, saveSessions, scrapeSelectedTabs])

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
      title: 'Jan',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      context: { useContextDefault, selectedTabIds, contextCache },
    }
    const next = [s, ...sessions]
    await saveSessions(next, newId)
    try {
      const t = await getActiveTab()
      if (t?.id) await setTabSessionForTab(t.id, newId)
    } catch (_) {}
  }

  const deleteChat = async (id) => {
    const targetId = id || activeSessionId
    const idx = sessions.findIndex(s => s.id === targetId)
    if (idx < 0) return
    const next = sessions.filter(s => s.id !== targetId)
    if (next.length === 0) {
      // If no sessions remain, create a fresh one
      const newId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      const initial = {
        id: newId,
        title: 'Jan',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        context: { useContextDefault: true, selectedTabIds: [], contextCache: {} },
      }
      await saveSessions([initial], newId)
      setUseContextDefault(true)
      setSelectedTabIds([])
      setContextCache({})
      setSessionTitle(initial.title)
      return
    }
    const nextActive = targetId === activeSessionId ? next[0].id : activeSessionId
    await saveSessions(next, nextActive)
    // Sync dependent state when switching
    const s = next.find(x => x.id === nextActive)
    if (s) {
      setUseContextDefault(!!s.context?.useContextDefault)
      setSelectedTabIds(s.context?.selectedTabIds || [])
      setContextCache(s.context?.contextCache || {})
      setSessionTitle(s.title)
    }
    try {
      const t = await getActiveTab()
      if (t?.id) await setTabSessionForTab(t.id, nextActive)
    } catch (_) {}
  }

  const switchSession = async (id) => {
    const s = sessions.find(x => x.id === id)
    if (!s) return
    setActiveSessionId(id)
    setUseContextDefault(!!s.context?.useContextDefault)
    setSelectedTabIds(s.context?.selectedTabIds || [])
    setContextCache(s.context?.contextCache || {})
    setSessionTitle(s.title)
    await chrome.storage.local.set({ activeSessionId: id })
    try {
      const t = await getActiveTab()
      if (t?.id) await setTabSessionForTab(t.id, id)
    } catch (_) {}
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
          <div className="p-2 flex items-center justify-between ds-card border-b ds-border pastel-grad">
            <div className="flex items-center gap-2"><span className="font-semibold">Chats</span></div>
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} aria-label="Collapse sidebar">←</Button>
          </div>
          <div className="p-2"><Button variant="secondary" className="w-full" onClick={newChat}>New Chat</Button></div>
          <div className="px-2 text-xs ds-muted-text">Chats</div>
          <div className="flex-1 overflow-auto px-2 space-y-1 py-2">
            {sessions.map(s => (
              <div key={s.id} className={`w-full rounded-md px-2 py-2 border ${s.id === activeSessionId ? 'border-blue-500' : ''}`} style={{ borderColor: s.id === activeSessionId ? '#3b82f6' : 'var(--border)', background: 'var(--card)' }}>
                <div className="flex items-center gap-2">
                  <button onClick={() => switchSession(s.id)} className="flex-1 text-left min-w-0">
                    <div className="text-sm truncate">{s.title || 'Untitled'}</div>
                    <div className="text-[10px] ds-muted-text">{new Date(s.updatedAt).toLocaleString()}</div>
                  </button>
                  <Button variant="ghost" size="icon" title="Delete" onClick={(e) => { e.stopPropagation(); deleteChat(s.id) }}>
                    <TrashIcon size={14} />
                  </Button>
                </div>
              </div>
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
              <Button variant="secondary" onClick={refreshTabs}>Refresh</Button>
              <Button variant="pastelReverse" onClick={rescrapeSelected} disabled={!selectedTabIds.length}>Scrape</Button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <label className="flex items-center gap-2"><input type="checkbox" checked={useContextDefault} onChange={e => setUseContextDefault(e.target.checked)} /> Use context by default</label>
            </div>
          </div>
        </aside>
      )}

      {/* Main column */}
      <div className="flex flex-col min-w-0">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between px-3 py-2 bg-transparent">
          <div className="flex items-center gap-2 min-w-0">
            {!sidebarOpen && <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Expand sidebar">☰</Button>}
            <span className="font-semibold truncate max-w-[60vw] min-w-0">{sessionTitle || 'Jan'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={newChat}
              aria-label="New Chat"
              title="New Chat"
            >
              <PlusIcon size={14} className="mr-1" /> New
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteChat()}
              aria-label="Delete Chat"
              title="Delete Chat"
            >
              <TrashIcon size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleTheme}
              aria-label={`Theme: ${themePref}`}
              title={`Theme: ${themePref}`}
            >
              {themePref === 'system' ? <LaptopIcon size={16} /> : themePref === 'light' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { try { chrome.runtime.openOptionsPage() } catch (_) {} }}
              aria-label="Settings"
              title="Settings"
            >
              <SettingsIcon size={16} />
            </Button>
          </div>
        </header>

        <ScrollArea.Root className="flex-1">
          <ScrollArea.Viewport ref={listRef} className="h-full w-full p-3 pb-28 min-w-0">
            <div className="space-y-6 md:space-y-7">
              {messages
                .filter(m => m.role !== 'system' && !(m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('New chat created')))
                .map((m, i, arr) => {
                  const prevRole = arr[i - 1]?.role
                  const nextRole = arr[i + 1]?.role
                  const isFirst = prevRole !== m.role
                  const isLast = nextRole !== m.role
                  return (
                    <Message
                      key={i}
                      role={m.role}
                      content={m.content}
                      ts={m.ts}
                      isFirst={isFirst}
                      isLast={isLast}
                      onCopy={copyToClipboard}
                    />
                  )
                })}
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar orientation="vertical" className="flex select-none touch-none p-0.5 bg-transparent">
            <ScrollArea.Thumb className="flex-1 rounded-full bg-muted-foreground/30" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>

        <footer className="p-3 sticky bottom-0 z-20 bg-transparent border-transparent composer">
          {/* Current selection preview */}
          {selectionText && selectionText.trim().length > 0 ? (
            <div className="mb-2 p-2 rounded-lg border ds-border bg-card/70 backdrop-blur-sm text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-[11px] opacity-80">Selection</span>
                <div className="flex items-center gap-1 opacity-70">
                  <span title={`${selectionText.length} chars`} className="text-[10px]">{selectionText.length}</span>
                  <Button variant="ghost" size="icon" aria-label="Clear selection preview" onClick={() => setSelectionText('')}>
                    <XIcon size={12} />
                  </Button>
                </div>
              </div>
              <div className="max-h-28 overflow-y-auto whitespace-pre-wrap leading-5">
                {selectionText}
              </div>
            </div>
          ) : null}

          {/* Open tabs chips row */}
          <div className="mb-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
            {tabs.map(t => {
              const selected = selectedTabIds.includes(t.id)
              if (!selected) return null
              return (
                <div
                  key={t.id}
                  className="tab-chip"
                  aria-selected={selected}
                  title={t.title}
                  onClick={() => toggleTab(t.id)}
                  role="button"
                >
                  {t.favIconUrl ? (
                    <img src={t.favIconUrl} alt="" className="h-3.5 w-3.5 rounded-sm" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-sm bg-muted inline-block" />
                  )}
                  <span className="truncate max-w-[30vw] sm:max-w-[240px]">{t.title}</span>
                  <span
                    className="chip-x"
                    role="button"
                    aria-label="Remove tab from context"
                    onClick={(e) => { e.stopPropagation(); toggleTab(t.id) }}
                  >
                    <XIcon size={12} />
                  </span>
                </div>
              )
            })}

            {/* Add tabs popover */}
            <Popover.Root open={tabPickerOpen} onOpenChange={setTabPickerOpen}>
              <Popover.Trigger asChild>
                <button type="button" className="tab-chip add-chip" aria-label="Add tabs" title="Add tabs">
                  <PlusIcon size={14} />
                  <span>Add</span>
                </button>
              </Popover.Trigger>
              <Popover.Content side="top" align="end" className="rounded-xl border ds-border bg-card/80 backdrop-blur-sm shadow-lg p-2 w-[86vw] sm:w-[460px] max-h-[60vh]">
                <div className="flex flex-col gap-2">
                  <Input
                    value={tabQuery}
                    onChange={(e) => setTabQuery(e.target.value)}
                    placeholder="Search tabs..."
                    className="h-8 text-sm"
                  />
                  <div className="overflow-y-auto pr-1" style={{ maxHeight: '48vh' }}>
                    {filteredTabs
                      .filter(t2 => !selectedTabIds.includes(t2.id) && isSupportedUrl(t2.url))
                      .map(t2 => {
                        let host = ''
                        try { host = new URL(t2.url || '').hostname } catch {}
                        return (
                          <button
                            key={t2.id}
                            className="w-full text-left flex items-center gap-2 p-2 rounded-lg border ds-border bg-card/70 hover:bg-card/90"
                            onClick={() => { toggleTab(t2.id); setTabPickerOpen(false); setTabQuery('') }}
                          >
                            {t2.favIconUrl ? (
                              <img src={t2.favIconUrl} alt="" className="h-4 w-4 rounded-sm" />
                            ) : (
                              <span className="h-4 w-4 rounded-sm bg-muted inline-block" />
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-sm">{t2.title || '(untitled tab)'}</div>
                              <div className="truncate text-xs text-muted-foreground">{host}</div>
                            </div>
                            <div className="ml-auto text-xs text-muted-foreground">Add</div>
                          </button>
                        )
                      })}
                    {!filteredTabs.filter(t2 => !selectedTabIds.includes(t2.id) && isSupportedUrl(t2.url)).length ? (
                      <div className="text-xs text-muted-foreground p-2">No other tabs found</div>
                    ) : null}
                  </div>
                </div>
              </Popover.Content>
            </Popover.Root>
          </div>
          <div className="flex items-stretch gap-2">
            <Textarea
              className="w-full flex-1 resize-none min-h-[72px] rounded-2xl text-base leading-6 shadow-lg bg-card/80 border-border/60 backdrop-blur-sm"
              placeholder={(busy || !!streamingReqId) ? 'Working…' : 'Ask anything…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy || !!streamingReqId}
            />
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                title="Search + Ask"
                aria-label="Search + Ask"
                onClick={(e) => {
                  if (e.altKey || e.metaKey) openGoogleSearch(); else askWithGoogle()
                }}
                disabled={busy}
              >
                <SearchIcon size={16} />
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
