// Quick script to reset extension settings to defaults
// Run this in the extension's service worker console (chrome://extensions → Service worker → Inspect)

chrome.storage.sync.clear(() => {
  console.log('✓ All settings cleared!');
  console.log('Reload the extension to apply new defaults from config/defaults.json');
});

// Alternatively, to update just the apiBase:
/*
chrome.storage.sync.set({
  provider: 'jan',
  apiBase: 'http://127.0.0.1:1337/v1',
  model: 'Jan-v1-4B-Q4_K_M'
}, () => {
  console.log('✓ Settings updated to use local Jan server');
});
*/
