import React, { useCallback, useRef } from 'react'
import { Button } from '../../../components/ui/button.jsx'
import { NotebookPen as NotebookIcon, Menu } from 'lucide-react'
import { animate } from 'motion'

// Animated hamburger menu trigger for opening the sidebar
function MenuTrigger({ onOpen }) {
  const btnRef = useRef(null)
  const handlePointerDown = useCallback(() => {
    // Open immediately on press
    onOpen?.()
    // Fire-and-forget micro animation for tap feedback
    const el = btnRef.current
    try {
      animate(
        el,
        { scale: [1, 1.08, 1], y: [0, -1, 0] },
        { duration: 0.14, easing: 'ease-out' }
      )
    } catch (_) {}
  }, [onOpen])
  return (
    <Button ref={btnRef} variant="ghost" size="icon" onPointerDown={handlePointerDown} aria-label="Open sidebar">
      <Menu size={18} />
    </Button>
  )
}

export function Navbar({
  sidebarOpen,
  setSidebarOpen,
  createNewChat,
  SettingsTrigger
}) {
  return (
    <header className="sticky top-0 z-10 grid grid-cols-3 items-center px-2 py-1.5 bg-transparent">
      <div className="flex items-center gap-2 min-w-0">
        {!sidebarOpen && (
          <MenuTrigger onOpen={() => setSidebarOpen(true)} />
        )}
      </div>
      <div className="flex items-center justify-center">
        <span className="font-geist font-medium text-lg">Jan</span>
      </div>
      <div className="flex items-center justify-end gap-1">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={createNewChat}
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground transition-colors"
          title="New chat"
        >
          <NotebookIcon size={16} />
        </Button>
        <SettingsTrigger />
      </div>
    </header>
  )
}

export default Navbar
