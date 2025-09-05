import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Button } from '../../../components/ui/button.jsx'
import { Textarea } from '../../../components/ui/textarea.jsx'
import { User as UserIcon, ArrowUp, Copy as CopyIcon, Bot, X as XIcon, Plus as PlusIcon, RefreshCw as RefreshIcon, Check as CheckIcon, Trash2 as TrashIcon, Paperclip as PaperclipIcon, Mic as MicIcon, Search as SearchIcon, Menu, SlidersHorizontal, Palette as PaletteIcon, NotebookPen as NotebookIcon } from 'lucide-react'
import { SettingsIcon } from '../icons/SettingsIcon.jsx'
import { ShineBorder } from '../../../../src/components/magicui/shine-border.tsx'
import { Input } from '../../../components/ui/input.jsx'
import { AddContextModal } from '../AddContextModal.jsx'
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
  
  // Theme
  theme,
  
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

  const handleSaveTabs = (selectedTabsFromModal) => {
    selectedTabsFromModal.forEach(tab => {
      if (!selectedTabIds.includes(tab.id)) {
        toggleTab(tab.id)
      }
    })
  }

  return (
    <footer className="px-4 py-4 z-20">
      {/* Main integrated input container */}
      <div className="relative rounded-2xl shadow-lg overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '1px solid var(--theme-border)' }}>
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
        
        {/* Pill-shaped tabs */}
        {selectedTabs.length > 0 && (
          <div className="px-4 pt-3 pb-2">
            <div className="flex flex-wrap gap-2">
              {selectedTabs.map(tab => (
                <div
                  key={tab.id}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-sm border border-gray-200"
                >
                  {tab.favIconUrl ? (
                    <img 
                      src={tab.favIconUrl} 
                      alt="" 
                      className="h-4 w-4 rounded-sm flex-shrink-0" 
                    />
                  ) : (
                    <div className="h-4 w-4 rounded-sm bg-orange-500 flex-shrink-0 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">a</span>
                    </div>
                  )}
                  <span className="truncate max-w-[120px] text-gray-700 font-medium">
                    {tab.title || 'Untitled Tab'}
                  </span>
                  <button
                    onClick={() => toggleTab(tab.id)}
                    className="p-0.5 rounded-full hover:bg-gray-200 transition-colors flex-shrink-0 text-gray-500 hover:text-gray-700"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4">
          <Textarea
            ref={inputRef}
            className="w-full resize-none border-0 bg-transparent focus:ring-0 focus:outline-none text-base leading-relaxed min-h-[80px] max-h-[200px] p-0"
            placeholder={(busy || !!streamingReqId) ? '' : 'Ask Jan ...'}
            value={input}
            onChange={e => { setInput(e.target.value); updateMentions(e.target.value, e.target.selectionStart || e.target.value.length) }}
            onKeyDown={onKeyDown}
            disabled={busy || !!streamingReqId}
            style={{
              color: input ? 'var(--theme-high-em-text)' : 'var(--theme-low-em-text)',
            }}
          />
        </div>
        
        {/* Bottom action bar inside container */}
        <div className="flex items-center justify-between px-4 pb-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setTabPickerOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-200 hover:bg-gray-100 border border-gray-200 bg-gray-50"
              style={{
                color: '#6B7280',
              }}
            >
              <PlusIcon size={16} />
              <span className="text-sm font-medium">Context</span>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Send button */}
            <button
              onClick={() => (searchMode ? askWithGoogle() : sendChat())}
              disabled={busy || !!streamingReqId || !input?.trim()}
              className="p-2 rounded-full transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ml-3"
              style={{
                backgroundColor: input?.trim() ? '#F17455' : '#E5E5E5',
                color: input?.trim() ? 'white' : '#9CA3AF',
              }}
              title={searchMode ? 'Send with Google' : 'Send'}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Add Context Modal - extracted as separate component */}
      <AddContextModal
        isOpen={tabPickerOpen}
        onClose={() => setTabPickerOpen(false)}
        tabs={tabs}
        selectedTabIds={selectedTabIds}
        tabQuery={tabQuery}
        setTabQuery={setTabQuery}
        onTabToggle={toggleTab}
        onSave={handleSaveTabs}
        theme={theme}
      />
    </footer>
  )
}

export default Composer
