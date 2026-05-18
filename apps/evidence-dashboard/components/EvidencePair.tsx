import React from 'react';
import type { EvidencePair as EvidencePairData } from '@evidence-freezer/shared';

export function EvidencePair({ evidence }: { evidence: EvidencePairData }) {
  return (
    <div className="evidence-pair" aria-label="Captured evidence pair">
      <EvidenceBlock label="Attacker prompt" value={evidence.user_prompt} />
      <EvidenceBlock label="Model response" value={evidence.model_response} />
    </div>
  );
}

function EvidenceBlock({ label, value }: { label: string; value: string }) {
  return (
    <section className="evidence-block">
      <h3>{label}</h3>
      <pre>{value}</pre>
    </section>
  );
}
