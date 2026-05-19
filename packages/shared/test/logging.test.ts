import { describe, expect, it, vi } from 'vitest';
import { failureClass, logEvent, requestContext } from '../src/logging';

describe('structured logging helpers', () => {
  it('extracts request and trace IDs from Cloud Run headers', () => {
    expect(
      requestContext('evidence-watcher', {
        'x-request-id': 'request-1',
        'x-cloud-trace-context': 'trace-1/span;o=1',
      }),
    ).toEqual({
      service: 'evidence-watcher',
      request_id: 'request-1',
      trace_id: 'trace-1',
    });
  });

  it('writes JSON log entries without undefined fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logEvent('info', {
      service: 'evidence-watcher',
      event: 'watcher.poll.completed',
      project_id: 'evidence-freezer',
      case_id: undefined,
      scanned_count: 2,
    });

    const parsed = JSON.parse(spy.mock.calls[0][0]) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      severity: 'INFO',
      service: 'evidence-watcher',
      event: 'watcher.poll.completed',
      project_id: 'evidence-freezer',
      scanned_count: 2,
    });
    expect(parsed).not.toHaveProperty('case_id');
    spy.mockRestore();
  });

  it('classifies common failures for logs', () => {
    expect(failureClass(new SyntaxError('bad json'))).toBe('INVALID_JSON');
    expect(failureClass(new TypeError('bad type'))).toBe('TypeError');
    expect(failureClass('boom')).toBe('UNKNOWN_ERROR');
  });
});
