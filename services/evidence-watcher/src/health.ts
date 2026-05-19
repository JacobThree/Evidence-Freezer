export function healthPayload() {
  return {
    ok: true,
    service: 'evidence-watcher',
    dependencies: {
      phoenix_mcp: 'configured_by_env',
      firestore: 'configured_by_env',
      analyst_agent: 'configured_by_env',
    },
  };
}
