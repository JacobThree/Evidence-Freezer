export function GET() {
  return Response.json({
    ok: true,
    service: 'target-vulnerable-app',
    dependencies: {
      phoenix: 'configured_by_env',
      model: process.env.USE_REAL_GEMINI === 'true' ? 'gemini' : 'fixture',
    },
  });
}
