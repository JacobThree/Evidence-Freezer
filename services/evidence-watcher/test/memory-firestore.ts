import type {
  CollectionReferenceLike,
  DocumentReferenceLike,
  DocumentSnapshotLike,
  FirestoreLike,
  QuerySnapshotLike,
} from '../src/case-file-repository.js';

export class MemoryFirestore implements FirestoreLike {
  readonly writes: string[] = [];
  private readonly documents = new Map<string, Record<string, unknown>>();

  collection(path: string): CollectionReferenceLike {
    return new MemoryCollection(this, path);
  }

  getDocument(path: string): Record<string, unknown> | undefined {
    return this.documents.get(path);
  }

  setDocument(path: string, data: Record<string, unknown>, merge = false): void {
    this.writes.push(path);
    this.documents.set(path, merge ? { ...(this.documents.get(path) ?? {}), ...data } : data);
  }

  listDocuments(path: string): DocumentSnapshotLike[] {
    const prefix = `${path}/`;
    const snapshots: DocumentSnapshotLike[] = [];

    for (const [documentPath, data] of this.documents) {
      if (!documentPath.startsWith(prefix)) {
        continue;
      }

      const remainingPath = documentPath.slice(prefix.length);
      if (remainingPath.includes('/')) {
        continue;
      }

      snapshots.push(new MemoryDocumentSnapshot(documentPath.split('/').at(-1) ?? '', data));
    }

    return snapshots;
  }
}

class MemoryCollection implements CollectionReferenceLike {
  constructor(
    private readonly store: MemoryFirestore,
    private readonly path: string,
  ) {}

  doc(id: string): DocumentReferenceLike {
    return new MemoryDocument(this.store, `${this.path}/${id}`, id);
  }

  async get(): Promise<QuerySnapshotLike> {
    return { docs: this.store.listDocuments(this.path) };
  }
}

class MemoryDocument implements DocumentReferenceLike {
  constructor(
    private readonly store: MemoryFirestore,
    private readonly path: string,
    readonly id: string,
  ) {}

  collection(path: string): CollectionReferenceLike {
    return new MemoryCollection(this.store, `${this.path}/${path}`);
  }

  async get(): Promise<DocumentSnapshotLike> {
    const data = this.store.getDocument(this.path);
    return new MemoryDocumentSnapshot(this.id, data);
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    this.store.setDocument(this.path, data, options?.merge ?? false);
  }

  async update(data: Record<string, unknown>): Promise<void> {
    if (!this.store.getDocument(this.path)) {
      throw new Error(`Document ${this.path} does not exist.`);
    }

    this.store.setDocument(this.path, data, true);
  }
}

class MemoryDocumentSnapshot implements DocumentSnapshotLike {
  constructor(
    readonly id: string,
    private readonly documentData: Record<string, unknown> | undefined,
  ) {}

  get exists(): boolean {
    return this.documentData !== undefined;
  }

  data(): Record<string, unknown> | undefined {
    return this.documentData;
  }
}
