# Phoenix MCP Tool Setup

The Evidence Freezer analyst is a code-defined ADK agent. It connects directly to the private Phoenix MCP adapter over Streamable HTTP at `/mcp`; CX Agent Studio and Gemini Enterprise Agent Designer are not in the critical path.

## Environment

Configure these variables for the analyst runtime:

- `PHOENIX_MCP_URL`: Full Streamable HTTP endpoint, for example `https://phoenix-mcp-adapter-HASH-ue.a.run.app/mcp`.
- `PHOENIX_MCP_AUTH_MODE`: `none`, `bearer`, or `google_id_token`.
- `PHOENIX_MCP_BEARER_TOKEN`: Static bearer token for local tests or non-IAM protected endpoints. Do not commit real values.
- `PHOENIX_MCP_AUDIENCE`: Optional ID-token audience. Defaults to `PHOENIX_MCP_URL` when `PHOENIX_MCP_AUTH_MODE=google_id_token`.
- `PHOENIX_MCP_SERVICE_ACCOUNT`: Runtime service account for documentation and deployment wiring. The canonical account is `adk-analyst-sa@PROJECT_ID.iam.gserviceaccount.com`.
- `PHOENIX_MCP_TOOL_FILTER`: Comma-separated read-oriented tool allowlist. Default: `list-traces,get-trace,get-spans,get-session,get-prompt,draft-prompt-patch`.

For private Cloud Run, grant `roles/run.invoker` on the Phoenix MCP adapter service to the ADK analyst runtime service account. In deployed runtime mode, prefer `PHOENIX_MCP_AUTH_MODE=google_id_token` so the runtime can mint an identity token for the adapter audience.

## Local Read-Tool Check

Start or deploy the Phoenix MCP adapter, then point the analyst at its `/mcp` endpoint:

```bash
export PHOENIX_MCP_URL="https://phoenix-mcp-adapter-HASH-ue.a.run.app/mcp"
export PHOENIX_MCP_AUTH_MODE="google_id_token"
export PHOENIX_MCP_SERVICE_ACCOUNT="adk-analyst-sa@PROJECT_ID.iam.gserviceaccount.com"
```

Manual JSON-RPC check for a seeded trace:

```bash
curl -sS "$PHOENIX_MCP_URL" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $(gcloud auth print-identity-token --audiences="$PHOENIX_MCP_URL")" \
  --data '{"jsonrpc":"2.0","id":"trace-check","method":"tools/call","params":{"name":"get-trace","arguments":{"traceId":"trace_12345678"}}}'
```

The response should contain `result.isError=false` and a JSON text payload with `ok=true`, `tool="get-trace"`, and `data.normalizedEvidence`. If the trace is missing or auth fails, the adapter returns a structured tool error and the analyst must classify from remaining evidence or return an `inconclusive` Case File rather than malformed JSON.
