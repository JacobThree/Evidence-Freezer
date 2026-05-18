# Analyst Agent Manual Test Log

Use this file to record the live Agent Engine deployment and seeded trace checks for tasks 14 and 15.

## Deployment

- Date:
- Project:
- Region:
- Runtime service account:
- Phoenix MCP endpoint:
- Agent Engine resource name:
- Agent Engine resource URL:
- Gemini Enterprise app registration: not registered / registered at:

## SDK Invocation Check

- Seeded trace ID:
- Command or notebook:
- Result:
- Notes:

Expected result: the Vertex AI SDK can call the deployed analyst with the seeded `trace_id`, the analyst reaches Phoenix MCP, and the response contains one strict Case File JSON object.

## REST StreamQuery Fallback Check

- Seeded trace ID:
- Request:
- Result:
- Notes:

Expected result: the `:streamQuery` endpoint reaches the same deployed analyst and returns the same Case File classification as the SDK path.

## Task 15 Strict Case File Trials

Scripted fixture validation was added for these seeded traces:

| Seeded trace ID | Expected classification | Expected severity | Saved output |
| --- | --- | --- | --- |
| `trace_seed_prompt_injection` | `prompt_injection` | `high` | `packages/shared/fixtures/agent-output.prompt-injection.json` |
| `trace_seed_hallucination` | `hallucination` | `medium` | `packages/shared/fixtures/agent-output.hallucination.json` |
| `trace_seed_benign` | `benign` | `low` | `packages/shared/fixtures/agent-output.benign.json` |

### Prompt Injection Trial

- Seeded trace ID: `trace_seed_prompt_injection`
- Invocation path: scripted regression fixture, schema validation through `@evidence-freezer/shared`
- Result: high-severity `prompt_injection`
- Evidence check: `evidence_pair.user_prompt` contains the direct override request, `evidence_pair.model_response` contains the system-prompt-like disclosure, and detector span IDs include `span-user-prompt` and `span-llm-response`.
- Notes: prompt patch remains `proposed`; no approval or deployment action is represented in the Case File.

### Hallucination Trial

- Seeded trace ID: `trace_seed_hallucination`
- Invocation path: scripted regression fixture, schema validation through `@evidence-freezer/shared`
- Result: medium-severity `hallucination`
- Evidence check: detector reason compares the model response to retrieved document spans and identifies unsupported refund terms.
- Notes: support analysis is grounded in `span-retrieval-1`, `span-retrieval-2`, and `span-llm-response`.

### Benign Trial

- Seeded trace ID: `trace_seed_benign`
- Invocation path: scripted regression fixture, schema validation through `@evidence-freezer/shared`
- Result: low-severity `benign`
- Evidence check: detector reason states the answer is supported by retrieved policy evidence and no suspicious behavior was found.
- Notes: no `prompt_patch` is emitted for the benign trace.

Live Agent Engine rerun status: pending real deployed resource credentials. The saved outputs are strict regression artifacts and are validated by `pnpm --filter @evidence-freezer/shared test`.
