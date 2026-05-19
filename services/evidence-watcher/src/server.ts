import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { failureClass, logEvent, requestContext, withLogContext, type LogContext } from '@evidence-freezer/shared';
import { agentClientFromEnv } from './agent-client.js';
import { FirestoreCaseFileRepository, type FirestoreLike } from './case-file-repository.js';
import { MemoryTraceDedupeStore, type TraceDedupeStore } from './dedupe.js';
import { healthPayload } from './health.js';
import { approvePatchForTest, parsePatchStatusBody, updatePatchStatus, type OperatorContext } from './patch-actions.js';
import { PhoenixMcpTraceSource } from './phoenix-mcp-trace-source.js';
import { processCandidate, type ProcessCandidateResult } from './process-candidate.js';
import { replayClientFromEnv, targetAppBaseUrlFromEnv, type ReplayClient } from './replay-client.js';
import { pollerOptionsFromEnv, TracePoller, type TracePollerOptions, type TraceSource } from './trace-poller.js';

export function createWatcherHttpServer(
  traceSource: TraceSource = new PhoenixMcpTraceSource(),
  dedupeStore: TraceDedupeStore = new MemoryTraceDedupeStore(),
  candidateProcessor?: CandidateProcessor,
  patchEndpoints?: PatchEndpointDependencies,
) {
  const poller = new TracePoller(traceSource, dedupeStore);

  return createServer(async (request, response) => {
    const startedAt = Date.now();
    const context = requestContext('evidence-watcher', request.headers);
    try {
      const result = await routeRequest(poller, request, candidateProcessor, patchEndpoints, context);
      writeJson(response, result.statusCode, result.body);
      logEvent('info', withLogContext(context, {
        event: 'http.request.completed',
        method: request.method,
        path: new URL(request.url ?? '/', 'http://localhost').pathname,
        status_code: result.statusCode,
        duration_ms: Date.now() - startedAt,
      }));
    } catch (error) {
      logEvent('error', withLogContext(context, {
        event: 'http.request.failed',
        method: request.method,
        path: request.url,
        failure_class: failureClass(error),
        message: error instanceof Error ? error.message : 'Unknown watcher error.',
        duration_ms: Date.now() - startedAt,
      }));
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
  candidateProcessor?: CandidateProcessor,
  patchEndpoints?: PatchEndpointDependencies,
  logContext?: LogContext,
): Promise<{ statusCode: number; body: unknown }> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const context = logContext ?? requestContext('evidence-watcher', request.headers);

  if (request.method === 'GET' && url.pathname === '/healthz') {
    return { statusCode: 200, body: healthPayload() };
  }

  const patchRoute = parsePatchRoute(url);
  if (patchRoute) {
    return routePatchRequest(request, patchRoute, patchEndpoints, context);
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
  const options = pollerOptionsFromEnv(process.env, overrides);
  try {
    const result = await poller.poll(options);
    if (options.dryRun || !candidateProcessor) {
      logWatcherPoll(context, result, 0, 0);
      return { statusCode: 200, body: result };
    }

    const processing_results: ProcessCandidateResult[] = [];
    for (const decision of result.decisions) {
      if (decision.decision === 'selected') {
        processing_results.push(await candidateProcessor(decision));
      }
    }

    const casesCreated = processing_results.filter((item) => item.status === 'created').length;
    const errors = processing_results.filter((item) => item.status !== 'created').length;
    logWatcherPoll(context, result, casesCreated, errors);
    return { statusCode: 200, body: { ...result, processing_results } };
  } catch (error) {
    logEvent('error', withLogContext(context, {
      event: 'watcher.poll.failed',
      project_id: options.projectId,
      failure_class: failureClass(error),
      message: error instanceof Error ? error.message : 'Watcher polling failed.',
    }));
    throw error;
  }
}

export type CandidateProcessor = (
  decision: Extract<Awaited<ReturnType<TracePoller['poll']>>['decisions'][number], { decision: 'selected' }>,
) => Promise<ProcessCandidateResult>;

export function createCandidateProcessor(
  traceSource: TraceSource,
  firestore: FirestoreLike,
): CandidateProcessor {
  const agentClient = agentClientFromEnv();
  const repository = new FirestoreCaseFileRepository(firestore);
  return (decision) => processCandidate(decision, { traceSource, agentClient, repository });
}

export interface PatchEndpointDependencies {
  repository: FirestoreCaseFileRepository;
  replayClient?: ReplayClient;
  targetBaseUrl?: string;
  env?: NodeJS.ProcessEnv;
}

type PatchRoute =
  | { action: 'status'; caseId: string }
  | { action: 'approve-for-test'; caseId: string };

async function routePatchRequest(
  request: IncomingMessage,
  route: PatchRoute,
  dependencies: PatchEndpointDependencies | undefined,
  logContext: LogContext,
): Promise<{ statusCode: number; body: unknown }> {
  if (request.method !== 'POST') {
    return {
      statusCode: 405,
      body: {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Use POST for patch action endpoints.',
        },
      },
    };
  }

  if (!dependencies) {
    return {
      statusCode: 503,
      body: {
        error: {
          code: 'PATCH_ENDPOINTS_NOT_CONFIGURED',
          message: 'Patch action endpoints require a Case File repository.',
        },
      },
    };
  }

  const auth = authenticateOperator(request, dependencies.env ?? process.env);
  if (!auth.ok) {
    return {
      statusCode: auth.statusCode,
      body: { error: { code: auth.code, message: auth.message } },
    };
  }

  try {
    const body = await readJsonBody(request);
    const result = route.action === 'status'
      ? await updatePatchStatus(route.caseId, parsePatchStatusBody(body), auth.operator, {
        repository: dependencies.repository,
      })
      : await approvePatchForTest(route.caseId, auth.operator, {
        repository: dependencies.repository,
        replayClient: dependencies.replayClient ?? replayClientFromEnv(dependencies.env),
        targetBaseUrl: dependencies.targetBaseUrl ?? targetAppBaseUrlFromEnv(dependencies.env),
      });

    logEvent('info', withLogContext(logContext, {
      event: 'patch.action.completed',
      case_id: route.caseId,
      action: route.action,
      actor: auth.operator.actor,
    }));
    return { statusCode: 200, body: result };
  } catch (error) {
    logEvent('warn', withLogContext(logContext, {
      event: 'patch.action.failed',
      case_id: route.caseId,
      action: route.action,
      failure_class: failureClass(error),
      message: error instanceof Error ? error.message : 'Patch action failed.',
    }));
    return mapPatchError(error);
  }
}

function logWatcherPoll(
  context: LogContext,
  result: Awaited<ReturnType<TracePoller['poll']>>,
  casesCreated: number,
  errors: number,
): void {
  logEvent('info', withLogContext(context, {
    event: 'watcher.poll.completed',
    project_id: result.project_id,
    project_name: result.project_name,
    dry_run: result.dry_run,
    scanned_count: result.scanned_count,
    candidates_found: result.selected_count,
    cases_created: casesCreated,
    error_count: errors,
  }));
}

function parsePatchRoute(url: URL): PatchRoute | null {
  const match = url.pathname.match(/^\/cases\/([^/]+)\/patch\/(status|approve-for-test)$/);
  if (!match) {
    return null;
  }

  return { caseId: decodeURIComponent(match[1]), action: match[2] as PatchRoute['action'] };
}

function authenticateOperator(
  request: IncomingMessage,
  env: NodeJS.ProcessEnv,
):
  | { ok: true; operator: OperatorContext }
  | { ok: false; statusCode: number; code: string; message: string } {
  const demoMode = env.WATCHER_DEMO_MODE !== 'false';
  const actor = headerValue(request, 'x-operator-email') ?? 'demo-operator';

  if (demoMode) {
    return { ok: true, operator: { actor } };
  }

  const expectedToken = env.WATCHER_OPERATOR_TOKEN;
  if (!expectedToken) {
    return {
      ok: false,
      statusCode: 503,
      code: 'OPERATOR_AUTH_NOT_CONFIGURED',
      message: 'Non-demo patch actions require WATCHER_OPERATOR_TOKEN.',
    };
  }

  const suppliedToken = readBearerToken(headerValue(request, 'authorization')) ?? headerValue(request, 'x-operator-token');
  if (suppliedToken !== expectedToken) {
    return {
      ok: false,
      statusCode: 401,
      code: 'UNAUTHORIZED_OPERATOR',
      message: 'Patch actions require an authenticated operator.',
    };
  }

  return { ok: true, operator: { actor } };
}

function mapPatchError(error: unknown): { statusCode: number; body: unknown } {
  const message = error instanceof Error ? error.message : 'Patch action failed.';
  const statusCode = message.includes('does not exist') ? 404 : 400;
  return {
    statusCode,
    body: {
      error: {
        code: statusCode === 404 ? 'CASE_FILE_NOT_FOUND' : 'PATCH_ACTION_FAILED',
        message,
      },
    },
  };
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

function headerValue(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function readBearerToken(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
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
    logEvent('info', {
      service: 'evidence-watcher',
      event: 'service.started',
      port,
    });
  });
}
