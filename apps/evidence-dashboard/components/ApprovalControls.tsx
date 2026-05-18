'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PatchState } from '@evidence-freezer/shared';
import type { PatchReplayRecord } from '../lib/case-files';
import { ReplayResult } from './ReplayResult';

interface ApprovalControlsProps {
  caseId: string;
  currentStatus?: PatchState;
  latestReplay?: PatchReplayRecord | null;
}

type ActionState = {
  message?: string;
  error?: string;
  replay?: PatchReplayRecord | null;
};

export function ApprovalControls({ caseId, currentStatus, latestReplay }: ApprovalControlsProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [state, setState] = useState<ActionState>({ replay: latestReplay });

  if (!currentStatus) {
    return (
      <div className="approval-panel">
        <div className="state-block state-block--compact">
          <strong>Patch controls unavailable.</strong>
          <span>This case does not include a proposed prompt patch.</span>
        </div>
        <ReplayResult replay={state.replay} />
      </div>
    );
  }

  async function submit(action: 'approve_for_test' | 'set_status', status?: PatchState) {
    setState((previous) => ({ replay: previous.replay }));
    setIsPending(true);

    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/patch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, status }),
      });
      const body = await response.json();

      if (!response.ok) {
        setState((previous) => ({
          replay: previous.replay,
          error: body?.error?.message ?? 'Patch action failed.',
        }));
        return;
      }

      const message = action === 'approve_for_test'
        ? 'Approved for test and replayed.'
        : `Marked ${formatLabel(status ?? currentStatus ?? 'proposed')}.`;
      setState({
        message,
        replay: body.replay ?? state.replay ?? null,
      });
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="approval-panel">
      <div className="approval-panel__status" aria-live="polite">
        <span>Current status</span>
        <strong>{formatLabel(currentStatus)}</strong>
      </div>
      <div className="approval-actions" aria-label="Patch approval actions">
        <button
          type="button"
          className="approval-button approval-button--primary"
          disabled={isPending}
          onClick={() => submit('approve_for_test')}
        >
          Approve for test
        </button>
        <button
          type="button"
          className="approval-button"
          disabled={isPending}
          onClick={() => submit('set_status', 'rejected')}
        >
          Reject
        </button>
        <button
          type="button"
          className="approval-button"
          disabled={isPending}
          onClick={() => submit('set_status', 'false_positive')}
        >
          False positive
        </button>
      </div>
      {state.error ? <p className="action-message action-message--error">{state.error}</p> : null}
      {state.message ? <p className="action-message">{state.message}</p> : null}
      <ReplayResult replay={state.replay} />
    </div>
  );
}

function formatLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
