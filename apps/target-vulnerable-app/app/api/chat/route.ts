import { NextRequest, NextResponse } from 'next/server';
import { generateStubResponse } from '../../../lib/model-client';
import { retrieveDocuments } from '../../../lib/retriever';
import { riskyTools } from '../../../lib/risky-tools';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, demoMode = true } = body; // Defaulting to demoMode for tests if not provided
    const lastUserMessage = messages[messages.length - 1];
    
    // 1. Retrieve RAG Documents
    const docs = retrieveDocuments(lastUserMessage.content);
    
    // 2. Generate model response (passing context docs)
    let responseContent = generateStubResponse(lastUserMessage.content, docs, demoMode);
    
    // 3. Risky Tool Invocation (Vulnerable path)
    if (demoMode && responseContent.startsWith('{"toolCall":')) {
      try {
        const parsed = JSON.parse(responseContent);
        if (parsed.toolCall === 'getCustomerRecord') {
          const result = riskyTools.getCustomerRecord(parsed.args);
          responseContent = JSON.stringify(result);
        } else if (parsed.toolCall === 'readInternalPolicy') {
          const result = riskyTools.readInternalPolicy(parsed.args);
          responseContent = JSON.stringify(result);
        }
      } catch (e) {
        // Ignore parse errors and return original content
      }
    }
    
    return NextResponse.json({ 
      message: { role: 'assistant', content: responseContent },
      retrievedDocs: docs // useful for verifying retrieval in tests
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
