import type { DetectorResult } from '@evidence-freezer/shared/src/case-file.ts';

export type DetectorSeverity = DetectorResult['severity'];

export type NormalizedEvidenceType =
  | 'prompt'
  | 'response'
  | 'retrieved_document'
  | 'tool_input'
  | 'tool_output';

export type NormalizedEvidenceItem = {
  type: NormalizedEvidenceType;
  spanId: string;
  spanName: string;
  value: string;
  sourcePath: string;
};

export type NormalizedTimelineEvent = {
  spanId: string;
  parentSpanId?: string;
  name: string;
  spanKind?: string;
  startTime?: string;
  endTime?: string;
  attributes?: Record<string, unknown>;
};

export type NormalizedTraceForDetection = {
  traceId: string;
  sessionId?: string;
  projectName?: string;
  timeline?: NormalizedTimelineEvent[];
  evidence: NormalizedEvidenceItem[];
};

export type DetectorRuleResult = DetectorResult & {
  severity: DetectorSeverity;
  span_ids: string[];
};

export type DetectorRule = {
  ruleId: string;
  label: string;
  evaluate: (trace: NormalizedTraceForDetection) => DetectorRuleResult | undefined;
};
