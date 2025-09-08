import React, { useState, useEffect } from 'react'
import { Button } from '../../components/ui/button.jsx'
import { Input } from '../../components/ui/input.jsx'
import { Checkbox } from '../../components/ui/checkbox.tsx'
import { 
  ArrowLeft, 
  MessageSquare as NewChatIcon, 
  X as CloseIcon, 
  Plus as PlusIcon,
  Check as CheckIcon,
  Edit3 as EditIcon,
  Brain as BrainIcon,
  Keyboard as KeyboardIcon,
  MoreHorizontal as MoreIcon,
  Palette as PaletteIcon,
  User as UserIcon,
  ArrowUp,
  Copy as CopyIcon,
  Bot,
  Globe as GlobalIcon,
  Monitor as MonitorIcon,
  Moon as MoonIcon,
  Sun as SunIcon,
  Sparkles as SparklesIcon,
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
  Save as SaveIcon
} from 'lucide-react'
import { SettingsIcon } from './icons/SettingsIcon.jsx'
import { ShineBorder } from '../../../src/components/magicui/shine-border.tsx'

export function Settings({ 
  onClose, 
  onNewChat, 
  theme, 
  toggleTheme,
  showDebug,
  setShowDebug,
  showReadingOverlay,
  setShowReadingOverlay,
  showComposerSearchButton,
  setShowComposerSearchButton 
}) {
  const [activeTab, setActiveTab] = useState('Answers')
  const [toneStyle, setToneStyle] = useState('Balanced')
  const [customToneValue, setCustomToneValue] = useState(0)

  // Load settings from storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await chrome.storage.sync.get([
          'showDebug', 
          'showReadingOverlay', 
          'showComposerSearchButton',
          'toneStyle',
          'customToneValue'
        ])
        
        if (result.toneStyle) setToneStyle(result.toneStyle)
        if (result.customToneValue !== undefined) setCustomToneValue(result.customToneValue)
      } catch (_) {}
    }
    loadSettings()
  }, [])

  // Save tone style to storage
  const handleToneChange = async (tone) => {
    setToneStyle(tone)
    try {
      await chrome.storage.sync.set({ toneStyle: tone })
    } catch (_) {}
  }

  // Save custom tone value to storage
  const handleCustomToneChange = async (value) => {
    setCustomToneValue(value)
    try {
      await chrome.storage.sync.set({ customToneValue: value })
    } catch (_) {}
  }

  const handleDebugToggle = async (checked) => {
    setShowDebug(checked)
    try {
      await chrome.storage.sync.set({ showDebug: checked })
    } catch (_) {}
  }

  const handleReadingOverlayToggle = async (checked) => {
    setShowReadingOverlay(checked)
    try {
      await chrome.storage.sync.set({ showReadingOverlay: checked })
    } catch (_) {}
  }

  const handleComposerSearchToggle = async (checked) => {
    setShowComposerSearchButton(checked)
    try {
      await chrome.storage.sync.set({ showComposerSearchButton: checked })
    } catch (_) {}
  }

  const tabs = [
    { id: 'Answers', icon: BrainIcon, label: 'Answers' },
    { id: 'Bridge', icon: SettingsIcon, label: 'Bridge' },
    { id: 'Shortcuts', icon: KeyboardIcon, label: 'Shortcuts' },
    { id: 'Themes', icon: PaletteIcon, label: 'Themes' },
    { id: 'Others', icon: MoreIcon, label: 'Others' }
  ]

  const toneOptions = [
    { id: 'Precise', label: 'Precise', description: 'for facts or technical answers' },
    { id: 'Balanced', label: 'Balanced', description: 'for everyday use' },
    { id: 'Creative', label: 'Creative', description: 'for brainstorming or storytelling' },
    { id: 'Custom', label: 'Custom', description: '0 (precise) to 2 (creative)' }
  ]

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: theme === 'dark' ? '#111827' : '#f9fafb' }}>
      {/* Header */}
      <div className="p-3 border-b" style={{ 
        borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
        backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff'
      }}>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 transition-colors"
            style={{
              color: theme === 'dark' ? '#9ca3af' : '#6b7280'
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onNewChat}
              className="flex items-center gap-1.5 text-xs"
            >
              <NewChatIcon size={14} />
              New chat
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <CloseIcon size={14} />
            </Button>
          </div>
        </div>
        
        <h1 className="text-lg font-inter-display mb-4" style={{
          color: theme === 'dark' ? '#f9fafb' : '#111827'
        }}>Settings</h1>
        
        {/* Tab Navigation */}
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
                style={{
                  backgroundColor: activeTab === tab.id 
                    ? (theme === 'dark' ? '#374151' : '#f3f4f6')
                    : 'transparent',
                  color: activeTab === tab.id
                    ? (theme === 'dark' ? '#f9fafb' : '#111827')
                    : (theme === 'dark' ? '#9ca3af' : '#6b7280')
                }}
              >
                <Icon size={12} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'Answers' && (
          <div className="p-4 space-y-6">
            {/* Models Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-inter-display text-sm">Models</h2>
                <Button variant="outline" size="sm" className="flex items-center gap-1.5 text-xs">
                  <PlusIcon size={12} />
                  Add model
                </Button>
              </div>
              
              {/* Jan Nano Model */}
              <div className="rounded-lg p-3 mb-3" style={{
                backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`
              }}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckIcon size={12} className="text-green-600" />
                    </div>
                    <span className="text-lg">👋</span>
                    <div>
                      <div className="font-medium text-sm" style={{
                        color: theme === 'dark' ? '#f9fafb' : '#111827'
                      }}>Jan Nano</div>
                      <div className="text-xs" style={{
                        color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                      }}>Jan</div>
                    </div>
                  </div>
                  <div className="ml-auto">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <MoreIcon size={12} />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Add Model Card */}
              <div className="rounded-lg p-4 relative" style={{
                backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`
              }}>
                <Button
                  variant="ghost"
                  size="icon" 
                  className="absolute top-2 right-2 h-6 w-6 text-muted-foreground"
                >
                  <CloseIcon size={12} />
                </Button>
                
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <SettingsIcon size={16} className="text-orange-500" />
                    <span className="text-orange-500">☀️</span>
                    <span className="text-blue-500">🔗</span>
                    <span className="text-orange-600">🌙</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="font-medium text-sm" style={{
                    color: theme === 'dark' ? '#f9fafb' : '#111827'
                  }}>Add your favorite model to Jan</div>
                  <div className="text-xs" style={{
                    color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                  }}>
                    Use OpenAI, Anthropic, your own API, or connect via Cerebrus and OpenRouter for even more options.
                  </div>
                </div>
              </div>
            </div>

            {/* Tone & Style Section */}
            <div>
              <h2 className="font-inter-display text-sm mb-3" style={{
                color: theme === 'dark' ? '#f9fafb' : '#111827'
              }}>Tone & style</h2>
              <div className="space-y-2">
                {toneOptions.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors"
                    style={{
                      backgroundColor: toneStyle === option.id 
                        ? (theme === 'dark' ? '#374151' : '#f3f4f6')
                        : 'transparent'
                    }}
                  >
                    <div className="flex items-center">
                      <input
                        type="radio"
                        name="tone"
                        value={option.id}
                        checked={toneStyle === option.id}
                        onChange={() => handleToneChange(option.id)}
                        className="w-4 h-4 text-primary bg-background border-border focus:ring-primary"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{
                          color: theme === 'dark' ? '#f9fafb' : '#111827'
                        }}>{option.label}</span>
                        <span className="text-xs" style={{
                          color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                        }}>{option.description}</span>
                      </div>
                    </div>
                    {option.id === 'Custom' && toneStyle === 'Custom' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={customToneValue}
                          onChange={(e) => handleCustomToneChange(parseFloat(e.target.value))}
                          className="w-16 h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <EditIcon size={10} />
                        </Button>
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Bridge' && (
          <div className="p-4">
            <div className="space-y-4">
              <div>
                <h2 className="font-inter-display text-sm mb-2" style={{
                  color: theme === 'dark' ? '#f9fafb' : '#111827'
                }}>Bridge Settings</h2>
                <p className="text-sm mb-4" style={{
                  color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                }}>
                  Configure the bridge connection for external model providers.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Shortcuts' && (
          <div className="p-4">
            <div className="space-y-4">
              <div>
                <h2 className="font-inter-display text-sm mb-2" style={{
                  color: theme === 'dark' ? '#f9fafb' : '#111827'
                }}>Keyboard Shortcuts</h2>
                <p className="text-sm mb-4" style={{
                  color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                }}>
                  Configure keyboard shortcuts for quick actions.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Themes' && (
          <div className="p-4">
            <div className="space-y-6">
              <div>
                <h2 className="font-inter-display text-sm mb-3" style={{
                  color: theme === 'dark' ? '#f9fafb' : '#111827'
                }}>Theme Selection</h2>
                <p className="text-sm mb-4" style={{
                  color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                }}>
                  Choose from predefined themes or create your own custom theme.
                </p>
                
                <div className="space-y-3">
                  <div className="rounded-lg p-3" style={{
                    backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                    border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`
                  }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded border flex items-center justify-center" style={{ background: 'linear-gradient(45deg, #F17455 0%, #FAFAFA 50%, #3D3D3D 100%)' }}>
                        <CheckIcon size={14} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm" style={{
                          color: theme === 'dark' ? '#f9fafb' : '#111827'
                        }}>Default Theme</div>
                        <div className="text-xs" style={{
                          color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                        }}>Clean and modern interface</div>
                      </div>
                      <div className="text-xs px-2 py-1 rounded" style={{
                        backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.1)',
                        color: theme === 'dark' ? '#3b82f6' : '#2563eb'
                      }}>Active</div>
                    </div>
                  </div>
                  
                  <div className="rounded-lg p-3 opacity-50" style={{
                    backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                    border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`
                  }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded border bg-gradient-to-br from-slate-900 to-slate-700"></div>
                      <div className="flex-1">
                        <div className="font-medium text-sm" style={{
                          color: theme === 'dark' ? '#f9fafb' : '#111827'
                        }}>Dark Theme</div>
                        <div className="text-xs" style={{
                          color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                        }}>Coming soon...</div>
                      </div>
                      <div className="text-xs" style={{
                        color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                      }}>Soon</div>
                    </div>
                  </div>
                  
                  <div className="rounded-lg p-3 opacity-50" style={{
                    backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                    border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`
                  }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded border bg-gradient-to-br from-blue-500 to-purple-500"></div>
                      <div className="flex-1">
                        <div className="font-medium text-sm" style={{
                          color: theme === 'dark' ? '#f9fafb' : '#111827'
                        }}>Custom Theme</div>
                        <div className="text-xs" style={{
                          color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                        }}>Create your own colors</div>
                      </div>
                      <div className="text-xs" style={{
                        color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                      }}>Soon</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <h2 className="font-inter-display text-sm mb-3" style={{
                  color: theme === 'dark' ? '#f9fafb' : '#111827'
                }}>Theme Development (TODO)</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                    <span>Create theme system infrastructure with CSS custom properties</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                    <span>Implement the provided color palette as default theme</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                    <span>Create predefined theme variants (light, dark, custom colors)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                    <span>Update all existing components to use theme variables</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                    <span>Add theme selection to Settings component</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                    <span>Implement theme persistence in chrome.storage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                    <span>Create theme preview functionality</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                    <span>Test theme switching across all components</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Others' && (
          <div className="p-4">
            <div className="space-y-4">
              <div>
                <h2 className="font-inter-display text-sm mb-3" style={{
                  color: theme === 'dark' ? '#f9fafb' : '#111827'
                }}>Debug & Development</h2>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={showDebug}
                      onCheckedChange={handleDebugToggle}
                    />
                    <div>
                      <div className="text-sm font-medium" style={{
                        color: theme === 'dark' ? '#f9fafb' : '#111827'
                      }}>Show debug tools</div>
                      <div className="text-xs" style={{
                        color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                      }}>
                        Display debug information and development tools
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={showReadingOverlay}
                      onCheckedChange={handleReadingOverlayToggle}
                    />
                    <div>
                      <div className="text-sm font-medium" style={{
                        color: theme === 'dark' ? '#f9fafb' : '#111827'
                      }}>Show reading overlay</div>
                      <div className="text-xs" style={{
                        color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                      }}>
                        Display overlay when reading page content
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={showComposerSearchButton}
                      onCheckedChange={handleComposerSearchToggle}
                    />
                    <div>
                      <div className="text-sm font-medium" style={{
                        color: theme === 'dark' ? '#f9fafb' : '#111827'
                      }}>Show composer search button</div>
                      <div className="text-xs" style={{
                        color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                      }}>
                        Display search button in the message composer
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <h2 className="font-inter-display text-sm mb-3" style={{
                  color: theme === 'dark' ? '#f9fafb' : '#111827'
                }}>Legacy Theme Toggle</h2>
                <p className="text-xs mb-2" style={{
                  color: theme === 'dark' ? '#9ca3af' : '#6b7280'
                }}>This will be replaced by the new theme system</p>
                <Button
                  variant="outline"
                  onClick={toggleTheme}
                  className="flex items-center gap-2"
                >
                  Switch to {theme === 'blue' ? 'Yellow' : 'Blue'} theme
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
