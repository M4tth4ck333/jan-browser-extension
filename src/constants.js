// constants.js
// Minimal constant definitions for the browser MCP extension.

// -----------------------------------------------------------------------------
// MCP bridge configuration
// -----------------------------------------------------------------------------
export const BRIDGE_BASE = 'ws://127.0.0.1:17389';
export const BRIDGE_RECONNECT_TIMEOUT = 1500;
export const BRIDGE_RECONNECT_ERROR_TIMEOUT = 2000;

// -----------------------------------------------------------------------------
// Timeouts & delays
// -----------------------------------------------------------------------------
export const SCREENSHOT_CAPTURE_TIMEOUT = 5000;
export const TAB_LOAD_TIMEOUT = 10000;
export const SEARCH_READINESS_TIMEOUT = 15000;
export const CONTENT_LOAD_TIMEOUT = 30000;
export const TAB_REGISTRATION_DELAY = 1000;
export const SEARCH_HUMANIZE_DELAY_MIN = 500;
export const SEARCH_HUMANIZE_DELAY_MAX = 1700;

// -----------------------------------------------------------------------------
// Search defaults
// -----------------------------------------------------------------------------
export const DEFAULT_SEARCH_RESULTS = 5;
export const MAX_SEARCH_RESULTS = 10;
export const MAX_HTML_PREVIEW = 120000;

// -----------------------------------------------------------------------------
// Visit tool output modes
// -----------------------------------------------------------------------------
export const VisitOutputModes = {
  MARKDOWN: 'markdown',
  TEXT: 'text',
  HTML: 'html',
};

// -----------------------------------------------------------------------------
// Runtime message types handled by background.js
// -----------------------------------------------------------------------------
export const MessageTypes = {
  GET_BRIDGE_STATUS: 'GET_BRIDGE_STATUS',
  RECONNECT_BRIDGE: 'RECONNECT_BRIDGE',
  MCP_REGISTER_TAB: 'MCP_REGISTER_TAB',
  MCP_GET_REGISTERED_TAB: 'MCP_GET_REGISTERED_TAB',
  MCP_FOCUS_REGISTERED_TAB: 'MCP_FOCUS_REGISTERED_TAB',
};

// -----------------------------------------------------------------------------
// Messages exchanged with content scripts
// -----------------------------------------------------------------------------
export const ContentScriptMessages = {
  GET_PAGE_CONTENT: 'GET_PAGE_CONTENT',
  WAIT_FOR_SERP_READY: 'WAIT_FOR_SERP_READY',
  WAIT_FOR_DDG_READY: 'WAIT_FOR_DDG_READY',
  SCRAPE_GOOGLE_SERP: 'SCRAPE_GOOGLE_SERP',
  SCRAPE_DDG_SERP: 'SCRAPE_DDG_SERP',
  HUMANIZE_SERP: 'HUMANIZE_SERP',
};
