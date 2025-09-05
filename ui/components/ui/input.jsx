import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef(function Input(
  { className, type = 'text', ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border px-3 py-2 text-sm',
        'focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      style={{
        backgroundColor: 'var(--theme-field)',
        borderColor: 'var(--theme-border-interactive)',
        color: 'var(--theme-high-em-text)',
        '--placeholder-color': 'var(--theme-field-fg)'
      }}
      onFocus={(e) => {
        e.target.style.backgroundColor = 'var(--theme-field-active)'
        e.target.style.borderColor = 'var(--theme-primary)'
      }}
      onBlur={(e) => {
        e.target.style.backgroundColor = 'var(--theme-field)'
        e.target.style.borderColor = 'var(--theme-border-interactive)'
      }}
      {...props}
    />
  )
})

export default Input
