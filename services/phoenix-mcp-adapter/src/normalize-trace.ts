import type { PhoenixSpan, PhoenixTrace } from './phoenix-client.js';

export type NormalizedTraceEvidence = {
  traceId: string;
  sessionId?: string;
  projectName?: string;
  startTime?: string;
  endTime?: string;
  timeline: NormalizedTimelineEvent[];
  evidence: NormalizedEvidenceItem[];
  truncation: TruncationRecord[];
};

export type NormalizedTimelineEvent = {
  spanId: string;
  parentSpanId?: string;
  name: string;
  spanKind?: string;
  startTime?: string;
  endTime?: string;
  attributes: Record<string, BoundedAttributeValue>;
};

export type NormalizedEvidenceItem = {
  type: 'prompt' | 'response' | 'retrieved_document' | 'tool_input' | 'tool_output';
  spanId: string;
  spanName: string;
  value: string;
  sourcePath: string;
};

export type TruncationRecord = {
  path: string;
  originalLength: number;
  retainedLength: number;
};

export type BoundedAttributeValue =
  | string
  | number
  | boolean
  | null
  | BoundedAttributeValue[]
  | { [key: string]: BoundedAttributeValue };

const ATTRIBUTE_STRING_LIMIT = 600;
const ATTRIBUTE_JSON_LIMIT = 1_200;
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

export function normalizeTraceForAnalyst(trace: PhoenixTrace): NormalizedTraceEvidence {
  const truncation: TruncationRecord[] = [];
  const spans = [...(trace.spans ?? [])].sort(compareSpansByTime);

  return {
    traceId: trace.traceId,
    sessionId: trace.sessionId,
    projectName: trace.projectName,
    startTime: trace.startTime,
    endTime: trace.endTime,
    timeline: spans.map((span) => normalizeTimelineEvent(span, truncation)),
    evidence: spans.flatMap((span) => extractEvidenceItems(span)),
    truncation,
  };
}

function normalizeTimelineEvent(span: PhoenixSpan, truncation: TruncationRecord[]): NormalizedTimelineEvent {
  return {
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    spanKind: span.spanKind,
    startTime: span.startTime,
    endTime: span.endTime,
    attributes: selectAttributes(span, truncation),
  };
}

function selectAttributes(span: PhoenixSpan, truncation: TruncationRecord[]): Record<string, BoundedAttributeValue> {
  const selected: Record<string, BoundedAttributeValue> = {};
  const attributes = span.attributes ?? {};

  for (const key of SELECTED_ATTRIBUTE_KEYS) {
    if (Object.hasOwn(attributes, key)) {
      selected[key] = boundAttributeValue(attributes[key], `timeline.${span.spanId}.attributes.${key}`, truncation);
    }
  }

  return selected;
}

function extractEvidenceItems(span: PhoenixSpan): NormalizedEvidenceItem[] {
  const attributes = span.attributes ?? {};
  const items: NormalizedEvidenceItem[] = [];

  collectStrings(attributes['input.value'], 'input.value').forEach((value, index) => {
    items.push(evidenceItem('prompt', span, value, pathWithIndex('attributes.input.value', index)));
  });
  collectStrings(attributes['llm.prompts'], 'llm.prompts').forEach((value, index) => {
    items.push(evidenceItem('prompt', span, value, pathWithIndex('attributes.llm.prompts', index)));
  });
  collectMessageContent(attributes['llm.input_messages']).forEach((value, index) => {
    items.push(evidenceItem('prompt', span, value, pathWithIndex('attributes.llm.input_messages', index)));
  });

  collectStrings(attributes['output.value'], 'output.value').forEach((value, index) => {
    items.push(evidenceItem('response', span, value, pathWithIndex('attributes.output.value', index)));
  });
  collectStrings(attributes['llm.completions'], 'llm.completions').forEach((value, index) => {
    items.push(evidenceItem('response', span, value, pathWithIndex('attributes.llm.completions', index)));
  });
  collectMessageContent(attributes['llm.output_messages']).forEach((value, index) => {
    items.push(evidenceItem('response', span, value, pathWithIndex('attributes.llm.output_messages', index)));
  });

  collectDocumentContent(attributes['retrieval.documents']).forEach((value, index) => {
    items.push(evidenceItem('retrieved_document', span, value, pathWithIndex('attributes.retrieval.documents', index)));
  });
  collectStrings(attributes['tool.parameters'], 'tool.parameters').forEach((value, index) => {
    items.push(evidenceItem('tool_input', span, value, pathWithIndex('attributes.tool.parameters', index)));
  });
  collectStrings(attributes['tool.output'], 'tool.output').forEach((value, index) => {
    items.push(evidenceItem('tool_output', span, value, pathWithIndex('attributes.tool.output', index)));
  });

  return items;
}

function evidenceItem(
  type: NormalizedEvidenceItem['type'],
  span: PhoenixSpan,
  value: string,
  sourcePath: string,
): NormalizedEvidenceItem {
  return {
    type,
    spanId: span.spanId,
    spanName: span.name,
    value,
    sourcePath,
  };
}

function collectStrings(value: unknown, _sourceKey: string): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStrings(entry, _sourceKey));
  }

  if (isRecord(value)) {
    const content = value.content ?? value.text ?? value.value ?? value.message;
    if (typeof content === 'string') {
      return [content];
    }
  }

  return [];
}

function collectMessageContent(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return collectStrings(value, 'message');
  }

  return value.flatMap((message) => {
    if (!isRecord(message)) {
      return [];
    }

    const content = message.content;
    if (typeof content === 'string') {
      return [content];
    }

    if (Array.isArray(content)) {
      return content.flatMap((part) => collectStrings(part, 'message.content'));
    }

    return collectStrings(message, 'message');
  });
}

function collectDocumentContent(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return collectStrings(value, 'document');
  }

  return value.flatMap((document) => {
    if (typeof document === 'string') {
      return [document];
    }

    if (!isRecord(document)) {
      return [];
    }

    const nestedDocument = isRecord(document.document) ? document.document : undefined;
    return collectStrings(nestedDocument?.content ?? document.content ?? document.text, 'document');
  });
}

function pathWithIndex(path: string, index: number): string {
  return index === 0 ? path : `${path}.${index}`;
}

function compareSpansByTime(left: PhoenixSpan, right: PhoenixSpan): number {
  const leftTime = Date.parse(left.startTime ?? '');
  const rightTime = Date.parse(right.startTime ?? '');

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  if (left.startTime && !right.startTime) {
    return -1;
  }

  if (!left.startTime && right.startTime) {
    return 1;
  }

  return left.spanId.localeCompare(right.spanId);
}

function boundAttributeValue(
  value: unknown,
  path: string,
  truncation: TruncationRecord[],
): BoundedAttributeValue {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value, ATTRIBUTE_STRING_LIMIT, path, truncation);
  }

  const json = stableStringify(value);
  if (json.length > ATTRIBUTE_JSON_LIMIT) {
    truncation.push({
      path,
      originalLength: json.length,
      retainedLength: ATTRIBUTE_JSON_LIMIT,
    });
    return `${json.slice(0, ATTRIBUTE_JSON_LIMIT)}...[truncated]`;
  }

  return toBoundedJsonValue(value, path, truncation);
}

function toBoundedJsonValue(value: unknown, path: string, truncation: TruncationRecord[]): BoundedAttributeValue {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value, ATTRIBUTE_STRING_LIMIT, path, truncation);
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => toBoundedJsonValue(entry, `${path}.${index}`, truncation));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toBoundedJsonValue(entry, `${path}.${key}`, truncation)]),
    );
  }

  return String(value);
}

function truncateString(
  value: string,
  limit: number,
  path: string,
  truncation: TruncationRecord[],
): string {
  if (value.length <= limit) {
    return value;
  }

  truncation.push({
    path,
    originalLength: value.length,
    retainedLength: limit,
  });
  return `${value.slice(0, limit)}...[truncated]`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
