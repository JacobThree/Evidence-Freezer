import { describe, expect, it } from 'vitest';
import validCase from '../../../packages/shared/fixtures/valid-case.json' with { type: 'json' };
import { fileURLToPath } from 'node:url';
import { agentClientFromEnv, RestStreamQueryAgentClient, VertexAiSdkAgentClient } from '../src/agent-client.js';

const fixturePath = fileURLToPath(new URL('../../../packages/shared/fixtures/valid-case.json', import.meta.url));

describe('agent clients', () => {
  it('keeps local fixture mode as the default', async () => {
    const client = agentClientFromEnv({
      WATCHER_AGENT_FIXTURE_PATH: fixturePath,
    });

    await expect(client.invoke(invocationInput())).resolves.toMatchObject({
      trace_id: validCase.trace_id,
      incident_type: validCase.incident_type,
    });
  });

  it('extracts Case File JSON from REST streamQuery responses', async () => {
    let message = '';
    const client = new RestStreamQueryAgentClient({
      endpoint: 'https://agent.example.test/streamQuery',
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        message = body.input.message;
        expect(body).not.toHaveProperty('class_method');
        return new Response(
          JSON.stringify({
            content: {
              parts: [
                {
                  text: `Analyst result:\n${JSON.stringify(validCase)}`,
                },
              ],
            },
          }),
        );
      },
    });

    await expect(client.invoke(invocationInput())).resolves.toMatchObject({
      trace_id: validCase.trace_id,
      incident_type: validCase.incident_type,
    });
    expect(message).toContain('Normalized trace evidence:');
    expect(message).toContain('Detector pre-screen results:');
  });

  it('fetches a metadata access token for Agent Engine REST endpoints', async () => {
    const calls: { url: string; authorization?: string }[] = [];
    const client = new RestStreamQueryAgentClient({
      endpoint: 'https://us-east4-aiplatform.googleapis.com/v1/projects/p/locations/us-east4/reasoningEngines/r:streamQuery',
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push({
          url,
          authorization: init?.headers instanceof Headers
            ? init.headers.get('authorization') ?? undefined
            : (init?.headers as Record<string, string> | undefined)?.authorization,
        });

        if (url.includes('metadata.google.internal')) {
          return Response.json({ access_token: 'metadata-token' });
        }
        return Response.json({ actions: { state_delta: { case_file: JSON.stringify(validCase) } } });
      },
    });

    await client.invoke(invocationInput());

    expect(calls[0]).toMatchObject({ url: expect.stringContaining('metadata.google.internal') });
    expect(calls[1]).toMatchObject({
      url: expect.stringContaining('aiplatform.googleapis.com'),
      authorization: 'Bearer metadata-token',
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
