// settings.js
// Settings management and API testing

import { DEFAULT_SETTINGS, ANTHROPIC_API_VERSION, DEFAULT_MAX_TOKENS, JAN_SERVER_LOCALHOST, isAnthropicBase, isSupportedUrl } from './constants.js';
import { convertToAnthropicMessages } from './streaming/anthropic-stream.js';

/**
 * Cached default config
 */
let defaultConfig = null;

/**
 * Loads centralized default settings from config file
 * @returns {Promise<object>} Configuration object
 */
export async function loadConfig() {
  if (defaultConfig) return defaultConfig;
  try {
    const response = await fetch(chrome.runtime.getURL('src/config/defaults.json'));
    defaultConfig = await response.json();
    return defaultConfig;
  } catch (err) {
    console.error('Failed to load config:', err);
    // Fallback defaults if config load fails
    return {
      provider: 'jan',
      apiBase: 'http://127.0.0.1:1337/v1',
      apiKey: 'secret-key-123',
      useApiKey: true,
      model: 'Jan-v1-4B-Q4_K_M',
      temperature: 0.2,
      useCustomCompletionsUrl: false,
      customCompletionsUrl: '',
      ddgOnly: false,
      providers: {
        jan: { apiBase: 'http://127.0.0.1:1337/v1' },
        'jan-server': { apiBase: 'https://api.jan.ai/v1i' },
        cerebras: { apiBase: 'https://api.cerebras.ai/v1' },
        openai: { apiBase: 'https://api.openai.com/v1' },
      }
    };
  }
}

/**
 * Gets current settings with provider defaults applied
 * @returns {Promise<object>} Merged settings
 */
export async function getSettings() {
  const config = await loadConfig();
  const s = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const merged = { ...DEFAULT_SETTINGS, ...s };

  // Fill in provider defaults if fields missing
  if (!merged.apiBase) {
    const providerConfig = config.providers?.[merged.provider];
    if (providerConfig) {
      merged.apiBase = providerConfig.apiBase;
    } else if (merged.provider === 'anthropic') {
      merged.apiBase = 'https://api.anthropic.com/v1'; // Requires OpenAI-compatible shim
    } else if (merged.provider === 'openrouter') {
      merged.apiBase = 'https://openrouter.ai/api/v1';
    }
  }

  // Force-override Jan Server base to localhost
  try {
    if (merged.provider === 'jan') {
      merged.apiBase = JAN_SERVER_LOCALHOST;
    }
  } catch (_) {
    /* ignore */
  }

  console.log(merged);
  return merged;
}

/**
 * Pings the /models endpoint
 * @param {object} config - API configuration
 * @returns {Promise<{ok: boolean, count?: number, models?: Array, error?: string}>}
 */
export async function pingModels({ apiBase, apiKey, useApiKey }) {
  const url = `${apiBase.replace(/\/$/, '')}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const headers = {};
    if (isAnthropicBase(apiBase)) {
      headers['anthropic-version'] = ANTHROPIC_API_VERSION;
      if (useApiKey && apiKey) headers['x-api-key'] = apiKey;
    } else {
      if (useApiKey && apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const resp = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, error: `Models error ${resp.status}: ${text || resp.statusText}` };
    }

    const data = await resp.json().catch(() => ({}));
    const models = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : null);
    return { ok: true, count: models ? models.length : undefined, models };
  } catch (err) {
    clearTimeout(timeout);
    const msg = String(err?.message || err);
    if (msg.includes('aborted')) return { ok: false, error: 'Models request timed out' };
    return { ok: false, error: `Models request failed: ${msg}` };
  }
}

/**
 * Tests API settings with ping and optional chat test
 * @returns {Promise<{ok: boolean, message?: string, error?: string}>}
 */
export async function testSettings() {
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
      apiBase,
      apiKey,
      useApiKey,
      model,
      temperature: 0,
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

/**
 * Non-streaming chat completion
 * @param {object} config - Chat completion parameters
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
export async function chatCompletions({ apiBase, apiKey, useApiKey, model, temperature, messages }) {
  // Anthropic shim for non-streaming
  if (isAnthropicBase(apiBase)) {
    const urlA = `${apiBase.replace(/\/$/, '')}/messages`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const { system, messages: aMsgs } = convertToAnthropicMessages(messages);
      const body = { model, messages: aMsgs, temperature, max_tokens: DEFAULT_MAX_TOKENS };
      if (system) body.system = system;

      const resp = await fetch(urlA, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(useApiKey && apiKey ? { 'x-api-key': apiKey } : {}),
          'anthropic-version': ANTHROPIC_API_VERSION
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { ok: false, error: `API error ${resp.status}: ${text || resp.statusText}` };
      }

      const dataA = await resp.json();
      const contentText = Array.isArray(dataA?.content)
        ? dataA.content.map(c => c?.text || '').join('')
        : (dataA?.content?.[0]?.text || '');
      const mapped = {
        choices: [
          { message: { role: 'assistant', content: contentText }, text: contentText }
        ]
      };
      return { ok: true, data: mapped };
    } catch (err) {
      clearTimeout(timeout);
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
  } catch (_) {
    /* ignore */
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

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

    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, error: `API error ${resp.status}: ${text || resp.statusText}` };
    }

    const data = await resp.json();
    return { ok: true, data };
  } catch (err) {
    clearTimeout(timeout);
    const msg = String(err?.message || err);
    if (msg.includes('aborted')) {
      return { ok: false, error: 'Request timed out. Check your network or API Base URL.' };
    }
    return { ok: false, error: `Request failed: ${msg}` };
  }
}
