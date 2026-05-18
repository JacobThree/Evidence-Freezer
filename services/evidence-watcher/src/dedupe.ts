import { createCaseId } from './case-id.js';
import type { CollectionReferenceLike, DocumentReferenceLike, FirestoreLike } from './case-file-repository.js';

export type DedupeDecision =
  | { duplicate: false; dedupe_key: string }
  | { duplicate: true; dedupe_key: string; reason: 'case_exists' | 'already_selected' };

export type TraceDedupeStore = {
  check(input: TraceDedupeInput): Promise<DedupeDecision>;
  reserve(input: TraceDedupeInput, details?: Record<string, unknown>): Promise<DedupeDecision>;
};

export type TraceDedupeInput = {
  projectId: string;
  traceId: string;
};

export class MemoryTraceDedupeStore implements TraceDedupeStore {
  private readonly selected = new Set<string>();
  private readonly existingCases = new Set<string>();

  constructor(existingCases: TraceDedupeInput[] = []) {
    for (const input of existingCases) {
      this.existingCases.add(traceDedupeKey(input));
    }
  }

  async check(input: TraceDedupeInput): Promise<DedupeDecision> {
    const dedupe_key = traceDedupeKey(input);
    if (this.existingCases.has(dedupe_key)) {
      return { duplicate: true, dedupe_key, reason: 'case_exists' };
    }
    if (this.selected.has(dedupe_key)) {
      return { duplicate: true, dedupe_key, reason: 'already_selected' };
    }

    return { duplicate: false, dedupe_key };
  }

  async reserve(input: TraceDedupeInput): Promise<DedupeDecision> {
    const decision = await this.check(input);
    if (decision.duplicate) {
      return decision;
    }

    this.selected.add(decision.dedupe_key);
    return decision;
  }
}

export class FirestoreTraceDedupeStore implements TraceDedupeStore {
  constructor(private readonly firestore: FirestoreLike) {}

  async check(input: TraceDedupeInput): Promise<DedupeDecision> {
    const dedupe_key = traceDedupeKey(input);
    const caseSnapshot = await this.firestore.collection('case_files').doc(dedupe_key).get();
    if (caseSnapshot.exists) {
      return { duplicate: true, dedupe_key, reason: 'case_exists' };
    }

    const selectedSnapshot = await this.dedupeRef(dedupe_key).get();
    if (selectedSnapshot.exists) {
      return { duplicate: true, dedupe_key, reason: 'already_selected' };
    }

    return { duplicate: false, dedupe_key };
  }

  async reserve(input: TraceDedupeInput, details: Record<string, unknown> = {}): Promise<DedupeDecision> {
    const decision = await this.check(input);
    if (decision.duplicate) {
      return decision;
    }

    await this.dedupeRef(decision.dedupe_key).set({
      dedupe_key: decision.dedupe_key,
      project_id: input.projectId,
      trace_id: input.traceId,
      selected_at: new Date().toISOString(),
      status: 'selected_for_investigation',
      ...details,
    });

    return decision;
  }

  private dedupeRef(dedupeKey: string): DocumentReferenceLike {
    return this.dedupeCollection().doc(dedupeKey);
  }

  private dedupeCollection(): CollectionReferenceLike {
    return this.firestore.collection('watcher_trace_dedupe');
  }
}

export function traceDedupeKey(input: TraceDedupeInput): string {
  return createCaseId({ projectId: input.projectId, traceId: input.traceId });
}
