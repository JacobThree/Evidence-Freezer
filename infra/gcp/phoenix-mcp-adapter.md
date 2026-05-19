# Phoenix MCP Adapter on Cloud Run

This service exposes the Phoenix trace tools over Streamable HTTP at `/mcp`. It must be deployed as a private Cloud Run service: public network reachability is acceptable for the demo only when Cloud Run IAM rejects unauthenticated callers.

## Resources

- Service: `phoenix-mcp-adapter`
- Region: `us-east4`
- Runtime service account: `phoenix-mcp-adapter-sa@PROJECT_ID.iam.gserviceaccount.com`
- Analyst invoker service account: `evidence-analyst-adk-sa@PROJECT_ID.iam.gserviceaccount.com`
- Phoenix API key secret: `phoenix-system-api-key`

## Build and Deploy

Replace `PROJECT_ID` and the Phoenix host before running these commands.

```bash
gcloud artifacts repositories create evidence-freezer \
  --repository-format=docker \
  --location=us-east4 \
  --project=PROJECT_ID

gcloud auth configure-docker us-east4-docker.pkg.dev

docker build \
  -f services/phoenix-mcp-adapter/Dockerfile \
  -t us-east4-docker.pkg.dev/PROJECT_ID/evidence-freezer/phoenix-mcp-adapter:latest \
  .
docker push us-east4-docker.pkg.dev/PROJECT_ID/evidence-freezer/phoenix-mcp-adapter:latest

gcloud run deploy phoenix-mcp-adapter \
  --image us-east4-docker.pkg.dev/PROJECT_ID/evidence-freezer/phoenix-mcp-adapter:latest \
  --region us-east4 \
  --service-account phoenix-mcp-adapter-sa@PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars PHOENIX_HOST=https://evidence-freezer-phoenix-HASH-ue.a.run.app,PHOENIX_PROJECT_NAME=default \
  --set-secrets PHOENIX_API_KEY=phoenix-system-api-key:latest \
  --no-allow-unauthenticated \
  --project PROJECT_ID
```

The checked-in `services/phoenix-mcp-adapter/cloudrun.yaml` is the manifest equivalent for review or GitOps flows. Keep the Phoenix API key as a Secret Manager reference; do not commit it as a literal environment variable.

## IAM

Grant the adapter service account access to read only the Phoenix system API key:

```bash
gcloud secrets add-iam-policy-binding phoenix-system-api-key \
  --member=serviceAccount:phoenix-mcp-adapter-sa@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor \
  --project PROJECT_ID
```

Grant only the ADK analyst runtime permission to invoke the private MCP endpoint:

```bash
gcloud run services add-iam-policy-binding phoenix-mcp-adapter \
  --region us-east4 \
  --member=serviceAccount:evidence-analyst-adk-sa@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/run.invoker \
  --project PROJECT_ID
```

## Verification

Unauthenticated requests must be rejected:

```bash
curl -i https://phoenix-mcp-adapter-HASH-ue.a.run.app/mcp
```

Expected result: `401` or `403` from Cloud Run IAM, before the adapter handles the request.

Authenticated requests from an allowed identity should list the adapter metadata:

```bash
TOKEN="$(gcloud auth print-identity-token)"
curl -i \
  -H "Authorization: Bearer ${TOKEN}" \
  https://phoenix-mcp-adapter-HASH-ue.a.run.app/mcp
```

Expected result: `200` with the service name, protocol version, and tool names. For a full MCP tool check, send a JSON-RPC `tools/list` request to `/mcp` with the same identity token.
