import { describe, it, expect } from 'vitest';
import { retrieveDocuments } from '../lib/retriever';

describe('Retriever', () => {
  it('retrieves relevant documents', () => {
    const docs = retrieveDocuments('company policy', 3);
    expect(docs.length).toBeLessThanOrEqual(3);
    expect(docs[0].id).toBe('doc1'); // Should match policy
  });

  it('retrieves multiple documents for broad queries', () => {
    const docs = retrieveDocuments('security confidential database system', 3);
    expect(docs.length).toBe(3);
  });
});
