import React from 'react'
import { cn } from '../../lib/utils'

export function Button({ className, variant = 'default', size = 'default', asChild = false, ...props }) {
  const Comp = asChild ? 'span' : 'button'
  const base = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50'
  const focusRing = 'focus-visible:ring-[--theme-primary]'
  const variants = {
    default: 'text-white hover:opacity-90',
    secondary: 'hover:opacity-90',
    ghost: 'bg-transparent hover:opacity-80',
    outline: 'border hover:opacity-90',
    pastel: 'btn-pastel border border-transparent',
    pastelReverse: 'btn-pastel-rev border border-transparent',
  }
  const sizes = {
    default: 'h-9 px-3 py-1',
    sm: 'h-8 px-2',
    lg: 'h-10 px-4',
    icon: 'h-8 w-8 p-0',
  }
  const getVariantStyles = (variant) => {
    switch (variant) {
      case 'default':
        return { backgroundColor: 'var(--theme-primary)', color: 'var(--theme-primary-fg)' }
      case 'secondary':
        return { backgroundColor: 'var(--theme-secondary)', color: 'var(--theme-secondary-fg)' }
      case 'ghost':
        return { backgroundColor: 'transparent', color: 'var(--theme-high-em-text)' }
      case 'outline':
        return { backgroundColor: 'var(--theme-tertiary)', color: 'var(--theme-tertiary-fg)', borderColor: 'var(--theme-border-interactive)' }
      default:
        return { backgroundColor: 'var(--theme-primary)', color: 'var(--theme-primary-fg)' }
    }
  }
  
  return <Comp 
    className={cn(base, focusRing, variants[variant] || variants.default, sizes[size] || sizes.default, className)} 
    style={getVariantStyles(variant)}
    {...props} 
  />
}
