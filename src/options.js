// options.js

const DEFAULTS = {
  provider: 'custom',
  apiBase: '',
  apiKey: '',
  model: '',
  temperature: 0.2
};

async function load() {
  const s = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  const cfg = { ...DEFAULTS, ...s };
  document.getElementById('provider').value = cfg.provider;
  document.getElementById('apiBase').value = cfg.apiBase;
  document.getElementById('apiKey').value = cfg.apiKey;
  document.getElementById('model').value = cfg.model;
  document.getElementById('temperature').value = cfg.temperature;
}

function setStatus(msg) {
  document.getElementById('status').textContent = msg || '';
}

async function save() {
  const provider = document.getElementById('provider').value;
  let apiBase = document.getElementById('apiBase').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  const model = document.getElementById('model').value.trim();
  const temperature = Number(document.getElementById('temperature').value || 0.2);

  if (provider === 'cerebras' && !apiBase) apiBase = 'https://api.cerebras.ai/v1';
  if (provider === 'jan' && !apiBase) apiBase = 'http://localhost:1337/v1';

  await chrome.storage.sync.set({ provider, apiBase, apiKey, model, temperature });
  setStatus('Saved.');
}

async function test() {
  setStatus('Testing...');
  const res = await chrome.runtime.sendMessage({ type: 'TEST_SETTINGS' }).catch(err => ({ ok: false, error: err.message }));
  if (res?.ok) setStatus('OK ✓');
  else setStatus(`Error: ${res?.error || 'Unknown error'}`);
}

function onProviderChange() {
  const provider = document.getElementById('provider').value;
  if (provider === 'cerebras') {
    document.getElementById('apiBase').placeholder = 'https://api.cerebras.ai/v1';
    document.getElementById('model').placeholder = 'e.g. llama3.1-8b, mixtral, etc.';
  } else if (provider === 'jan') {
    document.getElementById('apiBase').placeholder = 'http://localhost:1337/v1';
    document.getElementById('model').placeholder = 'Model name served by Jan (openai-compatible)';
  } else {
    document.getElementById('apiBase').placeholder = 'https://your-openai-compatible-endpoint/v1';
    document.getElementById('model').placeholder = 'Your model id';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  load();
  document.getElementById('provider').addEventListener('change', onProviderChange);
  document.getElementById('save').addEventListener('click', save);
  document.getElementById('test').addEventListener('click', test);
});
