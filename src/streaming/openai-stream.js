// openai-stream.js
// OpenAI-compatible streaming implementation

import { postToSidePanel, registerStreamController, cleanupStream } from '../lib/event-routing.js';
import { StreamEvents } from '../constants.js';
import { isSupportedUrl } from '../constants.js';

/**
 * Handles OpenAI-compatible chat completion streaming
 *
 * @param {object} config - API configuration
 * @param {string} config.apiBase - API base URL
 * @param {string} config.apiKey - API key
 * @param {boolean} config.useApiKey - Whether to include API key
 * @param {string} config.model - Model name
 * @param {number} config.temperature - Temperature setting
 * @param {Array} config.messages - Chat messages
 * @param {number} tabId - Tab ID for routing
 * @param {string} reqId - Request ID
 * @param {Function} getSettings - Function to get settings
 */
export async function chatCompletionsStream(
  { apiBase, apiKey, useApiKey, model, temperature, messages },
  tabId,
  reqId,
  getSettings
) {
  // Build URL - use custom completions URL if configured
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
  const timeout = setTimeout(() => controller.abort(), 120_000);

  // Register the controller so UI can cancel
  registerStreamController(reqId, controller);

  const post = (msg) => postToSidePanel(msg, tabId, reqId);

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
      post({ type: StreamEvents.CHAT_STREAM_ERROR, error: `API error ${resp.status}: ${text || resp.statusText}` });
      clearTimeout(timeout);
      cleanupStream(reqId);
      return;
    }

    // If provider doesn't stream, fall back to one-shot JSON
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/event-stream') || !resp.body) {
      try {
        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
        post({ type: StreamEvents.CHAT_STREAM_BEGIN });
        if (content) post({ type: StreamEvents.CHAT_STREAM_DELTA, delta: content });
        post({ type: StreamEvents.CHAT_STREAM_DONE });
      } catch (e) {
        const text = await resp.text().catch(() => '');
        post({
          type: StreamEvents.CHAT_STREAM_ERROR,
          error: `Non-stream parse error: ${String(e?.message || e)} ${text ? `(${text.slice(0, 200)})` : ''}`
        });
      }
      clearTimeout(timeout);
      cleanupStream(reqId);
      return;
    }

    // Streaming path (resp is ok, content-type is SSE, and has a body)
    if (!resp.body) {
      const text = await resp.text().catch(() => '');
      post({ type: StreamEvents.CHAT_STREAM_ERROR, error: `API error ${resp.status}: ${text || resp.statusText}` });
      clearTimeout(timeout);
      cleanupStream(reqId);
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
        post({ type: StreamEvents.CHAT_STREAM_DONE });
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
          post({ type: StreamEvents.CHAT_STREAM_DELTA, delta: chunk });
        }
      } catch (_) {
        /* ignore parse errors */
      }
      return false;
    };

    post({ type: StreamEvents.CHAT_STREAM_BEGIN });
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
            clearTimeout(timeout);
            cleanupStream(reqId);
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
    post({ type: StreamEvents.CHAT_STREAM_DONE });
    clearTimeout(timeout);
    cleanupStream(reqId);
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (err?.name === 'AbortError' || /aborted|abort/i.test(msg)) {
      // Treat user stop/cancel as a graceful end
      try {
        post({ type: StreamEvents.CHAT_STREAM_DONE });
      } catch (_) {}
    } else {
      post({ type: StreamEvents.CHAT_STREAM_ERROR, error: `Request failed: ${msg}` });
    }
    clearTimeout(timeout);
    cleanupStream(reqId);
  }
}
