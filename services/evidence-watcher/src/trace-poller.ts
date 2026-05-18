import { z } from 'zod';
import { detectSuspiciousTrace } from './detectors/rules.js';
import type { DetectorRuleResult, NormalizedTraceForDetection } from './detectors/types.js';
import { MemoryTraceDedupeStore, type DedupeDecision, type TraceDedupeStore } from './dedupe.js';

export type TraceSummary = {
  traceId: string;
  sessionId?: string;
  projectName?: string;
  startTime?: string;
  endTime?: string;
  spanCount?: number;
  status?: string;
};

export type TraceSource = {
  listTraces(options: ListTracesOptions): Promise<TraceSummary[]>;
  getNormalizedTrace(traceId: string): Promise<NormalizedTraceForDetection>;
};

export type ListTracesOptions = {
  limit: number;
  projectName: string;
};

export type TracePollerOptions = {
  projectId: string;
  projectName?: string;
  pollingWindowMinutes: number;
  limit: number;
  dryRun: boolean;
  now?: Date;
};

export type TracePollDecision =
  | {
      trace_id: string;
      project_id: string;
      project_name?: string;
      session_id?: string;
      decision: 'selected';
      dry_run: boolean;
      dedupe_key: string;
      detector_results: DetectorRuleResult[];
    }
  | {
      trace_id: string;
      project_id: string;
      project_name?: string;
      session_id?: string;
      decision: 'skipped';
      reason: 'outside_polling_window' | 'no_detector_match' | DuplicateReason;
      dedupe_key?: string;
      detector_results?: DetectorRuleResult[];
    };

export type TracePollResult = {
  project_id: string;
  project_name: string;
  dry_run: boolean;
  polling_window_minutes: number;
  scanned_count: number;
  selected_count: number;
  decisions: TracePollDecision[];
};

export class TracePoller {
  constructor(
    private readonly traceSource: TraceSource,
    private readonly dedupeStore: TraceDedupeStore = new MemoryTraceDedupeStore(),
  ) {}

  async poll(options: TracePollerOptions): Promise<TracePollResult> {
    const projectName = options.projectName ?? options.projectId;
    const now = options.now ?? new Date();
    const windowStartMs = now.getTime() - options.pollingWindowMinutes * 60_000;
    const traces = await this.traceSource.listTraces({ limit: options.limit, projectName });
    const decisions: TracePollDecision[] = [];

    for (const trace of traces) {
      const projectId = options.projectId;
      const base = {
        trace_id: trace.traceId,
        project_id: projectId,
        project_name: trace.projectName,
        session_id: trace.sessionId,
      };

      if (isOutsideWindow(trace, windowStartMs)) {
        decisions.push({ ...base, decision: 'skipped', reason: 'outside_polling_window' });
        continue;
      }

      const normalizedTrace = await this.traceSource.getNormalizedTrace(trace.traceId);
      const detectorResults = detectSuspiciousTrace(normalizedTrace);
      if (detectorResults.length === 0) {
        decisions.push({
          ...base,
          decision: 'skipped',
          reason: 'no_detector_match',
          detector_results: detectorResults,
        });
        continue;
      }

      const dedupeInput = { projectId, traceId: trace.traceId };
      const dedupeDecision = options.dryRun
        ? await this.dedupeStore.check(dedupeInput)
        : await this.dedupeStore.reserve(dedupeInput, {
            detector_count: detectorResults.length,
            high_severity_count: detectorResults.filter((result) => result.severity === 'high').length,
          });

      if (dedupeDecision.duplicate) {
        decisions.push({
          ...base,
          decision: 'skipped',
          reason: dedupeDecision.reason,
          dedupe_key: dedupeDecision.dedupe_key,
          detector_results: detectorResults,
        });
        continue;
      }

      decisions.push({
        ...base,
        decision: 'selected',
        dry_run: options.dryRun,
        dedupe_key: dedupeDecision.dedupe_key,
        detector_results: detectorResults,
      });
    }

    return {
      project_id: options.projectId,
      project_name: projectName,
      dry_run: options.dryRun,
      polling_window_minutes: options.pollingWindowMinutes,
      scanned_count: traces.length,
      selected_count: decisions.filter((decision) => decision.decision === 'selected').length,
      decisions,
    };
  }
}

type DuplicateReason = Extract<DedupeDecision, { duplicate: true }>['reason'];

const EnvSchema = z.object({
  WATCHER_PROJECT_ID: z.string().min(1).optional(),
  GCP_PROJECT: z.string().min(1).optional(),
  GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
  PHOENIX_PROJECT_NAME: z.string().min(1).optional(),
  WATCHER_POLLING_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  WATCHER_TRACE_LIMIT: z.coerce.number().int().min(1).max(100).default(50),
});

export function pollerOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Pick<TracePollerOptions, 'dryRun' | 'pollingWindowMinutes' | 'projectId' | 'limit'>> = {},
): TracePollerOptions {
  const parsed = EnvSchema.parse(env);
  const projectId =
    overrides.projectId ?? parsed.WATCHER_PROJECT_ID ?? parsed.GCP_PROJECT ?? parsed.GOOGLE_CLOUD_PROJECT;

  if (!projectId) {
    throw new Error('WATCHER_PROJECT_ID, GCP_PROJECT, or GOOGLE_CLOUD_PROJECT must be set.');
  }

  return {
    projectId,
    projectName: parsed.PHOENIX_PROJECT_NAME ?? projectId,
    pollingWindowMinutes: overrides.pollingWindowMinutes ?? parsed.WATCHER_POLLING_WINDOW_MINUTES,
    limit: overrides.limit ?? parsed.WATCHER_TRACE_LIMIT,
    dryRun: overrides.dryRun ?? true,
  };
}

function isOutsideWindow(trace: TraceSummary, windowStartMs: number): boolean {
  const timestamp = Date.parse(trace.startTime ?? trace.endTime ?? '');
  return Number.isFinite(timestamp) && timestamp < windowStartMs;
}
