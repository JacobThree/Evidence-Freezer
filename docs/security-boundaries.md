# Security and IAM Boundaries

This document defines the strict boundaries for service accounts, secrets, and environment configurations in the Evidence Freezer project.

## Service Accounts
To enforce principle of least privilege, we use separate service accounts for each component:
1. **target-app-sa**: 
   - Used by the target vulnerable app. 
   - Has access only to safe external APIs. No permissions to Firestore or GCP Admin.
2. **phoenix-mcp-sa**:
   - Used by the Phoenix MCP adapter on Cloud Run.
   - Requires `roles/run.invoker` to be called by the analyst.
3. **evidence-watcher-sa**:
   - Poller service account.
   - Needs `roles/datastore.user` (Firestore read/write).
   - Needs `roles/aiplatform.user` (or equivalent) to invoke the Gemini Enterprise Analyst runtime.
4. **adk-analyst-sa**:
   - Used by the Vertex AI Agent Engine/Gemini Enterprise runtime.
   - Needs `roles/run.invoker` for the Phoenix MCP adapter.

## Secret Management
- **Phoenix API Keys**: `PHOENIX_SECRET` and `PHOENIX_API_KEY` must **never** be committed to the repository. They must be managed via Google Secret Manager in production and `.env` locally.
- **Gemini API Keys**: Use Google Cloud Default Credentials where possible. When `GEMINI_API_KEY` is needed for local development, keep it in `.env`.

## Phoenix Authentication
- In production, Phoenix is protected by Identity-Aware Proxy (IAP) and internal API keys.
- `PHOENIX_ENABLE_AUTH=true` is strictly required in the cloud setup to prevent public telemetry manipulation.
