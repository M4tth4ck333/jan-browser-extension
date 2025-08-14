// background.js (MV3 service worker)
// Handles side panel activation and summary requests via an OpenAI-compatible API

const DEFAULT_SETTINGS = {
  provider: "custom", // 'cerebras' | 'jan' | 'custom'
  apiBase: "", // e.g. https://api.cerebras.ai/v1 or http://localhost:1337/v1
  apiKey: "",
  model: "",
  temperature: 0.2
};

const isSupportedUrl = (url) => /^https?:\/\//.test(url || '');

// Keep track of side panel ports by tabId for streaming updates
const sidepanelPorts = new Map(); // key (tabId|GLOBAL_KEY) -> port
const GLOBAL_KEY = '__global__';
// Track in-flight streaming controllers by reqId so we can cancel
const streamingControllers = new Map(); // reqId -> AbortController

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'jan-stream') return;
  // Store a global reference so we can still stream even if tab association is missing
  sidepanelPorts.set(GLOBAL_KEY, port);
  const initialTabId = port.sender?.tab?.id;
  if (initialTabId) sidepanelPorts.set(initialTabId, port);
  // Allow the side panel to register/update its tabId explicitly
  try {
    port.onMessage.addListener((msg) => {
      if (msg && msg.type === 'REGISTER_PORT' && msg.tabId) {
        sidepanelPorts.set(msg.tabId, port);
      }
    });
  } catch (_) { /* ignore */ }
  port.onDisconnect.addListener(() => {
    // Clean up any entries pointing to this port
    for (const [key, p] of sidepanelPorts.entries()) {
      if (p === port) sidepanelPorts.delete(key);
    }
  });
});

// Prefer Chrome auto-opening the side panel on action click for reliability.
try {
  chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: true });
} catch (err) {
  console.warn('setPanelBehavior (startup) not supported:', err);
}

async function chatCompletionsStream({ apiBase, apiKey, model, temperature, messages }, tabId, reqId) {
  const url = `${apiBase.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 120_000);
  // Register the controller so UI can cancel
  try { streamingControllers.set(reqId, controller) } catch (_) {}
  const post = (msg) => {
    // Prefer tab-specific port, fall back to global, else broadcast to all
    const specific = sidepanelPorts.get(tabId);
    const global = sidepanelPorts.get(GLOBAL_KEY);
    const targets = specific ? [specific] : (global ? [global] : Array.from(new Set(sidepanelPorts.values())));
    for (const p of targets) {
      try { p.postMessage({ reqId, ...msg }); } catch (_) {}
    }
  };
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({ model, messages, temperature, stream: true }),
      signal: controller.signal
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      post({ type: 'CHAT_STREAM_ERROR', error: `API error ${resp.status}: ${text || resp.statusText}` });
      clearTimeout(to);
      streamingControllers.delete(reqId);
      return;
    }

    // If provider doesn't stream, fall back to one-shot JSON
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/event-stream') || !resp.body) {
      try {
        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
        post({ type: 'CHAT_STREAM_BEGIN' });
        if (content) post({ type: 'CHAT_STREAM_DELTA', delta: content });
        post({ type: 'CHAT_STREAM_DONE' });
      } catch (e) {
        const text = await resp.text().catch(() => '');
        post({ type: 'CHAT_STREAM_ERROR', error: `Non-stream parse error: ${String(e?.message || e)} ${text ? `(${text.slice(0,200)})` : ''}` });
      }
      clearTimeout(to);
      streamingControllers.delete(reqId);
      return;
    }

    // Streaming path (resp is ok, content-type is SSE, and has a body)
    if (!resp.body) {
      const text = await resp.text().catch(() => '');
      post({ type: 'CHAT_STREAM_ERROR', error: `API error ${resp.status}: ${text || resp.statusText}` });
      clearTimeout(to);
      return;
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let eventLines = [];
    const handleEvent = () => {
      if (!eventLines.length) return false;
      const dataPayload = eventLines
        .filter(l => l.startsWith('data:'))
        .map(l => l.slice(5).trim())
        .join('\n');
      eventLines = [];
      if (!dataPayload) return false;
      if (dataPayload === '[DONE]') {
        post({ type: 'CHAT_STREAM_DONE' });
        return true;
      }
      try {
        const json = JSON.parse(dataPayload);
        const choice = json?.choices?.[0] || {};
        let chunk = choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? '';
        if (Array.isArray(chunk)) {
          chunk = chunk.map(p => (typeof p === 'string' ? p : (p?.text || p?.content || ''))).join('');
        }
        if (typeof chunk === 'string' && chunk) {
          post({ type: 'CHAT_STREAM_DELTA', delta: chunk });
        }
      } catch (_) { /* ignore parse errors */ }
      return false;
    };

    post({ type: 'CHAT_STREAM_BEGIN' });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const lineRaw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const line = lineRaw.replace(/\r$/, '');
        if (line.trim() === '') {
          const shouldStop = handleEvent();
          if (shouldStop) {
            clearTimeout(to);
            streamingControllers.delete(reqId);
            return;
          }
          continue;
        }
        // Only collect relevant lines; ignore comments
        if (line.startsWith('data:') || line.startsWith('event:')) {
          eventLines.push(line.trim());
        }
      }
    }
    // Flush any remaining event
    handleEvent();
    post({ type: 'CHAT_STREAM_DONE' });
    clearTimeout(to);
    streamingControllers.delete(reqId);
  } catch (err) {
    const msg = String(err?.message || err || '')
    if (err?.name === 'AbortError' || /aborted|abort/i.test(msg)) {
      // Treat user stop/cancel as a graceful end
      try { post({ type: 'CHAT_STREAM_DONE' }) } catch (_) {}
    } else {
      post({ type: 'CHAT_STREAM_ERROR', error: `Request failed: ${msg}` });
    }
    clearTimeout(to);
    streamingControllers.delete(reqId);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  // Initialize defaults without clobbering user settings
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const merged = { ...DEFAULT_SETTINGS, ...existing };

  // Provide sensible presets if provider chosen but fields empty
  if (merged.provider === 'cerebras' && !merged.apiBase) {
    merged.apiBase = 'https://api.cerebras.ai/v1';
  }
  if (merged.provider === 'jan' && !merged.apiBase) {
    // Common Jan OpenAI-compatible server default
    merged.apiBase = 'http://localhost:1337/v1';
  }

  await chrome.storage.sync.set(merged);

  // Let Chrome open the panel on action click automatically.
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('setPanelBehavior not supported:', err);
  }
});

// Also apply behavior when the browser starts up (service worker cold start)
chrome.runtime.onStartup.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('setPanelBehavior (onStartup) not supported:', err);
  }
});

// On action click, just ensure the correct panel path/options for the current tab.
// Do NOT call sidePanel.open() here; Chrome will open it automatically due to setPanelBehavior.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab) return;

    // Choose a target tab that supports side panel/content scripts
    let targetTabId = tab.id || 0;
    if (!isSupportedUrl(tab.url)) {
      const inWindow = await chrome.tabs.query({ currentWindow: true });
      const alt = inWindow.find(t => isSupportedUrl(t.url));
      if (alt?.id) {
        targetTabId = alt.id;
      } else {
        // Create a new supported tab
        const created = await chrome.tabs.create({ url: 'https://example.com' });
        targetTabId = created.id;
      }
    }

    // Ensure the target tab is active/visible so the panel is noticeable
    try { await chrome.tabs.update(targetTabId, { active: true }); } catch (_) {}

    await chrome.sidePanel.setOptions({
      tabId: targetTabId,
      path: `dist/ui/sidepanel/index.html`,
      enabled: true
    });

    // Open the panel AFTER the path has been set, so the correct bundle loads
    try {
      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        await chrome.sidePanel.open({ tabId: targetTabId });
      }
    } catch (_) { /* ignore */ }
  } catch (err) {
    console.warn('Failed to set side panel options:', err);
  }
});

// Keyboard shortcut handler to open the side panel
try {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'open_sidepanel') return;
    try {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      let targetTabId = active?.id || 0;
      if (!active || !isSupportedUrl(active.url)) {
        const inWindow = await chrome.tabs.query({ currentWindow: true });
        const alt = inWindow.find(t => isSupportedUrl(t.url));
        if (alt?.id) {
          targetTabId = alt.id;
        } else {
          const created = await chrome.tabs.create({ url: 'https://example.com' });
          targetTabId = created.id;
        }
      }
      try { await chrome.tabs.update(targetTabId, { active: true }); } catch (_) {}
      await chrome.sidePanel.setOptions({ tabId: targetTabId, path: `dist/ui/sidepanel/index.html`, enabled: true });
      try { if (chrome.sidePanel?.open) await chrome.sidePanel.open({ tabId: targetTabId }); } catch (_) {}
    } catch (err) {
      console.warn('open_sidepanel command failed:', err);
    }
  });
} catch (err) {
  console.warn('commands API not available:', err);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SUMMARIZE') {
    (async () => {
      const result = await handleSummarize(message.payload);
      sendResponse(result);
    })();
    return true; // Keep the message channel open for async response
  }

  if (message?.type === 'TEST_SETTINGS') {
    (async () => {
      const ok = await testSettings();
      sendResponse(ok);
    })();
    return true;
  }

  if (message?.type === 'CHAT_COMPLETION') {
    (async () => {
      try {
        const { apiBase, apiKey, model, temperature } = await getSettings();
        if (!apiBase) return sendResponse({ ok: false, error: 'Missing API Base URL. Set it in Options.' });
        if (!apiKey) return sendResponse({ ok: false, error: 'Missing API Key. Set it in Options.' });
        if (!model) return sendResponse({ ok: false, error: 'Missing Model. Set it in Options.' });

        const messages = message.payload?.messages || [];
        const res = await chatCompletions({ apiBase, apiKey, model, temperature, messages });
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (message?.type === 'CHAT_COMPLETION_STREAM_START') {
    (async () => {
      try {
        const { apiBase, apiKey, model, temperature } = await getSettings();
        if (!apiBase) return sendResponse({ ok: false, error: 'Missing API Base URL. Set it in Options.' });
        if (!apiKey) return sendResponse({ ok: false, error: 'Missing API Key. Set it in Options.' });
        if (!model) return sendResponse({ ok: false, error: 'Missing Model. Set it in Options.' });

        const { messages, reqId, tabId } = message.payload || {};
        const targetTabId = tabId || sender?.tab?.id || null;
        if (!targetTabId) return sendResponse({ ok: false, error: 'No target tab for streaming.' });

        // Acknowledge start so UI can show placeholder
        sendResponse({ ok: true, started: true });

        await chatCompletionsStream({ apiBase, apiKey, model, temperature, messages }, targetTabId, reqId);
      } catch (e) {
        const t = sender?.tab?.id;
        if (t && sidepanelPorts.has(t)) {
          try { sidepanelPorts.get(t).postMessage({ type: 'CHAT_STREAM_ERROR', error: String(e?.message || e) }); } catch (_) {}
        }
      }
    })();
    return true; // keep channel open for initial ack
  }

  if (message?.type === 'CHAT_COMPLETION_STREAM_STOP') {
    (async () => {
      try {
        const { reqId } = message.payload || {};
        const ctl = reqId ? streamingControllers.get(reqId) : null;
        if (ctl) {
          try { ctl.abort() } catch (_) {}
          streamingControllers.delete(reqId);
        }
        sendResponse({ ok: true, stopped: !!ctl });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (message?.type === 'GOOGLE_SEARCH_AND_SCRAPE') {
    (async () => {
      try {
        const { query, closeTab = true } = message.payload || {};
        if (!query || !String(query).trim()) {
          return sendResponse({ ok: false, error: 'Missing query' });
        }
        const url = `https://www.google.com/search?q=${encodeURIComponent(String(query).trim())}`;
        const created = await chrome.tabs.create({ url, active: false });
        const tabId = created.id;
        // Wait for load complete
        await waitForTabComplete(tabId, 15000);
        // Small settle delay for dynamic SERP hydration
        await delay(700);
        const data = await sendMessageWithRetry(tabId, { type: 'SCRAPE_GOOGLE_SERP' }, 3, 500);
        if (closeTab) {
          try { await chrome.tabs.remove(tabId); } catch (_) {}
        }
        sendResponse({ ok: true, data, sourceTabId: tabId });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }
});

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

async function waitForTabComplete(tabId, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const t = await chrome.tabs.get(tabId);
      if (t?.status === 'complete') return true;
    } catch (_) { /* ignore transient */ }
    await delay(200);
  }
  return true; // best-effort
}

async function sendMessageWithRetry(tabId, msg, retries = 2, backoffMs = 400) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await chrome.tabs.sendMessage(tabId, msg);
      return resp;
    } catch (e) {
      lastErr = e;
      await delay(backoffMs);
    }
  }
  throw lastErr || new Error('sendMessage failed');
}

async function getSettings() {
  const s = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const merged = { ...DEFAULT_SETTINGS, ...s };
  // Fill in provider defaults if fields missing
  if (merged.provider === 'cerebras' && !merged.apiBase) merged.apiBase = 'https://api.cerebras.ai/v1';
  if (merged.provider === 'jan' && !merged.apiBase) merged.apiBase = 'http://localhost:1337/v1';
  return merged;
}

async function handleSummarize(payload) {
  try {
    const { content, url, title, lang, selection, metaDescription } = payload || {};
    if (!content && !selection) {
      return { ok: false, error: 'No content to summarize.' };
    }

    const { apiBase, apiKey, model, temperature } = await getSettings();
    if (!apiBase) return { ok: false, error: 'Missing API Base URL. Set it in Options.' };
    if (!apiKey) return { ok: false, error: 'Missing API Key. Set it in Options.' };
    if (!model) return { ok: false, error: 'Missing Model. Set it in Options.' };

    const maxChars = 16000; // keep request manageable
    const bodyText = (selection?.trim() || content?.trim() || '').slice(0, maxChars);

    const system = `You are an expert assistant that summarizes web pages concisely and accurately.
- Write clear, skimmable Markdown with headings and short bullets.
- Preserve key facts, numbers, and names.
- If the page language is not English, write the summary in English and note the original language.
- If provided, use the page title and URL contextually, but do not fabricate citations.
- Prefer actionability: include actionable steps when applicable.
- Keep it under 250 words unless the user selection is highly technical.`;

    const userPrompt = [
      title ? `Title: ${title}` : null,
      url ? `URL: ${url}` : null,
      lang ? `Detected Language: ${lang}` : null,
      metaDescription ? `Meta: ${metaDescription}` : null,
      '',
      'Content:',
      bodyText
    ].filter(Boolean).join('\n');

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: `Summarize with sections: \n\n# TL;DR (1 line)\n# Key Points\n# Actions (if any)\n# Notable Quotes (optional)\n# Glossary (only if necessary)\n\nThen analyze potential biases or missing perspectives in 1-2 bullets.\n\n${userPrompt}` }
    ];

    const response = await chatCompletions({ apiBase, apiKey, model, temperature, messages });
    if (!response.ok) return response;

    return { ok: true, summary: response.data?.choices?.[0]?.message?.content || response.data?.choices?.[0]?.text || '(no content)' };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function testSettings() {
  try {
    const { apiBase, apiKey, model } = await getSettings();
    if (!apiBase || !apiKey) return { ok: false, error: 'apiBase or apiKey is missing.' };

    // Fast ping using /models (OpenAI-compatible). 5s timeout.
    const ping = await pingModels({ apiBase, apiKey });
    if (ping.ok) {
      // If models list is available, optionally check if configured model appears.
      let note = '';
      if (model && Array.isArray(ping.models)) {
        const exists = ping.models.some(m => m.id === model || m.name === model);
        if (!exists) note = ` (model not listed; it may be private or listing disabled)`;
      }
      return { ok: true, message: `Ping OK: ${ping.count ?? '?'} models${note}` };
    }

    // Fallback: attempt a tiny chat request (10–15s timeout via chatCompletions)
    if (!model) return { ok: false, error: `Ping failed: ${ping.error}. Also missing model for chat test.` };
    const res = await chatCompletions({
      apiBase, apiKey, model, temperature: 0,
      messages: [
        { role: 'system', content: 'You are a connectivity tester.' },
        { role: 'user', content: 'Reply with OK.' }
      ]
    });
    if (!res.ok) return { ok: false, error: `Ping failed: ${ping.error}. Chat test: ${res.error}` };
    const text = res.data?.choices?.[0]?.message?.content || res.data?.choices?.[0]?.text || '';
    return { ok: true, message: text.slice(0, 200) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function pingModels({ apiBase, apiKey }) {
  const url = `${apiBase.replace(/\/$/, '')}/models`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 5_000);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal
    });
    clearTimeout(to);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, error: `Models error ${resp.status}: ${text || resp.statusText}` };
    }
    const data = await resp.json().catch(() => ({}));
    const models = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : null);
    return { ok: true, count: models ? models.length : undefined, models };
  } catch (err) {
    clearTimeout(to);
    const msg = String(err?.message || err);
    if (msg.includes('aborted')) return { ok: false, error: 'Models request timed out' };
    return { ok: false, error: `Models request failed: ${msg}` };
  }
}

async function chatCompletions({ apiBase, apiKey, model, temperature, messages }) {
  const url = `${apiBase.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  // Use a shorter timeout so the UI doesn't appear stuck
  const to = setTimeout(() => controller.abort(), 15_000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, temperature }),
      signal: controller.signal
    });
    clearTimeout(to);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, error: `API error ${resp.status}: ${text || resp.statusText}` };
    }
    const data = await resp.json();
    return { ok: true, data };
  } catch (err) {
    clearTimeout(to);
    const msg = String(err?.message || err);
    if (msg.includes('aborted')) {
      return { ok: false, error: 'Request timed out. Check your network or API Base URL.' };
    }
    return { ok: false, error: `Request failed: ${msg}` };
  }
}
