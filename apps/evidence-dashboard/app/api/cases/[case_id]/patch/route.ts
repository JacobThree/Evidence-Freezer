import { PatchStateSchema } from '@evidence-freezer/shared';
import { z } from 'zod';

const PatchActionBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve_for_test'),
  }).strict(),
  z.object({
    action: z.literal('set_status'),
    status: PatchStateSchema.exclude(['approved_for_test', 'proposed']),
  }).strict(),
]);

interface PatchRouteContext {
  params: {
    case_id: string;
  };
}

export async function POST(request: Request, context: PatchRouteContext): Promise<Response> {
  const watcherBaseUrl = process.env.EVIDENCE_WATCHER_BASE_URL ?? process.env.WATCHER_BASE_URL;
  if (!watcherBaseUrl) {
    return Response.json(
      { error: { code: 'WATCHER_NOT_CONFIGURED', message: 'Set EVIDENCE_WATCHER_BASE_URL to enable patch actions.' } },
      { status: 503 },
    );
  }

  const parsed = PatchActionBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'INVALID_PATCH_ACTION', message: 'Patch action must approve for test, reject, or mark false positive.' } },
      { status: 400 },
    );
  }

  const isApproval = parsed.data.action === 'approve_for_test';
  const watcherBody = parsed.data.action === 'approve_for_test' ? {} : { status: parsed.data.status };
  const watcherUrl = new URL(
    `/cases/${encodeURIComponent(context.params.case_id)}/patch/${isApproval ? 'approve-for-test' : 'status'}`,
    watcherBaseUrl,
  );
  const headers = new Headers({
    'content-type': 'application/json',
    'x-operator-email': process.env.EVIDENCE_DASHBOARD_OPERATOR_EMAIL ?? 'dashboard-operator',
  });
  if (process.env.WATCHER_OPERATOR_TOKEN) {
    headers.set('authorization', `Bearer ${process.env.WATCHER_OPERATOR_TOKEN}`);
  }

  const response = await fetch(watcherUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(watcherBody),
    cache: 'no-store',
  });

  const body = await response.json();
  return Response.json(body, { status: response.status });
}
