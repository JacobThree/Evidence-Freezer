# Cloud Scheduler Watcher Trigger

Cloud Scheduler triggers the private `evidence-watcher` Cloud Run service by sending an authenticated OIDC request to `/poll`.

## IAM

Create a scheduler invoker identity and grant it Cloud Run invocation on the watcher:

```bash
PROJECT_ID=evidence-freezer-dev
REGION=us-east4

gcloud iam service-accounts create scheduler-watcher-invoker-sa \
  --project="${PROJECT_ID}"

gcloud run services add-iam-policy-binding evidence-watcher \
  --region="${REGION}" \
  --member="serviceAccount:scheduler-watcher-invoker-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/run.invoker \
  --project="${PROJECT_ID}"
```

The user creating or updating the Scheduler job also needs permission to mint tokens for that service account, typically `roles/iam.serviceAccountUser` on `scheduler-watcher-invoker-sa`.

## Create the Job

```bash
gcloud services enable cloudscheduler.googleapis.com \
  --project="${PROJECT_ID}"

WATCHER_URL="$(gcloud run services describe evidence-watcher \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.url)')"

gcloud scheduler jobs create http evidence-watcher-poll \
  --location="${REGION}" \
  --schedule="*/5 * * * *" \
  --time-zone="America/New_York" \
  --uri="${WATCHER_URL}/poll" \
  --http-method=POST \
  --headers="content-type=application/json" \
  --message-body='{"dryRun":false}' \
  --oidc-service-account-email="scheduler-watcher-invoker-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --oidc-token-audience="${WATCHER_URL}" \
  --project="${PROJECT_ID}"
```

Use `dryRun=true` for a smoke test job before enabling case creation.

## Manual Runs

Trigger the scheduled job:

```bash
gcloud scheduler jobs run evidence-watcher-poll \
  --location="${REGION}" \
  --project="${PROJECT_ID}"
```

Call the watcher directly as an operator:

```bash
curl -i -X POST \
  -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences="${WATCHER_URL}")" \
  -H "content-type: application/json" \
  --data '{"dryRun":true,"limit":5}' \
  "${WATCHER_URL}/poll"
```

Expected response is a JSON poll result containing scanned trace decisions. Cloud Run logs should show the request under the Scheduler invoker service account.
