# Security and Quality Review

Review date: 2026-05-19

Scope: Task 27 review of the local MVP implementation before demo hardening and runbook rehearsal.

## Checklist

- [x] No real secrets are present in source control.
- [x] Secret-looking values found by scan are fixtures, placeholders, environment variable names, or test-only tokens.
- [x] External Phoenix trace data is treated as untrusted evidence in analyst instructions.
- [x] Watcher detector logic works from normalized trace evidence and does not execute trace contents.
- [x] Dashboard evidence, timeline, detector, and patch strings are rendered as React text, not raw HTML.
- [x] Prompt patch promotion remains human-gated through watcher patch endpoints.
- [x] Phoenix MCP prompt write tool is hidden and blocked by default.
- [x] Health checks and structured logs exist for deployable services.

## Findings

### Fixed: Phoenix MCP prompt write tool was enabled by default

Severity: important

The adapter advertised and executed `save-prompt-patch` without an explicit runtime gate. The current client only returned a local draft object, but the tool name and contract represented a prompt write surface. This conflicted with the MVP requirement that destructive Phoenix prompt write tools be disabled or gated.

Resolution: `save-prompt-patch` is now hidden from `tools/list` and returns `PROMPT_WRITE_TOOL_DISABLED` unless `PHOENIX_MCP_ENABLE_PROMPT_WRITES=true`.

## Deferred

No critical or important findings are currently deferred.

## Verification

Commands to run for this review:

```bash
pnpm lint
pnpm test
pnpm build
```

Record results here after running:

- `pnpm lint`: passed on 2026-05-19.
- `pnpm test`: passed on 2026-05-19; 22 test files and 75 tests passed.
- `pnpm build`: passed on 2026-05-19.
