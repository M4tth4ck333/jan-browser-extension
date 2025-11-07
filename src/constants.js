// constants.js
// Centralized constants for the Jan Browser extension

// ============================================================================
// Port & Connection Constants
// ============================================================================

/** Key for global port storage when no specific tabId is available */
export const GLOBAL_KEY = '__global__';

/** WebSocket endpoint for MCP bridge server */
export const BRIDGE_BASE = 'ws://127.0.0.1:17389';

// ============================================================================
// Timeout Constants (in milliseconds)
// ============================================================================

/** Timeout for WebSocket bridge reconnection attempts */
export const BRIDGE_RECONNECT_TIMEOUT = 1500;

/** Fallback timeout for bridge reconnection on error */
export const BRIDGE_RECONNECT_ERROR_TIMEOUT = 2000;

/** Timeout for screenshot capture */
export const SCREENSHOT_CAPTURE_TIMEOUT = 5000;

/** Timeout for tab load completion */
export const TAB_LOAD_TIMEOUT = 10000;

/** Timeout for API settings test */
export const SETTINGS_TEST_TIMEOUT = 15000;

/** Timeout for search readiness check */
export const SEARCH_READINESS_TIMEOUT = 15000;

/** Timeout for content loading (visit tool) */
export const CONTENT_LOAD_TIMEOUT = 30000;

/** Delay for tab registration in agentic workflows */
export const TAB_REGISTRATION_DELAY = 1000;

/** Delay for humanizing search interactions (min) */
export const SEARCH_HUMANIZE_DELAY_MIN = 500;

/** Delay for humanizing search interactions (max) */
export const SEARCH_HUMANIZE_DELAY_MAX = 1700;

// ============================================================================
// Content Length & Size Limits
// ============================================================================

/** Maximum content length for visit tool */
export const MAX_CONTENT_LENGTH = 100000;

/** Maximum characters for inline assist context */
export const MAX_INLINE_ASSIST_CHARS = 16000;

/** Maximum characters for summarization input */
export const MAX_SUMMARY_CHARS = 16000;

/** Maximum prefix length for autocomplete */
export const MAX_AUTOCOMPLETE_PREFIX = 1000;

/** Maximum HTML preview length for debug output */
export const MAX_HTML_PREVIEW = 120000;

/** Maximum segment length for DuckDuckGo parsing */
export const MAX_DDG_SEGMENT = 2000;

// ============================================================================
// Default Settings & Configuration
// ============================================================================

/** Fallback settings if config load fails */
export const DEFAULT_SETTINGS = {
  provider: 'jan',
  apiBase: 'http://127.0.0.1:1337/v1',
  apiKey: 'secret-key-123',
  useApiKey: true,
  model: 'Jan-v1-4B-Q4_K_M',
  temperature: 0.2,
  useCustomCompletionsUrl: false,
  customCompletionsUrl: '',
  ddgOnly: false,
};

/** Default number of search results */
export const DEFAULT_SEARCH_RESULTS = 5;

/** Maximum number of search results */
export const MAX_SEARCH_RESULTS = 10;

/** Default max tokens for LLM completion */
export const DEFAULT_MAX_TOKENS = 1024;

// ============================================================================
// API Configuration
// ============================================================================

/** Anthropic API version header */
export const ANTHROPIC_API_VERSION = '2023-06-01';

/** Jan Server default API base (localhost override) */
export const JAN_SERVER_LOCALHOST = 'http://127.0.0.1:1337/v1';

// ============================================================================
// Message Types
// ============================================================================

/** Message types for chrome.runtime.onMessage */
export const MessageTypes = {
  // Streaming & Chat
  CHAT_COMPLETION_STREAM_START: 'CHAT_COMPLETION_STREAM_START',
  CHAT_COMPLETION_STREAM_STOP: 'CHAT_COMPLETION_STREAM_STOP',
  CHAT_COMPLETION: 'CHAT_COMPLETION',

  // Page & Content
  SUMMARIZE: 'SUMMARIZE',
  GET_PAGE_CONTENT: 'GET_PAGE_CONTENT',
  SELECTION_UPDATED: 'SELECTION_UPDATED',

  // Inline Assistance
  INLINE_ASSIST_START: 'INLINE_ASSIST_START',
  CUSTOM_PROMPT_RUN: 'CUSTOM_PROMPT_RUN',
  AUTOCOMPLETE_SUGGEST: 'AUTOCOMPLETE_SUGGEST',

  // Search
  SEARCH_AND_SCRAPE: 'SEARCH_AND_SCRAPE',
  GOOGLE_SEARCH_AND_SCRAPE: 'GOOGLE_SEARCH_AND_SCRAPE',

  // Settings & Configuration
  TEST_SETTINGS: 'TEST_SETTINGS',
  LIST_MODELS: 'LIST_MODELS',

  // MCP Bridge
  GET_BRIDGE_STATUS: 'GET_BRIDGE_STATUS',
  RECONNECT_BRIDGE: 'RECONNECT_BRIDGE',

  // Port Registration
  REGISTER_PORT: 'REGISTER_PORT',
};

/** Streaming event types sent to UI */
export const StreamEvents = {
  CHAT_STREAM_BEGIN: 'CHAT_STREAM_BEGIN',
  CHAT_STREAM_DELTA: 'CHAT_STREAM_DELTA',
  CHAT_STREAM_DONE: 'CHAT_STREAM_DONE',
  CHAT_STREAM_ERROR: 'CHAT_STREAM_ERROR',
};

// ============================================================================
// MCP Bridge Tool Names
// ============================================================================

export const MCPTools = {
  SEARCH: 'search',
  VISIT: 'visit',
  SCREENSHOT: 'screenshot',
  EXECUTE_SCRIPT: 'execute_script',
  CLICK: 'click',
  FILL_FORM: 'fill_form',
  SNAPSHOT: 'snapshot',
  TYPE: 'type',
  HOVER: 'hover',
  SELECT_OPTION: 'select_option',
  GO_BACK: 'go_back',
  GO_FORWARD: 'go_forward',
  SCROLL: 'scroll',
};

// ============================================================================
// Content Script Message Types
// ============================================================================

export const ContentScriptMessages = {
  GET_PAGE_CONTENT: 'GET_PAGE_CONTENT',
  SCRAPE_GOOGLE_SERP: 'SCRAPE_GOOGLE_SERP',
  WAIT_FOR_SERP_READY: 'WAIT_FOR_SERP_READY',
  EXECUTE_SCRIPT: 'EXECUTE_SCRIPT',
  CLICK_ELEMENT: 'CLICK_ELEMENT',
  FILL_FORM: 'FILL_FORM',
  GET_ARIA_SNAPSHOT: 'GET_ARIA_SNAPSHOT',
  TYPE_TEXT: 'TYPE_TEXT',
  HOVER_ELEMENT: 'HOVER_ELEMENT',
  SELECT_OPTION: 'SELECT_OPTION',
};

// ============================================================================
// Keyboard Command Names
// ============================================================================

export const Commands = {
  OPEN_SIDEPANEL: 'open_sidepanel',
  OPEN_CUSTOM_PROMPT: 'open_custom_prompt',
  TOGGLE_AUTOCOMPLETE: 'toggle_autocomplete',
};

// ============================================================================
// Context Menu IDs
// ============================================================================

export const ContextMenuIds = {
  ADD_TO_CONTEXT: 'add-to-jan-context',
};

// ============================================================================
// Inline Assist Modes
// ============================================================================

export const InlineAssistModes = {
  REWRITE: 'rewrite',
  TRANSLATE: 'translate',
};

// ============================================================================
// Visit Tool Output Modes
// ============================================================================

export const VisitOutputModes = {
  MARKDOWN: 'markdown',
  TEXT: 'text',
  HTML: 'html',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a URL is supported for content script injection
 * @param {string} url - URL to check
 * @returns {boolean} True if URL starts with http:// or https://
 */
export const isSupportedUrl = (url) => /^https?:\/\//.test(url || '');

/**
 * Check if an API base URL is Anthropic
 * @param {string} base - API base URL
 * @returns {boolean} True if URL contains 'anthropic'
 */
export const isAnthropicBase = (base) => /anthropic/i.test(base || '');
