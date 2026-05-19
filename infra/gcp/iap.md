# Identity-Aware Proxy for Cloud Run

Evidence Freezer allows unauthenticated local dashboard mode for demos, but the deployed dashboard should be private. Enable IAP directly on the Cloud Run `evidence-dashboard` service and keep Cloud Run invoker IAM enabled.

Google currently recommends direct Cloud Run IAP for Cloud Run services. Use an external HTTPS load balancer only if the product later needs custom edge routing beyond the Cloud Run service.

## Prerequisites

- `evidence-dashboard` is deployed with `--no-allow-unauthenticated`.
- The OAuth consent screen is configured for the project or organization.
- Dashboard users are known Google identities or groups.

## Enable IAP

```bash
PROJECT_ID=evidence-freezer-dev
REGION=us-east4

gcloud services enable iap.googleapis.com run.googleapis.com \
  --project="${PROJECT_ID}"

gcloud run services remove-iam-policy-binding evidence-dashboard \
  --region="${REGION}" \
  --member=allUsers \
  --role=roles/run.invoker \
  --project="${PROJECT_ID}"
```

Enable IAP for the Cloud Run service in the Google Cloud console under Security > Identity-Aware Proxy, or use the current `gcloud iap web` command once the service appears as an IAP web resource in your project.

Grant user access with `roles/iap.httpsResourceAccessor`:

```bash
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="group:evidence-freezer-operators@example.com" \
  --role=roles/iap.httpsResourceAccessor
```

Keep service-to-service calls on Cloud Run IAM, not IAP. The dashboard calls the private watcher with its own service account and `roles/run.invoker`; human browser access to the dashboard goes through IAP.

## Dashboard Authentication Modes

- Local: `EVIDENCE_DASHBOARD_CASE_SOURCE` can be unset and the dashboard reads fixtures without user auth.
- Deployed private: set `EVIDENCE_DASHBOARD_CASE_SOURCE=firestore`, deploy with `--no-allow-unauthenticated`, enable IAP, and grant operators `roles/iap.httpsResourceAccessor`.
- Public product mode: out of scope for the MVP. Add Firebase Auth or another app-level login only if the dashboard must be reachable without Google Cloud IAP.

## Verification

Unauthenticated browser or curl access should redirect to Google sign-in or return an authorization failure:

```bash
curl -i "https://EVIDENCE_DASHBOARD_URL/"
```

An allowed operator should be able to load `/cases`. A user without IAP access should be denied before the Next.js app handles the request.
