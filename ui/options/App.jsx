import React, { useEffect, useRef, useState, useCallback } from 'react'

const DEFAULTS = {
  provider: 'custom', apiBase: '', apiKey: '', model: '', temperature: 0.2,
  bridgeToken: '', useBridgeToken: false,
  inlineAssistEnabled: true,
  inlineAssistActions: ['rewrite','fix_grammar','shorten','expand','tone_formal','tone_friendly','summarize','translate']
}

export default function OptionsApp() {
  const [cfg, setCfg] = useState(DEFAULTS)
  const [status, setStatus] = useState('')
  const [bridgeInfo, setBridgeInfo] = useState({ connected: false, url: '', usingToken: false })
  const [cmdContext, setCmdContext] = useState('root') // 'root' | 'mcp'
  const [advOpen, setAdvOpen] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const mqRef = useRef(null)

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

  const onChange = (k) => (e) => setCfg({ ...cfg, [k]: k === 'temperature' ? Number(e.target.value) : e.target.value })

  const onProviderChange = (e) => {
    const provider = e.target.value
    let apiBase = cfg.apiBase
    if (provider === 'cerebras' && !apiBase) apiBase = 'https://api.cerebras.ai/v1'
    if (provider === 'jan' && !apiBase) apiBase = 'http://localhost:1337/v1'
    setCfg({ ...cfg, provider, apiBase })
  }

  const save = async () => {
    await chrome.storage.sync.set(cfg)
    setStatus('Saved ✓')
    setTimeout(() => setStatus(''), 1500)
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
    <div className="min-h-screen ds-bg ds-text">
      <header className="px-4 py-3 border-b ds-border ds-card">
        <div className="text-lg font-semibold">Jan Summarizer – Settings</div>
      </header>
      <main className="p-4 max-w-xl mx-auto space-y-4">
        <div className="grid gap-1">
          <label className="text-sm ds-muted-text">Provider Preset</label>
          <select value={cfg.provider} onChange={onProviderChange} className="input">
            <option value="custom">Custom</option>
            <option value="cerebras">Cerebras (OpenAI-compatible)</option>
            <option value="jan">Jan Server (Local)</option>
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-sm ds-muted-text">API Base URL</label>
          <input className="input" value={cfg.apiBase} onChange={onChange('apiBase')} placeholder="https://api.cerebras.ai/v1 or http://localhost:1337/v1" />
        </div>
        <div className="grid gap-1">
          <label className="text-sm ds-muted-text">API Key</label>
          <div className="flex gap-2 items-stretch">
            <input
              className="input flex-1"
              type={showApiKey ? 'text' : 'password'}
              value={cfg.apiKey}
              onChange={onChange('apiKey')}
              placeholder="sk-…"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn"
              onClick={() => setShowApiKey(v => !v)}
              aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
            >
              {showApiKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <div className="grid gap-1">
          <label className="text-sm ds-muted-text">Model</label>
          <input className="input" value={cfg.model} onChange={onChange('model')} placeholder="e.g. llama3.1-8b, mixtral, etc." />
        </div>
        <div className="grid gap-1">
          <label className="text-sm ds-muted-text">Temperature</label>
          <input type="number" step="0.1" min="0" max="2" className="input" value={cfg.temperature} onChange={onChange('temperature')} />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button className="btn" onClick={save}>Save</button>
          <button className="btn" onClick={test}>Test</button>
          <span className="text-sm ds-muted-text">{status}</span>
        </div>

        <div className="mt-6 border ds-border rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold">Inline Assistant (Tooltip)</div>
              <div className="text-sm ds-muted-text">Show a small Jan button near text when selecting in inputs/contenteditable.</div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" className="w-4 h-4" checked={!!cfg.inlineAssistEnabled} onChange={(e) => setCfg({ ...cfg, inlineAssistEnabled: !!e.target.checked })} />
              <span>{cfg.inlineAssistEnabled ? 'On' : 'Off'}</span>
            </label>
          </div>

          <div className="grid gap-2">
            <label className="text-sm ds-muted-text">Actions</label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { id: 'rewrite', label: 'Rewrite' },
                { id: 'fix_grammar', label: 'Fix grammar' },
                { id: 'shorten', label: 'Shorten' },
                { id: 'expand', label: 'Expand' },
                { id: 'tone_formal', label: 'Tone: Formal' },
                { id: 'tone_friendly', label: 'Tone: Friendly' },
                { id: 'summarize', label: 'Summarize' },
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
            <div className="text-xs ds-muted-text">Save to apply changes. Copy uses the page clipboard API; Apply replaces the current selection.</div>
          </div>
        </div>

        <div className="mt-6 border ds-border rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold flex items-center gap-2">Bridge (MCP)
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 ds-muted-text">safer</span>
              </div>
              <div className="text-sm ds-muted-text">Token and connection</div>
            </div>
            <div className={`inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full ${bridgeInfo.connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              <span className={`inline-block w-2 h-2 rounded-full ${bridgeInfo.connected ? 'bg-green-600' : 'bg-red-600'}`}></span>
              {bridgeInfo.connected ? 'Connected' : 'Disconnected'}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm ds-muted-text">Use token for bridge auth (default: off)</div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" className="w-4 h-4" checked={!!cfg.useBridgeToken} onChange={onToggleUseBridge} />
              <span>{cfg.useBridgeToken ? 'On' : 'Off'}</span>
            </label>
          </div>

          <div className="grid gap-2">
            <label className="text-sm ds-muted-text">Bridge Token (optional)</label>
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
            <label className="text-sm ds-muted-text">Server command</label>
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
