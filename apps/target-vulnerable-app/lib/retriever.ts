import { FAKE_DOCS, Document } from './fake-docs';

// A simple keyword-based mock retriever
export function retrieveDocuments(query: string, topK: number = 3): Document[] {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  
  const scoredDocs = FAKE_DOCS.map(doc => {
    let score = 0;
    const text = (doc.title + ' ' + doc.content).toLowerCase();
    for (const word of queryWords) {
      if (text.includes(word)) {
        score++;
      }
    }
    return { doc, score };
  });

  return scoredDocs
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(scoredDoc => scoredDoc.doc);
}
