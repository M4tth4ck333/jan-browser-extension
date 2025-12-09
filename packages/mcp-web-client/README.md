# MCP Web Client

TypeScript client library for websites to communicate directly with the Jan Browser MCP extension.

## Installation

```bash
npm install @janhq/mcp-web-client
```

## Extension ID

The extension ID must be injected at runtime when creating the client. The ID varies depending on how the extension is installed (Chrome Web Store vs local development).

```typescript
// Inject via environment variable
const EXTENSION_ID = process.env.EXTENSION_ID;

if (!EXTENSION_ID) {
  throw new Error('EXTENSION_ID environment variable is required');
}
```

## Usage

### Step 1: Check Browser Compatibility

```typescript
import { isChromeBrowser, hasChromeRuntime } from '@janhq/mcp-web-client';

if (!isChromeBrowser()) {
  console.log('Please use Chrome, Edge, Brave, or another Chromium browser.');
  return;
}

if (!hasChromeRuntime()) {
  console.log('chrome.runtime API not available.');
  return;
}
```

### Step 2: Check Extension Availability

```typescript
import { isExtensionAvailable, detectExtension } from '@janhq/mcp-web-client';

// Quick check
const available = await isExtensionAvailable(EXTENSION_ID);
if (!available) {
  console.log('Extension not installed.');
  return;
}

// Full detection with version info
const detection = await detectExtension(EXTENSION_ID);
console.log('Extension version:', detection.extensionVersion);
```

### Step 3: Connect and Use

```typescript
import { McpWebClient } from '@janhq/mcp-web-client';

const client = new McpWebClient({
  extensionId: EXTENSION_ID,
  timeout: 30000,        // optional, defaults to 30s
  autoReconnect: true,   // optional, auto-reconnect on disconnect
  maxReconnectAttempts: 5, // optional, max reconnect attempts
  reconnectDelay: 1000,  // optional, delay between attempts (ms)
});

// Connect
await client.connect();

// Call browser automation tools (same sanitized behavior as mcp-server)
await client.call('browser_navigate', { target: 'example.com' }); // auto-adds https://
const snapshot = await client.call('browser_snapshot', {});
await client.call('browser_click', { target: 's1e5' });
await client.call('browser_type', { target: 's1e10', text: 'Hello', submit: true });

// If you need the raw extension response, use callRaw()
const raw = await client.callRaw('browser_snapshot', {});

// Listen to events
client.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

client.on('connect', () => {
  console.log('Connected!');
});

// Manually reconnect if needed
await client.reconnect();

// Disconnect when done
client.disconnect();
```

## Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `browser_navigate` | Navigate to URL | `{ url: string }` |
| `browser_snapshot` | Get page snapshot | `{}` |
| `browser_screenshot` | Take screenshot | `{ fullPage?: boolean }` |
| `browser_click` | Click element | `{ target: string }` |
| `browser_type` | Type text | `{ target: string, text?: string, clear?: boolean, submit?: boolean }` |
| `browser_scroll` | Scroll page | `{ direction: 'up'\|'down'\|'left'\|'right', amount?: number, target?: string }` |

## Allowed Domains

The extension only accepts connections from:
- `*.jan.ai` (chat.jan.ai, dev-chat.jan.ai, stag-chat.jan.ai)
- `localhost`
- `127.0.0.1`

These are configured in the extension's manifest and cannot be changed at runtime.

## Error Handling

```typescript
import {
  McpWebClient,
  BrowserNotSupportedError,
  ExtensionNotAvailableError,
  ConnectionError,
  ToolCallError,
  TimeoutError,
  NotConnectedError,
} from '@janhq/mcp-web-client';

try {
  await client.call('browser_click', { target: 's1e5' });
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Tool call timed out');
  } else if (error instanceof ToolCallError) {
    console.log('Tool call failed:', error.toolError);
  } else if (error instanceof NotConnectedError) {
    console.log('Not connected - call connect() first');
  }
}
```

## API Reference

### Detection Functions

- `isChromeBrowser()` - Check if browser is Chrome/Chromium-based (sync)
- `hasChromeRuntime()` - Check if chrome.runtime API is available (sync)
- `isExtensionAvailable(extensionId, timeoutMs?)` - Check if extension responds (async)
- `detectExtension(extensionId, timeoutMs?)` - Full detection with version (async)

### McpWebClient

- `new McpWebClient(config)` - Create client
- `connect()` - Connect to extension
- `disconnect()` - Disconnect from extension
- `reconnect()` - Manually reconnect (resets retry counter)
- `isConnected()` - Check connection status
- `getState()` - Get connection state
- `getExtensionVersion()` - Get extension version (after connect)
- `call(tool, params)` - Call a tool with shared sanitization/normalization (returns ToolResult)
- `callRaw(tool, params)` - Call a tool and receive the raw extension response
- `on(event, handler)` - Subscribe to events
- `off(event, handler)` - Unsubscribe from events

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `extensionId` | string | required | Chrome extension ID |
| `timeout` | number | 30000 | Tool call timeout (ms) |
| `autoReconnect` | boolean | false | Auto-reconnect on disconnect |
| `maxReconnectAttempts` | number | 5 | Max reconnect attempts |
| `reconnectDelay` | number | 1000 | Base delay between attempts (ms) |

### Events

- `connect` - Fired when connected
- `disconnect` - Fired when disconnected (with reason)
- `error` - Fired on error
- `stateChange` - Fired when connection state changes

## License

MIT
