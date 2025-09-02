import * as React from 'react'
import { cn } from '@/lib/utils'

export const Textarea = React.forwardRef(function Textarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus:ring-0',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
})

export default Textarea
