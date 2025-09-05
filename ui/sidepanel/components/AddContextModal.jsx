import React, { useState, useEffect } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Button } from '../../components/ui/button.jsx'
import { Input } from '../../components/ui/input.jsx'
import { X as XIcon, Search as SearchIcon } from 'lucide-react'

export function AddContextModal({ 
  isOpen, 
  onClose, 
  onSave, 
  allTabs = [], 
  theme 
}) {
  const [activeTab, setActiveTab] = useState('Add context')
  const [selectedTabs, setSelectedTabs] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  // Filter tabs based on search query
  const filteredTabs = allTabs.filter(tab => 
    tab.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tab.url?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleTabToggle = (tab) => {
    setSelectedTabs(prev => 
      prev.find(t => t.id === tab.id)
        ? prev.filter(t => t.id !== tab.id)
        : [...prev, tab]
    )
  }

  const handleSave = () => {
    onSave?.(selectedTabs)
    setSelectedTabs([])
    setSearchQuery('')
    onClose?.()
  }

  const handleCancel = () => {
    setSelectedTabs([])
    setSearchQuery('')
    onClose?.()
  }

  // Get tab favicon
  const getFavicon = (tab) => {
    if (tab.favIconUrl && tab.favIconUrl !== 'chrome://favicon/') {
      return tab.favIconUrl
    }
    return `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=16`
  }

  const tabs = [
    { id: 'Add context', label: 'Add context' },
    { id: 'Tabs', label: 'Tabs' },
    { id: 'Attach file', label: 'Attach file' }
  ]

  if (!isOpen) return null

  return (
    <Popover.Root open={isOpen} onOpenChange={onClose}>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-96 rounded-2xl border shadow-lg bg-background p-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          style={{
            backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
            borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
            color: theme === 'dark' ? '#f9fafb' : '#111827'
          }}
          sideOffset={8}
        >
          {/* Header with tabs */}
          <div className="border-b px-4 py-3" style={{ borderColor: theme === 'dark' ? '#374151' : '#e5e7eb' }}>
            <div className="flex gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  style={{
                    backgroundColor: activeTab === tab.id 
                      ? (theme === 'dark' ? '#3b82f6' : '#2563eb')
                      : 'transparent',
                    color: activeTab === tab.id
                      ? '#ffffff'
                      : (theme === 'dark' ? '#9ca3af' : '#6b7280')
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            {activeTab === 'Add context' && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  Select tabs to add context from your browsing session.
                </p>
              </div>
            )}

            {activeTab === 'Tabs' && (
              <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search using title or url"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    style={{
                      backgroundColor: theme === 'dark' ? '#374151' : '#f9fafb',
                      borderColor: theme === 'dark' ? '#4b5563' : '#d1d5db',
                      color: theme === 'dark' ? '#f9fafb' : '#111827'
                    }}
                  />
                </div>

                {/* Tab list */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredTabs.length > 0 ? (
                    filteredTabs.map((tab) => {
                      const isSelected = selectedTabs.find(t => t.id === tab.id)
                      return (
                        <button
                          key={tab.id}
                          onClick={() => handleTabToggle(tab)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                            isSelected 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:border-primary/50'
                          }`}
                          style={{
                            borderColor: isSelected 
                              ? (theme === 'dark' ? '#3b82f6' : '#2563eb')
                              : (theme === 'dark' ? '#4b5563' : '#d1d5db'),
                            backgroundColor: isSelected
                              ? (theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.05)')
                              : 'transparent'
                          }}
                        >
                          <img
                            src={getFavicon(tab)}
                            alt=""
                            className="w-4 h-4 rounded-sm flex-shrink-0"
                            onError={(e) => {
                              e.target.style.display = 'none'
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate text-sm">
                              {tab.title || 'Untitled'}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {tab.url}
                            </div>
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No tabs found
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'Attach file' && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  File attachment functionality coming soon.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-4 py-3 flex justify-between" style={{ borderColor: theme === 'dark' ? '#374151' : '#e5e7eb' }}>
            <Button
              variant="ghost"
              onClick={handleCancel}
              style={{
                color: theme === 'dark' ? '#9ca3af' : '#6b7280'
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={selectedTabs.length === 0}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              style={{
                backgroundColor: theme === 'dark' ? '#3b82f6' : '#2563eb',
                color: '#ffffff'
              }}
            >
              Save {selectedTabs.length > 0 && selectedTabs.length}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
