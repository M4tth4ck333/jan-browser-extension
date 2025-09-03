import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Streamdown } from 'streamdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.min.css'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Button } from '../components/ui/button.jsx'
import { ComposerInput } from './components/ComposerInput.jsx'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import * as Popover from '@radix-ui/react-popover'
import { User as UserIcon, ArrowUp, Copy as CopyIcon, Bot, X as XIcon, Plus as PlusIcon, RefreshCw as RefreshIcon, Check as CheckIcon, Settings as SettingsIcon, Trash2 as TrashIcon, Paperclip as PaperclipIcon, Mic as MicIcon, Search as SearchIcon, Menu, SlidersHorizontal, Palette as PaletteIcon, NotebookPen as NotebookIcon } from 'lucide-react'
import { ShineBorder } from '../../src/components/magicui/shine-border.tsx'
import { Input } from '../components/ui/input.jsx'
import { Checkbox } from '../components/ui/checkbox.tsx'
import { animate } from 'motion'
import handSvg from '../assets/jan-hand.svg'

// Helpers at module scope
const hostFromUrl = (url = '') => { try { return new URL(url).hostname || '' } catch { return '' } }

// Animated hamburger menu trigger for opening the sidebar
function MenuTrigger({ onOpen }) {
  const btnRef = useRef(null)
  const handlePointerDown = useCallback(() => {
    // Open immediately on press
    onOpen?.()
    // Fire-and-forget micro animation for tap feedback
    const el = btnRef.current
    try {
      animate(
        el,
        { scale: [1, 1.08, 1], y: [0, -1, 0] },
        { duration: 0.14, easing: 'ease-out' }
      )
    } catch (_) {}
  }, [onOpen])
  return (
    <Button ref={btnRef} variant="ghost" size="icon" onPointerDown={handlePointerDown} aria-label="Open sidebar">
      <Menu size={18} />
    </Button>
  )
}
const hueFromString = (s = '') => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360 }
const chipColorForTab = (tab) => { const host = hostFromUrl(tab?.url || ''); const h = hueFromString(host); return `hsl(${h}, 70%, 88%)` }

// Animated wrapper for Radix Popover.Content (fade + slight scale/slide on mount)
function AnimatedPopoverContent({ children, ...props }) {
  const popRef = useRef(null)
  // [JAN-BEHAVIOR:PORT-REGISTER-UI] connect long-lived port and register active tab
  // [JAN-BEHAVIOR:ACTIVATION-HANDLER] re-register port, refresh context, and switch session on tab activation
  useEffect(() => {
    const el = popRef.current
    if (!el) return
    try {
      animate(
        el,
        { opacity: [0, 1], y: [8, 0], scale: [0.95, 1] },
        { duration: 0.25, easing: [0.25, 0.46, 0.45, 0.94] } // ease-out cubic-bezier
      )
    } catch (_) { /* no-op */ }
  }, [])
  return <Popover.Content ref={popRef} {...props}>{children}</Popover.Content>
}

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

// Settings button with Motion click animation, opens the Options page
function SettingsTrigger() {
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
    // Open Options page via Chrome API so it works in MV3
    try {
      if (chrome?.runtime?.openOptionsPage) chrome.runtime.openOptionsPage()
      else window.open(chrome.runtime.getURL('dist/ui/options/index.html'), '_blank')
    } catch (_) {}
  }, [])
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
      <SlidersHorizontal size={16} className={active ? 'text-foreground' : 'text-foreground/80'} />
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

function Message({ role, content, ts, isFirst, isLast, onCopy }) {
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
  const sanitizeSchema = useMemo(() => ({
    ...defaultSchema,
    attributes: {
      ...defaultSchema.attributes,
      code: [...(defaultSchema.attributes?.code || []), ['className']],
      pre: [...(defaultSchema.attributes?.pre || []), ['className']],
      span: [...(defaultSchema.attributes?.span || []), ['className']],
      div: [...(defaultSchema.attributes?.div || []), ['className']],
      table: [...(defaultSchema.attributes?.table || []), ['className']],
      thead: [...(defaultSchema.attributes?.thead || []), ['className']],
      tbody: [...(defaultSchema.attributes?.tbody || []), ['className']],
      tr: [...(defaultSchema.attributes?.tr || []), ['className']],
      th: [...(defaultSchema.attributes?.th || []), ['className']],
      td: [...(defaultSchema.attributes?.td || []), ['className']],
      hr: [...(defaultSchema.attributes?.hr || []), ['className']],
      blockquote: [...(defaultSchema.attributes?.blockquote || []), ['className']],
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
          {isUser ? <UserIcon size={14} /> : <Bot size={14} />}
        </div>
        <div className={`${isUser ? `group pastel-grad pastel-fore relative max-w-[100%] sm:max-w-[75%] ${radius} px-3 py-2 text-sm` : 'group relative max-w-[100%] sm:max-w-[75%]'}`}>
          {isUser ? (
            <div className="whitespace-pre-wrap">{content}</div>
          ) : (
            <div className="max-w-none break-words ai-typography">
              {(content && String(content).trim().length > 0) ? (
                <Streamdown
                  parseIncompleteMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[[rehypeSanitize, sanitizeSchema], rehypeHighlight]}
                  components={{
                    code: (props) => <CodeBlock {...props} />,
                    blockquote({ children, ...props }) {
                      const fullText = React.Children.toArray(children).map(c => {
                        if (typeof c === 'string') return c
                        if (c && typeof c === 'object' && 'props' in c && c.props?.children) {
                          return Array.isArray(c.props.children)
                            ? c.props.children.join(' ')
                            : String(c.props.children)
                        }
                        return ''
                      }).join(' ').trim()
                      let kind = ''
                      if (/^(note|info)\s*:/i.test(fullText)) kind = 'note'
                      else if (/^(tip|pro tip)\s*:/i.test(fullText)) kind = 'tip'
                      else if (/^(warn|warning|caution)\s*:/i.test(fullText)) kind = 'warn'
                      if (kind) {
                        return (
                          <div className={`callout callout-${kind}`} {...props}>
                            <div className="callout-body">{children}</div>
                          </div>
                        )
                      }
                      return <blockquote {...props}>{children}</blockquote>
                    },
                    hr() { return <hr className="my-4" /> },
                    a({ href, children, ...props }) {
                      const url = String(href || '')
                      return (
                        <a href={url} target="_blank" rel="noopener noreferrer" {...props}>
                          {children}
                        </a>
                      )
                    },
                    table({ children }) {
                      return (
                        <div className="my-2 overflow-x-auto">
                          <table className="w-full">
                            {children}
                          </table>
                        </div>
                      )
                    },
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
        {!isUser ? (
          <AssistantControls content={content} onCopy={onCopy} />
        ) : null}
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

// Small animated hand indicator used while we're scraping/reading the page before generation starts
function ReadingIndicator() {
  const rootRef = useRef(null)
  const handRef = useRef(null)
  useEffect(() => {
    const root = rootRef.current
    const hand = handRef.current
    let aEnter, aWave, aBob
    try { aEnter = animate(root, { opacity: [0, 1], y: [4, 0] }, { duration: 0.2, easing: 'ease-out' }) } catch (_) {}
    try { aWave = animate(hand, { rotate: [0, 16, -8, 16, 0] }, { duration: 1.6, easing: 'ease-in-out', repeat: Infinity }) } catch (_) {}
    try { aBob = animate(hand, { y: [0, -2, 0] }, { duration: 1.2, easing: 'ease-in-out', repeat: Infinity }) } catch (_) {}
    return () => {
      try { aEnter?.cancel?.() } catch (_) {}
      try { aWave?.cancel?.() } catch (_) {}
      try { aBob?.cancel?.() } catch (_) {}
    }
  }, [])
  return (
    <div ref={rootRef} className="mb-2 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border ds-border bg-card/80 shadow-sm backdrop-blur-sm">
      <img ref={handRef} src={handSvg} alt="" className="h-4 w-4" style={{ transformOrigin: '70% 70%' }} />
      <span className="text-xs ds-muted-text">Reading your page…</span>
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
      <span className="font-medium">hello</span>
    </div>
  )
}

// Compact assistant controls (Copy) rendered to the right of assistant messages
function AssistantControls({ content, onCopy }) {
  const ref = useRef(null)
  const [copied, setCopied] = useState(false)
  const canCopy = !!String(content || '').trim()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    try { animate(el, { opacity: [0, 1], y: [4, 0] }, { duration: 0.18, easing: 'ease-out' }) } catch (_) {}
  }, [])

  const hoverIn = () => { try { animate(ref.current, { scale: 1.04 }, { duration: 0.12 }) } catch (_) {} }
  const hoverOut = () => { try { animate(ref.current, { scale: 1.0 }, { duration: 0.12 }) } catch (_) {} }
  const down = () => { try { animate(ref.current, { scale: 0.97 }, { duration: 0.06 }) } catch (_) {} }
  const up = () => { try { animate(ref.current, { scale: 1.02 }, { duration: 0.08 }) } catch (_) {} }

  const handleCopy = async () => {
    if (!canCopy) return
    const text = String(content || '').trim()
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1100); onCopy?.(text) } catch (_) {}
  }

  return (
    <div className="ml-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            ref={ref}
            type="button"
            className={`inline-flex items-center gap-1 h-7 px-2 rounded-full border ds-border bg-card/80 shadow-sm text-xs ${canCopy ? 'text-muted-foreground hover:text-foreground' : 'opacity-50 cursor-not-allowed'}`}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
            onMouseDown={down}
            onMouseUp={up}
            onClick={handleCopy}
            aria-label={copied ? 'Copied' : 'Copy message'}
            disabled={!canCopy}
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content sideOffset={6} className="text-xs ds-card ds-text border ds-border rounded px-2 py-1">
          {copied ? 'Copied!' : (canCopy ? 'Copy message' : 'Nothing to copy yet')}
        </Tooltip.Content>
      </Tooltip.Root>
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

  const copyToClipboard = async (text) => {
    try { await navigator.clipboard.writeText(text) } catch (_) {}
  }

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
      className={`fixed inset-0 ds-bg ds-text grid ${theme === 'blue' ? 'theme-blue' : 'theme-yellow'}`}
      style={{
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
          background: 'var(--background)',
          boxShadow: sidebarOpen ? '0 10px 30px rgba(0,0,0,0.20)' : 'none'
        }}
      >
          <div className="p-2 flex items-center justify-between ds-card border-b ds-border pastel-grad">
            <div className="flex items-center gap-2"><span className="font-semibold">Chats</span></div>
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
          <div className="px-2 text-xs ds-muted-text">Chats</div>
          <div className="flex-1 overflow-auto px-2 space-y-1 py-2">
            {sessions.map(s => (
              <div key={s.id} className={`w-full rounded-md px-2 py-2 border`} style={{ borderColor: s.id === activeSessionId ? 'var(--primary)' : 'var(--border)', background: 'var(--card)' }}>
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
                <label 
                key={t.id} 
                className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/20 rounded px-1 py-0.5"
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
                <span className={autoFollowActiveTab ? 'text-primary' : 'ds-muted-text'} title="When ON, automatically follows the active tab. When OFF, preserves manual tab selection.">Auto-follow</span>
              </label>
            </div>
          </div>
      </aside>

      {/* Main column */}
      <div ref={mainRef} className="grid grid-rows-[auto_minmax(0,1fr)_auto] min-w-0 min-h-0 relative h-full" style={{ willChange: 'transform' }}>
        {(busy && !streamingReqId && showReadingOverlay) ? (
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] pointer-events-none z-10" />
        ) : null}
        <header className="sticky top-0 z-10 grid grid-cols-3 items-center px-2 py-1.5 bg-transparent">
          <div className="flex items-center gap-2 min-w-0">
            {!sidebarOpen && (
              <MenuTrigger onOpen={() => setSidebarOpen(true)} />
            )}
          </div>
          <div className="flex items-center justify-center">
            <span className="font-geist font-medium text-lg">Jan</span>
          </div>
          <div className="flex items-center justify-end gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={createNewChat}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground transition-colors"
              title="New chat"
            >
              <NotebookIcon size={16} />
            </Button>
            <SettingsTrigger />
          </div>
        </header>

          <ScrollArea.Root className="flex-1 relative min-h-0">
          <ScrollArea.Viewport ref={listRef} className="h-full w-full px-2 pt-3 pb-2 min-w-0 min-h-0" onScroll={handleScroll}>
            {(() => {
              const visible = messages
                .filter(m => m.role !== 'system' && !(m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('New chat created')))
              if (!hasUserMessage) {
                return (
                  <div className="w-full h-full flex items-center justify-center">
                    <HeroSlogan />
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
                        {showDayDivider ? null : null}
                        <Message
                          role={m.role}
                          content={m.content}
                          ts={m.ts}
                          isFirst={isFirst}
                          isLast={isLast}
                          onCopy={copyToClipboard}
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

        <footer className="px-2 py-2 z-20 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
          {/* Main integrated input container */}
          <div className="relative rounded-3xl border border-border/40 bg-card/95 backdrop-blur-xl shadow-xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:border-border/60">
            {/* ShineBorder effect when working */}
            {(busy || !!streamingReqId) && (
              <ShineBorder 
             shineColor="rgb(159, 238, 111)"
                className="absolute inset-0"
              />
            )}
            {(busy && !streamingReqId && showReadingOverlay) ? (
              <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] pointer-events-none z-10" aria-hidden="true" />
            ) : null}
            {(busy && !streamingReqId) ? (
              <div className="absolute top-3 left-4 z-20">
                <ReadingIndicator />
              </div>
            ) : null}
            
            {/* Context tabs row inside container */}
            {(selectionText?.trim() || selectedTabs.length > 0) && (
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  {selectionText && selectionText.trim().length > 0 ? (
                    <Popover.Root>
                      <Popover.Trigger asChild>
                        <button type="button" className="tab-chip" title="View selection">
                          <span className="h-4 w-4 rounded bg-muted inline-flex items-center justify-center text-[10px] font-medium">AI</span>
                          <span>Selected Text</span>
                          <span className="chip-x" role="button" aria-label="Clear selection preview" onClick={(e) => { e.stopPropagation(); setSelectionText('') }}>
                            <XIcon size={12} />
                          </span>
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <AnimatedPopoverContent
                          side="top"
                          align="start"
                          sideOffset={8}
                          className="rounded-xl border ds-border ds-bg shadow-2xl p-2 w-[86vw] sm:w-[460px] max-h-[60vh] z-50"
                          style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-[11px] opacity-80">Selection</span>
                            <div className="flex items-center gap-1 opacity-70">
                              <span title={`${selectionText.length} chars`} className="text-[10px]">{selectionText.length}</span>
                              <Button variant="ghost" size="icon" aria-label="Clear selection preview" onClick={() => setSelectionText('')}>
                                <XIcon size={12} />
                              </Button>
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap leading-5 text-sm">
                            {selectionText}
                          </div>
                        </AnimatedPopoverContent>
                      </Popover.Portal>
                    </Popover.Root>
                  ) : null}
                  
                  {selectedTabs.map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      className="tab-chip cursor-pointer hover:bg-muted/20 transition-colors"
                      title={`${tab.title}\n${hostFromUrl(tab.url)}\nClick to focus tab`}
                      onClick={async () => {
                        try {
                          await chrome.tabs.update(tab.id, { active: true })
                        } catch (e) {
                          console.warn('Failed to focus tab:', e)
                        }
                      }}
                    >
                      <button 
                        type="button" 
                        className="chip-x ml-0 mr-1" 
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleTab(tab.id)
                        }} 
                        aria-label="Remove tab"
                      >
                        <XIcon size={12} />
                      </button>
                      <span className="chip-ic" style={{ backgroundColor: chipColorForTab(tab) }}>
                        {tab.favIconUrl ? (
                          <img src={tab.favIconUrl} alt="" className="h-3 w-3" />
                        ) : (
                          <span className="h-3 w-3 rounded-full bg-muted inline-block" />
                        )}
                      </span>
                      <span className="truncate chip-label">{tab.title || '(untitled tab)'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Input area inside container */}
            <ComposerInput
              inputRef={inputRef}
              value={input}
              onChange={e => { setInput(e.target.value); updateMentions(e.target.value, e.target.selectionStart || e.target.value.length) }}
              onKeyDown={onKeyDown}
              onCursorUpdate={(val, pos) => updateMentions(val, pos)}
              disabled={busy || !!streamingReqId}
              placeholder={(busy || !!streamingReqId) ? '' : 'Ask Jan …'}
              hasUserMessage={hasUserMessage}
              mentionOpen={mentionOpen}
              mentionResults={mentionResults}
              mentionIndex={mentionIndex}
              setMentionIndex={setMentionIndex}
              onMentionSelect={handleMentionSelect}
            />
            
            {/* Bottom action bar inside container */}
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <Popover.Root open={tabPickerOpen} onOpenChange={setTabPickerOpen}>
                  <Popover.Trigger asChild>
                    <Button variant="ghost" size="sm" className="text-sm text-muted-foreground/80 hover:text-foreground rounded-full px-3 py-2 transition-all duration-200 hover:bg-muted/20" aria-label="Add context">
                      <PlusIcon size={15} className="mr-1.5" />
                      Context
                    </Button>
                  </Popover.Trigger>
                <Popover.Portal>
                  <AnimatedPopoverContent
                    side="top"
                    align="start"
                    sideOffset={8}
                    className="rounded-xl border ds-border ds-bg shadow-2xl w-[86vw] sm:w-[420px] max-h-[60vh] z-50 overflow-hidden"
                    style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
                  >
                    {/* Header with avatar and greeting */}
                    <div className="flex flex-col items-center pt-4 pb-3 px-4 border-b ds-border">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center mb-2">
                        <Bot size={20} className="text-primary-foreground" />
                      </div>
                      <h2 className="text-base font-medium ds-text">Hello!</h2>
                    </div>

                    {/* Tab navigation - default to Tabs; removed "+ Add context" */}
                    <div className="flex border-b ds-border">
                      <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 text-primary" style={{ borderColor: 'var(--primary)' }} aria-current="page">
                        <span className="w-3 h-3 rounded-sm bg-primary" />
                        Tabs
                      </button>
                      <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">
                        <PaperclipIcon size={14} />
                        Attach file
                      </button>
                    </div>

                    {/* Search input */}
                    <div className="p-3 border-b ds-border">
                      <div className="relative">
                        <SearchIcon size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={tabQuery}
                          onChange={(e) => setTabQuery(e.target.value)}
                          placeholder="Search using title or url"
                          className="pl-9 h-8 text-sm"
                        />
                      </div>
                    </div>

                    {/* Tab list - Fixed scrolling */}
                    <div className="flex-1 min-h-0">
                      <div className="h-full overflow-y-auto" style={{ maxHeight: '28vh' }}>
                        {filteredTabs
                          .filter(t2 => !selectedTabIds.includes(t2.id) && isSupportedUrl(t2.url))
                          .map(t2 => {
                            let host = ''
                            try { host = new URL(t2.url || '').hostname } catch {}
                            return (
                              <button
                                key={t2.id}
                                className="w-full text-left flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors group"
                                onClick={() => { toggleTab(t2.id); setTabPickerOpen(false) }}
                                onContextMenu={(e) => {
                                  e.preventDefault()
                                  toggleTab(t2.id)
                                  setTabPickerOpen(false)
                                }}
                                title="Click or right-click to add tab"
                              >
                                <div className="flex-shrink-0">
                                  {t2.favIconUrl ? (
                                    <img src={t2.favIconUrl} alt="" className="h-5 w-5 rounded-sm" />
                                  ) : (
                                    <span className="h-5 w-5 rounded-sm bg-muted inline-block" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium ds-text group-hover:text-primary transition-colors">{t2.title || '(untitled tab)'}</div>
                                  <div className="truncate text-xs text-muted-foreground">{host}</div>
                                </div>
                              </button>
                            )
                          })}
                        {!filteredTabs.filter(t2 => !selectedTabIds.includes(t2.id) && isSupportedUrl(t2.url)).length ? (
                          <div className="text-sm text-muted-foreground p-3 text-center">No tabs match your search.</div>
                        ) : null}
                      </div>
                    </div>

                    {/* Footer with action buttons */}
                    <div className="flex items-center justify-between p-3 border-t ds-border ds-muted-bg">
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={() => setTabPickerOpen(false)}
                      >
                        Save
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setTabPickerOpen(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </AnimatedPopoverContent>
                </Popover.Portal>
              </Popover.Root>
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/20 transition-all duration-200" title="Attach file">
                  <PaperclipIcon size={16} />
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/20 transition-all duration-200" title="Voice input">
                  <MicIcon size={16} />
                </Button>
                {showComposerSearchButton ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-9 w-9 rounded-full transition-all duration-200 ${searchMode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/20'}`}
                    onClick={() => setSearchMode(v => !v)}
                    disabled={busy || !!streamingReqId}
                    aria-pressed={searchMode}
                    title={searchMode ? 'Google mode: ON' : 'Google mode: OFF'}
                  >
                    <SearchIcon size={16} />
                  </Button>
                ) : null}
                
                {/* Send button */}
                <Button
                  variant="default"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg ml-3 transition-all duration-200 hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  onClick={() => (searchMode ? askWithGoogle() : sendChat())}
                  disabled={busy || !!streamingReqId || !(input && input.trim().length)}
                  aria-label={searchMode ? 'Search and send' : 'Send'}
                  title={searchMode ? 'Send with Google' : 'Send'}
                >
                  <ArrowUp size={18} />
                </Button>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
