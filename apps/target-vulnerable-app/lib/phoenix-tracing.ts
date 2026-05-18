import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, context } from '@opentelemetry/api';
import { SemanticConventions, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';

export { SemanticConventions, OpenInferenceSpanKind };

// Check if tracing should be disabled
const isTracingEnabled = process.env.ENABLE_TRACING !== 'false';

let provider: NodeTracerProvider | null = null;

type PhoenixTraceExporterConfig = {
  url: string;
  headers: Record<string, string>;
};

function parseClientHeaders(rawHeaders: string | undefined): Record<string, string> {
  if (!rawHeaders) return {};

  return rawHeaders.split(',').reduce<Record<string, string>>((headers, headerPair) => {
    const [rawKey, ...rawValueParts] = headerPair.split('=');
    const key = rawKey?.trim();
    const value = rawValueParts.join('=').trim();

    if (key && value) {
      headers[key.toLowerCase()] = value;
    }

    return headers;
  }, {});
}

function formatBearerToken(apiKey: string): string {
  return apiKey.toLowerCase().startsWith('bearer ') ? apiKey : `Bearer ${apiKey}`;
}

export function getPhoenixTraceExporterConfig(
  env: NodeJS.ProcessEnv = process.env
): PhoenixTraceExporterConfig {
  const url = env.PHOENIX_COLLECTOR_ENDPOINT || 'http://localhost:6006/v1/traces';
  const headers = parseClientHeaders(env.PHOENIX_CLIENT_HEADERS);
  const apiKey = env.PHOENIX_API_KEY?.trim();

  if (apiKey) {
    headers.authorization = formatBearerToken(apiKey);
  }

  return { url, headers };
}

export function initTracing() {
  if (!isTracingEnabled) return;
  if (provider) return; // Already initialized

  const exporterConfig = getPhoenixTraceExporterConfig();

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: 'target-vulnerable-app',
    }),
    spanProcessors: [
      new SimpleSpanProcessor(
        new OTLPTraceExporter({
          url: exporterConfig.url,
          headers: exporterConfig.headers,
        })
      )
    ],
  });

  provider.register();
}

export function getTracer() {
  initTracing();
  return trace.getTracer('target-vulnerable-app');
}
