import React, { useRef, useEffect } from 'react'
import { animate } from 'framer-motion/dom'
import { FileText, MessageSquare, BarChart3, FileEdit, MoreHorizontal } from 'lucide-react'

export function SuggestionPills({ onPillClick }) {
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

  const suggestions = [
    {
      id: 'summarize',
      text: 'Summarize a page',
      icon: FileText,
      color: '#F17455', // Orange
      prompt: 'Summarize this page for me.'
    },
    {
      id: 'questions',
      text: 'Ask questions about tabs',
      icon: MessageSquare,
      color: '#10B981', // Green
      prompt: 'I have questions about my open tabs.'
    },
    {
      id: 'compare',
      text: 'Compare products',
      icon: BarChart3,
      color: '#06B6D4', // Cyan
      prompt: 'Help me compare products or options from my tabs.'
    },
    {
      id: 'draft',
      text: 'Draft reports',
      icon: FileEdit,
      color: '#8B5CF6', // Purple
      prompt: 'Help me draft a report based on my research.'
    },
    {
      id: 'more',
      text: 'more',
      icon: MoreHorizontal,
      color: '#EC4899', // Pink
      prompt: 'What else can you help me with?'
    }
  ]

  const handlePillClick = (suggestion) => {
    onPillClick?.(suggestion.prompt)
  }

  return (
    <div ref={ref} className="text-center max-w-2xl mx-auto">
      <h2 className="font-inter-display text-2xl md:text-3xl text-gray-700 mb-8">
        How can Jan help you?
      </h2>
      
      <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
        {suggestions.map((suggestion) => {
          const Icon = suggestion.icon
          return (
            <button
              key={suggestion.id}
              onClick={() => handlePillClick(suggestion)}
              className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200 text-left group min-h-[52px]"
            >
              <div 
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: suggestion.color }}
              >
                <Icon size={14} className="text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                {suggestion.text}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
