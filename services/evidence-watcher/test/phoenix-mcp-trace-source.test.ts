import { describe, expect, it } from 'vitest';
import { configFromEnv, PhoenixMcpTraceSource } from '../src/phoenix-mcp-trace-source.js';

describe('PhoenixMcpTraceSource', () => {
  it('adds a configured bearer token to MCP requests', async () => {
    const requests: Request[] = [];
    const source = new PhoenixMcpTraceSource({
      endpoint: 'https://phoenix-mcp.example.run.app/mcp',
      auth: { mode: 'bearer', token: 'test-token' },
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init));
        return jsonRpcResponse([
          {
            traceId: 'trace_1',
            projectName: 'default',
            startTime: '2026-05-18T12:00:00Z',
          },
        ]);
      },
    });

    await source.listTraces({ projectName: 'default', limit: 1 });

    expect(requests[0].headers.get('authorization')).toBe('Bearer test-token');
  });

  it('uses a metadata identity token for private Cloud Run MCP requests', async () => {
    const requests: Request[] = [];
    const source = new PhoenixMcpTraceSource({
      endpoint: 'https://phoenix-mcp.example.run.app/mcp',
      auth: { mode: 'google_id_token' },
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.startsWith('http://metadata.google.internal/')) {
          expect(request.headers.get('Metadata-Flavor')).toBe('Google');
          expect(new URL(request.url).searchParams.get('audience')).toBe('https://phoenix-mcp.example.run.app');
          return new Response('identity-token');
        }

        return jsonRpcResponse([
          {
            traceId: 'trace_1',
            projectName: 'default',
            startTime: '2026-05-18T12:00:00Z',
          },
        ]);
      },
    });

    await source.listTraces({ projectName: 'default', limit: 1 });

    expect(requests[1].headers.get('authorization')).toBe('Bearer identity-token');
  });

  it('requires a token when bearer auth is selected from env', () => {
    expect(() =>
      configFromEnv({
        PHOENIX_MCP_URL: 'https://phoenix-mcp.example.run.app/mcp',
        PHOENIX_MCP_AUTH_MODE: 'bearer',
      }),
    ).toThrow('PHOENIX_MCP_BEARER_TOKEN');
  });
});

function jsonRpcResponse(data: unknown): Response {
  return Response.json({
    jsonrpc: '2.0',
    id: 'test',
    result: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: true, tool: 'list-traces', data }),
        },
      ],
    },
  });
}
