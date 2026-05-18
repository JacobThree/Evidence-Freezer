import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { MemoryTraceDedupeStore, type TraceDedupeStore } from './dedupe.js';
import { PhoenixMcpTraceSource } from './phoenix-mcp-trace-source.js';
import { pollerOptionsFromEnv, TracePoller, type TracePollerOptions, type TraceSource } from './trace-poller.js';

export function createWatcherHttpServer(
  traceSource: TraceSource = new PhoenixMcpTraceSource(),
  dedupeStore: TraceDedupeStore = new MemoryTraceDedupeStore(),
) {
  const poller = new TracePoller(traceSource, dedupeStore);

  return createServer(async (request, response) => {
    try {
      const result = await routeRequest(poller, request);
      writeJson(response, result.statusCode, result.body);
    } catch (error) {
      writeJson(response, 500, {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown watcher error.',
        },
      });
    }
  });
}

export async function routeRequest(
  poller: TracePoller,
  request: IncomingMessage,
): Promise<{ statusCode: number; body: unknown }> {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/healthz') {
    return { statusCode: 200, body: { ok: true, service: 'evidence-watcher' } };
  }

  if (url.pathname !== '/poll') {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Evidence watcher exposes polling at /poll.',
        },
      },
    };
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return {
      statusCode: 405,
      body: {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Use GET or POST for /poll.',
        },
      },
    };
  }

  const body = request.method === 'POST' ? await readJsonBody(request) : {};
  const overrides = parsePollOverrides(url, body);
  const result = await poller.poll(pollerOptionsFromEnv(process.env, overrides));
  return { statusCode: 200, body: result };
}

function parsePollOverrides(
  url: URL,
  body: unknown,
): Partial<Pick<TracePollerOptions, 'dryRun' | 'pollingWindowMinutes' | 'projectId' | 'limit'>> {
  const input = isRecord(body) ? body : {};
  const dryRun = readBoolean(input.dryRun ?? url.searchParams.get('dryRun'));
  const pollingWindowMinutes = readNumber(input.pollingWindowMinutes ?? url.searchParams.get('windowMinutes'));
  const limit = readNumber(input.limit ?? url.searchParams.get('limit'));
  const projectId = readString(input.projectId ?? url.searchParams.get('projectId'));

  return {
    ...(dryRun === undefined ? {} : { dryRun }),
    ...(pollingWindowMinutes === undefined ? {} : { pollingWindowMinutes }),
    ...(limit === undefined ? {} : { limit }),
    ...(projectId === undefined ? {} : { projectId }),
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

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }

  return undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(value));
}

const entrypointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (import.meta.url === entrypointUrl) {
  const port = Number(process.env.PORT ?? 8080);
  createWatcherHttpServer().listen(port, () => {
    console.log(`evidence-watcher listening on :${port}`);
  });
}
