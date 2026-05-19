import { PatchStateSchema, type CaseFile, type PatchState } from '@evidence-freezer/shared/src/case-file.ts';
import type { FirestoreCaseFileRepository, PatchReplayRecord } from './case-file-repository.js';
import type { ReplayClient } from './replay-client.js';

export interface OperatorContext {
  actor: string;
}

export type PatchActionResult =
  | { status: 'updated'; case_file: CaseFile }
  | { status: 'replayed'; case_file: CaseFile; replay: PatchReplayRecord };

export interface PatchActionDependencies {
  repository: FirestoreCaseFileRepository;
  replayClient: ReplayClient;
  targetBaseUrl: string;
}

export async function updatePatchStatus(
  caseId: string,
  statusInput: unknown,
  operator: OperatorContext,
  dependencies: Pick<PatchActionDependencies, 'repository'>,
): Promise<PatchActionResult> {
  const status = PatchStateSchema.parse(statusInput);
  const caseFile = await dependencies.repository.updatePatchStatus(caseId, status, {
    actor: operator.actor,
  });

  return { status: 'updated', case_file: caseFile };
}

export async function approvePatchForTest(
  caseId: string,
  operator: OperatorContext,
  dependencies: PatchActionDependencies,
): Promise<PatchActionResult> {
  const caseFile = await dependencies.repository.updatePatchStatus(caseId, 'approved_for_test', {
    actor: operator.actor,
    details: { replay_requested: true },
  });

  const replayResult = await dependencies.replayClient.replay({
    caseFile,
    targetBaseUrl: dependencies.targetBaseUrl,
  });
  const replay = await dependencies.repository.recordPatchReplay(caseId, {
    actor: operator.actor,
    occurred_at: new Date().toISOString(),
    target_url: replayResult.target_url,
    before_output: replayResult.before_output,
    after_output: replayResult.after_output,
    passed: replayResult.passed,
    reason: replayResult.reason,
  });

  return { status: 'replayed', case_file: caseFile, replay };
}

export function parsePatchStatusBody(body: unknown): PatchState {
  if (isRecord(body)) {
    return PatchStateSchema.parse(body.status);
  }

  return PatchStateSchema.parse(undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
