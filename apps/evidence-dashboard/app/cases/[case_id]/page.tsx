import React from 'react';
import { notFound } from 'next/navigation';
import { ApprovalControls } from '@/components/ApprovalControls';
import { AttackTimeline } from '@/components/AttackTimeline';
import { DetectorResults } from '@/components/DetectorResults';
import { EvidencePair } from '@/components/EvidencePair';
import { PatchDiff } from '@/components/PatchDiff';
import {
  caseStatus,
  formatDateTime,
  formatLabel,
  getCaseFile,
  listPatchReplays,
  phoenixSessionUrl,
  phoenixTraceUrl,
} from '@/lib/case-files';

interface CaseDetailPageProps {
  params: {
    case_id: string;
  };
}

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const caseFile = await getCaseFile(params.case_id);

  if (!caseFile) {
    notFound();
  }

  const sessionUrl = phoenixSessionUrl(caseFile);
  const patchReplays = await listPatchReplays(caseFile.case_id);
  const latestReplay = patchReplays[0] ?? null;

  return (
    <main className="page-shell">
      <header className="topbar detail-topbar">
        <div>
          <p className="eyebrow">Case File</p>
          <h1>{caseFile.case_id}</h1>
        </div>
        <a className="clear-link" href="/cases">Back to cases</a>
      </header>

      <section className="metric-strip" aria-label="Case summary">
        <Metric label="Severity" value={formatLabel(caseFile.severity)} />
        <Metric label="Incident" value={formatLabel(caseFile.incident_type)} />
        <Metric label="Status" value={formatLabel(caseStatus(caseFile))} />
      </section>

      <section className="detail-grid">
        <article className="detail-section detail-section--summary">
          <div className="section-heading">
            <p className="eyebrow">Summary</p>
            <h2>Root cause</h2>
          </div>
          <p className="root-cause">{caseFile.root_cause}</p>
          <dl className="metadata-grid">
            <Metadata label="Project" value={caseFile.project_id} />
            <Metadata label="Trace ID" value={caseFile.trace_id} />
            <Metadata label="Session ID" value={caseFile.session_id ?? 'Not recorded'} />
            <Metadata label="Detected" value={formatDateTime(caseFile.detected_at)} />
          </dl>
          <div className="raw-links" aria-label="Raw telemetry links">
            <a href={phoenixTraceUrl(caseFile)} target="_blank" rel="noreferrer">Open raw trace</a>
            {sessionUrl ? <a href={sessionUrl} target="_blank" rel="noreferrer">Open raw session</a> : null}
          </div>
        </article>

        <section className="detail-section">
          <div className="section-heading">
            <p className="eyebrow">Evidence Pair</p>
            <h2>Prompt and response</h2>
          </div>
          <EvidencePair evidence={caseFile.evidence_pair} />
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <p className="eyebrow">Timeline</p>
            <h2>Attack path</h2>
          </div>
          <AttackTimeline events={caseFile.timeline} />
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <p className="eyebrow">Detectors</p>
            <h2>Rule results</h2>
          </div>
          <DetectorResults detectors={caseFile.detectors} />
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <p className="eyebrow">Remediation</p>
            <h2>Prompt patch</h2>
          </div>
          <div className="patch-workflow">
            <PatchDiff patch={caseFile.prompt_patch} />
            <div className="regression-card">
              <h3>Regression prompt</h3>
              <pre>{caseFile.evidence_pair.user_prompt}</pre>
              <h3>Expected safe behavior</h3>
              <p>{caseFile.root_cause}</p>
            </div>
            <ApprovalControls
              caseId={caseFile.case_id}
              currentStatus={caseFile.prompt_patch?.status}
              latestReplay={latestReplay}
            />
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
