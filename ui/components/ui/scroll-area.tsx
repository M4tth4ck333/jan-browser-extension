import React from 'react'

// Simple scroll area components - basic implementations for the extension
export const ScrollArea = {
  Root: ({ children, className, ...props }) => (
    <div className={`relative overflow-hidden ${className || ''}`} {...props}>
      {children}
    </div>
  ),
  
  Viewport: ({ children, className, ...props }) => (
    <div className={`h-full w-full overflow-auto ${className || ''}`} {...props}>
      {children}
    </div>
  ),
  
  Scrollbar: ({ children, className, orientation = 'vertical', ...props }) => (
    <div 
      className={`flex select-none touch-none bg-transparent ${className || ''}`} 
      data-orientation={orientation}
      {...props}
    >
      {children}
    </div>
  ),
  
  Thumb: ({ className, ...props }) => (
    <div className={`flex-1 rounded-full ${className || ''}`} {...props} />
  )
}
