import { describe, expect, it } from 'vitest';
import validCase from '../../../packages/shared/fixtures/valid-case.json' with { type: 'json' };
import { createCaseId } from '../src/case-id.js';
import {
  FirestoreCaseFileRepository,
  type CollectionReferenceLike,
  type DocumentReferenceLike,
  type DocumentSnapshotLike,
  type FirestoreLike,
  type QuerySnapshotLike,
} from '../src/case-file-repository.js';

class MemoryFirestore implements FirestoreLike {
  readonly writes: string[] = [];
  private readonly documents = new Map<string, Record<string, unknown>>();

  collection(path: string): CollectionReferenceLike {
    return new MemoryCollection(this, path);
  }

  getDocument(path: string): Record<string, unknown> | undefined {
    return this.documents.get(path);
  }

  setDocument(path: string, data: Record<string, unknown>, merge = false): void {
    this.writes.push(path);
    this.documents.set(path, merge ? { ...(this.documents.get(path) ?? {}), ...data } : data);
  }

  listDocuments(path: string): DocumentSnapshotLike[] {
    const prefix = `${path}/`;
    const snapshots: DocumentSnapshotLike[] = [];

    for (const [documentPath, data] of this.documents) {
      if (!documentPath.startsWith(prefix)) {
        continue;
      }

      const remainingPath = documentPath.slice(prefix.length);
      if (remainingPath.includes('/')) {
        continue;
      }

      snapshots.push(new MemoryDocumentSnapshot(documentPath.split('/').at(-1) ?? '', data));
    }

    return snapshots;
  }
}

class MemoryCollection implements CollectionReferenceLike {
  constructor(
    private readonly store: MemoryFirestore,
    private readonly path: string,
  ) {}

  doc(id: string): DocumentReferenceLike {
    return new MemoryDocument(this.store, `${this.path}/${id}`, id);
  }

  async get(): Promise<QuerySnapshotLike> {
    return { docs: this.store.listDocuments(this.path) };
  }
}

class MemoryDocument implements DocumentReferenceLike {
  constructor(
    private readonly store: MemoryFirestore,
    private readonly path: string,
    readonly id: string,
  ) {}

  collection(path: string): CollectionReferenceLike {
    return new MemoryCollection(this.store, `${this.path}/${path}`);
  }

  async get(): Promise<DocumentSnapshotLike> {
    const data = this.store.getDocument(this.path);
    return new MemoryDocumentSnapshot(this.id, data);
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    this.store.setDocument(this.path, data, options?.merge ?? false);
  }

  async update(data: Record<string, unknown>): Promise<void> {
    if (!this.store.getDocument(this.path)) {
      throw new Error(`Document ${this.path} does not exist.`);
    }

    this.store.setDocument(this.path, data, true);
  }
}

class MemoryDocumentSnapshot implements DocumentSnapshotLike {
  constructor(
    readonly id: string,
    private readonly documentData: Record<string, unknown> | undefined,
  ) {}

  get exists(): boolean {
    return this.documentData !== undefined;
  }

  data(): Record<string, unknown> | undefined {
    return this.documentData;
  }
}

describe('case ID generation', () => {
  it('deduplicates by project ID and trace ID', () => {
    expect(createCaseId({ projectId: 'my-project', traceId: 'trace-12345' })).toBe(
      createCaseId({ projectId: 'my-project', traceId: 'trace-12345' }),
    );
    expect(createCaseId({ projectId: 'other-project', traceId: 'trace-12345' })).not.toBe(
      createCaseId({ projectId: 'my-project', traceId: 'trace-12345' }),
    );
  });

  it('allows explicit replay case IDs without changing the base dedupe ID', () => {
    const baseId = createCaseId({ projectId: 'my-project', traceId: 'trace-12345' });
    const replayId = createCaseId({
      projectId: 'my-project',
      traceId: 'trace-12345',
      replay: true,
      replayId: 'manual-rerun-1',
    });

    expect(replayId).toContain(`${baseId}_replay_`);
    expect(replayId).toBe(
      createCaseId({
        projectId: 'my-project',
        traceId: 'trace-12345',
        replay: true,
        replayId: 'manual-rerun-1',
      }),
    );
  });
});

describe('FirestoreCaseFileRepository', () => {
  it('writes a validated Case File and deterministic audit event under Firestore paths', async () => {
    const firestore = new MemoryFirestore();
    const repository = new FirestoreCaseFileRepository(firestore);

    const created = await repository.create(validCase, {
      actor: 'test-watcher',
      auditDetails: { detector_count: 1 },
    });

    expect(created.case_id).toBe(
      createCaseId({ projectId: validCase.project_id, traceId: validCase.trace_id }),
    );
    expect(firestore.writes).toEqual([
      `case_files/${created.case_id}`,
      expect.stringMatching(new RegExp(`^case_files/${created.case_id}/audit_events/audit_[a-f0-9]{20}$`)),
    ]);

    await expect(repository.get(created.case_id)).resolves.toEqual(created);
    await expect(repository.listAuditEvents(created.case_id)).resolves.toMatchObject([
      {
        case_id: created.case_id,
        event_type: 'case_file_created',
        actor: 'test-watcher',
        details: {
          detector_count: 1,
          project_id: validCase.project_id,
          trace_id: validCase.trace_id,
        },
      },
    ]);
  });

  it('overwrites duplicate project and trace pairs with the same case ID', async () => {
    const repository = new FirestoreCaseFileRepository(new MemoryFirestore());

    const first = await repository.create(validCase);
    const second = await repository.create({
      ...validCase,
      severity: 'critical',
      root_cause: 'Updated analyst finding.',
    });

    expect(first.case_id).toBe(second.case_id);
    await expect(repository.get(first.case_id)).resolves.toMatchObject({
      severity: 'critical',
      root_cause: 'Updated analyst finding.',
    });
  });

  it('rejects invalid Case File JSON before writing', async () => {
    const firestore = new MemoryFirestore();
    const repository = new FirestoreCaseFileRepository(firestore);

    await expect(
      repository.create({
        ...validCase,
        prompt_patch: {
          ...validCase.prompt_patch,
          status: 'ready',
        },
      }),
    ).rejects.toThrow();

    expect(firestore.writes).toEqual([]);
  });

  it('lists stored Case Files newest first', async () => {
    const repository = new FirestoreCaseFileRepository(new MemoryFirestore());

    const older = await repository.create({
      ...validCase,
      trace_id: 'trace-older',
      detected_at: '2026-05-16T09:00:00Z',
    });
    const newer = await repository.create({
      ...validCase,
      trace_id: 'trace-newer',
      detected_at: '2026-05-16T11:00:00Z',
    });

    await expect(repository.list()).resolves.toEqual([newer, older]);
  });

  it('updates patch status and records an audit event', async () => {
    const repository = new FirestoreCaseFileRepository(new MemoryFirestore());
    const created = await repository.create(validCase);

    const updated = await repository.updatePatchStatus(created.case_id, 'approved_for_test', {
      actor: 'operator@example.com',
      occurredAt: '2026-05-16T12:00:00Z',
    });

    expect(updated.prompt_patch?.status).toBe('approved_for_test');
    await expect(repository.listAuditEvents(created.case_id)).resolves.toMatchObject([
      { event_type: 'case_file_created' },
      {
        event_type: 'patch_status_updated',
        actor: 'operator@example.com',
        details: { status: 'approved_for_test' },
      },
    ]);
  });
});
