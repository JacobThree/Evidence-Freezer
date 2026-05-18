import { describe, expect, it } from 'vitest';
import { getPhoenixTraceExporterConfig } from '../lib/phoenix-tracing';

describe('Phoenix trace exporter configuration', () => {
  it('uses the local Phoenix OTLP endpoint by default', () => {
    expect(getPhoenixTraceExporterConfig({})).toEqual({
      url: 'http://localhost:6006/v1/traces',
      headers: {},
    });
  });

  it('sends Phoenix system API keys as bearer authorization headers', () => {
    expect(
      getPhoenixTraceExporterConfig({
        PHOENIX_COLLECTOR_ENDPOINT: 'https://phoenix.example.run.app/v1/traces',
        PHOENIX_API_KEY: 'px_sys_example',
      })
    ).toEqual({
      url: 'https://phoenix.example.run.app/v1/traces',
      headers: {
        authorization: 'Bearer px_sys_example',
      },
    });
  });

  it('preserves explicit bearer prefixes and merges client headers', () => {
    expect(
      getPhoenixTraceExporterConfig({
        PHOENIX_API_KEY: 'Bearer px_sys_example',
        PHOENIX_CLIENT_HEADERS: 'x-demo-tenant=evidence-freezer, malformed',
      })
    ).toEqual({
      url: 'http://localhost:6006/v1/traces',
      headers: {
        authorization: 'Bearer px_sys_example',
        'x-demo-tenant': 'evidence-freezer',
      },
    });
  });
});
