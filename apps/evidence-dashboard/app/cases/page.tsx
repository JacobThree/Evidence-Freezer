import { CaseTable } from '@/components/CaseTable';
import {
  filterCaseFiles,
  listCaseFiles,
  type CaseFilters,
} from '@/lib/case-files';

interface CasesPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

export default async function CasesPage({ searchParams = {} }: CasesPageProps) {
  const filters = readFilters(searchParams);
  const cases = filterCaseFiles(await listCaseFiles(), filters);

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Evidence Freezer</p>
          <h1>Case files</h1>
        </div>
        <div className="mode-pill">Demo local mode</div>
      </header>

      <section className="metric-strip" aria-label="Case inventory summary">
        <Metric label="Open cases" value={String(cases.length)} />
        <Metric
          label="Critical"
          value={String(cases.filter((caseFile) => caseFile.severity === 'critical').length)}
        />
        <Metric
          label="Patch proposals"
          value={String(cases.filter((caseFile) => caseFile.prompt_patch?.status === 'proposed').length)}
        />
      </section>

      <section className="case-panel">
        <form className="filter-bar" action="/cases">
          <label>
            Severity
            <select name="severity" defaultValue={filters.severity ?? 'all'}>
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={filters.status ?? 'all'}>
              <option value="all">All statuses</option>
              <option value="proposed">Proposed</option>
              <option value="approved_for_test">Approved for test</option>
              <option value="rejected">Rejected</option>
              <option value="false_positive">False positive</option>
              <option value="no_patch">No patch</option>
            </select>
          </label>
          <label>
            Incident type
            <select name="incident_type" defaultValue={filters.incident_type ?? 'all'}>
              <option value="all">All incident types</option>
              <option value="prompt_injection">Prompt injection</option>
              <option value="rag_injection">RAG injection</option>
              <option value="tool_manipulation">Tool manipulation</option>
              <option value="hallucination">Hallucination</option>
              <option value="benign">Benign</option>
              <option value="inconclusive">Inconclusive</option>
            </select>
          </label>
          <button type="submit">Apply</button>
          <a className="clear-link" href="/cases">Clear</a>
        </form>

        <CaseTable cases={cases} />
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

function readFilters(searchParams: Record<string, string | string[] | undefined>): CaseFilters {
  return {
    severity: readFilter(searchParams.severity),
    status: readFilter(searchParams.status),
    incident_type: readFilter(searchParams.incident_type),
  };
}

function readFilter(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && candidate !== 'all' ? candidate : undefined;
}
