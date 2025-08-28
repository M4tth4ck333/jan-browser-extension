// browser.js - Minimal shim to unify chrome/browser API usage
// Sets window.browser = window.browser || window.chrome for cross-browser compatibility
// Import this at the top of background, content, and side panel entry files

if (typeof window !== 'undefined' && !window.browser && window.chrome) {
    window.browser = window.chrome;
  }
  
  // For service workers and other contexts where window might not be available
  if (typeof globalThis !== 'undefined' && !globalThis.browser && globalThis.chrome) {
    globalThis.browser = globalThis.chrome;
  }
  