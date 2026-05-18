import React from 'react';
import type { PromptPatch } from '@evidence-freezer/shared';

export function PatchDiff({ patch }: { patch?: PromptPatch }) {
  if (!patch) {
    return (
      <div className="state-block state-block--compact">
        <strong>No prompt patch proposed.</strong>
        <span>This case can still be reviewed, but there is no remediation artifact to approve.</span>
      </div>
    );
  }

  return (
    <div className="patch-diff" aria-label="Prompt patch diff">
      <PromptBlock label="Base prompt" tone="removed" value={patch.original_prompt} />
      <PromptBlock label="Proposed prompt" tone="added" value={patch.proposed_prompt} />
    </div>
  );
}

function PromptBlock({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'removed' | 'added';
  value: string;
}) {
  return (
    <article className={`patch-diff__block patch-diff__block--${tone}`}>
      <h3>{label}</h3>
      <pre>{value}</pre>
    </article>
  );
}
