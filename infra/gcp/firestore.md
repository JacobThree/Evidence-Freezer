# Firestore Case File Storage

Evidence Freezer stores MVP findings in Firestore so the watcher and dashboard share one small operational read model.

## Collections

- `case_files/{case_id}` stores one schema-valid `CaseFile`.
- `case_files/{case_id}/audit_events/{event_id}` stores immutable audit records for creation, replay, failed processing, and operator actions.

`case_id` is deterministic for the normal watcher path: `project_id + trace_id` are hashed into a stable `case_...` identifier. Explicit replay runs append a replay suffix so manual reruns do not overwrite the original case.

## Validation

The watcher must validate candidate Case File JSON with `CaseFileSchema` before writing to Firestore. Invalid analyst output should be recorded as an audit/error event by later watcher processing code, not stored as a Case File document.

## Local Verification

Task 16 unit tests use a Firestore-shaped in-memory test double. For manual emulator verification:

```bash
gcloud emulators firestore start --host-port=127.0.0.1:8080
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
pnpm --filter evidence-watcher test -- firestore
```

Use a dedicated Google Cloud project or emulator database for demo data. Do not write hackathon fixtures into a production Firestore database.
