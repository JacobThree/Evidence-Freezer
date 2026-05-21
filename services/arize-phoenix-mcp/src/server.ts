import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { healthPayload } from './health.js';
import { StdioOfficialPhoenixMcpClient, type OfficialPhoenixMcpClient } from './official-client.js';

type LogContext = {
  service: string;
  request_id?: string;
};

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

export function createMcpHttpServer(client: OfficialPhoenixMcpClient = new StdioOfficialPhoenixMcpClient()) {
  return createServer(async (request, response) => {
    const startedAt = Date.now();
    const context = requestContext('arize-phoenix-mcp', request.headers);
    try {
      await routeRequest(client, request, response, context);
      logEvent('info', withLogContext(context, {
        event: 'http.request.completed',
        method: request.method,
        path: new URL(request.url ?? '/', 'http://localhost').pathname,
        status_code: response.statusCode,
        duration_ms: Date.now() - startedAt,
      }));
    } catch (error) {
      logEvent('error', withLogContext(context, {
        event: 'http.request.failed',
        method: request.method,
        path: request.url,
        failure_class: failureClass(error),
        message: error instanceof Error ? error.message : 'Unknown server error.',
        duration_ms: Date.now() - startedAt,
      }));
      writeJson(response, 500, {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown server error.',
        },
      });
    }
  });
}

async function routeRequest(
  client: OfficialPhoenixMcpClient,
  request: IncomingMessage,
  response: ServerResponse,
  logContext: LogContext,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/healthz') {
    writeJson(response, 200, healthPayload());
    return;
  }

  if (url.pathname !== '/mcp' && url.pathname !== '/mcp/') {
    writeJson(response, 404, {
      error: {
        code: 'NOT_FOUND',
        message: 'Official Arize Phoenix MCP wrapper exposes Streamable HTTP at /mcp.',
      },
    });
    return;
  }

  if (request.method === 'GET') {
    writeJson(response, 200, {
      name: 'arize-phoenix-mcp',
      officialPackage: '@arizeai/phoenix-mcp',
      endpoint: '/mcp',
      protocolVersion: MCP_PROTOCOL_VERSION,
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
  logMcpRequest(logContext, body);
  const rpcResponse = await handleJsonRpc(client, body);
  logMcpResponse(logContext, body, rpcResponse);
  writeJson(response, 200, rpcResponse);
}

export async function handleJsonRpc(client: OfficialPhoenixMcpClient, body: unknown): Promise<JsonRpcResponse> {
  if (!isJsonRpcRequest(body)) {
    return jsonRpcError(null, -32600, 'Invalid JSON-RPC request.');
  }

  const id = body.id ?? null;
  try {
    switch (body.method) {
      case 'initialize':
        return jsonRpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          serverInfo: {
            name: 'arize-phoenix-mcp',
            officialPackage: '@arizeai/phoenix-mcp',
            version: '4.0.13',
          },
          capabilities: { tools: {} },
        });
      case 'tools/list':
        return jsonRpcResult(id, await client.listTools());
      case 'tools/call':
        return jsonRpcResult(id, await handleToolCall(client, body.params));
      default:
        return jsonRpcError(id, -32601, `Unsupported MCP method: ${body.method}`);
    }
  } catch (error) {
    return jsonRpcError(id, -32000, error instanceof Error ? error.message : 'Official Phoenix MCP call failed.');
  }
}

async function handleToolCall(client: OfficialPhoenixMcpClient, params: unknown): Promise<unknown> {
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

  return client.callTool(params.name, isRecord(params.arguments) ? params.arguments : {});
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return isRecord(value) && value.jsonrpc === '2.0' && typeof value.method === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonRpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function logMcpRequest(context: LogContext, body: unknown): void {
  if (!isJsonRpcRequest(body)) {
    return;
  }
  const tool = isRecord(body.params) && typeof body.params.name === 'string' ? body.params.name : undefined;
  logEvent('info', withLogContext(context, { event: 'mcp.request.received', method: body.method, ...(tool ? { tool } : {}) }));
}

function logMcpResponse(context: LogContext, body: unknown, response: JsonRpcResponse): void {
  if (!isJsonRpcRequest(body)) {
    return;
  }
  logEvent(response.error ? 'warn' : 'info', withLogContext(context, {
    event: 'mcp.response.completed',
    method: body.method,
    has_error: Boolean(response.error),
  }));
}

function requestContext(service: string, headers: IncomingMessage['headers']): LogContext {
  const requestId = header(headers, 'x-request-id') ?? header(headers, 'x-cloud-trace-context')?.split('/')[0];
  return { service, ...(requestId ? { request_id: requestId } : {}) };
}

function withLogContext(context: LogContext, fields: Record<string, unknown>): LogContext & Record<string, unknown> {
  return { ...context, ...fields };
}

function logEvent(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>): void {
  const line = JSON.stringify({
    severity: level.toUpperCase(),
    timestamp: new Date().toISOString(),
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
  });
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function failureClass(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'UNKNOWN_ERROR';
}

function header(headers: IncomingMessage['headers'], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.PORT ?? 8080);
  createMcpHttpServer().listen(port, () => {
    logEvent('info', { event: 'service.started', service: 'arize-phoenix-mcp', port });
  });
}
