import type {
  DetectorRule,
  DetectorRuleResult,
  DetectorSeverity,
  NormalizedEvidenceItem,
  NormalizedEvidenceType,
  NormalizedTraceForDetection,
} from './types.js';

const EVIDENCE_VALUE_LIMIT = 2_000;
const MIN_RAG_OVERLAP_TOKENS = 3;

type RuleDefinition = {
  ruleId: string;
  label: string;
  severity: DetectorSeverity;
  evidenceTypes: readonly NormalizedEvidenceType[];
  patterns: readonly RegExp[];
  reason: string;
};

const patternRules: RuleDefinition[] = [
  {
    ruleId: 'instruction_shadowing',
    label: 'instruction_shadowing',
    severity: 'high',
    evidenceTypes: ['prompt', 'retrieved_document', 'tool_output'],
    patterns: [
      /\bignore\s+(all\s+)?(previous|prior|earlier|system|developer)\s+instructions?\b/i,
      /\bdisregard\s+(all\s+)?(previous|prior|earlier|system|developer)\s+instructions?\b/i,
      /\boverride\s+(the\s+)?(system|developer|safety)\s+(prompt|instructions?|policy)\b/i,
      /\bnew\s+(system|developer)\s+instructions?\b/i,
    ],
    reason: 'Normalized evidence contains instructions that attempt to override higher-priority instructions.',
  },
  {
    ruleId: 'system_prompt_extraction',
    label: 'system_prompt_extraction',
    severity: 'high',
    evidenceTypes: ['prompt', 'response', 'retrieved_document'],
    patterns: [
      /\b(reveal|show|print|dump|exfiltrate|leak)\s+(the\s+)?(system|developer)\s+(prompt|instructions?)\b/i,
      /\b(reveal|show|print|dump|exfiltrate|leak)\s+(the\s+)?hidden\s+(system|developer)\s+(prompt|instructions?)\b/i,
      /\bwhat\s+(is|are)\s+(your\s+)?(hidden|system|developer)\s+(prompt|instructions?)\b/i,
      /\b(system|developer)\s+(prompt|instructions?)\s*[:=]/i,
    ],
    reason: 'Normalized evidence indicates an attempt to extract hidden system or developer instructions.',
  },
  {
    ruleId: 'tool_manipulation',
    label: 'tool_manipulation',
    severity: 'high',
    evidenceTypes: ['prompt', 'tool_input', 'tool_output', 'retrieved_document'],
    patterns: [
      /\b(auth[-_\s]?bypass|bypass\s+auth|disable\s+authorization|skip\s+permission)\b/i,
      /\b(call|use|invoke)\s+.*\b(admin|internal|debug)\s+(tool|function|endpoint)\b/i,
      /\b(customerId|accountId|userId)"?\s*:\s*"(admin|root|all|\*)"/i,
      /\b(read|fetch|export)\s+internal\s+policy\b/i,
    ],
    reason: 'Normalized evidence contains tool or parameter manipulation language.',
  },
  {
    ruleId: 'admin_secret_intent',
    label: 'admin_secret_intent',
    severity: 'medium',
    evidenceTypes: ['prompt', 'tool_input', 'retrieved_document'],
    patterns: [
      /\b(api[_\s-]?key|secret|password|private[_\s-]?key|token|env(?:ironment)?\s+var)\b/i,
      /\b(admin|root|superuser)\s+(access|account|credential|token|session)\b/i,
      /\b(fetch|export|dump|read)\s+(customer|user|employee)\s+(record|pii|ssn|data)\b/i,
    ],
    reason: 'Normalized evidence requests administrative access, secrets, credentials, or sensitive records.',
  },
];

export const detectorRules: DetectorRule[] = [
  ...patternRules.map((definition) => ({
    ruleId: definition.ruleId,
    label: definition.label,
    evaluate: (trace: NormalizedTraceForDetection) => evaluatePatternRule(trace, definition),
  })),
  {
    ruleId: 'unsupported_rag_answer',
    label: 'unsupported_rag_answer',
    evaluate: evaluateUnsupportedRagAnswer,
  },
];

export function detectSuspiciousTrace(trace: NormalizedTraceForDetection): DetectorRuleResult[] {
  return detectorRules.flatMap((rule) => {
    const result = rule.evaluate(trace);
    return result ? [result] : [];
  });
}

function evaluatePatternRule(
  trace: NormalizedTraceForDetection,
  definition: RuleDefinition,
): DetectorRuleResult | undefined {
  const matches = trace.evidence.filter(
    (item) =>
      definition.evidenceTypes.includes(item.type) &&
      definition.patterns.some((pattern) => pattern.test(boundedValue(item))),
  );

  if (matches.length === 0) {
    return undefined;
  }

  return result(definition.ruleId, definition.label, definition.severity, definition.reason, matches);
}

function evaluateUnsupportedRagAnswer(trace: NormalizedTraceForDetection): DetectorRuleResult | undefined {
  const retrieved = trace.evidence.filter((item) => item.type === 'retrieved_document');
  const responses = trace.evidence.filter((item) => item.type === 'response');

  if (retrieved.length === 0 || responses.length === 0) {
    return undefined;
  }

  const retrievalTokens = new Set(retrieved.flatMap((item) => meaningfulTokens(boundedValue(item))));
  const unsupportedResponses = responses.filter((item) => {
    const responseTokens = meaningfulTokens(boundedValue(item));
    if (responseTokens.length < 8) {
      return false;
    }

    const overlapCount = responseTokens.filter((token) => retrievalTokens.has(token)).length;
    return overlapCount < MIN_RAG_OVERLAP_TOKENS && hasUnsupportedClaimShape(boundedValue(item));
  });

  if (unsupportedResponses.length === 0) {
    return undefined;
  }

  return result(
    'unsupported_rag_answer',
    'unsupported_rag_answer',
    'medium',
    'Model response makes a specific answer with little support from normalized retrieved-document evidence.',
    [...retrieved, ...unsupportedResponses],
  );
}

function result(
  ruleId: string,
  label: string,
  severity: DetectorSeverity,
  reason: string,
  matches: NormalizedEvidenceItem[],
): DetectorRuleResult {
  return {
    rule_id: ruleId,
    label,
    severity,
    reason,
    span_ids: unique(matches.map((item) => item.spanId)),
  };
}

function boundedValue(item: NormalizedEvidenceItem): string {
  return item.value.slice(0, EVIDENCE_VALUE_LIMIT);
}

function meaningfulTokens(value: string): string[] {
  return value
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g)
    ?.filter((token) => !STOP_WORDS.has(token)) ?? [];
}

function hasUnsupportedClaimShape(value: string): boolean {
  return /\b(is|are|was|were|will|must|requires?|guarantees?|provides?|founded|ceo|cfo|policy|refund|approval)\b/i.test(
    value,
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'any',
  'are',
  'because',
  'been',
  'but',
  'can',
  'for',
  'from',
  'has',
  'have',
  'into',
  'not',
  'the',
  'their',
  'then',
  'there',
  'this',
  'that',
  'with',
  'you',
  'your',
]);
