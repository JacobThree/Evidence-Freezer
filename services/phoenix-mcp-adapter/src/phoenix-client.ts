import { z } from 'zod';

export type PhoenixTraceSummary = {
  traceId: string;
  sessionId?: string;
  projectName?: string;
  startTime?: string;
  endTime?: string;
  spanCount?: number;
  status?: string;
};

export type PhoenixTrace = PhoenixTraceSummary & {
  spans?: PhoenixSpan[];
  raw?: unknown;
};

export type PhoenixSpan = {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  spanKind?: string;
  startTime?: string;
  endTime?: string;
  attributes?: Record<string, unknown>;
  events?: unknown[];
  raw?: unknown;
};

export type PhoenixSession = {
  sessionId: string;
  traceIds?: string[];
  startTime?: string;
  endTime?: string;
  raw?: unknown;
};

export type PhoenixPrompt = {
  promptId: string;
  name?: string;
  version?: string;
  template?: string;
  raw?: unknown;
};

export type PromptPatchDraft = {
  promptId: string;
  proposedTemplate: string;
  rationale: string;
  regressionPrompt?: string;
};

export type SavedPromptPatch = PromptPatchDraft & {
  patchId: string;
  status: 'proposed';
};

export type ListTracesOptions = {
  limit?: number;
  sessionId?: string;
  projectName?: string;
};

export interface PhoenixClient {
  listTraces(options: ListTracesOptions): Promise<PhoenixTraceSummary[]>;
  getTrace(traceId: string): Promise<PhoenixTrace>;
  getSpans(traceId: string): Promise<PhoenixSpan[]>;
  getSession(sessionId: string): Promise<PhoenixSession>;
  getPrompt(promptId: string): Promise<PhoenixPrompt>;
  savePromptPatchDraft(draft: PromptPatchDraft): Promise<SavedPromptPatch>;
}

const PhoenixEnvSchema = z.object({
  PHOENIX_HOST: z.string().url(),
  PHOENIX_PROJECT_NAME: z.string().min(1).default('default'),
  PHOENIX_API_KEY: z.string().min(1).optional(),
});

export type PhoenixClientConfig = {
  host: string;
  projectName: string;
  apiKey?: string;
};

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): PhoenixClientConfig {
  const parsed = PhoenixEnvSchema.parse({
    PHOENIX_HOST: env.PHOENIX_HOST,
    PHOENIX_PROJECT_NAME: env.PHOENIX_PROJECT_NAME ?? 'default',
    PHOENIX_API_KEY: env.PHOENIX_API_KEY,
  });

  return {
    host: parsed.PHOENIX_HOST.replace(/\/$/, ''),
    projectName: parsed.PHOENIX_PROJECT_NAME,
    apiKey: parsed.PHOENIX_API_KEY,
  };
}

export class PhoenixHttpClient implements PhoenixClient {
  readonly #config: PhoenixClientConfig;

  constructor(config: PhoenixClientConfig = configFromEnv()) {
    this.#config = {
      ...config,
      host: config.host.replace(/\/$/, ''),
    };
  }

  async listTraces(options: ListTracesOptions): Promise<PhoenixTraceSummary[]> {
    const query = new URLSearchParams();
    query.set('project_name', options.projectName ?? this.#config.projectName);
    query.set('limit', String(options.limit ?? 20));
    if (options.sessionId) {
      query.set('session_id', options.sessionId);
    }

    const data = await this.#fetchJson(`/v1/traces?${query.toString()}`);
    const traces = readArray(data, ['traces', 'data', 'items']);
    return traces.map((trace) => normalizeTraceSummary(trace));
  }

  async getTrace(traceId: string): Promise<PhoenixTrace> {
    const query = new URLSearchParams({ project_name: this.#config.projectName });
    const data = await this.#fetchJson(`/v1/traces/${encodeURIComponent(traceId)}?${query.toString()}`);
    const rawTrace = readObject(data, ['trace', 'data']) ?? toRecord(data);
    return normalizeTrace(rawTrace, traceId);
  }

  async getSpans(traceId: string): Promise<PhoenixSpan[]> {
    const query = new URLSearchParams({
      project_name: this.#config.projectName,
      trace_id: traceId,
    });
    const data = await this.#fetchJson(`/v1/spans?${query.toString()}`);
    const spans = readArray(data, ['spans', 'data', 'items']);
    return spans.map((span) => normalizeSpan(span, traceId));
  }

  async getSession(sessionId: string): Promise<PhoenixSession> {
    const query = new URLSearchParams({ project_name: this.#config.projectName });
    const data = await this.#fetchJson(`/v1/sessions/${encodeURIComponent(sessionId)}?${query.toString()}`);
    const rawSession = readObject(data, ['session', 'data']) ?? toRecord(data);
    return normalizeSession(rawSession, sessionId);
  }

  async getPrompt(promptId: string): Promise<PhoenixPrompt> {
    const data = await this.#fetchJson(`/v1/prompts/${encodeURIComponent(promptId)}`);
    const rawPrompt = readObject(data, ['prompt', 'data']) ?? toRecord(data);
    return normalizePrompt(rawPrompt, promptId);
  }

  async savePromptPatchDraft(draft: PromptPatchDraft): Promise<SavedPromptPatch> {
    return {
      ...draft,
      patchId: `draft_${Date.now().toString(36)}`,
      status: 'proposed',
    };
  }

  async #fetchJson(path: string): Promise<unknown> {
    const response = await fetch(`${this.#config.host}${path}`, {
      headers: {
        accept: 'application/json',
        ...(this.#config.apiKey ? { authorization: `Bearer ${this.#config.apiKey}` } : {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Phoenix request failed: ${response.status} ${response.statusText} ${body}`.trim());
    }

    return response.json() as Promise<unknown>;
  }
}

function readArray(value: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (!isRecord(value)) {
    return [];
  }

  for (const key of keys) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      return nested.filter(isRecord);
    }
  }

  return [];
}

function readObject(value: unknown, keys: string[]): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    const nested = value[key];
    if (isRecord(nested)) {
      return nested;
    }
  }

  return undefined;
}

function normalizeTraceSummary(raw: Record<string, unknown>): PhoenixTraceSummary {
  return {
    traceId: readString(raw, ['trace_id', 'traceId', 'id']) ?? 'unknown-trace',
    sessionId: readString(raw, ['session_id', 'sessionId']),
    projectName: readString(raw, ['project_name', 'projectName']),
    startTime: readString(raw, ['start_time', 'startTime']),
    endTime: readString(raw, ['end_time', 'endTime']),
    spanCount: readNumber(raw, ['span_count', 'spanCount']),
    status: readString(raw, ['status']),
  };
}

function normalizeTrace(raw: Record<string, unknown>, fallbackTraceId: string): PhoenixTrace {
  const summary = normalizeTraceSummary({ id: fallbackTraceId, ...raw });
  const spans = readArray(raw, ['spans']).map((span) => normalizeSpan(span, summary.traceId));
  return { ...summary, spans, raw };
}

function normalizeSpan(raw: Record<string, unknown>, fallbackTraceId: string): PhoenixSpan {
  return {
    spanId: readString(raw, ['span_id', 'spanId', 'id']) ?? 'unknown-span',
    traceId: readString(raw, ['trace_id', 'traceId']) ?? fallbackTraceId,
    parentSpanId: readString(raw, ['parent_span_id', 'parentSpanId']),
    name: readString(raw, ['name']) ?? 'unknown',
    spanKind: readString(raw, ['span_kind', 'spanKind', 'kind']),
    startTime: readString(raw, ['start_time', 'startTime']),
    endTime: readString(raw, ['end_time', 'endTime']),
    attributes: readRecord(raw, ['attributes']),
    events: readUnknownArray(raw, ['events']),
    raw,
  };
}

function normalizeSession(raw: Record<string, unknown>, fallbackSessionId: string): PhoenixSession {
  const traceIds = readUnknownArray(raw, ['trace_ids', 'traceIds'])
    ?.filter((traceId): traceId is string => typeof traceId === 'string');

  return {
    sessionId: readString(raw, ['session_id', 'sessionId', 'id']) ?? fallbackSessionId,
    traceIds,
    startTime: readString(raw, ['start_time', 'startTime']),
    endTime: readString(raw, ['end_time', 'endTime']),
    raw,
  };
}

function normalizePrompt(raw: Record<string, unknown>, fallbackPromptId: string): PhoenixPrompt {
  return {
    promptId: readString(raw, ['prompt_id', 'promptId', 'id']) ?? fallbackPromptId,
    name: readString(raw, ['name']),
    version: readString(raw, ['version']),
    template: readString(raw, ['template', 'prompt_template', 'content']),
    raw,
  };
}

function readString(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}

function readNumber(raw: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number') {
      return value;
    }
  }

  return undefined;
}

function readRecord(raw: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (isRecord(value)) {
      return value;
    }
  }

  return undefined;
}

function readUnknownArray(raw: Record<string, unknown>, keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
