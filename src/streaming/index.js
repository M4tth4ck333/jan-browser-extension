// index.js
// Unified streaming interface

import { chatCompletionsStream } from './openai-stream.js';
import { chatCompletionsStreamAnthropic } from './anthropic-stream.js';
import { isAnthropicBase } from '../constants.js';

/**
 * Routes streaming requests to the appropriate implementation
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
 * @param {Function} getSettings - Function to get settings (for OpenAI stream)
 * @returns {Promise<void>}
 */
export async function streamChatCompletion(config, tabId, reqId, getSettings) {
  // Route Anthropic bases to the Anthropic streaming implementation
  if (isAnthropicBase(config.apiBase)) {
    return await chatCompletionsStreamAnthropic(config, tabId, reqId);
  }

  // Default to OpenAI-compatible streaming
  return await chatCompletionsStream(config, tabId, reqId, getSettings);
}

// Re-export individual implementations for direct use if needed
export { chatCompletionsStream } from './openai-stream.js';
export { chatCompletionsStreamAnthropic, convertToAnthropicMessages } from './anthropic-stream.js';
