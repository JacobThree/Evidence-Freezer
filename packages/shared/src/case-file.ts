import { z } from 'zod';

export const EvidencePairSchema = z.object({
  user_prompt: z.string(),
  model_response: z.string(),
}).strict();

export type EvidencePair = z.infer<typeof EvidencePairSchema>;

export const DetectorResultSchema = z.object({
  rule_id: z.string(),
  label: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  reason: z.string(),
  span_ids: z.array(z.string()).optional(),
}).strict();

export type DetectorResult = z.infer<typeof DetectorResultSchema>;

export const TimelineEventSchema = z.object({
  timestamp: z.string(),
  event_type: z.string(),
  description: z.string(),
  span_id: z.string().optional(),
}).strict();

export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const PatchStateSchema = z.enum([
  'proposed',
  'approved_for_test',
  'rejected',
  'false_positive'
]);

export type PatchState = z.infer<typeof PatchStateSchema>;

export const PromptPatchSchema = z.object({
  original_prompt: z.string(),
  proposed_prompt: z.string(),
  status: PatchStateSchema,
}).strict();

export type PromptPatch = z.infer<typeof PromptPatchSchema>;

export const CaseFileSchema = z.object({
  case_id: z.string(),
  project_id: z.string(),
  trace_id: z.string(),
  session_id: z.string().optional(),
  incident_type: z.enum([
    'prompt_injection',
    'rag_injection',
    'tool_manipulation',
    'hallucination',
    'benign',
    'inconclusive'
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  detected_at: z.string(),
  evidence_pair: EvidencePairSchema,
  detectors: z.array(DetectorResultSchema),
  timeline: z.array(TimelineEventSchema),
  root_cause: z.string(),
  prompt_patch: PromptPatchSchema.optional(),
}).strict();

export type CaseFile = z.infer<typeof CaseFileSchema>;
