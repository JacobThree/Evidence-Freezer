import type { NormalizedTraceForDetection } from './detectors/types.js';
import { normalizeOfficialPhoenixTrace, toTraceSummaries } from './phoenix-trace-normalizer.js';
import type { ListTracesOptions, TraceSource, TraceSummary } from './trace-poller.js';

type McpToolResult =
  | { ok: true; tool: string; data: unknown }
  | { ok: false; tool: string; error: { code: string; message: string; details?: Record<string, unknown> } };

export type PhoenixMcpTraceSourceConfig = {
  endpoint: string;
  auth?: PhoenixMcpAuthConfig;
  fetchImpl?: typeof fetch;
};

export type PhoenixMcpAuthConfig =
  | { mode: 'none' }
  | { mode: 'bearer'; token: string }
  | { mode: 'google_id_token'; audience?: string };

export class PhoenixMcpTraceSource implements TraceSource {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PhoenixMcpTraceSourceConfig = configFromEnv()) {
    this.endpoint = config.endpoint;
    this.auth = config.auth ?? { mode: 'none' };
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private readonly auth: PhoenixMcpAuthConfig;

  async listTraces(options: ListTracesOptions): Promise<TraceSummary[]> {
    const result = await this.callTool('list-traces', {
      limit: options.limit,
      projectName: options.projectName,
    });

    if (!Array.isArray(result)) {
      throw new Error('Phoenix MCP list-traces returned a non-array result.');
    }

    return toTraceSummaries(result).filter(isTraceSummary);
  }

  async getNormalizedTrace(traceId: string): Promise<NormalizedTraceForDetection> {
    const result = await this.callTool('get-trace', { traceId });
    if (isRecord(result) && isNormalizedTrace(result.normalizedEvidence)) {
      return result.normalizedEvidence;
    }

    return normalizeOfficialPhoenixTrace(result, traceId);
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(await this.authHeader()),
      },
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

    const parsed = JSON.parse(content.text) as unknown;
    if (!isMcpToolResult(parsed)) {
      return parsed;
    }

    if (!parsed.ok) {
      throw new Error(`Phoenix MCP ${name} failed: ${parsed.error.code} ${parsed.error.message}`);
    }

    return parsed.data;
  }

  private async authHeader(): Promise<Record<string, string>> {
    if (this.auth.mode === 'none') {
      return {};
    }

    if (this.auth.mode === 'bearer') {
      return { authorization: `Bearer ${this.auth.token}` };
    }

    const token = await this.fetchIdentityToken(this.auth.audience ?? cloudRunAudience(this.endpoint));
    return { authorization: `Bearer ${token}` };
  }

  private async fetchIdentityToken(audience: string): Promise<string> {
    const url = new URL(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity',
    );
    url.searchParams.set('audience', audience);

    const response = await this.fetchImpl(url, {
      headers: { 'Metadata-Flavor': 'Google' },
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Metadata identity token request failed: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): PhoenixMcpTraceSourceConfig {
  const endpoint = env.PHOENIX_MCP_ENDPOINT ?? env.PHOENIX_MCP_URL ?? 'http://localhost:8080/mcp';
  const authMode = env.PHOENIX_MCP_AUTH_MODE ?? 'none';

  if (authMode === 'bearer') {
    if (!env.PHOENIX_MCP_BEARER_TOKEN) {
      throw new Error('PHOENIX_MCP_BEARER_TOKEN is required when PHOENIX_MCP_AUTH_MODE=bearer.');
    }
    return { endpoint, auth: { mode: 'bearer', token: env.PHOENIX_MCP_BEARER_TOKEN } };
  }

  if (authMode === 'google_id_token') {
    return { endpoint, auth: { mode: 'google_id_token', audience: env.PHOENIX_MCP_AUDIENCE } };
  }

  if (authMode !== 'none') {
    throw new Error('PHOENIX_MCP_AUTH_MODE must be none, bearer, or google_id_token.');
  }

  return { endpoint, auth: { mode: 'none' } };
}

function cloudRunAudience(endpoint: string): string {
  const url = new URL(endpoint);
  return url.origin;
}

function isTraceSummary(value: unknown): value is TraceSummary {
  return isRecord(value) && typeof value.traceId === 'string';
}

function isMcpToolResult(value: unknown): value is McpToolResult {
  return isRecord(value) && typeof value.ok === 'boolean' && typeof value.tool === 'string';
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
