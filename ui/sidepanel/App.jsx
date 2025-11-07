import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { animate } from 'framer-motion/dom'
import { Streamdown } from 'streamdown'
import { Button } from '../components/ui/button.jsx'
import { Checkbox } from '../components/ui/checkbox.tsx'
import { ScrollArea } from '../components/ui/scroll-area.tsx'
import * as Tooltip from '../components/ui/tooltip.tsx'
import { Composer } from './components/composer/Composer.jsx'
import { Settings } from './components/Settings.jsx'
import { SuggestionPills } from './components/SuggestionPills.jsx'
import { Navbar } from './components/navbar/Navbar.jsx'
import { User as UserIcon, ArrowUp, Copy as CopyIcon, Bot, X as XIcon, Plus as PlusIcon, RefreshCw as RefreshIcon, Check as CheckIcon, Trash2 as TrashIcon, Paperclip as PaperclipIcon, Mic as MicIcon, Search as SearchIcon, Menu, SlidersHorizontal, Palette as PaletteIcon, NotebookPen as NotebookIcon } from 'lucide-react'
import { SettingsIcon } from './components/icons/SettingsIcon.jsx'
import { ShineBorder } from '../../src/components/magicui/shine-border.tsx'
import { Input } from '../components/ui/input.jsx'
import handSvg from '../assets/jan-hand.svg'

// Helpers at module scope
const hostFromUrl = (url = '') => { try { return new URL(url).hostname || '' } catch { return '' } }

const hueFromString = (s = '') => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360 }
const chipColorForTab = (tab) => { const host = hostFromUrl(tab?.url || ''); const h = hueFromString(host); return `hsl(${h}, 70%, 88%)` }


// Single tab chip with left-side remove and enter/exit animations
function Chip({ tab, onRemove }) {
  const ref = useRef(null)
  // [JAN-BEHAVIOR:AUTO-FOLLOW] on mount, mirror selection to current active tab
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let a
    try { a = animate(el, { opacity: [0, 1], y: [4, 0], scale: [0.98, 1] }, { duration: 0.18, easing: 'ease-out' }) } catch (_) {}
    return () => { try { a?.cancel?.() } catch (_) {} }
  }, [])
  const handleRemove = async (e) => {
    e?.stopPropagation?.()
    const el = ref.current
    try {
      await animate(el, { opacity: [1, 0], y: [0, 2], scale: [1, 0.96] }, { duration: 0.16, easing: 'ease-in' })
    } catch (_) {}
    onRemove?.()
  }

  // Create a brand new empty chat session and switch to it
  const createNewChat = async () => {
    const newId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())
    const initial = {
      id: newId,
      title: 'Jan',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        { role: 'assistant', content: 'New chat created. How can I help?', ts: Date.now() }
      ],
      context: { useContextDefault: true, selectedTabIds: [], contextCache: {}, autoFollowActiveTab: true },
    }
    const next = [initial, ...sessions]
    await saveSessions(next, newId)
  }
  const host = hostFromUrl(tab?.url || '')
  const bg = chipColorForTab(tab)
  return (
    <div ref={ref} className="tab-chip" title={`${tab.title}\n${host}`}>
      <button type="button" className="chip-x ml-0 mr-1" onClick={handleRemove} aria-label="Remove tab">
        <XIcon size={12} />
      </button>
      <span className="chip-ic" style={{ backgroundColor: bg }}>
        {tab.favIconUrl ? (
          <img src={tab.favIconUrl} alt="" className="h-3 w-3" />
        ) : (
          <span className="h-3 w-3 rounded-full bg-muted inline-block" />
        )}
      </span>
      <span className="truncate chip-label">{tab.title || '(untitled tab)'}</span>
    </div>
  )
}

// Hero headline that floats in on first load
function HeroSlogan() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let aEnter
    try {
      aEnter = animate(el, { opacity: [0, 1], y: [-8, 0] }, { duration: 0.28, easing: 'ease-out' })
    } catch (_) {}
    return () => { try { aEnter?.cancel?.() } catch (_) {} }
  }, [])
  return (
    <div ref={ref} className="text-center">
      <div className="font-arapey text-5xl md:text-6xl leading-tight">What do you </div>
      <div className="mt-3 ds-muted-text text-lg">want to do today?</div>
    </div>
  )
}

// Settings button with Motion click animation, opens the Settings component
function SettingsTrigger({ onSettingsOpen }) {
  const btnRef = useRef(null)
  const [active, setActive] = useState(false)
  const onClick = useCallback(async () => {
    const el = btnRef.current
    setActive((v) => !v)
    try {
      // Subtle engage animation
      await animate(
        el,
        { scale: [1, 1.08, 1], rotate: [0, 8, 0] },
        { duration: 0.22, easing: 'ease-out' }
      )
    } catch (_) {}
    // Open Settings component in sidebar
    onSettingsOpen?.()
  }, [onSettingsOpen])
  return (
    <Button
      ref={btnRef}
      variant="ghost"
      size="icon"
      className="rounded-full border ds-border bg-card/80"
      onClick={onClick}
      aria-label="Settings"
      title="Settings"
    >
      <SettingsIcon size={16} className={active ? 'text-foreground' : 'text-foreground/80'} />
    </Button>
  )
}

// Day label helper (plain function; no hooks at module scope)
function dayLabel(ts) {
  try {
    const d = new Date(ts)
    const today = new Date()
    const yest = new Date(); yest.setDate(today.getDate() - 1)
    const dS = d.toDateString()
    if (dS === today.toDateString()) return 'Today'
    if (dS === yest.toDateString()) return 'Yesterday'
    return d.toLocaleDateString()
  } catch { return '' }
}

function Message({ role, content, ts, isFirst, isLast }) {
  const isUser = role === 'user'
  // Bubble for user; assistant will be clean typography (no bubble)
  const radius = [
    'rounded-2xl',
    !isFirst ? (isUser ? 'rounded-tr-md' : 'rounded-tl-md') : '',
    !isLast ? (isUser ? 'rounded-br-md' : 'rounded-bl-md') : ''
  ].filter(Boolean).join(' ')
  const rootRef = useRef(null)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    // Subtle fade + slide-in; direction depends on speaker
    try {
      animate(
        el,
        { opacity: [0, 1], y: [6, 0], x: isUser ? [6, 0] : [-6, 0] },
        { duration: 0.25, easing: 'ease-out' }
      )
    } catch (_) { /* no-op */ }
  }, [isUser])
  const formatTime = (t) => {
    if (!t) return ''
    try {
      const d = new Date(t)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }


  // Local renderer for Markdown code elements with copy feedback
  function CodeBlock({ inline, className, children, ...props }) {
    const [copied, setCopied] = useState(false)
    const text = String(children || '')
    if (inline) return <code className="px-1 py-0.5 rounded ds-muted-bg">{text}</code>
    const langMatch = /language-([\w-]+)/.exec(className || '')
    const lang = (langMatch && langMatch[1]) ? langMatch[1] : ''
    const copyCode = async () => {
      try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch (_) {}
    }
    return (
      <div className="relative my-2">
        {lang ? (
          <div className="absolute top-1 left-2 text-[10px] uppercase tracking-wide ds-muted-text bg-card/70 px-1.5 py-0.5 rounded border ds-border">
            {lang}
          </div>
        ) : null}
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button variant="ghost" size="icon" className="code-copy-btn absolute top-1 right-1" onClick={copyCode} aria-label="Copy code">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 7a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V7zm-4 4V6a2 2 0 0 1 2-2h7v2H7v5H5zm4 5h7V7h-7v9z"/></svg>
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content sideOffset={6} className="text-xs ds-card ds-text border ds-border rounded px-2 py-1">{copied ? 'Copied!' : 'Copy code'}</Tooltip.Content>
        </Tooltip.Root>
        <pre className="overflow-auto bg-card border ds-border p-2 pt-6 rounded"><code className={className} {...props}>{text}</code></pre>
      </div>
    )
  }

  return (
    <div ref={rootRef} className={`w-full ${isUser ? 'justify-end' : 'justify-start'} mb-1 flex`}>
      <div className={`group flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`hidden sm:flex shrink-0 h-6 w-6 rounded-full bg-muted text-muted-foreground items-center justify-center ${isFirst ? '' : 'invisible'}`}>
          {isUser ? <UserIcon size={14} /> : null}
        </div>
        <div className={`${isUser ? `group relative max-w-[100%] sm:max-w-[75%] ${radius} px-3 py-2 text-sm` : 'group relative max-w-[100%] sm:max-w-[75%]'}`} style={isUser ? { backgroundColor: '#E5E5E5', color: '#374151' } : {}}>
          {isUser ? (
            <div className="whitespace-pre-wrap">{content}</div>
          ) : (
            <div className="max-w-none break-words ai-typography">
              {(content && String(content).trim().length > 0) ? (
                <Streamdown
                  parseIncompleteMarkdown
                  components={{
                    code: (props) => <CodeBlock {...props} />,
                  }}
                >
                  {content || ''}
                </Streamdown>
              ) : (
                <div className="flex items-center" aria-label="Thinking">
                  <ThinkingEmoji />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Small waving-hand emoji for thinking state
function ThinkingEmoji() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let controls
    try {
      controls = animate(
        el,
        { rotate: [0, 18, -10, 18, 0] },
        { duration: 1.6, easing: 'ease-in-out', repeat: Infinity }
      )
    } catch (_) {}
    return () => { try { controls?.cancel?.() } catch (_) {} }
  }, [])
  return (
    <div
      ref={ref}
      className="mt-0.5 select-none"
      style={{ transformOrigin: '70% 70%' }}
      aria-hidden="true"
      title="Thinking"
    >
      <span className="text-lg">👋</span>
    </div>
  )
}


// Floating "hello" badge shown on first load
function HelloFloat() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let aEnter, aBob
    try { aEnter = animate(el, { opacity: [0, 1], y: [-8, 0] }, { duration: 0.28, easing: 'ease-out' }) } catch (_) {}
    try { aBob = animate(el, { y: [0, -4, 0] }, { duration: 1.6, easing: 'ease-in-out', repeat: 2 }) } catch (_) {}
    return () => {
      try { aEnter?.cancel?.() } catch (_) {}
      try { aBob?.cancel?.() } catch (_) {}
    }
  }, [])
  return (
    <div ref={ref} className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ds-border bg-card/90 shadow-sm text-sm">
      <span className="font-medium">hi</span>
    </div>
  )
}


export default function App() {
  // UI state
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tabPickerOpen, setTabPickerOpen] = useState(false)
  const [tabQuery, setTabQuery] = useState('')
  // @mention state
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionStart, setMentionStart] = useState(-1)
  const [mentionResults, setMentionResults] = useState([])
  const inputRef = useRef(null)

  // Page/context state
  const [pageData, setPageData] = useState(null)
  const [tabs, setTabs] = useState([])
  const [useContextDefault, setUseContextDefault] = useState(true) // Option A default
  const [useContextThisMsg, setUseContextThisMsg] = useState(true) // Option B per message
  const [selectedTabIds, setSelectedTabIds] = useState([]) // default to current tab later
  const [autoFollowActiveTab, setAutoFollowActiveTab] = useState(true) // if true, auto-sync selectedTabIds to active tab until user manually selects
  const [contextCache, setContextCache] = useState({}) // { [tabId]: pageData }
  const [tabSessionMap, setTabSessionMap] = useState({}) // { [tabId]: sessionId }
  const [selectionText, setSelectionText] = useState('')
  const [bridgeStatus, setBridgeStatus] = useState({ connected: false, usingToken: false, url: '' })
  const [mcpConnectedTabId, setMcpConnectedTabId] = useState(null) // MCP registered tab for agentic workflows
  const [currentActiveTabId, setCurrentActiveTabId] = useState(null) // Track the active browser tab
  // Debug preview state
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugInfo, setDebugInfo] = useState(null)

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
  const lastScrollTopRef = useRef(0)
  const [showReadingOverlay, setShowReadingOverlay] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [showComposerSearchButton, setShowComposerSearchButton] = useState(true)
  const [searchMode, setSearchMode] = useState(false)
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false)

  // Theme state (yellow | blue), persisted to chrome.storage.sync and mirrored to <html> for Radix portals
  const [theme, setTheme] = useState('yellow')
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const { uiTheme } = await chrome.storage.sync.get(['uiTheme'])
        const t = (uiTheme === 'blue' || uiTheme === 'yellow') ? uiTheme : 'yellow'
        if (mounted) setTheme(t)
      } catch (_) {}
    }
    load()
    const onChanged = (changes, area) => {
      try {
        if (area === 'sync' && changes.uiTheme) {
          const t = (changes.uiTheme.newValue === 'blue' || changes.uiTheme.newValue === 'yellow') ? changes.uiTheme.newValue : 'yellow'
          setTheme(t)
        }
      } catch (_) {}
    }
    try { chrome.storage.onChanged.addListener(onChanged) } catch (_) {}
    return () => {
      mounted = false
      try { chrome.storage.onChanged.removeListener(onChanged) } catch (_) {}
    }
  }, [])
  useEffect(() => {
    try { chrome.storage.sync.set({ uiTheme: theme }) } catch (_) {}
    // Mirror theme class to <html> so Radix Portals inherit theme variables
    try {
      const doc = document?.documentElement
      if (doc) {
        doc.classList.remove('theme-blue', 'theme-yellow')
        doc.classList.add(theme === 'blue' ? 'theme-blue' : 'theme-yellow')
      }
    } catch (_) {}
  }, [theme])
  const toggleTheme = useCallback(() => setTheme(t => t === 'blue' ? 'yellow' : 'blue'), [])


  const stopStreaming = useCallback(async () => {
    const id = streamingReqIdRef.current
    if (!id) return
    try { await chrome.runtime.sendMessage({ type: 'CHAT_COMPLETION_STREAM_STOP', payload: { reqId: id } }) } catch (_) {}
  }, [])


  // Derived active session (must be before effects that depend on `messages`)
  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId) || null, [sessions, activeSessionId])
  const filteredTabs = useMemo(() => {
    // LIFO: Unpinned first, then most recently accessed, fallback to rightmost (higher index)
    const ordered = [...tabs].sort((a, b) => {
      const ap = !!a.pinned, bp = !!b.pinned
      if (ap !== bp) return ap ? 1 : -1
      const la = Number(a.lastAccessed || 0), lb = Number(b.lastAccessed || 0)
      if (la && lb && la !== lb) return lb - la
      const ai = Number(a.index ?? 0), bi = Number(b.index ?? 0)
      return bi - ai
    })
    const q = tabQuery.trim().toLowerCase()
    if (!q) return ordered
    return ordered.filter(t => {
      const title = (t.title || '').toLowerCase()
      const url = (t.url || '').toLowerCase()
      return title.includes(q) || url.includes(q) || String(t.id).includes(q)
    })
  }, [tabs, tabQuery])
  const messages = activeSession?.messages || []
  // Selected tabs materialized for chips UI
  const selectedTabs = useMemo(() => tabs.filter(t => selectedTabIds.includes(t.id)), [tabs, selectedTabIds])

  // Load reading overlay preference and subscribe to changes
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const { showReadingOverlay } = await chrome.storage.sync.get(['showReadingOverlay'])
        if (mounted) setShowReadingOverlay(typeof showReadingOverlay === 'boolean' ? showReadingOverlay : false)
      } catch (_) {}
    }
    load()
    const onChanged = (changes, area) => {
      try {
        if (area === 'sync' && changes.showReadingOverlay) {
          setShowReadingOverlay(!!changes.showReadingOverlay.newValue)
        }
      } catch (_) {}
    }
    try { chrome.storage.onChanged.addListener(onChanged) } catch (_) {}
    return () => {
      mounted = false
      try { chrome.storage.onChanged.removeListener(onChanged) } catch (_) {}
    }
  }, [])

  // Load debug preference and subscribe to changes
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const { showDebug } = await chrome.storage.sync.get(['showDebug'])
        if (mounted) setShowDebug(!!showDebug)
      } catch (_) {}
    }
    load()
    const onChanged = (changes, area) => {
      try {
        if (area === 'sync' && changes.showDebug) {
          setShowDebug(!!changes.showDebug.newValue)
        }
      } catch (_) {}
    }
    try { chrome.storage.onChanged.addListener(onChanged) } catch (_) {}
    return () => {
      mounted = false
      try { chrome.storage.onChanged.removeListener(onChanged) } catch (_) {}
    }
  }, [])

  // Load composer search button preference and subscribe to changes
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const { showComposerSearchButton } = await chrome.storage.sync.get(['showComposerSearchButton'])
        if (mounted) setShowComposerSearchButton(typeof showComposerSearchButton === 'boolean' ? showComposerSearchButton : true)
      } catch (_) {}
    }
    load()
    const onChanged = (changes, area) => {
      try {
        if (area === 'sync' && changes.showComposerSearchButton) {
          setShowComposerSearchButton(!!changes.showComposerSearchButton.newValue)
        }
      } catch (_) {}
    }
    try { chrome.storage.onChanged.addListener(onChanged) } catch (_) {}
    return () => {
      mounted = false
      try { chrome.storage.onChanged.removeListener(onChanged) } catch (_) {}
    }
  }, [])

  // If debug is disabled, ensure the popover is closed
  useEffect(() => {
    if (!showDebug) setDebugOpen(false)
  }, [showDebug])

  const isSupportedUrl = (url) => /^https?:\/\//.test(url || '')

  // Open a Google search for the given query (or current input)
  const openGoogleSearch = (q) => {
    const query = (q ?? input ?? '').trim()
    if (!query) return
    const params = new URLSearchParams({ q: query, oq: query, sourceid: 'chrome', ie: 'UTF-8' })
    const url = `https://www.google.com/search?${params.toString()}`
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

  // Poll MCP Bridge status
  useEffect(() => {
    let stopped = false
    const get = async () => {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'GET_BRIDGE_STATUS' })
        if (res?.ok && !stopped) {
          setBridgeStatus({ connected: !!res.connected, usingToken: !!res.usingToken, url: res.url || '' })
        }
      } catch (_) {}
    }
    get()
    const id = setInterval(get, 2000)
    return () => { stopped = true; clearInterval(id) }
  }, [])

  // Get current open tabs (helper for mentions and external calls)
  const current_tabs = useCallback(async () => {
    try {
      const t = await chrome.tabs.query({ currentWindow: true })
      return (t || []).filter(tt => tt.id && isSupportedUrl(tt.url))
    } catch (_) { return [] }
  }, [])

  // Simple fuzzy: score by subsequence match + includes on title/url/host
  const fuzzyRankTabs = useCallback((items, q) => {
    const query = (q || '').trim().toLowerCase()
    if (!query) return items
    const isSubseq = (s, pat) => {
      let i = 0; for (const ch of s) { if (ch === pat[i]) i++; if (i === pat.length) break }
      return i === pat.length
    }
    const scored = items.map(t => {
      const title = (t.title || '').toLowerCase()
      let host = ''
      try { host = new URL(t.url || '').hostname.toLowerCase() } catch {}
      const url = String(t.url || '').toLowerCase()
      let score = 0
      if (title.includes(query)) score += 3
      if (host.includes(query)) score += 2
      if (url.includes(query)) score += 1
      if (isSubseq(title, query)) score += 1
      if (String(t.id).includes(query)) score += 1
      return { t, score }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.filter(s => s.score > 0).map(s => s.t)
  }, [])

  const delay = (ms) => new Promise(res => setTimeout(res, ms))

  const reconnectBridge = useCallback(async () => {
    try { await chrome.runtime.sendMessage({ type: 'RECONNECT_BRIDGE' }) } catch (_) {}
  }, [])

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

  // [JAN-BEHAVIOR:RESTRICTED-URL] block non-scriptable pages
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

  // [JAN-BEHAVIOR:CONTEXT-READ] read active tab page data into context cache
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
  // [JAN-BEHAVIOR:SESSION-PERSIST] initialize sessions and load from storage
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
        context: { useContextDefault: true, selectedTabIds: [], contextCache: {}, autoFollowActiveTab: true },
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
      setAutoFollowActiveTab(true)
      setSessionTitle(s.title)
    }
  }, [])

  // [JAN-BEHAVIOR:SESSION-PERSIST] save sessions and active id
  const saveSessions = useCallback(async (nextSessions, nextActiveId) => {
    setSessions(nextSessions)
    if (nextActiveId) setActiveSessionId(nextActiveId)
    await chrome.storage.local.set({ sessions: nextSessions, activeSessionId: nextActiveId ?? activeSessionId })
  }, [activeSessionId])

  // Create a brand new empty chat session and switch to it (header notebook button)
  const createNewChat = useCallback(async () => {
    const newId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())
    const initial = {
      id: newId,
      title: 'Jan',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        { role: 'assistant', content: 'New chat created. How can I help?', ts: Date.now() }
      ],
      context: { useContextDefault: true, selectedTabIds: [], contextCache: {}, autoFollowActiveTab: true },
    }
    const next = [initial, ...(sessions || [])]
    await saveSessions(next, newId)
    // Reset per-session UI state to defaults for the new chat
    setSessionTitle(initial.title)
    setUseContextDefault(true)
    setSelectedTabIds([])
    setContextCache({})
    setAutoFollowActiveTab(true)
  }, [sessions, saveSessions])

  // MCP Tab Connection Handlers
  const handleConnectTab = useCallback(async (tabId) => {
    try {
      console.log('[Side Panel] 🔗 Registering MCP tab:', tabId)

      // Get tab info for logging
      let tabInfo = null
      try {
        const tab = await chrome.tabs.get(tabId)
        tabInfo = { title: tab.title, url: tab.url }
        console.log('[Side Panel] Tab details:', tabInfo)
      } catch (_) {}

      // Send message to background to register this tab for MCP operations
      const response = await chrome.runtime.sendMessage({
        type: 'MCP_REGISTER_TAB',
        payload: { tabId }
      })

      if (response?.ok) {
        setMcpConnectedTabId(tabId)
        console.log('[Side Panel] ✅ MCP tab connected successfully:', tabId)
        console.log('[Side Panel] 📍 MCP tools (visit, click, screenshot, etc.) will now operate on this tab')
        if (tabInfo) {
          console.log('[Side Panel] 📄 Connected tab:', tabInfo.title || '(no title)')
          console.log('[Side Panel] 🔗 URL:', tabInfo.url || '(no url)')
        }
      } else {
        console.error('[Side Panel] ❌ Failed to connect tab:', response?.error)
      }
    } catch (e) {
      console.error('[Side Panel] ❌ Error connecting tab:', e)
    }
  }, [])

  const handleFocusToConnectedTab = useCallback(async (tabId) => {
    try {
      if (!tabId) {
        console.warn('[Side Panel] ⚠️ Cannot focus - no tab ID provided')
        return
      }

      console.log('[Side Panel] 👁️ Focusing to connected tab:', tabId)

      // Get the tab and focus it
      const tab = await chrome.tabs.get(tabId)
      console.log('[Side Panel] 📄 Focusing tab:', tab.title || '(no title)')

      await chrome.windows.update(tab.windowId, { focused: true })
      await chrome.tabs.update(tabId, { active: true })

      console.log('[Side Panel] ✅ Successfully focused to tab:', tabId)
    } catch (e) {
      console.error('[Side Panel] ❌ Failed to focus tab:', e)
      console.log('[Side Panel] Tab may have been closed, clearing connection')
      // Tab might have been closed, clear the connection
      setMcpConnectedTabId(null)
    }
  }, [])

  const handleDisconnectTab = useCallback(async () => {
    try {
      console.log('[Side Panel] 🔓 Disconnecting MCP tab:', mcpConnectedTabId)

      // Send message to background to clear the registered tab
      await chrome.runtime.sendMessage({
        type: 'MCP_REGISTER_TAB',
        payload: { tabId: null }
      })

      setMcpConnectedTabId(null)
      console.log('[Side Panel] ✅ MCP tab disconnected successfully')
    } catch (e) {
      console.error('[Side Panel] ❌ Error disconnecting tab:', e)
    }
  }, [mcpConnectedTabId])

  // Poll for connected tab status from background
  useEffect(() => {
    const checkConnectedTab = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'MCP_GET_REGISTERED_TAB'
        })
        if (response?.tabId !== undefined) {
          setMcpConnectedTabId(response.tabId)
        }
      } catch (e) {
        // Ignore errors (background might not be ready)
      }
    }

    checkConnectedTab()
    const interval = setInterval(checkConnectedTab, 2000) // Poll every 2 seconds

    return () => clearInterval(interval)
  }, [])

  // Track the active browser tab
  useEffect(() => {
    const updateActiveTab = async () => {
      try {
        const activeTab = await getActiveTab()
        if (activeTab?.id) {
          setCurrentActiveTabId(activeTab.id)
        }
      } catch (e) {
        // Ignore errors
      }
    }

    updateActiveTab()
    const interval = setInterval(updateActiveTab, 1000) // Update every second

    return () => clearInterval(interval)
  }, [getActiveTab])

  // Auto-scroll to bottom during streaming if user hasn't scrolled up
  const scrollToBottom = useCallback(() => {
    if (listRef.current && !userHasScrolledUp) {
      const element = listRef.current
      // Use requestAnimationFrame for smooth scrolling
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight
      })
    }
  }, [userHasScrolledUp])

  // Check if user is at bottom of scroll area
  const isAtBottom = useCallback(() => {
    if (!listRef.current) return true
    const { scrollTop, scrollHeight, clientHeight } = listRef.current
    return scrollHeight - scrollTop - clientHeight < 50 // 50px threshold
  }, [])

  // Handle scroll events to detect user scroll behavior
  const handleScroll = useCallback(() => {
    if (!listRef.current) return
    const { scrollTop } = listRef.current
    const scrolledUp = scrollTop < lastScrollTopRef.current
    lastScrollTopRef.current = scrollTop
    
    // If user scrolled up, mark as manually scrolled
    if (scrolledUp && !isAtBottom()) {
      setUserHasScrolledUp(true)
    }
    // If user scrolled to bottom, reset the flag
    else if (isAtBottom()) {
      setUserHasScrolledUp(false)
    }
  }, [isAtBottom])

  // Auto-scroll when messages change during streaming
  useEffect(() => {
    if (streamingReqId && !userHasScrolledUp) {
      scrollToBottom()
    }
  }, [messages, streamingReqId, userHasScrolledUp, scrollToBottom])

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
          // Reset scroll state when new streaming begins
          setUserHasScrolledUp(false)
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
              // Auto-scroll during streaming if user hasn't scrolled up
              scrollToBottom()
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
        } else if (msg.type === 'ADD_TAB_TO_CONTEXT') {
          // Handle right-click context menu from main Chrome tabs
          const { tabId, tab } = msg
          if (tabId && tab && !selectedTabIds.includes(tabId)) {
            setSelectedTabIds(prev => [...prev, tabId])
            setAutoFollowActiveTab(false)
            // Update tabs list if needed
            setTabs(prev => {
              const exists = prev.find(t => t.id === tabId)
              return exists ? prev : [...prev, tab]
            })
          }
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

  // [JAN-BEHAVIOR:AUTO-FOLLOW] When auto-follow is ON, sync to the current active tab
  // But preserve manual selections when auto-follow is OFF
  useEffect(() => {
    (async () => {
      try {
        const t = await getActiveTab()
        if (t?.id && isSupportedUrl(t.url) && autoFollowActiveTab) {
          setSelectedTabIds([t.id])
        }
      } catch (_) {}
    })()
  }, [autoFollowActiveTab])

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
        // Refresh page content/context for the newly active tab
        try { await readPage() } catch (_) {}
        // Switch to the session mapped to this tab, if any
        const map = await loadTabSessionMap()
        const sid = map[t.id]
        // Always follow active tab and switch to mapped session if present
        if (sid && sid !== activeSessionIdRef.current) {
          const targetSession = sessionsRef.current.find(s => s.id === sid)
          if (targetSession) {
            await switchSession(sid)
          }
        }
        // [JAN-BEHAVIOR:AUTO-FOLLOW] Auto-follow the active tab only if enabled
        // Preserve manual selections when auto-follow is OFF (intent preservation)
        if (autoFollowActiveTab) {
          setSelectedTabIds([t.id])
        }
      } catch (_) {}
    }
    try { chrome.tabs.onActivated.addListener(onActivated) } catch (_) {}
    return () => { try { chrome.tabs.onActivated.removeListener(onActivated) } catch (_) {} }
  }, [refreshTabs, loadTabSessionMap, readPage, autoFollowActiveTab])

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
    const safe = Array.isArray(contexts) ? contexts : []
    const count = safe.length

    const parts = safe.map((c, i) => {
      const idx = i + 1
      const tabId = c?.tabId != null ? String(c.tabId) : String(idx)
      const title = (c?.title || '').trim()
      const url = (c?.url || '').trim()
      const meta = (c?.metaDescription || '').trim()
      const raw = (c?.selection?.trim() || c?.content?.trim() || '')
      const snippet = String(raw) // No more character limit!
      const headerLines = [
        `[Source: Tab ${tabId}]${title ? ` ${title}` : ''}`.trim(),
        url ? `URL: ${url}` : null,
        meta ? `Meta: ${meta}` : null,
      ].filter(Boolean)
      return [
        headerLines.join('\n'),
        'Content:',
        snippet,
      ].join('\n')
    }).join('\n\n----\n\n')

    const guard = [
      count === 1
        ? 'You are given exactly one tab context. Do not mention or imply multiple tabs/windows.'
        : `You are given ${count} tab contexts. Do not assume any others beyond the ones listed.`,
      'Only use information from the tab context listed below and any search results provided in system messages. If an answer depends on information not present there, say so briefly.',
    ].join('\n')

    return [
      { role: 'system', content: `${guard}\n\n${parts}` }
    ]
  }

  const buildGoogleMessages = (serp) => {
    if (!serp) return []
    const data = serp.data || serp || {}
    const lines = []
    if (data.answerBox) {
      try { lines.push(`Answer box:\n${String(data.answerBox).trim().slice(0, 800)}`) } catch (_) {}
    }
    const results = Array.isArray(data.results) ? data.results.slice(0, 5) : []
    results.forEach((r, i) => {
      const title = (r?.title || '').trim()
      const url = (r?.url || '').trim()
      const snip = (r?.snippet || '').trim()
      const prefix = `Result ${i + 1}: ${title}${url ? ` (${url})` : ''}`.trim()
      const block = [prefix, snip].filter(Boolean).join('\n')
      if (block) lines.push(block)
    })
    if (!lines.length) {
      try { console.debug('[SP] No SERP lines built', { ok: serp?.ok, source: data?.source, results: Array.isArray(data?.results) ? data.results.length : null }) } catch (_) {}
      return []
    }
    const source = (data.source || '').toLowerCase()
    const label = source === 'ddg' || source === 'duckduckgo'
      ? 'DuckDuckGo results'
      : (source === 'google' ? 'Google results' : 'Search results')
    return [{ role: 'system', content: `${label}:\n\n${lines.join('\n\n')}` }]
  }

  // Scrape content for a set of selected tab IDs (fresh reads)
  // [JAN-BEHAVIOR:CONTEXT-SCRAPE] scrape selected tabs for fresh page data
  const scrapeSelectedTabs = useCallback(async (ids) => {
    const results = []
    const unique = Array.from(new Set(ids || []))
    for (const id of unique) {
      try {
        const t = await chrome.tabs.get(id)
        if (!t?.id || !isSupportedUrl(t.url) || isRestrictedUrl(t.url)) continue
        await waitForTabComplete(id)
        const resp = await sendToTabWithRetry(id, { type: 'GET_PAGE_CONTENT' })
        if (resp?.ok) results.push({ ...resp, tabId: id })
      } catch (_) { /* ignore */ }
    }
    return results
  }, [waitForTabComplete, sendToTabWithRetry])

  // Debug: preview current tab payload and the constructed system message
  const previewCurrentTabPayload = useCallback(async () => {
    try {
      setDebugInfo({ loading: true })
      setDebugOpen(true)
      const t = await getActiveTab()
      if (!t?.id) {
        setDebugInfo({ ok: false, error: 'No active tab.' })
        return
      }
      if (!isSupportedUrl(t.url)) {
        setDebugInfo({ ok: false, error: 'Unsupported URL. Open a normal http(s) page.' })
        return
      }
      if (isRestrictedUrl(t.url)) {
        setDebugInfo({ ok: false, error: 'This page is restricted. Open a normal http(s) page.' })
        return
      }
      await waitForTabComplete(t.id)
      const resp = await sendToTabWithRetry(t.id, { type: 'GET_PAGE_CONTENT' })
      if (!resp?.ok) {
        setDebugInfo({ ok: false, error: resp?.error || 'Failed to read page.' })
        return
      }
      const sysMsgs = buildContextMessages([{ ...resp, tabId: t.id }])
      const sys = sysMsgs.find(m => m.role === 'system')?.content || ''
      setDebugInfo({
        ok: true,
        tabId: t.id,
        title: resp.title || '',
        url: resp.url || t.url || '',
        contentLen: (resp.content || '').length,
        selectionLen: (resp.selection || '').length,
        systemPreview: sys,
      })
    } catch (e) {
      setDebugInfo({ ok: false, error: e?.message || 'Unexpected error.' })
    }
  }, [getActiveTab, isSupportedUrl, isRestrictedUrl, waitForTabComplete, sendToTabWithRetry, buildContextMessages])

  // [JAN-BEHAVIOR:RESCRAPE] manual refresh of selected tabs' context
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

  // [JAN-BEHAVIOR:SEND-CHAT] compose messages + context and start streaming
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
      // Include context if either default or this-message toggle is on
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
          const updated = { ...nextSessions[idxCtx], context: { useContextDefault, selectedTabIds: tabsToUse, contextCache: cache, autoFollowActiveTab } }
          nextSessions[idxCtx] = updated
          await saveSessions(nextSessions)
        }
        // Ensure each selected/active tab has usable content before sending
        const minChars = 200
        let missing = tabsToUse.filter(id => {
          const r = cache[id]
          const len = String((r?.selection && String(r.selection).trim()) || (r?.content && String(r.content).trim()) || '').length
          return !r || len < minChars
        })
        if (missing.length) {
          // Retry once for missing tabs
          const retried = await scrapeSelectedTabs(missing)
          retried.forEach(r => { cache[r.tabId] = r })
          setContextCache(cache)
          missing = tabsToUse.filter(id => {
            const r = cache[id]
            const len = String((r?.selection && String(r.selection).trim()) || (r?.content && String(r.content).trim()) || '').length
            return !r || len < minChars
          })
        }
        if (missing.length) {
          const proceed = typeof window !== 'undefined' ? window.confirm(`Missing usable content for ${missing.length}/${tabsToUse.length} tab(s). Continue without full context?`) : true
          if (!proceed) {
            // Inform user and abort send
            const note = `Send cancelled: missing usable content for ${missing.length}/${tabsToUse.length} tab(s).`
            const sIdx2 = sessions.findIndex(s => s.id === activeSessionId)
            if (sIdx2 >= 0) {
              const next = [...sessions]
              next[sIdx2].messages = [...next[sIdx2].messages, { role: 'assistant', content: note }]
              next[sIdx2].updatedAt = Date.now()
              await saveSessions(next)
            }
            setBusy(false)
            return
          }
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
      // Reset per-message toggle to default ON so users don't get stuck
      setUseContextThisMsg(true)
      setBusy(false)
    }
  }, [input, sessions, activeSessionId, useContextThisMsg, useContextDefault, contextCache, selectedTabIds, autoFollowActiveTab, saveSessions, scrapeSelectedTabs])

  // [JAN-BEHAVIOR:ASK-GOOGLE] run search+scrape, merge with context, stream
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
    // test
    await saveSessions(nextSessions)
    try {
      // Get Google SERP
      let serp = null
      try {
        // Use unified search path; ddgOnly will be read from stored settings unless explicitly provided
        serp = await chrome.runtime.sendMessage({ type: 'SEARCH_AND_SCRAPE', payload: { query: text, closeTab: true, debug: true } })
      } catch (_) { serp = null }
      try { console.debug('[SP] SERP summary', { ok: !!serp?.ok, source: serp?.data?.source || serp?.source, count: Array.isArray(serp?.data?.results) ? serp.data.results.length : null, raw: serp }) } catch (_) {}
      const googleMsgs = buildGoogleMessages(serp)
      // Determine contexts (tabs)
      // Include context if either default or this-message toggle is on
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
          const updated = { ...nextSessions[idxCtx], context: { useContextDefault, selectedTabIds: tabsToUse, contextCache: cache, autoFollowActiveTab } }
          nextSessions[idxCtx] = updated
          await saveSessions(nextSessions)
        }
        // Ensure each selected/active tab has usable content before sending
        const minChars = 200
        let missing = tabsToUse.filter(id => {
          const r = cache[id]
          const len = String((r?.selection && String(r.selection).trim()) || (r?.content && String(r.content).trim()) || '').length
          return !r || len < minChars
        })
        if (missing.length) {
          // Retry once for missing tabs
          const retried = await scrapeSelectedTabs(missing)
          retried.forEach(r => { cache[r.tabId] = r })
          setContextCache(cache)
          missing = tabsToUse.filter(id => {
            const r = cache[id]
            const len = String((r?.selection && String(r.selection).trim()) || (r?.content && String(r.content).trim()) || '').length
            return !r || len < minChars
          })
        }
        if (missing.length) {
          const proceed = typeof window !== 'undefined' ? window.confirm(`Missing usable content for ${missing.length}/${tabsToUse.length} tab(s). Continue without full context?`) : true
          if (!proceed) {
            // Inform user and abort send
            const note = `Send cancelled: missing usable content for ${missing.length}/${tabsToUse.length} tab(s).`
            const sIdx2 = sessions.findIndex(s => s.id === activeSessionId)
            if (sIdx2 >= 0) {
              const next = [...sessions]
              next[sIdx2].messages = [...next[sIdx2].messages, { role: 'assistant', content: note }]
              next[sIdx2].updatedAt = Date.now()
              await saveSessions(next)
            }
            setBusy(false)
            return
          }
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
      // Reset one-shot context toggle after sending
      setUseContextThisMsg(true)
      setBusy(false)
    }
  }, [input, sessions, activeSessionId, sessionTitle, useContextThisMsg, useContextDefault, contextCache, pageData, selectedTabIds, autoFollowActiveTab, saveSessions, scrapeSelectedTabs])

  const onKeyDown = (e) => {
    // Handle mention navigation/selection first
    if (mentionOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionResults.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const item = mentionResults[mentionIndex]
        if (item) handleMentionSelect(item)
        return
      }
      if (e.key === 'Escape') { setMentionOpen(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (searchMode) {
        askWithGoogle()
      } else {
        sendChat()
      }
    }
  }

  const toggleTab = (id) => {
    setSelectedTabIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
    // [JAN-BEHAVIOR:AUTO-FOLLOW] Manual tab selection turns OFF auto-follow (intent preservation)
    setAutoFollowActiveTab(false)
  }

  // Compute mention candidates on input changes
  const updateMentions = useCallback((text, caretPos) => {
    try {
      const upto = text.slice(0, caretPos)
      const m = /(^|\s)@([^\s@]{0,64})$/.exec(upto)
      if (!m) { setMentionOpen(false); setMentionQuery(''); setMentionResults([]); setMentionStart(-1); return }
      const q = m[2] || ''
      setMentionQuery(q)
      setMentionStart(upto.length - q.length - 1) // index of '@'
      const pool = tabs.filter(t => !selectedTabIds.includes(t.id) && isSupportedUrl(t.url))
      const ranked = q ? fuzzyRankTabs(pool, q) : pool
      setMentionResults(ranked.slice(0, 8))
      setMentionIndex(0)
      setMentionOpen(true)
    } catch (_) {
      setMentionOpen(false); setMentionResults([])
    }
  }, [tabs, selectedTabIds, fuzzyRankTabs])

  const handleMentionSelect = useCallback((tab) => {
    const el = inputRef.current
    if (!el) {
      toggleTab(tab.id)
      setMentionOpen(false)
      return
    }
    const text = input
    const caret = el.selectionStart || text.length
    const before = text.slice(0, mentionStart)
    // Find end of token from '@' to caret
    const after = text.slice(caret)
    // Replace the @query with @tabname and keep it in the input
    const tabName = tab.title || tab.url || 'tab'
    const cleanTabName = tabName.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 20)
    const next = before + `@${cleanTabName} ` + after
    setInput(next)
    toggleTab(tab.id)
    setMentionOpen(false)
    // Restore caret position after the mention
    setTimeout(() => {
      try { 
        el.focus(); 
        const newPos = before.length + cleanTabName.length + 2 // +2 for '@' and space
        el.selectionStart = el.selectionEnd = newPos 
      } catch (_) {}
    }, 0)
  }, [input, mentionStart, toggleTab])

  const newChat = async () => {
    const newId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
    // Prefer the current active tab for a fresh session
    let activeId = null
    try {
      const t = await getActiveTab()
      if (t?.id && isSupportedUrl(t.url)) activeId = t.id
    } catch (_) {}
    const selIds = activeId ? [activeId] : []
    const s = {
      id: newId,
      title: 'Jan',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      context: { useContextDefault, selectedTabIds: selIds, contextCache, autoFollowActiveTab: true },
    }
    const next = [s, ...sessions]
    await saveSessions(next, newId)
    // Update local state so the UI immediately reflects the latest active tab
    setSelectedTabIds(selIds)
    // Map the active tab to this new session for quick switching
    try {
      if (activeId) await setTabSessionForTab(activeId, newId)
      // Re-register long-lived port to active tab to avoid streaming misroutes
      if (activeId && portRef.current) portRef.current.postMessage({ type: 'REGISTER_PORT', tabId: activeId })
    } catch (_) {}
  }

  const deleteChat = async (id) => {
    const targetId = id || activeSessionId
    const idx = sessions.findIndex(s => s.id === targetId)
    if (idx < 0) return
    const next = sessions.filter(s => s.id !== targetId)
    if (next.length === 0) {
      // If no sessions remain, create a fresh one bound to the current active tab
      const newId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      let activeId = null
      try {
        const t = await getActiveTab()
        if (t?.id && isSupportedUrl(t.url)) activeId = t.id
      } catch (_) {}
      const selIds = activeId ? [activeId] : []
      const initial = {
        id: newId,
        title: 'Jan',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        context: { useContextDefault: true, selectedTabIds: selIds, contextCache: {}, autoFollowActiveTab: true },
      }
      await saveSessions([initial], newId)
      setUseContextDefault(true)
      setSelectedTabIds(selIds)
      setContextCache({})
      setSessionTitle(initial.title)
      try {
        if (activeId) await setTabSessionForTab(activeId, newId)
        if (activeId && portRef.current) portRef.current.postMessage({ type: 'REGISTER_PORT', tabId: activeId })
      } catch (_) {}
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
      context: { useContextDefault, selectedTabIds, contextCache, autoFollowActiveTab },
      updatedAt: Date.now(),
    }
    await saveSessions(next)
  }, [sessions, activeSessionId, useContextDefault, selectedTabIds, contextCache, autoFollowActiveTab, saveSessions])

  useEffect(() => { persistContext() }, [useContextDefault, selectedTabIds, contextCache, autoFollowActiveTab])

  // Whether the current session has any user messages (used for layout tweaks)
  const hasUserMessage = messages.some(m => m.role === 'user')

  // Animate only main content shift; rely on CSS width transition for the sidebar for smoothness
  const asideRef = useRef(null)
  const mainRef = useRef(null)
  useEffect(() => {
    if (sidebarOpen && mainRef.current) {
      try {
        animate(mainRef.current, { x: [8, 0] }, { duration: 0.18, easing: 'ease-out' })
      } catch (_) {}
    }
  }, [sidebarOpen])

  // Slide-in animation for overlay sidebar when opening
  useEffect(() => {
    const el = asideRef.current
    if (!el || !sidebarOpen) return
    try {
      animate(el, { x: [-12, 0], opacity: [0.98, 1] }, { duration: 0.2, easing: 'ease-out' })
    } catch (_) {}
  }, [sidebarOpen])

  return (
    <div
      className={`fixed inset-0 grid ${theme === 'blue' ? 'theme-blue' : 'theme-yellow'}`}
      style={{
        backgroundColor: '#F5F5F5',
        color: 'var(--theme-high-em-text)',
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr'
      }}
    >
      {/* Full-screen overlay scrim */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40" aria-hidden="false">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setSidebarOpen(false)} />
        </div>
      ) : null}

      {/* Sidebar panel as fixed overlay */}
      <aside
        ref={asideRef}
        className="border-r ds-border flex flex-col overflow-hidden"
        aria-hidden={!sidebarOpen}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          width: sidebarOpen ? 320 : 0,
          transition: 'width 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'width',
          zIndex: 50,
          backgroundColor: 'var(--theme-container)',
          borderColor: 'var(--theme-border)',
          boxShadow: sidebarOpen ? '0 10px 30px rgba(0,0,0,0.20)' : 'none'
        }}
      >
        {settingsOpen ? (
          <Settings
            onClose={() => { setSettingsOpen(false); setSidebarOpen(false); }}
            onNewChat={() => { setSettingsOpen(false); createNewChat(); }}
            theme={theme}
            toggleTheme={toggleTheme}
            showDebug={showDebug}
            setShowDebug={setShowDebug}
            showReadingOverlay={showReadingOverlay}
            setShowReadingOverlay={setShowReadingOverlay}
            showComposerSearchButton={showComposerSearchButton}
            setShowComposerSearchButton={setShowComposerSearchButton}
          />
        ) : (
          <>
            <div className="p-2 flex items-center justify-between border-b" style={{ backgroundColor: 'var(--theme-container)', borderColor: 'var(--theme-border-interactive)', background: 'linear-gradient(90deg, var(--theme-container) 0%, var(--theme-container-emphasized) 100%)' }}>
              <div className="flex items-center gap-2"><span className="font-semibold" style={{ color: 'var(--theme-high-em-text)' }}>Chats</span></div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                  title={`Switch to ${theme === 'blue' ? 'Yellow' : 'Blue'} theme`}
                >
                  <PaletteIcon size={16} />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} aria-label="Collapse sidebar">←</Button>
              </div>
            </div>
            <div className="p-2"><Button variant="secondary" className="w-full" onClick={newChat}>New Chat</Button></div>
            <div className="px-2 text-xs" style={{ color: 'var(--theme-mid-em-text)' }}>Chats</div>
            <div className="flex-1 overflow-auto px-2 space-y-1 py-2">
              {sessions.map(s => (
                <div key={s.id} className={`w-full rounded-md px-2 py-2 border`} style={{ borderColor: s.id === activeSessionId ? 'var(--theme-primary)' : 'var(--theme-border-interactive)', backgroundColor: 'var(--theme-container)' }}>
                  <div className="flex items-center gap-2">
                    <button onClick={() => switchSession(s.id)} className="flex-1 text-left min-w-0">
                      <div className="text-sm truncate" style={{ color: 'var(--theme-high-em-text)' }}>{s.title || 'Untitled'}</div>
                      <div className="text-[10px]" style={{ color: 'var(--theme-low-em-text)' }}>{new Date(s.updatedAt).toLocaleString()}</div>
                    </button>
                    <Button variant="ghost" size="icon" title="Delete" onClick={(e) => { e.stopPropagation(); deleteChat(s.id) }}>
                      <TrashIcon size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-2 border-t" style={{ borderColor: 'var(--theme-border-interactive)' }}>
              <div className="text-xs mb-1" style={{ color: 'var(--theme-mid-em-text)' }}>Context Tabs (default: current)</div>
              <div className="max-h-40 overflow-auto space-y-1">
                {tabs.map(t => (
                  <label 
                  key={t.id} 
                  className="flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-0.5"
                  style={{ color: 'var(--theme-high-em-text)' }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--theme-container-emphasized)'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    toggleTab(t.id)
                  }}
                >
                    <Checkbox checked={selectedTabIds.includes(t.id)} onCheckedChange={() => toggleTab(t.id)} />
                    <span className="truncate" title={`${t.title}\nRight-click to toggle`}>{t.title}</span>
                  </label>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button variant="secondary" onClick={refreshTabs}>Refresh</Button>
                <Button variant="pastelReverse" onClick={rescrapeSelected} disabled={!selectedTabIds.length}>Scrape</Button>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <label className="flex items-center gap-2"><Checkbox checked={useContextDefault} onCheckedChange={(v) => setUseContextDefault(!!v)} /> Use context by default</label>
                <label className="flex items-center gap-2">
                  <Checkbox checked={autoFollowActiveTab} onCheckedChange={(v) => setAutoFollowActiveTab(!!v)} />
                  <span style={{ color: autoFollowActiveTab ? 'var(--theme-primary)' : 'var(--theme-mid-em-text)' }} title="When ON, automatically follows the active tab. When OFF, preserves manual tab selection.">Auto-follow</span>
                </label>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* Main column */}
      <div ref={mainRef} className="grid grid-rows-[auto_minmax(0,1fr)_auto] min-w-0 min-h-0 relative h-full" style={{ willChange: 'transform', backgroundColor: 'var(--theme-emphasized-bg)' }}>
        {(busy && !streamingReqId && showReadingOverlay) ? (
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] pointer-events-none z-10" />
        ) : null}
        <Navbar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          createNewChat={createNewChat}
          SettingsTrigger={() => <SettingsTrigger onSettingsOpen={() => { setSidebarOpen(true); setSettingsOpen(true); }} />}
          connectedTabId={mcpConnectedTabId}
          currentTabId={currentActiveTabId}
          onConnectTab={handleConnectTab}
          onFocusToConnectedTab={handleFocusToConnectedTab}
          onDisconnectTab={handleDisconnectTab}
        />

          <ScrollArea.Root className="flex-1 relative min-h-0">
          <ScrollArea.Viewport ref={listRef} className="h-full w-full px-2 pt-3 pb-2 min-w-0 min-h-0" onScroll={handleScroll}>
            {(() => {
              const visible = messages
                .filter(m => m.role !== 'system' && !(m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('New chat created')))
              if (!hasUserMessage) {
                return (
                  <div className="w-full h-full flex items-center justify-center">
                    <SuggestionPills onPillClick={(prompt) => {
                      setInput(prompt)
                      setTimeout(() => sendChat(), 100)
                    }} />
                  </div>
                )
              }
              return (
                <div className="space-y-6 md:space-y-7">
                  {visible.map((m, i, arr) => {
                    const prevRole = arr[i - 1]?.role
                    const nextRole = arr[i + 1]?.role
                    const isFirst = prevRole !== m.role
                    const isLast = nextRole !== m.role
                    const showDayDivider = false
                    return (
                      <React.Fragment key={i}>
                        <Message
                          key={m.id}
                          role={m.role}
                          content={m.content}
                          ts={m.ts}
                          isFirst={isFirst}
                          isLast={isLast}
                        />
                      </React.Fragment>
                    )
                  })}
                </div>
              )
            })()}
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar orientation="vertical" className="flex select-none touch-none p-0.5 bg-transparent">
            <ScrollArea.Thumb className="flex-1 rounded-full bg-muted-foreground/30" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>

        <Composer
          input={input}
          setInput={setInput}
          busy={busy}
          streamingReqId={streamingReqId}
          inputRef={inputRef}
          hasUserMessage={hasUserMessage}
          mentionOpen={mentionOpen}
          mentionResults={mentionResults}
          mentionIndex={mentionIndex}
          setMentionIndex={setMentionIndex}
          tabs={tabs}
          selectedTabs={selectedTabs}
          selectedTabIds={selectedTabIds}
          selectionText={selectionText}
          setSelectionText={setSelectionText}
          tabPickerOpen={tabPickerOpen}
          setTabPickerOpen={setTabPickerOpen}
          tabQuery={tabQuery}
          setTabQuery={setTabQuery}
          showReadingOverlay={showReadingOverlay}
          showComposerSearchButton={showComposerSearchButton}
          searchMode={searchMode}
          setSearchMode={setSearchMode}
          theme={theme}
          onKeyDown={onKeyDown}
          updateMentions={updateMentions}
          handleMentionSelect={handleMentionSelect}
          toggleTab={toggleTab}
          sendChat={sendChat}
          askWithGoogle={askWithGoogle}
        />
      </div>
    </div>
  )
}
