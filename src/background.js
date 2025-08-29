// background.js (MV3 service worker / Firefox background script)
// Handles side panel activation and summary requests via an OpenAI-compatible API

// Minimal browser/chrome API shim for cross-browser compatibility (no ESM import)
try {
  if (typeof window !== 'undefined' && !window.browser && window.chrome) {
    window.browser = window.chrome;
  }
} catch (_) {}
try {
  if (typeof globalThis !== 'undefined' && !globalThis.browser && globalThis.chrome) {
    globalThis.browser = globalThis.chrome;
  }
} catch (_) {}

const DEFAULT_SETTINGS = {
  provider: "custom", // 'jan-server' | 'openai' | 'anthropic' | 'openrouter' | 'cerebras' | 'jan' | 'custom'
  apiBase: "", // e.g. https://comingsoon.ai, https://api.openai.com/v1, https://openrouter.ai/api/v1, https://api.cerebras.ai/v1, http://localhost:1337/v1
  apiKey: "",
  useApiKey: true,
  model: "",
  temperature: 0.2,
  // For provider: 'custom', allow specifying a full chat completions URL (non-stream and stream)
  useCustomCompletionsUrl: false,
  customCompletionsUrl: "",
  // Search preferences
  ddgOnly: false,
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
  try { console.log('[BG] port connected', { initialTabId }); } catch (_) {}
  // Allow the side panel to register/update its tabId explicitly
  try {
    port.onMessage.addListener((msg) => {
      // [JAN-BEHAVIOR:PORT-REGISTER] side panel port registration and routing map
      if (msg && msg.type === 'REGISTER_PORT' && msg.tabId) {
        sidepanelPorts.set(msg.tabId, port);
        try { console.log('[BG] REGISTER_PORT', { tabId: msg.tabId }); } catch (_) {}
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
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
} catch (err) {
  console.warn('setPanelBehavior (startup) not supported:', err);
}

// --- MCP Bridge (WebSocket client) ---
const BRIDGE_BASE = 'ws://127.0.0.1:17389';
let bridgeSocket = null;
let lastBridgeToken = null; // cached to detect changes
let lastUseBridgeToken = false; // whether we should include the token

async function connectMcpBridge() {
  try {
    // Read optional shared secret for the local bridge
    const { bridgeToken, useBridgeToken } = await chrome.storage.sync.get(['bridgeToken', 'useBridgeToken']);
    lastBridgeToken = bridgeToken || null;
    lastUseBridgeToken = !!useBridgeToken;
    const include = !!bridgeToken && !!useBridgeToken;
    const url = include ? `${BRIDGE_BASE}?t=${encodeURIComponent(bridgeToken)}` : BRIDGE_BASE;
    const ws = new WebSocket(url);
    bridgeSocket = ws;
    ws.addEventListener('open', () => {
      try { console.log('[MCP Bridge] connected'); } catch (_) {}
    });
    ws.addEventListener('message', async (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch (_) { return; }
      if (!msg || msg.kind !== 'call') return;
      const { id, tool, params } = msg;
      try { console.log('[MCP Bridge] call received', { id, tool, params }); } catch (_) {}
      if (!id) return;
      const reply = (payload) => {
        try {
          console.log('[MCP Bridge] sending reply', { id, ok: payload?.ok, keys: Object.keys(payload || {}) });
          ws.send(JSON.stringify({ id, kind: 'result', ...payload }));
        } catch (_) {}
      };
      try {
        if (tool === 'search') {
          const query = String(params?.query || '').trim();
          if (!query) return reply({ ok: false, error: 'Missing query' });
          const numResults = Math.max(1, Math.min(Number(params?.numResults || 5), 10));
          // New default: DuckDuckGo first
          console.log('[MCP Bridge] invoking performDuckDuckGoSearchAndScrape', { query, numResults });
          const ddgRes = await performDuckDuckGoSearchAndScrape({ query, numResults, closeTab: true, debug: true });
          console.log('[MCP Bridge] performDuckDuckGoSearchAndScrape done', { ok: ddgRes?.ok, hasData: !!ddgRes?.data });
          const dCount = (ddgRes?.data && Array.isArray(ddgRes.data.results)) ? ddgRes.data.results.length : 0;
          if (ddgRes?.ok && ddgRes?.data && dCount > 0) {
            try {
              const d = ddgRes.data;
              const summarizeResult = (r) => ({ title: r?.title, url: r?.url, snippetLen: r?.snippet ? r.snippet.length : 0 });
              console.log('[MCP Bridge] DuckDuckGo scrape preview', {
                query: d.query,
                resultsCount: dCount,
                sample: Array.isArray(d.results) ? d.results.slice(0, 3).map(summarizeResult) : [],
              });
            } catch (_) {}
            return reply({ ok: true, data: ddgRes.data });
          }
          console.warn('[MCP Bridge] DuckDuckGo failed or zero results, falling back to Google...', { ok: ddgRes?.ok, dCount });
          const gRes = await performGoogleSearchAndScrape({ query, numResults, closeTab: true, debug: true });
          const gCount = (gRes?.data && Array.isArray(gRes.data.results)) ? gRes.data.results.length : 0;
          if (gRes?.ok && gRes?.data && gCount > 0) {
            try {
              const d = gRes.data;
              const summarizeResult = (r) => ({ title: r?.title, url: r?.url, snippetLen: r?.snippet ? r.snippet.length : 0 });
              console.log('[MCP Bridge] Google scrape preview', {
                query: d.query,
                resultsCount: gCount,
                sample: d.results.slice(0, 3).map(summarizeResult),
              });
            } catch (_) {}
            return reply({ ok: true, data: gRes.data });
          }
          const err = gRes?.error || ddgRes?.error || 'Search failed';
          return reply({ ok: false, error: err });
        }
        // Unknown tool
        reply({ ok: false, error: `Unknown tool: ${tool}` });
      } catch (e) {
        reply({ ok: false, error: String(e?.message || e) });
      }
    });
    ws.addEventListener('close', () => {
      try { console.warn('[MCP Bridge] disconnected, retrying...'); } catch (_) {}
      bridgeSocket = null;
      setTimeout(connectMcpBridge, 1500);
    });
    ws.addEventListener('error', () => {
      try { ws.close(); } catch (_) {}
    });
  } catch (e) {
    try { console.warn('[MCP Bridge] connect error:', e); } catch (_) {}
    setTimeout(connectMcpBridge, 2000);
  }
}

// Establish the bridge connection on service worker startup
connectMcpBridge();

// Reconnect if the token changes in storage
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    let shouldReconnect = false;
    if (Object.prototype.hasOwnProperty.call(changes, 'bridgeToken')) {
      const next = changes.bridgeToken?.newValue || null;
      if (next !== lastBridgeToken) {
        lastBridgeToken = next;
        shouldReconnect = true;
      }
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'useBridgeToken')) {
      const nextUse = !!changes.useBridgeToken?.newValue;
      if (nextUse !== lastUseBridgeToken) {
        lastUseBridgeToken = nextUse;
        shouldReconnect = true;
      }
    }
    if (shouldReconnect) {
      try { bridgeSocket && bridgeSocket.close(); } catch (_) {}
    }
  });
} catch (_) { /* ignore */ }

async function chatCompletionsStream({ apiBase, apiKey, useApiKey, model, temperature, messages }, tabId, reqId) {
  // Route Anthropic bases to the Anthropic streaming shim
  if (isAnthropicBase(apiBase)) {
    return await chatCompletionsStreamAnthropic({ apiBase, apiKey, useApiKey, model, temperature, messages }, tabId, reqId);
  }
  // If using a full custom completions URL (custom provider), prefer it
  let url = `${apiBase.replace(/\/$/, '')}/chat/completions`;
  try {
    const { provider, useCustomCompletionsUrl, customCompletionsUrl } = await getSettings();
    if (provider === 'custom' && useCustomCompletionsUrl && isSupportedUrl(customCompletionsUrl)) {
      url = String(customCompletionsUrl);
    }
  } catch (_) { /* ignore */ }
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 120_000);
  // Register the controller so UI can cancel
  try { streamingControllers.set(reqId, controller) } catch (_) {}
  const post = (msg) => {
    // [JAN-BEHAVIOR:STREAM-EMIT] route stream events to side panel port(s)
    // Prefer tab-specific port, fall back to global, else broadcast to all
    const specific = sidepanelPorts.get(tabId);
    const global = sidepanelPorts.get(GLOBAL_KEY);
    const targets = specific ? [specific] : (global ? [global] : Array.from(new Set(sidepanelPorts.values())));
    for (const p of targets) {
      try { p.postMessage({ reqId, ...msg }); } catch (_) {}
    }
  };
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    };
    if (useApiKey && apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers,
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
  if (!merged.apiBase) {
    if (merged.provider === 'jan-server') merged.apiBase = 'https://comingsoon.ai';
    else if (merged.provider === 'openai') merged.apiBase = 'https://api.openai.com/v1';
    else if (merged.provider === 'anthropic') merged.apiBase = 'https://api.anthropic.com/v1'; // Requires OpenAI-compatible shim
    else if (merged.provider === 'openrouter') merged.apiBase = 'https://openrouter.ai/api/v1';
    else if (merged.provider === 'cerebras') merged.apiBase = 'https://api.cerebras.ai/v1';
    else if (merged.provider === 'jan') merged.apiBase = 'http://localhost:1337/v1';
  }

  await chrome.storage.sync.set(merged);

  // Let Chrome open the panel on action click automatically.
  try {
    await chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('setPanelBehavior not supported:', err);
  }
});

// Also apply behavior when the browser starts up (service worker cold start)
chrome.runtime.onStartup.addListener(async () => {
  try {
    await chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('setPanelBehavior (startup) not supported:', err);
  }

});

// On action click, just ensure the correct panel path/options for the current tab.
// Do NOT call sidePanel.open() here; Chrome will open it automatically due to setPanelBehavior.
// [JAN-BEHAVIOR:SIDEPANEL-OPEN] ensure the side panel opens on a supported tab
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

    await chrome.sidePanel?.setOptions?.({
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

// Keyboard shortcut handler to open the side panel or custom prompt
try {
  chrome.commands.onCommand.addListener(async (command) => {
    try {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      let targetTabId = active?.id || 0;
      if (!active || !isSupportedUrl(active?.url)) {
        const inWindow = await chrome.tabs.query({ currentWindow: true });
        const alt = inWindow.find(t => isSupportedUrl(t.url));
        if (alt?.id) {
          targetTabId = alt.id;
        } else {
          const created = await chrome.tabs.create({ url: 'https://example.com' });
          targetTabId = created.id;
        }
      }

      if (command === 'open_sidepanel') {
        try { await chrome.tabs.update(targetTabId, { active: true }); } catch (_) {}
        await chrome.sidePanel?.setOptions?.({ tabId: targetTabId, path: `dist/ui/sidepanel/index.html`, enabled: true });
        try { if (chrome.sidePanel?.open) await chrome.sidePanel.open({ tabId: targetTabId }); } catch (_) {}
      } else if (command === 'open_custom_prompt') {
        // Ask content script to show the custom prompt overlay
        try {
          await sendMessageWithRetry(targetTabId, { type: 'SHOW_CUSTOM_PROMPT' }, 2, 300);
        } catch (e) {
          // Best effort fallback (no retry helper available / first run)
          try { await chrome.tabs.sendMessage(targetTabId, { type: 'SHOW_CUSTOM_PROMPT' }); } catch (_) {}
        }
      } else if (command === 'toggle_autocomplete') {
        // Ask content script to toggle autocomplete mode
        try {
          await sendMessageWithRetry(targetTabId, { type: 'TOGGLE_AUTOCOMPLETE' }, 2, 300);
        } catch (e) {
          try { await chrome.tabs.sendMessage(targetTabId, { type: 'TOGGLE_AUTOCOMPLETE' }); } catch (_) {}
        }
      }
    } catch (err) {
      console.warn(`${command} command failed:`, err);
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

  // Inline Assistant (tooltip) one-shot call
  if (message?.type === 'INLINE_ASSIST_START') {
    (async () => {
      try {
        const { apiBase, apiKey, useApiKey, model, temperature } = await getSettings();
        if (!apiBase) return sendResponse({ ok: false, error: 'Missing API Base URL. Set it in Options.' });
        if (useApiKey && !apiKey) return sendResponse({ ok: false, error: 'Missing API Key. Enable or provide one in Options.' });
        if (!model) return sendResponse({ ok: false, error: 'Missing Model. Set it in Options.' });

        const { mode, text, lang } = message?.payload || {};
        const src = String(text || '').trim();
        if (!src) return sendResponse({ ok: false, error: 'No selection text.' });

        const { system, user } = buildInlineAssistMessages({ mode, text: src, lang });
        const messages = [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ];

        const resp = await chatCompletions({ apiBase, apiKey, useApiKey, model, temperature, messages });
        if (!resp?.ok) return sendResponse(resp);
        const out = resp.data?.choices?.[0]?.message?.content || resp.data?.choices?.[0]?.text || '';
        sendResponse({ ok: true, text: out });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Custom Prompt overlay run
  if (message?.type === 'CUSTOM_PROMPT_RUN') {
    (async () => {
      try {
        const { apiBase, apiKey, useApiKey, model, temperature } = await getSettings();
        if (!apiBase) return sendResponse({ ok: false, error: 'Missing API Base URL. Set it in Options.' });
        if (useApiKey && !apiKey) return sendResponse({ ok: false, error: 'Missing API Key. Enable or provide one in Options.' });
        if (!model) return sendResponse({ ok: false, error: 'Missing Model. Set it in Options.' });

        const { prompt, content, url, title, lang, selection, metaDescription } = message?.payload || {};
        const p = String(prompt || '').trim();
        if (!p) return sendResponse({ ok: false, error: 'Missing prompt.' });

        const maxChars = 16000;
        const bodyText = String((selection && String(selection).trim()) || (content && String(content).trim()) || '').slice(0, maxChars);

        const system = 'You are a helpful assistant. Follow the instruction precisely and respond concisely. Preserve formatting when applicable.';
        const user = [
          p,
          '',
          'Context:',
          title ? `Title: ${title}` : null,
          url ? `URL: ${url}` : null,
          lang ? `Detected Language: ${lang}` : null,
          metaDescription ? `Meta: ${metaDescription}` : null,
          '',
          bodyText ? 'Text:\n' + bodyText : null
        ].filter(Boolean).join('\n');

        const messages = [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ];

        const resp = await chatCompletions({ apiBase, apiKey, useApiKey, model, temperature, messages });
        if (!resp?.ok) return sendResponse(resp);
        const out = resp.data?.choices?.[0]?.message?.content || resp.data?.choices?.[0]?.text || '';
        sendResponse({ ok: true, text: out });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (message?.type === 'TEST_SETTINGS') {
    (async () => {
      const ok = await testSettings();
      sendResponse(ok);
    })();
    return true;
  }

  // List available models from the configured provider (OpenAI-compatible /models)
  // Allows optional overrides from the sender (e.g., Options UI) to avoid relying on stale storage
  if (message?.type === 'LIST_MODELS') {
    (async () => {
      try {
        const overrides = message?.payload || {};
        const s = await getSettings();
        const apiBase = (overrides.apiBase ?? s.apiBase);
        const apiKey = (overrides.apiKey ?? s.apiKey);
        const useApiKey = (typeof overrides.useApiKey === 'boolean') ? overrides.useApiKey : s.useApiKey;
        if (!apiBase) return sendResponse({ ok: false, error: 'Missing API Base URL. Set it in Options.' });
        if (useApiKey && !apiKey) return sendResponse({ ok: false, error: 'Missing API Key. Enable or provide one in Options.' });
        const res = await pingModels({ apiBase, apiKey, useApiKey });
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (message?.type === 'CHAT_COMPLETION') {
    (async () => {
      try {
        const { apiBase, apiKey, useApiKey, model, temperature } = await getSettings();
        if (!apiBase) return sendResponse({ ok: false, error: 'Missing API Base URL. Set it in Options.' });
        if (useApiKey && !apiKey) return sendResponse({ ok: false, error: 'Missing API Key. Enable or provide one in Options.' });
        if (!model) return sendResponse({ ok: false, error: 'Missing Model. Set it in Options.' });

        const { messages: payloadMsgs, system, user } = message?.payload || {};
        let messages = Array.isArray(payloadMsgs) && payloadMsgs.length
          ? payloadMsgs
          : [
              ...(system ? [{ role: 'system', content: String(system) }] : []),
              ...(user ? [{ role: 'user', content: String(user) }] : [])
            ];
        if (!Array.isArray(messages) || messages.length === 0) {
          return sendResponse({ ok: false, error: 'Missing messages payload.' });
        }

        const resp = await chatCompletions({ apiBase, apiKey, useApiKey, model, temperature, messages });
        if (!resp?.ok) return sendResponse(resp);
        const out = resp.data?.choices?.[0]?.message?.content || resp.data?.choices?.[0]?.text || '';
        sendResponse({ ok: true, text: out });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Autocomplete (quick next-words prediction)
  if (message?.type === 'AUTOCOMPLETE_SUGGEST') {
    (async () => {
      try {
        const { apiBase, apiKey, useApiKey, model, provider, useCustomCompletionsUrl, customCompletionsUrl } = await getSettings();
        if (!apiBase) return sendResponse({ ok: false, error: 'Missing API Base URL. Set it in Options.' });
        if (useApiKey && !apiKey) return sendResponse({ ok: false, error: 'Missing API Key. Enable or provide one in Options.' });
        if (!model) return sendResponse({ ok: false, error: 'Missing Model. Set it in Options.' });

        const { prefix, suffix, lang } = message?.payload || {};
        const pref = String(prefix || '').slice(-1000);
        const suff = String(suffix || '').slice(0, 300);

        const system = [
          'You are an autocomplete engine. Continue the user\'s current sentence by predicting the next few words only.',
          'Rules:',
          '- Output plain text continuation only (no quotes, no labels, no Markdown).',
          '- Keep it short: 3–8 words max, ideally ≤ 30 characters.',
          `- Respect the writing style and language of the prefix (lang: ${lang || 'unknown'}).`,
          '- If the suffix already contains the likely continuation, return an empty string.',
          '- Do not start a new sentence unless the prefix clearly completes one.',
          '- Do not add explanations or punctuation unless clearly needed to complete the phrase.',
          '- Avoid changing names, code symbols, or factual details present in the prefix.',
          '- If unsure, return an empty string.'
        ].join('\n');

        const user = [
          'Prefix:',
          pref,
          '',
          'Suffix:',
          suff,
          '',
          'Task: Predict the next few words to naturally continue the prefix so it fits before the suffix. Return ONLY the continuation text (no leading/trailing whitespace).'
        ].join('\n');

        const messages = [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ];

        const resp = await chatCompletions({ apiBase, apiKey, useApiKey, model, temperature: 0.2, messages, provider, useCustomCompletionsUrl, customCompletionsUrl });
        if (!resp?.ok) return sendResponse(resp);
        let out = resp.data?.choices?.[0]?.message?.content || resp.data?.choices?.[0]?.text || '';
        out = String(out || '').trim();
        if (out.length > 40) out = out.slice(0, 40).replace(/\s+\S*$/, '').trim();
        sendResponse({ ok: true, text: out });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (message?.type === 'CHAT_COMPLETION_STREAM_START') {
    (async () => {
      try {
        const { apiBase, apiKey, useApiKey, model, temperature } = await getSettings();
        if (!apiBase) return sendResponse({ ok: false, error: 'Missing API Base URL. Set it in Options.' });
        if (useApiKey && !apiKey) return sendResponse({ ok: false, error: 'Missing API Key. Enable or provide one in Options.' });
        if (!model) return sendResponse({ ok: false, error: 'Missing Model. Set it in Options.' });

        const { messages, reqId, tabId } = message.payload || {};
        const targetTabId = tabId || sender?.tab?.id || null;
        if (!targetTabId) return sendResponse({ ok: false, error: 'No target tab for streaming.' });

        // Structured, compact logging of the inbound payload (no full content)
        try {
          const roles = { system: 0, user: 0, assistant: 0, other: 0 };
          let systemChars = 0;
          let contextSources = 0;
          const arr = Array.isArray(messages) ? messages : [];
          for (const m of arr) {
            const r = m?.role || 'other';
            if (Object.prototype.hasOwnProperty.call(roles, r)) roles[r]++; else roles.other++;
            let content = m?.content;
            if (Array.isArray(content)) {
              content = content.map(p => (typeof p === 'string' ? p : (p?.text || p?.content || ''))).join('');
            }
            content = String(content ?? '');
            if (r === 'system') {
              systemChars += content.length;
              // Count context blocks produced by buildContextMessages (marked with [Source: Tab ...])
              try { contextSources += (content.match(/\[Source:\s*Tab\s+/g) || []).length; } catch (_) {}
            }
          }
          console.log('[BG] STREAM_START payload summary', {
            reqId,
            tabId: targetTabId,
            totalMessages: arr.length,
            roles,
            systemChars,
            contextSources,
          });
        } catch (_) { /* ignore logging errors */ }

        // Acknowledge start so UI can show placeholder
        sendResponse({ ok: true, started: true });

        await chatCompletionsStream({ apiBase, apiKey, useApiKey, model, temperature, messages }, targetTabId, reqId);
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
        // [JAN-BEHAVIOR:STREAM-STOP] UI cancel routed to controller via reqId
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
      const resp = await performGoogleSearchAndScrape(message?.payload || {});
      sendResponse(resp);
    })();
    return true;
  }

  // Unified search-and-scrape: DuckDuckGo first with Google fallback
  if (message?.type === 'SEARCH_AND_SCRAPE') {
    (async () => {
      try {
        const { query, numResults = 5, debug = false, readinessTimeoutMs = 15000, closeTab = true } = message?.payload || {};
        // ddgOnly precedence: payload > stored setting > default
        let ddgOnly = (message?.payload && 'ddgOnly' in message.payload) ? !!message.payload.ddgOnly : undefined;
        if (typeof ddgOnly === 'undefined') {
          try {
            const s = await chrome.storage.sync.get(['ddgOnly']);
            ddgOnly = (typeof s.ddgOnly === 'boolean') ? s.ddgOnly : !!DEFAULT_SETTINGS.ddgOnly;
          } catch (_) {
            ddgOnly = !!DEFAULT_SETTINGS.ddgOnly;
          }
        }
        if (!query || !String(query).trim()) return sendResponse({ ok: false, error: 'Missing query' });
        const ddg = await performDuckDuckGoSearchAndScrape({ query, numResults, debug, readinessTimeoutMs, closeTab });
        const ddgCount = (ddg?.data && Array.isArray(ddg.data.results)) ? ddg.data.results.length : 0;
        if (ddg?.ok && ddgCount > 0) {
          const data = { ...(ddg.data || {}), source: 'ddg' };
          return sendResponse({ ok: true, data });
        }
        if (ddgOnly) {
          return sendResponse({ ok: false, error: ddg?.error || 'No DDG results', data: { source: 'ddg', results: ddg?.data?.results || [] } });
        }
        const g = await performGoogleSearchAndScrape({ query, numResults, debug, readinessTimeoutMs, closeTab });
        const gCount = (g?.data && Array.isArray(g.data.results)) ? g.data.results.length : 0;
        if (g?.ok && gCount > 0) {
          const data = { ...(g.data || {}), source: 'google' };
          return sendResponse({ ok: true, data });
        }
        return sendResponse({ ok: false, error: g?.error || ddg?.error || 'Search failed' });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (message?.type === 'GET_BRIDGE_STATUS') {
    try {
      const connected = !!bridgeSocket && bridgeSocket.readyState === WebSocket.OPEN;
      const usingToken = !!lastBridgeToken && !!lastUseBridgeToken;
      sendResponse({ ok: true, connected, url: BRIDGE_BASE, usingToken });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  }

  if (message?.type === 'RECONNECT_BRIDGE') {
    (async () => {
      try {
        if (bridgeSocket) {
          try { bridgeSocket.close(); } catch (_) {}
        } else {
          await connectMcpBridge();
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Forward selection updates to the side panel associated with the sender's tab
      if (message?.type === 'SELECTION_UPDATED') {
    try {
      // [JAN-BEHAVIOR:SELECTION-FWD-BG] forward page selection to side panel port
      const tabId = sender?.tab?.id || null;
      const payload = message?.payload || {};
      const selection = String(payload?.selection || '');
      const url = String(payload?.url || '');
      const title = String(payload?.title || '');
      const specific = tabId ? sidepanelPorts.get(tabId) : null;
      const target = specific || sidepanelPorts.get(GLOBAL_KEY) || null;
      if (target) {
        try { target.postMessage({ type: 'SELECTION_UPDATED', tabId, selection, url, title }); } catch (_) {}
      }
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
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

// Detect if the configured API base appears to be Anthropic
function isAnthropicBase(apiBase) {
  try { return /anthropic\.com\/?/i.test(String(apiBase || '')); } catch (_) { return false; }
}

// Convert OpenAI-style chat messages to Anthropic's messages/system fields
function convertToAnthropicMessages(messages) {
  const sys = [];
  const out = [];
  for (const m of (messages || [])) {
    const role = m?.role;
    let content = m?.content;
    if (Array.isArray(content)) {
      content = content.map(p => (typeof p === 'string' ? p : (p?.text || p?.content || ''))).join('');
    }
    content = String(content ?? '');
    if (role === 'system') {
      if (content) sys.push(content);
    } else if (role === 'user' || role === 'assistant') {
      out.push({ role, content });
    }
  }
  const system = sys.length ? sys.join('\n') : undefined;
  return { system, messages: out };
}

// Anthropic streaming implementation (maps Anthropic SSE to our sidepanel stream events)
async function chatCompletionsStreamAnthropic({ apiBase, apiKey, useApiKey, model, temperature, messages }, tabId, reqId) {
  const url = `${apiBase.replace(/\/$/, '')}/messages`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 120_000);
  try { streamingControllers.set(reqId, controller) } catch (_) {}

  const post = (msg) => {
    const specific = sidepanelPorts.get(tabId);
    const global = sidepanelPorts.get(GLOBAL_KEY);
    const targets = specific ? [specific] : (global ? [global] : Array.from(new Set(sidepanelPorts.values())));
    for (const p of targets) {
      try { p.postMessage({ reqId, ...msg }); } catch (_) {}
    }
  };

  try {
    const { system, messages: aMsgs } = convertToAnthropicMessages(messages);
    const body = { model, messages: aMsgs, temperature, max_tokens: 1024, stream: true };
    if (system) body.system = system;
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'Accept': 'text/event-stream'
    };
    if (useApiKey && apiKey) headers['x-api-key'] = apiKey;
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      post({ type: 'CHAT_STREAM_ERROR', error: `API error ${resp.status}: ${text || resp.statusText}` });
      clearTimeout(to);
      streamingControllers.delete(reqId);
      return;
    }

    // Non-streaming fallback (shouldn't happen if stream: true, but be resilient)
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/event-stream') || !resp.body) {
      try {
        const data = await resp.json();
        const txt = Array.isArray(data?.content) ? (data.content.map(c => c?.text || '').join('')) : (data?.content?.[0]?.text || '');
        post({ type: 'CHAT_STREAM_BEGIN' });
        if (txt) post({ type: 'CHAT_STREAM_DELTA', delta: txt });
        post({ type: 'CHAT_STREAM_DONE' });
      } catch (e) {
        const text = await resp.text().catch(() => '');
        post({ type: 'CHAT_STREAM_ERROR', error: `Non-stream parse error: ${String(e?.message || e)} ${text ? `(${text.slice(0,200)})` : ''}` });
      }
      clearTimeout(to);
      streamingControllers.delete(reqId);
      return;
    }

    // Streaming SSE
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let eventLines = [];
    let begun = false;
    const flushEvent = () => {
      if (!eventLines.length) return false;
      const evName = (eventLines.find(l => l.startsWith('event:')) || '').slice(6).trim();
      const dataPayload = eventLines
        .filter(l => l.startsWith('data:'))
        .map(l => l.slice(5).trim())
        .join('\n');
      eventLines = [];
      if (!dataPayload) return false;
      try {
        const json = JSON.parse(dataPayload);
        const type = json?.type || evName;
        if (!begun) { post({ type: 'CHAT_STREAM_BEGIN' }); begun = true; }
        if (type === 'content_block_delta' && json?.delta?.text) {
          const chunk = String(json.delta.text || '');
          if (chunk) post({ type: 'CHAT_STREAM_DELTA', delta: chunk });
        } else if (type === 'message_stop') {
          post({ type: 'CHAT_STREAM_DONE' });
          return true;
        }
      } catch (_) { /* ignore parse errors */ }
      return false;
    };

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
          const shouldStop = flushEvent();
          if (shouldStop) {
            clearTimeout(to);
            streamingControllers.delete(reqId);
            return;
          }
          continue;
        }
        if (line.startsWith('data:') || line.startsWith('event:')) {
          eventLines.push(line.trim());
        }
      }
    }
    // Flush residual event and close
    flushEvent();
    if (!begun) post({ type: 'CHAT_STREAM_BEGIN' });
    post({ type: 'CHAT_STREAM_DONE' });
    clearTimeout(to);
    streamingControllers.delete(reqId);
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (err?.name === 'AbortError' || /aborted|abort/i.test(msg)) {
      try { post({ type: 'CHAT_STREAM_DONE' }) } catch (_) {}
    } else {
      post({ type: 'CHAT_STREAM_ERROR', error: `Request failed: ${msg}` });
    }
    clearTimeout(to);
    streamingControllers.delete(reqId);
  }
}

// Reusable function to perform Google Search + scrape
async function performGoogleSearchAndScrape(payload) {
  try {
    const { query, closeTab = true, debug = false, readinessTimeoutMs = 15000, minResults, numResults } = payload || {};
    if (!query || !String(query).trim()) {
      return { ok: false, error: 'Missing query' };
    }
    const qstr = String(query).trim();
    const searchParams = new URLSearchParams({ q: qstr, oq: qstr, sourceid: 'chrome', ie: 'UTF-8' });
    // Add locale hints to better mirror real Chrome queries
    try {
      const uiLang = (chrome?.i18n?.getUILanguage?.() || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en-US');
      const [lang, regionRaw] = String(uiLang).split('-');
      const gl = (regionRaw || lang || 'US').toUpperCase();
      searchParams.set('hl', uiLang);
      searchParams.set('gl', gl);
    } catch (_) {}
    // Common sclient seen in Chrome omnibox-driven searches
    searchParams.set('sclient', 'gws-wiz-serp');
    const url = `https://www.google.com/search?${searchParams.toString()}`;
    console.log('[SearchFlow] creating tab', { url });
    const created = await chrome.tabs.create({ url, active: false });
    const tabId = created.id;
    console.log('[SearchFlow] tab created', { tabId });
    // Wait for load complete
    await waitForTabComplete(tabId, 15000);
    console.log('[SearchFlow] tab load complete', { tabId });
    // Small human-like jitter before interacting
    await delay(500 + Math.floor(500 + Math.random() * 1200));
    // Ask content script to confirm SERP readiness (hydration) before scraping
    let ready = null;
    try {
      const derivedMin = (typeof minResults === 'number' && !Number.isNaN(minResults))
        ? Math.max(1, Number(minResults))
        : Math.max(1, Math.min(Number(numResults || 4), 8));
      ready = await sendMessageWithRetry(tabId, { type: 'WAIT_FOR_SERP_READY', payload: { timeoutMs: readinessTimeoutMs, minResults: derivedMin, debug } }, 3, 600);
      console.log('[SearchFlow] WAIT_FOR_SERP_READY', { ok: !!ready?.ok, ready: !!ready?.ready, reason: ready?.reason, counts: ready?.counts });
    } catch (e) {
      console.warn('[SearchFlow] readiness check failed; proceeding anyway', String(e?.message || e));
    }
    if (!ready?.ok || !ready?.ready) {
      // One more small settle if not ready
      await delay(800 + Math.floor(Math.random() * 600));
    }
    // Brief human-like interaction before scraping
    try {
      console.log('[SearchFlow] humanizing SERP interaction', { tabId });
      await sendMessageWithRetry(tabId, { type: 'HUMANIZE_SERP', payload: { steps: 1 + Math.floor(Math.random() * 3) } }, 2, 400);
    } catch (_) { /* non-fatal */ }
    await delay(120 + Math.floor(Math.random() * 280));
    console.log('[SearchFlow] sending SCRAPE_GOOGLE_SERP to content script', { tabId, debug, numResults });
    const data = await sendMessageWithRetry(tabId, { type: 'SCRAPE_GOOGLE_SERP', payload: { debug, numResults } }, 3, 500);
    console.log('[SearchFlow] scrape response received', { ok: !!data, keys: data ? Object.keys(data) : [] });
    if (closeTab) {
      try {
        console.log('[SearchFlow] closing tab', { tabId });
        await chrome.tabs.remove(tabId);
      } catch (_) {}
    }
    return { ok: true, data, sourceTabId: tabId };
  } catch (e) {
    console.warn('[SearchFlow] error', String(e?.message || e));
    return { ok: false, error: String(e?.message || e) };
  }
}

// Reusable function to perform DuckDuckGo Search + scrape (no tab; background fetch + parse)
async function performDuckDuckGoSearchAndScrape(payload) {
  try {
    const { query, debug = false, numResults } = payload || {};
    if (!query || !String(query).trim()) return { ok: false, error: 'Missing query' };

    const qstr = String(query).trim();
    const normalizeDdgUrl = (href) => {
      try {
        if (!href) return href;
        const u = new URL(href, 'https://duckduckgo.com');
        // If it's a DDG redirect (/l/ or /r/) with uddg param, decode it
        const uddg = u.searchParams.get('uddg');
        if ((u.hostname.endsWith('duckduckgo.com') || u.hostname === 'duckduckgo.com') && (u.pathname === '/l/' || u.pathname === '/r/' || uddg)) {
          if (uddg) {
            const decoded = decodeURIComponent(uddg);
            if (/^https?:/i.test(decoded)) return decoded;
          }
        }
        return u.href;
      } catch (_) {
        return href;
      }
    };
    // Prefer the HTML-only endpoint to avoid JS/hydration and simplify parsing
    const baseUrls = [
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(qstr)}&ia=web`,
      `https://duckduckgo.com/html/?q=${encodeURIComponent(qstr)}&ia=web`
    ];

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 12_000);
    let html = '';
    let respOk = false;
    let lastErr = '';
    for (const url of baseUrls) {
      try {
        const resp = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
          },
          signal: controller.signal
        });
        if (resp.ok) {
          html = await resp.text();
          respOk = true;
          break;
        } else {
          lastErr = `HTTP ${resp.status}`;
        }
      } catch (e) {
        lastErr = String(e?.message || e);
      }
    }
    clearTimeout(to);
    if (!respOk || !html) {
      return { ok: false, error: lastErr || 'DDG fetch failed' };
    }

    const parseWithDom = (htmlText) => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const out = [];
        const seen = new Set();
        // Primary: classic DDG HTML markup
        const containers = Array.from(doc.querySelectorAll('div.result, .results_links_deep, .web-result, li.result'));
        const pushContainer = (container) => {
          if (!container) return false;
          const a = container.querySelector('a.result__a, h2 a[href], h3 a[href], a[href]');
          if (!a || !a.href) return false;
          const finalHref = normalizeDdgUrl(a.href);
          if (!/^https?:/i.test(finalHref) || seen.has(finalHref)) return false;
          const titleEl = container.querySelector('a.result__a, h2, h3');
          const snippetEl = container.querySelector('.result__snippet, .result__body, p');
          const title = (titleEl?.textContent || a.textContent || '').trim();
          if (!title) return false;
          const snippet = (snippetEl?.textContent || '').trim();
          const snippetHtml = (snippetEl?.innerHTML || '').trim();
          const htmlFrag = container.outerHTML || '';
          out.push({ title, url: finalHref, snippet, snippetHtml, html: htmlFrag });
          seen.add(finalHref);
          return true;
        };
        for (const c of containers) {
          pushContainer(c);
          if (out.length >= Math.max(8, Number(numResults || 5))) break;
        }
        // Fallback: deep heading scan
        if (out.length < (numResults || 5)) {
          const heads = Array.from(doc.querySelectorAll('#links a[href] h2, #links a[href] h3, main a[href] h2, main a[href] h3, h2 a[href], h3 a[href]'));
          for (const h of heads) {
            const a = h.closest('a[href]');
            if (!a || !a.href) continue;
            const finalHref = normalizeDdgUrl(a.href);
            if (!/^https?:/i.test(finalHref) || seen.has(finalHref)) continue;
            const title = (h.textContent || a.textContent || '').trim();
            if (!title) continue;
            out.push({ title, url: finalHref, snippet: '', snippetHtml: '', html: h.outerHTML || '' });
            seen.add(finalHref);
            if (out.length >= Math.max(8, Number(numResults || 5))) break;
          }
        }
        // Fallback 2: newer layout title anchors
        if (out.length < (numResults || 5)) {
          const titleAnchors = Array.from(doc.querySelectorAll('a[data-testid="result-title-a"], #links a.result__a, .result__title a'));
          for (const a of titleAnchors) {
            if (!a || !a.href) continue;
            const finalHref = normalizeDdgUrl(a.href);
            if (!/^https?:/i.test(finalHref) || seen.has(finalHref)) continue;
            const title = (a.textContent || '').trim();
            if (!title) continue;
            out.push({ title, url: finalHref, snippet: '', snippetHtml: '', html: a.outerHTML || '' });
            seen.add(finalHref);
            if (out.length >= Math.max(8, Number(numResults || 5))) break;
          }
        }
        // Fallback 3: broad anchors with heading descendants or strong text
        if (out.length < (numResults || 5)) {
          const anchors = Array.from(doc.querySelectorAll('#links a[href], main a[href]'));
          for (const a of anchors) {
            const finalHref = normalizeDdgUrl(a.href);
            if (!/^https?:/i.test(finalHref) || seen.has(finalHref)) continue;
            const h = a.querySelector('h2, h3, strong');
            const title = (h?.textContent || a.textContent || '').trim();
            if (!title) continue;
            out.push({ title, url: finalHref, snippet: '', snippetHtml: '', html: a.outerHTML || '' });
            seen.add(finalHref);
            if (out.length >= Math.max(8, Number(numResults || 5))) break;
          }
        }
        return out;
      } catch (_) {
        return null;
      }
    };

    let results = parseWithDom(html) || [];
    // Very light regex fallback if DOMParser is unavailable
    if (!results.length) {
      try {
        const rx = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="((?:https?:)?\/\/[^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const tmp = [];
        const seen = new Set();
        let m;
        const decode = (s) => {
          try {
            return String(s)
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&#x27;/g, "'");
          } catch (_) { return s; }
        };
        while ((m = rx.exec(html)) && tmp.length < Math.max(8, Number(numResults || 5))) {
          const href = normalizeDdgUrl(m[1]);
          if (seen.has(href)) continue;
          const title = decode(m[2].replace(/<[^>]+>/g, '')).trim();
          if (!title) continue;
          // Look ahead locally for a nearby snippet element within the same result block
          const start = Math.max(0, m.index);
          const segment = html.slice(start, start + 2000);
          let snippetHtml = '';
          let snippet = '';
          const snipMatchA = segment.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
          const snipMatchDiv = !snipMatchA && segment.match(/<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
          const snipInner = (snipMatchA && snipMatchA[1]) || (snipMatchDiv && snipMatchDiv[1]) || '';
          if (snipInner) {
            snippetHtml = snipInner.trim();
            snippet = decode(snipInner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
          }
          tmp.push({ title, url: href, snippet, snippetHtml, html: m[0] });
          seen.add(href);
        }
        results = tmp;
      } catch (_) {}
    }

    results = Array.isArray(results) ? results.slice(0, Math.max(1, Math.min(Number(numResults || 5), 10))) : [];
    const data = {
      ok: true,
      query: qstr,
      pageTitle: 'DuckDuckGo Search',
      answerBox: '',
      answerBoxHtml: '',
      results
    };
    if (debug) {
      const allLinks = [];
      data.debug = { htmlPreview: html.slice(0, 120000), allLinks };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function getSettings() {
  const s = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const merged = { ...DEFAULT_SETTINGS, ...s };
  // Fill in provider defaults if fields missing
  if (!merged.apiBase) {
    if (merged.provider === 'jan-server') merged.apiBase = 'https://comingsoon.ai';
    if (merged.provider === 'openai') merged.apiBase = 'https://api.openai.com/v1';
    else if (merged.provider === 'anthropic') merged.apiBase = 'https://api.anthropic.com/v1'; // Requires OpenAI-compatible shim
    else if (merged.provider === 'openrouter') merged.apiBase = 'https://openrouter.ai/api/v1';
    else if (merged.provider === 'cerebras') merged.apiBase = 'https://api.cerebras.ai/v1';
    else if (merged.provider === 'jan') merged.apiBase = 'http://localhost:1337/v1';
  }
  // Force-hide Jan Server base to comingsoon.ai until public release
  try {
    if (merged.provider === 'jan-server') {
      merged.apiBase = 'https://comingsoon.ai';
    }
  } catch (_) { /* ignore */ }
  return merged;
}

// [JAN-BEHAVIOR:INLINE-ASSIST-BUILD] construct system+user messages for inline assist
function buildInlineAssistMessages({ mode, text, lang }) {
  const m = String(mode || 'rewrite');
  // Target language only used for translate; otherwise keep input language
  const targetLang = (m === 'translate') ? (lang ? String(lang) : 'English') : null;

  const system = [
    'You are an inline writing assistant that edits short snippets.',
    '- Preserve original meaning and key details; do not add new facts.',
    '- Preserve existing formatting (Markdown/HTML), line breaks, mentions, emojis, URLs, and code fences.',
    '- Keep proper nouns, product names, variables, and commands unchanged unless clearly incorrect.',
    '- Prefer active voice, simple words, and clear structure.',
    '- Output in the SAME LANGUAGE as the input unless the task is Translate. For Translate, output only in the target language.',
    '- Return ONLY the revised text. Do not wrap in quotes, do not add explanations, prefixes, or code blocks.'
  ].join('\n');

  let instruction = '';
  switch (m) {
    case 'translate':
      instruction = `Translate into ${targetLang}. Preserve names, brand terms, code, emojis, URLs, and formatting; no notes or brackets.`;
      break;
    case 'rewrite':
    default:
      instruction = [
        'Improve clarity and flow; tighten phrasing; prefer active voice; remove hedging; keep meaning.',
        'Retain formatting and structure.'
      ].join(' ');
      break;
  }
  const user = [
    instruction,
    '',
    'Text:',
    text,
  ].join('\n');
  return { system, user };
}

async function handleSummarize(payload) {
  try {
    const { content, url, title, lang, selection, metaDescription } = payload || {};
    if (!content && !selection) {
      return { ok: false, error: 'No content to summarize.' };
    }

    const { apiBase, apiKey, useApiKey, model, temperature, provider, useCustomCompletionsUrl, customCompletionsUrl } = await getSettings();
    if (!apiBase) return { ok: false, error: 'Missing API Base URL. Set it in Options.' };
    if (useApiKey && !apiKey) return { ok: false, error: 'Missing API Key. Enable or provide one in Options.' };
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

    const response = await chatCompletions({ apiBase, apiKey, useApiKey, model, temperature, messages, provider, useCustomCompletionsUrl, customCompletionsUrl });
    if (!response.ok) return response;

    return { ok: true, summary: response.data?.choices?.[0]?.message?.content || response.data?.choices?.[0]?.text || '(no content)' };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function testSettings() {
  try {
    const { apiBase, apiKey, useApiKey, model } = await getSettings();
    if (!apiBase) return { ok: false, error: 'apiBase is missing.' };
    if (useApiKey && !apiKey) return { ok: false, error: 'API key missing while enabled.' };

    // Fast ping using /models (OpenAI-compatible). 5s timeout.
    const ping = await pingModels({ apiBase, apiKey, useApiKey });
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
      apiBase, apiKey, useApiKey, model, temperature: 0,
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

async function pingModels({ apiBase, apiKey, useApiKey }) {
  const url = `${apiBase.replace(/\/$/, '')}/models`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 5_000);
  try {
    const headers = {};
    if (isAnthropicBase(apiBase)) {
      headers['anthropic-version'] = '2023-06-01';
      if (useApiKey && apiKey) headers['x-api-key'] = apiKey;
    } else {
      if (useApiKey && apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const resp = await fetch(url, { method: 'GET', headers, signal: controller.signal });
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

async function chatCompletions({ apiBase, apiKey, useApiKey, model, temperature, messages }) {
  // Anthropic shim for non-streaming
  if (isAnthropicBase(apiBase)) {
    const urlA = `${apiBase.replace(/\/$/, '')}/messages`;
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 15_000);
    try {
      const { system, messages: aMsgs } = convertToAnthropicMessages(messages);
      const body = { model, messages: aMsgs, temperature, max_tokens: 1024 };
      if (system) body.system = system;
      const resp = await fetch(urlA, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(useApiKey && apiKey ? { 'x-api-key': apiKey } : {}),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(to);
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { ok: false, error: `API error ${resp.status}: ${text || resp.statusText}` };
      }
      const dataA = await resp.json();
      const contentText = Array.isArray(dataA?.content) ? dataA.content.map(c => c?.text || '').join('') : (dataA?.content?.[0]?.text || '');
      const mapped = {
        choices: [
          { message: { role: 'assistant', content: contentText }, text: contentText }
        ]
      };
      return { ok: true, data: mapped };
    } catch (err) {
      clearTimeout(to);
      const msg = String(err?.message || err);
      if (msg.includes('aborted')) {
        return { ok: false, error: 'Request timed out. Check your network or API Base URL.' };
      }
      return { ok: false, error: `Request failed: ${msg}` };
    }
  }

  // Default OpenAI-compatible path (overrideable by full custom URL)
  let url = `${apiBase.replace(/\/$/, '')}/chat/completions`;
  try {
    const { provider, useCustomCompletionsUrl, customCompletionsUrl } = await getSettings();
    if (provider === 'custom' && useCustomCompletionsUrl && isSupportedUrl(customCompletionsUrl)) {
      url = String(customCompletionsUrl);
    }
  } catch (_) { /* ignore */ }
  const controller = new AbortController();
  // Use a shorter timeout so the UI doesn't appear stuck
  const to = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (useApiKey && apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers,
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
