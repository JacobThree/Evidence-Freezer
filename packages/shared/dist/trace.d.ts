import { z } from 'zod';
export declare const TraceSpanSchema: z.ZodObject<{
    span_id: z.ZodString;
    name: z.ZodString;
    start_time: z.ZodString;
    end_time: z.ZodString;
    span_kind: z.ZodString;
    attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    events: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">>;
}, "strip", z.ZodTypeAny, {
    span_id: string;
    name: string;
    start_time: string;
    end_time: string;
    span_kind: string;
    attributes?: Record<string, any> | undefined;
    events?: Record<string, any>[] | undefined;
}, {
    span_id: string;
    name: string;
    start_time: string;
    end_time: string;
    span_kind: string;
    attributes?: Record<string, any> | undefined;
    events?: Record<string, any>[] | undefined;
}>;
export type TraceSpan = z.infer<typeof TraceSpanSchema>;
export declare const TraceSessionSchema: z.ZodObject<{
    session_id: z.ZodString;
    start_time: z.ZodString;
}, "strip", z.ZodTypeAny, {
    start_time: string;
    session_id: string;
}, {
    start_time: string;
    session_id: string;
}>;
export type TraceSession = z.infer<typeof TraceSessionSchema>;
export declare const TraceEvidenceSchema: z.ZodObject<{
    trace_id: z.ZodString;
    session_id: z.ZodOptional<z.ZodString>;
    spans: z.ZodArray<z.ZodObject<{
        span_id: z.ZodString;
        name: z.ZodString;
        start_time: z.ZodString;
        end_time: z.ZodString;
        span_kind: z.ZodString;
        attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        events: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">>;
    }, "strip", z.ZodTypeAny, {
        span_id: string;
        name: string;
        start_time: string;
        end_time: string;
        span_kind: string;
        attributes?: Record<string, any> | undefined;
        events?: Record<string, any>[] | undefined;
    }, {
        span_id: string;
        name: string;
        start_time: string;
        end_time: string;
        span_kind: string;
        attributes?: Record<string, any> | undefined;
        events?: Record<string, any>[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    trace_id: string;
    spans: {
        span_id: string;
        name: string;
        start_time: string;
        end_time: string;
        span_kind: string;
        attributes?: Record<string, any> | undefined;
        events?: Record<string, any>[] | undefined;
    }[];
    session_id?: string | undefined;
}, {
    trace_id: string;
    spans: {
        span_id: string;
        name: string;
        start_time: string;
        end_time: string;
        span_kind: string;
        attributes?: Record<string, any> | undefined;
        events?: Record<string, any>[] | undefined;
    }[];
    session_id?: string | undefined;
}>;
export type TraceEvidence = z.infer<typeof TraceEvidenceSchema>;
