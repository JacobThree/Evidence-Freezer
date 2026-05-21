import type { NormalizedTraceForDetection } from './detectors/types.js';

type PhoenixTrace = {
  traceId: string;
  sessionId?: string;
  projectName?: string;
  startTime?: string;
  endTime?: string;
  spans?: PhoenixSpan[];
};

type PhoenixSpan = {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  spanKind?: string;
  startTime?: string;
  endTime?: string;
  attributes?: Record<string, unknown>;
};

const SELECTED_ATTRIBUTE_KEYS = [
  'input.value',
  'output.value',
  'llm.input_messages',
  'llm.output_messages',
  'llm.prompts',
  'llm.completions',
  'retrieval.documents',
  'retrieval.query',
  'tool.name',
  'tool.parameters',
  'tool.output',
  'openinference.span.kind',
  'session.id',
  'user.id',
  'metadata',
];

export function normalizeOfficialPhoenixTrace(raw: unknown, fallbackTraceId?: string): NormalizedTraceForDetection {
  const trace = toPhoenixTrace(raw, fallbackTraceId);
  const spans = [...(trace.spans ?? [])].sort(compareSpansByTime);

  return {
    traceId: trace.traceId,
    sessionId: trace.sessionId,
    projectName: trace.projectName,
    timeline: spans.map((span) => ({
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      spanKind: span.spanKind,
      startTime: span.startTime,
      endTime: span.endTime,
      attributes: selectAttributes(span),
    })),
    evidence: spans.flatMap((span) => extractEvidenceItems(span)),
  };
}

export function toTraceSummaries(raw: unknown): Array<{
  traceId: string;
  sessionId?: string;
  projectName?: string;
  startTime?: string;
  endTime?: string;
  spanCount?: number;
  status?: string;
}> {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    const traceId = readString(entry, ['traceId', 'trace_id', 'id']);
    if (!traceId) {
      return [];
    }
    const spans = readArray(entry, ['spans']);
    return [{
      traceId,
      sessionId: readString(entry, ['sessionId', 'session_id']),
      projectName: readString(entry, ['projectName', 'project_name']),
      startTime: readString(entry, ['startTime', 'start_time']),
      endTime: readString(entry, ['endTime', 'end_time']),
      spanCount: readNumber(entry, ['spanCount', 'span_count']) ?? (spans.length || undefined),
      status: readString(entry, ['status']),
    }];
  });
}

function toPhoenixTrace(raw: unknown, fallbackTraceId = 'unknown-trace'): PhoenixTrace {
  if (!isRecord(raw)) {
    return { traceId: fallbackTraceId, spans: [] };
  }
  const traceId = readString(raw, ['traceId', 'trace_id', 'id']) ?? fallbackTraceId;
  const spans = readArray(raw, ['spans']).map((span) => toPhoenixSpan(span, traceId));
  return {
    traceId,
    sessionId: readString(raw, ['sessionId', 'session_id']),
    projectName: readString(raw, ['projectName', 'project_name']),
    startTime: readString(raw, ['startTime', 'start_time']),
    endTime: readString(raw, ['endTime', 'end_time']),
    spans,
  };
}

function toPhoenixSpan(raw: Record<string, unknown>, fallbackTraceId: string): PhoenixSpan {
  const context = readRecord(raw, ['context']);
  return {
    spanId: readString(raw, ['spanId', 'span_id', 'id']) ?? readString(context, ['span_id', 'spanId']) ?? 'unknown-span',
    traceId: readString(raw, ['traceId', 'trace_id']) ?? readString(context, ['trace_id', 'traceId']) ?? fallbackTraceId,
    parentSpanId: readString(raw, ['parentSpanId', 'parent_span_id', 'parent_id', 'parentId']),
    name: readString(raw, ['name']) ?? 'unknown',
    spanKind: readString(raw, ['spanKind', 'span_kind', 'kind']),
    startTime: readString(raw, ['startTime', 'start_time']),
    endTime: readString(raw, ['endTime', 'end_time']),
    attributes: readRecord(raw, ['attributes']),
  };
}

function selectAttributes(span: PhoenixSpan): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  const attributes = span.attributes ?? {};
  for (const key of SELECTED_ATTRIBUTE_KEYS) {
    if (Object.hasOwn(attributes, key)) {
      selected[key] = attributes[key];
    }
  }
  return selected;
}

function extractEvidenceItems(span: PhoenixSpan): NormalizedTraceForDetection['evidence'] {
  const attributes = span.attributes ?? {};
  const items: NormalizedTraceForDetection['evidence'] = [];

  collectStrings(attributes['input.value']).forEach((value, index) => {
    items.push(evidenceItem('prompt', span, value, pathWithIndex('attributes.input.value', index)));
  });
  collectStrings(attributes['llm.prompts']).forEach((value, index) => {
    items.push(evidenceItem('prompt', span, value, pathWithIndex('attributes.llm.prompts', index)));
  });
  collectMessageContent(attributes['llm.input_messages']).forEach((value, index) => {
    items.push(evidenceItem('prompt', span, value, pathWithIndex('attributes.llm.input_messages', index)));
  });
  collectStrings(attributes['output.value']).forEach((value, index) => {
    items.push(evidenceItem('response', span, value, pathWithIndex('attributes.output.value', index)));
  });
  collectMessageContent(attributes['llm.output_messages']).forEach((value, index) => {
    items.push(evidenceItem('response', span, value, pathWithIndex('attributes.llm.output_messages', index)));
  });
  collectDocumentContent(attributes['retrieval.documents']).forEach((value, index) => {
    items.push(evidenceItem('retrieved_document', span, value, pathWithIndex('attributes.retrieval.documents', index)));
  });
  collectStrings(attributes['tool.parameters']).forEach((value, index) => {
    items.push(evidenceItem('tool_input', span, value, pathWithIndex('attributes.tool.parameters', index)));
  });
  collectStrings(attributes['tool.output']).forEach((value, index) => {
    items.push(evidenceItem('tool_output', span, value, pathWithIndex('attributes.tool.output', index)));
  });

  return items;
}

function evidenceItem(
  type: NormalizedTraceForDetection['evidence'][number]['type'],
  span: PhoenixSpan,
  value: string,
  sourcePath: string,
): NormalizedTraceForDetection['evidence'][number] {
  return { type, spanId: span.spanId, spanName: span.name, value, sourcePath };
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStrings(entry));
  }
  if (isRecord(value)) {
    return collectStrings(value.content ?? value.text ?? value.value ?? value.message);
  }
  return [];
}

function collectMessageContent(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return collectStrings(value);
  }
  return value.flatMap((message) => {
    if (!isRecord(message)) {
      return [];
    }
    return collectStrings(message.content ?? message);
  });
}

function collectDocumentContent(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return collectStrings(value);
  }
  return value.flatMap((document) => {
    if (!isRecord(document)) {
      return collectStrings(document);
    }
    const nestedDocument = isRecord(document.document) ? document.document : undefined;
    return collectStrings(nestedDocument?.content ?? document.content ?? document.text);
  });
}

function compareSpansByTime(left: PhoenixSpan, right: PhoenixSpan): number {
  const leftTime = Date.parse(left.startTime ?? '');
  const rightTime = Date.parse(right.startTime ?? '');
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.spanId.localeCompare(right.spanId);
}

function pathWithIndex(path: string, index: number): string {
  return index === 0 ? path : `${path}.${index}`;
}

function readArray(value: Record<string, unknown>, keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      return nested.filter(isRecord);
    }
  }
  return [];
}

function readRecord(value: Record<string, unknown> | undefined, keys: string[]): Record<string, unknown> | undefined {
  if (!value) {
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

function readString(value: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!value) {
    return undefined;
  }
  for (const key of keys) {
    const nested = value[key];
    if (typeof nested === 'string') {
      return nested;
    }
  }
  return undefined;
}

function readNumber(value: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const nested = value[key];
    if (typeof nested === 'number') {
      return nested;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
