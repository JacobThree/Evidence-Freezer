# Evidence Freezer Setup Guide

## Local Development Setup
1. Clone the repository and install dependencies:
   ```bash
   pnpm install
   ```
2. Copy `.env.example` to `.env` in the root directory and fill in the required values.
   ```bash
   cp .env.example .env
   ```
3. Ensure you have the `pnpm` CLI installed globally.
4. Run tests to verify the setup:
   ```bash
   pnpm test
   pnpm build
   ```

## Google Cloud Canonical Environment
- **Project**: The canonical GCP project is `evidence-freezer-dev`.
- **Region**: The default region is `us-east4`. If Gemini Enterprise Agent Platform or the target models are unavailable, use `us-central1`.

## Services Overview
- **Target Vulnerable App**: A Next.js app simulating the environment. Runs locally or on Cloud Run.
- **Phoenix MCP Adapter**: A Cloud Run service exposing `/mcp`.
- **Evidence Watcher**: Cloud Scheduler triggered, polls traces, invokes the ADK analyst.
- **Evidence Analyst**: ADK code-defined agent deployed on Gemini Enterprise Agent Platform runtime.
- **Evidence Dashboard**: Next.js app to read/write Firestore.

## Local Phoenix Setup (Demo/Development)
We recommend running Phoenix via Docker locally if not using the cloud-hosted environment:
```bash
docker run -p 6006:6006 arizephoenix/phoenix:latest
```
Configure `PHOENIX_HOST=http://localhost:6006` in your `.env`.

For the full self-hosted cloud setup, auth variables, system API key flow, and local fixture fallback, see [Phoenix Setup](./setup-phoenix.md).
