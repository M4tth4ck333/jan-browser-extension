import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Button } from '../../../components/ui/button.jsx'
import { ComposerInput } from '../ComposerInput.jsx'
import * as Popover from '@radix-ui/react-popover'
import { User as UserIcon, ArrowUp, Copy as CopyIcon, Bot, X as XIcon, Plus as PlusIcon, RefreshCw as RefreshIcon, Check as CheckIcon, Settings as SettingsIcon, Trash2 as TrashIcon, Paperclip as PaperclipIcon, Mic as MicIcon, Search as SearchIcon, Menu, SlidersHorizontal, Palette as PaletteIcon, NotebookPen as NotebookIcon } from 'lucide-react'
import { ShineBorder } from '../../../../src/components/magicui/shine-border.tsx'
import { Input } from '../../../components/ui/input.jsx'
import { animate } from 'motion'
import handSvg from '../../../assets/jan-hand.svg'

// Helper functions
const hostFromUrl = (url = '') => { try { return new URL(url).hostname || '' } catch { return '' } }
const chipColorForTab = (tab) => { const host = hostFromUrl(tab?.url || ''); const h = hueFromString(host); return `hsl(${h}, 70%, 88%)` }
const hueFromString = (s = '') => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360 }
const isSupportedUrl = (url) => /^https?:\/\//.test(url || '')

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

// Animated wrapper for Radix Popover.Content (fade + slight scale/slide on mount)
function AnimatedPopoverContent({ children, ...props }) {
  const popRef = useRef(null)
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

export function Composer({
  // Input state
  input,
  setInput,
  busy,
  streamingReqId,
  inputRef,
  hasUserMessage,
  
  // Mention state
  mentionOpen,
  mentionResults,
  mentionIndex,
  setMentionIndex,
  
  // Tab state
  tabs,
  selectedTabs,
  selectedTabIds,
  selectionText,
  setSelectionText,
  tabPickerOpen,
  setTabPickerOpen,
  tabQuery,
  setTabQuery,
  
  // UI state
  showReadingOverlay,
  showComposerSearchButton,
  searchMode,
  setSearchMode,
  
  // Event handlers
  onKeyDown,
  updateMentions,
  handleMentionSelect,
  toggleTab,
  sendChat,
  askWithGoogle,
}) {
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

  return (
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
  )
}

export default Composer
