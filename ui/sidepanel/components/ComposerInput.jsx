import React, { useState, useRef } from 'react'
import { Textarea } from '../../components/ui/textarea.jsx'
import { Plus, Paperclip, Mic, ArrowUp, X } from 'lucide-react'

export function ComposerInput({
  inputRef,
  value,
  onChange,
  onKeyDown,
  disabled,
  placeholder = "Ask Jan ...",
  activeTab,
  onTabClose,
  onContextClick,
  onAttachClick,
  onMicClick,
  onSendClick,
}) {
  const [isFocused, setIsFocused] = useState(false)

  const handleSend = () => {
    if (value.trim() && onSendClick) {
      onSendClick()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    onKeyDown?.(e)
  }

  return (
    <div 
      className="mx-4 mb-4 rounded-2xl shadow-lg"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--theme-border)',
      }}
    >
      {/* Tab Header */}
      {activeTab && (
        <div 
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{
            borderColor: 'var(--theme-border)',
            backgroundColor: '#F7F7F7',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {activeTab.favIconUrl ? (
              <img 
                src={activeTab.favIconUrl} 
                alt="" 
                className="h-4 w-4 rounded-sm flex-shrink-0" 
              />
            ) : (
              <div className="h-4 w-4 rounded-sm bg-orange-500 flex-shrink-0 flex items-center justify-center">
                <span className="text-white text-xs font-bold">a</span>
              </div>
            )}
            <span 
              className="truncate text-sm font-medium"
              style={{ color: 'var(--theme-high-em-text)' }}
            >
              {activeTab.title || 'Untitled Tab'}
            </span>
          </div>
          {onTabClose && (
            <button
              onClick={onTabClose}
              className="p-1 rounded hover:bg-black/5 transition-colors flex-shrink-0"
              style={{ color: 'var(--theme-mid-em-text)' }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="p-4">
        <Textarea
          ref={inputRef}
          className="w-full resize-none border-0 bg-transparent focus:ring-0 focus:outline-none text-base leading-relaxed min-h-[80px] max-h-[200px] p-0"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          style={{
            color: value ? 'var(--theme-high-em-text)' : 'var(--theme-low-em-text)',
          }}
        />
      </div>

      {/* Bottom Toolbar */}
      <div className="flex items-center justify-between px-4 pb-4">
        <div className="flex items-center gap-2">
          {/* Context Button */}
          <button
            onClick={onContextClick}
            className="flex items-center gap-2 px-3 py-2 rounded-full transition-colors hover:bg-black/5"
            style={{
              backgroundColor: 'var(--theme-emphasized-bg)',
              color: 'var(--theme-mid-em-text)',
            }}
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm font-medium">Context</span>
          </button>

          {/* Attachment Button */}
          <button
            onClick={onAttachClick}
            className="p-2 rounded-full transition-colors hover:bg-black/5"
            style={{ color: 'var(--theme-mid-em-text)' }}
          >
            <Paperclip className="h-4 w-4" />
          </button>

          {/* Microphone Button */}
          <button
            onClick={onMicClick}
            className="p-2 rounded-full transition-colors hover:bg-black/5"
            style={{ color: 'var(--theme-mid-em-text)' }}
          >
            <Mic className="h-4 w-4" />
          </button>
        </div>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          className="p-2 rounded-full transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: value.trim() ? 'var(--theme-accent)' : 'var(--theme-emphasized-bg)',
            color: value.trim() ? 'white' : 'var(--theme-mid-em-text)',
          }}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default ComposerInput
