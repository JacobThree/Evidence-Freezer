import { describe, expect, it } from 'vitest';
import { handleJsonRpc } from '../src/server.js';
import { mapCompatibilityArguments } from '../src/official-client.js';
import type { OfficialPhoenixMcpClient } from '../src/official-client.js';

describe('official Arize Phoenix MCP wrapper', () => {
  it('proxies JSON-RPC tools/call to official MCP client', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client: OfficialPhoenixMcpClient = {
      async listTools() {
        return { tools: [] };
      },
      async callTool(name, args) {
        calls.push({ name, args });
        return { content: [{ type: 'text', text: '[]' }] };
      },
      async close() {},
    };

    const response = await handleJsonRpc(client, {
      jsonrpc: '2.0',
      id: '1',
      method: 'tools/call',
      params: { name: 'list-traces', arguments: { projectName: 'default', limit: 5 } },
    });

    expect(response.error).toBeUndefined();
    expect(calls).toEqual([{ name: 'list-traces', args: { projectName: 'default', limit: 5 } }]);
  });

  it('maps watcher compatibility args to official Phoenix MCP args', () => {
    expect(mapCompatibilityArguments('get-trace', { traceId: 'abc', projectName: 'default' })).toEqual({
      trace_id: 'abc',
      project_identifier: 'default',
    });
  });
});
