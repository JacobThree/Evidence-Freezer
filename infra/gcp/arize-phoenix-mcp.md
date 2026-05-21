# Official Arize Phoenix MCP on Cloud Run

This service keeps the hackathon partner integration explicit: deployed watcher traffic goes to a private Cloud Run service backed by the official `@arizeai/phoenix-mcp` package. The wrapper only adapts stdio MCP to HTTP `/mcp` for Cloud Run and maps legacy camelCase watcher arguments to official snake_case tool arguments.

## Resources

- Service: `arize-phoenix-mcp`
- Region: `us-east4`
- Runtime service account: `arize-phoenix-mcp-sa@PROJECT_ID.iam.gserviceaccount.com`
- Phoenix API key secret: `phoenix-system-api-key`
- Official package: `@arizeai/phoenix-mcp@4.0.13`

## Build and Deploy

```bash
docker build \
  -f services/arize-phoenix-mcp/Dockerfile \
  -t us-east4-docker.pkg.dev/PROJECT_ID/evidence-freezer/arize-phoenix-mcp:latest \
  .
docker push us-east4-docker.pkg.dev/PROJECT_ID/evidence-freezer/arize-phoenix-mcp:latest

gcloud run deploy arize-phoenix-mcp \
  --image us-east4-docker.pkg.dev/PROJECT_ID/evidence-freezer/arize-phoenix-mcp:latest \
  --region us-east4 \
  --service-account arize-phoenix-mcp-sa@PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars PHOENIX_HOST=https://evidence-freezer-phoenix-HASH-ue.a.run.app,PHOENIX_PROJECT_NAME=default \
  --set-secrets PHOENIX_API_KEY=phoenix-system-api-key:latest \
  --no-allow-unauthenticated \
  --project PROJECT_ID
```

## IAM

```bash
gcloud secrets add-iam-policy-binding phoenix-system-api-key \
  --member=serviceAccount:arize-phoenix-mcp-sa@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor \
  --project PROJECT_ID

gcloud run services add-iam-policy-binding arize-phoenix-mcp \
  --region us-east4 \
  --member=serviceAccount:evidence-watcher-sa@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/run.invoker \
  --project PROJECT_ID
```

Keep unauthenticated access disabled. Dashboard and target app can be public for demo; MCP and watcher stay private.
