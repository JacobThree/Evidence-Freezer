import React from 'react';
import type { CaseFile } from '@evidence-freezer/shared';
import { caseStatus, formatDateTime, formatLabel } from '../lib/case-files';

export function CaseTable({ cases }: { cases: CaseFile[] }) {
  if (cases.length === 0) {
    return (
      <div className="state-block">
        <strong>No case files match the current filters.</strong>
        <span>Clear the filters or seed the local fixture set.</span>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="case-table">
        <thead>
          <tr>
            <th scope="col">Case</th>
            <th scope="col">Severity</th>
            <th scope="col">Incident</th>
            <th scope="col">Status</th>
            <th scope="col">Project</th>
            <th scope="col">Trace ID</th>
            <th scope="col">Detected</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((caseFile) => (
            <tr key={caseFile.case_id}>
              <td data-label="Case">
                <a className="case-link" href={`/cases/${caseFile.case_id}`}>
                  {caseFile.case_id}
                </a>
              </td>
              <td data-label="Severity">
                <span className={`badge badge--${caseFile.severity}`}>
                  {formatLabel(caseFile.severity)}
                </span>
              </td>
              <td data-label="Incident">{formatLabel(caseFile.incident_type)}</td>
              <td data-label="Status">
                <span className="status-token">{formatLabel(caseStatus(caseFile))}</span>
              </td>
              <td data-label="Project">{caseFile.project_id}</td>
              <td data-label="Trace ID">
                <code>{caseFile.trace_id}</code>
              </td>
              <td data-label="Detected">{formatDateTime(caseFile.detected_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
