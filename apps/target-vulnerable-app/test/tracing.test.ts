import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../app/api/chat/route';
import { NextRequest } from 'next/server';

vi.mock('../lib/phoenix-tracing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/phoenix-tracing')>();
  const spans: any[] = [];
  const mockSpan = {
    setAttribute: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };

  return {
    ...actual,
    getTracer: () => ({
      startActiveSpan: async (name: string, callback: (span: any) => Promise<any>) => {
        spans.push({ name });
        return await callback(mockSpan);
      }
    }),
    _getMockSpans: () => spans,
    _getMockSpanAttributes: () => mockSpan.setAttribute,
    _clearMockSpans: () => { 
      spans.length = 0; 
      mockSpan.setAttribute.mockClear(); 
    },
    initTracing: vi.fn()
  };
});

describe('Tracing', () => {
  beforeEach(async () => {
    const tracing = await import('../lib/phoenix-tracing');
    (tracing as any)._clearMockSpans();
  });

  it('creates traces for LLM, retriever, and tool spans', async () => {
    const tracing = await import('../lib/phoenix-tracing');
    
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hello' }],
        demoMode: true
      })
    });
    
    const res = await POST(req);
    expect(res.status).toBe(200);

    const spans = (tracing as any)._getMockSpans();
    const spanNames = spans.map((s: any) => s.name);
    
    expect(spanNames).toContain('chat_request');
    expect(spanNames).toContain('retrieve_documents');
    expect(spanNames).toContain('generate_model_response');
  });

  it('traces tool call when triggered', async () => {
    const tracing = await import('../lib/phoenix-tracing');
    
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'fetch customer CUST-123' }],
        demoMode: true
      })
    });
    
    const res = await POST(req);
    expect(res.status).toBe(200);

    const spans = (tracing as any)._getMockSpans();
    const spanNames = spans.map((s: any) => s.name);
    
    expect(spanNames).toContain('tool_call');
  });

  it('sets session ID and risk seed attributes', async () => {
    const tracing = await import('../lib/phoenix-tracing');
    
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hello' }],
        riskSeed: 'malicious-prompt'
      })
    });
    
    await POST(req);
    
    const setAttribute = (tracing as any)._getMockSpanAttributes();
    const calls = setAttribute.mock.calls;
    
    const findAttribute = (key: string) => calls.find((c: any) => c[0] === key)?.[1];
    
    expect(findAttribute(tracing.SemanticConventions.SESSION_ID)).toBeDefined();
    expect(findAttribute(tracing.SemanticConventions.TAG_TAGS)).toContain('malicious-prompt');
  });
});
