import React from 'react';
import type { DetectorResult } from '@evidence-freezer/shared';
import { formatLabel } from '../lib/case-files';

export function DetectorResults({ detectors }: { detectors: DetectorResult[] }) {
  if (detectors.length === 0) {
    return (
      <div className="state-block">
        <strong>No detector results recorded.</strong>
        <span>The case was created without rule-level findings.</span>
      </div>
    );
  }

  return (
    <div className="detector-list">
      {detectors.map((detector) => (
        <article className="detector-result" key={detector.rule_id}>
          <div className="detector-result__header">
            <div>
              <h3>{detector.label}</h3>
              <code>{detector.rule_id}</code>
            </div>
            <span className={`badge badge--${detector.severity}`}>{formatLabel(detector.severity)}</span>
          </div>
          <p>{detector.reason}</p>
          {detector.span_ids?.length ? (
            <div className="span-list" aria-label={`${detector.label} related spans`}>
              {detector.span_ids.map((spanId) => (
                <code key={spanId}>{spanId}</code>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
