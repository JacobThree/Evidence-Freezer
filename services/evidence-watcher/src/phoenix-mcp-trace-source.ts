import type { NormalizedTraceForDetection } from './detectors/types.js';
import type { ListTracesOptions, TraceSource, TraceSummary } from './trace-poller.js';

type McpToolResult =
  | { ok: true; tool: string; data: unknown }
  | { ok: false; tool: string; error: { code: string; message: string; details?: Record<string, unknown> } };

export type PhoenixMcpTraceSourceConfig = {
  endpoint: string;
  fetchImpl?: typeof fetch;
};

export class PhoenixMcpTraceSource implements TraceSource {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PhoenixMcpTraceSourceConfig = configFromEnv()) {
    this.endpoint = config.endpoint;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async listTraces(options: ListTracesOptions): Promise<TraceSummary[]> {
    const result = await this.callTool('list-traces', {
      limit: options.limit,
      projectName: options.projectName,
    });

    if (!Array.isArray(result)) {
      throw new Error('Phoenix MCP list-traces returned a non-array result.');
    }

    return result.filter(isTraceSummary);
  }

  async getNormalizedTrace(traceId: string): Promise<NormalizedTraceForDetection> {
    const result = await this.callTool('get-trace', { traceId });
    if (!isRecord(result) || !isNormalizedTrace(result.normalizedEvidence)) {
      throw new Error(`Phoenix MCP get-trace did not return normalized evidence for ${traceId}.`);
    }

    return result.normalizedEvidence;
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `${name}-${Date.now()}`,
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Phoenix MCP request failed: ${response.status} ${response.statusText}`);
    }

    const rpc = (await response.json()) as unknown;
    if (!isRecord(rpc)) {
      throw new Error('Phoenix MCP returned an invalid JSON-RPC response.');
    }
    if (isRecord(rpc.error)) {
      throw new Error(`Phoenix MCP JSON-RPC error: ${String(rpc.error.message ?? 'unknown error')}`);
    }

    const result = isRecord(rpc.result) ? rpc.result : undefined;
    const content = Array.isArray(result?.content) ? result.content[0] : undefined;
    if (!isRecord(content) || typeof content.text !== 'string') {
      throw new Error('Phoenix MCP tool response did not contain text content.');
    }

    const toolResult = JSON.parse(content.text) as McpToolResult;
    if (!toolResult.ok) {
      throw new Error(`Phoenix MCP ${name} failed: ${toolResult.error.code} ${toolResult.error.message}`);
    }

    return toolResult.data;
  }
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): PhoenixMcpTraceSourceConfig {
  const endpoint = env.PHOENIX_MCP_ENDPOINT ?? env.PHOENIX_MCP_URL ?? 'http://localhost:8080/mcp';
  return { endpoint };
}

function isTraceSummary(value: unknown): value is TraceSummary {
  return isRecord(value) && typeof value.traceId === 'string';
}

function isNormalizedTrace(value: unknown): value is NormalizedTraceForDetection {
  return (
    isRecord(value) &&
    typeof value.traceId === 'string' &&
    Array.isArray(value.evidence) &&
    value.evidence.every(
      (item) =>
        isRecord(item) &&
        typeof item.type === 'string' &&
        typeof item.spanId === 'string' &&
        typeof item.spanName === 'string' &&
        typeof item.value === 'string' &&
        typeof item.sourcePath === 'string',
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
