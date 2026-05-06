import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrismaInstrumentation } from '@prisma/instrumentation';

// Sampling is configured via standard OTEL env vars — no code change needed:
//   OTEL_TRACES_SAMPLER=parentbased_traceidratio
//   OTEL_TRACES_SAMPLER_ARG=0.1   (10% under load tests; 1.0 for targeted debugging)
const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'api-core',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
    new PrismaInstrumentation(),
  ],
});

sdk.start();
