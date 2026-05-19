export function GET() {
  return Response.json({
    ok: true,
    service: 'evidence-dashboard',
    dependencies: {
      firestore: process.env.FIRESTORE_PROJECT_ID ? 'configured' : 'fixture',
      watcher: process.env.EVIDENCE_WATCHER_BASE_URL ?? process.env.WATCHER_BASE_URL ? 'configured' : 'not_configured',
    },
  });
}
