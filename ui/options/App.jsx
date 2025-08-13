import React, { useEffect, useState } from 'react'

const DEFAULTS = { provider: 'custom', apiBase: '', apiKey: '', model: '', temperature: 0.2 }

export default function OptionsApp() {
  const [cfg, setCfg] = useState(DEFAULTS)
  const [status, setStatus] = useState('')

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
          <input className="input" value={cfg.apiKey} onChange={onChange('apiKey')} placeholder="sk-…" />
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
      </main>
    </div>
  )
}
