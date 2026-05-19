# Operations

Evidence Freezer services expose lightweight health checks and JSON logs that work locally and in Cloud Run.

## Health Checks

Use `GET /healthz` for all deployable services:

| Service | Endpoint | Notes |
|---|---|---|
| Target vulnerable app | `/healthz` | Reports fixture or live model mode. |
| Phoenix MCP adapter | `/healthz` | Confirms the HTTP service is running; Phoenix credentials are configured by env. |
| Evidence watcher | `/healthz` | Confirms the HTTP service is running; Phoenix MCP, Firestore, and analyst agent are configured by env. |
| Evidence dashboard | `/healthz` | Reports fixture or Firestore read mode and whether watcher patch actions are configured. |

Cloud Run probes should point startup and liveness checks at `/healthz`. A `200` only proves the process is ready to accept traffic; use the watcher `/poll?dryRun=true` path for an end-to-end Phoenix connectivity check.

## Structured Logs

Logs are single-line JSON so Cloud Logging can parse fields directly. Common fields:

- `severity`: `DEBUG`, `INFO`, `WARN`, or `ERROR`.
- `service`: service name.
- `event`: stable event name.
- `request_id`: from `x-request-id` when present.
- `trace_id`: from `x-trace-id`, Cloud Trace headers, OpenTelemetry span context, or Phoenix trace IDs where relevant.
- `case_id`: Case File ID for patch and case actions.
- `project_id`: Google/Phoenix project identifier for watcher polling.
- `failure_class`: stable error category for filtering.

Important events:

- `watcher.poll.completed`: includes `scanned_count`, `candidates_found`, `cases_created`, and `error_count`.
- `watcher.poll.failed`: includes `project_id`, `failure_class`, and `message`.
- `mcp.request.received` and `mcp.request.completed`: include MCP method, tool name, and trace ID when available.
- `chat.request.completed`: includes target app trace ID, session ID, demo mode, risk seed, retrieved document count, and duration.
- `patch.action.completed` / `patch.action.failed`: emitted by the watcher for human-gated patch actions.
- `patch.proxy.completed` / `patch.proxy.failed`: emitted by the dashboard when forwarding patch actions to the watcher.

## Local Checks

```bash
pnpm --filter @evidence-freezer/shared test
pnpm --filter evidence-watcher test
pnpm --filter phoenix-mcp-adapter test
pnpm --filter target-vulnerable-app build
pnpm --filter evidence-dashboard build
```

Manual log readability check:

```bash
pnpm --filter evidence-watcher dev
curl -sS "http://localhost:8080/healthz"
curl -sS "http://localhost:8080/poll?dryRun=true&projectId=evidence-freezer"
```

The `/poll` call should emit a `watcher.poll.completed` JSON line. In Cloud Run, filter on `jsonPayload.event="watcher.poll.completed"` and graph `scanned_count`, `candidates_found`, `cases_created`, and `error_count` for the demo dashboard.
