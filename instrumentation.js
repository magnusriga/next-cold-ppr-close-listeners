import * as Sentry from '@sentry/nextjs';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      // Dummy DSN; the transport below never sends anything over the network.
      dsn: 'https://public@o0.ingest.sentry.io/0',
      environment: 'production',
      attachStacktrace: false,
      enableOpenTelemetrySetup: false,
      tracePropagationTargets: [],
      transport: (options) =>
        Sentry.createTransport(options, async () => ({ statusCode: 200 })),
    });
  }
}
