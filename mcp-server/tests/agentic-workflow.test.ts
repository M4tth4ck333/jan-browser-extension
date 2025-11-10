/**
 * Agentic Workflow Tests
 * Tests the full agentic workflow pattern matching browsermcp architecture
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';

const BRIDGE_URL = 'ws://127.0.0.1:17389';
const TIMEOUT = 30000;

let ws: WebSocket | null = null;
let messageId = 0;

function nextId(): string {
  return `test-${Date.now()}-${++messageId}`;
}

function waitForResponse(id: string, timeoutMs: number = TIMEOUT): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for response to ${id}`));
    }, timeoutMs);

    const handler = (data: any) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id && msg.kind === 'result') {
          clearTimeout(timeout);
          ws?.removeListener('message', handler);
          if (msg.ok) {
            resolve(msg.data);
          } else {
            reject(new Error(msg.error || 'Unknown error'));
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    ws?.on('message', handler);
  });
}

async function callTool(tool: string, params: any = {}): Promise<any> {
  const id = nextId();
  const message = {
    kind: 'call',
    id,
    tool,
    params
  };

  ws?.send(JSON.stringify(message));
  return waitForResponse(id);
}

describe.skip('Agentic Workflow Tests', () => {
  beforeAll(async () => {
    // Connect to MCP bridge
    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(BRIDGE_URL);

      ws.on('open', () => {
        console.log('[Test] Connected to MCP bridge');
        resolve();
      });

      ws.on('error', (err) => {
        console.log('[Test] MCP server not running, skipping agentic workflow tests');
        reject(err);
      });

      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);
    });
  });

  afterAll(() => {
    ws?.close();
  });

  it('should check bridge status', async () => {
    const result = await callTool('bridge_status');
    expect(result).toBeDefined();
    expect(result.connected).toBe(true);
  }, TIMEOUT);

  describe('Full Agentic Workflow', () => {
    it('should complete a multi-step workflow: navigate → snapshot → screenshot', async () => {
      // Step 1: Navigate with keepTabOpen=true
      const navigateResult = await callTool('visit', {
        url: 'https://example.com',
        keepTabOpen: true,
        mode: 'markdown'
      });

      expect(navigateResult).toBeDefined();
      expect(navigateResult.url).toBe('https://example.com/');
      expect(navigateResult.title).toBeTruthy();
      expect(navigateResult.tabId).toBeTruthy();
      expect(navigateResult.markdown || navigateResult.text || navigateResult.html).toBeTruthy();

      console.log('[Test] Step 1 ✓ Navigated to example.com with tab kept open');
      console.log(`[Test] Tab ID: ${navigateResult.tabId}`);

      // Step 2: Take snapshot of the active tab (NO URL parameter)
      const snapshotResult = await callTool('snapshot', {});

      expect(snapshotResult).toBeDefined();
      expect(snapshotResult.url).toBe('https://example.com/');
      expect(snapshotResult.title).toBeTruthy();
      expect(snapshotResult.aria).toBeDefined();
      expect(snapshotResult.aria.tree).toBeDefined();
      expect(snapshotResult.aria.interactive).toBeInstanceOf(Array);
      expect(snapshotResult.links).toBeInstanceOf(Array);
      expect(snapshotResult.html).toBeTruthy();

      console.log('[Test] Step 2 ✓ Captured snapshot of active tab');
      console.log(`[Test] Found ${snapshotResult.links?.length || 0} links`);
      console.log(`[Test] Found ${snapshotResult.aria?.interactive?.length || 0} interactive elements`);

      // Step 3: Take screenshot of the active tab (NO URL parameter)
      const screenshotResult = await callTool('screenshot', {});

      expect(screenshotResult).toBeDefined();
      expect(screenshotResult.url).toBe('https://example.com/');
      expect(screenshotResult.screenshot).toBeTruthy();
      expect(screenshotResult.screenshot).toMatch(/^data:image\/png;base64,/);

      console.log('[Test] Step 3 ✓ Captured screenshot of active tab');
      console.log(`[Test] Screenshot size: ${screenshotResult.screenshot.length} chars`);

      // Verify all three operations worked on the SAME tab
      expect(navigateResult.url).toBe(snapshotResult.url);
      expect(navigateResult.url).toBe(screenshotResult.url);

      console.log('[Test] ✅ Full agentic workflow completed successfully');
    }, TIMEOUT * 2);

    it('should fail snapshot when no active tab', async () => {
      // Don't navigate first - should fail
      try {
        await callTool('snapshot', {});
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).toContain('No active tab');
        console.log('[Test] ✓ Snapshot correctly failed without active tab');
      }
    }, TIMEOUT);

    it('should fail screenshot when no active tab', async () => {
      // Don't navigate first - should fail
      try {
        await callTool('screenshot', {});
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).toContain('No active tab');
        console.log('[Test] ✓ Screenshot correctly failed without active tab');
      }
    }, TIMEOUT);
  });

  describe('Navigation Tool', () => {
    it('should navigate with default markdown mode', async () => {
      const result = await callTool('visit', {
        url: 'https://example.com',
        keepTabOpen: false
      });

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com/');
      expect(result.title).toBeTruthy();
      expect(result.markdown).toBeTruthy();
    }, TIMEOUT);

    it('should navigate with html mode', async () => {
      const result = await callTool('visit', {
        url: 'https://example.com',
        mode: 'html',
        keepTabOpen: false
      });

      expect(result).toBeDefined();
      expect(result.html).toBeTruthy();
      expect(result.html).toContain('<!DOCTYPE html>');
    }, TIMEOUT);

    it('should navigate with text mode', async () => {
      const result = await callTool('visit', {
        url: 'https://example.com',
        mode: 'text',
        keepTabOpen: false
      });

      expect(result).toBeDefined();
      expect(result.text).toBeTruthy();
    }, TIMEOUT);
  });

  describe('Observation Tools', () => {
    it('should capture comprehensive snapshot', async () => {
      // First navigate
      await callTool('visit', {
        url: 'https://example.com',
        keepTabOpen: true
      });

      // Then snapshot
      const result = await callTool('snapshot', {});

      expect(result).toBeDefined();
      expect(result.title).toBeTruthy();
      expect(result.url).toBe('https://example.com/');

      // ARIA tree
      expect(result.aria).toBeDefined();
      expect(result.aria.tree).toBeDefined();
      expect(result.aria.interactive).toBeInstanceOf(Array);
      expect(result.aria.landmarks).toBeInstanceOf(Array);

      // Page elements
      expect(result.links).toBeInstanceOf(Array);
      expect(result.images).toBeInstanceOf(Array);
      expect(result.forms).toBeInstanceOf(Array);
      expect(result.headings).toBeInstanceOf(Array);

      // Content
      expect(result.html).toBeTruthy();

      // Metadata
      expect(result.viewport).toBeDefined();
      expect(result.viewport.width).toBeGreaterThan(0);
      expect(result.viewport.height).toBeGreaterThan(0);
      expect(result.timestamp).toBeTruthy();
    }, TIMEOUT);

    it('should capture screenshot as PNG', async () => {
      // First navigate
      await callTool('visit', {
        url: 'https://example.com',
        keepTabOpen: true
      });

      // Then screenshot
      const result = await callTool('screenshot', {});

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com/');
      expect(result.screenshot).toBeTruthy();
      expect(result.screenshot).toMatch(/^data:image\/png;base64,/);
      expect(result.timestamp).toBeTruthy();
    }, TIMEOUT);
  });

  describe('Search Tool', () => {
    it('should perform web search', async () => {
      const result = await callTool('search', {
        query: 'test query',
        numResults: 3,
        format: 'serper'
      });

      expect(result).toBeDefined();
      expect(result.query).toBe('test query');
      expect(result.organic).toBeInstanceOf(Array);
      if (result.organic.length > 0) {
        expect(result.organic[0]).toHaveProperty('title');
        expect(result.organic[0]).toHaveProperty('url');
        expect(result.organic[0]).toHaveProperty('snippet');
      }
    }, TIMEOUT);
  });

  describe('Utility Tools', () => {
    it('should wait for specified duration', async () => {
      const start = Date.now();
      await callTool('wait', { seconds: 1 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(1000);
      expect(elapsed).toBeLessThan(1500); // Allow some margin
    });
  });
});
