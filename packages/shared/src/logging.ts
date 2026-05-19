export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = {
  service: string;
  request_id?: string;
  trace_id?: string;
  case_id?: string;
  project_id?: string;
  failure_class?: string;
};

export type LogFields = LogContext & {
  event: string;
  message?: string;
  [key: string]: unknown;
};

export type HeaderBag = Record<string, string | string[] | undefined>;

export function requestContext(service: string, headers: HeaderBag = {}): LogContext {
  const requestId = firstHeader(headers, 'x-request-id') ?? firstHeader(headers, 'x-cloud-trace-context')?.split('/')[0];
  const traceId = firstHeader(headers, 'x-trace-id') ?? parseCloudTraceContext(firstHeader(headers, 'x-cloud-trace-context'));

  return {
    service,
    ...(requestId ? { request_id: requestId } : {}),
    ...(traceId ? { trace_id: traceId } : {}),
  };
}

export function logEvent(level: LogLevel, fields: LogFields): void {
  const entry = {
    severity: level.toUpperCase(),
    timestamp: new Date().toISOString(),
    ...withoutUndefined(fields),
  };
  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function failureClass(error: unknown): string {
  if (error instanceof SyntaxError) {
    return 'INVALID_JSON';
  }
  if (error instanceof Error && error.name) {
    return error.name;
  }

  return 'UNKNOWN_ERROR';
}

export function withLogContext(
  context: LogContext,
  fields: { event: string; message?: string; [key: string]: unknown },
): LogFields {
  return { ...context, ...fields };
}

function firstHeader(headers: HeaderBag, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseCloudTraceContext(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.split('/')[0] || undefined;
}

function withoutUndefined<T extends Record<string, unknown>>(fields: T): T {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T;
}
