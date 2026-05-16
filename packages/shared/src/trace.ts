import { z } from 'zod';

export const TraceSpanSchema = z.object({
  span_id: z.string(),
  name: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  span_kind: z.string(),
  attributes: z.record(z.any()).optional(),
  events: z.array(z.record(z.any())).optional(),
});

export type TraceSpan = z.infer<typeof TraceSpanSchema>;

export const TraceSessionSchema = z.object({
  session_id: z.string(),
  start_time: z.string(),
});

export type TraceSession = z.infer<typeof TraceSessionSchema>;

export const TraceEvidenceSchema = z.object({
  trace_id: z.string(),
  session_id: z.string().optional(),
  spans: z.array(TraceSpanSchema),
});

export type TraceEvidence = z.infer<typeof TraceEvidenceSchema>;
