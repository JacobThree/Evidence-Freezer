import { z } from 'zod';
export declare const EvidencePairSchema: z.ZodObject<{
    user_prompt: z.ZodString;
    model_response: z.ZodString;
}, "strip", z.ZodTypeAny, {
    user_prompt: string;
    model_response: string;
}, {
    user_prompt: string;
    model_response: string;
}>;
export type EvidencePair = z.infer<typeof EvidencePairSchema>;
export declare const DetectorResultSchema: z.ZodObject<{
    rule_id: z.ZodString;
    label: z.ZodString;
    severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
    reason: z.ZodString;
    span_ids: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    rule_id: string;
    label: string;
    severity: "low" | "medium" | "high" | "critical";
    reason: string;
    span_ids?: string[] | undefined;
}, {
    rule_id: string;
    label: string;
    severity: "low" | "medium" | "high" | "critical";
    reason: string;
    span_ids?: string[] | undefined;
}>;
export type DetectorResult = z.infer<typeof DetectorResultSchema>;
export declare const TimelineEventSchema: z.ZodObject<{
    timestamp: z.ZodString;
    event_type: z.ZodString;
    description: z.ZodString;
    span_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    timestamp: string;
    event_type: string;
    description: string;
    span_id?: string | undefined;
}, {
    timestamp: string;
    event_type: string;
    description: string;
    span_id?: string | undefined;
}>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export declare const PatchStateSchema: z.ZodEnum<["proposed", "approved_for_test", "rejected", "false_positive"]>;
export type PatchState = z.infer<typeof PatchStateSchema>;
export declare const PromptPatchSchema: z.ZodObject<{
    original_prompt: z.ZodString;
    proposed_prompt: z.ZodString;
    status: z.ZodEnum<["proposed", "approved_for_test", "rejected", "false_positive"]>;
}, "strip", z.ZodTypeAny, {
    status: "proposed" | "approved_for_test" | "rejected" | "false_positive";
    original_prompt: string;
    proposed_prompt: string;
}, {
    status: "proposed" | "approved_for_test" | "rejected" | "false_positive";
    original_prompt: string;
    proposed_prompt: string;
}>;
export type PromptPatch = z.infer<typeof PromptPatchSchema>;
export declare const CaseFileSchema: z.ZodObject<{
    case_id: z.ZodString;
    project_id: z.ZodString;
    trace_id: z.ZodString;
    incident_type: z.ZodEnum<["prompt_injection", "rag_injection", "tool_manipulation", "hallucination", "benign", "inconclusive"]>;
    severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
    detected_at: z.ZodString;
    evidence_pair: z.ZodObject<{
        user_prompt: z.ZodString;
        model_response: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        user_prompt: string;
        model_response: string;
    }, {
        user_prompt: string;
        model_response: string;
    }>;
    detectors: z.ZodArray<z.ZodObject<{
        rule_id: z.ZodString;
        label: z.ZodString;
        severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
        reason: z.ZodString;
        span_ids: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        rule_id: string;
        label: string;
        severity: "low" | "medium" | "high" | "critical";
        reason: string;
        span_ids?: string[] | undefined;
    }, {
        rule_id: string;
        label: string;
        severity: "low" | "medium" | "high" | "critical";
        reason: string;
        span_ids?: string[] | undefined;
    }>, "many">;
    timeline: z.ZodArray<z.ZodObject<{
        timestamp: z.ZodString;
        event_type: z.ZodString;
        description: z.ZodString;
        span_id: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        timestamp: string;
        event_type: string;
        description: string;
        span_id?: string | undefined;
    }, {
        timestamp: string;
        event_type: string;
        description: string;
        span_id?: string | undefined;
    }>, "many">;
    root_cause: z.ZodString;
    prompt_patch: z.ZodOptional<z.ZodObject<{
        original_prompt: z.ZodString;
        proposed_prompt: z.ZodString;
        status: z.ZodEnum<["proposed", "approved_for_test", "rejected", "false_positive"]>;
    }, "strip", z.ZodTypeAny, {
        status: "proposed" | "approved_for_test" | "rejected" | "false_positive";
        original_prompt: string;
        proposed_prompt: string;
    }, {
        status: "proposed" | "approved_for_test" | "rejected" | "false_positive";
        original_prompt: string;
        proposed_prompt: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    severity: "low" | "medium" | "high" | "critical";
    case_id: string;
    project_id: string;
    trace_id: string;
    incident_type: "prompt_injection" | "rag_injection" | "tool_manipulation" | "hallucination" | "benign" | "inconclusive";
    detected_at: string;
    evidence_pair: {
        user_prompt: string;
        model_response: string;
    };
    detectors: {
        rule_id: string;
        label: string;
        severity: "low" | "medium" | "high" | "critical";
        reason: string;
        span_ids?: string[] | undefined;
    }[];
    timeline: {
        timestamp: string;
        event_type: string;
        description: string;
        span_id?: string | undefined;
    }[];
    root_cause: string;
    prompt_patch?: {
        status: "proposed" | "approved_for_test" | "rejected" | "false_positive";
        original_prompt: string;
        proposed_prompt: string;
    } | undefined;
}, {
    severity: "low" | "medium" | "high" | "critical";
    case_id: string;
    project_id: string;
    trace_id: string;
    incident_type: "prompt_injection" | "rag_injection" | "tool_manipulation" | "hallucination" | "benign" | "inconclusive";
    detected_at: string;
    evidence_pair: {
        user_prompt: string;
        model_response: string;
    };
    detectors: {
        rule_id: string;
        label: string;
        severity: "low" | "medium" | "high" | "critical";
        reason: string;
        span_ids?: string[] | undefined;
    }[];
    timeline: {
        timestamp: string;
        event_type: string;
        description: string;
        span_id?: string | undefined;
    }[];
    root_cause: string;
    prompt_patch?: {
        status: "proposed" | "approved_for_test" | "rejected" | "false_positive";
        original_prompt: string;
        proposed_prompt: string;
    } | undefined;
}>;
export type CaseFile = z.infer<typeof CaseFileSchema>;
