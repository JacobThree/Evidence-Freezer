# Cloud Run Deployment

Evidence Freezer runs four HTTP services on Cloud Run for the MVP demo: the vulnerable target app, Phoenix MCP adapter, evidence watcher, and evidence dashboard. Use `us-east4` unless a required model or runtime is unavailable there.

Set these shell values before running commands:

```bash
PROJECT_ID=evidence-freezer-dev
REGION=us-east4
REPOSITORY=evidence-freezer
```

Create the Artifact Registry repository once:

```bash
gcloud artifacts repositories create "${REPOSITORY}" \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}"

gcloud auth configure-docker "${REGION}-docker.pkg.dev"
```

## Service Accounts

Create separate runtime identities so IAM can stay narrow:

```bash
gcloud iam service-accounts create target-app-sa --project="${PROJECT_ID}"
gcloud iam service-accounts create phoenix-mcp-adapter-sa --project="${PROJECT_ID}"
gcloud iam service-accounts create evidence-watcher-sa --project="${PROJECT_ID}"
gcloud iam service-accounts create evidence-dashboard-sa --project="${PROJECT_ID}"
gcloud iam service-accounts create scheduler-watcher-invoker-sa --project="${PROJECT_ID}"
```

Grant Secret Manager access only to services that consume the secret:

```bash
gcloud secrets add-iam-policy-binding phoenix-system-api-key \
  --member="serviceAccount:target-app-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor \
  --project="${PROJECT_ID}"

gcloud secrets add-iam-policy-binding phoenix-system-api-key \
  --member="serviceAccount:phoenix-mcp-adapter-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor \
  --project="${PROJECT_ID}"

gcloud secrets add-iam-policy-binding watcher-operator-token \
  --member="serviceAccount:evidence-dashboard-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor \
  --project="${PROJECT_ID}"
```

Grant Firestore access to the watcher and dashboard:

```bash
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:evidence-watcher-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/datastore.user

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:evidence-dashboard-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/datastore.viewer
```

Grant the watcher permission to call the private MCP adapter:

```bash
gcloud run services add-iam-policy-binding phoenix-mcp-adapter \
  --region="${REGION}" \
  --member="serviceAccount:evidence-watcher-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/run.invoker \
  --project="${PROJECT_ID}"
```

## Target Vulnerable App

The target app is intentionally vulnerable demo code. Keep it public only for controlled demos.

```bash
docker build \
  -f apps/target-vulnerable-app/Dockerfile \
  -t "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/target-vulnerable-app:latest" \
  .
docker push "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/target-vulnerable-app:latest"

gcloud run deploy target-vulnerable-app \
  --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/target-vulnerable-app:latest" \
  --region="${REGION}" \
  --service-account="target-app-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --allow-unauthenticated \
  --set-env-vars ENABLE_TRACING=true,USE_REAL_GEMINI=false,PHOENIX_COLLECTOR_ENDPOINT=https://PHOENIX_HOST/v1/traces \
  --set-secrets PHOENIX_API_KEY=phoenix-system-api-key:latest \
  --project="${PROJECT_ID}"
```

Use `--set-secrets GEMINI_API_KEY=gemini-api-key:latest` only when `USE_REAL_GEMINI=true`.

## Phoenix MCP Adapter

The adapter must stay private. The existing detailed runbook is in `infra/gcp/phoenix-mcp-adapter.md`.

```bash
docker build \
  -f services/phoenix-mcp-adapter/Dockerfile \
  -t "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/phoenix-mcp-adapter:latest" \
  .
docker push "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/phoenix-mcp-adapter:latest"

gcloud run deploy phoenix-mcp-adapter \
  --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/phoenix-mcp-adapter:latest" \
  --region="${REGION}" \
  --service-account="phoenix-mcp-adapter-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --no-allow-unauthenticated \
  --set-env-vars PHOENIX_HOST=https://PHOENIX_HOST,PHOENIX_PROJECT_NAME=default \
  --set-secrets PHOENIX_API_KEY=phoenix-system-api-key:latest \
  --project="${PROJECT_ID}"
```

## Evidence Watcher

Deploy the watcher privately. Operators can trigger `/poll` manually with an identity token, and Cloud Scheduler can trigger it with OIDC.

```bash
docker build \
  -f services/evidence-watcher/Dockerfile \
  -t "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/evidence-watcher:latest" \
  .
docker push "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/evidence-watcher:latest"

gcloud run deploy evidence-watcher \
  --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/evidence-watcher:latest" \
  --region="${REGION}" \
  --service-account="evidence-watcher-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --no-allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT="${PROJECT_ID}",WATCHER_PROJECT_ID="${PROJECT_ID}",PHOENIX_PROJECT_NAME=default,PHOENIX_MCP_URL=https://PHOENIX_MCP_ADAPTER_URL/mcp,PHOENIX_MCP_AUTH_MODE=google_id_token,PHOENIX_MCP_AUDIENCE=https://PHOENIX_MCP_ADAPTER_URL,WATCHER_AGENT_MODE=rest,AGENT_ENGINE_STREAM_QUERY_URL=https://AGENT_ENGINE_STREAM_QUERY_URL,TARGET_APP_BASE_URL=https://TARGET_APP_URL,WATCHER_DEMO_MODE=false \
  --set-secrets AGENT_ENGINE_ACCESS_TOKEN=agent-engine-access-token:latest,WATCHER_OPERATOR_TOKEN=watcher-operator-token:latest \
  --project="${PROJECT_ID}"
```

Manual trigger:

```bash
WATCHER_URL="$(gcloud run services describe evidence-watcher --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)')"
curl -i -X POST \
  -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences="${WATCHER_URL}")" \
  -H "content-type: application/json" \
  --data '{"dryRun":true,"limit":5}' \
  "${WATCHER_URL}/poll"
```

## Evidence Dashboard

Local dashboard mode can remain unauthenticated with fixture data. Deployed private mode should use Firestore and IAP directly on Cloud Run.

```bash
docker build \
  -f apps/evidence-dashboard/Dockerfile \
  -t "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/evidence-dashboard:latest" \
  .
docker push "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/evidence-dashboard:latest"

gcloud run deploy evidence-dashboard \
  --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/evidence-dashboard:latest" \
  --region="${REGION}" \
  --service-account="evidence-dashboard-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --no-allow-unauthenticated \
  --set-env-vars EVIDENCE_DASHBOARD_CASE_SOURCE=firestore,FIRESTORE_PROJECT_ID="${PROJECT_ID}",FIRESTORE_DATABASE_ID="(default)",PHOENIX_HOST=https://PHOENIX_HOST,EVIDENCE_WATCHER_BASE_URL=https://EVIDENCE_WATCHER_URL,WATCHER_DEMO_MODE=false \
  --set-secrets WATCHER_OPERATOR_TOKEN=watcher-operator-token:latest \
  --project="${PROJECT_ID}"
```

## Verification

Build all deployable services locally before submitting images:

```bash
pnpm --filter target-vulnerable-app build
pnpm --filter phoenix-mcp-adapter build
pnpm --filter evidence-watcher build
pnpm --filter evidence-dashboard build
```

After deployment, each service should answer health checks:

```bash
for service in target-vulnerable-app phoenix-mcp-adapter evidence-watcher evidence-dashboard; do
  url="$(gcloud run services describe "$service" --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)')"
  curl -i -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences="${url}")" "${url}/healthz"
done
```
