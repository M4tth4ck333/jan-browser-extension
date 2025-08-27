import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

const DEFAULTS = {
  provider: 'custom', apiBase: '', apiKey: '', model: '', temperature: 0.2,
  bridgeToken: '', useBridgeToken: false,
  inlineAssistEnabled: true,
  // Only the supported actions; Custom Prompt is always available from the tooltip/shortcut.
  inlineAssistActions: ['rewrite','translate'],
  useModelList: false,
  useApiKey: true,
  // Custom full completions URL support (for provider: custom)
  useCustomCompletionsUrl: false,
  customCompletionsUrl: '',
  // UI: dim overlay behind reading indicator (busy pre-stream)
  showReadingOverlay: false,
  // Search preferences
  ddgOnly: false,
}

export default function OptionsApp() {
  const [cfg, setCfg] = useState(DEFAULTS)
  const [status, setStatus] = useState('')
  const [bridgeInfo, setBridgeInfo] = useState({ connected: false, url: '', usingToken: false })
  const [cmdContext, setCmdContext] = useState('root') // 'root' | 'mcp'
  const [advOpen, setAdvOpen] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const mqRef = useRef(null)
  const [modelsState, setModelsState] = useState({ loading: false, error: '', items: [] })
  const [cmds, setCmds] = useState([])

  // Toggle whether the browser sends the bridge token when connecting (default off)
  const onToggleUseBridge = (e) => {
    const val = !!e.target.checked
    setCfg({ ...cfg, useBridgeToken: val })
    try { chrome.storage.sync.set({ useBridgeToken: val }) } catch (_) {}
  }

  useEffect(() => {
    ;(async () => {
      const s = await chrome.storage.sync.get(Object.keys(DEFAULTS))
      setCfg({ ...DEFAULTS, ...s })
    })()
  }, [])

  // Load current keyboard shortcuts so users can see if Chrome assigned them
  useEffect(() => {
    try {
      chrome.commands.getAll((items) => setCmds(items || []))
    } catch (_) { /* ignore */ }
  }, [])

  // Fetch models when toggled on, or when provider/base/key changes while toggled on
  useEffect(() => {
    if (!cfg.useModelList) return
    // Avoid noisy errors while the user is still filling inputs
    if (!cfg.apiBase) return
    if (cfg.useApiKey && !cfg.apiKey) return
    let cancelled = false
    const fetchModels = async () => {
      setModelsState({ loading: true, error: '', items: [] })
      // Send overrides so background doesn't rely on possibly-stale storage
      const res = await chrome.runtime.sendMessage({
        type: 'LIST_MODELS',
        payload: { apiBase: cfg.apiBase, apiKey: cfg.apiKey, useApiKey: !!cfg.useApiKey }
      }).catch(e => ({ ok: false, error: e.message }))
      if (cancelled) return
      if (!res?.ok) {
        setModelsState({ loading: false, error: res?.error || 'Failed to fetch models', items: [] })
      } else {
        const items = Array.isArray(res.models) ? res.models : []
        // Normalize display: prefer id, fallback to name
        const normalized = items.map(m => ({ id: m?.id || m?.name || '', name: m?.id || m?.name || '' })).filter(m => m.id)
        setModelsState({ loading: false, error: '', items: normalized })
      }
    }
    fetchModels()
    return () => { cancelled = true }
  }, [cfg.useModelList, cfg.provider, cfg.apiBase, cfg.apiKey])

  const onChange = (k) => (e) => setCfg({ ...cfg, [k]: k === 'temperature' ? Number(e.target.value) : e.target.value })

  // Known provider defaults (locked endpoints)
  const getDefaultBase = useCallback((provider) => {
    switch (provider) {
      case 'jan-server':
        // Hidden until public release
        return 'https://comingsoon.ai'
      case 'openai':
        return 'https://api.openai.com/v1'
      case 'anthropic':
        // Note: Anthropic's native API is not OpenAI-compatible for chat completions.
        // Use only if your endpoint implements an OpenAI-compatible shim.
        return 'https://api.anthropic.com/v1'
      case 'openrouter':
        return 'https://openrouter.ai/api/v1'
      case 'cerebras':
        return 'https://api.cerebras.ai/v1'
      case 'jan':
        return 'http://localhost:1337/v1'
      default:
        return ''
    }
  }, [])

  const isLockedProvider = useCallback((provider) => (
    provider === 'jan-server' || provider === 'openai' || provider === 'anthropic' || provider === 'openrouter' || provider === 'cerebras' || provider === 'jan'
  ), [])

  const onProviderChange = (e) => {
    const provider = e.target.value
    const apiBase = isLockedProvider(provider) ? getDefaultBase(provider) : (cfg.apiBase || '')
    setCfg({ ...cfg, provider, apiBase })
  }

  const save = async () => {
    await chrome.storage.sync.set(cfg)
    setStatus('Saved ✓')
    setTimeout(() => setStatus(''), 1500)
    // Optionally refresh models after save so the dropdown reflects persisted settings
    if (cfg.useModelList && cfg.apiBase && (!cfg.useApiKey || cfg.apiKey)) {
      setModelsState({ loading: true, error: '', items: [] })
      const res = await chrome.runtime.sendMessage({
        type: 'LIST_MODELS',
        payload: { apiBase: cfg.apiBase, apiKey: cfg.apiKey, useApiKey: !!cfg.useApiKey }
      }).catch(e => ({ ok: false, error: e.message }))
      if (!res?.ok) setModelsState({ loading: false, error: res?.error || 'Failed to fetch models', items: [] })
      else {
        const items = Array.isArray(res.models) ? res.models : []
        const normalized = items.map(m => ({ id: m?.id || m?.name || '', name: m?.id || m?.name || '' })).filter(m => m.id)
        setModelsState({ loading: false, error: '', items: normalized })
      }
    }
  }

  const test = async () => {
    setStatus('Testing…')
    const res = await chrome.runtime.sendMessage({ type: 'TEST_SETTINGS' }).catch(e => ({ ok: false, error: e.message }))
    setStatus(res?.ok ? 'OK ✓' : `Error: ${res?.error}`)
  }

  // Bridge helpers
  const copyText = async (text, okMsg = 'Copied ✓') => {
    try { await navigator.clipboard.writeText(text); setStatus(okMsg) }
    catch { setStatus('Copy failed') }
    setTimeout(() => setStatus(''), 1500)
  }

  const genToken = () => {
    try {
      const bytes = new Uint8Array(24)
      crypto.getRandomValues(bytes)
      const b64 = btoa(String.fromCharCode.apply(null, bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/,'')
      setCfg({ ...cfg, bridgeToken: b64 })
      setStatus('Generated token (remember to Save)')
      setTimeout(() => setStatus(''), 1800)
    } catch (e) {
      setStatus('Failed to generate token')
      setTimeout(() => setStatus(''), 1800)
    }
  }

  const copyServerCmd = async () => {
    let cmd = ''
    if (cfg.useBridgeToken) {
      if (!cfg.bridgeToken) { setStatus('No token to copy'); setTimeout(() => setStatus(''), 1200); return }
      cmd = cmdContext === 'root'
        ? `BRIDGE_TOKEN='${cfg.bridgeToken}' npm run dev:mcp`
        : `BRIDGE_TOKEN='${cfg.bridgeToken}' npm run dev`
    } else {
      cmd = cmdContext === 'root' ? `npm run dev:mcp` : `npm run dev`
    }
    await copyText(cmd, 'Copied server command ✓')
  }

  const copyEnvKey = async () => {
    await copyText('BRIDGE_TOKEN', 'Copied key ✓')
  }

  const copyEnvValue = async () => {
    if (!cfg.bridgeToken) { setStatus('No token to copy'); setTimeout(() => setStatus(''), 1200); return }
    await copyText(cfg.bridgeToken, 'Copied value ✓')
  }

  const reconnectBridge = async () => {
    try { await chrome.runtime.sendMessage({ type: 'RECONNECT_BRIDGE' }) } catch (_) {}
    await checkBridge()
  }

  const checkBridge = async () => {
    try {
      const s = await chrome.runtime.sendMessage({ type: 'GET_BRIDGE_STATUS' })
      if (s && s.ok) setBridgeInfo({ connected: !!s.connected, url: s.url || '', usingToken: !!s.usingToken })
      else setBridgeInfo({ connected: false, url: '', usingToken: false })
      setStatus(s?.ok ? (s.connected ? 'Bridge: Connected ✓' : 'Bridge: Disconnected') : 'Bridge: Unknown')
    } catch (_) {
      setBridgeInfo({ connected: false, url: '', usingToken: false })
      setStatus('Bridge: Unknown')
    }
    setTimeout(() => setStatus(''), 1500)
  }

  return (
    <div className="min-h-screen ds-bg ds-text font-sans">
      <header className="px-4 py-4 border-b ds-border ds-card">
        <div className="typo-display font-display num-oldstyle">Jan Summarizer – Settings</div>
      </header>
      <main className="p-4 max-w-2xl mx-auto space-y-5 reading">
        <div className="grid gap-1">
          <label className="text-sm ds-muted-text small-caps">Provider Preset</label>
          <select value={cfg.provider} onChange={onProviderChange} className="input">
            <option value="jan-server">Jan Server (Cloud)</option>
            <option value="jan">Jan (Local)</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic (shim required)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="cerebras">Cerebras (OpenAI-compatible)</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-sm ds-muted-text small-caps">API Base URL</label>
          <input
            className="input"
            value={cfg.apiBase}
            onChange={onChange('apiBase')}
            placeholder="https://comingsoon.ai, https://api.openai.com/v1, https://openrouter.ai/api/v1, http://localhost:1337/v1"
            disabled={isLockedProvider(cfg.provider)}
            readOnly={isLockedProvider(cfg.provider)}
          />
          {isLockedProvider(cfg.provider) && (
            <div className="text-xs ds-muted-text">Endpoint locked for preset. Switch to Custom to edit.</div>
          )}
        </div>
        {cfg.provider === 'custom' && (
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-foreground small-caps">Use full completions URL</Label>
              <div className="flex items-center gap-3 text-sm text-foreground">
                <Label htmlFor="use-custom-url" className="text-foreground/80 cursor-pointer">Off</Label>
                <Switch
                  id="use-custom-url"
                  checked={!!cfg.useCustomCompletionsUrl}
                  onCheckedChange={(v) => {
                    const useCustomCompletionsUrl = !!v
                    setCfg({ ...cfg, useCustomCompletionsUrl })
                    try { chrome.storage.sync.set({ useCustomCompletionsUrl }) } catch (_) {}
                  }}
                  aria-label="Toggle using full completions URL"
                />
                <Label htmlFor="use-custom-url" className="text-foreground/80 cursor-pointer">On</Label>
              </div>
            </div>
            <input
              className="input"
              value={cfg.customCompletionsUrl}
              onChange={onChange('customCompletionsUrl')}
              placeholder="e.g. https://your-endpoint.example.com/v1/chat/completions"
              disabled={!cfg.useCustomCompletionsUrl}
              readOnly={!cfg.useCustomCompletionsUrl}
            />
            <div className="text-xs ds-muted-text">When On, the extension will call this URL directly for chat completions (streaming and non-streaming). API Base above is still used for model listing.</div>
          </div>
        )}
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <label className="text-sm ds-muted-text small-caps">API Key</label>
            <div className="flex items-center gap-3 text-sm text-foreground">
              <Label htmlFor="use-api-key" className="text-foreground/80 cursor-pointer">Off</Label>
              <Switch
                id="use-api-key"
                checked={!!cfg.useApiKey}
                onCheckedChange={(v) => {
                  const useApiKey = !!v
                  setCfg({ ...cfg, useApiKey })
                  try { chrome.storage.sync.set({ useApiKey }) } catch (_) {}
                }}
                aria-label="Toggle using API key"
              />
              <Label htmlFor="use-api-key" className="text-foreground/80 cursor-pointer">On</Label>
            </div>
          </div>
          <div className="flex gap-2 items-stretch">
            <input
              className="input flex-1"
              type={showApiKey ? 'text' : 'password'}
              value={cfg.apiKey}
              onChange={onChange('apiKey')}
              placeholder="sk-…"
              autoComplete="off"
              disabled={!cfg.useApiKey}
            />
            <button
              type="button"
              className="btn"
              onClick={() => setShowApiKey(v => !v)}
              aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
              disabled={!cfg.useApiKey}
            >
              {showApiKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground small-caps">Model</Label>
            <div className="flex items-center gap-3 text-sm text-foreground">
              <Label htmlFor="use-model-list" className="text-foreground/80 cursor-pointer">Manual</Label>
              <Switch
                id="use-model-list"
                checked={!!cfg.useModelList}
                onCheckedChange={(v) => {
                  const useModelList = !!v
                  setCfg({ ...cfg, useModelList })
                  try { chrome.storage.sync.set({ useModelList }) } catch (_) {}
                }}
                aria-label="Toggle model list dropdown"
              />
              <Label htmlFor="use-model-list" className="text-foreground/80 cursor-pointer">Dropdown</Label>
            </div>
          </div>
          {!cfg.useModelList ? (
            <input
              className="input"
              value={cfg.model}
              onChange={onChange('model')}
              placeholder="e.g. llama3.1-8b, mixtral, etc."
            />
          ) : (
            <div className="flex gap-2 items-stretch">
              <select
                className="input flex-1"
                value={cfg.model}
                onChange={onChange('model')}
              >
                <option value="">{modelsState.loading ? 'Loading…' : 'Select a model'}</option>
                {modelsState.items.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  setModelsState(s => ({ ...s, loading: true, error: '' }))
                  const res = await chrome.runtime.sendMessage({
                    type: 'LIST_MODELS',
                    payload: { apiBase: cfg.apiBase, apiKey: cfg.apiKey, useApiKey: !!cfg.useApiKey }
                  }).catch(e => ({ ok: false, error: e.message }))
                  if (!res?.ok) setModelsState({ loading: false, error: res?.error || 'Failed to fetch models', items: [] })
                  else {
                    const items = Array.isArray(res.models) ? res.models : []
                    const normalized = items.map(m => ({ id: m?.id || m?.name || '', name: m?.id || m?.name || '' })).filter(m => m.id)
                    setModelsState({ loading: false, error: '', items: normalized })
                  }
                }}
                disabled={modelsState.loading}
                aria-label="Refresh model list"
              >
                {modelsState.loading ? '…' : 'Refresh'}
              </button>
            </div>
          )}
          {cfg.useModelList && modelsState.error && (
            <div className="text-xs text-red-600">{modelsState.error}</div>
          )}
        </div>
        <div className="grid gap-1">
          <label className="text-sm ds-muted-text small-caps">Temperature</label>
          <input type="number" step="0.1" min="0" max="2" className="input" value={cfg.temperature} onChange={onChange('temperature')} />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button className="btn btn-brand" onClick={save}>Save</button>
          <button className="btn btn-brand" onClick={test}>Test</button>
          <span className="text-sm ds-muted-text">{status}</span>
        </div>

        {/* Keyboard shortcuts helper */}
        <div className="mt-6 border ds-border ds-muted-bg rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="typo-h1 font-display">Keyboard Shortcuts</div>
              <div className="text-sm ds-muted-text">Chrome might not auto-assign suggested keys. Set/confirm them in Shortcuts.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn"
                onClick={async () => {
                  try { await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }) }
                  catch (_) { setStatus('Open chrome://extensions/shortcuts'); setTimeout(() => setStatus(''), 1800) }
                }}
              >Open Shortcuts</button>
              <button className="btn" onClick={() => { try { chrome.commands.getAll((items)=> setCmds(items || [])) } catch (_) {} }}>Refresh</button>
            </div>
          </div>
          <ul className="text-sm grid gap-1">
            {cmds.map(c => (
              <li key={c.name} className="flex items-center justify-between">
                <span className="ds-muted-text small-caps">{c.description || c.name}</span>
                <span className="px-2 py-0.5 text-xs rounded bg-black/5">{c.shortcut || 'Unassigned'}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 border ds-border ds-muted-bg rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="typo-h1 font-display">Search Preferences</div>
              <div className="text-sm ds-muted-text">Control how the extension searches the web.</div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm ds-muted-text">DuckDuckGo only (no Google fallback)</div>
            <div className="flex items-center gap-3 text-sm text-foreground">
              <Label htmlFor="ddg-only" className="text-foreground/80 cursor-pointer">Off</Label>
              <Switch
                id="ddg-only"
                checked={!!cfg.ddgOnly}
                onCheckedChange={(v) => {
                  const ddgOnly = !!v
                  setCfg({ ...cfg, ddgOnly })
                  try { chrome.storage.sync.set({ ddgOnly }) } catch (_) {}
                }}
                aria-label="Toggle DuckDuckGo only mode"
              />
              <Label htmlFor="ddg-only" className="text-foreground/80 cursor-pointer">On</Label>
            </div>
          </div>
        </div>

        <div className="mt-6 border ds-border ds-muted-bg rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="typo-h1 font-display">Reading Indicator</div>
              <div className="text-sm ds-muted-text">Control visual emphasis when the extension is reading/scraping.</div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm ds-muted-text">Dim overlay during reading</div>
            <div className="flex items-center gap-3 text-sm text-foreground">
              <Label htmlFor="show-reading-overlay" className="text-foreground/80 cursor-pointer">Off</Label>
              <Switch
                id="show-reading-overlay"
                checked={!!cfg.showReadingOverlay}
                onCheckedChange={(v) => {
                  const showReadingOverlay = !!v
                  setCfg({ ...cfg, showReadingOverlay })
                  try { chrome.storage.sync.set({ showReadingOverlay }) } catch (_) {}
                }}
                aria-label="Toggle dim overlay during reading"
              />
              <Label htmlFor="show-reading-overlay" className="text-foreground/80 cursor-pointer">On</Label>
            </div>
          </div>
        </div>

        <div className="mt-6 border ds-border ds-muted-bg rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="typo-h1 font-display">Inline Assistant (Tooltip)</div>
              <div className="text-sm ds-muted-text">Show a small Jan button near text when selecting in inputs/contenteditable.</div>
            </div>
            <div className="flex items-center gap-3 text-sm text-foreground">
              <Label htmlFor="inline-assist-enabled" className="text-foreground/80 cursor-pointer">Off</Label>
              <Switch
                id="inline-assist-enabled"
                checked={!!cfg.inlineAssistEnabled}
                onCheckedChange={(v) => setCfg({ ...cfg, inlineAssistEnabled: !!v })}
                aria-label="Toggle inline assistant"
              />
              <Label htmlFor="inline-assist-enabled" className="text-foreground/80 cursor-pointer">On</Label>
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm ds-muted-text small-caps">Actions</label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { id: 'rewrite', label: 'Rewrite' },
                { id: 'translate', label: 'Translate' }
              ].map(a => (
                <label key={a.id} className="inline-flex items-center gap-2">
                  <input type="checkbox" className="w-4 h-4" checked={cfg.inlineAssistActions?.includes(a.id)} onChange={(e) => {
                    const next = new Set(cfg.inlineAssistActions || [])
                    if (e.target.checked) next.add(a.id); else next.delete(a.id)
                    setCfg({ ...cfg, inlineAssistActions: Array.from(next) })
                  }} />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
            <div className="text-xs ds-muted-text">Custom Prompt is always available from the tooltip menu and keyboard shortcut. Save to apply changes. Copy uses the page clipboard API; Apply replaces the current selection.</div>
          </div>
        </div>

        <div className="mt-6 border ds-border ds-muted-bg rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="typo-h1 font-display flex items-center gap-2">Bridge (MCP)
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 ds-muted-text relative top-[1px]">safer</span>
              </div>
              <div className="text-sm ds-muted-text">Token and connection</div>
            </div>
            <div className={`inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full ${bridgeInfo.connected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <span className={`inline-block w-2 h-2 rounded-full ${bridgeInfo.connected ? 'bg-green-600' : 'bg-red-600'}`}></span>
              {bridgeInfo.connected ? 'Connected' : 'Disconnected'}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm ds-muted-text">Use token for bridge auth (default: off)</div>
            <div className="flex items-center gap-3 text-sm text-foreground">
              <Label htmlFor="use-bridge-token" className="text-foreground/80 cursor-pointer">Off</Label>
              <Switch id="use-bridge-token" checked={!!cfg.useBridgeToken} onCheckedChange={(v) => onToggleUseBridge({ target: { checked: v } })} aria-label="Toggle bridge token usage" />
              <Label htmlFor="use-bridge-token" className="text-foreground/80 cursor-pointer">On</Label>
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm ds-muted-text small-caps">Bridge Token (optional)</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input className="input flex-1" value={cfg.bridgeToken || ''} onChange={onChange('bridgeToken')} placeholder="Set if server uses BRIDGE_TOKEN" />
              <div className="flex gap-2">
                <button className="btn" onClick={genToken}>Generate</button>
                <button className="btn" onClick={copyEnvValue} disabled={!cfg.bridgeToken}>Copy value</button>
              </div>
            </div>
            <div className="text-xs ds-muted-text">The extension will only send this token if the toggle above is On.</div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm ds-muted-text small-caps">Server command</label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <div className="inline-flex rounded-lg overflow-hidden border ds-border">
                <button className={`px-3 py-1.5 text-sm ${cmdContext==='root' ? 'bg-black/5 font-semibold' : ''}`} onClick={() => setCmdContext('root')}>From root</button>
                <button className={`px-3 py-1.5 text-sm ${cmdContext==='mcp' ? 'bg-black/5 font-semibold' : ''}`} onClick={() => setCmdContext('mcp')}>In mcp/</button>
              </div>
              <button className="btn" onClick={copyServerCmd} disabled={!!cfg.useBridgeToken && !cfg.bridgeToken}>Copy server command</button>
            </div>
            <div className="text-xs ds-muted-text">Run the copied command in the selected location. {cfg.useBridgeToken ? 'It uses your token as BRIDGE_TOKEN.' : 'No token will be used.'}</div>
          </div>

          <div>
            <button className="text-xs underline ds-muted-text" onClick={() => setAdvOpen(!advOpen)}>{advOpen ? 'Hide advanced' : 'Show advanced'}</button>
            {advOpen && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn" onClick={copyEnvKey}>Copy Key (BRIDGE_TOKEN)</button>
                <button className="btn" onClick={copyEnvValue} disabled={!cfg.bridgeToken}>Copy Value</button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button className="btn btn-pastel-rev" onClick={async () => { await save(); await reconnectBridge(); }}>Save & Reconnect</button>
            <button className="text-sm underline" onClick={checkBridge}>Check bridge</button>
            <span className="text-xs ds-muted-text">{bridgeInfo.url || ''}{bridgeInfo.usingToken ? ' • token:on' : ''}</span>
          </div>
        </div>
      </main>
    </div>
  )
}
