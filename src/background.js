// background.js (MV3 service worker)
// Handles side panel activation and summary requests via an OpenAI-compatible API

const DEFAULT_SETTINGS = {
  provider: "custom", // 'cerebras' | 'jan' | 'custom'
  apiBase: "", // e.g. https://api.cerebras.ai/v1 or http://localhost:1337/v1
  apiKey: "",
  model: "",
  temperature: 0.2
};

// Ensure side panel opens automatically on action click, even if onInstalled didn't run
(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('setPanelBehavior (startup) not supported:', err);
  }
})();

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

  // Let Chrome automatically open the side panel when the action button is clicked
  // This avoids user-gesture issues from calling sidePanel.open() ourselves
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
    if (!tab || !tab.id) return;
    // Fallback: try to open immediately within the user gesture, before any awaits
    try {
      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        // Do not await here to preserve the gesture context
        chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      }
    } catch (_) { /* ignore */ }

    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'src/sidepanel.html',
      enabled: true
    });
  } catch (err) {
    console.warn('Failed to set side panel options:', err);
  }
});

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
});

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
    if (!apiBase || !apiKey || !model) return { ok: false, error: 'apiBase, apiKey, or model is missing.' };
    const res = await chatCompletions({
      apiBase, apiKey, model, temperature: 0,
      messages: [
        { role: 'system', content: 'You are a connectivity tester.' },
        { role: 'user', content: 'Reply with OK.' }
      ]
    });
    if (!res.ok) return res;
    const text = res.data?.choices?.[0]?.message?.content || '';
    return { ok: true, message: text.slice(0, 200) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function chatCompletions({ apiBase, apiKey, model, temperature, messages }) {
  const url = `${apiBase.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 60_000);
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
    return { ok: false, error: `Request failed: ${String(err?.message || err)}` };
  }
}
