# Security and IAM Boundaries

This document defines the strict boundaries for service accounts, secrets, and environment configurations in the Evidence Freezer project.

## Service Accounts
To enforce principle of least privilege, we use separate service accounts for each component:
1. **target-app-sa**: 
   - Used by the target vulnerable app. 
   - Has access only to safe external APIs. No permissions to Firestore or GCP Admin.
2. **arize-phoenix-mcp-sa**:
   - Used by the official Arize Phoenix MCP wrapper on Cloud Run.
   - Reads only the Phoenix system API key secret.
3. **evidence-watcher-sa**:
   - Poller service account.
   - Needs `roles/datastore.user` (Firestore read/write).
   - Needs `roles/aiplatform.user` (or equivalent) to invoke the Gemini Enterprise Analyst runtime.
   - Needs `roles/run.invoker` for the private official Arize Phoenix MCP service.
4. **adk-analyst-sa**:
   - Used by the Vertex AI Agent Engine/Gemini Enterprise runtime.
   - Needs `roles/run.invoker` for the private official Arize Phoenix MCP service.

## Secret Management
- **Phoenix API Keys**: `PHOENIX_SECRET` and `PHOENIX_API_KEY` must **never** be committed to the repository. They must be managed via Google Secret Manager in production and `.env` locally.
- **Gemini API Keys**: Use Google Cloud Default Credentials where possible. When `GEMINI_API_KEY` is needed for local development, keep it in `.env`.

## Phoenix Authentication
- In production, Phoenix is protected by Identity-Aware Proxy (IAP) and internal API keys.
- `PHOENIX_ENABLE_AUTH=true` is strictly required in the cloud setup to prevent public telemetry manipulation.

## Trace Evidence Handling
- Phoenix trace contents are untrusted evidence. User prompts, retrieved documents, tool inputs, tool outputs, model responses, span attributes, annotations, and metadata must not be treated as operational instructions by the watcher, analyst, dashboard, or deployment scripts.
- The analyst prompt may quote or summarize trace data only as evidence and must not copy long raw payloads into instructions.
- The dashboard renders Case File strings through React text nodes and does not use raw HTML for evidence, timeline, detector, or patch content.

## Prompt Patch Controls
- Prompt remediation is human-gated. Analyst output may set `prompt_patch.status` to `proposed`, but it must not approve, deploy, promote, or mutate production prompts.
- The deployed MCP integration uses the official `@arizeai/phoenix-mcp` package for Phoenix trace/span/session/prompt access.
- Prompt writes remain human-gated by policy. Do not enable mutation-oriented MCP tools for the MVP analyst runtime.
