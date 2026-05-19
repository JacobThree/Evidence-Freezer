import { failureClass, logEvent, PatchStateSchema } from '@evidence-freezer/shared';
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
  const requestId = request.headers.get('x-request-id') ?? undefined;
  const startedAt = Date.now();
  const watcherBaseUrl = process.env.EVIDENCE_WATCHER_BASE_URL ?? process.env.WATCHER_BASE_URL;
  if (!watcherBaseUrl) {
    logEvent('warn', {
      service: 'evidence-dashboard',
      event: 'patch.proxy.not_configured',
      request_id: requestId,
      case_id: context.params.case_id,
      failure_class: 'WATCHER_NOT_CONFIGURED',
    });
    return Response.json(
      { error: { code: 'WATCHER_NOT_CONFIGURED', message: 'Set EVIDENCE_WATCHER_BASE_URL to enable patch actions.' } },
      { status: 503 },
    );
  }

  const parsed = PatchActionBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    logEvent('warn', {
      service: 'evidence-dashboard',
      event: 'patch.proxy.invalid_request',
      request_id: requestId,
      case_id: context.params.case_id,
      failure_class: 'INVALID_PATCH_ACTION',
    });
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

  try {
    const response = await fetch(watcherUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(watcherBody),
      cache: 'no-store',
    });

    const body = await response.json();
    logEvent(response.ok ? 'info' : 'warn', {
      service: 'evidence-dashboard',
      event: 'patch.proxy.completed',
      request_id: requestId,
      case_id: context.params.case_id,
      action: parsed.data.action,
      status_code: response.status,
      failure_class: response.ok ? undefined : 'WATCHER_PATCH_ACTION_FAILED',
      duration_ms: Date.now() - startedAt,
    });
    return Response.json(body, { status: response.status });
  } catch (error) {
    logEvent('error', {
      service: 'evidence-dashboard',
      event: 'patch.proxy.failed',
      request_id: requestId,
      case_id: context.params.case_id,
      action: parsed.data.action,
      failure_class: failureClass(error),
      message: error instanceof Error ? error.message : 'Patch proxy failed.',
      duration_ms: Date.now() - startedAt,
    });
    return Response.json(
      { error: { code: 'WATCHER_REQUEST_FAILED', message: 'Patch action request to watcher failed.' } },
      { status: 502 },
    );
  }
}
