import React from 'react'
import { cn } from '../../lib/utils'

export function Button({ className, variant = 'default', size = 'default', asChild = false, ...props }) {
  const Comp = asChild ? 'span' : 'button'
  const base = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50'
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700',
    ghost: 'bg-transparent hover:bg-black/5 dark:hover:bg-white/10',
    outline: 'border border-neutral-300 dark:border-neutral-700 hover:bg-black/5 dark:hover:bg-white/10',
    pastel: 'btn-pastel border border-transparent',
    pastelReverse: 'btn-pastel-rev border border-transparent',
  }
  const sizes = {
    default: 'h-9 px-3 py-1',
    sm: 'h-8 px-2',
    lg: 'h-10 px-4',
    icon: 'h-8 w-8 p-0',
  }
  return <Comp className={cn(base, variants[variant] || variants.default, sizes[size] || sizes.default, className)} {...props} />
}
