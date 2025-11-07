// anthropic-stream.js
// Anthropic-specific streaming implementation

import { postToSidePanel, registerStreamController, cleanupStream } from '../lib/event-routing.js';
import { StreamEvents, ANTHROPIC_API_VERSION, DEFAULT_MAX_TOKENS } from '../constants.js';

/**
 * Converts OpenAI-style chat messages to Anthropic's messages/system fields
 *
 * @param {Array} messages - OpenAI-style messages
 * @returns {{system?: string, messages: Array}} Anthropic-formatted messages
 */
export function convertToAnthropicMessages(messages) {
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

/**
 * Handles Anthropic chat completion streaming
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
 */
export async function chatCompletionsStreamAnthropic(
  { apiBase, apiKey, useApiKey, model, temperature, messages },
  tabId,
  reqId
) {
  const url = `${apiBase.replace(/\/$/, '')}/messages`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  registerStreamController(reqId, controller);

  const post = (msg) => postToSidePanel(msg, tabId, reqId);

  try {
    const { system, messages: aMsgs } = convertToAnthropicMessages(messages);
    const body = { model, messages: aMsgs, temperature, max_tokens: DEFAULT_MAX_TOKENS, stream: true };
    if (system) body.system = system;

    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_API_VERSION,
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
      post({ type: StreamEvents.CHAT_STREAM_ERROR, error: `API error ${resp.status}: ${text || resp.statusText}` });
      clearTimeout(timeout);
      cleanupStream(reqId);
      return;
    }

    // Non-streaming fallback (shouldn't happen if stream: true, but be resilient)
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/event-stream') || !resp.body) {
      try {
        const data = await resp.json();
        const txt = Array.isArray(data?.content)
          ? (data.content.map(c => c?.text || '').join(''))
          : (data?.content?.[0]?.text || '');
        post({ type: StreamEvents.CHAT_STREAM_BEGIN });
        if (txt) post({ type: StreamEvents.CHAT_STREAM_DELTA, delta: txt });
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
        if (!begun) {
          post({ type: StreamEvents.CHAT_STREAM_BEGIN });
          begun = true;
        }
        if (type === 'content_block_delta' && json?.delta?.text) {
          const chunk = String(json.delta.text || '');
          if (chunk) post({ type: StreamEvents.CHAT_STREAM_DELTA, delta: chunk });
        } else if (type === 'message_stop') {
          post({ type: StreamEvents.CHAT_STREAM_DONE });
          return true;
        }
      } catch (_) {
        /* ignore parse errors */
      }
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
            clearTimeout(timeout);
            cleanupStream(reqId);
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
    if (!begun) post({ type: StreamEvents.CHAT_STREAM_BEGIN });
    post({ type: StreamEvents.CHAT_STREAM_DONE });
    clearTimeout(timeout);
    cleanupStream(reqId);
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (err?.name === 'AbortError' || /aborted|abort/i.test(msg)) {
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
