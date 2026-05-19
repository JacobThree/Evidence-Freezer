import { z } from 'zod';
import type {
  CollectionReferenceLike,
  DocumentReferenceLike,
  DocumentSnapshotLike,
  FirestoreLike,
  QuerySnapshotLike,
} from './case-file-repository.js';

const TokenResponseSchema = z.object({
  access_token: z.string(),
});

const FirestoreDocumentSchema = z.object({
  name: z.string(),
  fields: z.record(z.unknown()).optional(),
});

const FirestoreListResponseSchema = z.object({
  documents: z.array(FirestoreDocumentSchema).optional(),
});

export interface FirestoreRestOptions {
  projectId: string;
  databaseId?: string;
  bearerToken?: string;
}

export class FirestoreRestClient implements FirestoreLike {
  readonly databaseId: string;

  constructor(private readonly options: FirestoreRestOptions) {
    this.databaseId = options.databaseId ?? '(default)';
  }

  collection(path: string): CollectionReferenceLike {
    return new FirestoreRestCollection(this, normalizePath(path));
  }

  documentUrl(documentPath: string): URL {
    return new URL(
      `https://firestore.googleapis.com/v1/projects/${this.options.projectId}/databases/${this.databaseId}/documents/${normalizePath(documentPath)}`,
    );
  }

  async headers(): Promise<Record<string, string>> {
    return {
      authorization: `Bearer ${await this.accessToken()}`,
      'content-type': 'application/json',
    };
  }

  private async accessToken(): Promise<string> {
    if (this.options.bearerToken) {
      return this.options.bearerToken;
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

    return TokenResponseSchema.parse(await response.json()).access_token;
  }
}

class FirestoreRestCollection implements CollectionReferenceLike {
  constructor(
    private readonly client: FirestoreRestClient,
    private readonly path: string,
  ) {}

  doc(id: string): DocumentReferenceLike {
    return new FirestoreRestDocument(this.client, `${this.path}/${encodeURIComponent(id)}`, id);
  }

  async get(): Promise<QuerySnapshotLike> {
    const response = await fetch(this.client.documentUrl(this.path), {
      headers: await this.client.headers(),
      cache: 'no-store',
    });

    if (response.status === 404) {
      return { docs: [] };
    }
    if (!response.ok) {
      throw new Error(`Firestore collection request failed with ${response.status}.`);
    }

    const parsed = FirestoreListResponseSchema.parse(await response.json());
    return {
      docs: (parsed.documents ?? []).map((document) => documentSnapshotFromRest(document)),
    };
  }
}

class FirestoreRestDocument implements DocumentReferenceLike {
  constructor(
    private readonly client: FirestoreRestClient,
    private readonly path: string,
    readonly id: string,
  ) {}

  collection(path: string): CollectionReferenceLike {
    return new FirestoreRestCollection(this.client, `${this.path}/${normalizePath(path)}`);
  }

  async get(): Promise<DocumentSnapshotLike> {
    const response = await fetch(this.client.documentUrl(this.path), {
      headers: await this.client.headers(),
      cache: 'no-store',
    });

    if (response.status === 404) {
      return {
        id: this.id,
        exists: false,
        data: () => undefined,
      };
    }
    if (!response.ok) {
      throw new Error(`Firestore document request failed with ${response.status}.`);
    }

    return documentSnapshotFromRest(FirestoreDocumentSchema.parse(await response.json()), this.id);
  }

  async set(data: Record<string, unknown>): Promise<void> {
    const response = await fetch(this.client.documentUrl(this.path), {
      method: 'PATCH',
      headers: await this.client.headers(),
      body: JSON.stringify({ fields: encodeFirestoreMap(data) }),
    });

    if (!response.ok) {
      throw new Error(`Firestore document write failed with ${response.status}.`);
    }
  }

  async update(data: Record<string, unknown>): Promise<void> {
    await this.set(data);
  }
}

export function firestoreFromEnv(env: NodeJS.ProcessEnv = process.env): FirestoreRestClient {
  const projectId = env.FIRESTORE_PROJECT_ID ?? env.GOOGLE_CLOUD_PROJECT ?? env.GCP_PROJECT;
  if (!projectId) {
    throw new Error('FIRESTORE_PROJECT_ID, GOOGLE_CLOUD_PROJECT, or GCP_PROJECT must be set.');
  }

  return new FirestoreRestClient({
    projectId,
    databaseId: env.FIRESTORE_DATABASE_ID,
    bearerToken: env.FIRESTORE_BEARER_TOKEN,
  });
}

function documentSnapshotFromRest(
  document: z.infer<typeof FirestoreDocumentSchema>,
  fallbackId?: string,
): DocumentSnapshotLike {
  const id = fallbackId ?? document.name.split('/').pop() ?? '';
  const data = decodeFirestoreValue({ mapValue: { fields: document.fields ?? {} } });
  return {
    id,
    exists: true,
    data: () => (isRecord(data) ? data : {}),
  };
}

function encodeFirestoreMap(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue(value)]));
}

function encodeFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }
  if (isRecord(value)) {
    return { mapValue: { fields: encodeFirestoreMap(value) } };
  }

  return { stringValue: String(value) };
}

function decodeFirestoreValue(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    const values = isRecord(value.arrayValue) && Array.isArray(value.arrayValue.values) ? value.arrayValue.values : [];
    return values.map(decodeFirestoreValue);
  }
  if ('mapValue' in value) {
    const fields = isRecord(value.mapValue) && isRecord(value.mapValue.fields) ? value.mapValue.fields : {};
    return Object.fromEntries(Object.entries(fields).map(([key, nested]) => [key, decodeFirestoreValue(nested)]));
  }
  return value;
}

function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
