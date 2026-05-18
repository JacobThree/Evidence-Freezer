import { describe, expect, it } from 'vitest';
import {
  caseStatus,
  filterCaseFiles,
  formatDateTime,
  listFixtureCaseFiles,
} from '../lib/case-files';

describe('case file data access', () => {
  it('loads valid shared fixtures sorted by detection time', async () => {
    const cases = await listFixtureCaseFiles();

    expect(cases.length).toBeGreaterThanOrEqual(3);
    expect(cases[0]?.detected_at >= cases[1]?.detected_at).toBe(true);
    expect(cases.map((caseFile) => caseFile.case_id)).toContain('case-trace_seed_prompt_injection');
  });

  it('filters cases by severity, status, and incident type', async () => {
    const cases = await listFixtureCaseFiles();
    const filtered = filterCaseFiles(cases, {
      severity: 'medium',
      status: 'proposed',
      incident_type: 'hallucination',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.trace_id).toBe('trace_seed_hallucination');
  });

  it('derives no_patch status for cases without a prompt patch', async () => {
    const cases = await listFixtureCaseFiles();
    const benign = cases.find((caseFile) => caseFile.incident_type === 'benign');

    expect(benign).toBeDefined();
    expect(caseStatus(benign!)).toBe('no_patch');
    expect(formatDateTime(benign!.detected_at)).toContain('2026');
  });
});
