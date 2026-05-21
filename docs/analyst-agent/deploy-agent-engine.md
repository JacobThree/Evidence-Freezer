# Deploy Analyst To Agent Engine

Evidence Freezer uses a code-defined ADK analyst hosted on Gemini Enterprise Agent Platform runtime with Gemini 2.5 Pro. The runtime resource is a Vertex AI Agent Engine reasoning engine; optional Gemini Enterprise registration points at that deployed reasoning engine resource path.

Google's current documentation describes Agent Platform Runtime deployment as a managed runtime for agents and Gemini Enterprise registration as a separate step for ADK agents hosted on Vertex AI Agent Engine.

## Resource Defaults

- Project: `GOOGLE_CLOUD_PROJECT`, usually `evidence-freezer-dev`.
- Region: `GOOGLE_CLOUD_REGION`, default `us-east4`; use `us-central1` only if runtime/model availability requires it.
- Runtime service account: `PHOENIX_MCP_SERVICE_ACCOUNT`, usually `adk-analyst-sa@PROJECT_ID.iam.gserviceaccount.com`.
- Staging bucket: `AGENT_ENGINE_STAGING_BUCKET`, default `gs://PROJECT_ID-agent-engine-staging`.
- Display name: `AGENT_ENGINE_DISPLAY_NAME`, default `Evidence Freezer Analyst`.

## IAM And Network Prerequisites

Grant the analyst runtime service account permission to invoke the private official Arize Phoenix MCP Cloud Run service:

```bash
gcloud run services add-iam-policy-binding arize-phoenix-mcp \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  --member "serviceAccount:$PHOENIX_MCP_SERVICE_ACCOUNT" \
  --role roles/run.invoker
```

The Agent Engine deployment principal also needs permission to deploy Agent Engine resources and to use the configured runtime service account. Create the staging bucket before deployment if it does not exist.

## Deploy

From `services/evidence-analyst-adk`, configure the runtime:

```bash
export GOOGLE_CLOUD_PROJECT="evidence-freezer-dev"
export GOOGLE_CLOUD_REGION="us-east4"
export AGENT_ENGINE_STAGING_BUCKET="gs://evidence-freezer-dev-agent-engine-staging"
export PHOENIX_MCP_URL="https://arize-phoenix-mcp-HASH-ue.a.run.app/mcp"
export PHOENIX_MCP_AUTH_MODE="google_id_token"
export PHOENIX_MCP_AUDIENCE="$PHOENIX_MCP_URL"
export PHOENIX_MCP_SERVICE_ACCOUNT="adk-analyst-sa@evidence-freezer-dev.iam.gserviceaccount.com"
export PHOENIX_MCP_TOOL_FILTER="list-traces,get-trace,get-spans,get-session,get-prompt"
```

Preview the deployment package:

```bash
python deploy.py --dry-run --json
```

Deploy the analyst:

```bash
python deploy.py --json
```

Record the returned `resource_name` and `resource_url` in `docs/analyst-agent/manual-test-log.md`.

## Invocation Methods

Default SDK method:

```python
import vertexai
from vertexai import agent_engines

vertexai.init(project="PROJECT_ID", location="us-east4")
remote = agent_engines.get("projects/PROJECT_ID/locations/us-east4/reasoningEngines/RESOURCE_ID")
session = remote.create_session(user_id="watcher")
for event in remote.stream_query(
    user_id="watcher",
    session_id=session["id"],
    message="Analyze trace_id trace_12345678 and return the strict Case File JSON.",
):
    print(event)
```

REST fallback:

```bash
curl -sS \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://us-east4-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/us-east4/reasoningEngines/RESOURCE_ID:streamQuery" \
  --data '{
    "class_method": "stream_query",
    "input": {
      "user_id": "watcher",
      "message": "Analyze trace_id trace_12345678 and return the strict Case File JSON."
    }
  }'
```

## Optional Gemini Enterprise Registration

In Gemini Enterprise, add a custom agent via Agent Engine and enter the deployed reasoning engine URL:

```text
https://LOCATION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/LOCATION/reasoningEngines/RESOURCE_ID
```

This registration is optional for the MVP watcher path. The watcher should call Agent Engine directly through the SDK first and keep REST `:streamQuery` as the fallback.
