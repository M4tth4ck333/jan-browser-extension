import React, { useState, useEffect, useRef } from 'react'
import { Textarea } from '../../components/ui/textarea.jsx'

export function ComposerInput({
  inputRef,
  value,
  onChange,
  onKeyDown,
  onCursorUpdate,
  disabled,
  placeholder,
  hasUserMessage,
  mentionOpen,
  mentionResults = [],
  mentionIndex = 0,
  setMentionIndex,
  onMentionSelect,
}) {
  const [caretPos, setCaretPos] = useState({ x: 0, y: 0 })
  const mirrorRef = useRef(null)

  // Calculate caret position using a hidden mirror element
  const updateCaretPosition = (textarea, selectionStart) => {
    if (!textarea || !mirrorRef.current) {
      // Fallback positioning if mirror fails
      setCaretPos({ x: 20, y: 20 })
      return
    }

    const mirror = mirrorRef.current
    const textareaStyles = window.getComputedStyle(textarea)
    
    // Copy textarea styles to mirror
    mirror.style.font = textareaStyles.font
    mirror.style.fontSize = textareaStyles.fontSize
    mirror.style.fontFamily = textareaStyles.fontFamily
    mirror.style.fontWeight = textareaStyles.fontWeight
    mirror.style.lineHeight = textareaStyles.lineHeight
    mirror.style.letterSpacing = textareaStyles.letterSpacing
    mirror.style.padding = textareaStyles.padding
    mirror.style.border = textareaStyles.border
    mirror.style.width = textarea.offsetWidth + 'px'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.wordWrap = 'break-word'

    // Get text up to caret position
    const textBeforeCaret = value.substring(0, selectionStart)
    mirror.textContent = textBeforeCaret

    // Create a span to measure caret position
    const caretSpan = document.createElement('span')
    caretSpan.textContent = '|'
    mirror.appendChild(caretSpan)

    try {
      const textareaRect = textarea.getBoundingClientRect()
      const spanRect = caretSpan.getBoundingClientRect()
      
      setCaretPos({
        x: Math.max(0, spanRect.left - textareaRect.left),
        y: Math.max(0, spanRect.top - textareaRect.top - textarea.scrollTop)
      })
    } catch (e) {
      // Fallback if positioning calculation fails
      setCaretPos({ x: 20, y: 20 })
    }
  }

  const handleKeyUp = (e) => {
    const pos = e.currentTarget.selectionStart || e.currentTarget.value.length
    updateCaretPosition(e.currentTarget, pos)
    try { onCursorUpdate?.(e.currentTarget.value, pos) } catch (_) {}
  }
  
  const handleClick = (e) => {
    const pos = e.currentTarget.selectionStart || e.currentTarget.value.length
    updateCaretPosition(e.currentTarget, pos)
    try { onCursorUpdate?.(e.currentTarget.value, pos) } catch (_) {}
  }

  // Update caret position when mention opens
  useEffect(() => {
    if (mentionOpen && inputRef?.current) {
      const pos = inputRef.current.selectionStart || value.length
      updateCaretPosition(inputRef.current, pos)
    }
  }, [mentionOpen, value])

  const hostFrom = (url) => {
    try { return new URL(url || '').hostname } catch { return '' }
  }

  return (
    <div className="relative px-5 py-4">
      {/* Hidden mirror element for caret position calculation */}
      <div
        ref={mirrorRef}
        className="absolute top-0 left-0 opacity-0 pointer-events-none z-[-1] overflow-hidden"
        style={{ height: '1px' }}
        aria-hidden="true"
      />

      <Textarea
        ref={inputRef}
        className={`w-full flex-1 resize-none ${hasUserMessage ? 'min-h-[60px]' : 'min-h-[80px]'} max-h-[180px] text-base leading-6 bg-transparent border-0 focus:ring-0 focus:outline-none placeholder:text-muted-foreground/60 px-0 py-0 transition-all duration-200`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onKeyUp={handleKeyUp}
        onClick={handleClick}
        disabled={disabled}
      />

      {mentionOpen && mentionResults.length > 0 ? (
        <div 
          className="absolute z-20 rounded-xl border ds-border ds-bg shadow-2xl p-1 max-h-60 overflow-y-auto"
          style={{
            left: `${Math.max(5, caretPos.x)}px`,
            top: `${Math.max(10, caretPos.y - 240)}px`, // Position above caret, fallback if too high
            minWidth: '300px',
            maxWidth: '400px',
          }}
        >
          {mentionResults.map((t, idx) => {
            const host = hostFrom(t.url)
            const active = idx === mentionIndex
            return (
              <button
                key={t.id}
                className={`w-full text-left flex items-center gap-2 px-2 py-2 rounded ${active ? 'bg-muted/30' : 'hover:bg-muted/20'}`}
                onMouseEnter={() => setMentionIndex?.(idx)}
                onMouseDown={(e) => { e.preventDefault(); onMentionSelect?.(t) }}
              >
                {t.favIconUrl ? (
                  <img src={t.favIconUrl} alt="" className="h-4 w-4 rounded-sm" />
                ) : (
                  <span className="h-4 w-4 rounded-sm bg-muted inline-block" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm">{t.title || '(untitled tab)'}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{host}</div>
                </div>
                <div className="ml-auto text-[10px] opacity-60">#{t.id}</div>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default ComposerInput
