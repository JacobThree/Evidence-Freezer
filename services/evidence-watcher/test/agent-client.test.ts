import { describe, expect, it } from 'vitest';
import validCase from '../../../packages/shared/fixtures/valid-case.json' with { type: 'json' };
import { RestStreamQueryAgentClient, VertexAiSdkAgentClient } from '../src/agent-client.js';

describe('agent clients', () => {
  it('extracts Case File JSON from REST streamQuery responses', async () => {
    const client = new RestStreamQueryAgentClient({
      endpoint: 'https://agent.example.test/streamQuery',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output: {
              text: `Analyst result:\n${JSON.stringify(validCase)}`,
            },
          }),
        ),
    });

    await expect(client.invoke(invocationInput())).resolves.toMatchObject({
      trace_id: validCase.trace_id,
      incident_type: validCase.incident_type,
    });
  });

  it('extracts Case File JSON from Vertex SDK streaming events', async () => {
    const client = new VertexAiSdkAgentClient({
      async *streamQuery() {
        yield { text: 'prefix ' };
        yield { text: JSON.stringify(validCase) };
      },
    });

    await expect(client.invoke(invocationInput())).resolves.toMatchObject({
      project_id: validCase.project_id,
      severity: validCase.severity,
    });
  });
});

function invocationInput(): Parameters<RestStreamQueryAgentClient['invoke']>[0] {
  return {
    projectId: 'evidence-freezer',
    traceId: 'trace_seed_prompt_injection',
    normalizedTrace: {
      traceId: 'trace_seed_prompt_injection',
      evidence: [],
    },
    detectorResults: [],
  };
}
