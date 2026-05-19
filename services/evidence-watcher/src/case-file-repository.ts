import { CaseFileSchema, type CaseFile, type PatchState } from '@evidence-freezer/shared/src/case-file.ts';
import { z } from 'zod';
import { createAuditEventId, createCaseId } from './case-id.js';

export const AuditEventSchema = z.object({
  event_id: z.string(),
  case_id: z.string(),
  event_type: z.string(),
  actor: z.string(),
  occurred_at: z.string(),
  details: z.record(z.unknown()).default({}),
}).strict();

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const PatchReplayRecordSchema = z.object({
  replay_id: z.string(),
  case_id: z.string(),
  actor: z.string(),
  occurred_at: z.string(),
  target_url: z.string(),
  before_output: z.string(),
  after_output: z.string(),
  passed: z.boolean(),
  reason: z.string(),
}).strict();

export type PatchReplayRecord = z.infer<typeof PatchReplayRecordSchema>;

export interface FirestoreLike {
  collection(path: string): CollectionReferenceLike;
}

export interface CollectionReferenceLike {
  doc(id: string): DocumentReferenceLike;
  get(): Promise<QuerySnapshotLike>;
}

export interface DocumentReferenceLike {
  id: string;
  collection(path: string): CollectionReferenceLike;
  get(): Promise<DocumentSnapshotLike>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
}

export interface DocumentSnapshotLike {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface QuerySnapshotLike {
  docs: DocumentSnapshotLike[];
}

export interface CreateCaseFileOptions {
  actor?: string;
  replay?: boolean;
  replayId?: string;
  auditDetails?: Record<string, unknown>;
}

export interface UpdatePatchStatusOptions {
  actor: string;
  occurredAt?: string;
  details?: Record<string, unknown>;
}

export class FirestoreCaseFileRepository {
  constructor(private readonly firestore: FirestoreLike) {}

  async create(caseFileInput: unknown, options: CreateCaseFileOptions = {}): Promise<CaseFile> {
    const parsed = CaseFileSchema.parse(caseFileInput);
    const caseId = createCaseId({
      projectId: parsed.project_id,
      traceId: parsed.trace_id,
      replay: options.replay,
      replayId: options.replayId,
    });
    const caseFile: CaseFile = { ...parsed, case_id: caseId };
    const caseRef = this.caseRef(caseId);

    await caseRef.set(toFirestoreRecord(caseFile));
    await this.appendAuditEvent(caseId, {
      event_type: options.replay ? 'case_file_replayed' : 'case_file_created',
      actor: options.actor ?? 'evidence-watcher',
      occurred_at: caseFile.detected_at,
      details: {
        project_id: caseFile.project_id,
        trace_id: caseFile.trace_id,
        ...(options.auditDetails ?? {}),
      },
    });

    return caseFile;
  }

  async get(caseId: string): Promise<CaseFile | null> {
    const snapshot = await this.caseRef(caseId).get();
    if (!snapshot.exists) {
      return null;
    }

    return CaseFileSchema.parse(snapshot.data());
  }

  async list(): Promise<CaseFile[]> {
    const snapshot = await this.firestore.collection('case_files').get();
    return snapshot.docs
      .map((document) => CaseFileSchema.parse(document.data()))
      .sort((left, right) => right.detected_at.localeCompare(left.detected_at));
  }

  async updatePatchStatus(
    caseId: string,
    status: PatchState,
    options: UpdatePatchStatusOptions,
  ): Promise<CaseFile> {
    const existing = await this.get(caseId);
    if (!existing) {
      throw new Error(`Case File ${caseId} does not exist.`);
    }
    if (!existing.prompt_patch) {
      throw new Error(`Case File ${caseId} does not have a prompt patch.`);
    }

    const updated = CaseFileSchema.parse({
      ...existing,
      prompt_patch: {
        ...existing.prompt_patch,
        status,
      },
    });

    await this.caseRef(caseId).set(toFirestoreRecord(updated));
    await this.appendAuditEvent(caseId, {
      event_type: 'patch_status_updated',
      actor: options.actor,
      occurred_at: options.occurredAt ?? new Date().toISOString(),
      details: {
        status,
        ...(options.details ?? {}),
      },
    });

    return updated;
  }

  async listAuditEvents(caseId: string): Promise<AuditEvent[]> {
    const snapshot = await this.caseRef(caseId).collection('audit_events').get();
    return snapshot.docs
      .map((document) => AuditEventSchema.parse(document.data()))
      .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
  }

  async recordPatchReplay(
    caseId: string,
    input: Omit<PatchReplayRecord, 'case_id' | 'replay_id'> & { replay_id?: string },
  ): Promise<PatchReplayRecord> {
    const replay = PatchReplayRecordSchema.parse({
      ...input,
      case_id: caseId,
      replay_id: input.replay_id ?? createAuditEventId(caseId, 'patch_replay', input.occurred_at),
    });

    await this.caseRef(caseId)
      .collection('patch_replays')
      .doc(replay.replay_id)
      .set(toFirestoreRecord(replay));

    await this.appendAuditEvent(caseId, {
      event_type: 'patch_replay_completed',
      actor: replay.actor,
      occurred_at: replay.occurred_at,
      details: {
        replay_id: replay.replay_id,
        passed: replay.passed,
        reason: replay.reason,
      },
    });

    return replay;
  }

  async listPatchReplays(caseId: string): Promise<PatchReplayRecord[]> {
    const snapshot = await this.caseRef(caseId).collection('patch_replays').get();
    return snapshot.docs
      .map((document) => PatchReplayRecordSchema.parse(document.data()))
      .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
  }

  async recordAuditEvent(
    caseId: string,
    input: Omit<AuditEvent, 'case_id' | 'event_id'>,
  ): Promise<AuditEvent> {
    const event = AuditEventSchema.parse({
      ...input,
      case_id: caseId,
      event_id: createAuditEventId(caseId, input.event_type, input.occurred_at),
    });

    await this.caseRef(caseId)
      .collection('audit_events')
      .doc(event.event_id)
      .set(toFirestoreRecord(event));

    return event;
  }

  private async appendAuditEvent(
    caseId: string,
    input: Omit<AuditEvent, 'case_id' | 'event_id'>,
  ): Promise<AuditEvent> {
    return this.recordAuditEvent(caseId, input);
  }

  private caseRef(caseId: string): DocumentReferenceLike {
    return this.firestore.collection('case_files').doc(caseId);
  }
}

function toFirestoreRecord<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
