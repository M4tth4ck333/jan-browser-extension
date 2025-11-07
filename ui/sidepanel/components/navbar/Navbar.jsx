import React, { useCallback, useRef, useState, useEffect } from 'react'
import { Button } from '../../../components/ui/button.jsx'
import { NotebookPen as NotebookIcon, Menu, Link2 as LinkIcon, Focus as FocusIcon } from 'lucide-react'
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

// Connect button for MCP tab registration
function ConnectButton({ connectedTabId, currentTabId, onConnect, onFocus, onDisconnect }) {
  const [open, setOpen] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const btnRef = useRef(null)
  const dropdownRef = useRef(null)
  const isConnected = !!connectedTabId
  const isCurrentTabConnected = connectedTabId === currentTabId

  // Log connection state changes
  useEffect(() => {
    if (isConnected) {
      console.log('[Connect Button] 🔗 Tab connected:', connectedTabId, isCurrentTabConnected ? '(current tab)' : '(different tab)')
    } else {
      console.log('[Connect Button] ⚪ No tab connected')
    }
  }, [connectedTabId, isConnected, isCurrentTabConnected])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleConnectFromThisTab = useCallback(async () => {
    setOpen(false)
    console.log('[Connect Button] Connecting to tab:', currentTabId)
    await onConnect?.(currentTabId)
    console.log('[Connect Button] ✅ Tab connected successfully:', currentTabId)
    // Animate button
    const el = btnRef.current
    try {
      animate(el, { scale: [1, 1.12, 1], rotate: [0, 10, 0] }, { duration: 0.3, easing: 'ease-out' })
    } catch (_) {}
  }, [currentTabId, onConnect])

  const handleFocusToConnectedTab = useCallback(async () => {
    setOpen(false)
    console.log('[Connect Button] Focusing to connected tab:', connectedTabId)
    await onFocus?.(connectedTabId)
    // Animate button
    const el = btnRef.current
    try {
      animate(el, { scale: [1, 1.08, 1], y: [0, -2, 0] }, { duration: 0.25, easing: 'ease-out' })
    } catch (_) {}
  }, [connectedTabId, onFocus])

  const handleDisconnect = useCallback(async () => {
    setOpen(false)
    console.log('[Connect Button] Disconnecting tab:', connectedTabId)
    await onDisconnect?.()
    console.log('[Connect Button] ⚪ Tab disconnected')
    // Animate button
    const el = btnRef.current
    try {
      animate(el, { scale: [1, 0.95, 1], opacity: [1, 0.7, 1] }, { duration: 0.25, easing: 'ease-out' })
    } catch (_) {}
  }, [connectedTabId, onDisconnect])

  return (
    <div className="relative">
      <Button
        ref={btnRef}
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
        className={`h-8 w-8 rounded-full transition-all ${
          isPressed ? 'font-bold scale-95' : ''
        } ${
          isCurrentTabConnected
            ? 'text-green-800 dark:text-green-600 bg-green-200/70 dark:bg-green-900/50 hover:text-green-900 dark:hover:text-green-500'
            : isConnected
            ? 'text-green-600 dark:text-green-400 bg-green-100/30 dark:bg-green-900/20 hover:text-green-700 dark:hover:text-green-300'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        title={
          isConnected
            ? isCurrentTabConnected
              ? '✅ Connected (this tab) - Click to disconnect'
              : '🔗 Connected (different tab) - Click to manage'
            : '⚪ Not connected - Click to connect this tab for MCP tools'
        }
      >
        <LinkIcon size={16} className={isCurrentTabConnected ? '' : isConnected ? 'animate-pulse' : ''} />
      </Button>
      {open && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 w-56 p-2 bg-card border ds-border rounded-lg shadow-lg z-50"
        >
          <div className="flex flex-col gap-1">
            {isConnected && !isCurrentTabConnected && (
              <Button
                variant="ghost"
                size="sm"
                className="justify-start gap-2 text-sm w-full"
                onClick={handleFocusToConnectedTab}
              >
                <FocusIcon size={14} />
                Focus to connected tab
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 text-sm w-full"
              onClick={isCurrentTabConnected ? handleDisconnect : handleConnectFromThisTab}
            >
              <LinkIcon size={14} />
              {isCurrentTabConnected ? '🔓 Disconnect' : '⚪ Connect to this tab'}
            </Button>
            {isConnected && (
              <div className="mt-2 pt-2 border-t ds-border px-2 py-1">
                <p className="text-xs text-muted-foreground">
                  {isCurrentTabConnected
                    ? 'MCP tools will operate on this tab'
                    : 'MCP tools are using another tab'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function Navbar({
  sidebarOpen,
  setSidebarOpen,
  createNewChat,
  SettingsTrigger,
  connectedTabId,
  currentTabId,
  onConnectTab,
  onFocusToConnectedTab,
  onDisconnectTab
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
        <ConnectButton
          connectedTabId={connectedTabId}
          currentTabId={currentTabId}
          onConnect={onConnectTab}
          onFocus={onFocusToConnectedTab}
          onDisconnect={onDisconnectTab}
        />
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
