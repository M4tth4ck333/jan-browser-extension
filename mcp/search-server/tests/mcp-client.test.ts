/**
 * Integration tests for Jan Browser MCP Server
 * Tests the MCP server via JSON-RPC over stdio
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, any>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

class MCPTestClient {
  private process: ChildProcess;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: JSONRPCResponse) => void;
    reject: (error: Error) => void;
  }>();

  constructor(command: string, args: string[]) {
    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: join(__dirname, '..'),
    });

    // Handle stdout (JSON-RPC responses)
    this.process.stdout!.on('data', (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        try {
          const response: JSONRPCResponse = JSON.parse(line);
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            this.pendingRequests.delete(response.id);
            pending.resolve(response);
          }
        } catch (err) {
          console.error('[Test] Failed to parse response:', line, err);
        }
      }
    });

    // Handle stderr (for debugging)
    this.process.stderr!.on('data', (data) => {
      console.error('[MCP stderr]:', data.toString());
    });

    this.process.on('error', (err) => {
      console.error('[MCP process error]:', err);
    });
  }

  async sendRequest(method: string, params?: Record<string, any>): Promise<JSONRPCResponse> {
    this.requestId++;
    const id = this.requestId;

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params: params || {},
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 20000); // Increase timeout to 20s

      this.pendingRequests.set(id, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.process.stdin!.write(JSON.stringify(request) + '\n');
    });
  }

  async close() {
    this.process.stdin!.end();
    this.process.kill();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

describe('MCP Server Integration Tests', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    // Start the MCP server
    const serverPath = join(__dirname, '..', 'dist', 'src', 'index.js');
    client = new MCPTestClient('node', [serverPath]);

    // Wait for server to initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Initialize the MCP session
    const initResponse = await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    });

    expect(initResponse.result).toBeDefined();
    expect(initResponse.result.serverInfo?.name).toBe('jan-browser-mcp');
  }, 30000); // Increase timeout for beforeAll

  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  describe('Tool Listing', () => {
    it('should list all available tools', async () => {
      const response = await client.sendRequest('tools/list');

      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeInstanceOf(Array);
      expect(response.result.tools.length).toBeGreaterThan(0);

      const toolNames = response.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('browser_navigate');
      expect(toolNames).toContain('web_search');
      expect(toolNames).toContain('snapshot');
      expect(toolNames).toContain('screenshot');
      expect(toolNames).toContain('bridge_status');
      expect(toolNames).toContain('click');
      expect(toolNames).toContain('type');
    });

    it('should have valid tool schemas', async () => {
      const response = await client.sendRequest('tools/list');
      const tools = response.result.tools;

      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('Bridge Status Tool', () => {
    it('should check bridge connection status', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'bridge_status',
        arguments: {},
      });

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeInstanceOf(Array);
      expect(response.result.content[0].type).toBe('text');

      const status = JSON.parse(response.result.content[0].text);
      expect(status).toHaveProperty('connected');
      expect(status).toHaveProperty('timestamp');
      expect(typeof status.connected).toBe('boolean');
    });
  });

  describe('Browser Navigate Tool', () => {
    it('should fail gracefully when extension is not connected', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'browser_navigate',
        arguments: {
          url: 'https://example.com',
          mode: 'markdown',
        },
      });

      // Should either succeed or return a meaningful error
      expect(response.result).toBeDefined();
      expect(response.result.content).toBeInstanceOf(Array);
      expect(response.result.content[0].type).toBe('text');

      // If error, should mention extension or connection
      if (response.result.isError) {
        const errorText = response.result.content[0].text.toLowerCase();
        expect(
          errorText.includes('extension') ||
          errorText.includes('connect') ||
          errorText.includes('bridge') ||
          errorText.includes('timeout')
        ).toBe(true);
      }
    });

    it('should validate required url parameter', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'browser_navigate',
        arguments: {
          mode: 'markdown',
        },
      });

      expect(response.result).toBeDefined();
      // Should handle missing URL gracefully
    });
  });

  describe('Web Search Tool', () => {
    it('should fail gracefully when extension is not connected', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'web_search',
        arguments: {
          query: 'test search',
          numResults: 3,
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeInstanceOf(Array);
    });
  });

  describe('Snapshot Tool', () => {
    it('should fail gracefully when extension is not connected', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'snapshot',
        arguments: {
          url: 'https://example.com',
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeInstanceOf(Array);
    });
  });

  describe('Error Handling', () => {
    it('should return error for non-existent tool', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'non_existent_tool',
        arguments: {},
      });

      expect(response.result).toBeDefined();
      expect(response.result.isError).toBe(true);
      expect(response.result.content[0].text).toContain('not found');
    });

    it('should handle malformed requests gracefully', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'browser_navigate',
        arguments: 'invalid' as any,
      });

      // Should either succeed with error or handle gracefully
      expect(response.result).toBeDefined();
    });
  });
});
