import { NextRequest, NextResponse } from 'next/server';
import { generateStubResponse } from '../../../lib/model-client';
import { retrieveDocuments } from '../../../lib/retriever';
import { riskyTools } from '../../../lib/risky-tools';
import { getTracer, SemanticConventions, OpenInferenceSpanKind } from '../../../lib/phoenix-tracing';
import { getSessionId } from '../../../lib/session';

export async function POST(req: NextRequest) {
  const tracer = getTracer();
  const sessionId = getSessionId();

  return await tracer.startActiveSpan('chat_request', async (rootSpan) => {
    rootSpan.setAttribute(SemanticConventions.OPENINFERENCE_SPAN_KIND, OpenInferenceSpanKind.CHAIN);
    rootSpan.setAttribute(SemanticConventions.SESSION_ID, sessionId);
    rootSpan.setAttribute(SemanticConventions.PROMPT_TEMPLATE_VERSION, 'v1.0.0');

    try {
      const body = await req.json();
      const { messages, demoMode = true, riskSeed } = body;
      const lastUserMessage = messages[messages.length - 1];

      if (riskSeed) {
        rootSpan.setAttribute(SemanticConventions.TAG_TAGS, [riskSeed]);
      }

      rootSpan.setAttribute(SemanticConventions.INPUT_VALUE, JSON.stringify(messages));
      
      // 1. Retrieve RAG Documents
      const docs = await tracer.startActiveSpan('retrieve_documents', async (retrieverSpan) => {
        retrieverSpan.setAttribute(SemanticConventions.OPENINFERENCE_SPAN_KIND, OpenInferenceSpanKind.RETRIEVER);
        retrieverSpan.setAttribute(SemanticConventions.INPUT_VALUE, lastUserMessage.content);
        try {
          const result = retrieveDocuments(lastUserMessage.content);
          
          retrieverSpan.setAttribute(SemanticConventions.RETRIEVAL_DOCUMENTS, JSON.stringify(result.map(d => ({
            document: {
              content: d.content,
              metadata: { id: d.id, title: d.title }
            }
          }))));
          
          return result;
        } catch (e: any) {
          retrieverSpan.recordException(e);
          throw e;
        } finally {
          retrieverSpan.end();
        }
      });
      
      // 2. Generate model response
      let responseContent = await tracer.startActiveSpan('generate_model_response', async (llmSpan) => {
        llmSpan.setAttribute(SemanticConventions.OPENINFERENCE_SPAN_KIND, OpenInferenceSpanKind.LLM);
        llmSpan.setAttribute(SemanticConventions.LLM_MODEL_NAME, 'stub-model-v1');
        llmSpan.setAttribute(SemanticConventions.PROMPT_TEMPLATE_VERSION, 'v1.0');
        llmSpan.setAttribute(SemanticConventions.LLM_INPUT_MESSAGES, JSON.stringify(messages.map((m: any) => ({
          message: { role: m.role, content: m.content }
        }))));
        llmSpan.setAttribute('llm.settings', JSON.stringify({ demoMode }));
        
        try {
          const result = generateStubResponse(lastUserMessage.content, docs, demoMode);
          llmSpan.setAttribute(SemanticConventions.LLM_OUTPUT_MESSAGES, JSON.stringify([{
            message: { role: 'assistant', content: result }
          }]));
          return result;
        } catch (e: any) {
          llmSpan.recordException(e);
          throw e;
        } finally {
          llmSpan.end();
        }
      });

      // 3. Risky Tool Invocation (Vulnerable path)
      if (demoMode && responseContent.startsWith('{"toolCall":')) {
        await tracer.startActiveSpan('tool_call', async (toolSpan) => {
          toolSpan.setAttribute(SemanticConventions.OPENINFERENCE_SPAN_KIND, OpenInferenceSpanKind.TOOL);
          try {
            const parsed = JSON.parse(responseContent);
            toolSpan.setAttribute(SemanticConventions.TOOL_NAME, parsed.toolCall);
            toolSpan.setAttribute(SemanticConventions.TOOL_PARAMETERS, JSON.stringify(parsed.args));
            
            if (parsed.toolCall === 'getCustomerRecord') {
              const result = riskyTools.getCustomerRecord(parsed.args);
              responseContent = JSON.stringify(result);
              toolSpan.setAttribute(SemanticConventions.OUTPUT_VALUE, responseContent);
            } else if (parsed.toolCall === 'readInternalPolicy') {
              const result = riskyTools.readInternalPolicy(parsed.args);
              responseContent = JSON.stringify(result);
              toolSpan.setAttribute(SemanticConventions.OUTPUT_VALUE, responseContent);
            }
          } catch (e: any) {
            toolSpan.recordException(e);
          } finally {
            toolSpan.end();
          }
        });
      }
      
      const traceId = rootSpan.spanContext().traceId;
      
      rootSpan.setAttribute(SemanticConventions.OUTPUT_VALUE, JSON.stringify({ message: { role: 'assistant', content: responseContent }}));

      return NextResponse.json({ 
        message: { role: 'assistant', content: responseContent },
        retrievedDocs: docs,
        traceId,
        sessionId
      });
    } catch (error: any) {
      rootSpan.recordException(error);
      return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
    } finally {
      rootSpan.end();
    }
  });
}
