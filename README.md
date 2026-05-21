# Evidence Freezer

Evidence Freezer investigates suspicious LLM traces and turns them into reviewable security case files. Each case includes the evidence, likely root cause, and a proposed fix that still needs human approval.

This project is built for the **Google Cloud Rapid Agent Hackathon: Building Agents for Real-World Challenges** and targets the **Arize partner track** through Phoenix tracing and MCP.

## Live Demo

- **Hosted project URL:** https://evidence-dashboard-bc3cp4w4aq-uk.a.run.app
- **Demo video:** https://youtu.be/BjJn8DNQQCI
- **Demo target app:** https://target-vulnerable-app-bc3cp4w4aq-uk.a.run.app
- **Fresh verified case:** https://evidence-dashboard-bc3cp4w4aq-uk.a.run.app/cases/case_57b91eb7f050d8f5a094

Use the dashboard as the submission URL. The target app is the attack surface used to generate Phoenix traces that Evidence Freezer turns into dashboard case files.

## Devpost Media

Devpost accepts JPG, PNG, or GIF images up to 5 MB and recommends a 3:2 ratio. The generated screenshots below are `1500x1000` PNGs.

- **Recommended thumbnail:** [media/devpost/01-thumbnail-case-detail.png](media/devpost/01-thumbnail-case-detail.png)
- **Gallery image 1:** [media/devpost/01-thumbnail-case-detail.png](media/devpost/01-thumbnail-case-detail.png)
- **Gallery image 2:** [media/devpost/02-dashboard-case-list.png](media/devpost/02-dashboard-case-list.png)
- **Gallery image 3:** [media/devpost/03-remediation-replay.png](media/devpost/03-remediation-replay.png)
- **Gallery image 4:** [media/devpost/05-phoenix-trace.png](media/devpost/05-phoenix-trace.png)
- **Optional extra:** [media/devpost/04-target-attack.png](media/devpost/04-target-attack.png)

Regenerate these from the public deployment:

```bash
pnpm --filter evidence-dashboard exec node scripts/capture-devpost-images.mjs
```

## Why This Exists

LLM apps can fail in ways normal logs do not explain well: prompt injection, poisoned retrieval context, unsafe tool calls, and unsupported model claims. Teams need more than an alert. They need the trace, the evidence, and a proposed next step.

The tricky part is safety. Trace data can contain attacker instructions. Evidence Freezer treats that data as evidence only, never as instructions for the agent or the operator workflow.

Evidence Freezer solves that workflow:

1. A vulnerable demo RAG/tool app is attacked.
2. Phoenix captures the LLM trace, spans, prompts, retrieval, and tool evidence.
3. A watcher identifies suspicious traces through the official Arize Phoenix MCP server.
4. A Gemini 2.5 Pro analyst agent on Vertex AI Agent Engine investigates the evidence.
5. Firestore stores a structured Case File.
6. A Next.js dashboard lets a human review evidence and approve a test-only prompt patch.

## Hackathon

- **Partner track:** Arize
- **Partner integration:** Arize Phoenix observability plus the official `@arizeai/phoenix-mcp` MCP server
- **Agent behavior:** Multi-step investigation, evidence gathering, classification, root-cause analysis, and remediation drafting
- **Human oversight:** The agent can propose a patch, but cannot approve or deploy production prompt changes
- **Real-world challenge:** Security triage and incident response for LLM applications

## What Is In This Repo

```text
apps/
  target-vulnerable-app/      Demo LLM app with deterministic attack fixtures
  evidence-dashboard/         Case File review and patch approval UI
services/
  arize-phoenix-mcp/          Private Cloud Run wrapper around official @arizeai/phoenix-mcp
  phoenix-mcp-adapter/        Legacy local MCP-shaped adapter kept for compatibility tests
  evidence-watcher/           Trace polling, detection, analyst invocation, Firestore writes
  evidence-analyst-adk/       Gemini/ADK analyst instructions and deployment helpers
packages/
  shared/                     Case File schemas, trace contracts, logging helpers
infra/gcp/                    Cloud Run, Firestore, IAP, Scheduler, and Phoenix notes
docs/                         Setup, security boundaries, operations, and review docs
```

## Architecture

```mermaid
flowchart TD
    subgraph Environment ["Target Environment"]
        direction TB
        attacker["Attack prompt"] --> target["Target vulnerable app"]
        target --> phoenix["Arize Phoenix traces"]
    end

    subgraph Analysis ["Forensic Analysis Engine"]
        direction TB
        phoenix --> mcp["Official Arize Phoenix MCP"]
        watcher["Evidence watcher"] --> mcp
        watcher --> analyst["Gemini analyst agent"]
        mcp --> analyst
    end

    subgraph Review ["Storage & Review"]
        direction TB
        analyst --> casefile["Structured Case File"]
        casefile --> firestore["Firestore"]
        firestore --> dashboard["Evidence dashboard"]
        dashboard --> human["Human approval"]
        human --> replay["Regression replay"]
    end
```

## Key Capabilities

- Detects prompt injection, RAG injection, tool manipulation, hallucination, benign, and inconclusive traces.
- Normalizes Phoenix trace data into bounded, analyst-facing evidence.
- Treats all trace content as hostile evidence, not instructions.
- Produces strict schema-validated Case Files.
- Keeps prompt remediation human-gated.
- Uses `@arizeai/phoenix-mcp` for Phoenix trace access in deployed architecture.
- Runs locally in deterministic fixture mode without external model credentials.

## Quickstart

Requirements:

- Node.js 20+
- pnpm 10+
- Python 3.11+ for the ADK analyst service

Install dependencies:

```bash
pnpm install
```

Run core verification:

```bash
pnpm lint
pnpm test
pnpm build
```

Run live Google Cloud smoke verification after deployment:

```bash
pnpm smoke:gcp
```

The smoke check verifies Cloud Run readiness, Firestore, Scheduler state, public/private IAM drift, target chat, dashboard case pages, Phoenix auth, official MCP privacy, watcher MCP endpoint wiring, and deployed watcher agent mode. For a real Gemini/Agent Engine deployment, run:

```bash
EXPECT_WATCHER_AGENT_MODE=rest pnpm smoke:gcp
```

Run the demo apps locally:

```bash
pnpm --filter target-vulnerable-app dev
pnpm --filter evidence-dashboard dev
```

Useful service checks:

```bash
pnpm --filter arize-phoenix-mcp test
pnpm --filter evidence-watcher test
python -m pytest services/evidence-analyst-adk/tests
```

## Environment

Local development can use deterministic fixtures. Cloud/demo deployment uses:

- Phoenix with auth enabled
- Phoenix system API key in Secret Manager
- Cloud Run for target app, official Arize Phoenix MCP wrapper, watcher, and dashboard
- Cloud Scheduler for watcher polling
- Firestore for Case Files and audit events
- Gemini 2.5 Pro on Vertex AI Agent Engine

See:

- [docs/setup.md](docs/setup.md)
- [docs/setup-phoenix.md](docs/setup-phoenix.md)
- [docs/security-boundaries.md](docs/security-boundaries.md)
- [infra/gcp/cloudrun.md](infra/gcp/cloudrun.md)

## Security Review Status

Security tests is documented in [docs/review.md](docs/review.md).

Latest local verification:

- `pnpm lint`: passed
- `pnpm test`: passed, 22 test files and 75 tests
- `pnpm build`: passed

No critical or important review findings are currently deferred.

## Demo Flow

The demo is designed to be easy to follow:

1. Open the vulnerable target app.
2. Run a deterministic prompt-injection or RAG-injection attack.
3. Inspect the resulting Phoenix trace.
4. Run the watcher against Phoenix or fixture traces.
5. Review the generated Case File in the dashboard.
6. Approve a test-only patch replay.
7. Show that the remediation blocks the original attack pattern.
