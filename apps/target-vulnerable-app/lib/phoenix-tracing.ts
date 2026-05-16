import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, context } from '@opentelemetry/api';
import { SemanticConventions, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';

export { SemanticConventions, OpenInferenceSpanKind };

// Check if tracing should be disabled
const isTracingEnabled = process.env.ENABLE_TRACING !== 'false';

let provider: NodeTracerProvider | null = null;

export function initTracing() {
  if (!isTracingEnabled) return;
  if (provider) return; // Already initialized

  const exporterUrl = process.env.PHOENIX_COLLECTOR_ENDPOINT || 'http://localhost:6006/v1/traces';

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: 'target-vulnerable-app',
    }),
    spanProcessors: [
      new SimpleSpanProcessor(
        new OTLPTraceExporter({
          url: exporterUrl,
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
