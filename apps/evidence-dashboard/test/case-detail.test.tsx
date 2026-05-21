import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import promptInjectionCase from '@evidence-freezer/shared/fixtures/agent-output.prompt-injection.json';
import { CaseFileSchema } from '@evidence-freezer/shared';
import { AttackTimeline } from '../components/AttackTimeline';
import { DetectorResults } from '../components/DetectorResults';
import { EvidencePair } from '../components/EvidencePair';
import { phoenixSessionUrl, phoenixTraceUrl } from '../lib/case-files';

const caseFile = CaseFileSchema.parse(promptInjectionCase);

describe('case-detail components', () => {
  it('renders timeline events in chronological order with span kinds', () => {
    const html = renderToStaticMarkup(
      <AttackTimeline events={[...caseFile.timeline].reverse()} />,
    );

    expect(html.indexOf('USER_INPUT')).toBeLessThan(html.indexOf('LLM'));
    expect(html).toContain('span-user-prompt');
    expect(html).toContain('span-llm-response');
  });

  it('preserves evidence content as escaped text', () => {
    const html = renderToStaticMarkup(
      <EvidencePair
        evidence={{
          user_prompt: '<script>alert("owned")</script>',
          model_response: caseFile.evidence_pair.model_response,
        }}
      />,
    );

    expect(html).toContain('&lt;script&gt;alert(&quot;owned&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('System prompt: You are ACME Support Assistant.');
  });

  it('renders detector labels, reasons, severity, and span references', () => {
    const html = renderToStaticMarkup(<DetectorResults detectors={caseFile.detectors} />);

    expect(html).toContain('Direct instruction override');
    expect(html).toContain('The user-controlled prompt');
    expect(html).toContain('High');
    expect(html).toContain('span-user-prompt');
  });

  it('builds raw Phoenix trace and session links', () => {
    process.env.PHOENIX_PROJECT_NAME = 'default';
    expect(phoenixTraceUrl(caseFile)).toBe(
      'http://localhost:6006/projects/default/traces/trace_seed_prompt_injection',
    );
    expect(phoenixSessionUrl({ ...caseFile, session_id: 'session-1' })).toBe(
      'http://localhost:6006/projects/default/sessions/session-1',
    );
    delete process.env.PHOENIX_PROJECT_NAME;
  });
});
