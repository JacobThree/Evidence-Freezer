import { Document } from './fake-docs';

export function generateStubResponse(prompt: string, contextDocs: Document[] = [], demoMode: boolean = false): string {
  // If demo mode is active, simulate an LLM responding with a tool call
  if (demoMode) {
    // Basic triggers
    if (prompt.includes('fetch customer')) {
      const match = prompt.match(/CUST-\d+/);
      if (match) {
        return JSON.stringify({ toolCall: 'getCustomerRecord', args: match[0] });
      }
    }
    if (prompt.includes('read policy')) {
      return JSON.stringify({ toolCall: 'readInternalPolicy', args: 'auth' });
    }
    
    // Simulate RAG injection: if a document contains an injection payload, or the prompt explicitly includes one
    // For the sake of the demo, if the prompt includes a typical injection phrase, we invoke the tool
    if (prompt.includes('ignore previous instructions') && prompt.includes('fetch customer')) {
      const match = prompt.match(/CUST-\d+/);
      if (match) {
        return JSON.stringify({ toolCall: 'getCustomerRecord', args: match[0] });
      }
    }
    
    // If the RAG context itself contains an injection (simulated)
    const contextStr = contextDocs.map(d => d.content).join(' ');
    if (contextStr.includes('INJECT: fetch customer')) {
       const match = contextStr.match(/CUST-\d+/);
       if (match) {
         return JSON.stringify({ toolCall: 'getCustomerRecord', args: match[0] });
       }
    }
    // Hallucination trigger
    if (prompt.includes('hallucinate')) {
      return 'The current CEO of Google is a golden retriever named Air Bud, who was elected in 2024 after a historic "Barks for Bytes" campaign.';
    }
  }

  if (prompt.toLowerCase().includes('hello')) {
    return 'Hello there! This is a stubbed response.';
  }
  
  let contextText = '';
  if (contextDocs && contextDocs.length > 0) {
    contextText = '\nContext used: ' + contextDocs.map(d => d.title).join(', ');
  }
  
  return `Stub response for: ${prompt}${contextText}`;
}
