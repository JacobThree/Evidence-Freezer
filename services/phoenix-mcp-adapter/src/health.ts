export function healthPayload() {
  return {
    ok: true,
    service: 'phoenix-mcp-adapter',
    dependencies: {
      phoenix: 'configured_by_env',
    },
  };
}
