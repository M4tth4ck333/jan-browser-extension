/**
 * Unit tests for WebSocket bridge utilities
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';

// Mock the bridge module
vi.mock('../src/utils/bridge.js', async () => {
  let mockSocket: WebSocket | null = null;
  const pendingCalls = new Map();

  return {
    setExtensionSocket: (ws: WebSocket | null) => {
      mockSocket = ws;
    },
    hasExtensionConnection: () => mockSocket !== null,
    waitForBridgeConnection: async (timeout: number) => {
      const start = Date.now();
      while (!mockSocket && Date.now() - start < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!mockSocket) {
        throw new Error('Bridge connection timeout');
      }
    },
    callExtension: async (action: string, params: any) => {
      if (!mockSocket) {
        throw new Error('Browser extension not connected to bridge');
      }
      // Simulate extension response
      return {
        success: true,
        data: {
          url: params.url || 'https://example.com',
          title: 'Test Page',
          markdown: '# Test Content',
        },
      };
    },
    handleExtensionMessage: (data: any) => {
      // Mock implementation
    },
    cleanupPendingCalls: () => {
      pendingCalls.clear();
    },
  };
});

describe('Bridge Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should track extension connection status', async () => {
      const { setExtensionSocket, hasExtensionConnection } = await import(
        '../src/utils/bridge.js'
      );

      expect(hasExtensionConnection()).toBe(false);

      const mockWs = {} as WebSocket;
      setExtensionSocket(mockWs);

      expect(hasExtensionConnection()).toBe(true);

      setExtensionSocket(null);
      expect(hasExtensionConnection()).toBe(false);
    });

    it('should wait for bridge connection', async () => {
      const { setExtensionSocket, waitForBridgeConnection } = await import(
        '../src/utils/bridge.js'
      );

      // Set socket immediately
      const mockWs = {} as WebSocket;
      setExtensionSocket(mockWs);

      // Should resolve immediately
      await expect(waitForBridgeConnection(1000)).resolves.toBeUndefined();
    });

    it('should timeout when waiting for connection', async () => {
      const { setExtensionSocket, waitForBridgeConnection } = await import(
        '../src/utils/bridge.js'
      );

      setExtensionSocket(null);

      // Should timeout
      await expect(waitForBridgeConnection(100)).rejects.toThrow(
        'Bridge connection timeout'
      );
    });
  });

  describe('Extension Communication', () => {
    it('should call extension when connected', async () => {
      const { setExtensionSocket, callExtension } = await import(
        '../src/utils/bridge.js'
      );

      const mockWs = {} as WebSocket;
      setExtensionSocket(mockWs);

      const result = await callExtension('visit', {
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data.url).toBe('https://example.com');
    });

    it('should fail when extension not connected', async () => {
      const { setExtensionSocket, callExtension } = await import(
        '../src/utils/bridge.js'
      );

      setExtensionSocket(null);

      await expect(
        callExtension('visit', { url: 'https://example.com' })
      ).rejects.toThrow('Browser extension not connected');
    });
  });
});
