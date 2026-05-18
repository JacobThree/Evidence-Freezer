import { createHash, randomUUID } from 'node:crypto';

export interface CaseIdInput {
  projectId: string;
  traceId: string;
  replay?: boolean;
  replayId?: string;
}

export function createCaseId(input: CaseIdInput): string {
  const projectId = normalizeIdPart(input.projectId, 'projectId');
  const traceId = normalizeIdPart(input.traceId, 'traceId');
  const dedupeKey = `${projectId}:${traceId}`;
  const digest = createHash('sha256').update(dedupeKey).digest('hex').slice(0, 20);

  if (!input.replay) {
    return `case_${digest}`;
  }

  const replayId = input.replayId ?? randomUUID();
  const replayDigest = createHash('sha256')
    .update(`${dedupeKey}:${replayId}`)
    .digest('hex')
    .slice(0, 12);

  return `case_${digest}_replay_${replayDigest}`;
}

export function createAuditEventId(caseId: string, eventType: string, occurredAt: string): string {
  const safeCaseId = normalizeIdPart(caseId, 'caseId');
  const safeEventType = normalizeIdPart(eventType, 'eventType');
  const safeOccurredAt = normalizeIdPart(occurredAt, 'occurredAt');
  const digest = createHash('sha256')
    .update(`${safeCaseId}:${safeEventType}:${safeOccurredAt}`)
    .digest('hex')
    .slice(0, 20);

  return `audit_${digest}`;
}

function normalizeIdPart(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${fieldName} is required to create a deterministic ID.`);
  }

  return trimmed;
}
