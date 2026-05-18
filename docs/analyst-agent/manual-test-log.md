# Analyst Agent Manual Test Log

Use this file to record the live Agent Engine deployment and seeded trace checks for task 14.

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
