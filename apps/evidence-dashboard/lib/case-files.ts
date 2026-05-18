import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { CaseFileSchema, type CaseFile } from '@evidence-freezer/shared';
import { z } from 'zod';

export type CaseStatus =
  | 'proposed'
  | 'approved_for_test'
  | 'rejected'
  | 'false_positive'
  | 'no_patch';

export interface CaseFilters {
  severity?: string;
  status?: string;
  incident_type?: string;
}

const FirestoreDocumentSchema = z.object({
  name: z.string(),
  fields: z.record(z.unknown()),
});

const FirestoreListResponseSchema = z.object({
  documents: z.array(FirestoreDocumentSchema).optional(),
});

export async function listCaseFiles(): Promise<CaseFile[]> {
  if (process.env.EVIDENCE_DASHBOARD_CASE_SOURCE === 'firestore') {
    return listFirestoreCaseFiles();
  }

  return listFixtureCaseFiles();
}

export async function getCaseFile(caseId: string): Promise<CaseFile | undefined> {
  const cases = await listCaseFiles();
  return cases.find((caseFile) => caseFile.case_id === caseId);
}

export async function listFixtureCaseFiles(): Promise<CaseFile[]> {
  const fixturesDir = path.join(findWorkspaceRoot(), 'packages/shared/fixtures');
  const files = await readdir(fixturesDir);
  const cases = await Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map(async (file) => {
        const raw = await readFile(path.join(fixturesDir, file), 'utf8');
        return CaseFileSchema.safeParse(JSON.parse(raw));
      }),
  );

  return cases
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort(sortNewestFirst);
}

export function filterCaseFiles(cases: CaseFile[], filters: CaseFilters): CaseFile[] {
  return cases.filter((caseFile) => {
    if (filters.severity && caseFile.severity !== filters.severity) {
      return false;
    }
    if (filters.status && caseStatus(caseFile) !== filters.status) {
      return false;
    }
    if (filters.incident_type && caseFile.incident_type !== filters.incident_type) {
      return false;
    }
    return true;
  });
}

export function caseStatus(caseFile: CaseFile): CaseStatus {
  return caseFile.prompt_patch?.status ?? 'no_patch';
}

export function formatLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function phoenixTraceUrl(caseFile: CaseFile): string {
  return phoenixUrl(`/projects/${caseFile.project_id}/traces/${caseFile.trace_id}`);
}

export function phoenixSessionUrl(caseFile: CaseFile): string | undefined {
  if (!caseFile.session_id) {
    return undefined;
  }
  return phoenixUrl(`/projects/${caseFile.project_id}/sessions/${caseFile.session_id}`);
}

async function listFirestoreCaseFiles(): Promise<CaseFile[]> {
  const projectId = requiredEnv('FIRESTORE_PROJECT_ID');
  const databaseId = process.env.FIRESTORE_DATABASE_ID ?? '(default)';
  const token = await firestoreAccessToken();
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/case_files`,
  );

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Firestore case file request failed with ${response.status}.`);
  }

  const parsed = FirestoreListResponseSchema.parse(await response.json());
  return (parsed.documents ?? [])
    .map((document) => CaseFileSchema.parse(decodeFirestoreValue({ mapValue: { fields: document.fields } })))
    .sort(sortNewestFirst);
}

async function firestoreAccessToken(): Promise<string> {
  if (process.env.FIRESTORE_BEARER_TOKEN) {
    return process.env.FIRESTORE_BEARER_TOKEN;
  }

  const response = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    {
      headers: { 'Metadata-Flavor': 'Google' },
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    throw new Error('Firestore access token is unavailable. Set FIRESTORE_BEARER_TOKEN locally.');
  }
  const body = z.object({ access_token: z.string() }).parse(await response.json());
  return body.access_token;
}

function decodeFirestoreValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  if ('stringValue' in record) return record.stringValue;
  if ('integerValue' in record) return Number(record.integerValue);
  if ('doubleValue' in record) return Number(record.doubleValue);
  if ('booleanValue' in record) return record.booleanValue;
  if ('timestampValue' in record) return record.timestampValue;
  if ('nullValue' in record) return null;
  if ('arrayValue' in record) {
    const values = (record.arrayValue as { values?: unknown[] }).values ?? [];
    return values.map(decodeFirestoreValue);
  }
  if ('mapValue' in record) {
    const fields = (record.mapValue as { fields?: Record<string, unknown> }).fields ?? {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, nested]) => [key, decodeFirestoreValue(nested)]),
    );
  }
  return value;
}

function sortNewestFirst(left: CaseFile, right: CaseFile): number {
  return right.detected_at.localeCompare(left.detected_at);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when EVIDENCE_DASHBOARD_CASE_SOURCE=firestore.`);
  }
  return value;
}

function phoenixUrl(pathname: string): string {
  const baseUrl = (process.env.PHOENIX_HOST ?? 'http://localhost:6006').replace(/\/$/, '');
  return `${baseUrl}${pathname}`;
}

function findWorkspaceRoot(): string {
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    const packagePath = path.join(current, 'package.json');
    if (existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(require('node:fs').readFileSync(packagePath, 'utf8')) as { name?: string };
        if (pkg.name === 'evidence-freezer') {
          return current;
        }
      } catch {
        // Keep walking if this package.json cannot be read.
      }
    }
    current = path.dirname(current);
  }
  return path.resolve(process.cwd(), '../..');
}
