import { z } from 'zod';
export const EvidencePairSchema = z.object({
    user_prompt: z.string(),
    model_response: z.string(),
});
export const DetectorResultSchema = z.object({
    rule_id: z.string(),
    label: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    reason: z.string(),
    span_ids: z.array(z.string()).optional(),
});
export const TimelineEventSchema = z.object({
    timestamp: z.string(),
    event_type: z.string(),
    description: z.string(),
    span_id: z.string().optional(),
});
export const PatchStateSchema = z.enum([
    'proposed',
    'approved_for_test',
    'rejected',
    'false_positive'
]);
export const PromptPatchSchema = z.object({
    original_prompt: z.string(),
    proposed_prompt: z.string(),
    status: PatchStateSchema,
});
export const CaseFileSchema = z.object({
    case_id: z.string(),
    project_id: z.string(),
    trace_id: z.string(),
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
});
