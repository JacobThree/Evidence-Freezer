# Google Cloud Smoke Tests

Run this after deployment or before recording the demo:

```bash
pnpm smoke:gcp
```

Default expectations match the current demo stack:

- Project: `glassy-augury-496514-m9`
- Region: `us-east4`
- Target app: public
- Dashboard: public
- Phoenix MCP adapter: private
- Evidence watcher: private
- Scheduler job: paused
- Watcher analyst mode: fixture

Override checks with environment variables:

```bash
PROJECT_ID=my-project \
REGION=us-east4 \
EXPECT_TARGET_PUBLIC=false \
EXPECT_DASHBOARD_PUBLIC=false \
EXPECT_SCHEDULER_STATE=PAUSED \
EXPECT_WATCHER_AGENT_MODE=rest \
pnpm smoke:gcp
```

What it verifies:

- Cloud Run services are Ready.
- Firestore `(default)` database exists in the expected region.
- Scheduler points at `/poll` and has an OIDC service account.
- Public IAM matches the expected demo/prod state.
- Target app root and `/api/chat` return healthy responses.
- Dashboard `/cases` and prompt-injection case detail render.
- Phoenix UI is reachable and auth config is present.
- MCP adapter rejects unauthenticated callers.
- Watcher mode is `fixture` or `rest`, depending on expectation.

Use `EXPECT_WATCHER_AGENT_MODE=rest` when the Gemini/ADK Agent Engine is wired in. The script will fail unless `AGENT_ENGINE_STREAM_QUERY_URL` is present on the deployed watcher.
