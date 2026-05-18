import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import promptInjectionCase from '@evidence-freezer/shared/fixtures/agent-output.prompt-injection.json';
import { CaseFileSchema } from '@evidence-freezer/shared';
import { CaseTable } from '../components/CaseTable';

describe('CaseTable', () => {
  it('renders the required case list columns', () => {
    const html = renderToStaticMarkup(
      <CaseTable cases={[CaseFileSchema.parse(promptInjectionCase)]} />,
    );

    expect(html).toContain('Severity');
    expect(html).toContain('Incident');
    expect(html).toContain('Status');
    expect(html).toContain('evidence-freezer');
    expect(html).toContain('trace_seed_prompt_injection');
  });

  it('renders an empty state', () => {
    const html = renderToStaticMarkup(<CaseTable cases={[]} />);

    expect(html).toContain('No case files match the current filters.');
  });
});
