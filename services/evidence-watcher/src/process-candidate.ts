import { CaseFileSchema, type CaseFile } from '@evidence-freezer/shared';
import { z } from 'zod';
import { createCaseId } from './case-id.js';
import type { FirestoreCaseFileRepository } from './case-file-repository.js';
import type { AgentClient } from './agent-client.js';
import type { TracePollDecision, TraceSource } from './trace-poller.js';

export type ProcessCandidateResult =
  | { status: 'created'; case_file: CaseFile }
  | { status: 'invalid_agent_output'; case_id: string; issues: string[] }
  | { status: 'agent_error'; case_id: string; message: string };

export async function processCandidate(
  decision: Extract<TracePollDecision, { decision: 'selected' }>,
  dependencies: {
    traceSource: TraceSource;
    agentClient: AgentClient;
    repository: FirestoreCaseFileRepository;
  },
): Promise<ProcessCandidateResult> {
  const normalizedTrace = await dependencies.traceSource.getNormalizedTrace(decision.trace_id);
  const caseId = createCaseId({ projectId: decision.project_id, traceId: decision.trace_id });

  try {
    const agentOutput = await dependencies.agentClient.invoke({
      projectId: decision.project_id,
      projectName: decision.project_name,
      traceId: decision.trace_id,
      sessionId: decision.session_id,
      normalizedTrace,
      detectorResults: decision.detector_results,
    });
    const enrichedOutput = {
      ...(isRecord(agentOutput) ? agentOutput : {}),
      project_id: decision.project_id,
      trace_id: decision.trace_id,
      ...(decision.session_id ? { session_id: decision.session_id } : {}),
      detectors: isRecord(agentOutput) && Array.isArray(agentOutput.detectors) && agentOutput.detectors.length > 0
        ? agentOutput.detectors
        : decision.detector_results,
    };
    const parsed = CaseFileSchema.safeParse(enrichedOutput);

    if (!parsed.success) {
      const issues = parsed.error.issues.map(formatIssue);
      await dependencies.repository.recordAuditEvent(caseId, {
        event_type: 'agent_output_invalid',
        actor: 'evidence-watcher',
        occurred_at: new Date().toISOString(),
        details: {
          project_id: decision.project_id,
          trace_id: decision.trace_id,
          session_id: decision.session_id,
          issues,
        },
      });
      return { status: 'invalid_agent_output', case_id: caseId, issues };
    }

    const caseFile = await dependencies.repository.create(parsed.data, {
      actor: 'evidence-watcher',
      auditDetails: {
        session_id: decision.session_id,
        dedupe_key: decision.dedupe_key,
        detector_count: decision.detector_results.length,
        detector_rule_ids: decision.detector_results.map((result) => result.rule_id),
      },
    });

    return { status: 'created', case_file: caseFile };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown analyst invocation error.';
    await dependencies.repository.recordAuditEvent(caseId, {
      event_type: 'agent_invocation_failed',
      actor: 'evidence-watcher',
      occurred_at: new Date().toISOString(),
      details: {
        project_id: decision.project_id,
        trace_id: decision.trace_id,
        session_id: decision.session_id,
        message,
      },
    });
    return { status: 'agent_error', case_id: caseId, message };
  }
}

function formatIssue(issue: z.ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
  return `${path}: ${issue.message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
