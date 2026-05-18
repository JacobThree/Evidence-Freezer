'use client';

export default function ErrorPage({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <main className="page-shell">
      <section className="case-panel">
        <div className="state-block state-block--error">
          <strong>Case files could not be loaded.</strong>
          <span>{error.message}</span>
        </div>
      </section>
    </main>
  );
}
