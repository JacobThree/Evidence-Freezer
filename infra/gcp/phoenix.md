# Google Cloud Phoenix

This file captures the deploy-time contract for the Evidence Freezer Phoenix service. See [docs/setup-phoenix.md](../../docs/setup-phoenix.md) for operator steps and local fallback setup.

## Cloud Run Service

- Service name: `evidence-freezer-phoenix`
- Region: `us-east4`
- Container image: `arizephoenix/phoenix:<pinned-demo-version>`
- Container port: `6006`
- Authentication: Phoenix auth enabled with `PHOENIX_ENABLE_AUTH=true`
- Secret storage: Google Secret Manager

## Runtime Environment

```bash
PHOENIX_ENABLE_AUTH=true
PHOENIX_SECRET=<secret-manager:phoenix-secret>
PHOENIX_DEFAULT_ADMIN_INITIAL_PASSWORD=<secret-manager:phoenix-admin-initial-password>
```

Dependent services use:

```bash
PHOENIX_HOST=https://evidence-freezer-phoenix-<hash>-ue.a.run.app
PHOENIX_COLLECTOR_ENDPOINT=https://evidence-freezer-phoenix-<hash>-ue.a.run.app/v1/traces
PHOENIX_API_KEY=<secret-manager:phoenix-system-api-key>
```

The target app sends traces to `PHOENIX_COLLECTOR_ENDPOINT` with `authorization: Bearer <PHOENIX_API_KEY>`.

## System API Key

Create the system API key from the authenticated Phoenix admin UI after first deploy. Store it as `phoenix-system-api-key` in Secret Manager and inject it into the target app, watcher, analyst, and Phoenix MCP adapter environments.

## Fallback Contract

Local Docker Phoenix and saved trace fixtures must preserve the same variable names:

```bash
PHOENIX_HOST=http://localhost:6006
PHOENIX_COLLECTOR_ENDPOINT=http://localhost:6006/v1/traces
PHOENIX_API_KEY=<local-system-api-key-or-empty-for-fixtures>
PHOENIX_TRACE_FIXTURES_PATH=packages/shared/fixtures
```

Fixture mode is a demo/test fallback only. It must not be used as the source of truth when the primary Cloud Run Phoenix service is healthy.
