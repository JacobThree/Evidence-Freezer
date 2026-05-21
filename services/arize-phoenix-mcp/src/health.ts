export function healthPayload() {
  return {
    ok: true,
    service: 'arize-phoenix-mcp',
    officialPackage: '@arizeai/phoenix-mcp',
    version: process.env.npm_package_dependencies__arizeai_phoenix_mcp ?? '4.0.13',
  };
}
