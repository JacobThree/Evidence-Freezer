import React from 'react';
import type { PatchReplayRecord } from '../lib/case-files';

export function ReplayResult({ replay }: { replay?: PatchReplayRecord | null }) {
  if (!replay) {
    return (
      <div className="state-block state-block--compact">
        <strong>No replay result recorded.</strong>
        <span>Approving a patch for test runs the original attack against the patched prompt.</span>
      </div>
    );
  }

  return (
    <div className="replay-result" aria-label="Patch replay result">
      <div className="replay-result__summary">
        <span className={`replay-result__status ${replay.passed ? 'replay-result__status--passed' : 'replay-result__status--failed'}`}>
          {replay.passed ? 'Passed' : 'Failed'}
        </span>
        <span>{formatDateTime(replay.occurred_at)}</span>
        <span>{replay.actor}</span>
      </div>
      <p>{replay.reason}</p>
      <div className="replay-result__outputs">
        <ReplayOutput label="Before patch" value={replay.before_output} />
        <ReplayOutput label="After patch" value={replay.after_output} />
      </div>
      <a className="target-link" href={replay.target_url}>Replay target</a>
    </div>
  );
}

function ReplayOutput({ label, value }: { label: string; value: string }) {
  return (
    <article className="replay-output">
      <h3>{label}</h3>
      <pre>{value}</pre>
    </article>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}
