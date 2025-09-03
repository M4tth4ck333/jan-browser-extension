import React from 'react'
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
  const handleKeyUp = (e) => {
    try { onCursorUpdate?.(e.currentTarget.value, e.currentTarget.selectionStart || e.currentTarget.value.length) } catch (_) {}
  }
  const handleClick = (e) => {
    try { onCursorUpdate?.(e.currentTarget.value, e.currentTarget.selectionStart || e.currentTarget.value.length) } catch (_) {}
  }

  const hostFrom = (url) => {
    try { return new URL(url || '').hostname } catch { return '' }
  }

  return (
    <div className="relative px-5 py-4">
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
        <div className="absolute left-0 right-0 bottom-full mb-2 z-20 rounded-xl border ds-border ds-bg shadow-2xl p-1 max-h-60 overflow-y-auto">
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
