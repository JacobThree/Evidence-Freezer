# Phoenix Setup

Evidence Freezer uses Phoenix as the observability source of truth. The primary demo runs a self-hosted Phoenix service on Google Cloud with authentication enabled. Local development can use Docker Phoenix or saved trace fixtures while keeping the same environment variable contract.

## Environment Contract

| Variable | Required | Purpose |
| --- | --- | --- |
| `PHOENIX_HOST` | Yes | Base Phoenix UI/API URL, for example `https://phoenix-<hash>-ue.a.run.app` or `http://localhost:6006`. |
| `PHOENIX_COLLECTOR_ENDPOINT` | Yes | OTLP HTTP trace ingestion endpoint. Use `${PHOENIX_HOST}/v1/traces`. |
| `PHOENIX_ENABLE_AUTH` | Cloud: yes | Must be `true` for the cloud service. Local Docker may set `false` only for isolated development. |
| `PHOENIX_SECRET` | Auth: yes | Phoenix auth signing secret. Store in Secret Manager for cloud and `.env` locally. Do not commit real values. |
| `PHOENIX_DEFAULT_ADMIN_INITIAL_PASSWORD` | First auth boot | Initial admin password read by Phoenix only when the default admin account is first created. Store in Secret Manager for cloud. |
| `PHOENIX_API_KEY` | Auth: yes | Phoenix system API key used by the target app, official Arize Phoenix MCP service, watcher, and analyst. |
| `PHOENIX_CLIENT_HEADERS` | Optional | Extra OTLP headers as comma-separated `key=value` pairs. Do not put secrets here when `PHOENIX_API_KEY` is set. |
| `PHOENIX_TRACE_FIXTURES_PATH` | Fallback | Directory containing saved trace fixtures for offline demo/test fallback. |

The target vulnerable app reads `PHOENIX_COLLECTOR_ENDPOINT` and sends `PHOENIX_API_KEY` as `authorization: Bearer <key>` on OTLP trace exports. Leave `ENABLE_TRACING=true` for the primary demo.

## Primary Google Cloud Setup

1. Create secrets for auth values:

   ```bash
   gcloud secrets create phoenix-secret --replication-policy=automatic
   gcloud secrets versions add phoenix-secret --data-file=./local-phoenix-secret.txt
   gcloud secrets create phoenix-admin-initial-password --replication-policy=automatic
   gcloud secrets versions add phoenix-admin-initial-password --data-file=./local-phoenix-admin-password.txt
   ```

2. Deploy Phoenix to Cloud Run in `us-east4` with auth enabled. If the image tag changes, pin the tested version for the demo instead of relying on an unreviewed latest image.

   ```bash
   gcloud run deploy evidence-freezer-phoenix \
     --project "$GOOGLE_CLOUD_PROJECT" \
     --region us-east4 \
     --image arizephoenix/phoenix:latest \
     --port 6006 \
     --allow-unauthenticated \
     --set-env-vars PHOENIX_ENABLE_AUTH=true \
     --set-secrets PHOENIX_SECRET=phoenix-secret:latest,PHOENIX_DEFAULT_ADMIN_INITIAL_PASSWORD=phoenix-admin-initial-password:latest
   ```

3. Open the Phoenix UI, sign in as an admin, and create a system API key from settings. Store it in Secret Manager:

   ```bash
   gcloud secrets create phoenix-system-api-key --replication-policy=automatic
   gcloud secrets versions add phoenix-system-api-key --data-file=./local-phoenix-system-api-key.txt
   ```

4. Configure the target app and services:

   ```bash
   PHOENIX_HOST=https://evidence-freezer-phoenix-<hash>-ue.a.run.app
  PHOENIX_COLLECTOR_ENDPOINT=https://evidence-freezer-phoenix-<hash>-ue.a.run.app/v1/traces
  PHOENIX_ENABLE_AUTH=true
  PHOENIX_SECRET=<from-secret-manager>
  PHOENIX_DEFAULT_ADMIN_INITIAL_PASSWORD=<from-secret-manager-on-first-boot-only>
  PHOENIX_API_KEY=<system-api-key-from-secret-manager>
  ```

5. For private deployed services, put access behind Identity-Aware Proxy or a private ingress path. Do not make an unauthenticated Phoenix service public unless the demo environment is explicitly temporary and isolated.

## Local Docker Setup

Run Phoenix locally with the same auth shape as cloud:

```bash
docker run --rm \
  -p 6006:6006 \
  -e PHOENIX_ENABLE_AUTH=true \
  -e PHOENIX_SECRET=replace_with_local_secret \
  -e PHOENIX_DEFAULT_ADMIN_INITIAL_PASSWORD=replace_with_local_admin_password \
  arizephoenix/phoenix:latest
```

Then create a system API key in the local Phoenix UI and set:

```bash
PHOENIX_HOST=http://localhost:6006
PHOENIX_COLLECTOR_ENDPOINT=http://localhost:6006/v1/traces
PHOENIX_ENABLE_AUTH=true
PHOENIX_SECRET=replace_with_local_secret
PHOENIX_DEFAULT_ADMIN_INITIAL_PASSWORD=replace_with_local_admin_password
PHOENIX_API_KEY=replace_with_local_system_api_key
```

For offline fallback, keep the same variables in `.env` but set `ENABLE_TRACING=false` for the target app and point consumers that support fixtures at:

```bash
PHOENIX_TRACE_FIXTURES_PATH=packages/shared/fixtures
```

## Manual Verification

- Phoenix UI receives a target app trace:
  1. Start Phoenix and the target app with `ENABLE_TRACING=true`.
  2. Send a demo chat request through the target app.
  3. Confirm a `target-vulnerable-app` trace appears in Phoenix.

- Authenticated Phoenix rejects requests without a key:

  ```bash
  curl -i "$PHOENIX_COLLECTOR_ENDPOINT"
  ```

  Expected result: `401` or `403`.

- Authenticated ingestion accepts the system API key:

  ```bash
  curl -i "$PHOENIX_HOST"
  ```

  The UI should load only after authenticated sign-in, and OTLP trace exports from the target app should include `authorization: Bearer <PHOENIX_API_KEY>`.

## Security Notes

- Treat trace contents as hostile evidence. Do not copy user prompts, retrieved documents, tool outputs, or model responses into operational prompts as instructions.
- Store `PHOENIX_SECRET` and `PHOENIX_API_KEY` only in Secret Manager or local `.env`.
- Use system API keys for service-to-service ingestion and Phoenix API access. User API keys are not stable enough for watcher or analyst automation.
- The deployed MCP service uses the official `@arizeai/phoenix-mcp` package with `PHOENIX_HOST`, `PHOENIX_API_KEY`, and `PHOENIX_PROJECT`/`PHOENIX_PROJECT_NAME`.
