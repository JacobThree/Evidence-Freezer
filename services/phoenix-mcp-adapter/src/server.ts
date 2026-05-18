import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { PhoenixHttpClient, type PhoenixClient } from './phoenix-client.js';
import { callTool, mcpTools } from './tools.js';

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

const MCP_PROTOCOL_VERSION = '2025-03-26';

export function createMcpHttpServer(client: PhoenixClient = new PhoenixHttpClient()) {
  return createServer(async (request, response) => {
    try {
      await routeRequest(client, request, response);
    } catch (error) {
      writeJson(response, 500, {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown server error.',
        },
      });
    }
  });
}

async function routeRequest(client: PhoenixClient, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/healthz') {
    writeJson(response, 200, { ok: true, service: 'phoenix-mcp-adapter' });
    return;
  }

  if (url.pathname !== '/mcp' && url.pathname !== '/mcp/') {
    writeJson(response, 404, {
      error: {
        code: 'NOT_FOUND',
        message: 'Phoenix MCP adapter exposes Streamable HTTP at /mcp.',
      },
    });
    return;
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (request.method === 'GET') {
    writeJson(response, 200, {
      name: 'phoenix-mcp-adapter',
      endpoint: '/mcp',
      protocolVersion: MCP_PROTOCOL_VERSION,
      tools: mcpTools.map((tool) => tool.name),
    });
    return;
  }

  if (request.method !== 'POST') {
    writeJson(response, 405, {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Use POST for MCP JSON-RPC requests.',
      },
    });
    return;
  }

  const body = await readJsonBody(request);
  const rpcResponse = await handleJsonRpc(client, body);
  writeJson(response, 200, rpcResponse);
}

export async function handleJsonRpc(client: PhoenixClient, body: unknown): Promise<JsonRpcResponse> {
  if (!isJsonRpcRequest(body)) {
    return jsonRpcError(null, -32600, 'Invalid JSON-RPC request.');
  }

  const id = body.id ?? null;

  switch (body.method) {
    case 'initialize':
      return jsonRpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: {
          name: 'phoenix-mcp-adapter',
          version: '0.0.0',
        },
        capabilities: {
          tools: {},
        },
      });
    case 'tools/list':
      return jsonRpcResult(id, { tools: mcpTools });
    case 'tools/call':
      return jsonRpcResult(id, await handleToolCall(client, body.params));
    default:
      return jsonRpcError(id, -32601, `Unsupported MCP method: ${body.method}`);
  }
}

async function handleToolCall(client: PhoenixClient, params: unknown): Promise<unknown> {
  if (!isRecord(params) || typeof params.name !== 'string') {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: {
              code: 'INVALID_TOOL_CALL',
              message: 'tools/call requires params.name and optional params.arguments.',
            },
          }),
        },
      ],
    };
  }

  const result = await callTool(client, params.name, params.arguments);
  return {
    isError: !result.ok,
    content: [
      {
        type: 'text',
        text: JSON.stringify(result),
      },
    ],
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return isRecord(value) && value.jsonrpc === '2.0' && typeof value.method === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonRpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function jsonRpcError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data,
    },
  };
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {
    ...corsHeaders(),
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(value));
}

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,mcp-session-id',
  };
}

const entrypointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (import.meta.url === entrypointUrl) {
  const port = Number(process.env.PORT ?? 8080);
  createMcpHttpServer().listen(port, () => {
    console.log(`phoenix-mcp-adapter listening on :${port}`);
  });
}
